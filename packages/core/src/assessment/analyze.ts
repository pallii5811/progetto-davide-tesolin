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
import {
  computeIndicators,
  indicatoriDaArchivio,
  indicatorsFromSintetico,
  unisciIndicatori,
} from '../company/indicators.js';
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
import { componiSchemaMargine } from '../company/schema-margine.js';
import type { SchemaMargineDiContribuzione } from '../company/schema-margine.js';
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
import type { ContestoTerritoriale } from '../company/contesto-territoriale.js';
import { analizzaAssetto } from '../governance/assetto.js';
import { analizzaTitolareEffettivo } from '../governance/titolare-effettivo.js';
import type { AnalisiTitolareEffettivo } from '../governance/titolare-effettivo.js';
import type { AssettoProprietario } from '../governance/assetto.js';

export interface AnalyzeOptions {
  readonly riclassificazione?: ReclassifyOptions | undefined;
  readonly sommeAssicurande?: SumsInsuredOptions | undefined;
  readonly includiRischiDaVerificare?: boolean | undefined;
  /**
   * Contesto fisico delle ubicazioni, già raccolto, per chiave di ubicazione.
   *
   * Questo motore non fa rete: il contesto arriva da fuori e viene congelato nell'analisi
   * insieme al resto. Se manca, l'analisi è la stessa di prima — il contesto arricchisce,
   * non determina.
   */
  readonly contestiTerritoriali?: ReadonlyMap<string, ContestoTerritoriale> | undefined;
  /** Quante letture del contesto sono fallite, e perché. Vedi `analizzaUbicazioni`. */
  readonly esitoContesto?: { readonly occupate: number; readonly nonRaggiunte: number } | undefined;
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
   * Da quali voci di bilancio nasce il margine di contribuzione, e con quali quote.
   *
   * È il numero su cui si costruisce la garanzia danni indiretti: l’imprenditore lo porta
   * al proprio commercialista, e senza le righe non si può verificare.
   */
  readonly schemaMargine: SchemaMargineDiContribuzione | null;
  /**
   * Andamento pluriennale: valore della produzione, utile e costo del personale.
   *
   * Un esercizio solo è una fotografia; tre sono una direzione, ed è la direzione a dire
   * se l’impresa può permettersi il programma assicurativo che le si propone.
   */
  readonly andamentoPluriennale: readonly AndamentoEsercizio[];
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
   * Chi possiede davvero, ai sensi dell'art. 20 del D.Lgs. 231/2007.
   *
   * Ricavato dai soci **già acquistati**: quando sono persone fisiche il titolare
   * effettivo è già lì, e la visura dedicata — undici volte il prezzo dell'anagrafica —
   * non serve. Il risultato dichiara quando invece serve davvero.
   */
  readonly titolareEffettivo: AnalisiTitolareEffettivo;
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

/**
 * I sette numeri che l'intermediario legge per primi.
 *
 * Proprio perché sono i primi, sono quelli in cui un'assenza travestita da valore fa più
 * danno: qui non c'è la spiegazione accanto, c'è la cifra e basta. `scoreCredito` e
 * `fidoConsigliato` valgono `null` quando il modello non ha potuto misurarli, e la classe
 * in quel caso è `ND`.
 */
export interface SintesiAnalisi {
  readonly denominazione: string;
  readonly scoreCredito: number | null;
  readonly classeCredito: string;
  readonly fidoConsigliato: Euro | null;
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

  /*
    Tre fonti per gli indici, in ordine dichiarato — e la terza mancava.

    Lo schema CEE dettagliato vince dove c'è: è il bilancio per intero, e da lì si ricava
    tutto. Non c'è quasi mai, perché il servizio che lo porta costa cinque euro ed è
    dichiarato non verificato.

    Restavano gli aggregati sintetici, da cui si ricavano quattro grandezze: fatturato,
    patrimonio netto, totale attivo, costo del personale. Bastano alla solidità e poco
    altro: liquidità, sostenibilità del debito e ciclo del circolante restavano fuori, e
    il motore le dichiarava «non calcolabili».

    Ma la stessa anagrafica estesa porta con sé gli indici che il Registro Imprese ha già
    elaborato sul bilancio depositato — current ratio, acid test, PFN su EBITDA, copertura
    degli oneri, le quattro durate — e il prodotto li mostrava a schermo senza mai darli al
    motore. Su un'impresa reale il punteggio dichiarava «PFN / EBITDA: da rilevare in
    intervista» mentre venti centimetri più su stampava «PFN su EBITDA 9,53».

    Si riempiono i buchi, non si sovrascrive: il sintetico ha la precedenza dove ha un
    valore, l'archivio entra solo dove il sintetico tace. Le due fonti sono complementari,
    non alternative — il sintetico sa il patrimonio su attivo, l'archivio sa il current
    ratio — e nessuna delle due inventa ciò che non ha.
  */
  const daArchivio = indicatoriDaArchivio(profile.indicatoriFornitore);
  const indicatori =
    bilancio !== null
      ? computeIndicators(bilancio, bilancioPrecedente ?? undefined)
      : unisciIndicatori(
          sinteticoCorrente === null
            ? null
            : indicatorsFromSintetico(sinteticoCorrente, sinteticoPrecedente ?? undefined),
          daArchivio,
        );

  const facts = deriveFacts(profile, bilancio, asOf);
  const dimensione = classifySize({
    addetti: facts.addetti,
    fatturato: facts.fatturato,
    totaleAttivo: facts.totaleAttivo,
  });

  // ── 2. Credito ────────────────────────────────────────────────────────────
  // Il contesto d'impresa serve alle frasi che accompagnano lo Z'', non al calcolo: senza,
  // la scheda affermava che il modello è «per imprese non manifatturiere» sotto lo Z''
  // di una manifattura, e rimandava alle norme della S.r.l. anche a una S.p.A.
  const altman =
    bilancio === null
      ? null
      : computeAltmanZ(bilancio, {
          formaGiuridica: facts.formaGiuridica,
          atecoSezione: facts.atecoSezione,
        });
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

  /*
    I rischi si valutano **dopo** il CAT NAT, e non prima.

    Il registro dei rischi si riscriveva per conto proprio il perimetro dell'obbligo
    catastrofale, e divergeva dal motore su tre popolazioni su tre dentro lo stesso
    documento. Ora lo riceve; ma per riceverlo dev'essere valutato dopo, ed è la sola
    ragione per cui il passo 3 sta qui sotto invece che qui. Nulla fra questo punto e la
    valutazione CAT NAT usa `rischi`: le ubicazioni, le somme assicurande e il danno
    massimo si calcolano sui fatti.
  */

  /*
    Le ubicazioni prima delle somme assicurande, e non dopo.

    Servono al danno massimo — è la contiguità misurata a dire se i valori stiano in un
    unico complesso — ma ora servono anche prima: portano con sé l'impronta a terra dei
    fabbricati, che è la base di ripiego per il capitale sui fabbricati quando l'intervista
    non ha misurato le superfici.
  */
  const ubicazioni = analizzaUbicazioni({
    sedeLegale: profile.anagrafica.value.sedeLegale,
    unitaLocali: profile.unitaLocali?.value ?? [],
    immobili: profile.datiDichiarati.immobili,
    contesti: options.contestiTerritoriali,
    esitoContesto: options.esitoContesto,
  });

  // ── 4. Somme assicurande ──────────────────────────────────────────────────
  const superficieCartograficaMq = superficieRilevata(ubicazioni);

  const sommeAssicurande = computeSumsInsured(facts, bilancio, profile.datiDichiarati.immobili, {
    ...options.sommeAssicurande,
    ...(superficieCartograficaMq === null ? {} : { superficieCartograficaMq }),
    periodoIndennizzoMesi:
      options.sommeAssicurande?.periodoIndennizzoMesi ??
      profile.datiDichiarati.periodoIndennizzoMesi ??
      undefined,
  });

  const dannoMassimo = stimaDannoMassimo(
    sommeAssicurande.patrimonioEsposto.value,
    facts,
    profile.datiDichiarati.immobili,
    ubicazioni,
  );

  const ritenzione = valutaRitenzione(bilancio, profile.datiDichiarati.propensioneAlRischio);

  /*
    Senza bilancio riclassificato non c'è scala: le quattro soglie sono ancorate a
    liquidità, EBITDA, patrimonio e capitale sociale, e inventarle su un'impresa che
    deposita in forma abbreviata darebbe numeri che sembrano misurati e non lo sono.
  */
  const schemaMargine = bilancio === null ? null : componiSchemaMargine(bilancio);

  /*
    L’andamento si legge dai bilanci sintetici, che coprono fino a dieci esercizi e
    arrivano senza costo con l’anagrafica estesa. I dettagliati sono al massimo due, e su
    due punti non si vede una tendenza.
  */
  const andamentoPluriennale: AndamentoEsercizio[] = profile.bilanciSintetici.slice(0, 5).map((b) => ({
    anno: b.value.anno,
    valoreDellaProduzione: b.value.fatturato,
    patrimonioNetto: b.value.patrimonioNetto,
    costoDelPersonale: b.value.costoDelPersonale,
    dipendenti: b.value.dipendenti,
    retribuzioneMediaLorda: b.value.retribuzioneMediaLorda,
  }));

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

  // ── 3. Rischi ─────────────────────────────────────────────────────────────
  // Il perimetro dell'obbligo catastrofale arriva dal motore che l'ha stabilito: il
  // registro lo riporta, non lo ricalcola.
  const rischi = assessRisks(facts, asOf, {
    includiRischiDaVerificare: options.includiRischiDaVerificare ?? true,
    catNat: catNat.value,
  });

  const prevenzione = raccomandaPrevenzione(rischi.risks, facts);

  // ── 6. Gap analysis ───────────────────────────────────────────────────────
  const gap = analyzeGaps({
    assessment: rischi,
    facts,
    sums: sommeAssicurande,
    polizze,
    catNat: catNat.value,
    dannoMassimo: dannoMassimo.value,
    asOf,
  });

  const assetto = analizzaAssetto(profile.assetti?.value ?? null, facts);
  const titolareEffettivo = analizzaTitolareEffettivo(assetto);

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
    schemaMargine,
    andamentoPluriennale,
    prevenzione,
    catNat,
    gap,
    assetto,
    titolareEffettivo,
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

/**
 * Un esercizio nella serie storica.
 *
 * Gli importi restano `null` quando il registro non li porta: su bilanci depositati in
 * forma abbreviata mancano spesso proprio il costo del personale e la retribuzione media,
 * e riempirli di zeri farebbe leggere come «crollo» ciò che è solo un dato assente.
 */
export interface AndamentoEsercizio {
  readonly anno: number;
  readonly valoreDellaProduzione: Euro | null;
  readonly patrimonioNetto: Euro | null;
  readonly costoDelPersonale: Euro | null;
  readonly dipendenti: number | null;
  readonly retribuzioneMediaLorda: Euro | null;
}

/**
 * La superficie coperta dei fabbricati, sommata su ubicazioni **distinte**.
 *
 * La deduplicazione per coordinate non è un dettaglio: la visura assegna spesso le stesse
 * coordinate a due unità locali dello stesso complesso, e il contesto territoriale delle
 * due è — correttamente — lo stesso. Sommarle conterebbe due volte gli stessi capannoni,
 * e il capitale sui fabbricati uscirebbe doppio. È il tipo di errore che nessuno nota,
 * perché il numero resta plausibile.
 *
 * `null` quando nessuna ubicazione ha fabbricati mappati: assente, non zero.
 */
function superficieRilevata(ubicazioni: AnalisiUbicazioni): number | null {
  const viste = new Set<string>();
  let totale = 0;

  for (const u of ubicazioni.ubicazioni) {
    const impronta = u.contesto?.fabbricati;
    if (impronta === undefined || impronta === null) continue;

    const { latitudine, longitudine } = u.indirizzo;
    if (latitudine === null || longitudine === null) continue;

    const chiave = `${latitudine.toFixed(5)}:${longitudine.toFixed(5)}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);

    totale += impronta.superficieCopertaMq;
  }

  return totale > 0 ? totale : null;
}
