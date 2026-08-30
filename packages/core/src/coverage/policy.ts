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
 * Su quale capitale la polizza indennizza — cioè il metro su cui l'art. 1907 c.c. si misura.
 *
 * Sono tre, non due, ed è il terzo che mancava. Il capitale che il motore calcola è a
 * **valore di rimpiazzo a nuovo**: il coefficiente di riporto dal netto contabile vale 2,0.
 * Una garanzia a valore allo stato d'uso indennizza invece il bene **degradato**, cioè un
 * numero mediamente pari alla metà. Confrontare la somma di quella polizza con il capitale
 * a nuovo non misura la sottoassicurazione: la fabbrica, e di circa il cinquanta per cento.
 *
 * - `valore-a-nuovo`: il metro coincide con il capitale calcolato. È il caso ordinario, ed
 *   è anche il ramo prudente su cui cade la forma **non dichiarata** — dedurre da un campo
 *   vuoto la forma più favorevole dichiarerebbe adeguata una polizza che al sinistro subisce
 *   la riduzione.
 * - `valore-allo-stato-duso`: il metro esiste ma non è questo, e il motore non lo possiede.
 * - `limite-pattuito`: il primo rischio assoluto, dove la proporzionale non opera affatto.
 */
export type MetroDiIndennizzo = 'valore-a-nuovo' | 'valore-allo-stato-duso' | 'limite-pattuito';

export function metroDiIndennizzo(polizza: PolizzaInEssere): MetroDiIndennizzo {
  switch (polizza.formaGaranzia) {
    case 'primo-rischio-assoluto':
      return 'limite-pattuito';
    case 'valore-allo-stato-duso':
      return 'valore-allo-stato-duso';
    case 'valore-a-nuovo':
    case null:
      return 'valore-a-nuovo';
  }
}

/**
 * Il primo rischio assoluto esclude l'applicazione della regola proporzionale:
 * la sottoassicurazione, in quella forma, non produce riduzione dell'indennizzo.
 *
 * Si legge dal metro e non dal campo, perché la stessa domanda posta due volte è il modo
 * in cui due risposte finiscono per divergere.
 */
export function soggettaARegolaProporzionale(polizza: PolizzaInEssere): boolean {
  return metroDiIndennizzo(polizza) !== 'limite-pattuito';
}

/**
 * Indicizza le polizze per copertura, tenendo in caso di duplicati quella che conta.
 *
 * L'ordine di precedenza è **prima lo stato, poi il capitale**, e non è un dettaglio di
 * ordinamento: fra due contratti della stessa garanzia il criterio del capitale più alto
 * faceva vincere la polizza scaduta, cioè quella che al sinistro non paga nulla. È la
 * condizione normale dopo ogni rinnovo — il vecchio contratto resta a fascicolo, e quasi
 * sempre porta il capitale storico più alto perché il rinnovo lo ha ridimensionato — e
 * l'effetto era doppio: il prodotto dichiarava in ordine una garanzia morta e taceva la
 * sottoassicurazione del contratto realmente in vigore.
 */
export function indexPolizze(
  polizze: readonly PolizzaInEssere[],
  asOf: Date,
): ReadonlyMap<CoverageId, PolizzaInEssere> {
  const index = new Map<CoverageId, PolizzaInEssere>();
  for (const polizza of polizze) {
    const existing = index.get(polizza.coverage);
    if (existing === undefined) {
      index.set(polizza.coverage, polizza);
      continue;
    }
    if (prevale(polizza, existing, asOf)) index.set(polizza.coverage, polizza);
  }
  return index;
}

/** Se `candidata` debba sostituire `attuale` come polizza di riferimento della garanzia. */
function prevale(candidata: PolizzaInEssere, attuale: PolizzaInEssere, asOf: Date): boolean {
  const candidataScaduta = isScaduta(candidata, asOf);
  const attualeScaduta = isScaduta(attuale, asOf);

  // Una garanzia in vigore batte una cessata, quale che sia il capitale.
  if (candidataScaduta !== attualeScaduta) return attualeScaduta;

  /*
    A parità di stato decide il capitale — e «capitale non dichiarato» non è zero.

    Confrontarlo come zero, com'era scritto qui, non produceva un errore visibile:
    produceva una scelta. Fra due polizze in vigore si preferisce quella di cui si
    conosce il capitale, perché è la sola su cui la sottoassicurazione si possa
    verificare; ma la si preferisce dichiarandolo, non fingendo che l'altra valga nulla.
  */
  const capitaleCandidata = capitaleDiPolizza(candidata);
  const capitaleAttuale = capitaleDiPolizza(attuale);
  if (capitaleCandidata === null) return false;
  if (capitaleAttuale === null) return true;
  return capitaleCandidata > capitaleAttuale;
}
