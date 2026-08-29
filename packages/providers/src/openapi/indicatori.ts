/**
 * Lettura degli indicatori e delle qualifiche dal profilo completo.
 *
 * L'archivio camerale li restituisce **già calcolati** dentro la risposta di `IT-full`:
 * quarantotto indici economico-finanziari, le gare pubbliche degli ultimi esercizi, la
 * composizione del personale e una serie di qualifiche d'impresa. Sono compresi nei
 * quarantotto centesimi del servizio, e per un periodo la metà di essi non veniva letta —
 * si pagava tutto e se ne usava una parte.
 *
 * Qui non si calcola nulla: si legge. Il calcolo proprio della piattaforma resta quello
 * riclassificato dai bilanci, che è indipendente e serve anche da controprova.
 *
 * Ogni valore assente resta `null` e mai zero: su un indice di redditività lo zero è
 * un'affermazione forte e quasi sempre falsa, e su una proposta assicurativa porta a
 * conclusioni sbagliate.
 */

import { INDICATORI_FORNITORE_VUOTI } from '@aegis/core';
import type {
  CicloFinanziario,
  CoperturaOneri,
  Efficienza,
  GarePubbliche,
  Indebitamento,
  IndicatoriFornitore,
  KpiDiBilancio,
  LeveFinanziarie,
  Liquidita,
  OneriFinanziari,
  QualificheImpresa,
  Redditivita,
  RisultatiOperativi,
  Solidita,
  StatisticheAddetti,
  StrutturaFinanziaria,
  Sviluppo,
} from '@aegis/core';
import { asArray, bool, num, pick, str } from './parse.js';

/**
 * Restituisce il gruppo solo se contiene almeno un valore.
 *
 * Un gruppo di soli `null` non è «un dato a zero»: è un dato che l'archivio non ha
 * restituito, e la differenza va conservata fino a schermo.
 */
function seValorizzato<T extends object>(gruppo: T): T | null {
  return Object.values(gruppo).some((v) => v !== null && v !== undefined) ? gruppo : null;
}

export function mappaIndicatoriFornitore(raw: unknown): IndicatoriFornitore {
  const dati: unknown = pick(raw, 'data') ?? raw;
  if (dati === null || typeof dati !== 'object') return INDICATORI_FORNITORE_VUOTI;

  return {
    redditivita: leggiRedditivita(pick(dati, 'profitability')),
    risultatiOperativi: leggiRisultatiOperativi(pick(dati, 'operatingResults')),
    solidita: leggiSolidita(pick(dati, 'financialStability')),
    indebitamento: leggiIndebitamento(pick(dati, 'indebtedness')),
    liquidita: leggiLiquidita(pick(dati, 'liquidityRatios')),
    leveFinanziarie: leggiLeve(pick(dati, 'leverageRatios')),
    coperturaOneri: leggiCopertura(pick(dati, 'coverageRatios')),
    strutturaFinanziaria: leggiStruttura(pick(dati, 'structureRatios')),
    cicloFinanziario: leggiCiclo(pick(dati, 'financialCycle')),
    oneriFinanziari: leggiOneri(pick(dati, 'financialBurden')),
    efficienza: leggiEfficienza(pick(dati, 'efficiency')),
    sviluppo: leggiSviluppo(pick(dati, 'development')),
    kpi: leggiKpi(pick(dati, 'financialStatementKpi')),
    gare: leggiGare(pick(dati, 'publicTenders')),
    statisticheAddetti: leggiAddetti(pick(dati, 'employeesStatistic')),
    qualifiche: leggiQualifiche(dati),
  };
}

function leggiRedditivita(g: unknown): Redditivita | null {
  return seValorizzato({
    roe: num(g, 'roe'),
    roi: num(g, 'roi'),
    ros: num(g, 'ros'),
    roaMonetario: num(g, 'roaMonetary'),
    incidenzaGestioneStraordinaria: num(g, 'incidenceOfExtraFeaturesManagement'),
  });
}

function leggiRisultatiOperativi(g: unknown): RisultatiOperativi | null {
  return seValorizzato({
    cashFlow: num(g, 'cashFlow'),
    ebit: num(g, 'ebit'),
    ebitda: num(g, 'ebitda'),
    // `L2Y` è «last two years»: il valore di due esercizi fa, che dà la direzione.
    cashFlowDueEserciziPrima: num(g, 'cashFlowL2Y'),
    ebitDueEserciziPrima: num(g, 'ebitL2Y'),
    ebitdaDueEserciziPrima: num(g, 'ebitdaL2Y'),
  });
}

function leggiSolidita(g: unknown): Solidita | null {
  return seValorizzato({
    acidTest: num(g, 'acidTest'),
    currentRatio: num(g, 'currentRatio'),
    coperturaCapitaleCircolante: num(g, 'workingCapitalCoverage'),
    tassoCoperturaImmobilizzazioni: num(g, 'fixedAssetsCoverageRate'),
    margineDiStruttura: num(g, 'marginStructureIndex'),
    indiceMargineDiStruttura: num(g, 'marginStructure'),
    // Il fornitore restituisce questa chiave **con uno spazio in coda**: letta senza,
    // il campo risultava sempre assente. Si accettano entrambe le grafie.
    margineDiStrutturaSecondario: num(g, 'secondaryMarginStructure ', 'secondaryMarginStructure'),
  });
}

function leggiIndebitamento(g: unknown): Indebitamento | null {
  return seValorizzato({
    rapportoDebitoBancario: num(g, 'bankDebtRatio'),
    gradoDiCapitalizzazione: num(g, 'capitalizationDegree'),
    debitoBancarioSuTotaleAttivo: num(g, 'bankDebtTotalAssets'),
    debtRatio: num(g, 'debtRatio'),
    leva: num(g, 'leverage'),
  });
}

function leggiLiquidita(g: unknown): Liquidita | null {
  return seValorizzato({
    cassaSuDebitiBancariBreve: num(g, 'cashShortTermBankDebt'),
    cassaSuDebitiFinanziariBreve: num(g, 'cashShortTermFinancialDebt'),
    cassaSuDebitiTotaliBreve: num(g, 'cashTotalShortTermDebt'),
  });
}

function leggiLeve(g: unknown): LeveFinanziarie | null {
  return seValorizzato({
    ebitdaLevaLorda: num(g, 'ebitdaGrossLeverage'),
    ebitdaLevaNetta: num(g, 'ebitdaNetLeverage'),
    pfnSuEbitda: num(g, 'pfnEbitda'),
  });
}

function leggiCopertura(g: unknown): CoperturaOneri | null {
  return seValorizzato({
    ebitdaSuInteressiLordi: num(g, 'ebitdaGrossInterestCoverage'),
    ebitdaSuInteressiNetti: num(g, 'ebitdaNetInterestCoverage'),
    ebitSuInteressiLordi: num(g, 'ebitGrossInterestCoverage'),
    ebitSuInteressiNetti: num(g, 'ebitNetInterestCoverage'),
  });
}

function leggiStruttura(g: unknown): StrutturaFinanziaria | null {
  return seValorizzato({
    composizioneDebitoFinanziario: num(g, 'financialDebtComposition'),
    debitoFinanziarioLordoSuPatrimonio: num(g, 'grossFinancialDebtNetWorth'),
    debitoFinanziarioNettoSuPatrimonio: num(g, 'netFinancialDebtEquityNetWorth'),
    pfnSuPatrimonio: num(g, 'pfnNetWorth'),
  });
}

function leggiCiclo(g: unknown): CicloFinanziario | null {
  return seValorizzato({
    durataCreditiVersoClienti: num(g, 'accountsReceivableDuration'),
    durataDebitiVersoFornitori: num(g, 'debtsToSuppliersDuration'),
    durataCicloFinanziario: num(g, 'financialCycleDuration'),
    durataScorte: num(g, 'stockDuration'),
  });
}

function leggiOneri(g: unknown): OneriFinanziari | null {
  return seValorizzato({
    indiceDiOnerosita: num(g, 'burdenIndex'),
    rod: num(g, 'rod'),
    rodFinanziario: num(g, 'rodFinanziario'),
  });
}

function leggiEfficienza(g: unknown): Efficienza | null {
  return seValorizzato({
    rotazioneCreditiVersoClienti: num(g, 'accountsReceivableRotation'),
    indiceDiRotazione: num(g, 'turnoverIndex'),
  });
}

function leggiSviluppo(g: unknown): Sviluppo | null {
  return seValorizzato({
    valoreAggiunto: num(g, 'addedValue'),
    variazioneEbit: num(g, 'ebitVariation'),
    debitoFinanziarioLordo: num(g, 'grossFinancialDebt'),
    mol: num(g, 'mol'),
    valoreDellaProduzione: num(g, 'productionValue'),
    totaleAttivo: num(g, 'totalAssets'),
  });
}

function leggiKpi(g: unknown): KpiDiBilancio | null {
  return seValorizzato({
    rotazioneDebiti: num(g, 'debtsTurnover'),
    oneriFinanziariSuEbitda: num(g, 'financialCostsOnEbitda'),
    rotazioneMagazzino: num(g, 'totalInventoryTurnover'),
    marginePercentualeEbitda: num(g, 'ebitdaMargin'),
    patrimonioSuTotaleAttivo: num(g, 'netWorthOnAssets'),
  });
}

/**
 * Le gare pubbliche, in ordine dall'esercizio più recente.
 *
 * Chi partecipa e vince appalti ha bisogno di cauzioni provvisorie e definitive: è un ramo
 * assicurativo intero che nessuno propone se non sa che quell'impresa va a gare.
 */
function leggiGare(g: unknown): readonly GarePubbliche[] {
  return asArray(g)
    .map((voce) => {
      const anno = num(voce, 'year');
      if (anno === null) return null;
      return {
        anno,
        presentate: num(voce, 'applied'),
        vinte: num(voce, 'won'),
        valoreEuro: num(voce, 'value'),
      };
    })
    .filter((v): v is GarePubbliche => v !== null)
    .sort((a, b) => b.anno - a.anno);
}

function leggiAddetti(g: unknown): StatisticheAddetti | null {
  return seValorizzato({
    impiegati: num(g, 'whiteCollar'),
    tempoDeterminato: num(g, 'fixedTermContract'),
    tempoIndeterminato: num(g, 'permanentContract'),
    tempoPieno: num(g, 'fullTimeContract'),
    tempoParziale: num(g, 'partialTimeContract'),
  });
}

/**
 * Le qualifiche: i fatti che cambiano **quali** coperture servono, prima di quanto costino.
 *
 * Si leggono da rami diversi della risposta, e per questo riceve l'intero oggetto invece
 * di un sottogruppo.
 */
function leggiQualifiche(dati: unknown): QualificheImpresa | null {
  const ecofin = pick(dati, 'ecofin');
  const estero = pick(dati, 'foreignTrade');
  const innovativa = pick(dati, 'innovativeSmeAndSu');
  const contatti = pick(dati, 'contacts');
  const web = pick(dati, 'webAndSocial');
  const ateco = pick(dati, 'atecoClassification');
  const gruppoIva = pick(dati, 'vatGroup');
  const dipendenti = pick(dati, 'employees');
  const date = pick(dati, 'companyDates');
  const gruppi = pick(dati, 'corporateGroups');
  const internazionale = pick(dati, 'internationalClassification');

  return seValorizzato({
    haCertificazioneSoa: bool(pick(dati, 'soaCertification'), 'hasSoaCertification'),
    esportatore: bool(estero, 'isExporter'),
    importatore: bool(estero, 'isImporter'),
    pmiInnovativa: bool(innovativa, 'isInnovativeSme'),
    startUpInnovativa: bool(innovativa, 'isInnovativeStartUp'),
    impresaArtigiana: bool(pick(dati, 'artisanBusinessRegistry'), 'belongsToArtisanBusinessRegistry'),
    numeroUnitaLocali: num(pick(dati, 'branches'), 'numberOfBranches'),
    appartieneAGruppoIva: bool(gruppoIva, 'vatGroupParticipation'),
    capogruppoIva: bool(gruppoIva, 'isVatGroupLeader'),
    sitoWeb: str(web, 'website') ?? str(dati, 'website'),
    telefono: str(contatti, 'telephoneNumber') ?? str(dati, 'phone'),
    fax: str(contatti, 'fax'),
    dimensioneImpresa: str(pick(ecofin, 'enterpriseSize'), 'description'),
    fasciaDiFatturato: str(pick(ecofin, 'turnoverRange'), 'description'),
    andamentoFatturatoPercentuale: num(ecofin, 'turnoverTrend'),
    annoFatturato: num(ecofin, 'turnoverYear'),
    atecoSecondario: str(ateco, 'secondaryAteco2022', 'secondaryAteco'),
    settoreRae: str(pick(dati, 'rae'), 'description'),
    settoreSae: str(pick(dati, 'sae'), 'description'),
    codiceNace: str(pick(internazionale, 'nace'), 'code'),
    codiceSicPrimario: str(pick(internazionale, 'primarySic'), 'code'),
    // Il SIC secondario arriva come stringa nuda, non come oggetto con `code`.
    codiceSicSecondario: str(internazionale, 'secondarySic'),
    addetti: num(dipendenti, 'employee'),
    fasciaAddetti: str(pick(dipendenti, 'employeeRange'), 'description'),
    andamentoAddettiPercentuale: num(dipendenti, 'employeeTrend'),
    dataCostituzione: dataDa(str(date, 'incorporationDate')),
    haControllantiEstere: bool(gruppi, 'hasForeignParents'),
    haControllateEstere: bool(gruppi, 'hasForeignSubsidiaries'),
    // Una stringa vuota non è un indirizzo: vale come assente.
    email: vuotoComeAssente(str(pick(dati, 'mail'), 'email') ?? str(dati, 'email')),
    codiceSdi: str(dati, 'sdiCode'),
    presenteSuiSocial: bool(web, 'hasSocial'),
    commercializzabile: bool(pick(dati, 'marketable'), 'isMarketable'),
    aggiornatoIl:
      dataDa(str(pick(dati, 'companyDetails'), 'lastUpdateDate')) ??
      daEpoca(num(dati, 'lastUpdateTimestamp')),
  });
}

/** Data in forma ISO, oppure `null`: una data non interpretabile non va inventata. */
function dataDa(valore: string | null): Date | null {
  if (valore === null) return null;
  const d = new Date(valore);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Alcuni campi arrivano come secondi dall'epoca invece che in forma ISO. */
function daEpoca(secondi: number | null): Date | null {
  return secondi === null || secondi <= 0 ? null : new Date(secondi * 1000);
}

/**
 * La stringa vuota è assenza, non valore.
 *
 * Il fornitore restituisce una stringa vuota quando l'indirizzo non lo conosce:
 * conservarla farebbe comparire a schermo un'etichetta con nulla accanto, che è peggio
 * dell'assenza — sembra un guasto invece di un dato che non esiste.
 */
function vuotoComeAssente(valore: string | null): string | null {
  return valore === null || valore.trim() === '' ? null : valore;
}
