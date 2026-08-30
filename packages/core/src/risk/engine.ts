/**
 * Motore di valutazione dei rischi.
 *
 * Tre passaggi, nell'ordine imposto dalla ISO 31000:
 *   1. **identificazione** — quali rischi riguardano questa azienda, e perché;
 *   2. **analisi** — modulazione di probabilità e impatto sui fatti aziendali → rischio inerente;
 *   3. **ponderazione** — applicazione dei controlli già in essere → rischio residuo e trattamento.
 *
 * Il risultato non è un elenco di rischi: è un elenco di rischi *motivati*. Ogni voce porta
 * con sé le regole che l'hanno prodotta, in italiano, pronte da incollare nel fascicolo di
 * adeguatezza.
 */

import type { CompanyFacts } from '../company/facts.js';
import type { CoverageId } from '../coverage/taxonomy.js';
import { clampImpact, clampLikelihood, riskLevel, riskScore, suggestTreatment } from './assessment.js';
import type { Impact, Likelihood, RiskLevel, RiskTreatment } from './assessment.js';
import { RISK_RULES, RULES_VERSION, risolviRationale } from './rules.js';
import type { RiskRule, Verdict } from './rules.js';
import { RISK_CATALOG, RISK_CATALOG_VERSION, riferimentiPerImpresa } from './taxonomy.js';
import type { RiskCategory, RiskDefinition, RiskId } from './taxonomy.js';

export interface AppliedRule {
  readonly ruleId: string;
  readonly rationale: string;
  readonly likelihoodDelta: number;
  readonly impactDelta: number;
  /** La regola si è attivata su un dato mancante: la conclusione va confermata dal cliente. */
  readonly suDatoIgnoto: boolean;
}

export interface AssessedRisk {
  readonly definition: RiskDefinition;

  // Rischio inerente: dopo la modulazione sui fatti, prima dei controlli.
  readonly likelihood: Likelihood;
  readonly impact: Impact;
  readonly inherentScore: number;
  readonly inherentLevel: RiskLevel;

  // Rischio residuo: dopo l'applicazione dei controlli già in essere.
  readonly residualLikelihood: Likelihood;
  readonly residualImpact: Impact;
  readonly residualScore: number;
  readonly residualLevel: RiskLevel;

  readonly treatment: RiskTreatment;
  readonly coverages: readonly CoverageId[];

  readonly identificationRules: readonly AppliedRule[];
  readonly modulationRules: readonly AppliedRule[];
  readonly controlRules: readonly AppliedRule[];

  /**
   * Il rischio è stato dedotto, in tutto o in parte, da dati non disponibili.
   * Va portato in intervista, non dato per acquisito.
   */
  readonly daVerificare: boolean;
}

export interface RiskAssessment {
  readonly risks: readonly AssessedRisk[];
  readonly asOf: Date;
  readonly catalogVersion: string;
  readonly rulesVersion: string;
  /** Numero di rischi il cui trattamento raccomandato è il trasferimento assicurativo. */
  readonly daTrasferire: number;
  readonly daVerificare: number;
}

export interface AssessRisksOptions {
  /**
   * Includere i rischi identificati su dati mancanti. Default `true`:
   * un rischio non censito perché il questionario è incompleto è il modo più
   * efficace per lasciare un cliente scoperto.
   */
  readonly includiRischiDaVerificare?: boolean | undefined;
}

export function assessRisks(
  facts: CompanyFacts,
  asOf: Date,
  options: AssessRisksOptions = {},
): RiskAssessment {
  const includiDaVerificare = options.includiRischiDaVerificare ?? true;

  const identificati = new Map<RiskId, AppliedRule[]>();
  const modulazioni = new Map<RiskId, AppliedRule[]>();
  const controlli = new Map<RiskId, AppliedRule[]>();

  for (const rule of RISK_RULES) {
    const verdict = safeEvaluate(rule, facts);
    if (verdict === false) continue;

    const applied = toAppliedRule(rule, verdict, facts);
    const bucket =
      rule.kind === 'identifica' ? identificati : rule.kind === 'modula' ? modulazioni : controlli;
    const existing = bucket.get(rule.risk);
    if (existing === undefined) {
      bucket.set(rule.risk, [applied]);
    } else {
      existing.push(applied);
    }
  }

  const risks: AssessedRisk[] = [];

  for (const [riskId, identificationRules] of identificati) {
    /*
      La definizione esce dal catalogo con i riferimenti normativi risolti su questa
      impresa.

      Il catalogo non conosce la forma giuridica né il settore, e le norme che ne
      dipendono — la responsabilità degli amministratori, l'obbligo assicurativo del
      professionista iscritto a un albo — vi stavano scritte come se valessero per tutti.
      Si sostituisce il solo campo `riferimenti`: chi legge la definizione a valle, dal
      presentatore in giù, riceve le norme di questa impresa senza sapere che qui è
      successo qualcosa.
    */
    const definition: RiskDefinition = {
      ...RISK_CATALOG[riskId],
      riferimenti: riferimentiPerImpresa(riskId, facts),
    };
    const modulationRules = modulazioni.get(riskId) ?? [];
    const controlRules = controlli.get(riskId) ?? [];

    const daVerificare = identificationRules.every((r) => r.suDatoIgnoto) && identificationRules.length > 0;
    if (daVerificare && !includiDaVerificare) continue;

    // ── Rischio inerente ────────────────────────────────────────────────────
    const likelihood = clampLikelihood(
      definition.baseLikelihood + sum(modulationRules, (r) => r.likelihoodDelta),
    );
    const impact = clampImpact(definition.baseImpact + sum(modulationRules, (r) => r.impactDelta));
    const inherentScore = riskScore(likelihood, impact);

    // ── Rischio residuo ─────────────────────────────────────────────────────
    const residualLikelihood = clampLikelihood(likelihood + sum(controlRules, (r) => r.likelihoodDelta));
    const residualImpact = clampImpact(impact + sum(controlRules, (r) => r.impactDelta));
    const residualScore = riskScore(residualLikelihood, residualImpact);
    const residualLevel = riskLevel(residualScore);

    risks.push({
      definition,
      likelihood,
      impact,
      inherentScore,
      inherentLevel: riskLevel(inherentScore),
      residualLikelihood,
      residualImpact,
      residualScore,
      residualLevel,
      treatment: suggestTreatment(residualLevel, definition.assicurabile),
      coverages: definition.coverages,
      identificationRules,
      modulationRules,
      controlRules,
      daVerificare,
    });
  }

  risks.sort(byResidualDesc);

  return {
    risks,
    asOf,
    catalogVersion: RISK_CATALOG_VERSION,
    rulesVersion: RULES_VERSION,
    daTrasferire: risks.filter((r) => r.treatment === 'trasferire').length,
    daVerificare: risks.filter((r) => r.daVerificare).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interrogazioni sul risultato
// ─────────────────────────────────────────────────────────────────────────────

/** Rischi raggruppati per categoria, nell'ordine di gravità residua. */
export function risksByCategory(
  assessment: RiskAssessment,
): ReadonlyMap<RiskCategory, readonly AssessedRisk[]> {
  const grouped = new Map<RiskCategory, AssessedRisk[]>();
  for (const risk of assessment.risks) {
    const bucket = grouped.get(risk.definition.category);
    if (bucket === undefined) {
      grouped.set(risk.definition.category, [risk]);
    } else {
      bucket.push(risk);
    }
  }
  return grouped;
}

/** Rischi il cui trattamento raccomandato è il trasferimento assicurativo. */
export function risksToTransfer(assessment: RiskAssessment): readonly AssessedRisk[] {
  return assessment.risks.filter((r) => r.treatment === 'trasferire');
}

/** Coperture richieste dall'analisi, senza duplicati, in ordine di gravità del rischio servito. */
export function requiredCoverages(assessment: RiskAssessment): readonly CoverageId[] {
  const seen = new Set<CoverageId>();
  const ordered: CoverageId[] = [];
  for (const risk of risksToTransfer(assessment)) {
    for (const coverage of risk.coverages) {
      if (seen.has(coverage)) continue;
      seen.add(coverage);
      ordered.push(coverage);
    }
  }
  return ordered;
}

/** Il rischio residuo più grave che una data copertura contribuisce a trattare. */
export function worstRiskForCoverage(
  assessment: RiskAssessment,
  coverage: CoverageId,
): AssessedRisk | null {
  let worst: AssessedRisk | null = null;
  for (const risk of assessment.risks) {
    if (!risk.coverages.includes(coverage)) continue;
    if (worst === null || risk.residualScore > worst.residualScore) worst = risk;
  }
  return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interni
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una regola difettosa non deve far cadere l'intera analisi: viene ignorata e il
 * rischio resta non identificato da quella regola. In produzione l'evento va tracciato.
 */
function safeEvaluate(rule: RiskRule, facts: CompanyFacts): Verdict {
  try {
    return rule.when(facts);
  } catch {
    return false;
  }
}

function toAppliedRule(rule: RiskRule, verdict: Verdict, facts: CompanyFacts): AppliedRule {
  const suDatoIgnoto = verdict === 'ignoto';
  // Il motivo può dipendere dai numeri di questa impresa: si risolve qui, dove i fatti ci
  // sono, invece di lasciare che una soglia si spacci per una misura.
  const motivo = risolviRationale(rule.rationale, facts);

  if (rule.kind === 'identifica') {
    return {
      ruleId: rule.id,
      rationale: suDatoIgnoto ? `${motivo} (dato da confermare)` : motivo,
      likelihoodDelta: 0,
      impactDelta: 0,
      suDatoIgnoto,
    };
  }
  // Su dato ignoto la modulazione non si applica: si segnala soltanto la verifica da fare.
  return {
    ruleId: rule.id,
    rationale: suDatoIgnoto ? `${motivo} (da verificare)` : motivo,
    likelihoodDelta: suDatoIgnoto ? 0 : (rule.likelihood ?? 0),
    impactDelta: suDatoIgnoto ? 0 : (rule.impact ?? 0),
    suDatoIgnoto,
  };
}

function sum<T>(items: readonly T[], selector: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += selector(item);
  return total;
}

function byResidualDesc(a: AssessedRisk, b: AssessedRisk): number {
  if (b.residualScore !== a.residualScore) return b.residualScore - a.residualScore;
  if (b.inherentScore !== a.inherentScore) return b.inherentScore - a.inherentScore;
  return a.definition.label.localeCompare(b.definition.label, 'it');
}
