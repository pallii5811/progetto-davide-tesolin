/**
 * Indici di bilancio.
 *
 * Restituiscono `null` quando il denominatore è nullo o il calcolo non è significativo:
 * mostrare "0%" al posto di "non calcolabile" è un modo elegante per mentire al cliente.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { BilancioRiclassificato, BilancioSintetico } from './financials.js';
import type { IndicatoriFornitore } from './indicatori-fornitore.js';

export type IndicatorUnit = 'percentuale' | 'volte' | 'giorni';

export interface IndicatorMeta {
  readonly label: string;
  readonly formula: string;
  readonly unit: IndicatorUnit;
  /** Se `true`, valori alti sono positivi. Usato dalla UI per colorare e ordinare. */
  readonly higherIsBetter: boolean;
  readonly description: string;
}

export interface FinancialIndicators {
  // Redditività
  readonly roe: number | null;
  readonly roi: number | null;
  readonly ros: number | null;
  readonly ebitdaMargin: number | null;
  readonly valoreAggiuntoSuRicavi: number | null;
  // Liquidità
  readonly currentRatio: number | null;
  readonly quickRatio: number | null;
  // Struttura e solidità
  readonly indiceIndebitamento: number | null;
  readonly equityRatio: number | null;
  readonly coperturaImmobilizzazioni: number | null;
  // Sostenibilità del debito
  readonly pfnSuEbitda: number | null;
  readonly coperturaOneriFinanziari: number | null;
  readonly incidenzaOneriFinanziari: number | null;
  // Ciclo del circolante
  readonly dso: number | null;
  readonly dpo: number | null;
  readonly dio: number | null;
  readonly cicloCircolante: number | null;
  // Dinamica
  readonly crescitaRicavi: number | null;
  readonly crescitaEbitda: number | null;
  // Produttività
  readonly ricaviPerDipendente: number | null;
  readonly costoMedioDipendente: number | null;
}

export const INDICATOR_META: Readonly<Record<keyof FinancialIndicators, IndicatorMeta>> = {
  roe: {
    label: 'ROE',
    formula: 'Utile netto / Patrimonio netto',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Rendimento del capitale proprio investito dai soci.',
  },
  roi: {
    label: 'ROI',
    formula: 'EBIT / Totale attivo',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Redditività del capitale investito, indipendente dalla struttura finanziaria.',
  },
  ros: {
    label: 'ROS',
    formula: 'EBIT / Ricavi',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Marginalità operativa per euro di fatturato.',
  },
  ebitdaMargin: {
    label: 'EBITDA margin',
    formula: 'EBITDA / Valore della produzione',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Capacità di generare cassa dalla gestione caratteristica.',
  },
  valoreAggiuntoSuRicavi: {
    label: 'Valore aggiunto su ricavi',
    formula: 'Valore aggiunto / Valore della produzione',
    unit: 'percentuale',
    higherIsBetter: true,
    description: "Quota di valore trattenuta internamente rispetto a quella acquistata all'esterno.",
  },
  currentRatio: {
    label: 'Current ratio',
    formula: 'Attivo corrente / Passivo corrente',
    unit: 'volte',
    higherIsBetter: true,
    description: 'Copertura degli impegni a breve con le attività a breve. Riferimento: > 1,5.',
  },
  quickRatio: {
    label: 'Quick ratio',
    formula: '(Liquidità immediate + differite) / Passivo corrente',
    unit: 'volte',
    higherIsBetter: true,
    description: 'Come il current ratio, ma senza contare sul magazzino. Riferimento: > 1,0.',
  },
  indiceIndebitamento: {
    label: 'Indice di indebitamento',
    formula: 'Totale debiti / Patrimonio netto',
    unit: 'volte',
    higherIsBetter: false,
    description: 'Quanti euro di debito gravano su ogni euro di mezzi propri. Riferimento: < 3.',
  },
  equityRatio: {
    label: 'Equity ratio',
    formula: 'Patrimonio netto / Totale attivo',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Quota dell’attivo finanziata con mezzi propri. Riferimento: > 25%.',
  },
  coperturaImmobilizzazioni: {
    label: 'Copertura delle immobilizzazioni',
    formula: '(Patrimonio netto + Passivo consolidato) / Attivo immobilizzato',
    unit: 'volte',
    higherIsBetter: true,
    description:
      'Gli investimenti durevoli dovrebbero essere finanziati da fonti durevoli. Riferimento: > 1.',
  },
  pfnSuEbitda: {
    label: 'PFN / EBITDA',
    formula: 'Posizione finanziaria netta / EBITDA',
    unit: 'volte',
    higherIsBetter: false,
    description: 'Anni di flusso operativo necessari a estinguere il debito netto. Riferimento: < 3.',
  },
  coperturaOneriFinanziari: {
    label: 'Copertura oneri finanziari',
    formula: 'EBIT / Oneri finanziari',
    unit: 'volte',
    higherIsBetter: true,
    description: 'Quante volte il reddito operativo copre gli interessi. Riferimento: > 3.',
  },
  incidenzaOneriFinanziari: {
    label: 'Incidenza oneri finanziari',
    formula: 'Oneri finanziari / Ricavi',
    unit: 'percentuale',
    higherIsBetter: false,
    description: 'Peso del costo del debito sul fatturato. Soglia di attenzione: > 3%.',
  },
  dso: {
    label: 'DSO — giorni di incasso',
    formula: '(Crediti verso clienti / Ricavi) × 365',
    unit: 'giorni',
    higherIsBetter: false,
    description: 'Tempo medio di incasso dai clienti.',
  },
  dpo: {
    label: 'DPO — giorni di pagamento',
    formula: '(Debiti verso fornitori / Costi esterni) × 365',
    unit: 'giorni',
    higherIsBetter: true,
    description: 'Tempo medio di pagamento ai fornitori.',
  },
  dio: {
    label: 'DIO — giorni di magazzino',
    formula: '(Rimanenze / Costi esterni) × 365',
    unit: 'giorni',
    higherIsBetter: false,
    description: 'Tempo medio di giacenza delle scorte.',
  },
  cicloCircolante: {
    label: 'Ciclo del circolante',
    formula: 'DSO + DIO − DPO',
    unit: 'giorni',
    higherIsBetter: false,
    description: 'Giorni di cassa assorbiti dal capitale circolante.',
  },
  crescitaRicavi: {
    label: 'Crescita dei ricavi',
    formula: '(Ricavi anno / Ricavi anno precedente) − 1',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Variazione del fatturato rispetto all’esercizio precedente.',
  },
  crescitaEbitda: {
    label: 'Crescita EBITDA',
    formula: '(EBITDA anno / EBITDA anno precedente) − 1',
    unit: 'percentuale',
    higherIsBetter: true,
    description: 'Variazione della marginalità operativa lorda.',
  },
  ricaviPerDipendente: {
    label: 'Ricavi per dipendente',
    formula: 'Ricavi / Numero dipendenti',
    unit: 'volte',
    higherIsBetter: true,
    description: 'Produttività del lavoro, espressa in euro di fatturato per addetto.',
  },
  costoMedioDipendente: {
    label: 'Costo medio per dipendente',
    formula: 'Costo del personale / Numero dipendenti',
    unit: 'volte',
    higherIsBetter: false,
    description: 'Costo aziendale medio per addetto. Base per il massimale RCO.',
  },
};

const GIORNI_ANNO = 365;

export function computeIndicators(
  current: BilancioRiclassificato,
  previous?: BilancioRiclassificato,
): FinancialIndicators {
  const { sp, ce } = current;
  const dipendenti = current.numeroDipendenti;

  const dso = ratioDays(Money.ratio(sp.liquiditaDifferite, ce.ricavi));
  const dpo = ratioDays(Money.ratio(sp.debitiCommerciali, ce.costiEsterni));
  const dio = ratioDays(Money.ratio(sp.rimanenze, ce.costiEsterni));

  return {
    roe: Money.isPositive(sp.patrimonioNetto) ? Money.ratio(ce.utileNetto, sp.patrimonioNetto) : null,
    roi: Money.ratio(ce.ebit, sp.totaleAttivo),
    ros: Money.ratio(ce.ebit, ce.ricavi),
    ebitdaMargin: Money.ratio(ce.ebitda, ce.valoreDellaProduzione),
    valoreAggiuntoSuRicavi: Money.ratio(ce.valoreAggiunto, ce.valoreDellaProduzione),

    currentRatio: Money.ratio(sp.attivoCorrente, sp.passivoCorrente),
    quickRatio: Money.ratio(Money.add(sp.liquiditaImmediate, sp.liquiditaDifferite), sp.passivoCorrente),

    indiceIndebitamento: Money.isPositive(sp.patrimonioNetto)
      ? Money.ratio(sp.totaleDebiti, sp.patrimonioNetto)
      : null,
    equityRatio: Money.ratio(sp.patrimonioNetto, sp.totaleAttivo),
    coperturaImmobilizzazioni: Money.isPositive(sp.attivoImmobilizzato)
      ? Money.ratio(Money.add(sp.patrimonioNetto, sp.passivoConsolidato), sp.attivoImmobilizzato)
      : null,

    // Se l'EBITDA non è positivo il rapporto perde significato economico.
    pfnSuEbitda: Money.isPositive(ce.ebitda) ? Money.ratio(sp.posizioneFinanziariaNetta, ce.ebitda) : null,
    coperturaOneriFinanziari: Money.isPositive(ce.oneriFinanziari)
      ? Money.ratio(ce.ebit, ce.oneriFinanziari)
      : null,
    incidenzaOneriFinanziari: Money.ratio(ce.oneriFinanziari, ce.ricavi),

    dso,
    dpo,
    dio,
    cicloCircolante: dso !== null && dpo !== null && dio !== null ? dso + dio - dpo : null,

    crescitaRicavi: previous !== undefined ? growth(current.ce.ricavi, previous.ce.ricavi) : null,
    crescitaEbitda: previous !== undefined ? growth(current.ce.ebitda, previous.ce.ebitda) : null,

    ricaviPerDipendente:
      dipendenti !== null && dipendenti > 0 ? Money.toEuro(ce.ricavi) / dipendenti : null,
    costoMedioDipendente:
      dipendenti !== null && dipendenti > 0 ? Money.toEuro(ce.costoDelPersonale) / dipendenti : null,
  };
}

/**
 * Indici ricavabili dal solo bilancio sintetico.
 *
 * Restituisce la stessa struttura, con `null` su tutto ciò che gli aggregati non
 * consentono di calcolare. Non è una scorciatoia: il motore di scoring rinormalizza
 * i pesi sui soli fattori valutabili, quindi un'analisi su dati sintetici produce un
 * punteggio corretto — semplicemente meno informato, e lo dichiara con la confidenza.
 */
export function indicatorsFromSintetico(
  corrente: BilancioSintetico,
  precedente?: BilancioSintetico,
): FinancialIndicators {
  const { patrimonioNetto, totaleAttivo, fatturato, costoDelPersonale, dipendenti } = corrente;

  const equityRatio =
    patrimonioNetto === null || totaleAttivo === null ? null : Money.ratio(patrimonioNetto, totaleAttivo);

  // Il totale dei debiti non è dato: si ricava per differenza dall'identità di bilancio
  // (Attivo = Passivo + Patrimonio netto), che è vera per costruzione.
  const indiceIndebitamento =
    patrimonioNetto === null || totaleAttivo === null || !Money.isPositive(patrimonioNetto)
      ? null
      : Money.ratio(
          Money.max(Money.euro(0), Money.subtract(totaleAttivo, patrimonioNetto)),
          patrimonioNetto,
        );

  return {
    roe: null,
    roi: null,
    ros: null,
    ebitdaMargin: null,
    valoreAggiuntoSuRicavi: null,
    currentRatio: null,
    quickRatio: null,
    indiceIndebitamento,
    equityRatio,
    coperturaImmobilizzazioni: null,
    pfnSuEbitda: null,
    coperturaOneriFinanziari: null,
    incidenzaOneriFinanziari: null,
    dso: null,
    dpo: null,
    dio: null,
    cicloCircolante: null,
    crescitaRicavi:
      precedente?.fatturato != null && fatturato != null ? growth(fatturato, precedente.fatturato) : null,
    crescitaEbitda: null,
    ricaviPerDipendente:
      fatturato !== null && dipendenti !== null && dipendenti > 0
        ? Money.toEuro(fatturato) / dipendenti
        : null,
    costoMedioDipendente:
      costoDelPersonale !== null && dipendenti !== null && dipendenti > 0
        ? Money.toEuro(costoDelPersonale) / dipendenti
        : null,
  };
}

function ratioDays(value: number | null): number | null {
  return value === null ? null : Math.round(value * GIORNI_ANNO);
}

function growth(current: Euro, previous: Euro): number | null {
  if (!Money.isPositive(previous)) return null;
  return current / previous - 1;
}

/** Formattazione it-IT coerente con l'unità di misura dell'indice. */
export function formatIndicator(key: keyof FinancialIndicators, value: number | null): string {
  if (value === null) return 'da rilevare in intervista';
  const unit = INDICATOR_META[key].unit;
  switch (unit) {
    case 'percentuale':
      return new Intl.NumberFormat('it-IT', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    case 'volte':
      return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value)}×`;
    case 'giorni':
      return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(value)} gg`;
  }
}

/**
 * Gli indici che il Registro Imprese ha già calcolato, letti nella forma canonica.
 *
 * PERCHÉ ESISTE. L'anagrafica estesa porta con sé una ventina di indici elaborati dal
 * registro sul bilancio depositato: current ratio, acid test, PFN su EBITDA, copertura
 * degli oneri, le quattro durate del circolante. Sono pagati e vengono mostrati a
 * schermo. Il motore del credito non li ha mai visti: senza lo schema CEE dettagliato —
 * che nessuno compra, perché il servizio dedicato costa cinque euro ed è dichiarato non
 * verificato — quattro fattori su sette uscivano «non valutabile».
 *
 * Il risultato, misurato su un'impresa reale: liquidità, sostenibilità del debito e
 * Altman dichiarati non calcolabili, e venti centimetri più su, nella stessa pagina,
 * «PFN su EBITDA 9,53» e «EBITDA su interessi lordi 2,5». Il dato era a schermo e il
 * motore diceva di non averlo.
 *
 * COSA NON SI MAPPA, E PERCHÉ. Un indice non è lo stesso indice perché ha lo stesso
 * nome — è la regola 2m del progetto, e qui costava caro in due punti:
 *
 *  - `ros` del registro vale 4,32 % sull'impresa provata, mentre EBIT / ricavi con i
 *    valori stampati accanto dà 4,73 %: il denominatore è il valore della produzione,
 *    non i ricavi. Sono due indici diversi.
 *  - `roi` è calcolato sul capitale investito netto: su un'impresa con la posizione
 *    finanziaria più negativa del patrimonio esce −323 % accanto a un ROA di +44 %.
 *  - `indiceIndebitamento` avrebbe due candidati — `leva` e `debtRatio` — che sul
 *    campione valgono 7,31 e 5,99. Nessuna documentazione dice quale sia
 *    debiti / patrimonio netto, e sceglierne uno a caso è indovinare.
 *
 * Quelli restano `null`: un buco dichiarato si vede, un indice sbagliato no.
 *
 * COSA SI MAPPA, E CON QUALE PROVA. Le durate del circolante non si assumono, si
 * verificano: sull'impresa provata crediti 144 gg + scorte 264 gg − fornitori 94,48 gg
 * fa 313,52, e il ciclo finanziario dichiarato dal registro è 313. L'identità chiude, e
 * questo prova che i quattro campi hanno la definizione standard.
 *
 * Attenzione a `coperturaOneriFinanziari`, che è la trappola meglio nascosta: la formula
 * della piattaforma è **EBIT** su oneri finanziari, e il registro espone entrambe le
 * varianti — 2,5 con l'EBITDA e 1,36 con l'EBIT. Prendere quella che somiglia di più al
 * nome avrebbe gonfiato il fattore dell'ottantaquattro per cento, in silenzio.
 */
/**
 * Da punti percentuali dell'archivio a rapporto della piattaforma.
 *
 * L'archivio pubblica ROE e margine EBITDA in punti — `1.18` sta per l'1,18 %, e la scheda
 * infatti li stampa con il segno di percentuale accanto. `FinancialIndicators` li tiene
 * come rapporti: il formattatore usa `style: 'percent'`, che moltiplica per cento, e i
 * punti di interpolazione dello score sono scritti in rapporto — 0,05 · 0,10 · 0,18.
 *
 * Passarli senza convertire non dà errore, e sono due danni diversi:
 *
 *   ROE           stampato «118,0 %» su un'impresa che rende l'1,18 %
 *   margine EBITDA fattore redditività a 100/100 su un'impresa che margina l'8 %
 *
 * Il secondo è il peggiore: un fattore su sette gonfiato in silenzio, su un punteggio che
 * decide quanto credito l'intermediario consiglia di concedere.
 *
 * Il grado di capitalizzazione e il tasso di copertura delle immobilizzazioni **non**
 * passano di qui: l'archivio li pubblica già come rapporti — 0,14 e 3,05 — ed è la ragione
 * per cui la scheda li stampa senza il segno di percentuale. La distinzione non si deduce
 * dal nome del campo, si legge da come l'archivio scrive il valore.
 */
function daPercentuale(valore: number | null | undefined): number | null {
  return valore === null || valore === undefined ? null : valore / 100;
}

export function indicatoriDaArchivio(fornitore: IndicatoriFornitore): FinancialIndicators | null {
  const red = fornitore.redditivita;
  const sol = fornitore.solidita;
  const ind = fornitore.indebitamento;
  const lev = fornitore.leveFinanziarie;
  const cop = fornitore.coperturaOneri;
  const cic = fornitore.cicloFinanziario;
  const kpi = fornitore.kpi;

  const indicatori: FinancialIndicators = {
    // Redditività: il ROE, che è utile netto su patrimonio netto ovunque, e il margine
    // EBITDA, il cui denominatore si è provato essere lo stesso della piattaforma.
    roe: daPercentuale(red?.roe),
    roi: null,
    ros: null,
    /*
      `marginePercentualeEbitda` è EBITDA su valore della produzione, come qui.

      Non si assume dal nome — è la regola che questo file applica ovunque — si prova
      dall'identità, sui numeri dell'impresa provata: il margine vale 7,94 % e l'EBITDA
      343.989 €, quindi il denominatore è 4.332.355 €. I ricavi sono 3.959.368 €: non è
      quello. E il ROS dichiarato dallo stesso archivio, 4,32 %, moltiplicato per quel
      denominatore restituisce esattamente l'EBIT stampato accanto, 187.148 €.

      Due indici indipendenti che chiudono sullo stesso valore della produzione: il
      denominatore è quello, ed è `ce.valoreDellaProduzione` della piattaforma.

      Costava un fattore intero. La scheda mostrava «Margine EBITDA 7,94 %» e, più in
      basso, «Redditività · peso 14 % · non valutabile — EBITDA margin: da rilevare in
      intervista». Il dato era comprato, era a schermo, e il quattordici per cento del
      punteggio di merito veniva buttato.
    */
    ebitdaMargin: daPercentuale(kpi?.marginePercentualeEbitda),
    valoreAggiuntoSuRicavi: null,

    // Liquidità: acid test è il nome alternativo del quick ratio, stessa formula.
    currentRatio: sol?.currentRatio ?? null,
    quickRatio: sol?.acidTest ?? null,

    // Struttura: il grado di capitalizzazione è patrimonio netto su totale attivo, ed è
    // lo stesso numero che il prodotto stampa altrove come «patrimonio su totale attivo».
    indiceIndebitamento: null,
    equityRatio: ind?.gradoDiCapitalizzazione ?? null,
    /*
      Qui l'archivio offre DUE candidati, e prenderne uno a caso sarebbe il difetto che
      questo file esiste per evitare:

        indiceMargineDiStruttura        1,39   patrimonio netto / immobilizzazioni
        tassoCoperturaImmobilizzazioni  3,05   (patrimonio netto + passivo consolidato)
                                               / immobilizzazioni

      La piattaforma calcola il secondo. E si prova, non si sceglie: dal margine di
      struttura (200.484 €) e dal patrimonio netto (719.768 €) le immobilizzazioni sono
      519.284 €; il margine di struttura secondario dichiarato, 1.065.706 €, porta le
      fonti durevoli a 1.584.990 €, e il loro rapporto fa 3,052 — cioè il 3,05
      dell'archivio. L'altro candidato, 719.768 / 519.284, fa 1,386: è l'indice primario,
      e usarlo avrebbe dimezzato il fattore in silenzio.
    */
    coperturaImmobilizzazioni: sol?.tassoCoperturaImmobilizzazioni ?? null,

    // Sostenibilità del debito: EBIT sugli interessi, non EBITDA.
    pfnSuEbitda: lev?.pfnSuEbitda ?? null,
    coperturaOneriFinanziari: cop?.ebitSuInteressiLordi ?? null,
    incidenzaOneriFinanziari: null,

    // Ciclo del circolante: le quattro durate, verificate dall'identità del ciclo.
    dso: cic?.durataCreditiVersoClienti ?? null,
    dpo: cic?.durataDebitiVersoFornitori ?? null,
    dio: cic?.durataScorte ?? null,
    cicloCircolante: cic?.durataCicloFinanziario ?? null,

    crescitaRicavi: null,
    crescitaEbitda: null,
    ricaviPerDipendente: null,
    costoMedioDipendente: null,
  };

  /*
    Se non è arrivato nemmeno un indice, si restituisce `null` e non un oggetto di soli
    buchi: un oggetto pieno di null farebbe credere ai fattori di avere una fonte, e
    ciascuno di loro produrrebbe «non calcolabile» attribuendolo al registro invece che
    all'assenza del registro. Sono due frasi diverse per chi legge.
  */
  return Object.values(indicatori).some((v) => v !== null) ? indicatori : null;
}

/**
 * Due fonti di indici, unite campo per campo: la prima vince dove ha un valore.
 *
 * Non è una scelta fra le due, è un riempimento dei buchi. Gli aggregati sintetici e gli
 * indici del registro sono complementari e non alternativi: dai primi si ricava il
 * patrimonio su totale attivo, dai secondi il current ratio, e nessuna delle due fonti da
 * sola porta entrambi.
 *
 * La precedenza va alla prima perché è quella che il prodotto ha CALCOLATO, e di cui
 * quindi conosce la formula. Gli indici del registro arrivano già fatti: dove il prodotto
 * sa produrre il numero da sé preferisce il proprio, perché è l'unico di cui può stampare
 * il procedimento.
 */
export function unisciIndicatori(
  primaria: FinancialIndicators | null,
  secondaria: FinancialIndicators | null,
): FinancialIndicators | null {
  if (primaria === null) return secondaria;
  if (secondaria === null) return primaria;

  const chiavi = Object.keys(primaria) as (keyof FinancialIndicators)[];
  const unito = {} as Record<keyof FinancialIndicators, number | null>;
  for (const chiave of chiavi) unito[chiave] = primaria[chiave] ?? secondaria[chiave];
  return unito;
}
