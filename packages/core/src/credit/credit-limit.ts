/**
 * Fido consigliato.
 *
 * Massima esposizione commerciale ragionevole verso il soggetto, sotto forma di dilazione
 * di pagamento. Tre vincoli concorrenti, si prende il più stringente:
 *
 *   1. **patrimoniale** — il fido non deve erodere il patrimonio netto tangibile;
 *   2. **dimensionale** — non ha senso concedere a un'azienda più di una frazione del suo giro d'affari;
 *   3. **di flusso** — il debito commerciale va ripagato con la cassa che l'azienda genera.
 *
 * Il risultato è modulato dallo score e arrotondato a taglio commerciale: un fido di
 * 187.432 € non si comunica a un cliente.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money, ZERO } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { interpolate } from '../shared/math.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import type { CreditScore } from './score.js';

export const QUOTA_PATRIMONIO_NETTO = 0.2;
export const QUOTA_FATTURATO = 0.1;
export const MULTIPLO_EBITDA = 3;

export interface CreditLimit {
  readonly importo: Euro;
  /** Quale dei tre vincoli si è rivelato il più stringente. */
  readonly vincoloAttivo: 'patrimoniale' | 'dimensionale' | 'flusso' | 'nessuno';
  readonly limitePatrimoniale: Euro;
  readonly limiteDimensionale: Euro;
  readonly limiteFlusso: Euro;
  readonly fattoreScore: number;
}

/**
 * Aggregati necessari al calcolo del fido.
 *
 * Espressi come struttura autonoma e non come bilancio riclassificato: i tre vincoli si
 * calcolano su tre numeri, e due dei tre sono disponibili anche dai soli dati sintetici.
 * Rinunciare al fido perché manca l'EBITDA significherebbe non rispondere a una domanda
 * a cui si può rispondere in parte — e la risposta parziale, dichiarata come tale, vale
 * più del silenzio.
 */
export interface BasiDelFido {
  readonly patrimonioNettoTangibile: Euro | null;
  readonly ricavi: Euro | null;
  readonly ebitda: Euro | null;
}

export function basiDaBilancio(bilancio: BilancioRiclassificato): BasiDelFido {
  return {
    patrimonioNettoTangibile: bilancio.sp.patrimonioNettoTangibile,
    ricavi: bilancio.ce.ricavi,
    ebitda: bilancio.ce.ebitda,
  };
}

export function computeCreditLimit(basi: BasiDelFido, score: CreditScore): Explained<CreditLimit> {
  const builder = explain('Fido commerciale consigliato')
    .formula('min(20% PN tangibile; 10% ricavi; 3 × EBITDA) × fattore di score')
    .reference('Metodologia AEGIS · docs/DOMINIO.md §4');

  const azzerato: CreditLimit = {
    importo: ZERO,
    vincoloAttivo: 'nessuno',
    limitePatrimoniale: ZERO,
    limiteDimensionale: ZERO,
    limiteFlusso: ZERO,
    fattoreScore: 0,
  };

  if (score.cap !== null && score.value <= 20) {
    return builder
      .note(`Fido non concedibile: ${score.cap}.`)
      .note('Si raccomanda esclusivamente pagamento anticipato o garanzia reale.')
      .confidence('alta')
      .value(azzerato);
  }

  if (basi.patrimonioNettoTangibile === null && basi.ricavi === null) {
    return builder
      .note('Nessun aggregato di bilancio disponibile: il fido non è quantificabile con metodo.')
      .note(
        'Per società di persone e ditte individuali si suggerisce di partire da un fido di prova ' +
          'contenuto e di rivalutarlo sull’esperienza di pagamento.',
      )
      .confidence('bassa')
      .value(azzerato);
  }

  const limitePatrimoniale =
    basi.patrimonioNettoTangibile === null
      ? null
      : Money.max(ZERO, Money.multiply(basi.patrimonioNettoTangibile, QUOTA_PATRIMONIO_NETTO));
  const limiteDimensionale =
    basi.ricavi === null ? null : Money.max(ZERO, Money.multiply(basi.ricavi, QUOTA_FATTURATO));
  const limiteFlusso =
    basi.ebitda === null ? null : Money.max(ZERO, Money.multiply(basi.ebitda, MULTIPLO_EBITDA));

  // Si prende il più stringente **fra quelli calcolabili**. Un vincolo non calcolabile
  // non è un vincolo soddisfatto: viene dichiarato mancante nelle note e la confidenza scende.
  interface Vincolo {
    readonly valore: Euro;
    readonly nome: CreditLimit['vincoloAttivo'];
  }

  const candidati: readonly { valore: Euro | null; nome: CreditLimit['vincoloAttivo'] }[] = [
    { valore: limitePatrimoniale, nome: 'patrimoniale' },
    { valore: limiteDimensionale, nome: 'dimensionale' },
    { valore: limiteFlusso, nome: 'flusso' },
  ];
  const disponibili = candidati.filter((v): v is Vincolo => v.valore !== null);

  const piuStringente = disponibili.reduce<Vincolo>(
    (minimo, corrente) => (corrente.valore < minimo.valore ? corrente : minimo),
    disponibili[0]!,
  );
  const base = piuStringente.valore;
  const vincoloAttivo = piuStringente.nome;

  const fattoreScore = interpolate(score.value, [
    { x: 1, y: 0 },
    { x: 25, y: 0.05 },
    { x: 35, y: 0.15 },
    { x: 50, y: 0.4 },
    { x: 65, y: 0.7 },
    { x: 80, y: 1 },
    { x: 90, y: 1.15 },
    { x: 100, y: 1.25 },
  ]);

  const importo = Money.commercialRound(Money.multiply(base, fattoreScore));

  const formatta = (valore: Euro | null): string =>
    valore === null ? 'non calcolabile' : Money.formatCompact(valore);

  return (
    builder
      .input('Patrimonio netto tangibile', formatta(basi.patrimonioNettoTangibile))
      .input('Ricavi', formatta(basi.ricavi))
      .input('EBITDA', formatta(basi.ebitda))
      .input(
        `Limite patrimoniale (${(QUOTA_PATRIMONIO_NETTO * 100).toFixed(0)}%)`,
        formatta(limitePatrimoniale),
      )
      .input(`Limite dimensionale (${(QUOTA_FATTURATO * 100).toFixed(0)}%)`, formatta(limiteDimensionale))
      .input(`Limite di flusso (${MULTIPLO_EBITDA}× EBITDA)`, formatta(limiteFlusso))
      .input('Fattore di score', `${fattoreScore.toFixed(2)}× (score ${score.value}/100)`)
      .note(`Vincolo più stringente fra quelli calcolabili: ${vincoloAttivo}.`)
      .noteIf(
        limiteFlusso === null,
        'EBITDA non disponibile: il vincolo di flusso non è stato applicato. Con il bilancio ' +
          'dettagliato il fido potrebbe risultare inferiore a quello qui indicato.',
      )
      .noteIf(
        limiteFlusso !== null && !Money.isPositive(basi.ebitda ?? ZERO),
        'EBITDA non positivo: il vincolo di flusso azzera il fido. L’azienda non genera cassa per ripagare la dilazione.',
      )
      .noteIf(
        Money.isZero(importo) && Money.isPositive(base),
        'Il fattore di score riduce il fido sotto la soglia di significatività: si consiglia pagamento anticipato.',
      )
      .noteIf(
        score.value < 50,
        'Score inferiore a 50: valutare garanzie accessorie (fideiussione, assicurazione del credito) prima della concessione.',
      )
      // Un fido calcolato senza il vincolo di flusso è per costruzione meno affidabile:
      // è il vincolo che dice se l'azienda genera la cassa per ripagare la dilazione.
      .confidence(limiteFlusso === null ? 'media' : score.value >= 35 ? 'alta' : 'media')
      .value({
        importo,
        vincoloAttivo,
        limitePatrimoniale: limitePatrimoniale ?? ZERO,
        limiteDimensionale: limiteDimensionale ?? ZERO,
        limiteFlusso: limiteFlusso ?? ZERO,
        fattoreScore,
      })
  );
}
