/**
 * Orchestratore: da un profilo aziendale all'analisi completa.
 *
 * È l'unico punto in cui i motori si compongono, ed è volutamente una funzione pura:
 * stessi input, stesso output, nessuna I/O. Questo rende l'analisi **riproducibile** —
 * requisito non negoziabile quando, tre anni dopo, si deve dimostrare su quali dati si
 * fondava la proposta fatta al cliente.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import type { Money as Euro } from '../shared/money.js';
import { Money } from '../shared/money.js';
import type { CompanyProfile } from '../company/profile.js';
import {
  livelloDatiEconomici,
  penultimoBilancio,
  penultimoBilancioSintetico,
  ultimoBilancio,
  ultimoBilancioSintetico,
} from '../company/profile.js';
import { reclassify } from '../company/financials.js';
import type { BilancioRiclassificato, ReclassifyOptions } from '../company/financials.js';
import { computeIndicators, indicatorsFromSintetico } from '../company/indicators.js';
import type { FinancialIndicators } from '../company/indicators.js';
import { deriveFacts } from '../company/facts.js';
import type { CompanyFacts } from '../company/facts.js';
import { valutaCompletezza } from '../company/completeness.js';
import type { Completezza } from '../company/completeness.js';
import { classifySize } from '../company/size.js';
import type { CompanySize } from '../company/size.js';
import { computeAltmanZ } from '../credit/altman.js';
import type { AltmanResult } from '../credit/altman.js';
import { computeCreditScore } from '../credit/score.js';
import type { CreditScore } from '../credit/score.js';
import { basiDaBilancio, computeCreditLimit } from '../credit/credit-limit.js';
import type { CreditLimit } from '../credit/credit-limit.js';
import { assessRisks } from '../risk/engine.js';
import type { RiskAssessment } from '../risk/engine.js';
import { computeSumsInsured } from '../coverage/sums-insured.js';
import { stimaDannoMassimo } from '../coverage/danno-massimo.js';
import { calcolaMetricheDiImpatto } from '../coverage/metriche-impatto.js';
import type { MetricheDiImpatto } from '../coverage/metriche-impatto.js';
import { valutaRitenzione } from '../risk/ritenzione.js';
import { raccomandaPrevenzione } from '../risk/prevenzione.js';
import type { RaccomandazioneDiPrevenzione } from '../risk/prevenzione.js';
import type { CapacitaDiRitenzione } from '../risk/ritenzione.js';
import type { DannoMassimo } from '../coverage/danno-massimo.js';
import type { SumsInsured, SumsInsuredOptions } from '../coverage/sums-insured.js';
import { assessCatNat } from '../coverage/catnat.js';
import type { CatNatAssessment } from '../coverage/catnat.js';
import { analyzeGaps } from '../coverage/gap.js';
import type { GapAnalysis } from '../coverage/gap.js';
import type { PolizzaInEssere } from '../coverage/policy.js';
import { analizzaUbicazioni } from '../company/ubicazioni.js';
import type { AnalisiUbicazioni } from '../company/ubicazioni.js';
import { analizzaAssetto } from '../governance/assetto.js';
import type { AssettoProprietario } from '../governance/assetto.js';

export interface AnalyzeOptions {
  readonly riclassificazione?: ReclassifyOptions | undefined;
  readonly sommeAssicurande?: SumsInsuredOptions | undefined;
  readonly includiRischiDaVerificare?: boolean | undefined;
}

export interface CompanyAnalysis {
  readonly asOf: Date;
  readonly profile: CompanyProfile;

  // Finanza
  readonly bilancio: BilancioRiclassificato | null;
  readonly bilancioPrecedente: BilancioRiclassificato | null;
  readonly indicatori: FinancialIndicators | null;
  readonly dimensione: Explained<CompanySize>;

  // Credito
  readonly altman: Explained<AltmanResult | null> | null;
  readonly creditScore: Explained<CreditScore>;
  readonly creditLimit: Explained<CreditLimit>;

  // Rischi e coperture
  readonly facts: CompanyFacts;
  readonly rischi: RiskAssessment;
  readonly sommeAssicurande: SumsInsured;
  /**
   * Danno massimo probabile sui beni.
   *
   * È il numero con cui un assicuratore dimensiona davvero l'incendio, e quello che apre
   * la scelta fra valore intero e primo rischio assoluto — cioè fra restare esposti alla
   * regola proporzionale o esserne fuori.
   */
  readonly dannoMassimo: Explained<DannoMassimo | null>;
  /**
   * Quanto l'impresa può e vuole tenersi.
   *
   * È il primo passo dell'ISO 31000 — la definizione del contesto — e ciò che trasforma il
   * trattamento da calcolo a decisione dell'imprenditore.
   */
  readonly ritenzione: Explained<CapacitaDiRitenzione | null>;
  /**
   * La scala di impatto: a che punto un danno comincia a fare male, e a che punto
   * fa scattare gli obblighi societari. La ritenzione dice quanto si regge; questa dice
   * dove sono i gradini, tradotti in giorni di fermo.
   */
  readonly metricheDiImpatto: Explained<MetricheDiImpatto | null>;
  /**
   * Misure che abbasserebbero il rischio, con l'effetto che avrebbero.
   *
   * È l'unico trattamento ISO 31000 che riduce il rischio invece di spostarlo: trasferire
   * costa un premio ogni anno, ridurre costa una volta sola e resta.
   */
  readonly prevenzione: readonly RaccomandazioneDiPrevenzione[];
  readonly catNat: Explained<CatNatAssessment>;
  readonly gap: GapAnalysis;
  /**
   * Chi possiede e chi risponde.
   *
   * Determina l'esistenza di un gruppo — e con essa la responsabilità da direzione e
   * coordinamento — e individua le persone la cui uscita fermerebbe l'impresa. Sono i
   * due presupposti della D&O e della key man, cioè delle coperture che si vendono
   * all'imprenditore e non all'azienda.
   */
  readonly assetto: AssettoProprietario;
  /**
   * Dove l'impresa sta davvero.
   *
   * Un'analisi condotta sul solo indirizzo di sede legale attribuisce a tutta l'azienda il
   * rischio territoriale del capoluogo, e tratta come un unico sinistro valori che possono
   * stare a centinaia di chilometri. Qui le ubicazioni sono raccolte da tutte le fonti e
   * raggruppate per ciò che un evento può colpire insieme.
   */
  readonly ubicazioni: AnalisiUbicazioni;

  /** Quanto è affidabile questa analisi e cosa manca per renderla migliore. */
  readonly completezza: Completezza;
  /** Su quale livello di dati economici l'analisi ha lavorato. */
  readonly livelloDatiEconomici: 'assente' | 'sintetico' | 'completo';
  /** Quali acquisizioni ulteriori migliorerebbero l'analisi, e cosa sbloccherebbero. */
  readonly arricchimentiPossibili: readonly ArricchimentoPossibile[];
  readonly sintesi: SintesiAnalisi;
}

/**
 * Un dato non ancora acquisito e ciò che sbloccherebbe.
 *
 * Serve a rendere consapevole la spesa: ogni chiamata a un provider costa, e l'utente
 * deve poter decidere se quel costo vale il risultato. Un sistema che acquisisce tutto
 * per abitudine brucia il margine; uno che non acquisisce mai produce analisi cieche.
 */
export interface ArricchimentoPossibile {
  readonly dato: string;
  readonly sbloccherebbe: readonly string[];
}

const ARRICCHIMENTO_BILANCIO_DETTAGLIATO: ArricchimentoPossibile = {
  dato: 'Bilancio in schema CEE dettagliato',
  sbloccherebbe: [
    'Margine di contribuzione, e quindi la somma assicuranda per i danni indiretti',
    'Indici di liquidità (current ratio, quick ratio) e ciclo del circolante',
    "Altman Z''-score e la sostenibilità del debito (PFN/EBITDA, copertura oneri finanziari)",
    'Valore di rimanenze e immobilizzazioni, base per furto, guasti macchine e CAT NAT',
  ],
};

const ARRICCHIMENTO_EVENTI_NEGATIVI: ArricchimentoPossibile = {
  dato: 'Protesti e pregiudizievoli',
  sbloccherebbe: [
    'Il fattore che pesa il 20% dello score di credito',
    'Rilevazione di procedure concorsuali aperte, che azzerano il fido concedibile',
  ],
};

function arricchimentiPer(
  livello: 'assente' | 'sintetico' | 'completo',
  eventiNegativiDisponibili: boolean,
): readonly ArricchimentoPossibile[] {
  const arricchimenti: ArricchimentoPossibile[] = [];
  if (livello !== 'completo') arricchimenti.push(ARRICCHIMENTO_BILANCIO_DETTAGLIATO);
  if (!eventiNegativiDisponibili) arricchimenti.push(ARRICCHIMENTO_EVENTI_NEGATIVI);
  return arricchimenti;
}

/** I sette numeri che l'intermediario legge per primi. */
export interface SintesiAnalisi {
  readonly denominazione: string;
  readonly scoreCredito: number;
  readonly classeCredito: string;
  readonly fidoConsigliato: Euro;
  readonly rischiIdentificati: number;
  readonly rischiDaTrasferire: number;
  readonly rischiCritici: number;
  readonly coperturaAssente: number;
  /**
   * Coperture il cui capitale non è ancora determinabile.
   *
   * Senza questo numero l'esposizione qui sotto si presta a essere letta al contrario:
   * su un'azienda che non deposita il bilancio in forma analitica nulla è quantificabile,
   * e «0 €» significa «non lo sappiamo», non «è tutto coperto».
   */
  readonly coperturaDaQuantificare: number;
  readonly esposizioneNonAssicurata: Euro;
  readonly catNatConforme: boolean;
  /** `null` se i beni non sono quantificabili con i dati disponibili. */
  readonly patrimonioEsposto: Euro | null;
  readonly datiDaCompletare: number;
  /** Le tre azioni a priorità più alta, pronte per la telefonata al cliente. */
  readonly azioniPrioritarie: readonly string[];
}

export function analyzeCompany(
  profile: CompanyProfile,
  polizze: readonly PolizzaInEssere[],
  asOf: Date,
  options: AnalyzeOptions = {},
): CompanyAnalysis {
  // ── 1. Finanza ────────────────────────────────────────────────────────────
  const ultimo = ultimoBilancio(profile);
  const penultimo = penultimoBilancio(profile);

  const bilancio = ultimo === null ? null : reclassify(ultimo.value, options.riclassificazione ?? {});
  const bilancioPrecedente =
    penultimo === null ? null : reclassify(penultimo.value, options.riclassificazione ?? {});
  // Se manca il bilancio dettagliato si lavora sugli aggregati sintetici: il motore di
  // scoring rinormalizza i pesi sui soli fattori valutabili, quindi il punteggio resta
  // corretto — semplicemente meno informato, e la piattaforma lo dichiara.
  const livelloDati = livelloDatiEconomici(profile);
  const sinteticoCorrente = ultimoBilancioSintetico(profile)?.value ?? null;
  const sinteticoPrecedente = penultimoBilancioSintetico(profile)?.value ?? null;

  const indicatori =
    bilancio !== null
      ? computeIndicators(bilancio, bilancioPrecedente ?? undefined)
      : sinteticoCorrente !== null
        ? indicatorsFromSintetico(sinteticoCorrente, sinteticoPrecedente ?? undefined)
        : null;

  const facts = deriveFacts(profile, bilancio, asOf);
  const dimensione = classifySize({
    addetti: facts.addetti,
    fatturato: facts.fatturato,
    totaleAttivo: facts.totaleAttivo,
  });

  // ── 2. Credito ────────────────────────────────────────────────────────────
  const altman = bilancio === null ? null : computeAltmanZ(bilancio);
  const creditScore = computeCreditScore({ profile, bilancio, indicatori, livelloDati, asOf });

  // Il fido si calcola sugli aggregati disponibili: dal bilancio dettagliato se c'è,
  // altrimenti da quello sintetico, rinunciando al solo vincolo di flusso.
  const creditLimit = computeCreditLimit(
    bilancio !== null
      ? basiDaBilancio(bilancio)
      : {
          patrimonioNettoTangibile: sinteticoCorrente?.patrimonioNetto ?? null,
          ricavi: sinteticoCorrente?.fatturato ?? null,
          ebitda: null,
        },
    creditScore.value,
  );

  // ── 3. Rischi ─────────────────────────────────────────────────────────────
  const rischi = assessRisks(facts, asOf, {
    includiRischiDaVerificare: options.includiRischiDaVerificare ?? true,
  });

  // ── 4. Somme assicurande ──────────────────────────────────────────────────
  const sommeAssicurande = computeSumsInsured(facts, bilancio, profile.datiDichiarati.immobili, {
    ...options.sommeAssicurande,
    periodoIndennizzoMesi:
      options.sommeAssicurande?.periodoIndennizzoMesi ??
      profile.datiDichiarati.periodoIndennizzoMesi ??
      undefined,
  });

  // Le ubicazioni prima del danno massimo: è la contiguità misurata a dire se i valori
  // stiano in un unico complesso, e da quella dipende la maggiorazione della quota.
  const ubicazioni = analizzaUbicazioni({
    sedeLegale: profile.anagrafica.value.sedeLegale,
    unitaLocali: profile.unitaLocali?.value ?? [],
    immobili: profile.datiDichiarati.immobili,
  });

  const dannoMassimo = stimaDannoMassimo(
    sommeAssicurande.patrimonioEsposto.value,
    facts,
    profile.datiDichiarati.immobili,
    ubicazioni,
  );

  const prevenzione = raccomandaPrevenzione(rischi.risks, facts);
  const ritenzione = valutaRitenzione(bilancio, profile.datiDichiarati.propensioneAlRischio);

  /*
    Senza bilancio riclassificato non c'è scala: le quattro soglie sono ancorate a
    liquidità, EBITDA, patrimonio e capitale sociale, e inventarle su un'impresa che
    deposita in forma abbreviata darebbe numeri che sembrano misurati e non lo sono.
  */
  const metricheDiImpatto =
    bilancio === null
      ? explain('Metriche di impatto economico')
          .note('Non calcolabili: il bilancio riclassificato non è disponibile.')
          .confidence('bassa')
          .value<MetricheDiImpatto | null>(null)
      : calcolaMetricheDiImpatto(bilancio, ultimo?.value.passivo.capitaleSociale ?? Money.ZERO);

  // ── 5. CAT NAT ────────────────────────────────────────────────────────────
  const catNat = assessCatNat({
    facts,
    baseAssicurabile: sommeAssicurande.baseCatNat.value,
    giaCoperta: polizze.some(
      (p) => p.coverage === 'catastrofali' && p.dataScadenza.getTime() > asOf.getTime(),
    ),
    asOf,
  });

  // ── 6. Gap analysis ───────────────────────────────────────────────────────
  const gap = analyzeGaps({
    assessment: rischi,
    sums: sommeAssicurande,
    polizze,
    catNat: catNat.value,
    asOf,
  });

  const assetto = analizzaAssetto(profile.assetti?.value ?? null, facts);

  return {
    asOf,
    profile,
    bilancio,
    bilancioPrecedente,
    indicatori,
    dimensione,
    altman,
    creditScore,
    creditLimit,
    facts,
    rischi,
    sommeAssicurande,
    dannoMassimo,
    ritenzione,
    metricheDiImpatto,
    prevenzione,
    catNat,
    gap,
    assetto,
    ubicazioni,
    completezza: valutaCompletezza(profile.datiDichiarati, facts),
    livelloDatiEconomici: livelloDati,
    arricchimentiPossibili: arricchimentiPer(livelloDati, profile.eventiNegativi !== null),
    sintesi: componiSintesi(profile, creditScore, creditLimit, rischi, sommeAssicurande, catNat, gap),
  };
}

function componiSintesi(
  profile: CompanyProfile,
  creditScore: Explained<CreditScore>,
  creditLimit: Explained<CreditLimit>,
  rischi: RiskAssessment,
  somme: SumsInsured,
  catNat: Explained<CatNatAssessment>,
  gap: GapAnalysis,
): SintesiAnalisi {
  const azioniPrioritarie = gap.gaps
    .filter((g) => g.status !== 'adeguata')
    .slice(0, 3)
    .map((g) => g.azione);

  return {
    denominazione: profile.identity.denominazione,
    scoreCredito: creditScore.value.value,
    classeCredito: creditScore.value.classe,
    fidoConsigliato: creditLimit.value.importo,
    rischiIdentificati: rischi.risks.length,
    rischiDaTrasferire: rischi.daTrasferire,
    rischiCritici: rischi.risks.filter((r) => r.residualLevel === 'critico' || r.residualLevel === 'alto')
      .length,
    coperturaAssente: gap.coperturaAssente,
    coperturaDaQuantificare: gap.coperturaDaQuantificare,
    esposizioneNonAssicurata: gap.esposizioneNonAssicurata,
    catNatConforme: catNat.value.status === 'adempiente' || catNat.value.status === 'non-soggetta',
    patrimonioEsposto: somme.patrimonioEsposto.value,
    datiDaCompletare: rischi.daVerificare,
    azioniPrioritarie,
  };
}

/** Esposizione non assicurata in rapporto al patrimonio netto: quanto pesa il gap sull'azienda. */
export function incidenzaGapSuPatrimonio(analysis: CompanyAnalysis): number | null {
  const pn = analysis.bilancio?.sp.patrimonioNetto ?? null;
  if (pn === null || !Money.isPositive(pn)) return null;
  return Money.toEuro(analysis.gap.esposizioneNonAssicurata) / Money.toEuro(pn);
}
