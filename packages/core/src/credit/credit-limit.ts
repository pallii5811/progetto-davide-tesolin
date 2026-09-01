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
import { formatNumber, interpolate } from '../shared/math.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import type { CreditScore } from './score.js';

export const QUOTA_PATRIMONIO_NETTO = 0.2;
export const QUOTA_FATTURATO = 0.1;
export const MULTIPLO_EBITDA = 3;

export interface CreditLimit {
  /**
   * Il fido consigliato, oppure `null` quando non se ne può consigliare uno.
   *
   * `null` e non zero, per la ragione che vale già per i tre vincoli qui sotto e per una
   * in più: **zero euro di fido è una raccomandazione**, e la più severa che questo
   * prodotto sappia dare — «pagamento anticipato o garanzia reale». Rivolgerla a
   * un'impresa di cui non si è potuto misurare il merito non è prudenza: è un giudizio
   * negativo emesso senza istruttoria, e a subirlo è il cliente dell'intermediario.
   *
   * Vale `null` quando il punteggio di credito è `ND`: il fido si dimensiona sul merito, e
   * senza merito non c'è dimensionamento. Resta invece zero — che è un giudizio fondato —
   * quando il punteggio c'è ed è bassissimo per un fatto accertato, come una procedura
   * concorsuale aperta.
   */
  readonly importo: Euro | null;
  /** Quale dei tre vincoli si è rivelato il più stringente. */
  readonly vincoloAttivo: 'patrimoniale' | 'dimensionale' | 'flusso' | 'nessuno';
  /**
   * I tre vincoli, e `null` dove non si è potuto calcolarli.
   *
   * `null` e non zero: zero è un vincolo che vale zero — succede davvero, con un
   * patrimonio netto negativo o un EBITDA nullo — e significa «il fido concedibile è
   * nessuno». Sono due frasi opposte sotto lo stesso numero, e il documento le stampa
   * entrambe accanto al credito che il broker sta per concedere.
   */
  readonly limitePatrimoniale: Euro | null;
  readonly limiteDimensionale: Euro | null;
  readonly limiteFlusso: Euro | null;
  /** Il moltiplicatore ricavato dal merito, `null` quando il merito non è determinabile. */
  readonly fattoreScore: number | null;
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
  /**
   * Chi costruisce le basi dichiara qui se il patrimonio netto è al netto delle
   * immobilizzazioni immateriali.
   *
   * Il campo si chiama «tangibile» ma in produzione riceve il patrimonio netto **lordo**
   * degli aggregati sintetici, avviamento e marchi compresi — e la spiegazione lo
   * stampava comunque come tangibile, in una riga aperta di default. Su una società con
   * avviamento pari a un terzo del patrimonio, il limite patrimoniale esce sovrastimato
   * del 50%.
   *
   * Assente significa «non dichiarato», non «lordo»: l'etichetta si degrada a ciò che si
   * sa, invece di scegliere l'ipotesi comoda.
   */
  readonly alNettoDegliImmateriali?: boolean;
}

export function basiDaBilancio(bilancio: BilancioRiclassificato): BasiDelFido {
  return {
    patrimonioNettoTangibile: bilancio.sp.patrimonioNettoTangibile,
    ricavi: bilancio.ce.ricavi,
    ebitda: bilancio.ce.ebitda,
    // Il riclassificato sottrae le immobilizzazioni immateriali: qui l'aggettivo è vero.
    alNettoDegliImmateriali: true,
  };
}

/** L'etichetta che la scheda stampa accanto al patrimonio netto usato per il fido. */
function etichettaPatrimonioNetto(basi: BasiDelFido): string {
  if (basi.alNettoDegliImmateriali === true) return 'Patrimonio netto tangibile';
  if (basi.alNettoDegliImmateriali === false) {
    return 'Patrimonio netto (comprensivo delle immobilizzazioni immateriali)';
  }
  return 'Patrimonio netto (non dichiarato se al netto degli immateriali)';
}

export function computeCreditLimit(basi: BasiDelFido, score: CreditScore): Explained<CreditLimit> {
  const builder = explain('Fido commerciale consigliato')
    .formula(
      'min(20% del patrimonio netto; 10% ricavi; 3 × EBITDA) × fattore di score, ' +
        'con il fattore che modula da 0 a 1,00 e non oltre',
    )
    .reference('Metodologia AEGIS · docs/DOMINIO.md §4');

  /*
    I tre vincoli si calcolano PRIMA di guardare il merito, perché non dipendono da lui.
    Stavano più in basso, dopo le uscite anticipate, e quindi le uscite anticipate non
    potevano mostrarli: un fido non determinabile usciva senza dire nemmeno quanto
    l'impresa potrebbe sostenere, che è l'unica cosa che in quel caso si sa.
  */
  const limitePatrimoniale =
    basi.patrimonioNettoTangibile === null
      ? null
      : Money.max(ZERO, Money.multiply(basi.patrimonioNettoTangibile, QUOTA_PATRIMONIO_NETTO));
  const limiteDimensionale =
    basi.ricavi === null ? null : Money.max(ZERO, Money.multiply(basi.ricavi, QUOTA_FATTURATO));
  const limiteFlusso =
    basi.ebitda === null ? null : Money.max(ZERO, Money.multiply(basi.ebitda, MULTIPLO_EBITDA));

  /**
   * Il fido AZZERATO: l'unico caso in cui zero è una misura e non un buco.
   *
   * Si usa per il fido non concedibile a fronte di un fatto accertato — procedura
   * concorsuale aperta, impresa cessata. Lì «0 €» è la risposta giusta e la
   * raccomandazione, «pagamento anticipato o garanzia reale», è quella che l'intermediario
   * deve leggere.
   *
   * Non si usa per un fido che non si è potuto calcolare: quello esce `null`, ramo per
   * ramo. I due casi si scrivevano uguali, e la differenza è tutta la differenza fra
   * «questa impresa non merita credito» e «non lo sappiamo».
   */
  const azzerato: CreditLimit = {
    importo: ZERO,
    vincoloAttivo: 'nessuno',
    limitePatrimoniale: ZERO,
    limiteDimensionale: ZERO,
    limiteFlusso: ZERO,
    fattoreScore: 0,
  };

  /*
    Senza merito non c'è dimensionamento.

    Il fido è il minimo fra tre vincoli MOLTIPLICATO per un fattore che nasce dal
    punteggio. Quando il punteggio è `ND` quel fattore non esiste, e le due uscite
    sbagliate sono entrambe a portata di mano: moltiplicare per zero — cioè raccomandare
    il pagamento anticipato a un'impresa mai valutata — oppure moltiplicare per uno, cioè
    concedere il fido pieno. La prima danneggia il cliente dell'intermediario, la seconda
    l'intermediario.

    Nessuna delle due è una misura. L'unica risposta vera è che la domanda non ha risposta
    su questi dati, e i tre vincoli restano visibili perché sono calcolati e utili: dicono
    quanto l'impresa potrebbe sostenere, in attesa del merito che dirà quanto le si può
    concedere.
  */
  if (score.value === null) {
    return builder
      .note(
        'Fido non determinabile: il punteggio di credito non è calcolabile su questi dati, ' +
          'e il fido si dimensiona sul merito.',
      )
      .note(
        'Non è un giudizio negativo sull’impresa: è l’assenza di un giudizio. ' +
          'Acquistare il profilo completo, oppure rilevare i dati economici in intervista.',
      )
      .confidence('bassa')
      .value({
        importo: null,
        vincoloAttivo: 'nessuno',
        limitePatrimoniale,
        limiteDimensionale,
        limiteFlusso,
        fattoreScore: null,
      });
  }

  if (score.cap !== null && score.value <= 20) {
    return builder
      .note(`Fido non concedibile: ${score.cap}.`)
      .note('Si raccomanda esclusivamente pagamento anticipato o garanzia reale.')
      .confidence('alta')
      .value(azzerato);
  }

  if (basi.patrimonioNettoTangibile === null && basi.ricavi === null) {
    /*
      LA STESSA CONTRADDIZIONE DELLO SCORE, un piano più in basso, e trovata sui dati veri.

      Questo ramo scriveva «il fido non è quantificabile con metodo» e restituiva `azzerato`,
      cioè **0 €**. Le parole dicevano che non si può calcolare, il numero diceva zero — e
      zero, in questa scheda, è la raccomandazione più severa che il prodotto sappia dare.
      Misurato su una risposta reale: un'impresa con punteggio 59 e classe C usciva con
      «Fido commerciale consigliato: 0 €».

      `azzerato` metteva a zero anche i tre vincoli, contraddicendo la correzione già fatta
      sul percorso principale, dove un vincolo non calcolabile esce `null` proprio perché
      «vale zero» e «non lo so» sono due frasi opposte sotto lo stesso numero. Resta l'unico
      caso in cui zero è vero: il fido non concedibile per un fatto accertato, qui sopra.
    */
    return builder
      .note('Nessun aggregato di bilancio disponibile: il fido non è quantificabile con metodo.')
      .note(
        'Per società di persone e ditte individuali si suggerisce di partire da un fido di prova ' +
          'contenuto e di rivalutarlo sull’esperienza di pagamento.',
      )
      .confidence('bassa')
      .value({
        importo: null,
        vincoloAttivo: 'nessuno',
        limitePatrimoniale,
        limiteDimensionale,
        limiteFlusso,
        fattoreScore: null,
      });
  }

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

  /*
    Il fattore di score modula verso il basso, mai verso l'alto.

    Saliva fino a 1,25 su score 100, e a 1,15 su score 90: il fido usciva fino al 25% sopra
    il vincolo che la nota stampata due righe più giù chiama «il più stringente fra quelli
    calcolabili». Le due affermazioni non possono stare nello stesso documento.

    Misurato sul percorso che gira in produzione: score 85, fattore 1,07×, fido 390.000 €
    contro un limite patrimoniale di 366.000 €. Non era un caso limite — lo score senza
    bilancio in schema CEE stava sopra 80 per costruzione.

    Un merito eccellente resta il presupposto per concedere il fido pieno, che è quello che
    il vincolo consente: non per superarlo. La curva si ferma quindi a 1,00, e interpolate
    tiene l'ultimo valore oltre l'ultimo punto.
  */
  const fattoreScore = interpolate(score.value, [
    { x: 1, y: 0 },
    { x: 25, y: 0.05 },
    { x: 35, y: 0.15 },
    { x: 50, y: 0.4 },
    { x: 65, y: 0.7 },
    { x: 80, y: 1 },
  ]);

  const importo = Money.commercialRound(Money.multiply(base, fattoreScore));

  const formatta = (valore: Euro | null): string =>
    valore === null ? 'non calcolabile' : Money.formatCompact(valore);

  return (
    builder
      .input(etichettaPatrimonioNetto(basi), formatta(basi.patrimonioNettoTangibile))
      .input('Ricavi', formatta(basi.ricavi))
      .input('EBITDA', formatta(basi.ebitda))
      .input(
        `Limite patrimoniale (${(QUOTA_PATRIMONIO_NETTO * 100).toFixed(0)}%)`,
        formatta(limitePatrimoniale),
      )
      .input(`Limite dimensionale (${(QUOTA_FATTURATO * 100).toFixed(0)}%)`, formatta(limiteDimensionale))
      .input(`Limite di flusso (${MULTIPLO_EBITDA}× EBITDA)`, formatta(limiteFlusso))
      // `toFixed` scrive il punto decimale inglese: «0.30×» in una pagina che dieci righe
      // più su stampa «1,37» e «13,7%». Un separatore fuori posto su un documento
      // assicurativo italiano fa sembrare tradotto ciò che è stato scritto qui.
      .input('Fattore di score', `${formatNumber(fattoreScore, 2)}× (score ${score.value}/100)`)
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
      .noteIf(
        basi.alNettoDegliImmateriali !== true && basi.patrimonioNettoTangibile !== null,
        'Il patrimonio netto usato non è dichiarato al netto delle immobilizzazioni ' +
          'immateriali: se l’impresa ha avviamento, marchi o software capitalizzati, il ' +
          'limite patrimoniale qui indicato è sovrastimato di altrettanto.',
      )
      // Un fido calcolato senza il vincolo di flusso è per costruzione meno affidabile:
      // è il vincolo che dice se l'azienda genera la cassa per ripagare la dilazione.
      .confidence(limiteFlusso === null ? 'media' : score.value >= 35 ? 'alta' : 'media')
      /*
        I tre vincoli non calcolabili escono `null`, non 0 €.

        Uscivano zero, e la spiegazione accanto stampava correttamente «non calcolabile»:
        chi leggeva il solo numero concludeva che tre volte l'EBITDA vale zero, cioè che
        l'impresa non genera cassa. Era un'affermazione al posto di un'assenza, ed è la
        regola 2d del progetto nel punto in cui costa di più — sotto il numero che il
        broker usa per decidere quanto credito concedere.

        Perché non bastava correggerlo al confine: `Money.max(ZERO, …)` produce uno zero
        VERO su un patrimonio netto negativo. Zero calcolato e zero mancante arrivavano al
        presenter indistinguibili, e lì il dato era già perduto per sempre. Le due cose si
        possono ancora separare solo qui, dove si sa quale delle due è.

        Il cambio di tipo attraversa tre corsie — questa, il presenter e il DTO del web —
        e per questo era rimasto aperto: nessun agente poteva farlo senza rompere gli
        altri due. Va in un commit solo, o il progetto non compila a metà strada.
      */
      .value({
        importo,
        vincoloAttivo,
        limitePatrimoniale,
        limiteDimensionale,
        limiteFlusso,
        fattoreScore,
      })
  );
}
