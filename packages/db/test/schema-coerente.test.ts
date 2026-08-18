/**
 * Sviluppo e produzione devono descrivere lo stesso database.
 *
 * Lo schema nasce da due strade diverse: in sviluppo dal DDL scritto a mano in
 * `client.ts`, applicato all'avvio su PGlite; in produzione dai file SQL numerati generati
 * da drizzle-kit. Due strade che divergono producono il peggiore dei guasti: tutto
 * funziona sulla macchina di chi sviluppa e si rompe solo dal cliente, su dati veri.
 *
 * Questo test costruisce due database vuoti, applica a uno il DDL e all'altro le
 * migrazioni, e confronta colonna per colonna quello che ne esce.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applicaSchemaTollerante, connetti } from '../src/index.js';
import type { Connessione } from '../src/index.js';

interface Colonna {
  tabella: string;
  colonna: string;
  tipo: string;
  annullabile: string;
}

const CARTELLA_MIGRAZIONI = fileURLToPath(new URL('../migrazioni', import.meta.url));

async function descriviSchema(connessione: Connessione): Promise<Colonna[]> {
  const righe = await connessione.db.execute<Colonna>(sql`
    SELECT table_name AS tabella, column_name AS colonna,
           data_type AS tipo, is_nullable AS annullabile
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);
  return [...righe.rows];
}

describe('Coerenza fra DDL di sviluppo e migrazioni di produzione', () => {
  let daDdl: Connessione;
  let daMigrazioni: Connessione;

  beforeAll(async () => {
    daDdl = await connetti();
    await applicaSchemaTollerante(daDdl);

    daMigrazioni = await connetti();
    const file = readdirSync(CARTELLA_MIGRAZIONI)
      .filter((n) => n.endsWith('.sql'))
      .sort();

    expect(file.length, 'nessuna migrazione generata: eseguire `npm run migra:genera`').toBeGreaterThan(0);

    for (const nome of file) {
      const contenuto = readFileSync(join(CARTELLA_MIGRAZIONI, nome), 'utf8');
      // drizzle separa le istruzioni con un marcatore proprio: eseguirle in blocco
      // fallirebbe sulla prima che dipende dalla precedente.
      for (const istruzione of contenuto.split('--> statement-breakpoint')) {
        const pulita = istruzione.trim();
        if (pulita !== '') await daMigrazioni.db.execute(sql.raw(pulita));
      }
    }
  }, 120_000);

  afterAll(async () => {
    await daDdl.chiudi();
    await daMigrazioni.chiudi();
  });

  it('le migrazioni producono le stesse tabelle del DDL', async () => {
    const tabelle = (schema: Colonna[]) => [...new Set(schema.map((c) => c.tabella))].sort();

    const [a, b] = [await descriviSchema(daDdl), await descriviSchema(daMigrazioni)];
    expect(tabelle(b)).toEqual(tabelle(a));
  });

  it('ogni colonna ha lo stesso tipo e la stessa obbligatorietà', async () => {
    const chiave = (c: Colonna) => `${c.tabella}.${c.colonna}`;
    const impronta = (c: Colonna) =>
      `${chiave(c)} ${c.tipo} ${c.annullabile === 'YES' ? 'null' : 'not-null'}`;

    const ddl = await descriviSchema(daDdl);
    const migrazioni = await descriviSchema(daMigrazioni);

    const soloNelDdl = ddl.filter((c) => !migrazioni.some((m) => impronta(m) === impronta(c)));
    const soloNelleMigrazioni = migrazioni.filter((m) => !ddl.some((c) => impronta(c) === impronta(m)));

    // Elencate entrambe le direzioni: sapere *quale* colonna diverge, e da che parte,
    // è la differenza fra correggere in un minuto e cercare per un pomeriggio.
    expect({
      soloNelDdl: soloNelDdl.map(impronta),
      soloNelleMigrazioni: soloNelleMigrazioni.map(impronta),
    }).toEqual({ soloNelDdl: [], soloNelleMigrazioni: [] });
  });
});

describe('Adeguamento di un archivio creato con una versione precedente', () => {
  let vecchio: Connessione;

  beforeAll(async () => {
    vecchio = await connetti();

    // Si ricostruisce l'archivio com'era prima: due colonne mancanti e il denaro a
    // `integer`. È la situazione di ogni installazione già in esercizio al momento
    // dell'aggiornamento — quella in cui un guasto fa più danno.
    await vecchio.db.execute(sql`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        denominazione text NOT NULL,
        budget_dati_mensile_centesimi integer
      )
    `);
    await vecchio.db.execute(sql`
      INSERT INTO tenants (denominazione, budget_dati_mensile_centesimi) VALUES ('Studio storico', 20000)
    `);

    await applicaSchemaTollerante(vecchio);
  }, 120_000);

  afterAll(async () => {
    await vecchio.chiudi();
  });

  it('aggiunge le colonne mancanti senza perdere i dati esistenti', async () => {
    const righe = await vecchio.db.execute<{ denominazione: string; numero_rui: string | null }>(sql`
      SELECT denominazione, numero_rui FROM tenants
    `);

    expect(righe.rows[0]?.denominazione).toBe('Studio storico');
    expect(righe.rows[0]?.numero_rui).toBeNull();
  });

  it('allarga le colonne di denaro senza alterare i valori', async () => {
    const tipi = await vecchio.db.execute<{ data_type: string }>(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'budget_dati_mensile_centesimi'
    `);
    expect(tipi.rows[0]?.data_type).toBe('bigint');

    const valori = await vecchio.db.execute<{ budget: number }>(sql`
      SELECT budget_dati_mensile_centesimi AS budget FROM tenants
    `);
    expect(Number(valori.rows[0]?.budget)).toBe(20000);
  });

  it('l’archivio adeguato coincide con quello creato da zero', async () => {
    const nuovo = await connetti();
    try {
      await applicaSchemaTollerante(nuovo);

      const colonne = async (c: Connessione): Promise<string[]> => {
        const righe = await c.db.execute<{ colonna: string; tipo: string }>(sql`
          SELECT column_name AS colonna, data_type AS tipo
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants'
          ORDER BY column_name
        `);
        return righe.rows.map((r) => `${r.colonna} ${r.tipo}`);
      };

      expect(await colonne(vecchio)).toEqual(await colonne(nuovo));
    } finally {
      await nuovo.chiudi();
    }
  }, 120_000);
});
