/**
 * Indicatori e qualifiche già calcolati dall'archivio camerale.
 *
 * Il profilo completo (`IT-full`) restituisce, oltre alle voci di bilancio, **quarantotto
 * indicatori economico-finanziari già elaborati** e una serie di qualifiche d'impresa. Per
 * un periodo il prodotto ne leggeva la metà: si pagavano quarantotto centesimi e se ne
 * usava una parte, buttando via proprio ciò che a un assicuratore serve di più.
 *
 * Perché ciascun gruppo conta, per chi vende coperture e non solo credito:
 *
 *  - **redditività e risultati operativi** — un'impresa che perde soldi non compra polizze
 *    nuove e disdice quelle che ha: è il primo indicatore di tenuta del rapporto;
 *  - **solidità, liquidità, indebitamento, copertura** — misurano se un sinistro non
 *    assicurato la manda fuori mercato, che è il cuore della quantificazione del rischio;
 *  - **ciclo finanziario** — giorni di incasso e di pagamento: dicono quanto capitale
 *    circolante è esposto e per quanto tempo;
 *  - **gare pubbliche** — chi partecipa e vince appalti ha bisogno di cauzioni e
 *    fideiussioni, che sono un ramo assicurativo a sé;
 *  - **certificazione SOA** — qualifica per i lavori pubblici: apre lo stesso ramo e
 *    identifica un profilo di rischio da cantiere;
 *  - **import/export** — espone a rischio di credito estero, trasporto merci, rischio
 *    politico e valutario: tre coperture che nessuno propone se non sa che c'è export;
 *  - **statistiche del personale** — la composizione dei contratti pesa su RC lavoratori,
 *    infortuni e TFR;
 *  - **PMI innovativa, start-up, impresa artigiana** — cambiano obblighi e agevolazioni,
 *    e distinguono profili di rischio che l'ATECO da solo confonde.
 *
 * Ogni campo è opzionale e vale `null` quando l'archivio non lo porta: **mai zero**. Uno
 * zero su un indice di redditività è un'affermazione forte e quasi sempre falsa, e su una
 * proposta assicurativa porterebbe a conclusioni sbagliate.
 */

/** Redditività: quanto rende il capitale investito e la gestione caratteristica. */
export interface Redditivita {
  /** Return on equity: utile sul patrimonio netto. */
  readonly roe: number | null;
  /** Return on investment: risultato operativo sul capitale investito. */
  readonly roi: number | null;
  /** Return on sales: margine operativo sulle vendite. */
  readonly ros: number | null;
  /** Return on assets in forma monetaria. */
  readonly roaMonetario: number | null;
  /** Quanto del risultato dipende da poste straordinarie invece che dal mestiere. */
  readonly incidenzaGestioneStraordinaria: number | null;
}

/** Risultati operativi dell'ultimo esercizio e di due esercizi prima, per il trend. */
export interface RisultatiOperativi {
  readonly cashFlow: number | null;
  readonly ebit: number | null;
  readonly ebitda: number | null;
  readonly cashFlowDueEserciziPrima: number | null;
  readonly ebitDueEserciziPrima: number | null;
  readonly ebitdaDueEserciziPrima: number | null;
}

/** Solidità patrimoniale: regge un colpo, o basta un sinistro a farla cadere? */
export interface Solidita {
  readonly acidTest: number | null;
  readonly currentRatio: number | null;
  readonly coperturaCapitaleCircolante: number | null;
  readonly tassoCoperturaImmobilizzazioni: number | null;
  readonly margineDiStruttura: number | null;
  readonly indiceMargineDiStruttura: number | null;
  readonly margineDiStrutturaSecondario: number | null;
}

export interface Indebitamento {
  readonly rapportoDebitoBancario: number | null;
  readonly gradoDiCapitalizzazione: number | null;
  readonly debitoBancarioSuTotaleAttivo: number | null;
  readonly debtRatio: number | null;
  readonly leva: number | null;
}

export interface Liquidita {
  readonly cassaSuDebitiBancariBreve: number | null;
  readonly cassaSuDebitiFinanziariBreve: number | null;
  readonly cassaSuDebitiTotaliBreve: number | null;
}

export interface LeveFinanziarie {
  readonly ebitdaLevaLorda: number | null;
  readonly ebitdaLevaNetta: number | null;
  readonly pfnSuEbitda: number | null;
}

/** Quante volte il margine copre gli interessi: sotto 1 gli oneri mangiano il risultato. */
export interface CoperturaOneri {
  readonly ebitdaSuInteressiLordi: number | null;
  readonly ebitdaSuInteressiNetti: number | null;
  readonly ebitSuInteressiLordi: number | null;
  readonly ebitSuInteressiNetti: number | null;
}

export interface StrutturaFinanziaria {
  readonly composizioneDebitoFinanziario: number | null;
  readonly debitoFinanziarioLordoSuPatrimonio: number | null;
  readonly debitoFinanziarioNettoSuPatrimonio: number | null;
  readonly pfnSuPatrimonio: number | null;
}

/** Giorni: quanto ci mette a incassare, a pagare, e quanto capitale resta esposto. */
export interface CicloFinanziario {
  readonly durataCreditiVersoClienti: number | null;
  readonly durataDebitiVersoFornitori: number | null;
  readonly durataCicloFinanziario: number | null;
  readonly durataScorte: number | null;
}

export interface OneriFinanziari {
  readonly indiceDiOnerosita: number | null;
  readonly rod: number | null;
  readonly rodFinanziario: number | null;
}

export interface Efficienza {
  readonly rotazioneCreditiVersoClienti: number | null;
  readonly indiceDiRotazione: number | null;
}

/** Variazioni percentuali rispetto all'esercizio precedente. */
export interface Sviluppo {
  readonly valoreAggiunto: number | null;
  readonly variazioneEbit: number | null;
  readonly debitoFinanziarioLordo: number | null;
  readonly mol: number | null;
  readonly valoreDellaProduzione: number | null;
  readonly totaleAttivo: number | null;
}

export interface KpiDiBilancio {
  readonly rotazioneDebiti: number | null;
  readonly oneriFinanziariSuEbitda: number | null;
  readonly rotazioneMagazzino: number | null;
  readonly marginePercentualeEbitda: number | null;
  readonly patrimonioSuTotaleAttivo: number | null;
}

/** Una tornata di gare pubbliche: partecipazioni, vittorie e valore aggiudicato. */
export interface GarePubbliche {
  readonly anno: number;
  readonly presentate: number | null;
  readonly vinte: number | null;
  readonly valoreEuro: number | null;
}

/** Composizione del personale, in percentuale sul totale degli addetti. */
export interface StatisticheAddetti {
  readonly impiegati: number | null;
  readonly tempoDeterminato: number | null;
  readonly tempoIndeterminato: number | null;
  readonly tempoPieno: number | null;
  readonly tempoParziale: number | null;
}

/**
 * Qualifiche e caratteristiche d'impresa.
 *
 * Sono i fatti che cambiano quali coperture servono, prima ancora di quanto costino.
 */
export interface QualificheImpresa {
  readonly haCertificazioneSoa: boolean | null;
  readonly esportatore: boolean | null;
  readonly importatore: boolean | null;
  readonly pmiInnovativa: boolean | null;
  readonly startUpInnovativa: boolean | null;
  readonly impresaArtigiana: boolean | null;
  readonly numeroUnitaLocali: number | null;
  readonly appartieneAGruppoIva: boolean | null;
  readonly capogruppoIva: boolean | null;
  readonly sitoWeb: string | null;
  readonly telefono: string | null;
  readonly fax: string | null;
  /** Classe dimensionale dichiarata dall'archivio (micro, piccola, media, grande). */
  readonly dimensioneImpresa: string | null;
  readonly fasciaDiFatturato: string | null;
  readonly andamentoFatturatoPercentuale: number | null;
  readonly annoFatturato: number | null;
  readonly atecoSecondario: string | null;
  readonly settoreRae: string | null;
  readonly settoreSae: string | null;
  /** Classificazione internazionale: serve ai riassicuratori e ai programmi esteri. */
  readonly codiceNace: string | null;
  readonly codiceSicPrimario: string | null;
  readonly codiceSicSecondario: string | null;
  /** Addetti dichiarati dall'archivio e loro variazione percentuale. */
  readonly addetti: number | null;
  readonly fasciaAddetti: string | null;
  readonly andamentoAddettiPercentuale: number | null;
  /** Costituzione: precede l'iscrizione al registro e l'inizio attività. */
  readonly dataCostituzione: Date | null;
  /** Controllanti o controllate all'estero: aprono il tema dei programmi internazionali. */
  readonly haControllantiEstere: boolean | null;
  readonly haControllateEstere: boolean | null;
  /** Recapiti ulteriori rispetto alla PEC. */
  readonly email: string | null;
  readonly codiceSdi: string | null;
  readonly presenteSuiSocial: boolean | null;
  /** Se l'impresa è commercializzabile secondo l'archivio (consensi marketing). */
  readonly commercializzabile: boolean | null;
  /** Ultimo aggiornamento del record camerale: dice quanto è fresco il dato. */
  readonly aggiornatoIl: Date | null;
}

/**
 * Tutto ciò che l'archivio calcola e qualifica, raccolto in un solo blocco.
 *
 * Ogni gruppo può essere `null` quando il servizio interrogato non lo restituisce:
 * l'anagrafica estesa porta solo una parte, il profilo completo li porta tutti.
 */
export interface IndicatoriFornitore {
  readonly redditivita: Redditivita | null;
  readonly risultatiOperativi: RisultatiOperativi | null;
  readonly solidita: Solidita | null;
  readonly indebitamento: Indebitamento | null;
  readonly liquidita: Liquidita | null;
  readonly leveFinanziarie: LeveFinanziarie | null;
  readonly coperturaOneri: CoperturaOneri | null;
  readonly strutturaFinanziaria: StrutturaFinanziaria | null;
  readonly cicloFinanziario: CicloFinanziario | null;
  readonly oneriFinanziari: OneriFinanziari | null;
  readonly efficienza: Efficienza | null;
  readonly sviluppo: Sviluppo | null;
  readonly kpi: KpiDiBilancio | null;
  readonly gare: readonly GarePubbliche[];
  readonly statisticheAddetti: StatisticheAddetti | null;
  readonly qualifiche: QualificheImpresa | null;
}

/** Blocco vuoto: nessun indicatore disponibile, e nessuno inventato. */
export const INDICATORI_FORNITORE_VUOTI: IndicatoriFornitore = {
  redditivita: null,
  risultatiOperativi: null,
  solidita: null,
  indebitamento: null,
  liquidita: null,
  leveFinanziarie: null,
  coperturaOneri: null,
  strutturaFinanziaria: null,
  cicloFinanziario: null,
  oneriFinanziari: null,
  efficienza: null,
  sviluppo: null,
  kpi: null,
  gare: [],
  statisticheAddetti: null,
  qualifiche: null,
};

/**
 * Se il blocco contiene almeno un dato.
 *
 * Serve a decidere se mostrare la sezione: una sezione con venti trattini comunica «il
 * software non funziona», mentre l'assenza di sezione comunica correttamente «questo
 * servizio non è stato acquistato».
 */
export function haIndicatori(indicatori: IndicatoriFornitore): boolean {
  return (
    indicatori.gare.length > 0 ||
    Object.entries(indicatori).some(
      ([chiave, valore]) => chiave !== 'gare' && valore !== null && haQualcheValore(valore),
    )
  );
}

function haQualcheValore(gruppo: unknown): boolean {
  return (
    typeof gruppo === 'object' &&
    gruppo !== null &&
    Object.values(gruppo).some((v) => v !== null && v !== undefined)
  );
}
