/**
 * Somme assicurande calcolate dal bilancio.
 *
 * È il punto in cui la piattaforma produce il valore che nessuno degli strumenti esistenti
 * produce. Oggi la domanda «quanto vale il suo capannone?» viene girata a un imprenditore
 * che non lo sa: risponde con il valore catastale, con il prezzo di acquisto del 1998 o con
 * il residuo del mutuo. Da lì nasce la sottoassicurazione, e con essa la regola proporzionale
 * dell'art. 1907 c.c. che al momento del sinistro taglia l'indennizzo.
 *
 * Qui ogni capitale è calcolato da dati verificabili, con formula esposta e ipotesi dichiarate.
 * Dove il dato manca, il motore lo dice: non inventa una cifra senza avvisare.
 *
 * Nota di metodo: tutti gli arrotondamenti sono **per eccesso** (`commercialRoundUp`).
 * Arrotondare per difetto un capitale da assicurare significa introdurre di propria mano
 * la sottoassicurazione che questo modulo esiste per prevenire.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money, ZERO } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { formatNumber } from '../shared/math.js';
import type { CompanyFacts } from '../company/facts.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import type { ImmobileDichiarato } from '../company/profile.js';
import { haOrganoAmministrativo, normaResponsabilitaAmministratori } from '../governance/norme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Parametri di calcolo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Costo di ricostruzione a nuovo, €/mq, per tipologia costruttiva.
 * Valori di riferimento di mercato per immobili a destinazione produttiva e commerciale,
 * comprensivi di oneri tecnici e di demolizione. Vanno tarati per area geografica in sede
 * di perizia: sono la base di partenza, non il risultato finale.
 */
export const COSTO_RICOSTRUZIONE_EUR_MQ = {
  prefabbricato: 750,
  acciaio: 850,
  'cemento-armato': 950,
  muratura: 1_050,
  legno: 1_000,
  misto: 950,
  default: 950,
} as const;

/**
 * Coefficiente di riporto dal valore netto contabile al valore di rimpiazzo a nuovo.
 *
 * Un'immobilizzazione iscritta a bilancio è già stata ammortizzata: il suo valore netto
 * è mediamente il 40-60% del costo storico, e il costo storico è a sua volta inferiore al
 * costo di riacquisto odierno. Il coefficiente 2,0 riflette entrambi gli scarti.
 *
 * Se la nota integrativa fornisce il costo storico lordo, il coefficiente non si applica:
 * si usa il dato reale con un semplice adeguamento inflattivo.
 */
export const COEFF_NETTO_A_RIMPIAZZO = 2.0;
export const COEFF_LORDO_A_RIMPIAZZO = 1.25;

/**
 * Le rimanenze di bilancio fotografano il 31 dicembre, che per la gran parte dei settori
 * è il minimo stagionale. Assicurare quel numero significa essere sottoassicurati per
 * dieci mesi l'anno.
 */
export const COEFF_PICCO_SCORTE = 1.3;

/** Periodo di indennizzo di default per i danni indiretti, in mesi. */
export const PERIODO_INDENNIZZO_DEFAULT_MESI = 12;

export interface SumsInsuredOptions {
  readonly costoRicostruzioneEuroMq?: number | undefined;
  /**
   * Superficie coperta dei fabbricati rilevata dalla cartografia, in metri quadri.
   *
   * Serve **solo** come ripiego quando l'intervista non ha misurato: non scavalca mai una
   * superficie dichiarata. Vedi `calcolaFabbricati` per i limiti che la accompagnano.
   */
  readonly superficieCartograficaMq?: number | undefined;
  readonly coefficienteRivalutazione?: number | undefined;
  readonly coefficientePiccoScorte?: number | undefined;
  readonly periodoIndennizzoMesi?: number | undefined;
}

/**
 * Somme assicurande.
 *
 * I capitali che dipendono dal bilancio sono `Euro | null`, e la distinzione è
 * sostanziale: `0 €` significa «l'azienda non possiede quel bene», `null` significa
 * «non lo so». Confonderli produce il consiglio più assurdo che un software assicurativo
 * possa dare — «attivare la copertura con capitale di 0 €» — e ne distrugge la credibilità
 * davanti al primo cliente.
 */
export interface SumsInsured {
  readonly fabbricati: Explained<Euro | null>;
  readonly contenuto: Explained<Euro | null>;
  readonly scorte: Explained<Euro | null>;
  readonly danniIndiretti: Explained<Euro | null>;
  readonly monteSalari: Explained<Euro | null>;
  readonly massimaleRct: Explained<Euro>;
  readonly massimaleRcoPerPersona: Explained<Euro>;
  readonly massimaleRcProdotti: Explained<Euro | null>;
  readonly massimaleDandO: Explained<Euro | null>;
  readonly massimaleCyber: Explained<Euro>;
  readonly fidoClienti: Explained<Euro | null>;
  /** Base imponibile dell'obbligo CAT NAT: beni ex art. 2424 c.c. B-II 1, 2, 3. */
  readonly baseCatNat: Explained<Euro | null>;
  /** Patrimonio complessivo esposto: fabbricati + contenuto + scorte. */
  readonly patrimonioEsposto: Explained<Euro | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcolo
// ─────────────────────────────────────────────────────────────────────────────

export function computeSumsInsured(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
  immobili: readonly ImmobileDichiarato[],
  options: SumsInsuredOptions = {},
): SumsInsured {
  const fabbricati = calcolaFabbricati(facts, bilancio, immobili, options);
  const contenuto = calcolaContenuto(facts, bilancio, options);
  const scorte = calcolaScorte(facts, bilancio, options);
  const danniIndiretti = calcolaDanniIndiretti(facts, bilancio, options);
  const monteSalari = calcolaMonteSalari(facts, bilancio);

  const componenti = [fabbricati.value, contenuto.value, scorte.value];
  const noti = componenti.filter((v): v is Euro => v !== null);

  const patrimonioEsposto = explain('Patrimonio complessivo esposto')
    .formula('Fabbricati + Contenuto + Scorte')
    .input('Fabbricati', formattaOppureIgnoto(fabbricati.value))
    .input('Contenuto', formattaOppureIgnoto(contenuto.value))
    .input('Scorte', formattaOppureIgnoto(scorte.value))
    .noteIf(
      noti.length > 0 && noti.length < componenti.length,
      'Somma parziale: una o più componenti non sono quantificabili con i dati disponibili.',
    )
    .inheritConfidence(fabbricati.confidence, contenuto.confidence, scorte.confidence)
    .value<Euro | null>(noti.length === 0 ? null : Money.add(...noti));

  return {
    fabbricati,
    contenuto,
    scorte,
    danniIndiretti,
    monteSalari,
    massimaleRct: calcolaMassimaleRct(facts),
    massimaleRcoPerPersona: calcolaMassimaleRco(facts),
    massimaleRcProdotti: calcolaMassimaleRcProdotti(facts),
    massimaleDandO: calcolaMassimaleDandO(facts),
    massimaleCyber: calcolaMassimaleCyber(facts),
    fidoClienti: calcolaFidoClienti(facts),
    baseCatNat: calcolaBaseCatNat(fabbricati, contenuto),
    patrimonioEsposto,
  };
}

// ── Fabbricati ───────────────────────────────────────────────────────────────

function calcolaFabbricati(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
  immobili: readonly ImmobileDichiarato[],
  options: SumsInsuredOptions,
): Explained<Euro | null> {
  const builder = explain('Somma assicuranda — Fabbricati').reference(
    'Valore di ricostruzione a nuovo, non valore di mercato né valore contabile',
  );

  // Metodo preferito: superficie × costo di ricostruzione. È l'unico corretto.
  const conSuperficie = immobili.filter(
    (i): i is ImmobileDichiarato & { superficieMq: number } =>
      i.superficieMq !== null && i.superficieMq > 0,
  );

  if (conSuperficie.length > 0) {
    let totale = ZERO;
    for (const immobile of conSuperficie) {
      const costoMq =
        options.costoRicostruzioneEuroMq ??
        COSTO_RICOSTRUZIONE_EUR_MQ[immobile.tipologiaCostruttiva ?? 'default'];
      const valore = Money.multiply(Money.euro(costoMq), immobile.superficieMq);
      totale = Money.add(totale, valore);
      builder.input(
        immobile.descrizione,
        `${formatNumber(immobile.superficieMq, 0)} mq × ${Money.formatCompact(Money.euro(costoMq))}/mq = ${Money.formatCompact(valore)}`,
      );
    }

    const inLocazione = immobili.filter((i) => i.titolo === 'locazione');
    return builder
      .formula('Σ (superficie mq × costo di ricostruzione €/mq)')
      .noteIf(
        inLocazione.length > 0,
        `${inLocazione.length} immobile/i in locazione: verificare la ripartizione contrattuale ` +
          'dell’onere assicurativo e inserire la rinuncia alla rivalsa verso il locatore.',
      )
      .note('Il costo €/mq va confermato con perizia per gli immobili di valore rilevante.')
      .confidence('alta')
      .value(Money.commercialRoundUp(totale));
  }

  /*
    Primo ripiego: la superficie coperta rilevata dalla cartografia.

    Quando il sopralluogo non ha misurato — che è il caso più frequente — l'alternativa era
    saltare direttamente al valore contabile, cioè a un numero già decurtato dagli
    ammortamenti e che comprende il terreno. L'impronta a terra dei fabbricati è una base
    peggiore di una misura vera ma **molto** migliore di quella: è una superficie, e la
    superficie è la grandezza giusta.

    Resta a confidenza media e con i suoi limiti scritti: l'impronta a terra ignora i piani,
    quindi su un edificio a più livelli sottostima; e la cartografia collaborativa può
    essere ferma a prima di un ampliamento. Dichiararlo è ciò che impedisce di scambiarla
    per un rilievo.
  */
  const cartografica = options.superficieCartograficaMq;
  if (cartografica !== undefined && cartografica > 0) {
    const costoMq = options.costoRicostruzioneEuroMq ?? COSTO_RICOSTRUZIONE_EUR_MQ.default;
    const stima = Money.multiply(Money.euro(costoMq), cartografica);

    return builder
      .formula('Superficie coperta rilevata da cartografia × costo di ricostruzione €/mq')
      .input('Superficie coperta (impronta a terra)', `${formatNumber(cartografica, 0)} mq`)
      .input('Costo di ricostruzione', `${Money.formatCompact(Money.euro(costoMq))}/mq`)
      .note(
        'STIMA. La superficie non è stata rilevata in intervista: è ricavata dall’impronta a terra dei ' +
          'fabbricati su cartografia collaborativa (OpenStreetMap). Misura la superficie coperta, non ' +
          'quella sviluppata: su un edificio a più piani il capitale risulta sottostimato.',
      )
      .note(
        'La cartografia collaborativa può non riflettere ampliamenti recenti. Rilevare i metri quadri ' +
          'in sede di intervista resta la singola attività che più riduce il rischio di sottoassicurazione.',
      )
      .confidence('media')
      .value(Money.commercialRoundUp(stima));
  }

  // Secondo ripiego: dal bilancio, riportando il valore netto contabile a valore di rimpiazzo.
  if (bilancio !== null && Money.isPositive(bilancio.origine.attivo.terreniEFabbricati)) {
    const netto = bilancio.origine.attivo.terreniEFabbricati;
    const coefficiente = options.coefficienteRivalutazione ?? COEFF_NETTO_A_RIMPIAZZO;
    const stima = Money.multiply(netto, coefficiente);

    return builder
      .formula('Valore netto contabile B.II.1 × coefficiente di riporto a nuovo')
      .input('Terreni e fabbricati (netto contabile)', Money.formatCompact(netto))
      .input('Coefficiente di riporto', `${formatNumber(coefficiente)}×`)
      .note(
        'STIMA. Superficie degli immobili non disponibile: il capitale è stimato dal valore contabile, ' +
          'già decurtato dagli ammortamenti. Rilevare i metri quadri in sede di intervista è la singola ' +
          'attività che più riduce il rischio di sottoassicurazione.',
      )
      .note(
        'La voce B.II.1 comprende anche il valore dei terreni, che non è soggetto a distruzione: ' +
          'in presenza di aree di pertinenza estese la stima è per eccesso.',
      )
      .confidence('bassa')
      .value(Money.commercialRoundUp(stima));
  }

  // Nessun immobile di proprietà è un fatto accertato: vale zero.
  if (facts.possiedeImmobili === false) {
    return builder
      .note(
        'Nessun immobile di proprietà: la copertura fabbricati non si applica. Verificare comunque ' +
          'gli obblighi contrattuali di assicurazione previsti dal contratto di locazione.',
      )
      .confidence('media')
      .value<Euro | null>(ZERO);
  }

  return builder
    .note('Nessun dato disponibile su immobili o superfici: capitale da rilevare in intervista.')
    .confidence('bassa')
    .value<Euro | null>(null);
}

/** Formattazione che distingue lo zero accertato dal dato mancante. */
function formattaOppureIgnoto(valore: Euro | null): string {
  return valore === null ? 'non determinabile' : Money.formatCompact(valore);
}

// ── Contenuto: macchinari, impianti, attrezzature ────────────────────────────

function calcolaContenuto(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
  options: SumsInsuredOptions,
): Explained<Euro | null> {
  const builder = explain('Somma assicuranda — Macchinari e attrezzature').reference(
    'Valore di rimpiazzo a nuovo',
  );

  /*
    Senza il bilancio CEE si prova con quanto rilevato in intervista.

    Le voci B-II-2 e B-II-3 dello stato patrimoniale stanno nel bilancio depositato: chi
    le legge dal documento del cliente le porta qui, e il capitale smette di essere «non
    determinabile». Il coefficiente cambia a seconda che il valore dichiarato sia al
    costo storico lordo — quello della nota integrativa — o al netto contabile.
  */
  if (bilancio === null) {
    const lordo = facts.costoStoricoImmobilizzazioni;
    const netto = facts.valoreImpiantiNetto;

    if (lordo !== null && Money.isPositive(lordo)) {
      const stima = Money.multiply(lordo, COEFF_LORDO_A_RIMPIAZZO);
      return builder
        .formula('Costo storico lordo di impianti e attrezzature × adeguamento a nuovo')
        .input('Costo storico lordo dichiarato', Money.formatCompact(lordo))
        .input('Adeguamento a nuovo', `${formatNumber(COEFF_LORDO_A_RIMPIAZZO)}×`)
        .note(
          'Valore rilevato in intervista dal bilancio depositato. Il costo storico è la base corretta ' +
            'per il valore a nuovo: ne risponde chi lo ha dichiarato.',
        )
        .confidence('media')
        .value<Euro | null>(Money.commercialRoundUp(stima));
    }

    if (netto !== null && Money.isPositive(netto)) {
      const coefficiente = options.coefficienteRivalutazione ?? COEFF_NETTO_A_RIMPIAZZO;
      const stima = Money.multiply(netto, coefficiente);
      return builder
        .formula('Valore netto contabile dichiarato × coefficiente di riporto a nuovo')
        .input('Impianti e attrezzature, netti', Money.formatCompact(netto))
        .input('Coefficiente di riporto', `${formatNumber(coefficiente)}×`)
        .note(
          'STIMA su valore rilevato in intervista. Il netto contabile è già decurtato dagli ' +
            'ammortamenti: chiedere il costo storico dalla nota integrativa alza la precisione di molto.',
        )
        .confidence('bassa')
        .value<Euro | null>(Money.commercialRoundUp(stima));
    }

    return builder
      .note(
        'Il valore di impianti e attrezzature non compare fra gli aggregati sintetici del registro: ' +
          'si rileva dalle voci B-II-2 e B-II-3 del bilancio depositato, che l’impresa ha già in mano.',
      )
      .confidence('bassa')
      .value<Euro | null>(null);
  }

  const attivo = bilancio.origine.attivo;
  const costoStorico = attivo.costoStoricoImmobilizzazioniMateriali ?? null;

  if (costoStorico !== null && Money.isPositive(costoStorico)) {
    const soloMobili = Money.subtract(costoStorico, attivo.terreniEFabbricati);
    const base = Money.max(ZERO, soloMobili);
    const stima = Money.multiply(base, COEFF_LORDO_A_RIMPIAZZO);
    return builder
      .formula('(Costo storico immobilizzazioni materiali − fabbricati) × adeguamento a nuovo')
      .input('Costo storico lordo', Money.formatCompact(costoStorico))
      .input('Adeguamento a nuovo', `${formatNumber(COEFF_LORDO_A_RIMPIAZZO)}×`)
      .note(
        'Calcolo basato sul costo storico da nota integrativa: è la base corretta per il valore a nuovo.',
      )
      .confidence('alta')
      .value(Money.commercialRoundUp(stima));
  }

  const netto = Money.add(
    attivo.impiantiEMacchinario,
    attivo.attrezzature,
    attivo.altreImmobilizzazioniMateriali,
  );
  if (!Money.isPositive(netto)) {
    return builder
      .note('Nessuna immobilizzazione materiale mobile iscritta a bilancio.')
      .confidence('media')
      .value(ZERO);
  }

  const coefficiente = options.coefficienteRivalutazione ?? COEFF_NETTO_A_RIMPIAZZO;
  const stima = Money.multiply(netto, coefficiente);

  return builder
    .formula('(Impianti + Attrezzature + Altri beni, netti) × coefficiente di riporto a nuovo')
    .input('Impianti e macchinario', Money.formatCompact(attivo.impiantiEMacchinario))
    .input('Attrezzature industriali e commerciali', Money.formatCompact(attivo.attrezzature))
    .input('Altri beni', Money.formatCompact(attivo.altreImmobilizzazioniMateriali))
    .input('Coefficiente di riporto', `${formatNumber(coefficiente)}×`)
    .note(
      'STIMA. Il valore netto contabile è già decurtato dagli ammortamenti e non rappresenta il costo ' +
        'di riacquisto: assicurare il netto contabile equivale a dichiararsi sottoassicurati in partenza.',
    )
    .note('Richiedere il registro dei cespiti per un calcolo puntuale sul costo storico.')
    .confidence('media')
    .value(Money.commercialRoundUp(stima));
}

// ── Scorte ───────────────────────────────────────────────────────────────────

function calcolaScorte(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
  options: SumsInsuredOptions,
): Explained<Euro | null> {
  const builder = explain('Somma assicuranda — Merci e scorte');

  /*
    Le rimanenze dal bilancio depositato, o rilevate in intervista dal documento.

    Qui si guardava solo il bilancio CEE, che in produzione non si compra: il capitale
    usciva «non determinabile» su ogni impresa reale. La voce C-I dello stato
    patrimoniale è però nel documento che l'imprenditore porta all'appuntamento, e si
    legge in trenta secondi.
  */
  const rimanenze = bilancio?.sp.rimanenze ?? facts.rimanenze;
  const daIntervista = bilancio === null && facts.rimanenze !== null;

  if (rimanenze === null) {
    return builder
      .note(
        'Le rimanenze non compaiono fra gli aggregati sintetici del registro: si rilevano dalla voce ' +
          'C-I dello stato patrimoniale del bilancio depositato, che l’impresa ha già in mano.',
      )
      .confidence('bassa')
      .value<Euro | null>(null);
  }

  if (!Money.isPositive(rimanenze)) {
    return builder
      .note('Nessuna rimanenza iscritta a bilancio: attività senza magazzino.')
      .confidence('media')
      .value<Euro | null>(ZERO);
  }

  const coefficiente = options.coefficientePiccoScorte ?? COEFF_PICCO_SCORTE;
  const stima = Money.multiply(rimanenze, coefficiente);

  return (
    builder
      .formula('Rimanenze di bilancio × coefficiente di picco stagionale')
      .input('Rimanenze al 31/12', Money.formatCompact(rimanenze))
      .input('Coefficiente di picco', `${formatNumber(coefficiente)}×`)
      .noteIf(
        daIntervista,
        'Valore rilevato in intervista dal bilancio depositato, non letto dal registro: ne risponde chi lo ha dichiarato.',
      )
      .note(
        'Il bilancio fotografa la giacenza di fine esercizio, che per la maggior parte dei settori ' +
          'coincide con il minimo annuo. Il capitale va dimensionato sul picco, non sulla media.',
      )
      .note(
        'Verificare con il cliente il mese di massima giacenza e valutare una clausola di scorta variabile.',
      )
      // Un dato dichiarato resta un dato vero, ma di cui risponde chi l'ha detto: la
      // confidenza scende di un gradino e il documento lo scrive.
      .confidence(daIntervista ? 'bassa' : 'media')
      .value(Money.commercialRoundUp(stima))
  );
}

// ── Danni indiretti (business interruption) ──────────────────────────────────

function calcolaDanniIndiretti(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
  options: SumsInsuredOptions,
): Explained<Euro | null> {
  const mesi = options.periodoIndennizzoMesi ?? PERIODO_INDENNIZZO_DEFAULT_MESI;
  const builder = explain('Somma assicuranda — Danni indiretti (Business Interruption)').reference(
    'Margine di contribuzione, non fatturato',
  );

  /*
    Il margine di contribuzione dal bilancio CEE, o composto dalle voci dichiarate.

    È la garanzia su cui il capitale sbagliato costa di più, e in produzione usciva
    sempre «non determinabile»: il dettaglio dei costi variabili non sta negli aggregati
    sintetici. Ma le due voci che servono — B-6 materie prime e B-7 servizi — sono nel
    conto economico del bilancio depositato, e `deriveFacts` le compone applicando la
    stessa quota di variabilità della riclassificazione.
  */
  const margine = bilancio?.ce.margineDiContribuzione ?? facts.margineDiContribuzione;
  const daIntervista = bilancio === null && facts.margineDiContribuzione !== null;

  if (margine === null) {
    return builder
      .note(
        'Il margine di contribuzione richiede il dettaglio dei costi variabili, assente dagli ' +
          'aggregati sintetici del registro. Si rileva in intervista dalle voci B-6 e B-7 del conto ' +
          'economico depositato: è la garanzia su cui il capitale sbagliato costa di più, e va ' +
          'quantificata prima di quotare.',
      )
      .confidence('bassa')
      .value<Euro | null>(null);
  }

  if (!Money.isPositive(margine)) {
    return builder
      .input('Margine di contribuzione', Money.formatCompact(margine))
      .note('Margine di contribuzione non positivo: verificare la riclassificazione dei costi variabili.')
      .confidence('bassa')
      .value<Euro | null>(null);
  }

  const capitale = Money.multiply(margine, mesi / 12);
  const perdMese = Money.divide(margine, 12);

  return (
    builder
      .formula('Margine di contribuzione annuo × (periodo di indennizzo / 12)')
      .input(
        'Valore della produzione',
        bilancio === null
          ? formattaOppureIgnoto(facts.fatturato)
          : Money.formatCompact(bilancio.ce.valoreDellaProduzione),
      )
      .input(
        'Costi variabili',
        bilancio === null ? 'rilevati in intervista' : Money.formatCompact(bilancio.ce.costiVariabili),
      )
      .input('Margine di contribuzione', Money.formatCompact(margine))
      .input('Periodo di indennizzo', `${mesi} mesi`)
      .noteIf(
        daIntervista,
        'Margine composto dalle voci B-6 e B-7 rilevate in intervista dal conto economico depositato, ' +
          'con la quota variabile dei servizi stimata al 60%. Va confermato con il commercialista prima ' +
          'di quotare: è il capitale su cui un errore costa di più.',
      )
      .note(`Ogni mese di fermo attività vale ${Money.formatCompact(perdMese)} di margine perso.`)
      .note(
        'Assicurare il fatturato anziché il margine significa pagare premio su costi che, a impianto ' +
          'fermo, non si sostengono: è l’errore più diffuso su questa garanzia.',
      )
      .noteIf(
        mesi < 12,
        'Periodo di indennizzo inferiore a 12 mesi: la ricostruzione di un capannone industriale ' +
          'raramente si completa in meno di un anno fra permessi, appalto e collaudo.',
      )
      .noteIf(
        facts.dimensione === 'media' || facts.dimensione === 'grande',
        'Per imprese di queste dimensioni valutare un periodo di indennizzo di 18-24 mesi.',
      )
      // Il margine composto in intervista resta una stima di secondo livello: la quota
      // variabile dei servizi è un'ipotesi, non una lettura.
      .confidence(daIntervista ? 'bassa' : 'media')
      .value(Money.commercialRoundUp(capitale))
  );
}

// ── Monte salari ─────────────────────────────────────────────────────────────

/**
 * Monte salari: dal bilancio dettagliato **o** da quello sintetico.
 *
 * Il costo del personale è uno dei pochi aggregati che l'anagrafica estesa porta con sé,
 * gratis, nei dieci esercizi sintetici. Qui si leggeva solo dal bilancio CEE dettagliato,
 * che in produzione non si compra mai — `bilancioDettagliato` è dichiarato non verificato
 * e non viene chiamato — e il massimale RCO usciva «non disponibile» su ogni impresa
 * reale, mentre nel documento dimostrativo compare.
 *
 * `facts.costoDelPersonale` faceva già la scelta giusta fra le due fonti: bastava
 * chiederlo a lui. Un capitale recuperato senza spendere un centesimo.
 */
function calcolaMonteSalari(
  facts: CompanyFacts,
  bilancio: BilancioRiclassificato | null,
): Explained<Euro | null> {
  const builder = explain('Monte salari annuo').reference('Base di calcolo del premio RCO');

  const costo = bilancio?.ce.costoDelPersonale ?? facts.costoDelPersonale;
  const daSintetico = bilancio === null && facts.costoDelPersonale !== null;

  if (costo === null) {
    return builder
      .note('Costo del personale non disponibile né dal bilancio depositato né dagli aggregati sintetici.')
      .confidence('bassa')
      .value<Euro | null>(null);
  }
  if (!Money.isPositive(costo)) {
    return builder
      .note('Nessun costo del personale a bilancio: impresa senza dipendenti.')
      .confidence('media')
      .value<Euro | null>(ZERO);
  }

  return (
    builder
      .formula('Salari e stipendi + oneri sociali e accessori')
      .input('Costo del personale', Money.formatCompact(costo))
      .noteIf(
        daSintetico,
        'Valore preso dagli aggregati sintetici del registro: è il costo del personale dell’ultimo ' +
          'esercizio depositato, non la retribuzione corrente. Va confermato in intervista se l’organico è cambiato.',
      )
      .note('Verificare la retribuzione convenzionale dei soci lavoratori e dei collaboratori familiari.')
      // Dal sintetico il dato è vero ma di un solo aggregato, senza il dettaglio delle voci:
      // la confidenza scende, e dirlo è ciò che distingue una misura da una stima.
      .confidence(daSintetico ? 'media' : 'alta')
      .value(costo)
  );
}

// ── Massimali di responsabilità civile ───────────────────────────────────────

/** Scala dei massimali di mercato, in euro. */
const SCALA_MASSIMALI = [1_000_000, 2_500_000, 5_000_000, 10_000_000, 15_000_000, 25_000_000] as const;

function massimaleDaFatturato(fatturato: Euro | null): number {
  if (fatturato === null) return 0;
  const valore = Money.toEuro(fatturato);
  if (valore < 1_000_000) return 0;
  if (valore < 5_000_000) return 1;
  if (valore < 15_000_000) return 2;
  if (valore < 50_000_000) return 3;
  return 4;
}

function scala(indice: number): Euro {
  const clamped = Math.min(SCALA_MASSIMALI.length - 1, Math.max(0, indice));
  return Money.euro(SCALA_MASSIMALI[clamped]!);
}

function settorePericoloso(facts: CompanyFacts): boolean {
  return facts.atecoSezione === 'F' || facts.lavoraInCantiere === true || facts.atecoSezione === 'C';
}

function calcolaMassimaleRct(facts: CompanyFacts): Explained<Euro> {
  const builder = explain('Massimale consigliato — RCT')
    .formula(
      'Benchmark per classe di fatturato, elevato di un gradino per i settori a maggiore pericolosità',
    )
    .reference('Benchmark di mercato AEGIS');

  let indice = massimaleDaFatturato(facts.fatturato);
  if (settorePericoloso(facts)) {
    indice += 1;
    builder.note(
      'Settore a maggiore pericolosità (costruzioni, manifattura o lavorazioni presso terzi): ' +
        'massimale elevato di un gradino.',
    );
  }
  if (facts.addetti !== null && facts.addetti > 50) {
    indice += 1;
    builder.note('Organico superiore a 50 addetti: maggiore esposizione al danno verso terzi.');
  }

  const massimale = scala(indice);
  return builder
    .input(
      'Fatturato',
      facts.fatturato === null ? 'da rilevare in intervista' : Money.formatCompact(facts.fatturato),
    )
    .input('Settore', facts.atecoSezione ?? 'da rilevare in intervista')
    .note(
      'Il massimale va commisurato al danno massimo ipotizzabile, non alla sinistrosità storica: ' +
        'un solo evento con lesioni gravi a più persone esaurisce un massimale da 1 M€.',
    )
    .confidence(facts.fatturato === null ? 'bassa' : 'media')
    .value(massimale);
}

function calcolaMassimaleRco(facts: CompanyFacts): Explained<Euro> {
  const builder = explain('Massimale consigliato — RCO per persona').reference(
    'D.P.R. 1124/1965 · danno differenziale e biologico',
  );

  const elevato = settorePericoloso(facts) || (facts.addetti !== null && facts.addetti > 50);
  const massimale = Money.euro(elevato ? 2_500_000 : 1_500_000);

  return builder
    .formula('Benchmark per persona, elevato nei settori ad alta incidenza infortunistica')
    .input('Addetti', facts.addetti === null ? 'da rilevare in intervista' : String(facts.addetti))
    .input(
      'Costo del personale',
      facts.costoDelPersonale === null
        ? 'da rilevare in intervista'
        : Money.formatCompact(facts.costoDelPersonale),
    )
    .note(
      'Il massimale che conta è quello **per persona**: le condanne per infortunio grave con danno ' +
        'differenziale superano regolarmente il milione di euro per singolo lavoratore.',
    )
    .note('Verificare l’estensione alle malattie professionali, spesso esclusa dalla garanzia base.')
    .confidence(facts.addetti === null ? 'bassa' : 'media')
    .value(massimale);
}

function calcolaMassimaleRcProdotti(facts: CompanyFacts): Explained<Euro | null> {
  const builder = explain('Massimale consigliato — RC Prodotti');

  const produce =
    facts.produceBeniFinali === true || facts.atecoSezione === 'C' || facts.atecoSezione === 'G';
  if (!produce) {
    return builder
      .note('Attività senza immissione di prodotti sul mercato: garanzia non pertinente.')
      .confidence('media')
      .value(null);
  }

  let indice = massimaleDaFatturato(facts.fatturato);
  if (facts.esportaUsaCanada === true) {
    indice += 2;
    builder.note(
      'Esportazione verso USA e Canada: regime risarcitorio con danni punitivi e costi di difesa ' +
        'incomparabili con quelli europei. Massimale elevato di due gradini ed estensione territoriale obbligatoria.',
    );
  } else if (facts.quotaExport !== null && facts.quotaExport > 0.3) {
    indice += 1;
    builder.note('Export superiore al 30%: esposizione a ordinamenti e fori esteri.');
  }

  return builder
    .formula('Benchmark per classe di fatturato, elevato in funzione dei mercati di destinazione')
    .input(
      'Fatturato',
      facts.fatturato === null ? 'da rilevare in intervista' : Money.formatCompact(facts.fatturato),
    )
    .input(
      'Export',
      facts.quotaExport === null
        ? 'da rilevare in intervista'
        : `${formatNumber(facts.quotaExport * 100, 0)}%`,
    )
    .note('Valutare l’estensione alle spese di ritiro prodotti (recall), esclusa dalla garanzia base.')
    .confidence(facts.fatturato === null ? 'bassa' : 'media')
    .value(scala(indice));
}

function calcolaMassimaleDandO(facts: CompanyFacts): Explained<Euro | null> {
  /*
    La norma si sceglie sulla forma giuridica, non si scrive una volta per tutte.

    Qui c'era «Artt. 2392-2395 c.c.» fisso: sono le norme della S.p.A., citate a ogni
    S.r.l. — cioè alla quasi totalità del portafoglio di un intermediario italiano.
  */
  const norma = normaResponsabilitaAmministratori(facts.formaGiuridica);
  const builder = explain('Massimale consigliato — D&O');
  if (norma !== null) builder.reference(norma);

  if (!haOrganoAmministrativo(facts.formaGiuridica)) {
    return builder
      .note(
        'Forma giuridica priva di organo amministrativo distinto dalla proprietà: garanzia non pertinente.',
      )
      .confidence('alta')
      .value(null);
  }

  const attivo = facts.totaleAttivo === null ? null : Money.toEuro(facts.totaleAttivo);
  const massimale =
    attivo === null
      ? Money.euro(1_000_000)
      : attivo < 2_000_000
        ? Money.euro(500_000)
        : attivo < 10_000_000
          ? Money.euro(1_000_000)
          : attivo < 50_000_000
            ? Money.euro(2_500_000)
            : Money.euro(5_000_000);

  return (
    builder
      .formula('Benchmark per classe di totale attivo')
      .input(
        'Totale attivo',
        facts.totaleAttivo === null ? 'da rilevare in intervista' : Money.formatCompact(facts.totaleAttivo),
      )
      /*
      «0» non è un conteggio, è un'assenza.

      Le cariche arrivano solo con il profilo completo: sotto quel livello l'elenco è
      vuoto perché nessuno le ha comprate, non perché la società non abbia
      amministratori. Stampare «Amministratori in carica: 0» dentro il ragionamento sul
      massimale D&O di un documento di adeguatezza afferma una cosa impossibile su una
      società attiva, e lo faceva su ogni analisi non approfondita.
    */
      .input(
        'Amministratori in carica',
        facts.numeroAmministratori === null
          ? 'non acquisiti: li porta il profilo completo'
          : String(facts.numeroAmministratori),
      )
      .note(
        'In caso di liquidazione giudiziale l’azione di responsabilità è esercitata dal curatore ' +
          '(art. 255 CCII): il massimale va rapportato al passivo potenziale, non al compenso dell’organo.',
      )
      /*
      L'art. 2497 c.c. grava su chi ESERCITA la direzione, a tutela dei soci e dei
      creditori della società diretta. Con un solo booleano per entrambe le posizioni,
      il prodotto diceva alla controllata — cioè alla parte che la norma protegge — di
      esserne responsabile.
    */
      .noteIf(
        facts.esercitaDirezioneECoordinamento,
        'La società esercita direzione e coordinamento: risponde verso i soci e i creditori delle società ' +
          'dirette (art. 2497 c.c.). Verificare che la D&O comprenda questa responsabilità e gli incarichi ' +
          'ricoperti nelle controllate.',
      )
      .noteIf(
        facts.soggettaADirezioneECoordinamento,
        'La società è soggetta a direzione e coordinamento: verificare se esiste una D&O di gruppo che la ' +
          'comprenda, e se copre gli amministratori per il concorso nel fatto lesivo (art. 2497, c. 2, c.c.).',
      )
      .confidence(facts.totaleAttivo === null ? 'bassa' : 'media')
      .value(massimale)
  );
}

function calcolaMassimaleCyber(facts: CompanyFacts): Explained<Euro> {
  const builder = explain('Massimale consigliato — Cyber').reference('Reg. UE 2016/679 · D.Lgs. 138/2024');

  const fatturato = facts.fatturato === null ? null : Money.toEuro(facts.fatturato);
  let massimale =
    fatturato === null
      ? Money.euro(500_000)
      : fatturato < 1_000_000
        ? Money.euro(250_000)
        : fatturato < 5_000_000
          ? Money.euro(500_000)
          : fatturato < 20_000_000
            ? Money.euro(1_000_000)
            : fatturato < 50_000_000
              ? Money.euro(2_500_000)
              : Money.euro(5_000_000);

  if (facts.trattaDatiParticolari === true || facts.haEcommerce === true) {
    massimale = Money.multiply(massimale, 2);
    builder.note(
      'Trattamento di categorie particolari di dati o canale e-commerce attivo: esposizione sanzionatoria ' +
        'e risarcitoria raddoppiata.',
    );
  }

  return builder
    .formula('Benchmark per classe di fatturato, raddoppiato in presenza di dati particolari o e-commerce')
    .input(
      'Fatturato',
      facts.fatturato === null ? 'da rilevare in intervista' : Money.formatCompact(facts.fatturato),
    )
    .input(
      'Margine mensile a rischio di fermo',
      facts.margineDiContribuzione === null
        ? 'da rilevare in intervista'
        : Money.formatCompact(Money.divide(facts.margineDiContribuzione, 12)),
    )
    .note(
      'Il massimale deve coprire tre voci distinte: ripristino dei sistemi, perdita di margine per il ' +
        'fermo operativo e responsabilità verso gli interessati.',
    )
    .note(
      'Verificare i requisiti minimi di sicurezza imposti dalla compagnia: la loro assenza è causa di decadenza.',
    )
    .confidence(facts.fatturato === null ? 'bassa' : 'media')
    .value(massimale);
}

function calcolaFidoClienti(facts: CompanyFacts): Explained<Euro | null> {
  const builder = explain('Esposizione creditizia da assicurare');

  if (facts.creditiVersoClienti === null) {
    return builder
      .note('Crediti verso clienti non disponibili: richiedono il bilancio in schema dettagliato.')
      .confidence('bassa')
      .value<Euro | null>(null);
  }
  if (!Money.isPositive(facts.creditiVersoClienti)) {
    return builder
      .note('Nessun credito commerciale a bilancio.')
      .confidence('media')
      .value<Euro | null>(ZERO);
  }

  return builder
    .formula('Crediti verso clienti a bilancio')
    .input('Crediti verso clienti', Money.formatCompact(facts.creditiVersoClienti))
    .input(
      'Incidenza sul patrimonio netto',
      facts.patrimonioNetto === null || !Money.isPositive(facts.patrimonioNetto)
        ? 'da rilevare in intervista'
        : `${formatNumber((Money.toEuro(facts.creditiVersoClienti) / Money.toEuro(facts.patrimonioNetto)) * 100, 0)}%`,
    )
    .note('Il capitale va dimensionato sul monte fidi prospettico, non sul saldo di fine esercizio.')
    .confidence('media')
    .value(facts.creditiVersoClienti);
}

// ── Base CAT NAT ─────────────────────────────────────────────────────────────

function calcolaBaseCatNat(
  fabbricati: Explained<Euro | null>,
  contenuto: Explained<Euro | null>,
): Explained<Euro | null> {
  const noti = [fabbricati.value, contenuto.value].filter((v): v is Euro => v !== null);

  return explain('Base assicurabile CAT NAT')
    .formula('Terreni e fabbricati + Impianti e macchinari + Attrezzature industriali e commerciali')
    .reference('Art. 2424 c.c., attivo B-II, numeri 1, 2 e 3 · L. 213/2023 · DM 18/2025')
    .input('Fabbricati', formattaOppureIgnoto(fabbricati.value))
    .input('Impianti, macchinari e attrezzature', formattaOppureIgnoto(contenuto.value))
    .note('Le rimanenze non rientrano nell’obbligo di legge, pur essendo assicurabili separatamente.')
    .noteIf(
      noti.length === 0,
      'Capitale non quantificabile con i dati disponibili. L’obbligo di legge sussiste comunque: ' +
        'rilevare il valore dei beni prima di procedere alla quotazione.',
    )
    .inheritConfidence(fabbricati.confidence, contenuto.confidence)
    .value<Euro | null>(noti.length === 0 ? null : Money.add(...noti));
}
