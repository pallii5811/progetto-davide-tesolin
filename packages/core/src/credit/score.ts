/**
 * Score di credito AEGIS — modello additivo a fattori pesati, interamente esplicabile.
 *
 * Scala 1–100, dove 100 è il rischio minimo (coerente con la convenzione Creditsafe,
 * per non disorientare gli operatori che già la conoscono).
 *
 * Ogni fattore dichiara: il proprio peso, il punteggio ottenuto, gli indici che lo hanno
 * determinato e una motivazione in italiano corrente. Non esistono contributi nascosti.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import { clamp, formatNumber, formatPercent, interpolate, weightedAverageDefined } from '../shared/math.js';
import { ageInMonths, weakestConfidence } from '../shared/provenance.js';
import type { Confidence, Sourced } from '../shared/provenance.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import type { FinancialIndicators } from '../company/indicators.js';
import type { CompanyProfile, EventiNegativi, ProceduraConcorsuale } from '../company/profile.js';
import {
  anniDiAttivita,
  eserciziDisponibili,
  NESSUN_EVENTO_NEGATIVO,
  ultimoBilancio,
  ultimoBilancioSintetico,
} from '../company/profile.js';
import { altmanToScore, computeAltmanZ } from './altman.js';

export type ClasseDiMerito = 'A' | 'B' | 'C' | 'D' | 'E';

export const CLASSE_LABEL: Readonly<Record<ClasseDiMerito, string>> = {
  A: 'Rischio molto basso',
  B: 'Rischio basso',
  C: 'Rischio medio',
  D: 'Rischio alto',
  E: 'Rischio molto alto',
};

export interface ScoreFactor {
  readonly key: string;
  readonly label: string;
  /** Peso nominale del fattore, 0–1. */
  readonly weight: number;
  /** Punteggio del fattore, 0–100. `null` se non valutabile per dati mancanti. */
  readonly score: number | null;
  readonly rationale: string;
  readonly details: readonly string[];
}

export interface CreditScore {
  /** Punteggio finale 1–100. */
  readonly value: number;
  readonly classe: ClasseDiMerito;
  readonly factors: readonly ScoreFactor[];
  /** Se il punteggio è stato forzato verso il basso da una condizione bloccante, il motivo. */
  readonly cap: string | null;
  /** Probabilità di default a 12 mesi, stimata dalla curva di calibrazione. */
  readonly probabilitaDefault: number;
}

const PESI = {
  solidita: 0.2,
  redditivita: 0.15,
  liquidita: 0.15,
  sostenibilitaDebito: 0.15,
  altman: 0.15,
  eventiNegativi: 0.2,
} as const;

const PESO_ANZIANITA = 0.05;

export interface CreditScoreInput {
  readonly profile: CompanyProfile;
  readonly bilancio: BilancioRiclassificato | null;
  readonly indicatori: FinancialIndicators | null;
  /** Livello di dati economici disponibili: limita la confidenza esprimibile. */
  readonly livelloDati: 'assente' | 'sintetico' | 'completo';
  readonly asOf: Date;
}

export function computeCreditScore(input: CreditScoreInput): Explained<CreditScore> {
  const { profile, bilancio, indicatori, livelloDati, asOf } = input;

  const factors: ScoreFactor[] = [];

  factors.push(fattoreSolidita(indicatori));
  factors.push(fattoreRedditivita(indicatori));
  factors.push(fattoreLiquidita(indicatori));
  factors.push(fattoreSostenibilitaDebito(indicatori));
  factors.push(fattoreAltman(bilancio));
  factors.push(fattoreEventiNegativi(profile.eventiNegativi?.value ?? null, asOf));
  factors.push(fattoreAnzianita(profile, asOf));

  // La sezione eventi negativi può essere assente perché non acquistata. In quel caso
  // l'evento peggiore — una procedura concorsuale aperta — resta invisibile, e nessun
  // punteggio può essere considerato definitivo.
  const eventi = profile.eventiNegativi?.value ?? NESSUN_EVENTO_NEGATIVO;

  const base = weightedAverageDefined(factors.map((f) => ({ value: f.score, weight: f.weight })));

  const builder = explain('Score di credito AEGIS')
    .formula('Media pesata dei fattori, rinormalizzata sui soli fattori valutabili')
    .reference('Metodologia AEGIS · docs/DOMINIO.md §4');

  if (base === null) {
    return builder
      .note('Nessun fattore valutabile: dati insufficienti per esprimere un punteggio.')
      .confidence('bassa')
      .value({
        value: 1,
        classe: 'E',
        factors,
        cap: 'Dati insufficienti',
        probabilitaDefault: probabilitaDefault(1),
      });
  }

  let value = base;
  let cap: string | null = null;

  // ── Vincoli bloccanti ─────────────────────────────────────────────────────
  const proceduraAperta = eventi.procedure.find((p) => p.aperta);
  if (proceduraAperta !== undefined) {
    value = Math.min(value, 10);
    cap = `Procedura concorsuale aperta (${dicitura(proceduraAperta)}) dal ${formatDate(proceduraAperta.dataApertura)}`;
  }

  const stato = profile.anagrafica.value.statoAttivita;
  if (stato === 'cessata' || stato === 'fallita') {
    value = Math.min(value, 5);
    cap = `Impresa ${stato}`;
  } else if (stato === 'in-liquidazione') {
    value = Math.min(value, 20);
    cap ??= 'Impresa in liquidazione';
  }

  if (bilancio !== null && !Money.isPositive(bilancio.sp.patrimonioNetto)) {
    value = Math.min(value, 35);
    cap ??= 'Patrimonio netto negativo (perdita di capitale sociale)';
  }

  // ── Obsolescenza del bilancio ─────────────────────────────────────────────
  // Vale anche il bilancio sintetico: ai fini della freschezza del dato conta la data,
  // non il livello di dettaglio.
  const bilancioSourced: Sourced<unknown> | null =
    ultimoBilancio(profile) ?? ultimoBilancioSintetico(profile);
  let confidenza: Confidence = 'alta';
  let mesiBilancio: number | null = null;

  // La confidenza non può superare quella consentita dal livello di dati disponibili.
  if (livelloDati === 'sintetico') {
    confidenza = 'media';
    builder.note(
      'Analisi condotta sugli aggregati di bilancio (fatturato, patrimonio netto, totale attivo, ' +
        'costo del personale). Redditività, liquidità e sostenibilità del debito non sono ' +
        'valutabili senza il bilancio in schema CEE dettagliato.',
    );
  }

  if (profile.eventiNegativi === null) {
    confidenza = 'bassa';
    builder.note(
      '⚠ Protesti e pregiudizievoli non acquisiti: il fattore che pesa il 20% dello score non è ' +
        'stato valutato. Una procedura concorsuale aperta resterebbe invisibile. Il punteggio va ' +
        'considerato provvisorio.',
    );
  }

  if (bilancioSourced === null) {
    confidenza = 'bassa';
    builder.note(
      'Nessun bilancio disponibile: il punteggio si basa solo su eventi negativi e anzianità. ' +
        'Tipico delle società di persone e delle ditte individuali, che non depositano il bilancio.',
    );
  } else {
    mesiBilancio = ageInMonths(bilancioSourced, asOf);
    if (mesiBilancio > 24) {
      value *= 0.9;
      // `weakestConfidence` e non assegnazione diretta: la confidenza può solo scendere.
      // Un bilancio recente non compensa la mancanza degli eventi negativi.
      confidenza = weakestConfidence(confidenza, 'bassa');
      builder.note(
        `Ultimo bilancio disponibile di ${mesiBilancio} mesi fa: penalizzazione del 10% e confidenza ridotta.`,
      );
    } else if (mesiBilancio > 18) {
      confidenza = weakestConfidence(confidenza, 'media');
      builder.note(`Ultimo bilancio di ${mesiBilancio} mesi fa: confidenza ridotta a media.`);
    }
  }

  const finale = Math.round(clamp(value, 1, 100));
  const classe = classifica(finale);

  for (const factor of factors) {
    builder.input(
      `${factor.label} (peso ${formatPercent(factor.weight, 0)})`,
      factor.score === null ? 'non valutabile' : `${Math.round(factor.score)}/100`,
    );
  }

  return builder
    .note(`Punteggio ${finale}/100 — ${CLASSE_LABEL[classe]} (classe ${classe}).`)
    .noteIf(cap !== null, `Punteggio limitato dall'alto: ${cap ?? ''}`)
    .input('Data di valutazione', formatDate(asOf))
    .input('Esercizio di riferimento', bilancio === null ? 'n.d.' : String(bilancio.anno))
    .confidence(confidenza)
    .value({
      value: finale,
      classe,
      factors,
      cap,
      probabilitaDefault: probabilitaDefault(finale),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fattori
// ─────────────────────────────────────────────────────────────────────────────

function fattoreSolidita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('solidita', 'Solidità patrimoniale', PESI.solidita, 'Bilancio non disponibile');
  }

  const equityScore =
    ind.equityRatio === null
      ? null
      : interpolate(ind.equityRatio, [
          { x: -0.2, y: 0 },
          { x: 0, y: 10 },
          { x: 0.1, y: 35 },
          { x: 0.2, y: 55 },
          { x: 0.3, y: 72 },
          { x: 0.5, y: 90 },
          { x: 0.7, y: 100 },
        ]);

  const leverageScore =
    ind.indiceIndebitamento === null
      ? null
      : interpolate(ind.indiceIndebitamento, [
          { x: 0.5, y: 100 },
          { x: 1.5, y: 85 },
          { x: 3, y: 60 },
          { x: 5, y: 35 },
          { x: 8, y: 15 },
          { x: 12, y: 0 },
        ]);

  const coperturaScore =
    ind.coperturaImmobilizzazioni === null
      ? null
      : interpolate(ind.coperturaImmobilizzazioni, [
          { x: 0.4, y: 10 },
          { x: 0.8, y: 45 },
          { x: 1, y: 70 },
          { x: 1.5, y: 90 },
          { x: 2.5, y: 100 },
        ]);

  const score = weightedAverageDefined([
    { value: equityScore, weight: 0.45 },
    { value: leverageScore, weight: 0.35 },
    { value: coperturaScore, weight: 0.2 },
  ]);

  return {
    key: 'solidita',
    label: 'Solidità patrimoniale',
    weight: PESI.solidita,
    score,
    rationale:
      score === null
        ? 'Indici patrimoniali non calcolabili.'
        : score >= 70
          ? 'Struttura patrimoniale robusta: i mezzi propri coprono adeguatamente attivo e immobilizzazioni.'
          : score >= 45
            ? 'Patrimonializzazione nella norma, con dipendenza significativa da fonti di terzi.'
            : 'Patrimonializzazione debole: la struttura finanziaria è esposta a shock di reddito.',
    details: [
      `Equity ratio: ${ind.equityRatio === null ? 'n.d.' : formatPercent(ind.equityRatio)}`,
      `Indice di indebitamento: ${ind.indiceIndebitamento === null ? 'n.d.' : `${formatNumber(ind.indiceIndebitamento)}×`}`,
      `Copertura immobilizzazioni: ${ind.coperturaImmobilizzazioni === null ? 'n.d.' : `${formatNumber(ind.coperturaImmobilizzazioni)}×`}`,
    ],
  };
}

function fattoreRedditivita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('redditivita', 'Redditività', PESI.redditivita, 'Bilancio non disponibile');
  }

  const roiScore =
    ind.roi === null
      ? null
      : interpolate(ind.roi, [
          { x: -0.15, y: 0 },
          { x: -0.05, y: 15 },
          { x: 0, y: 35 },
          { x: 0.03, y: 55 },
          { x: 0.07, y: 75 },
          { x: 0.15, y: 92 },
          { x: 0.25, y: 100 },
        ]);

  const ebitdaScore =
    ind.ebitdaMargin === null
      ? null
      : interpolate(ind.ebitdaMargin, [
          { x: -0.1, y: 0 },
          { x: 0, y: 25 },
          { x: 0.05, y: 50 },
          { x: 0.1, y: 70 },
          { x: 0.18, y: 88 },
          { x: 0.3, y: 100 },
        ]);

  const trendScore =
    ind.crescitaEbitda === null
      ? null
      : interpolate(ind.crescitaEbitda, [
          { x: -0.4, y: 10 },
          { x: -0.15, y: 35 },
          { x: 0, y: 60 },
          { x: 0.15, y: 80 },
          { x: 0.4, y: 100 },
        ]);

  const score = weightedAverageDefined([
    { value: roiScore, weight: 0.4 },
    { value: ebitdaScore, weight: 0.4 },
    { value: trendScore, weight: 0.2 },
  ]);

  return {
    key: 'redditivita',
    label: 'Redditività',
    weight: PESI.redditivita,
    score,
    rationale:
      score === null
        ? 'Indici di redditività non calcolabili.'
        : score >= 70
          ? 'La gestione caratteristica genera margini solidi e sostenibili.'
          : score >= 45
            ? 'Redditività modesta: margini sufficienti ma poco spazio di assorbimento degli shock.'
            : 'Redditività insufficiente: la gestione operativa non remunera il capitale investito.',
    details: [
      `ROI: ${ind.roi === null ? 'n.d.' : formatPercent(ind.roi)}`,
      `EBITDA margin: ${ind.ebitdaMargin === null ? 'n.d.' : formatPercent(ind.ebitdaMargin)}`,
      `Crescita EBITDA: ${ind.crescitaEbitda === null ? 'n.d.' : formatPercent(ind.crescitaEbitda)}`,
    ],
  };
}

function fattoreLiquidita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('liquidita', 'Liquidità', PESI.liquidita, 'Bilancio non disponibile');
  }

  const currentScore =
    ind.currentRatio === null
      ? null
      : interpolate(ind.currentRatio, [
          { x: 0.5, y: 0 },
          { x: 0.8, y: 25 },
          { x: 1, y: 45 },
          { x: 1.3, y: 65 },
          { x: 1.7, y: 85 },
          { x: 2.5, y: 100 },
        ]);

  const quickScore =
    ind.quickRatio === null
      ? null
      : interpolate(ind.quickRatio, [
          { x: 0.3, y: 0 },
          { x: 0.6, y: 30 },
          { x: 0.9, y: 55 },
          { x: 1.2, y: 78 },
          { x: 1.8, y: 100 },
        ]);

  const cicloScore =
    ind.cicloCircolante === null
      ? null
      : interpolate(ind.cicloCircolante, [
          { x: -30, y: 100 },
          { x: 0, y: 90 },
          { x: 45, y: 70 },
          { x: 90, y: 45 },
          { x: 150, y: 20 },
          { x: 240, y: 0 },
        ]);

  const score = weightedAverageDefined([
    { value: currentScore, weight: 0.35 },
    { value: quickScore, weight: 0.4 },
    { value: cicloScore, weight: 0.25 },
  ]);

  return {
    key: 'liquidita',
    label: 'Liquidità',
    weight: PESI.liquidita,
    score,
    rationale:
      score === null
        ? 'Indici di liquidità non calcolabili.'
        : score >= 70
          ? 'Buon equilibrio fra impegni a breve e risorse disponibili.'
          : score >= 45
            ? 'Liquidità appena sufficiente: il circolante assorbe cassa in misura rilevante.'
            : 'Tensione di liquidità: gli impegni a breve non sono coperti dalle attività correnti.',
    details: [
      `Current ratio: ${ind.currentRatio === null ? 'n.d.' : `${formatNumber(ind.currentRatio)}×`}`,
      `Quick ratio: ${ind.quickRatio === null ? 'n.d.' : `${formatNumber(ind.quickRatio)}×`}`,
      `Ciclo del circolante: ${ind.cicloCircolante === null ? 'n.d.' : `${ind.cicloCircolante} gg`}`,
    ],
  };
}

function fattoreSostenibilitaDebito(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable(
      'sostenibilita-debito',
      'Sostenibilità del debito',
      PESI.sostenibilitaDebito,
      'Bilancio non disponibile',
    );
  }

  const pfnScore =
    ind.pfnSuEbitda === null
      ? null
      : interpolate(ind.pfnSuEbitda, [
          { x: -1, y: 100 },
          { x: 0, y: 95 },
          { x: 1.5, y: 80 },
          { x: 3, y: 60 },
          { x: 4.5, y: 35 },
          { x: 6, y: 15 },
          { x: 9, y: 0 },
        ]);

  const coperturaScore =
    ind.coperturaOneriFinanziari === null
      ? null
      : interpolate(ind.coperturaOneriFinanziari, [
          { x: 0, y: 0 },
          { x: 1, y: 25 },
          { x: 2, y: 45 },
          { x: 3, y: 65 },
          { x: 6, y: 85 },
          { x: 12, y: 100 },
        ]);

  const incidenzaScore =
    ind.incidenzaOneriFinanziari === null
      ? null
      : interpolate(ind.incidenzaOneriFinanziari, [
          { x: 0, y: 100 },
          { x: 0.01, y: 85 },
          { x: 0.03, y: 60 },
          { x: 0.06, y: 30 },
          { x: 0.1, y: 0 },
        ]);

  const score = weightedAverageDefined([
    { value: pfnScore, weight: 0.45 },
    { value: coperturaScore, weight: 0.35 },
    { value: incidenzaScore, weight: 0.2 },
  ]);

  return {
    key: 'sostenibilita-debito',
    label: 'Sostenibilità del debito',
    weight: PESI.sostenibilitaDebito,
    score,
    rationale:
      score === null
        ? 'Indici di sostenibilità del debito non calcolabili.'
        : score >= 70
          ? 'Il debito finanziario è ampiamente sostenibile con i flussi operativi correnti.'
          : score >= 45
            ? 'Debito sostenibile ma con margini ridotti: sensibile a un calo della marginalità.'
            : 'Debito non sostenibile con la marginalità attuale: rischio di tensione finanziaria.',
    details: [
      `PFN / EBITDA: ${ind.pfnSuEbitda === null ? 'n.d.' : `${formatNumber(ind.pfnSuEbitda)}×`}`,
      `Copertura oneri finanziari: ${ind.coperturaOneriFinanziari === null ? 'n.d.' : `${formatNumber(ind.coperturaOneriFinanziari)}×`}`,
      `Incidenza oneri finanziari sui ricavi: ${ind.incidenzaOneriFinanziari === null ? 'n.d.' : formatPercent(ind.incidenzaOneriFinanziari)}`,
    ],
  };
}

function fattoreAltman(bilancio: BilancioRiclassificato | null): ScoreFactor {
  if (bilancio === null) {
    return notEvaluable('altman', "Altman Z''-score", PESI.altman, 'Bilancio non disponibile');
  }

  const altman = computeAltmanZ(bilancio);
  if (altman.value === null) {
    return notEvaluable('altman', "Altman Z''-score", PESI.altman, 'Totale attivo non valorizzato');
  }

  const score = altmanToScore(altman.value.z);
  return {
    key: 'altman',
    label: "Altman Z''-score",
    weight: PESI.altman,
    score,
    rationale: `Z'' = ${formatNumber(altman.value.z)} — ${altman.value.zone === 'sicurezza' ? 'zona di sicurezza' : altman.value.zone === 'incertezza' ? 'zona di incertezza' : 'zona di rischio di insolvenza'}.`,
    details: altman.explanation.inputs.map((i) => `${i.label}: ${i.value}`),
  };
}

/**
 * Come si nomina una procedura in un documento che leggerà un broker.
 *
 * `tipo` è un'etichetta interna col trattino — «stato-insolvenza» — e finiva stampata
 * così sotto gli occhi del cliente. Il registro la sua formulazione ce l'ha, ed è quella
 * che regge davanti a una contestazione: si stampa quella, e si ricade sull’etichetta solo
 * quando il registro non l'ha mandata.
 */
function dicitura(procedura: ProceduraConcorsuale): string {
  return procedura.descrizione ?? procedura.tipo;
}

/**
 * @param eventi `null` se la sezione non è stata acquisita.
 *
 * La distinzione è tutt'altro che formale. Trattare «non ho controllato» come «non ci
 * sono protesti» significa regalare venti punti di score — il peso del fattore — a
 * un'azienda che potrebbe averne dieci. È il modo più diretto per far concedere un fido
 * a un soggetto già protestato.
 */
function fattoreEventiNegativi(eventi: EventiNegativi | null, asOf: Date): ScoreFactor {
  if (eventi === null) {
    return notEvaluable(
      'eventi-negativi',
      'Eventi negativi',
      PESI.eventiNegativi,
      'Protesti e pregiudizievoli non acquisiti',
    );
  }

  let punteggio = 100;
  const details: string[] = [];

  // I protesti pesano in funzione dell'importo e della freschezza: uno di 8 anni fa,
  // levato, non racconta la stessa storia di uno di sei mesi fa ancora aperto.
  for (const protesto of eventi.protesti) {
    const anni = anniTra(protesto.data, asOf);
    if (anni > 10) continue;
    const decadimento = interpolate(anni, [
      { x: 0, y: 1 },
      { x: 2, y: 0.7 },
      { x: 5, y: 0.35 },
      { x: 10, y: 0 },
    ]);
    const gravita = interpolate(Money.toEuro(protesto.importo), [
      { x: 0, y: 8 },
      { x: 5_000, y: 18 },
      { x: 25_000, y: 32 },
      { x: 100_000, y: 45 },
    ]);
    const penalita = gravita * decadimento * (protesto.levato ? 0.4 : 1);
    punteggio -= penalita;
    details.push(
      `Protesto ${formatDate(protesto.data)} · ${Money.formatCompact(protesto.importo)}` +
        `${protesto.levato ? ' (levato)' : ''} → −${Math.round(penalita)} punti`,
    );
  }

  for (const p of eventi.pregiudizievoli) {
    const anni = anniTra(p.data, asOf);
    if (anni > 10) continue;
    const decadimento = interpolate(anni, [
      { x: 0, y: 1 },
      { x: 3, y: 0.6 },
      { x: 7, y: 0.25 },
      { x: 10, y: 0 },
    ]);
    const base =
      p.tipo === 'ipoteca-giudiziale' || p.tipo === 'pignoramento' || p.tipo === 'sequestro' ? 30 : 15;
    const penalita = base * decadimento;
    punteggio -= penalita;
    // La descrizione della conservatoria, non la nostra categoria col trattino.
    details.push(`${p.descrizione} del ${formatDate(p.data)} → −${Math.round(penalita)} punti`);
  }

  for (const procedura of eventi.procedure) {
    if (procedura.aperta) {
      punteggio = 0;
      details.push(
        `Procedura aperta: ${dicitura(procedura)} dal ${formatDate(procedura.dataApertura)} → azzeramento`,
      );
    } else {
      punteggio -= 20;
      // Chiusa e revocata non sono la stessa cosa, e a chi legge interessa quale delle due.
      const fine =
        procedura.dataRevoca !== null
          ? `revocata il ${formatDate(procedura.dataRevoca)}`
          : procedura.dataChiusura !== null
            ? `chiusa il ${formatDate(procedura.dataChiusura)}`
            : 'chiusa';
      details.push(`Procedura ${fine}: ${dicitura(procedura)} → −20 punti`);
    }
  }

  /*
    Il registro dichiara eventi di cui non ha dato il dettaglio.

    È il caso più insidioso: gli elenchi arrivano vuoti e, letti da soli, dicono «pulita».
    Ma gli indicatori dicono il contrario, e senza importi né date non si può pesare nulla.

    Non si stima una penalità inventata: si dichiara che la valutazione **non è
    completa**. Un punteggio pieno su un'impresa protestata è un certificato di buona
    salute falso, e su una proposta assicurativa vale molto più di qualche punto.
  */
  const dichiaratiSenzaDettaglio = eventi.presenzaDichiarataSenzaDettaglio;
  if (dichiaratiSenzaDettaglio.length > 0) {
    const elenco = dichiaratiSenzaDettaglio.join(', ');
    return {
      key: 'eventi-negativi',
      label: 'Eventi negativi',
      weight: PESI.eventiNegativi,
      score: null,
      rationale:
        `Il registro dichiara la presenza di ${elenco}, senza fornirne il dettaglio: ` +
        'la valutazione resta incompleta finché non si acquisisce la visura specifica. ' +
        'Non si attribuisce un punteggio, perché senza importi e date sarebbe inventato.',
      details: [
        `Presenza dichiarata dal registro: ${elenco}.`,
        'Elenchi non forniti: nessun importo, nessuna data, nessuna possibilità di pesarli.',
        'Richiedere la visura protesti dedicata prima di formulare una proposta.',
      ],
    };
  }

  if (details.length === 0) {
    details.push('Nessun protesto, pregiudizievole o procedura concorsuale rilevata.');
  }

  const score = clamp(punteggio, 0, 100);
  return {
    key: 'eventi-negativi',
    label: 'Eventi negativi',
    weight: PESI.eventiNegativi,
    score,
    rationale:
      score >= 95
        ? 'Nessun evento pregiudizievole a carico della società.'
        : score >= 60
          ? 'Presenza di eventi negativi di entità contenuta o risalenti nel tempo.'
          : 'Eventi negativi rilevanti e recenti: forte segnale di deterioramento del merito creditizio.',
    details,
  };
}

function fattoreAnzianita(profile: CompanyProfile, asOf: Date): ScoreFactor {
  const anni = anniDiAttivita(profile, asOf);
  const bilanciDepositati = eserciziDisponibili(profile);

  const anniScore =
    anni === null
      ? null
      : interpolate(anni, [
          { x: 0, y: 20 },
          { x: 2, y: 45 },
          { x: 5, y: 70 },
          { x: 10, y: 88 },
          { x: 20, y: 100 },
        ]);

  const continuitaScore = interpolate(bilanciDepositati, [
    { x: 0, y: 40 },
    { x: 1, y: 60 },
    { x: 3, y: 85 },
    { x: 5, y: 100 },
  ]);

  const score = weightedAverageDefined([
    { value: anniScore, weight: 0.6 },
    { value: continuitaScore, weight: 0.4 },
  ]);

  return {
    key: 'anzianita',
    label: 'Anzianità e continuità',
    weight: PESO_ANZIANITA,
    score,
    rationale:
      anni === null
        ? 'Data di costituzione non disponibile.'
        : anni < 3
          ? `Impresa giovane (${anni} anni): storico insufficiente a consolidare il giudizio.`
          : `Impresa attiva da ${anni} anni, con ${bilanciDepositati} esercizi disponibili.`,
    details: [`Anni di attività: ${anni ?? 'n.d.'}`, `Bilanci disponibili: ${bilanciDepositati}`],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────────────────────────────────────

function notEvaluable(key: string, label: string, weight: number, motivo: string): ScoreFactor {
  return {
    key,
    label,
    weight,
    score: null,
    rationale: `Non valutabile: ${motivo.toLowerCase()}.`,
    details: [],
  };
}

export function classifica(score: number): ClasseDiMerito {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

/**
 * Curva di calibrazione score → probabilità di default a 12 mesi.
 *
 * I valori attuali sono una calibrazione di riferimento sulla distribuzione tipica del
 * mercato italiano; vanno ricalibrati sui dati storici della piattaforma appena il
 * campione lo consente. La funzione è isolata proprio per rendere la ricalibrazione
 * un intervento a un solo punto.
 */
export function probabilitaDefault(score: number): number {
  return (
    interpolate(score, [
      { x: 1, y: 35 },
      { x: 20, y: 18 },
      { x: 35, y: 9 },
      { x: 50, y: 4.5 },
      { x: 65, y: 2 },
      { x: 80, y: 0.8 },
      { x: 90, y: 0.35 },
      { x: 100, y: 0.15 },
    ]) / 100
  );
}

function anniTra(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 86_400_000);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date,
  );
}
