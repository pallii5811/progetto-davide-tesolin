/**
 * Compagnie assicurative e loro solidità.
 *
 * I dati sono **condivisi fra tutti gli intermediari**, e deliberatamente: il solvency
 * ratio di una compagnia è un fatto pubblico, pubblicato nella SFCR che la direttiva
 * Solvency II impone. Duplicarlo per ogni studio significherebbe farlo inserire dieci
 * volte e vederlo divergere in dieci modi.
 *
 * Il punteggio non si conserva qui: si ricalcola dal motore a ogni lettura. Un punteggio
 * congelato in tabella sopravvive alla regola che l'ha prodotto, e nessuno si accorge che
 * è vecchio finché non deve difenderlo davanti a un cliente.
 */

import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

export interface DatiSolidita {
  readonly denominazione: string;
  readonly gruppo: string | null;
  readonly codiceIvass: string | null;
  readonly anno: number;
  readonly solvencyRatio: number | null;
  readonly quotaTier1Unrestricted: number | null;
  readonly fondiPropriCentesimi: number | null;
  readonly scrCentesimi: number | null;
  readonly premiLordiCentesimi: number | null;
  readonly reclamiAnno: number | null;
  readonly ratingAgenzia: string | null;
  readonly ratingValore: string | null;
  readonly fonte: string;
}

/**
 * Inserisce o aggiorna i dati di una compagnia per un esercizio.
 *
 * La compagnia si identifica dalla denominazione: è ciò che l'intermediario scrive sulla
 * polizza, e l'unica chiave che possiede davvero. Il codice IVASS sarebbe più solido, ma
 * chiederlo per ogni inserimento significherebbe non far inserire nulla.
 */
export async function salvaSolidita(db: Database, dati: DatiSolidita): Promise<string> {
  const esistente = await db
    .select({ id: schema.compagnie.id })
    .from(schema.compagnie)
    .where(eq(schema.compagnie.denominazione, dati.denominazione))
    .limit(1);

  const compagniaId =
    esistente[0]?.id ??
    (
      await db
        .insert(schema.compagnie)
        .values({
          denominazione: dati.denominazione,
          gruppo: dati.gruppo,
          codiceIvass: dati.codiceIvass,
        })
        .returning({ id: schema.compagnie.id })
    )[0]!.id;

  // `numeric` va scritto come stringa: passarlo come numero perde precisione sul driver.
  const numerico = (v: number | null): string | null => (v === null ? null : String(v));

  await db
    .insert(schema.solidita)
    .values({
      compagniaId,
      anno: dati.anno,
      solvencyRatio: numerico(dati.solvencyRatio),
      quotaTier1Unrestricted: numerico(dati.quotaTier1Unrestricted),
      fondiPropriCentesimi: dati.fondiPropriCentesimi,
      scrCentesimi: dati.scrCentesimi,
      premiLordiCentesimi: dati.premiLordiCentesimi,
      reclamiAnno: dati.reclamiAnno,
      ratingAgenzia: dati.ratingAgenzia,
      ratingValore: dati.ratingValore,
      fonte: dati.fonte,
    })
    .onConflictDoUpdate({
      target: [schema.solidita.compagniaId, schema.solidita.anno],
      set: {
        solvencyRatio: numerico(dati.solvencyRatio),
        quotaTier1Unrestricted: numerico(dati.quotaTier1Unrestricted),
        fondiPropriCentesimi: dati.fondiPropriCentesimi,
        scrCentesimi: dati.scrCentesimi,
        premiLordiCentesimi: dati.premiLordiCentesimi,
        reclamiAnno: dati.reclamiAnno,
        ratingAgenzia: dati.ratingAgenzia,
        ratingValore: dati.ratingValore,
        fonte: dati.fonte,
        aggiornatoIl: new Date(),
      },
    });

  return compagniaId;
}

export interface RigaSolidita extends DatiSolidita {
  readonly compagniaId: string;
  readonly aggiornatoIl: Date;
}

/** Numeri che il driver restituisce come stringa: convertiti qui, dove si sa cosa sono. */
function numero(valore: string | number | null): number | null {
  if (valore === null) return null;
  const n = typeof valore === 'number' ? valore : Number(valore);
  return Number.isFinite(n) ? n : null;
}

/** Tutte le compagnie censite, con l'esercizio più recente di ciascuna. */
export async function elencoSolidita(db: Database): Promise<readonly RigaSolidita[]> {
  interface Riga {
    compagnia_id: string;
    denominazione: string;
    gruppo: string | null;
    codice_ivass: string | null;
    anno: number;
    solvency_ratio: string | null;
    quota_tier1_unrestricted: string | null;
    fondi_propri_centesimi: string | number | null;
    scr_centesimi: string | number | null;
    premi_lordi_centesimi: string | number | null;
    reclami_anno: number | null;
    rating_agenzia: string | null;
    rating_valore: string | null;
    fonte: string;
    aggiornato_il: string;
  }

  /*
    Un esercizio per compagnia, il più recente. `DISTINCT ON` fa esattamente questo e in
    una passata sola; il `max()` su una sottoquery costerebbe una scansione in più e
    darebbe lo stesso risultato solo finché nessuno inserisce due righe con lo stesso anno.
  */
  const risultato: unknown = await db.execute(sql`
    SELECT DISTINCT ON (c.id)
      c.id AS compagnia_id, c.denominazione, c.gruppo, c.codice_ivass,
      s.anno, s.solvency_ratio, s.quota_tier1_unrestricted,
      s.fondi_propri_centesimi, s.scr_centesimi, s.premi_lordi_centesimi,
      s.reclami_anno, s.rating_agenzia, s.rating_valore, s.fonte, s.aggiornato_il
    FROM compagnie c
    JOIN solidita_compagnia s ON s.compagnia_id = c.id
    ORDER BY c.id, s.anno DESC
  `);

  const righe: Riga[] = Array.isArray(risultato)
    ? (risultato as Riga[])
    : ((risultato as { rows?: Riga[] }).rows ?? []);

  return righe
    .map((r) => ({
      compagniaId: r.compagnia_id,
      denominazione: r.denominazione,
      gruppo: r.gruppo,
      codiceIvass: r.codice_ivass,
      anno: r.anno,
      solvencyRatio: numero(r.solvency_ratio),
      quotaTier1Unrestricted: numero(r.quota_tier1_unrestricted),
      fondiPropriCentesimi: numero(r.fondi_propri_centesimi),
      scrCentesimi: numero(r.scr_centesimi),
      premiLordiCentesimi: numero(r.premi_lordi_centesimi),
      reclamiAnno: r.reclami_anno,
      ratingAgenzia: r.rating_agenzia,
      ratingValore: r.rating_valore,
      fonte: r.fonte,
      aggiornatoIl: new Date(r.aggiornato_il),
    }))
    .sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'));
}

/** Rimuove una compagnia e i suoi esercizi. */
export async function eliminaCompagnia(db: Database, compagniaId: string): Promise<void> {
  await db.delete(schema.compagnie).where(eq(schema.compagnie.id, compagniaId));
}

/** Denominazioni censite, per l'incrocio con le compagnie scritte sulle polizze. */
export async function denominazioniCompagnie(db: Database): Promise<readonly string[]> {
  const righe = await db
    .select({ denominazione: schema.compagnie.denominazione })
    .from(schema.compagnie)
    .orderBy(asc(schema.compagnie.denominazione));
  return righe.map((r) => r.denominazione);
}
