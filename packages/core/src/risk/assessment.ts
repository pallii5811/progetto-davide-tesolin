/**
 * Modello di valutazione del rischio — ISO 31000:2018.
 *
 * Il processo è: identificazione → analisi (probabilità × impatto) → ponderazione → trattamento.
 * La distinzione fra **rischio inerente** e **rischio residuo** è ciò che rende difendibile la
 * proposta assicurativa: si assicura il residuo, non l'inerente, e la differenza è il valore
 * che le misure di prevenzione già in essere hanno prodotto.
 */

export type Likelihood = 1 | 2 | 3 | 4 | 5;
export type Impact = 1 | 2 | 3 | 4 | 5;

export const LIKELIHOOD_LABEL: Readonly<Record<Likelihood, string>> = {
  1: 'Rara',
  2: 'Improbabile',
  3: 'Possibile',
  4: 'Probabile',
  5: 'Quasi certa',
};

export const IMPACT_LABEL: Readonly<Record<Impact, string>> = {
  1: 'Trascurabile',
  2: 'Minore',
  3: 'Moderato',
  4: 'Grave',
  5: 'Catastrofico',
};

export type RiskLevel = 'basso' | 'moderato' | 'rilevante' | 'alto' | 'critico';

export const RISK_LEVEL_LABEL: Readonly<Record<RiskLevel, string>> = {
  basso: 'Basso',
  moderato: 'Moderato',
  rilevante: 'Rilevante',
  alto: 'Alto',
  critico: 'Critico',
};

/** Ordine crescente di gravità, per ordinamenti e confronti. */
export function riskLevelRank(level: RiskLevel): number {
  switch (level) {
    case 'basso':
      return 0;
    case 'moderato':
      return 1;
    case 'rilevante':
      return 2;
    case 'alto':
      return 3;
    case 'critico':
      return 4;
  }
}

/** Matrice 5×5: il punteggio è il prodotto probabilità × impatto, da 1 a 25. */
export function riskScore(likelihood: Likelihood, impact: Impact): number {
  return likelihood * impact;
}

export function riskLevel(score: number): RiskLevel {
  if (score <= 4) return 'basso';
  if (score <= 8) return 'moderato';
  if (score <= 12) return 'rilevante';
  if (score <= 16) return 'alto';
  return 'critico';
}

/**
 * Trattamento del rischio secondo ISO 31000.
 * `trasferire` è il trattamento che si traduce in una copertura assicurativa.
 */
export type RiskTreatment = 'evitare' | 'ridurre' | 'trasferire' | 'ritenere';

export const TREATMENT_LABEL: Readonly<Record<RiskTreatment, string>> = {
  evitare: 'Evitare — eliminare la fonte del rischio',
  ridurre: 'Ridurre — misure di prevenzione e protezione',
  trasferire: 'Trasferire — copertura assicurativa',
  ritenere: 'Ritenere — assunzione consapevole del rischio',
};

/**
 * Trattamento raccomandato in funzione del livello residuo.
 *
 * Sotto il livello "rilevante" il costo del premio tende a superare il beneficio atteso:
 * proporre una copertura su un rischio basso non è un servizio, è una vendita.
 */
export function suggestTreatment(residualLevel: RiskLevel, assicurabile: boolean): RiskTreatment {
  if (!assicurabile) {
    return riskLevelRank(residualLevel) >= riskLevelRank('rilevante') ? 'ridurre' : 'ritenere';
  }
  switch (residualLevel) {
    case 'critico':
    case 'alto':
      return 'trasferire';
    case 'rilevante':
      return 'trasferire';
    case 'moderato':
      return 'ridurre';
    case 'basso':
      return 'ritenere';
  }
}

export function clampLikelihood(value: number): Likelihood {
  return Math.min(5, Math.max(1, Math.round(value))) as Likelihood;
}

export function clampImpact(value: number): Impact {
  return Math.min(5, Math.max(1, Math.round(value))) as Impact;
}
