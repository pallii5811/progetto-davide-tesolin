/**
 * Carrier Strength Score — solidità della compagnia assicurativa.
 *
 * Il rischio di controparte è il punto cieco della consulenza assicurativa italiana:
 * si analizza minuziosamente il rischio del cliente e poi lo si trasferisce a un soggetto
 * la cui solidità nessuno ha valutato. Una polizza è una promessa di pagamento futura:
 * vale quanto vale chi la sottoscrive.
 *
 * Fonti dei dati: SFCR annuale pubblicato da ciascuna impresa (obbligatorio ai sensi della
 * direttiva Solvency II), comunicazioni statistiche IVASS, statistiche reclami IVASS.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { formatNumber, formatPercent, interpolate, weightedAverageDefined } from '../shared/math.js';

export type RatingAgenzia = 'AM Best' | 'S&P' | 'Fitch' | 'Moody’s' | 'KBRA';

export interface RatingEsterno {
  readonly agenzia: RatingAgenzia;
  readonly rating: string;
  readonly dataAssegnazione: Date;
}

export interface CarrierData {
  readonly denominazione: string;
  readonly gruppo: string | null;
  readonly annoRiferimento: number;
  /**
   * Solvency ratio = Fondi propri ammissibili / SCR. Espresso come rapporto (2,60 = 260%).
   * La media del mercato italiano si colloca stabilmente sopra il 250%.
   */
  readonly solvencyRatio: number | null;
  /** Quota di fondi propri di qualità più elevata (Tier 1 unrestricted) sul totale. */
  readonly quotaTier1Unrestricted: number | null;
  readonly fondiPropriAmmissibili: Euro | null;
  readonly scr: Euro | null;
  readonly premiLordiContabilizzati: Euro | null;
  /** Numero di reclami ricevuti nell'anno (fonte: statistiche IVASS). */
  readonly reclamiAnno: number | null;
  readonly ratingEsterno: RatingEsterno | null;
  readonly fonte: string;
}

export type SolidityBand = 'critica' | 'debole' | 'adeguata' | 'solida' | 'molto-solida';

export const SOLIDITY_BAND_LABEL: Readonly<Record<SolidityBand, string>> = {
  critica: 'Critica',
  debole: 'Debole',
  adeguata: 'Adeguata',
  solida: 'Solida',
  'molto-solida': 'Molto solida',
};

export interface CarrierScoreComponent {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly score: number | null;
  readonly rationale: string;
}

export interface CarrierStrength {
  readonly denominazione: string;
  /** Punteggio 0-100. */
  readonly value: number;
  readonly band: SolidityBand;
  readonly components: readonly CarrierScoreComponent[];
  /** Alert bloccanti da segnalare prima del collocamento. */
  readonly allerte: readonly string[];
}

const PESI = {
  solvency: 0.4,
  qualitaCapitale: 0.15,
  dimensione: 0.15,
  reclami: 0.2,
  ratingEsterno: 0.1,
} as const;

/** Soglie di riferimento sul solvency ratio. */
export const SOGLIE_SOLVENCY = {
  critica: 1.0,
  debole: 1.5,
  adeguata: 2.0,
  solida: 2.5,
} as const;

export function computeCarrierStrength(data: CarrierData): Explained<CarrierStrength> {
  const components: CarrierScoreComponent[] = [
    componenteSolvency(data),
    componenteQualitaCapitale(data),
    componenteDimensione(data),
    componenteReclami(data),
    componenteRatingEsterno(data),
  ];

  const punteggio = weightedAverageDefined(components.map((c) => ({ value: c.score, weight: c.weight })));

  const allerte: string[] = [];
  if (data.solvencyRatio !== null && data.solvencyRatio < SOGLIE_SOLVENCY.debole) {
    allerte.push(
      `Solvency ratio al ${formatPercent(data.solvencyRatio, 0)}: sensibilmente inferiore alla media di mercato. ` +
        'Valutare la ripartizione del rischio su più compagnie prima del collocamento.',
    );
  }
  if (data.solvencyRatio !== null && data.solvencyRatio < SOGLIE_SOLVENCY.critica) {
    allerte.push(
      'Solvency ratio inferiore al requisito patrimoniale: la compagnia è in condizione di ' +
        'inadeguatezza patrimoniale ai sensi di Solvency II.',
    );
  }
  const eta = new Date().getFullYear() - data.annoRiferimento;
  if (eta >= 2) {
    allerte.push(
      `Dati SFCR riferiti al ${data.annoRiferimento}: aggiornare con l'ultimo esercizio pubblicato.`,
    );
  }

  const value = punteggio === null ? 50 : Math.round(punteggio);
  const band = classificaBanda(value);

  const builder = explain(`Carrier Strength Score — ${data.denominazione}`)
    .formula('Media pesata delle componenti disponibili')
    .reference('Solvency II · SFCR annuale')
    .reference('Statistiche reclami IVASS')
    .input('Esercizio di riferimento', String(data.annoRiferimento))
    .input('Fonte', data.fonte);

  for (const component of components) {
    builder.input(
      `${component.label} (peso ${formatPercent(component.weight, 0)})`,
      component.score === null ? 'non disponibile' : `${Math.round(component.score)}/100`,
    );
  }

  return builder
    .note(`Punteggio ${value}/100 — solidità ${SOLIDITY_BAND_LABEL[band].toLowerCase()}.`)
    .noteIf(
      punteggio === null,
      'Nessuna componente valutabile: punteggio neutro assegnato in via convenzionale.',
    )
    .confidence(eta >= 2 ? 'bassa' : data.solvencyRatio === null ? 'bassa' : 'media')
    .value({ denominazione: data.denominazione, value, band, components, allerte });
}

function componenteSolvency(data: CarrierData): CarrierScoreComponent {
  if (data.solvencyRatio === null) {
    return {
      key: 'solvency',
      label: 'Solvency ratio',
      weight: PESI.solvency,
      score: null,
      rationale: 'Solvency ratio non disponibile.',
    };
  }
  const score = interpolate(data.solvencyRatio, [
    { x: 0.8, y: 0 },
    { x: 1.0, y: 20 },
    { x: 1.5, y: 45 },
    { x: 2.0, y: 65 },
    { x: 2.5, y: 82 },
    { x: 3.0, y: 92 },
    { x: 4.0, y: 100 },
  ]);
  return {
    key: 'solvency',
    label: 'Solvency ratio',
    weight: PESI.solvency,
    score,
    rationale: `Fondi propri ammissibili pari al ${formatPercent(data.solvencyRatio, 0)} del requisito patrimoniale di solvibilità.`,
  };
}

function componenteQualitaCapitale(data: CarrierData): CarrierScoreComponent {
  if (data.quotaTier1Unrestricted === null) {
    return {
      key: 'qualita-capitale',
      label: 'Qualità dei fondi propri',
      weight: PESI.qualitaCapitale,
      score: null,
      rationale: 'Composizione dei fondi propri non disponibile.',
    };
  }
  const score = interpolate(data.quotaTier1Unrestricted, [
    { x: 0.5, y: 20 },
    { x: 0.7, y: 55 },
    { x: 0.85, y: 80 },
    { x: 0.95, y: 100 },
  ]);
  return {
    key: 'qualita-capitale',
    label: 'Qualità dei fondi propri',
    weight: PESI.qualitaCapitale,
    score,
    rationale: `Tier 1 unrestricted pari al ${formatPercent(data.quotaTier1Unrestricted, 0)} dei fondi propri: capitale immediatamente disponibile ad assorbire le perdite.`,
  };
}

function componenteDimensione(data: CarrierData): CarrierScoreComponent {
  if (data.premiLordiContabilizzati === null) {
    return {
      key: 'dimensione',
      label: 'Dimensione e diversificazione',
      weight: PESI.dimensione,
      score: null,
      rationale: 'Volume premi non disponibile.',
    };
  }
  const premiMln = Money.toEuro(data.premiLordiContabilizzati) / 1_000_000;
  const score = interpolate(premiMln, [
    { x: 20, y: 25 },
    { x: 100, y: 50 },
    { x: 500, y: 72 },
    { x: 2_000, y: 90 },
    { x: 5_000, y: 100 },
  ]);
  return {
    key: 'dimensione',
    label: 'Dimensione e diversificazione',
    weight: PESI.dimensione,
    score,
    rationale: `Premi lordi contabilizzati per ${formatNumber(premiMln, 0)} M€: la scala riduce la volatilità del risultato tecnico.`,
  };
}

function componenteReclami(data: CarrierData): CarrierScoreComponent {
  if (data.reclamiAnno === null || data.premiLordiContabilizzati === null) {
    return {
      key: 'reclami',
      label: 'Reclami normalizzati',
      weight: PESI.reclami,
      score: null,
      rationale: 'Statistiche reclami non disponibili.',
    };
  }
  const premiMln = Money.toEuro(data.premiLordiContabilizzati) / 1_000_000;
  if (premiMln <= 0) {
    return {
      key: 'reclami',
      label: 'Reclami normalizzati',
      weight: PESI.reclami,
      score: null,
      rationale: 'Volume premi non significativo.',
    };
  }
  const reclamiPerMilione = data.reclamiAnno / premiMln;
  const score = interpolate(reclamiPerMilione, [
    { x: 0.2, y: 100 },
    { x: 0.5, y: 85 },
    { x: 1, y: 65 },
    { x: 2, y: 40 },
    { x: 4, y: 15 },
    { x: 8, y: 0 },
  ]);
  return {
    key: 'reclami',
    label: 'Reclami normalizzati',
    weight: PESI.reclami,
    score,
    rationale: `${formatNumber(reclamiPerMilione, 2)} reclami per milione di euro di premi: indicatore indiretto della qualità del processo liquidativo.`,
  };
}

/** Mappa dei rating delle principali agenzie su una scala unica 0-100. */
const RATING_SCALE: Readonly<Record<string, number>> = {
  'A++': 100,
  'A+': 96,
  A: 90,
  'A-': 85,
  AAA: 100,
  'AA+': 97,
  AA: 94,
  'AA-': 90,
  'BBB+': 72,
  BBB: 68,
  'BBB-': 62,
  'B++': 78,
  'B+': 72,
  B: 60,
  'B-': 52,
  'BB+': 52,
  BB: 46,
  'BB-': 40,
  'C++': 40,
  'C+': 34,
  C: 28,
  'C-': 22,
  D: 10,
  E: 5,
  F: 0,
  Aaa: 100,
  Aa1: 97,
  Aa2: 94,
  Aa3: 90,
  A1: 87,
  A2: 84,
  A3: 80,
  Baa1: 74,
  Baa2: 70,
  Baa3: 65,
  Ba1: 55,
  Ba2: 50,
  Ba3: 45,
};

function componenteRatingEsterno(data: CarrierData): CarrierScoreComponent {
  if (data.ratingEsterno === null) {
    return {
      key: 'rating-esterno',
      label: 'Rating di agenzia',
      weight: PESI.ratingEsterno,
      score: null,
      rationale:
        'Nessun rating di agenzia disponibile. Frequente per le compagnie di dimensione domestica.',
    };
  }
  const normalizzato = data.ratingEsterno.rating.trim();
  const score = RATING_SCALE[normalizzato] ?? null;
  return {
    key: 'rating-esterno',
    label: 'Rating di agenzia',
    weight: PESI.ratingEsterno,
    score,
    rationale:
      score === null
        ? `Rating "${normalizzato}" (${data.ratingEsterno.agenzia}) non presente nella scala di conversione.`
        : `Rating ${normalizzato} assegnato da ${data.ratingEsterno.agenzia}.`,
  };
}

function classificaBanda(value: number): SolidityBand {
  if (value >= 85) return 'molto-solida';
  if (value >= 70) return 'solida';
  if (value >= 55) return 'adeguata';
  if (value >= 40) return 'debole';
  return 'critica';
}
