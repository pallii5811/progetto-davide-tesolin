/**
 * Sottoassicurazione e regola proporzionale (art. 1907 c.c.).
 *
 * «Se l'assicurazione copre solo una parte del valore che la cosa assicurata aveva nel
 * tempo del sinistro, l'assicuratore risponde dei danni in proporzione della parte suddetta.»
 *
 *     Indennizzo = Danno × (Somma assicurata / Valore reale)
 *
 * È la clausola che trasforma un contratto che il cliente credeva di avere in un contratto
 * che paga la metà. Quantificarla in anticipo, in euro, è l'argomento di vendita più onesto
 * e più efficace che un intermediario possa portare — e nessuna delle piattaforme esistenti
 * lo mette in mano al broker in automatico.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money, ZERO } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { formatPercent } from '../shared/math.js';

export interface Underinsurance {
  readonly valoreReale: Euro;
  readonly sommaAssicurata: Euro;
  /** Somma assicurata / valore reale, limitato a 1. */
  readonly gradoDiCopertura: number;
  /** Quota di ogni danno che resterebbe a carico dell'assicurato. */
  readonly quotaACarico: number;
  /** Differenza fra valore reale e somma assicurata. */
  readonly scoperturaDiCapitale: Euro;
  /** Simulazione su un danno di riferimento. */
  readonly simulazione: SimulazioneSinistro;
  readonly sottoassicurata: boolean;
}

export interface SimulazioneSinistro {
  readonly danno: Euro;
  readonly indennizzo: Euro;
  readonly aCaricoAssicurato: Euro;
}

/**
 * Danno di riferimento per la simulazione: il 30% del valore reale.
 * Un sinistro totale è raro e retoricamente sospetto; un sinistro parziale rilevante è
 * l'evento statisticamente più probabile ed è quello su cui la regola proporzionale
 * produce l'effetto più contro-intuitivo per il cliente.
 */
export const QUOTA_DANNO_SIMULATO = 0.3;

export function computeUnderinsurance(
  valoreReale: Euro,
  sommaAssicurata: Euro,
  opzioni: { readonly dannoSimulato?: Euro | undefined; readonly soggettaARegolaProporzionale?: boolean | undefined } = {},
): Explained<Underinsurance | null> {
  const builder = explain('Verifica di sottoassicurazione')
    .formula('Indennizzo = Danno × (Somma assicurata / Valore reale)')
    .reference('Art. 1907 c.c. — assicurazione parziale');

  if (!Money.isPositive(valoreReale)) {
    return builder
      .note('Valore reale del bene non quantificato: la verifica non è eseguibile.')
      .confidence('bassa')
      .value(null);
  }

  const soggetta = opzioni.soggettaARegolaProporzionale ?? true;
  const gradoDiCopertura = Math.min(1, sommaAssicurata / valoreReale);
  const quotaACarico = 1 - gradoDiCopertura;
  const scoperturaDiCapitale = Money.max(ZERO, Money.subtract(valoreReale, sommaAssicurata));

  const danno = opzioni.dannoSimulato ?? Money.multiply(valoreReale, QUOTA_DANNO_SIMULATO);
  const indennizzo = soggetta ? Money.multiply(danno, gradoDiCopertura) : Money.min(danno, sommaAssicurata);
  const aCaricoAssicurato = Money.subtract(danno, indennizzo);

  const sottoassicurata = gradoDiCopertura < 0.98;

  builder
    .input('Valore reale del bene', Money.formatCompact(valoreReale))
    .input('Somma assicurata', Money.formatCompact(sommaAssicurata))
    .input('Grado di copertura', formatPercent(gradoDiCopertura, 0))
    .input('Danno simulato', Money.formatCompact(danno))
    .input('Indennizzo atteso', Money.formatCompact(indennizzo))
    .input('A carico dell’assicurato', Money.formatCompact(aCaricoAssicurato));

  if (!soggetta) {
    builder.note(
      'Garanzia prestata a primo rischio assoluto: la regola proporzionale non si applica. ' +
        'Resta il limite della somma assicurata come tetto di indennizzo.',
    );
  } else if (sottoassicurata) {
    builder.note(
      `⚠ SOTTOASSICURAZIONE del ${formatPercent(quotaACarico, 0)}. Su un danno di ` +
        `${Money.formatCompact(danno)} l’indennizzo sarebbe di ${Money.formatCompact(indennizzo)}: ` +
        `${Money.formatCompact(aCaricoAssicurato)} resterebbero a carico dell’impresa.`,
    );
    builder.note(
      `Capitale da integrare per azzerare l’esposizione: ${Money.formatCompact(scoperturaDiCapitale)}.`,
    );
  } else {
    builder.note('Somma assicurata congrua rispetto al valore reale: nessuna riduzione proporzionale attesa.');
  }

  return builder.confidence('media').value({
    valoreReale,
    sommaAssicurata,
    gradoDiCopertura,
    quotaACarico,
    scoperturaDiCapitale,
    simulazione: { danno, indennizzo, aCaricoAssicurato },
    sottoassicurata,
  });
}
