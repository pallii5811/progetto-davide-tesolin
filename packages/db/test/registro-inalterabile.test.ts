import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { applicaSchemaTollerante, connetti, registraAudit, schema } from '../src/index.js';
import { righeDi } from '../src/client.js';
import type { Connessione } from '../src/index.js';

/**
 * Il registro delle operazioni si aggiunge soltanto, e lo prova il database.
 *
 * L'intestazione di `audit_log` prometteva «nessun UPDATE, nessun DELETE» da prima che
 * esistesse qualcosa che lo imponesse. Per l'intermediario la differenza non è formale:
 * in ispezione un registro che lui stesso può riscrivere non prova niente, perché la prima
 * domanda è «chi mi dice che non l'ha ritoccato ieri?».
 *
 * Qui non si prova che il registro venga scritto — lo fanno altri collaudi — si prova che
 * **non si possa disfare**, e che una manomissione si veda comunque.
 *
 * Gira su PGlite come sul PostgreSQL vero: un trigger vale anche per il superutente, a
 * differenza delle policy di isolamento, e non serve un database separato.
 */
describe('Il registro delle operazioni non si riscrive', () => {
  let c: Connessione;
  let tenantId: string;

  beforeAll(async () => {
    c = await connetti({});
    await applicaSchemaTollerante(c);
    const creati = await c.db
      .insert(schema.tenants)
      .values({ denominazione: 'PROVA REGISTRO · studio' })
      .returning({ id: schema.tenants.id });
    tenantId = creati[0]!.id;

    for (const azione of ['accesso.riuscito', 'analisi.eseguita', 'dossier.salvato']) {
      await registraAudit(c.db, { tenantId, azione, entita: 'azienda', dettagli: { prova: azione } });
    }
  }, 60_000);

  afterAll(async () => {
    await c.chiudi();
  });

  interface Riga {
    readonly id: string;
    readonly azione: string;
    readonly impronta: string | null;
    readonly impronta_precedente: string | null;
    readonly numero_progressivo: number;
  }

  const righe = async (): Promise<Riga[]> =>
    righeDi<Riga>(
      await c.db.execute(
        sql`SELECT id, azione, impronta, impronta_precedente, numero_progressivo
            FROM audit_log ORDER BY numero_progressivo`,
      ),
    );

  const guasti = async (): Promise<{ numero_progressivo: number; guasto: string }[]> =>
    righeDi<{ numero_progressivo: number; guasto: string }>(
      await c.db.execute(sql`SELECT * FROM verifica_catena_audit()`),
    );

  it('ogni riga porta la propria impronta e aggancia la precedente', async () => {
    const elenco = await righe();
    expect(elenco.length).toBeGreaterThanOrEqual(3);

    for (const [i, r] of elenco.entries()) {
      expect(r.impronta, `riga ${i} senza impronta`).toMatch(/^[0-9a-f]{64}$/);
      expect(Number(r.numero_progressivo)).toBe(i + 1);
      // La prima non aggancia niente: è la prima. Le altre agganciano chi le precede.
      expect(r.impronta_precedente).toBe(i === 0 ? null : elenco[i - 1]!.impronta);
    }
  });

  it('su un registro integro la verifica non trova niente', async () => {
    expect(await guasti()).toHaveLength(0);
  });

  it('un UPDATE viene rifiutato, e il rifiuto dice cosa fare invece', async () => {
    await expect(
      c.db.execute(sql`UPDATE audit_log SET azione = 'accesso.mai-avvenuto' WHERE numero_progressivo = 1`),
    ).rejects.toThrow(/non si corregge|si aggiunge una riga/i);
  });

  it('un DELETE viene rifiutato, e il rifiuto dice perché il registro esiste', async () => {
    await expect(c.db.execute(sql`DELETE FROM audit_log WHERE numero_progressivo = 2`)).rejects.toThrow(
      /non si cancella|ispezione/i,
    );
  });

  it('una manomissione fatta scavalcando i trigger viene comunque vista', async () => {
    /*
      È la prova che conta. Un trigger si può spegnere, e chi ha i permessi per spegnerlo
      lo fa proprio quando vuole cambiare qualcosa. La catena non impedisce la modifica: la
      rende evidente. Per questo la verifica sta in una funzione del database, che
      l'ispettore esegue lui, e non in un controllo dell'applicazione — che è scritta dalla
      stessa parte che dovrebbe controllare.
    */
    await c.db.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_niente_modifiche`);
    await c.db.execute(
      sql`UPDATE audit_log SET dettagli = '{"prova":"riscritto"}'::jsonb WHERE numero_progressivo = 2`,
    );
    await c.db.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_niente_modifiche`);

    const trovati = await guasti();
    expect(trovati.length).toBeGreaterThan(0);
    expect(Number(trovati[0]?.numero_progressivo)).toBe(2);
    expect(trovati.map((g) => g.guasto).join(' ')).toMatch(/contenuto riscritto/);
  });

  it('e la riga tolta di mezzo si vede dal buco nella numerazione', async () => {
    await c.db.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_niente_modifiche`);
    await c.db.execute(sql`DELETE FROM audit_log WHERE numero_progressivo = 2`);
    await c.db.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_niente_modifiche`);

    expect((await guasti()).map((g) => g.guasto).join(' ')).toMatch(
      /numerazione interrotta|anello spezzato/,
    );
  });
});
