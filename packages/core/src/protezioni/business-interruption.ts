/**
 * Business Interruption, come la definisce il foglio «Veezco_Analisi Rischio.xlsx».
 *
 *   Punteggio fisico      = Property Risk
 *   Perdita giornaliera   = contribuzione annua ÷ 365
 *   Scenari di fermo      = perdita giornaliera × 7, × 30, × 90
 *
 * LA BASE ANNUA. Il foglio chiama il campo «Annual Contribution», la nota accanto parla del
 * guadagno dell'azienda e l'esempio usa il fatturato. Deciso con Simone il 13/09/2026: il
 * margine di contribuzione quando c'è, altrimenti il fatturato, e la scheda dice sempre quale
 * dei due ha usato. Il margine c'è solo col bilancio dettagliato o con i dati d'intervista;
 * il fatturato quasi sempre. Sul fatturato la perdita è per eccesso, e va detto.
 *
 * GLI SCENARI SI CALCOLANO DALLA PERDITA GIORNALIERA STAMPATA. Il foglio moltiplica la cella non
 * arrotondata; la scheda però mostra la perdita al centesimo, e chi rifà il conto moltiplica
 * quella. Da 1.000.000 € l'anno la giornaliera è 2.739,73 €: per 90 giorni la base darebbe
 * 246.575,34 €, la moltiplicazione che il lettore fa 246.575,70 €. Trentasei centesimi che non
 * cambiano nessuna decisione e che, stampati, direbbero che il conto non torna.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { PropertyRisk } from './property-risk.js';

export const GIORNI_DEGLI_SCENARI = [7, 30, 90] as const;

export const FORMULE_BUSINESS_INTERRUPTION: readonly string[] = [
  'Perdita giornaliera = margine di contribuzione annuo ÷ 365 (in mancanza del margine, fatturato annuo ÷ 365)',
  'Scenari di fermo = perdita giornaliera × 7, × 30, × 90',
  'Punteggio fisico = Property Risk',
];

export type BaseBusinessInterruption = 'margine-di-contribuzione' | 'fatturato';

export interface ScenarioDiFermo {
  readonly giorni: number;
  readonly perdita: Euro;
}

export interface BusinessInterruption {
  readonly formule: readonly string[];
  /** È il Property Risk, come prescrive il foglio: `null` quando quello non è calcolabile. */
  readonly punteggioFisico: number | null;
  readonly base: BaseBusinessInterruption | null;
  readonly baseAnnua: Euro | null;
  readonly perditaGiornaliera: Euro | null;
  /** Vuoto quando manca la base: nessuno scenario si inventa su una perdita ignota. */
  readonly scenari: readonly ScenarioDiFermo[];
  readonly note: readonly string[];
}

export function calcolaBusinessInterruption(
  property: PropertyRisk,
  margineDiContribuzione: Euro | null,
  fatturato: Euro | null,
): BusinessInterruption {
  const note: string[] = [];
  let base: BaseBusinessInterruption | null = null;
  let baseAnnua: Euro | null = null;

  if (margineDiContribuzione !== null && Money.isPositive(margineDiContribuzione)) {
    base = 'margine-di-contribuzione';
    baseAnnua = margineDiContribuzione;
    note.push('Calcolata sul margine di contribuzione annuo, come prevede il foglio.');
  } else if (fatturato !== null && Money.isPositive(fatturato)) {
    base = 'fatturato';
    baseAnnua = fatturato;
    note.push(
      margineDiContribuzione === null
        ? 'Il margine di contribuzione non è disponibile: servono il bilancio dettagliato o i dati d’intervista. ' +
            'La perdita è calcolata sul fatturato annuo, ed è quindi per eccesso rispetto al margine.'
        : 'Il margine di contribuzione rilevato non è positivo e non misura una perdita: la perdita è calcolata ' +
            'sul fatturato annuo, ed è quindi per eccesso.',
    );
  } else {
    note.push(
      'Né il margine di contribuzione né il fatturato sono disponibili: la perdita giornaliera resta da rilevare.',
    );
  }

  note.push(
    property.punteggio === null
      ? 'Il punteggio fisico è il Property Risk, come prevede il foglio, e resta non calcolabile finché lo è il Property Risk.'
      : 'Il punteggio fisico è il Property Risk, come prevede il foglio.',
  );

  const perditaGiornaliera = baseAnnua === null ? null : Money.divide(baseAnnua, 365);

  return {
    formule: FORMULE_BUSINESS_INTERRUPTION,
    punteggioFisico: property.punteggio,
    base,
    baseAnnua,
    perditaGiornaliera,
    scenari:
      perditaGiornaliera === null
        ? []
        : GIORNI_DEGLI_SCENARI.map((giorni) => ({
            giorni,
            perdita: Money.multiply(perditaGiornaliera, giorni),
          })),
    note,
  };
}
