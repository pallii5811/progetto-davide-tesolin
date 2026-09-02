import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicaSchemaTollerante,
  assicuraAzienda,
  conPiattaforma,
  conTenant,
  connetti,
  creaUtente,
  elencoUtenti,
  schema,
  sqlAbilitaRls,
  trovaAziendaPerChiave,
  trovaUtentePerEmail,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';

/**
 * Due studi sulla stessa macchina: nessuno dei due vede l'altro.
 *
 * È il quinto passo del piano scritto in `docs/CONSEGNA.md` § 6.4 — «aprire due studi,
 * analizzare un'azienda col primo, verificare che il secondo non la veda, e che l'accesso
 * funzioni ancora per entrambi» — e l'unico che non si può fare su PGlite: lì l'utente è
 * superuser, e per costruzione di PostgreSQL le policy non gli si applicano. Una prova
 * verde su PGlite direbbe che le policy non fanno danni, non che funzionano.
 *
 * Perciò questa prova ha DUE forme, e dice quale delle due sta eseguendo:
 *
 *   senza DATABASE_URL_PROVA   PGlite in memoria. Verifica l'isolamento applicativo — i
 *                              filtri per studio — e che `conTenant` e `conPiattaforma`
 *                              restituiscano le righe giuste. Le policy vengono applicate
 *                              ma non mordono.
 *
 *   con DATABASE_URL_PROVA     un PostgreSQL vero, con lo schema già migrato (le policy
 *                              sono nella migrazione 0010). Qui si verifica ciò che conta:
 *                              una lettura che non dichiara nulla torna ZERO righe, lo
 *                              studio A non vede B, un inserimento con lo studio sbagliato
 *                              viene rifiutato, e l'accesso — che passa da
 *                              `conPiattaforma` — trova gli utenti di entrambi.
 *
 * Il 02/09/2026 la seconda forma è stata eseguita sul server di produzione, su un
 * database di prova separato (`aegis_rls_prova`) creato con lo stesso ruolo e lo stesso
 * PostgreSQL 18 dell'archivio vero, PRIMA di applicare la migrazione all'archivio vero.
 *
 * Non è un collaudo distruttivo: crea due studi con nomi riconoscibili e li cancella alla
 * fine, e la cancellazione dello studio porta via a cascata tutto ciò che gli appartiene.
 */

const URL_PROVA = process.env['DATABASE_URL_PROVA']?.trim();

describe('Due studi sulla stessa macchina non si vedono', () => {
  let connessione: Connessione;
  let studioA: string;
  let studioB: string;

  beforeAll(async () => {
    connessione = await connetti(URL_PROVA === undefined || URL_PROVA === '' ? {} : { url: URL_PROVA });

    if (connessione.tipo === 'pglite') {
      await applicaSchemaTollerante(connessione);
      // Le policy si applicano anche qui: non mordono (superuser), ma se una fosse scritta
      // male PGlite — che è Postgres — la rifiuterebbe. È un controllo di sintassi gratis.
      for (const istruzione of sqlAbilitaRls().split(';')) {
        if (istruzione.trim() !== '') await connessione.db.execute(sql.raw(istruzione));
      }
    }

    const creaStudio = async (denominazione: string): Promise<string> => {
      const righe = await connessione.db
        .insert(schema.tenants)
        .values({ denominazione })
        .returning({ id: schema.tenants.id });
      const id = righe[0]?.id;
      if (id === undefined) throw new Error('studio non creato');
      return id;
    };
    studioA = await creaStudio('PROVA ISOLAMENTO · studio A');
    studioB = await creaStudio('PROVA ISOLAMENTO · studio B');

    for (const [studio, lettera] of [
      [studioA, 'a'],
      [studioB, 'b'],
    ] as const) {
      await conTenant(connessione.db, studio, async (tx) => {
        await creaUtente(tx, {
          tenantId: studio,
          email: `prova-isolamento-${lettera}@example.invalid`,
          nome: `Utente ${lettera.toUpperCase()}`,
          passwordHash: 'x',
          ruolo: 'amministratore',
        });
        await assicuraAzienda(tx, studio, {
          partitaIva: `9999999999${lettera === 'a' ? '1' : '2'}`,
          codiceFiscale: null,
          denominazione: `AZIENDA DELLO STUDIO ${lettera.toUpperCase()}`,
          providerId: null,
          provincia: null,
          atecoPrimario: null,
        });
      });
    }
  }, 120_000);

  afterAll(async () => {
    // Lo studio porta via a cascata utenti, aziende e tutto il resto.
    await conPiattaforma(connessione.db, async (tx) => {
      await tx.delete(schema.tenants).where(sql`${schema.tenants.id} in (${studioA}, ${studioB})`);
    });
    await connessione.chiudi();
  });

  it('dice su quale motore sta girando, perché le due forme non provano la stessa cosa', () => {
    // Non è un'asserzione: è l'informazione che manca a chi legge un esito verde.
    process.stdout.write(`\n  isolamento a due studi · motore: ${connessione.descrizione}\n\n`);
    expect(['pglite', 'postgres']).toContain(connessione.tipo);
  });

  it('ogni studio, dichiarato, vede solo le proprie aziende e i propri utenti', async () => {
    const aziendeA = await conTenant(connessione.db, studioA, (tx) =>
      trovaAziendaPerChiave(tx, studioA, '99999999991'),
    );
    const aziendaBVistaDaA = await conTenant(connessione.db, studioA, (tx) =>
      trovaAziendaPerChiave(tx, studioA, '99999999992'),
    );
    const utentiA = await conTenant(connessione.db, studioA, (tx) => elencoUtenti(tx, studioA));

    expect(aziendeA).not.toBeNull();
    expect(aziendaBVistaDaA).toBeNull();
    expect(utentiA.map((u) => u.email)).toEqual(['prova-isolamento-a@example.invalid']);
  });

  it('l’accesso trova gli utenti di entrambi gli studi, perché lo dichiara', async () => {
    const a = await conPiattaforma(connessione.db, (tx) =>
      trovaUtentePerEmail(tx, 'prova-isolamento-a@example.invalid'),
    );
    const b = await conPiattaforma(connessione.db, (tx) =>
      trovaUtentePerEmail(tx, 'prova-isolamento-b@example.invalid'),
    );
    expect(a?.tenantId).toBe(studioA);
    expect(b?.tenantId).toBe(studioB);
  });

  /*
    Da qui in giù: solo su un PostgreSQL vero. Su PGlite queste asserzioni sarebbero false
    per costruzione — il superuser vede tutto — e una prova che salta deve dirlo, non
    passare in silenzio.
  */
  const soloSuPostgres = (nome: string, prova: () => Promise<void>): void => {
    it(nome, async () => {
      if (connessione.tipo !== 'postgres') {
        process.stdout.write(`  ↷ «${nome}»: richiede un PostgreSQL vero (DATABASE_URL_PROVA)\n`);
        return;
      }
      await prova();
    });
  };

  soloSuPostgres('una lettura che non dichiara nulla non vede NESSUNA riga protetta', async () => {
    // Nessun SET LOCAL: è la query di chi ha dimenticato il where — o il conTenant.
    const righe = await connessione.db.select({ id: schema.aziende.id }).from(schema.aziende);
    expect(righe).toEqual([]);

    // E l'utente cercato per email senza ambito non c'è: è esattamente il guasto che
    // «nessuno entra più» descriveva, ed è il motivo per cui l'accesso passa da conPiattaforma.
    const senzaAmbito = await trovaUtentePerEmail(connessione.db, 'prova-isolamento-a@example.invalid');
    expect(senzaAmbito).toBeNull();
  });

  soloSuPostgres('lo studio A, con un where dimenticato, vede comunque solo A', async () => {
    // Un `select *` senza filtro per studio: è il difetto che la RLS esiste per coprire.
    const righe = await conTenant(connessione.db, studioA, (tx) =>
      tx.select({ tenantId: schema.aziende.tenantId }).from(schema.aziende),
    );
    expect(righe.length).toBeGreaterThan(0);
    expect(new Set(righe.map((r) => r.tenantId))).toEqual(new Set([studioA]));
  });

  soloSuPostgres('la piattaforma, dichiarata, vede entrambi', async () => {
    const righe = await conPiattaforma(connessione.db, (tx) =>
      tx.select({ tenantId: schema.aziende.tenantId }).from(schema.aziende),
    );
    const studi = new Set(righe.map((r) => r.tenantId));
    expect(studi.has(studioA) && studi.has(studioB)).toBe(true);
  });

  soloSuPostgres('scrivere per conto di A una riga di B viene rifiutato dal database', async () => {
    await expect(
      conTenant(connessione.db, studioA, (tx) =>
        tx.insert(schema.aziende).values({
          tenantId: studioB,
          partitaIva: '99999999993',
          denominazione: 'INTRUSIONE',
        }),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});
