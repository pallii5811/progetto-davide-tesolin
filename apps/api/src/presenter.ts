/**
 * Presentazione: dal dominio al JSON.
 *
 * Confine esplicito. Il dominio parla in `Money` (centesimi, tipo branded), `Date` e
 * unioni discriminate; il mondo esterno parla JSON. Tradurre qui, in un solo punto,
 * evita che la UI reimplementi la formattazione italiana e che un `toFixed(2)` sparso
 * in un componente React diventi la fonte di verità di un importo assicurativo.
 *
 * Ogni importo viaggia in tre forme: centesimi (per i calcoli), euro (per i grafici),
 * formattato (per la lettura). La UI non deve mai dover scegliere.
 */

import {
  SOLIDITY_BAND_LABEL,
  computeCarrierStrength,
  AREA_LABEL,
  COMPANY_SIZE_LABEL,
  COVERAGE_CATEGORY_LABEL,
  GAP_STATUS_LABEL,
  IMPACT_LABEL,
  INDICATOR_META,
  LIKELIHOOD_LABEL,
  Money,
  RISK_CATEGORY_LABEL,
  RISK_LEVEL_LABEL,
  TREATMENT_LABEL,
  describeSource,
  formatIndicator,
  incidenzaGapSuPatrimonio,
} from '@aegis/core';
import type {
  RatingAgenzia,
  AssessedRisk,
  CompanyAnalysis,
  CoverageGap,
  Explained,
  Explanation,
  FinancialIndicators,
  Money as Euro,
  Sourced,
} from '@aegis/core';
// Importato esplicitamente perché il tipo di ritorno di `presentAnalysis` lo referenzia:
// senza, il compilatore non riesce a nominarlo in modo portabile.
import type { FormaConsigliata } from '@aegis/core';
import type { RigaSolidita } from '@aegis/db';

export interface MoneyDto {
  readonly centesimi: number;
  readonly euro: number;
  readonly formattato: string;
}

export function money(value: Euro): MoneyDto {
  return { centesimi: value, euro: Money.toEuro(value), formattato: Money.formatCompact(value) };
}

export function moneyOrNull(value: Euro | null): MoneyDto | null {
  return value === null ? null : money(value);
}

export interface ExplanationDto {
  readonly titolo: string;
  readonly formula: string | null;
  readonly input: readonly {
    readonly etichetta: string;
    readonly valore: string;
    readonly fonte: string | null;
  }[];
  readonly note: readonly string[];
  readonly riferimenti: readonly string[];
}

export function explanation(source: Explanation): ExplanationDto {
  return {
    titolo: source.label,
    formula: source.formula,
    input: source.inputs.map((i) => ({
      etichetta: i.label,
      valore: i.value,
      fonte: i.source === undefined ? null : describeSource(i.source),
    })),
    note: source.notes,
    riferimenti: source.references,
  };
}

export interface ExplainedDto<T> {
  readonly valore: T;
  readonly confidenza: string;
  readonly spiegazione: ExplanationDto;
}

export function explained<T, U>(source: Explained<T>, map: (value: T) => U): ExplainedDto<U> {
  return {
    valore: map(source.value),
    confidenza: source.confidence,
    spiegazione: explanation(source.explanation),
  };
}

function fonte(source: Sourced<unknown> | null): { descrizione: string; osservatoIl: string } | null {
  return source === null
    ? null
    : { descrizione: describeSource(source.source), osservatoIl: source.observedAt.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────

export function presentAnalysis(analisi: CompanyAnalysis) {
  const a = analisi.profile.anagrafica.value;
  return {
    asOf: analisi.asOf.toISOString(),
    azienda: {
      denominazione: analisi.profile.identity.denominazione,
      partitaIva: analisi.profile.identity.partitaIva,
      formaGiuridica: a.formaGiuridicaDescrizione,
      statoAttivita: a.statoAttivita,
      ateco: a.atecoPrimario,
      atecoDescrizione: a.atecoPrimarioDescrizione,
      sedeLegale: a.sedeLegale,
      dimensione: analisi.dimensione.value,
      dimensioneEtichetta: COMPANY_SIZE_LABEL[analisi.dimensione.value],
      anniDiAttivita: analisi.facts.anniDiAttivita,
      addetti: analisi.facts.addetti,
      fonte: fonte(analisi.profile.anagrafica),
    },
    livelloDatiEconomici: analisi.livelloDatiEconomici,
    arricchimentiPossibili: analisi.arricchimentiPossibili,
    completezza: {
      percentuale: analisi.completezza.percentuale,
      livello: analisi.completezza.livello,
      punteggio: analisi.completezza.punteggio,
      punteggioMassimo: analisi.completezza.punteggioMassimo,
      compilati: analisi.completezza.compilati,
      mancanti: analisi.completezza.mancanti.map((m) => ({
        chiave: m.chiave,
        etichetta: m.etichetta,
        area: m.area,
        areaEtichetta: AREA_LABEL[m.area],
        beneficio: m.beneficio,
        peso: m.peso,
      })),
    },
    sintesi: presentSintesi(analisi),
    credito: presentCredito(analisi),
    bilancio: presentBilancio(analisi),
    rischi: analisi.rischi.risks.map(presentRisk),
    rischiMeta: {
      totale: analisi.rischi.risks.length,
      daTrasferire: analisi.rischi.daTrasferire,
      daVerificare: analisi.rischi.daVerificare,
      versioneCatalogo: analisi.rischi.catalogVersion,
      versioneRegole: analisi.rischi.rulesVersion,
    },
    sommeAssicurande: presentSomme(analisi),
    dannoMassimo: presentDannoMassimo(analisi),
    ritenzione: presentRitenzione(analisi),
    metricheDiImpatto: presentMetricheDiImpatto(analisi),
    schemaMargine:
      analisi.schemaMargine === null
        ? null
        : {
            righe: analisi.schemaMargine.righe.map((r) => ({
              voce: r.voce,
              importoDiBilancio: money(r.importoDiBilancio),
              quotaVariabile: r.quotaVariabile,
              effetto: money(r.effetto),
              motivazione: r.motivazione,
            })),
            margineDiContribuzione: money(analisi.schemaMargine.margineDiContribuzione),
            incidenzaSuRicavi: analisi.schemaMargine.incidenzaSuRicavi,
          },
    andamentoPluriennale: analisi.andamentoPluriennale.map((e) => ({
      anno: e.anno,
      valoreDellaProduzione: moneyOrNull(e.valoreDellaProduzione),
      patrimonioNetto: moneyOrNull(e.patrimonioNetto),
      costoDelPersonale: moneyOrNull(e.costoDelPersonale),
      dipendenti: e.dipendenti,
      retribuzioneMediaLorda: moneyOrNull(e.retribuzioneMediaLorda),
    })),
    prevenzione: analisi.prevenzione,
    catNat: presentCatNat(analisi),
    assetto: presentAssetto(analisi),
    ubicazioni: presentUbicazioni(analisi),
    /*
      Gli indicatori che l'archivio camerale ha già calcolato.

      Passano **così come sono**, senza selezione: sono compresi nel prezzo già pagato, e
      decidere qui quali meritino di arrivare a schermo significherebbe rifare l'errore da
      cui questo blocco nasce — comprare il record intero e mostrarne una parte.

      Restano separati dal punteggio della piattaforma, che si calcola dai bilanci
      riclassificati: due letture indipendenti dello stesso bilancio sono una controprova,
      una sola è un atto di fede.
    */
    indicatoriArchivio: analisi.profile.indicatoriFornitore,
    gap: {
      voci: analisi.gap.gaps.map(presentGap),
      coperturaAssente: analisi.gap.coperturaAssente,
      coperturaInadeguata: analisi.gap.coperturaInadeguata,
      coperturaAdeguata: analisi.gap.coperturaAdeguata,
      coperturaDaQuantificare: analisi.gap.coperturaDaQuantificare,
      esposizioneNonAssicurata: money(analisi.gap.esposizioneNonAssicurata),
      premioInEssere: moneyOrNull(analisi.gap.premioInEssere),
    },
  };
}

/**
 * Assetto proprietario.
 *
 * La partita IVA della capogruppo viene esposta perché l'interfaccia ne fa un
 * collegamento: risalire la catena societaria è un clic, non una ricerca a mano.
 */
function presentAssetto(analisi: CompanyAnalysis) {
  const a = analisi.assetto;
  return {
    tipoControllo: a.tipoControllo,
    tipoControlloEtichetta: a.tipoControlloEtichetta,
    numeroSoci: a.numeroSoci,
    soci: a.soci,
    quotaPrimoSocio: a.quotaPrimoSocio,
    compagineCompleta: a.compagineCompleta,
    capogruppo: a.capogruppo,
    soggettaADirezioneECoordinamento: a.soggettaADirezioneECoordinamento,
    personeChiave: a.personeChiave,
    caricheDisponibili: a.caricheDisponibili,
    cariche: analisi.profile.assetti?.value.cariche ?? [],
    implicazioni: a.implicazioni,
    domande: a.domande,
    confidenza: a.confidenza,
  };
}

/**
 * Ubicazioni.
 *
 * I gruppi vengono esposti per identificativo e non annidati: l'interfaccia mostra
 * l'elenco delle sedi una volta sola e vi appoggia sopra l'appartenenza al complesso,
 * invece di ripetere le stesse sedi in due strutture che possono divergere.
 */
interface UbicazioneDto {
  readonly id: string;
  readonly etichetta: string;
  readonly origini: readonly string[];
  readonly tipo: string | null;
  readonly comune: string;
  readonly provincia: string;
  readonly via: string;
  readonly civico: string | null;
  readonly cap: string;
  readonly superficieMq: number | null;
  readonly addetti: number | null;
  readonly haCoordinate: boolean;
  readonly sismica: string;
  readonly idraulica: string;
  readonly piuEsposta: boolean;
  /**
   * Il contesto fisico attorno, se osservato.
   *
   * `null` significa **non osservato**, mai «non c'è niente»: chi costruisce la pagina
   * deve poter dire quale delle due, perché su una valutazione incendio confonderle
   * significa dichiarare pulito un vicinato che nessuno ha guardato.
   */
  readonly contesto: ContestoDto | null;
}

interface ContestoDto {
  readonly vigiliDelFuoco: readonly {
    readonly nome: string;
    readonly distanzaKm: number;
    readonly minutiStimati: number;
  }[];
  readonly attivitaVicine: readonly {
    readonly nome: string;
    readonly categoria: string;
    readonly distanzaMetri: number;
    readonly aggravaIlRischio: boolean;
  }[];
  readonly attivitaCheAggravano: number;
  readonly raggioAnalizzatoMetri: number;
  /** Attribuzione della fonte: viaggia col dato perché la licenza ODbL la impone. */
  readonly fonte: string;
}

interface GruppoDto {
  readonly ubicazioni: readonly string[];
  readonly motivo: string;
}

interface UbicazioniDto {
  readonly elenco: readonly UbicazioneDto[];
  readonly complessiIncendio: readonly GruppoDto[];
  readonly aggregatiTerritoriali: readonly GruppoDto[];
  readonly unicoComplesso: boolean;
  readonly distanzaMassimaKm: number | null;
  readonly province: readonly string[];
  readonly comuni: readonly string[];
  readonly domande: readonly string[];
  readonly note: readonly string[];
  readonly confidenza: string;
}

// Il tipo è dichiarato e non dedotto: senza, l'inferenza trascina nel DTO i tipi del
// dominio, e la firma pubblica dell'API finirebbe per dipendere dai percorsi interni
// del pacchetto core.
function presentUbicazioni(analisi: CompanyAnalysis): UbicazioniDto {
  const u = analisi.ubicazioni;
  const gruppo = (
    aggregati: readonly { ubicazioni: readonly { id: string }[]; motivo: string }[],
  ): { ubicazioni: string[]; motivo: string }[] =>
    aggregati.map((a) => ({ ubicazioni: a.ubicazioni.map((x) => x.id), motivo: a.motivo }));

  return {
    elenco: u.ubicazioni.map((x) => ({
      id: x.id,
      etichetta: x.etichetta,
      origini: x.origini,
      tipo: x.tipo,
      comune: x.indirizzo.comune,
      provincia: x.indirizzo.provincia,
      via: x.indirizzo.via,
      civico: x.indirizzo.civico,
      cap: x.indirizzo.cap,
      superficieMq: x.superficieMq,
      addetti: x.addetti,
      haCoordinate: x.haCoordinate,
      sismica: x.esposizione.sismica,
      idraulica: x.esposizione.idraulica,
      piuEsposta: x.id === u.ubicazionePeggiore?.id,
      contesto:
        x.contesto === null
          ? null
          : {
              vigiliDelFuoco: x.contesto.vigiliDelFuoco.map((c) => ({
                nome: c.nome,
                distanzaKm: c.distanzaKm,
                minutiStimati: c.minutiStimati,
              })),
              attivitaVicine: x.contesto.attivitaVicine.map((a) => ({
                nome: a.nome,
                categoria: a.categoria,
                distanzaMetri: a.distanzaMetri,
                aggravaIlRischio: a.aggravaIlRischio,
              })),
              attivitaCheAggravano: x.contesto.attivitaCheAggravano,
              raggioAnalizzatoMetri: x.contesto.raggioAnalizzatoMetri,
              fonte: x.contesto.fonte,
            },
    })),
    complessiIncendio: gruppo(u.complessiIncendio),
    aggregatiTerritoriali: gruppo(u.aggregatiTerritoriali),
    unicoComplesso: u.unicoComplesso,
    distanzaMassimaKm: u.distanzaMassimaKm,
    province: u.province,
    comuni: u.comuni,
    domande: u.domande,
    note: u.note,
    confidenza: u.confidenza,
  };
}

function presentSintesi(analisi: CompanyAnalysis) {
  const s = analisi.sintesi;
  const incidenza = incidenzaGapSuPatrimonio(analisi);
  return {
    scoreCredito: s.scoreCredito,
    classeCredito: s.classeCredito,
    probabilitaDefault: analisi.creditScore.value.probabilitaDefault,
    fidoConsigliato: money(s.fidoConsigliato),
    rischiIdentificati: s.rischiIdentificati,
    rischiDaTrasferire: s.rischiDaTrasferire,
    rischiCritici: s.rischiCritici,
    coperturaAssente: s.coperturaAssente,
    coperturaDaQuantificare: s.coperturaDaQuantificare,
    patrimonioEsposto: moneyOrNull(s.patrimonioEsposto),
    esposizioneNonAssicurata: money(s.esposizioneNonAssicurata),
    incidenzaEsposizioneSuPatrimonio: incidenza,
    catNatConforme: s.catNatConforme,
    datiDaCompletare: s.datiDaCompletare,
    azioniPrioritarie: s.azioniPrioritarie,
  };
}

function presentCredito(analisi: CompanyAnalysis) {
  const score = analisi.creditScore.value;
  return {
    score: score.value,
    classe: score.classe,
    probabilitaDefault: score.probabilitaDefault,
    limitazione: score.cap,
    confidenza: analisi.creditScore.confidence,
    spiegazione: explanation(analisi.creditScore.explanation),
    fattori: score.factors.map((f) => ({
      chiave: f.key,
      etichetta: f.label,
      peso: f.weight,
      punteggio: f.score,
      motivazione: f.rationale,
      dettagli: f.details,
    })),
    altman:
      analisi.altman?.value == null
        ? null
        : {
            z: analisi.altman.value.z,
            zona: analisi.altman.value.zone,
            spiegazione: explanation(analisi.altman.explanation),
          },
    fido: {
      importo: money(analisi.creditLimit.value.importo),
      vincoloAttivo: analisi.creditLimit.value.vincoloAttivo,
      limitePatrimoniale: money(analisi.creditLimit.value.limitePatrimoniale),
      limiteDimensionale: money(analisi.creditLimit.value.limiteDimensionale),
      limiteFlusso: money(analisi.creditLimit.value.limiteFlusso),
      fattoreScore: analisi.creditLimit.value.fattoreScore,
      spiegazione: explanation(analisi.creditLimit.explanation),
    },
  };
}

function presentBilancio(analisi: CompanyAnalysis) {
  if (analisi.bilancio === null) return null;
  const { sp, ce } = analisi.bilancio;
  return {
    anno: analisi.bilancio.anno,
    dataChiusura: analisi.bilancio.dataChiusura.toISOString(),
    fonte: fonte(analisi.profile.bilanci[0] ?? null),
    contoEconomico: {
      ricavi: money(ce.ricavi),
      valoreDellaProduzione: money(ce.valoreDellaProduzione),
      valoreAggiunto: money(ce.valoreAggiunto),
      costoDelPersonale: money(ce.costoDelPersonale),
      ebitda: money(ce.ebitda),
      ebit: money(ce.ebit),
      oneriFinanziari: money(ce.oneriFinanziari),
      utileNetto: money(ce.utileNetto),
      margineDiContribuzione: money(ce.margineDiContribuzione),
    },
    statoPatrimoniale: {
      totaleAttivo: money(sp.totaleAttivo),
      attivoCorrente: money(sp.attivoCorrente),
      attivoImmobilizzato: money(sp.attivoImmobilizzato),
      patrimonioNetto: money(sp.patrimonioNetto),
      patrimonioNettoTangibile: money(sp.patrimonioNettoTangibile),
      totaleDebiti: money(sp.totaleDebiti),
      posizioneFinanziariaNetta: money(sp.posizioneFinanziariaNetta),
      capitaleCircolanteNetto: money(sp.capitaleCircolanteNetto),
    },
    indici:
      analisi.indicatori === null
        ? []
        : (Object.keys(INDICATOR_META) as (keyof FinancialIndicators)[]).map((chiave) => ({
            chiave,
            etichetta: INDICATOR_META[chiave].label,
            formula: INDICATOR_META[chiave].formula,
            descrizione: INDICATOR_META[chiave].description,
            valore: analisi.indicatori![chiave],
            formattato: formatIndicator(chiave, analisi.indicatori![chiave]),
            meglioSeAlto: INDICATOR_META[chiave].higherIsBetter,
          })),
  };
}

function presentRisk(rischio: AssessedRisk) {
  return {
    id: rischio.definition.id,
    etichetta: rischio.definition.label,
    descrizione: rischio.definition.description,
    categoria: rischio.definition.category,
    categoriaEtichetta: RISK_CATEGORY_LABEL[rischio.definition.category],
    probabilita: rischio.residualLikelihood,
    probabilitaEtichetta: LIKELIHOOD_LABEL[rischio.residualLikelihood],
    impatto: rischio.residualImpact,
    impattoEtichetta: IMPACT_LABEL[rischio.residualImpact],
    punteggioInerente: rischio.inherentScore,
    livelloInerente: rischio.inherentLevel,
    punteggioResiduo: rischio.residualScore,
    livelloResiduo: rischio.residualLevel,
    livelloResiduoEtichetta: RISK_LEVEL_LABEL[rischio.residualLevel],
    trattamento: rischio.treatment,
    trattamentoEtichetta: TREATMENT_LABEL[rischio.treatment],
    assicurabile: rischio.definition.assicurabile,
    coperture: rischio.coverages,
    controlliTipici: rischio.definition.controlliTipici,
    riferimenti: rischio.definition.riferimenti,
    daVerificare: rischio.daVerificare,
    motivazioni: {
      identificazione: rischio.identificationRules.map((r) => r.rationale),
      modulazione: rischio.modulationRules.map((r) => ({
        motivazione: r.rationale,
        deltaProbabilita: r.likelihoodDelta,
        deltaImpatto: r.impactDelta,
      })),
      controlli: rischio.controlRules.map((r) => ({
        motivazione: r.rationale,
        deltaProbabilita: r.likelihoodDelta,
        deltaImpatto: r.impactDelta,
      })),
    },
  };
}

function presentSomme(analisi: CompanyAnalysis) {
  const s = analisi.sommeAssicurande;
  const voce = (e: Explained<Euro>): ExplainedDto<MoneyDto> => explained(e, money);
  const voceNullable = (e: Explained<Euro | null>): ExplainedDto<MoneyDto | null> =>
    explained(e, moneyOrNull);
  // Tutte le voci viaggiano come nullable verso la UI: `null` significa «non determinabile»
  // e va mostrato come tale, mai come zero.
  return {
    fabbricati: voceNullable(s.fabbricati),
    contenuto: voceNullable(s.contenuto),
    scorte: voceNullable(s.scorte),
    danniIndiretti: voceNullable(s.danniIndiretti),
    monteSalari: voceNullable(s.monteSalari),
    massimaleRct: voce(s.massimaleRct),
    massimaleRcoPerPersona: voce(s.massimaleRcoPerPersona),
    massimaleRcProdotti: voceNullable(s.massimaleRcProdotti),
    massimaleDandO: voceNullable(s.massimaleDandO),
    massimaleCyber: voce(s.massimaleCyber),
    fidoClienti: voceNullable(s.fidoClienti),
    baseCatNat: voceNullable(s.baseCatNat),
    patrimonioEsposto: voceNullable(s.patrimonioEsposto),
  };
}

/**
 * Danno massimo probabile e forma consigliata.
 *
 * `null` quando i beni non sono quantificabili: un danno massimo su un valore ignoto
 * sarebbe un numero senza significato, e mostrarlo comunque sarebbe peggio che tacere.
 */
interface DannoMassimoDto {
  readonly disponibile: boolean;
  readonly possibile?: MoneyDto;
  readonly probabile?: MoneyDto;
  readonly quota?: number;
  readonly forma?: FormaConsigliata;
  readonly motivazioneForma?: string;
  readonly domandeCheAbbassanoLaStima?: readonly string[];
  readonly confidenza: string;
  readonly spiegazione: ExplanationDto;
}

function presentDannoMassimo(analisi: CompanyAnalysis): DannoMassimoDto {
  const d = analisi.dannoMassimo;
  if (d.value === null) {
    return {
      disponibile: false,
      confidenza: d.confidence,
      spiegazione: explanation(d.explanation),
    };
  }

  return {
    disponibile: true,
    possibile: money(d.value.possibile),
    probabile: money(d.value.probabile),
    quota: d.value.quota,
    forma: d.value.forma,
    motivazioneForma: d.value.motivazioneForma,
    domandeCheAbbassanoLaStima: d.value.domandeCheAbbassanoLaStima,
    confidenza: d.confidence,
    spiegazione: explanation(d.explanation),
  };
}

interface RitenzioneDto {
  readonly disponibile: boolean;
  readonly perSinistro?: MoneyDto;
  readonly annua?: MoneyDto;
  readonly franchigiaConsigliata?: MoneyDto;
  readonly vincoloAttivo?: string;
  readonly propensione?: string;
  readonly propensioneDichiarata: boolean;
  readonly effettoAtteso?: string;
  readonly confidenza: string;
  readonly spiegazione: ExplanationDto;
}

/** Capacità e propensione: quanto l'impresa può e vuole tenersi. */
/**
 * La scala di impatto economico.
 *
 * Quattro gradini con importo e giorni di fermo equivalenti: è la traduzione che rende
 * concreto un numero altrimenti astratto. «Un milione e mezzo» non dice nulla a un
 * imprenditore; «centosette giorni fermo» sì.
 */
function presentMetricheDiImpatto(analisi: CompanyAnalysis) {
  const m = analisi.metricheDiImpatto;

  if (m.value === null) {
    return { disponibile: false as const, spiegazione: explanation(m.explanation) };
  }

  return {
    disponibile: true as const,
    fasce: m.value.fasce.map((f) => ({
      livello: f.livello,
      etichetta: f.etichetta,
      descrizione: f.descrizione,
      importo: money(f.importo),
      giorniDiFermoEquivalenti: f.giorniDiFermoEquivalenti,
      ancoraggio: f.ancoraggio,
    })),
    margineDiTesoreria: money(m.value.margineDiTesoreria),
    indiceDiDisponibilita: m.value.indiceDiDisponibilita,
    margineDiContribuzioneGiornaliero:
      m.value.margineDiContribuzioneGiornaliero === null
        ? null
        : money(m.value.margineDiContribuzioneGiornaliero),
    confidenza: m.confidence,
    spiegazione: explanation(m.explanation),
  };
}

function presentRitenzione(analisi: CompanyAnalysis): RitenzioneDto {
  const r = analisi.ritenzione;
  const dichiarata = analisi.profile.datiDichiarati.propensioneAlRischio !== null;

  if (r.value === null) {
    return {
      disponibile: false,
      propensioneDichiarata: dichiarata,
      confidenza: r.confidence,
      spiegazione: explanation(r.explanation),
    };
  }

  return {
    disponibile: true,
    perSinistro: money(r.value.perSinistro),
    annua: money(r.value.annua),
    franchigiaConsigliata: money(r.value.franchigiaConsigliata),
    vincoloAttivo: r.value.vincoloAttivo,
    propensione: r.value.propensione,
    propensioneDichiarata: dichiarata,
    effettoAtteso: r.value.effettoAtteso,
    confidenza: r.confidence,
    spiegazione: explanation(r.explanation),
  };
}

function presentCatNat(analisi: CompanyAnalysis) {
  const c = analisi.catNat.value;
  return {
    stato: c.status,
    soggetta: c.soggetta,
    motivoEsclusione: c.motivoEsclusione,
    termine: c.termine?.toISOString() ?? null,
    giorniAlTermine: c.giorniAlTermine,
    baseAssicurabile: moneyOrNull(c.baseAssicurabile),
    beniInclusi: c.beniInclusi,
    eventiCoperti: c.eventiCoperti,
    vincoliDiProdotto: c.vincoliDiProdotto,
    conseguenzeInadempimento: c.conseguenzeInadempimento,
    spiegazione: explanation(analisi.catNat.explanation),
  };
}

function presentGap(gap: CoverageGap) {
  return {
    copertura: gap.definition.id,
    etichetta: gap.definition.label,
    descrizione: gap.definition.description,
    categoria: gap.definition.category,
    categoriaEtichetta: COVERAGE_CATEGORY_LABEL[gap.definition.category],
    stato: gap.status,
    statoEtichetta: GAP_STATUS_LABEL[gap.status],
    priorita: gap.priorita,
    obbligoDiLegge: gap.obbligoDiLegge,
    capitaleRaccomandato: explained(gap.capitaleRaccomandato, moneyOrNull),
    capitaleInEssere: moneyOrNull(gap.capitaleInEssere),
    polizza:
      gap.polizza === null
        ? null
        : {
            compagnia: gap.polizza.compagnia,
            numero: gap.polizza.numeroPolizza,
            scadenza: gap.polizza.dataScadenza.toISOString(),
            premioAnnuo: moneyOrNull(gap.polizza.premioAnnuo),
          },
    sottoassicurazione:
      gap.sottoassicurazione?.value == null
        ? null
        : {
            sottoassicurata: gap.sottoassicurazione.value.sottoassicurata,
            gradoDiCopertura: gap.sottoassicurazione.value.gradoDiCopertura,
            scoperturaDiCapitale: money(gap.sottoassicurazione.value.scoperturaDiCapitale),
            simulazione: {
              danno: money(gap.sottoassicurazione.value.simulazione.danno),
              indennizzo: money(gap.sottoassicurazione.value.simulazione.indennizzo),
              aCaricoAssicurato: money(gap.sottoassicurazione.value.simulazione.aCaricoAssicurato),
            },
            spiegazione: explanation(gap.sottoassicurazione.explanation),
          },
    rischiServiti: gap.rischiServiti.map((r) => ({
      id: r.definition.id,
      etichetta: r.definition.label,
      livelloResiduo: r.residualLevel,
    })),
    azione: gap.azione,
    motivazioneAdeguatezza: gap.motivazioneAdeguatezza,
    piano: {
      urgenza: gap.piano.urgenza,
      termine: gap.piano.termine?.toISOString() ?? null,
      aCura: gap.piano.aCura,
      motivazioneTermine: gap.piano.motivazioneTermine,
    },
    insidie: gap.insidie,
  };
}


/**
 * Solidità di una compagnia, con il punteggio ricalcolato al momento.
 *
 * Il motore riceve i dati grezzi e restituisce punteggio, fascia, componenti e allerte:
 * l'interfaccia non calcola nulla, mostra. È la stessa regola che vale per lo score di
 * credito, e per la stessa ragione — un numero mostrato deve poter essere difeso.
 */
export function presentaSolidita(riga: RigaSolidita) {
  const forza = computeCarrierStrength({
    denominazione: riga.denominazione,
    gruppo: riga.gruppo,
    annoRiferimento: riga.anno,
    solvencyRatio: riga.solvencyRatio,
    quotaTier1Unrestricted: riga.quotaTier1Unrestricted,
    fondiPropriAmmissibili: riga.fondiPropriCentesimi as Money | null,
    scr: riga.scrCentesimi as Money | null,
    premiLordiContabilizzati: riga.premiLordiCentesimi as Money | null,
    reclamiAnno: riga.reclamiAnno,
    ratingEsterno:
      riga.ratingAgenzia === null || riga.ratingValore === null
        ? null
        : {
            agenzia: riga.ratingAgenzia as RatingAgenzia,
            rating: riga.ratingValore,
            dataAssegnazione: riga.aggiornatoIl,
          },
    fonte: riga.fonte,
  });

  return {
    compagniaId: riga.compagniaId,
    denominazione: riga.denominazione,
    gruppo: riga.gruppo,
    anno: riga.anno,
    solvencyRatio: riga.solvencyRatio,
    fonte: riga.fonte,
    punteggio: forza.value.value,
    fascia: forza.value.band,
    fasciaEtichetta: SOLIDITY_BAND_LABEL[forza.value.band],
    /*
      I punteggi delle componenti si arrotondano qui.

      Il motore lavora in virgola mobile e produce «94.00000000000001»: un numero esatto
      quanto 94, e illeggibile. Arrotondare nel motore falserebbe le medie pesate a valle;
      arrotondare nella pagina lo lascerebbe passare a chiunque altro legga l'API. Il posto
      giusto è il confine fra dominio e presentazione, che è esattamente questo.
    */
    componenti: forza.value.components.map((c) => ({
      ...c,
      score: c.score === null ? null : Math.round(c.score),
    })),
    allerte: forza.value.allerte,
    confidenza: forza.confidence,
    spiegazione: explanation(forza.explanation),
  };
}
