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

/**
 * Se il capitale pattuito basti, e su quale metro lo si è misurato.
 *
 * Non è un booleano perché i casi sono tre. Una garanzia a **valore intero** si giudica
 * sul valore dei beni: sotto, opera la regola proporzionale. Una a **primo rischio
 * assoluto** si giudica sul limite pattuito rispetto alla perdita che ci si può
 * ragionevolmente attendere — e se quella perdita non è stata stimata, la risposta
 * onesta è che non si sa.
 *
 * `non-verificabile` è lo stato che mancava, ed è la ragione per cui una polizza furto
 * scritta a primo rischio — cioè quasi ogni polizza furto del mercato — veniva dichiarata
 * sottoassicurata per il motivo esatto per cui quella forma era stata scelta.
 */
export type AdeguatezzaDelLimite = 'adeguata' | 'insufficiente' | 'non-verificabile';

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
  readonly adeguatezzaDelLimite: AdeguatezzaDelLimite;
  /** Il capitale contro cui il limite è stato giudicato. `null` se non c'era un metro. */
  readonly riferimentoAdeguatezza: Euro | null;
  /** Scorciatoia per chi decide: vera solo quando il limite è accertato insufficiente. */
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

/**
 * Sotto questa quota del riferimento il capitale è insufficiente.
 *
 * Il 2% di tolleranza non è generosità: gli arrotondamenti commerciali delle somme
 * assicurate producono scarti di quell'ordine, e segnalarli come sottoassicurazione
 * riempirebbe il piano d'azione di allarmi che non lo sono.
 */
const SOGLIA_CONGRUITA = 0.98;

export function computeUnderinsurance(
  valoreReale: Euro,
  sommaAssicurata: Euro,
  opzioni: {
    readonly dannoSimulato?: Euro | undefined;
    readonly soggettaARegolaProporzionale?: boolean | undefined;
    /**
     * Il capitale contro cui giudicare una garanzia **non** soggetta a proporzionale.
     *
     * Di norma è il danno massimo probabile: è il metro con cui un assicuratore
     * dimensiona un primo rischio assoluto. Senza, il limite non si può giudicare, e il
     * risultato lo dichiara invece di dedurne un'insufficienza dal confronto con il
     * valore intero — che è il confronto sbagliato per costruzione.
     */
    readonly riferimentoAdeguatezza?: Euro | undefined;
    /**
     * Perché `valoreReale` **non** è il metro su cui questa polizza indennizza.
     *
     * Si valorizza soltanto quando i due numeri non sono omogenei — una garanzia a valore
     * allo stato d'uso confrontata con un capitale calcolato a valore di rimpiazzo a nuovo,
     * che è il solo caso oggi. Il testo è un frammento fisso composto da chi chiama, perché
     * è lui a conoscere la ragione; qui serve a **sospendere** il verdetto invece di
     * dedurre un'insufficienza da un confronto sbagliato per costruzione — esattamente ciò
     * che `non-verificabile` già fa per il primo rischio senza metro.
     */
    readonly metroNonOmogeneo?: string | undefined;
  } = {},
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
  const metroNonOmogeneo = opzioni.metroNonOmogeneo ?? null;
  const gradoDiCopertura = Math.min(1, sommaAssicurata / valoreReale);
  const quotaACarico = 1 - gradoDiCopertura;
  const scoperturaDiCapitale = Money.max(ZERO, Money.subtract(valoreReale, sommaAssicurata));

  const danno = opzioni.dannoSimulato ?? Money.multiply(valoreReale, QUOTA_DANNO_SIMULATO);
  const indennizzo = soggetta ? Money.multiply(danno, gradoDiCopertura) : Money.min(danno, sommaAssicurata);
  const aCaricoAssicurato = Money.subtract(danno, indennizzo);

  /*
    Il verdetto si misura sul metro della forma, non sempre sul valore intero.

    Qui c'era `gradoDiCopertura < 0.98` e basta: una polizza scritta correttamente a
    primo rischio assoluto sul danno probabile risultava sottoassicurata perché il suo
    limite sta sotto il valore dei beni — cioè per la ragione esatta per cui quella forma
    era stata scelta. E la stessa Explained conteneva già la nota che dice che la
    proporzionale non si applica: la spiegazione e il verdetto si contraddicevano.
  */
  /*
    E c'era un secondo modo di sbagliare metro, opposto e altrettanto silenzioso.

    Anche restando dentro la regola proporzionale, il valore contro cui si misura deve
    essere quello su cui la polizza indennizza. Con `formaGaranzia` a valore allo stato
    d'uso l'esito era identico carattere per carattere a quello di una garanzia a nuovo —
    stessa percentuale, stessa cifra a carico — mentre il capitale contro cui si misurava
    era a nuovo. Su quelle polizze il prodotto dichiarava sottoassicurata di circa il
    cinquanta per cento un'impresa che non lo era.
  */
  const riferimentoAdeguatezza = soggetta
    ? metroNonOmogeneo === null
      ? valoreReale
      : null
    : (opzioni.riferimentoAdeguatezza ?? null);

  const adeguatezzaDelLimite: AdeguatezzaDelLimite =
    riferimentoAdeguatezza === null
      ? 'non-verificabile'
      : sommaAssicurata < Money.multiply(riferimentoAdeguatezza, SOGLIA_CONGRUITA)
        ? 'insufficiente'
        : 'adeguata';

  const sottoassicurata = adeguatezzaDelLimite === 'insufficiente';

  builder
    .input(
      metroNonOmogeneo === null
        ? 'Valore reale del bene'
        : 'Capitale calcolato a valore di rimpiazzo a nuovo',
      Money.formatCompact(valoreReale),
    )
    .input('Somma assicurata', Money.formatCompact(sommaAssicurata));

  // Su un metro non omogeneo il grado di copertura e la simulazione sono numeri esatti e
  // privi di significato: misurano il rapporto fra due grandezze diverse. Non si stampano,
  // perché un numero mostrato viene letto, e questo verrebbe letto come una scopertura.
  if (metroNonOmogeneo === null) {
    builder
      .input('Grado di copertura', formatPercent(gradoDiCopertura, 0))
      .input('Danno simulato', Money.formatCompact(danno))
      .input('Indennizzo atteso', Money.formatCompact(indennizzo))
      .input('A carico dell’assicurato', Money.formatCompact(aCaricoAssicurato));
  }

  // Su un primo rischio il «grado di copertura» sul valore intero è un numero vero e
  // fuorviante — l'8% di una polizza scritta bene sembra un disastro. Accanto va detto
  // su quale capitale il limite è stato davvero giudicato.
  if (!soggetta && riferimentoAdeguatezza !== null) {
    builder.input('Perdita attesa in un sinistro grave', Money.formatCompact(riferimentoAdeguatezza));
  }

  if (!soggetta) {
    builder.note(
      'Garanzia prestata a primo rischio assoluto: la regola proporzionale non si applica. ' +
        'Resta il limite della somma assicurata come tetto di indennizzo.',
    );
    if (riferimentoAdeguatezza === null) {
      builder.note(
        'Il limite non è giudicabile con i dati disponibili: per una garanzia a primo rischio il ' +
          'metro non è il valore dei beni ma la perdita che ci si può ragionevolmente attendere in ' +
          'un solo sinistro, e per questa garanzia non è stata stimata.',
      );
    } else if (sottoassicurata) {
      builder.note(
        `⚠ Il limite di ${Money.formatCompact(sommaAssicurata)} è inferiore alla perdita attesa in un ` +
          `sinistro grave (${Money.formatCompact(riferimentoAdeguatezza)}): l’eccedenza resterebbe ` +
          'scoperta, senza che operi alcuna riduzione proporzionale.',
      );
    } else {
      builder.note(
        `Limite congruo rispetto alla perdita attesa in un sinistro grave ` +
          `(${Money.formatCompact(riferimentoAdeguatezza)}), e senza regola proporzionale.`,
      );
    }
  } else if (metroNonOmogeneo !== null) {
    builder.note(metroNonOmogeneo);
    builder.note(
      'Il verdetto resta sospeso: confrontare la somma assicurata con un capitale espresso su ' +
        'un altro metro non misurerebbe la sottoassicurazione, la produrrebbe. Rilevare il valore ' +
        'dei beni sul metro di questa polizza è ciò che rende il giudizio possibile.',
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
    builder.note(
      'Somma assicurata congrua rispetto al valore reale: nessuna riduzione proporzionale attesa.',
    );
  }

  return builder.confidence('media').value({
    valoreReale,
    sommaAssicurata,
    gradoDiCopertura,
    quotaACarico,
    scoperturaDiCapitale,
    simulazione: { danno, indennizzo, aCaricoAssicurato },
    adeguatezzaDelLimite,
    riferimentoAdeguatezza,
    sottoassicurata,
  });
}
