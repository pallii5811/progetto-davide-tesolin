/**
 * La coda degli eventi e il recupero delle fotografie da confrontare.
 *
 * Questi test esistono perché il primo tentativo usava `max()` su una colonna `jsonb`:
 * SQL valido in apparenza, ma `jsonb` non ha un ordinamento e la query falliva soltanto a
 * runtime, dentro un endpoint, dove il sintomo era un generico «errore interno».
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accodaEventi,
  applicaSchemaTollerante,
  connetti,
  contaEventiDaGestire,
  elencoEventi,
  salvaAnalisi,
  salvaSnapshot,
  schema,
  segnaGestito,
  statiDaConfrontare,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';

describe('Monitoraggio: persistenza', () => {
  let connessione: Connessione;
  let tenantId: string;
  let aziendaId: string;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);

    const tenant = await connessione.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio di prova' })
      .returning({ id: schema.tenants.id });
    tenantId = tenant[0]!.id;

    const azienda = await connessione.db
      .insert(schema.aziende)
      .values({ tenantId, denominazione: 'Sorvegliata S.r.l.', partitaIva: '00000000000' })
      .returning({ id: schema.aziende.id });
    aziendaId = azienda[0]!.id;
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  async function registraAnalisi(anno: number, marcatore: string): Promise<void> {
    const snapshotId = await salvaSnapshot(connessione.db, {
      aziendaId,
      tenantId,
      provider: 'prova',
      livello: 'base',
      profilo: {},
      osservatoIl: new Date(`${anno}-01-01T00:00:00Z`),
      costoCentesimi: 0,
    });

    await salvaAnalisi(connessione.db, {
      aziendaId,
      tenantId,
      snapshotId,
      asOf: new Date(`${anno}-01-01T00:00:00Z`),
      scoreCredito: 70,
      classeCredito: 'B',
      fidoConsigliatoCentesimi: null,
      patrimonioEspostoCentesimi: null,
      esposizioneNonAssicurataCentesimi: null,
      rischiCritici: 0,
      coperturaAssente: 0,
      statoCatNat: 'adempiente',
      risultato: { azioniPrioritarie: [] },
      statoSorvegliato: { marcatore, annoUltimoBilancio: anno },
      versioneCore: '0.1.0',
      versioneCatalogoRischi: '2026.1',
      versioneRegole: '2026.1',
      gap: [],
    });
  }

  it('con una sola analisi restituisce la corrente e nessuna precedente', async () => {
    await registraAnalisi(2024, 'prima');

    const stati = await statiDaConfrontare(connessione.db, tenantId);
    expect(stati).toHaveLength(1);
    expect((stati[0]?.corrente as { marcatore: string }).marcatore).toBe('prima');
    expect(stati[0]?.precedente).toBeNull();
  });

  it('con due analisi restituisce la più recente e quella prima di essa', async () => {
    await registraAnalisi(2025, 'seconda');

    const stati = await statiDaConfrontare(connessione.db, tenantId);
    expect(stati).toHaveLength(1);
    expect((stati[0]?.corrente as { marcatore: string }).marcatore).toBe('seconda');
    expect((stati[0]?.precedente as { marcatore: string }).marcatore).toBe('prima');
  });

  it('accoda gli eventi e non li duplica alla riesecuzione', async () => {
    const evento = {
      aziendaId,
      tenantId,
      tipo: 'obbligo-normativo' as const,
      titolo: 'Obbligo assicurativo catastrofale non adempiuto',
      descrizione: 'Il termine di legge è decorso.',
      rilevanza: 5,
      azioneSuggerita: 'Presentare una quotazione CAT NAT.',
      valorePrecedente: null,
      valoreNuovo: 'inadempiente',
    };

    expect(await accodaEventi(connessione.db, [evento])).toBe(1);
    // Senza deduplica la coda raddoppierebbe a ogni esecuzione del monitoraggio.
    expect(await accodaEventi(connessione.db, [evento])).toBe(0);
    expect(await contaEventiDaGestire(connessione.db, tenantId)).toBe(1);
  });

  it('un evento gestito esce dalla coda ma resta consultabile', async () => {
    const aperti = await elencoEventi(connessione.db, tenantId, { soloDaGestire: true });
    expect(aperti).toHaveLength(1);

    expect(await segnaGestito(connessione.db, tenantId, aperti[0]!.id, null)).toBe(true);
    expect(await contaEventiDaGestire(connessione.db, tenantId)).toBe(0);

    // «L'avevamo segnalato» vale solo se resta dimostrabile.
    const tutti = await elencoEventi(connessione.db, tenantId, {});
    expect(tutti).toHaveLength(1);
    expect(tutti[0]?.gestitoIl).not.toBeNull();
  });

  it('non si può gestire un evento di un altro studio', async () => {
    const altro = await connessione.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio estraneo' })
      .returning({ id: schema.tenants.id });

    const eventi = await elencoEventi(connessione.db, tenantId, {});
    expect(await segnaGestito(connessione.db, altro[0]!.id, eventi[0]!.id, null)).toBe(false);
  });
});
