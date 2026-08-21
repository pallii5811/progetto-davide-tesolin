/**
 * Classificazione dimensionale dell'impresa — Raccomandazione UE 2003/361/CE.
 *
 * Non è un dato di colore: determina la scadenza dell'obbligo CAT NAT, i limiti di
 * indennizzo di legge, i benchmark di massimale e la priorità commerciale.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';

export type CompanySize = 'micro' | 'piccola' | 'media' | 'grande';

export const COMPANY_SIZE_LABEL: Readonly<Record<CompanySize, string>> = {
  micro: 'Microimpresa',
  piccola: 'Piccola impresa',
  media: 'Media impresa',
  grande: 'Grande impresa',
};

interface SizeThreshold {
  readonly size: Exclude<CompanySize, 'grande'>;
  readonly maxAddetti: number;
  readonly maxFatturato: Euro;
  readonly maxTotaleAttivo: Euro;
}

const THRESHOLDS: readonly SizeThreshold[] = [
  {
    size: 'micro',
    maxAddetti: 10,
    maxFatturato: Money.euro(2_000_000),
    maxTotaleAttivo: Money.euro(2_000_000),
  },
  {
    size: 'piccola',
    maxAddetti: 50,
    maxFatturato: Money.euro(10_000_000),
    maxTotaleAttivo: Money.euro(10_000_000),
  },
  {
    size: 'media',
    maxAddetti: 250,
    maxFatturato: Money.euro(50_000_000),
    maxTotaleAttivo: Money.euro(43_000_000),
  },
];

export interface SizeInput {
  readonly addetti: number | null;
  readonly fatturato: Euro | null;
  readonly totaleAttivo: Euro | null;
}

/**
 * Il criterio degli addetti è **vincolante**; quello finanziario è **alternativo**:
 * basta rispettare o il tetto di fatturato o quello di totale attivo.
 */
export function classifySize(input: SizeInput): Explained<CompanySize> {
  const { addetti, fatturato, totaleAttivo } = input;

  const builder = explain('Classificazione dimensionale')
    .formula('Addetti (vincolante) E (Fatturato OPPURE Totale attivo)')
    .reference('Raccomandazione UE 2003/361/CE, art. 2')
    .input('Addetti', addetti === null ? 'da rilevare in intervista' : String(addetti))
    .input('Fatturato', fatturato === null ? 'da rilevare in intervista' : Money.formatCompact(fatturato))
    .input('Totale attivo', totaleAttivo === null ? 'da rilevare in intervista' : Money.formatCompact(totaleAttivo));

  if (addetti === null && fatturato === null && totaleAttivo === null) {
    return builder
      .note('Nessun parametro dimensionale disponibile: assunta piccola impresa in via prudenziale.')
      .confidence('bassa')
      .value('piccola');
  }

  for (const threshold of THRESHOLDS) {
    const addettiOk = addetti === null || addetti < threshold.maxAddetti;
    const fatturatoOk = fatturato !== null && fatturato <= threshold.maxFatturato;
    const attivoOk = totaleAttivo !== null && totaleAttivo <= threshold.maxTotaleAttivo;
    const finanziarioOk = fatturatoOk || attivoOk || (fatturato === null && totaleAttivo === null);

    if (addettiOk && finanziarioOk) {
      return builder
        .note(
          `Rientra nella soglia "${COMPANY_SIZE_LABEL[threshold.size]}": ` +
            `< ${threshold.maxAddetti} addetti e ` +
            `fatturato ≤ ${Money.formatCompact(threshold.maxFatturato)} oppure ` +
            `attivo ≤ ${Money.formatCompact(threshold.maxTotaleAttivo)}.`,
        )
        .noteIf(
          addetti === null,
          'Numero di addetti non disponibile: criterio valutato solo sui dati finanziari.',
        )
        .confidence(addetti === null ? 'media' : 'alta')
        .value(threshold.size);
    }
  }

  return builder
    .note('Superate tutte le soglie della media impresa.')
    .confidence(addetti === null ? 'media' : 'alta')
    .value('grande');
}

/** Ordinamento crescente, utile per confronti (`sizeRank(a) < sizeRank(b)`). */
export function sizeRank(size: CompanySize): number {
  switch (size) {
    case 'micro':
      return 0;
    case 'piccola':
      return 1;
    case 'media':
      return 2;
    case 'grande':
      return 3;
  }
}
