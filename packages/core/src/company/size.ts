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

  /*
    La Raccomandazione non è il solo art. 2, e il documento non deve far credere di sì.

    Gli artt. 3 e 6 dell'allegato impongono di sommare i dati delle imprese **associate** e
    **collegate** prima di applicare le soglie: un'impresa piccola dentro un gruppo grande
    è una grande impresa, per la Raccomandazione. Qui si applicano le soglie ai dati della
    sola impresa, e l'aggregazione non è possibile perché i dati delle collegate non
    entrano in questa funzione né sono in mano al motore — l'anagrafica dice se un gruppo
    c'è, non quanto fattura.

    La classe non è un dato di colore: da lei dipende il termine dell'obbligo CAT NAT.
    Sottostimarla sposta in avanti una scadenza di legge, e allora il limite si dichiara
    invece di lasciarlo dedurre dalla citazione dell'articolo.
  */
  const builder = explain('Classificazione dimensionale')
    .formula('Addetti (vincolante) E (Fatturato OPPURE Totale attivo)')
    .reference('Raccomandazione UE 2003/361/CE, art. 2')
    .note(
      'Soglie applicate ai dati della sola impresa. Gli artt. 3 e 6 dell’allegato alla ' +
        'Raccomandazione impongono di sommare i dati delle imprese associate e collegate: ' +
        'l’aggregazione di gruppo non è stata eseguita, e per un’impresa che appartenga a un gruppo ' +
        'la classe qui indicata può risultare inferiore a quella di legge — e con essa il termine ' +
        'dell’obbligo assicurativo catastrofale.',
    )
    .input('Addetti', addetti === null ? 'da rilevare in intervista' : String(addetti))
    .input('Fatturato', fatturato === null ? 'da rilevare in intervista' : Money.formatCompact(fatturato))
    .input(
      'Totale attivo',
      totaleAttivo === null ? 'da rilevare in intervista' : Money.formatCompact(totaleAttivo),
    );

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
    /*
      Il criterio finanziario **assunto** non è il criterio finanziario **verificato**.

      Senza fatturato né attivo il ramo passava lo stesso — è l'ipotesi prudenziale giusta,
      perché la sola alternativa è rifiutarsi di classificare — ma la nota stampata era
      identica a quella di un'impresa con entrambi i dati, e la confidenza restava 'alta'.
      Il documento affermava così una soglia che nessuno aveva misurato. Il caso non è
      raro: una risposta su tre fra quelle registrate ha tutti gli aggregati a null in
      tutti e nove gli esercizi.
    */
    const finanziarioNoto = fatturato !== null || totaleAttivo !== null;
    const finanziarioOk = fatturatoOk || attivoOk || !finanziarioNoto;

    if (addettiOk && finanziarioOk) {
      return builder
        .note(
          finanziarioNoto
            ? `Rientra nella soglia "${COMPANY_SIZE_LABEL[threshold.size]}": ` +
                `< ${threshold.maxAddetti} addetti e ` +
                `fatturato ≤ ${Money.formatCompact(threshold.maxFatturato)} oppure ` +
                `attivo ≤ ${Money.formatCompact(threshold.maxTotaleAttivo)}.`
            : `Classificata "${COMPANY_SIZE_LABEL[threshold.size]}" sul solo criterio degli addetti ` +
                `(< ${threshold.maxAddetti}). Né il fatturato né il totale attivo sono disponibili: ` +
                'il criterio finanziario non è stato verificato, e un’impresa che superasse ' +
                `${Money.formatCompact(threshold.maxFatturato)} di fatturato e ` +
                `${Money.formatCompact(threshold.maxTotaleAttivo)} di attivo apparterrebbe alla classe superiore.`,
        )
        .noteIf(
          addetti === null,
          'Numero di addetti non disponibile: criterio valutato solo sui dati finanziari.',
        )
        .confidence(addetti === null || !finanziarioNoto ? 'media' : 'alta')
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
