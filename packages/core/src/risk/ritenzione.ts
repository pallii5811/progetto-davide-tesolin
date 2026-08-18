/**
 * Contesto e propensione al rischio: quanto l'impresa può e vuole tenersi.
 *
 * È il primo passo dell'ISO 31000 — la definizione del contesto — e l'unico che trasforma
 * il trattamento da calcolo a **decisione**. Senza, un motore che vede un rischio residuo
 * alto scrive «trasferire» per tutti, e propone a ogni impresa la stessa cosa: che è
 * esattamente la critica che si fa ai questionari standardizzati.
 *
 * Due grandezze distinte, e vanno tenute distinte:
 *
 *  - la **capacità** di ritenzione è oggettiva e si legge nel bilancio: quanto l'impresa
 *    può assorbire senza mettere in discussione la continuità;
 *  - la **propensione** è del titolare, si chiede e non si deduce. Un imprenditore prudente
 *    con mezzi solidi ha ogni diritto di assicurare tutto.
 *
 * Il valore per chi consiglia è concreto: una franchigia alzata fino alla soglia che
 * l'impresa regge riduce il premio senza spostare rischio reale, e la scelta risulta
 * **documentata** — che è ciò che il Reg. IVASS 40/2018 chiede e che quasi nessun documento
 * di adeguatezza contiene davvero.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import type { BilancioRiclassificato } from '../company/financials.js';

/** Dichiarata dal titolare in intervista. Non si deduce dai numeri. */
export type PropensioneAlRischio = 'prudente' | 'equilibrata' | 'incline-a-ritenere';

export interface CapacitaDiRitenzione {
  /** Perdita singola assorbibile senza mettere in discussione la continuità. */
  readonly perSinistro: Euro;
  /** Somma delle ritenzioni sopportabile nell'arco di un esercizio. */
  readonly annua: Euro;
  /** Franchigia consigliata, arrotondata a taglio commerciale. */
  readonly franchigiaConsigliata: Euro;
  /** Quale dei tre limiti ha deciso: è l'informazione che rende il numero discutibile. */
  readonly vincoloAttivo: 'patrimonio' | 'redditività' | 'liquidità';
  readonly propensione: PropensioneAlRischio;
  readonly effettoAtteso: string;
}

/**
 * Quote sui tre parametri.
 *
 * Nessuna delle tre è arbitraria: sono gli ordini di grandezza con cui si ragiona di
 * ritenzione nelle PMI. Il patrimonio dice quanto si può perdere una volta sola; l'EBITDA
 * quanto si può riassorbire in un esercizio; la liquidità immediata quanto si può pagare
 * **domani**, che è il momento in cui un sinistro chiede i soldi.
 */
const QUOTA_PATRIMONIO = 0.03;
const QUOTA_EBITDA = 0.1;
const QUOTA_LIQUIDITA = 0.15;

/** La propensione dichiarata modula la capacità, non la sostituisce. */
const MOLTIPLICATORE: Record<PropensioneAlRischio, number> = {
  prudente: 0.5,
  equilibrata: 1,
  'incline-a-ritenere': 2,
};

const DESCRIZIONE: Record<PropensioneAlRischio, string> = {
  prudente: 'Propensione prudente: si preferisce trasferire anche ciò che si potrebbe assorbire.',
  equilibrata: 'Propensione equilibrata: si ritiene ciò che l’impresa regge senza affanno.',
  'incline-a-ritenere':
    'Propensione a ritenere: si accettano franchigie elevate in cambio di un premio più basso.',
};

export function valutaRitenzione(
  bilancio: BilancioRiclassificato | null,
  propensioneDichiarata: PropensioneAlRischio | null,
): Explained<CapacitaDiRitenzione | null> {
  const costruttore = explain('Capacità di ritenzione')
    .reference('ISO 31000:2018 §6.3 — definizione del contesto e criteri di rischio')
    .reference('Reg. IVASS 40/2018 All. 4-ter — coerenza con richieste ed esigenze');

  if (bilancio === null) {
    return costruttore
      .note(
        'Senza bilancio riclassificato la capacità di ritenzione non è calcolabile: proporre una franchigia senza sapere cosa l’impresa regge sposterebbe il rischio sul cliente.',
      )
      .confidence('bassa')
      .value<CapacitaDiRitenzione | null>(null);
  }

  const patrimonio = Money.max(Money.ZERO, Money.multiply(bilancio.sp.patrimonioNetto, QUOTA_PATRIMONIO));
  const redditivita = Money.max(Money.ZERO, Money.multiply(bilancio.ce.ebitda, QUOTA_EBITDA));
  const liquidita = Money.max(Money.ZERO, Money.multiply(bilancio.sp.liquiditaImmediate, QUOTA_LIQUIDITA));

  // Il più stringente dei tre, come per il fido: la capacità è quella del vincolo peggiore,
  // non la media. Un'impresa redditizia ma senza cassa non paga un sinistro con l'EBITDA.
  const base = Money.min(patrimonio, redditivita, liquidita);
  const vincoloAttivo: CapacitaDiRitenzione['vincoloAttivo'] =
    base === liquidita ? 'liquidità' : base === redditivita ? 'redditività' : 'patrimonio';

  const propensione = propensioneDichiarata ?? 'prudente';
  const perSinistro = Money.multiply(base, MOLTIPLICATORE[propensione]);

  costruttore
    .formula('min(3% patrimonio netto, 10% EBITDA, 15% liquidità immediata) × propensione dichiarata')
    .input('3% del patrimonio netto', Money.format(patrimonio))
    .input('10% dell’EBITDA', Money.format(redditivita))
    .input('15% della liquidità immediata', Money.format(liquidita))
    .input('Vincolo più stringente', vincoloAttivo)
    .input('Propensione dichiarata', propensioneDichiarata ?? 'non dichiarata')
    .note(DESCRIZIONE[propensione])
    .noteIf(
      vincoloAttivo === 'liquidità',
      'Il limite è la cassa: un sinistro chiede i soldi subito, e utili o patrimonio non lo pagano al posto suo.',
    )
    .noteIf(
      propensioneDichiarata === null,
      'Propensione non dichiarata: si adotta l’ipotesi prudente. È una domanda di trenta secondi in intervista, e dimezza o raddoppia la franchigia proponibile.',
    )
    // Senza la domanda al titolare il numero resta un'ipotesi, e come tale va dichiarato:
    // una franchigia proposta su una propensione presunta non è documentazione di
    // adeguatezza, è un'assunzione travestita da consulenza.
    .confidence(propensioneDichiarata === null ? 'bassa' : 'alta');

  // Arrotondata per difetto: una franchigia arrotondata per eccesso farebbe trattenere
  // più di quanto l’impresa regge, che è l’errore opposto a quello della sottoassicurazione
  // ma con la stessa vittima.
  const franchigia = Money.commercialRound(perSinistro);

  return costruttore.value<CapacitaDiRitenzione | null>({
    perSinistro,
    // Su base annua si ammette un multiplo, non la somma illimitata: più sinistri nello
    // stesso esercizio si sommano, e la cassa è una sola.
    annua: Money.multiply(perSinistro, 2.5),
    franchigiaConsigliata: franchigia,
    vincoloAttivo,
    propensione,
    effettoAtteso: effettoAtteso(franchigia, propensione),
  });
}

function effettoAtteso(franchigia: Euro, propensione: PropensioneAlRischio): string {
  if (!Money.isPositive(franchigia)) {
    return (
      'I dati economici non lasciano margine di ritenzione: le franchigie vanno tenute al minimo, ' +
      'perché ogni euro trattenuto peserebbe sulla continuità.'
    );
  }

  const cornice =
    propensione === 'incline-a-ritenere'
      ? 'Coerente con la propensione dichiarata'
      : propensione === 'prudente'
        ? 'Anche con propensione prudente'
        : 'Coerente con la propensione dichiarata';

  return (
    `${cornice}, l’impresa può sostenere una franchigia fino a ${Money.formatCompact(franchigia)} per sinistro ` +
    'senza mettere in discussione la continuità. Alzare le franchigie fino a quella soglia riduce il ' +
    'premio senza spostare rischio reale: ciò che si trattiene è ciò che l’impresa avrebbe comunque ' +
    'assorbito. Sotto quella soglia il risparmio di premio non compensa il fastidio di gestire il sinistro; ' +
    'sopra, si trattiene qualcosa che l’impresa non regge.'
  );
}
