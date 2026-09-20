/**
 * Riempie i punteggi delle protezioni sulle analisi salvate prima della migrazione 0017.
 *
 *   DATABASE_URL=… npx tsx scripts/completa-punteggi-crm.ts            # guarda e basta
 *   DATABASE_URL=… npx tsx scripts/completa-punteggi-crm.ts --scrivi   # scrive le colonne
 *
 * ── PERCHÉ ESISTE ─────────────────────────────────────────────────────────────
 *
 * Dal 19/09/2026 il CRM mostra Property, Business Interruption e Cyber per ogni azienda, e ogni
 * analisi li salva accanto a sé. Le analisi di prima non li hanno: nel CRM quelle righe restano
 * vuote finché qualcuno non riapre la scheda. Su un archivio con venti aziende significa venti
 * schede da aprire a mano.
 *
 * ── PERCHÉ NON COSTA NIENTE ──────────────────────────────────────────────────
 *
 * Il conto si rifà sulla **fotografia dei dati** che ogni analisi si porta dietro
 * (`snapshot_azienda.profilo`): è esattamente ciò su cui il motore aveva lavorato allora.
 * Nessuna chiamata al fornitore, nessun acquisto, nessun dato nuovo — e il risultato è quello
 * che la scheda mostrerebbe riaprendola, perché è la stessa funzione con gli stessi ingressi
 * (`analyzeCompany`, con la data dell'analisi di allora).
 *
 * ── LE DUE SICUREZZE ─────────────────────────────────────────────────────────
 *
 * 1. Le date tornano date. Un profilo che ha fatto andata e ritorno in JSON ha le date come
 *    stringhe, e una stringa dove il motore si aspetta una data non dà errore: dà `NaN` e
 *    prosegue. Qui si ravvivano prima, e si conta quante ne sono state ravvivate.
 * 2. Ciò che non torna non si scrive. Un punteggio fuori dalla scala 1-7 non entra
 *    nell'archivio: la riga resta vuota e il caso si stampa, invece di mettere in elenco un
 *    numero che nessuno saprebbe spiegare.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { analyzeCompany } from '@aegis/core';
import type { CompanyProfile } from '@aegis/core';
import { conPiattaforma, conTenant, connetti, righeDi, schema } from '@aegis/db';

const scrivi = process.argv.includes('--scrivi');

function cartellaPredefinita(): string {
  const radice = fileURLToPath(new URL('..', import.meta.url));
  return process.env['AEGIS_DATA_DIR'] ?? resolve(radice, '.dati');
}

/** Una data ISO come la scrive `JSON.stringify(new Date())`. Solo quelle, niente euristiche. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

let ravvivate = 0;

/** Ricostruisce le date di un oggetto uscito da JSON, in profondità. */
function ravviva(valore: unknown): unknown {
  if (typeof valore === 'string') {
    if (!ISO.test(valore)) return valore;
    ravvivate += 1;
    return new Date(valore);
  }
  if (Array.isArray(valore)) return valore.map(ravviva);
  if (valore !== null && typeof valore === 'object') {
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, ravviva(v)]));
  }
  return valore;
}

interface DaCompletare {
  readonly analisiId: string;
  readonly tenantId: string;
  readonly denominazione: string;
  readonly asOf: Date;
  readonly profilo: unknown;
}

function nellaScala(valore: number | null): boolean {
  return valore === null || (Number.isFinite(valore) && valore >= 0 && valore <= 7);
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  const connessione = await connetti({
    url,
    cartellaDati: url === undefined ? cartellaPredefinita() : undefined,
  });
  const db = connessione.db;
  console.log(`  Database: ${connessione.descrizione}`);
  console.log(scrivi ? '  Modalità: SCRIVE' : '  Modalità: guarda e basta (aggiungere --scrivi)');

  try {
    // Uno studio alla volta: l'isolamento fra studi vale anche per la manutenzione.
    const studi = await conPiattaforma(db, (tx) =>
      tx
        .select({ id: schema.tenants.id, denominazione: schema.tenants.denominazione })
        .from(schema.tenants),
    );

    let viste = 0;
    let scritte = 0;
    let saltate = 0;

    for (const studio of studi) {
      const righe = await conTenant(db, studio.id, async (tx) => {
        const risultato: unknown = await tx.execute(sql`
          SELECT a.id AS analisi_id, a.tenant_id, a.as_of, az.denominazione, s.profilo
          FROM analisi a
          JOIN aziende az ON az.id = a.azienda_id
          JOIN snapshot_azienda s ON s.id = a.snapshot_id
          WHERE a.tenant_id = ${studio.id}
            AND a.property_risk IS NULL
            AND a.cyber_risk IS NULL
            AND a.bi_perdita_giornaliera_centesimi IS NULL
          ORDER BY a.creata_il
        `);
        return righeDi<{
          analisi_id: string;
          tenant_id: string;
          as_of: string | Date;
          denominazione: string;
          profilo: unknown;
        }>(risultato).map((r): DaCompletare => ({
          analisiId: r.analisi_id,
          tenantId: r.tenant_id,
          denominazione: r.denominazione,
          asOf: r.as_of instanceof Date ? r.as_of : new Date(r.as_of),
          profilo: r.profilo,
        }));
      });

      if (righe.length === 0) continue;
      console.log(`\n  ${studio.denominazione}: ${righe.length} analisi da completare`);

      for (const riga of righe) {
        viste += 1;
        let property: number | null = null;
        let biPunteggio: number | null = null;
        let perdita: number | null = null;
        let cyber: number | null = null;

        try {
          const profilo = ravviva(riga.profilo) as CompanyProfile;
          const analisi = analyzeCompany(profilo, [], riga.asOf);
          property = analisi.protezioni.property.punteggio;
          biPunteggio = analisi.protezioni.businessInterruption.punteggioFisico;
          perdita = analisi.protezioni.businessInterruption.perditaGiornaliera;
          cyber = analisi.protezioni.cyber.punteggio;
        } catch (errore) {
          saltate += 1;
          console.log(
            `    ✗ ${riga.denominazione}: ${errore instanceof Error ? errore.message : String(errore)}`,
          );
          continue;
        }

        if (!nellaScala(property) || !nellaScala(biPunteggio) || !nellaScala(cyber)) {
          saltate += 1;
          console.log(`    ✗ ${riga.denominazione}: punteggio fuori scala, non scritto`);
          continue;
        }
        if (perdita !== null && (!Number.isFinite(perdita) || perdita < 0)) {
          saltate += 1;
          console.log(`    ✗ ${riga.denominazione}: perdita giornaliera non valida, non scritta`);
          continue;
        }

        const leggibile = (v: number | null, cifre: number): string =>
          v === null ? 'n.d.' : v.toFixed(cifre).replace('.', ',');
        console.log(
          `    ${riga.denominazione}: Property ${leggibile(property, 2)} · ` +
            `Interruzione ${leggibile(biPunteggio, 2)} · Cyber ${leggibile(cyber, 1)} · ` +
            `fermo di un giorno ${perdita === null ? 'n.d.' : `${(perdita / 100).toFixed(2)} €`}`,
        );

        if (scrivi) {
          await conTenant(db, riga.tenantId, (tx) =>
            tx.execute(sql`
              UPDATE analisi
              SET property_risk = ${property === null ? null : property.toFixed(2)},
                  bi_punteggio = ${biPunteggio === null ? null : biPunteggio.toFixed(2)},
                  bi_perdita_giornaliera_centesimi = ${perdita},
                  cyber_risk = ${cyber === null ? null : cyber.toFixed(1)}
              WHERE id = ${riga.analisiId} AND tenant_id = ${riga.tenantId}
            `),
          );
          scritte += 1;
        }
      }
    }

    console.log('');
    console.log(`  Analisi esaminate: ${viste}`);
    console.log(`  Date ravvivate nei profili: ${ravvivate}`);
    console.log(scrivi ? `  Scritte: ${scritte}` : '  Scritte: nessuna (manca --scrivi)');
    if (saltate > 0) console.log(`  Saltate: ${saltate}`);
    if (viste === 0) console.log('  Nessuna analisi da completare: i punteggi ci sono già.');
  } finally {
    await connessione.chiudi();
  }
}

await main();
