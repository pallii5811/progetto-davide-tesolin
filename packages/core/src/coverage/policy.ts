/**
 * Polizze già in portafoglio.
 *
 * Il confronto fra ciò che serve e ciò che c'è è il cuore della gap analysis. La sfida
 * pratica non è modellare la polizza, è **estrarne i dati**: oggi il broker li ricopia a
 * mano dai frontespizi PDF. La fase F3 della roadmap sostituisce questa struttura con
 * l'output del parsing automatico dei testi di polizza, mantenendo la stessa forma.
 */

import type { Money as Euro } from '../shared/money.js';
import type { CoverageId } from './taxonomy.js';

export interface PolizzaInEssere {
  readonly id: string;
  readonly coverage: CoverageId;
  readonly compagnia: string;
  readonly numeroPolizza: string | null;
  /** Somma assicurata, per le garanzie a valore (incendio, furto, elettronica). */
  readonly sommaAssicurata: Euro | null;
  /** Massimale per sinistro, per le garanzie di responsabilità civile. */
  readonly massimale: Euro | null;
  readonly franchigia: Euro | null;
  /** Scoperto in quota, 0-1. */
  readonly scoperto: number | null;
  readonly dataEffetto: Date;
  readonly dataScadenza: Date;
  readonly premioAnnuo: Euro | null;
  /** Formula di indennizzo dichiarata in polizza, ove nota. */
  readonly formaGaranzia: 'valore-a-nuovo' | 'valore-allo-stato-duso' | 'primo-rischio-assoluto' | null;
  readonly note: string | null;
}

/** Capitale rilevante ai fini del confronto: somma assicurata o, in mancanza, massimale. */
export function capitaleDiPolizza(polizza: PolizzaInEssere): Euro | null {
  return polizza.sommaAssicurata ?? polizza.massimale;
}

export function isScaduta(polizza: PolizzaInEssere, asOf: Date): boolean {
  return polizza.dataScadenza.getTime() < asOf.getTime();
}

export function giorniAllaScadenza(polizza: PolizzaInEssere, asOf: Date): number {
  return Math.ceil((polizza.dataScadenza.getTime() - asOf.getTime()) / 86_400_000);
}

/**
 * Il primo rischio assoluto esclude l'applicazione della regola proporzionale:
 * la sottoassicurazione, in quella forma, non produce riduzione dell'indennizzo.
 */
export function soggettaARegolaProporzionale(polizza: PolizzaInEssere): boolean {
  return polizza.formaGaranzia !== 'primo-rischio-assoluto';
}

/** Indicizza le polizze per copertura, tenendo la più capiente in caso di duplicati. */
export function indexPolizze(
  polizze: readonly PolizzaInEssere[],
): ReadonlyMap<CoverageId, PolizzaInEssere> {
  const index = new Map<CoverageId, PolizzaInEssere>();
  for (const polizza of polizze) {
    const existing = index.get(polizza.coverage);
    if (existing === undefined) {
      index.set(polizza.coverage, polizza);
      continue;
    }
    const nuova = capitaleDiPolizza(polizza) ?? 0;
    const vecchia = capitaleDiPolizza(existing) ?? 0;
    if (nuova > vecchia) index.set(polizza.coverage, polizza);
  }
  return index;
}
