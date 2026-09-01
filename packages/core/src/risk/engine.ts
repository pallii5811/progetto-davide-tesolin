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
import type { CatNatAssessment } from '../coverage/catnat.js';
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
  /**
   * Il fatto è accertato e conta, ma la scala era già al suo limite: il delta esce zero
   * per saturazione, non per irrilevanza.
   *
   * Senza questa distinzione i due zeri finivano sulla scheda scritti allo stesso modo, e
   * il lettore non poteva sapere se un fatto fosse stato scartato o esaurito.
   */
  readonly saturata?: boolean | undefined;
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
  /**
   * L'esito del motore CAT NAT per questa impresa.
   *
   * Il registro dei rischi non ha, e non deve avere, un'opinione sul perimetro di un
   * obbligo di legge: quel perimetro conosce la forma giuridica, lo stato di attività e
   * la divisione ATECO, e vive in `coverage/catnat.ts`. Quando `rules.ts` se lo
   * riscriveva per conto proprio le due letture divergevano su tre popolazioni su tre,
   * dentro lo stesso documento.
   *
   * `undefined` significa **non ancora valutato**, e non è né «soggetta» né «non
   * soggetta»: il rischio compare marcato da verificare, perché su un obbligo di legge
   * «non sei obbligato» è il verso che espone il cliente e l'intermediario che gliel'ha
   * detto.
   */
  readonly catNat?: Pick<CatNatAssessment, 'soggetta' | 'motivoEsclusione'> | undefined;
}

/** Il rischio che dipende per intero dal perimetro stabilito dal motore CAT NAT. */
const RISCHIO_CATNAT: RiskId = 'inadempimento-catnat';

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

    /*
      Un controllo su dato ignoto non è un controllo in essere.

      Qui finivano fra i controlli applicati anche le protezioni che nessuno aveva
      dichiarato, con il loro motivo intatto: a questionario vuoto il documento stampava
      nove righe «Impianto di allarme dichiarato presente. (da verificare)», precedute
      dalla UI da «controllo in essere:». Affermava protezioni che non esistono.

      E lo stesso insieme veniva letto da `raccomandaPrevenzione` come l'elenco di ciò che
      è già stato fatto: il piano di prevenzione usciva con **zero** raccomandazioni
      proprio alla prima visita, quando ce n'è più bisogno. Un difetto solo, due facce
      opposte.

      Escluso da qui, il controllo riappare dove gli compete — fra le raccomandazioni, con
      `accertataAssente: false`, che è la distinzione a due stati che `prevenzione.ts`
      modella già. I delta erano comunque azzerati, quindi nessun punteggio si muove.
    */
    if (rule.kind === 'controllo' && verdict === 'ignoto') continue;

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

  /*
    Il perimetro CAT NAT arriva dal motore, e il registro lo riporta.

    Non è una regola in più in `rules.ts`: è la rimozione della seconda opinione. Se il
    motore ha escluso l'impresa, il rischio di inadempimento non esiste e non va proposto
    — è ciò che faceva dichiarare a un'impresa cessata «soggetta all'obbligo assicurativo
    catastrofale» e le apriva ventidue coperture. Se il motore la dichiara soggetta, il
    registro non può tacere, come faceva con la pesca.
  */
  identificati.delete(RISCHIO_CATNAT);
  if (options.catNat?.soggetta !== false) {
    const accertato = options.catNat?.soggetta === true;
    identificati.set(RISCHIO_CATNAT, [
      {
        ruleId: 'catnat/perimetro-dal-motore',
        rationale: accertato
          ? 'Il motore di conformità ha accertato che l’impresa è soggetta all’obbligo assicurativo ' +
            'contro i rischi catastrofali (L. 213/2023 art. 1 cc. 101-111).'
          : // La riserva è già il soggetto della frase: aggiungerla di nuovo fra parentesi
            // la ripeteva, e in coda, che è il posto in cui non serve a nessuno.
            'Il perimetro dell’obbligo assicurativo catastrofale non è stato valutato per questa ' +
            'impresa.',
        likelihoodDelta: 0,
        impactDelta: 0,
        suDatoIgnoto: !accertato,
      },
    ]);
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
    const daVerificare = identificationRules.every((r) => r.suDatoIgnoto) && identificationRules.length > 0;
    if (daVerificare && !includiDaVerificare) continue;

    /*
      I delta che si stampano devono essere quelli che hanno agito.

      La scala si ferma a 5, e dove il tetto morde una regola non sposta niente: una
      s.n.c. edile leggeva «+1 impatto» due volte e ne contava uno soltanto. Il lettore
      del documento ha un solo controllo a disposizione — sommare i delta e ritrovare il
      livello — e non tornava.

      I delta si applicano quindi uno alla volta, e ciascuno porta la differenza che ha
      davvero prodotto. Il totale è identico a quello di prima: le modulazioni non
      abbassano e i controlli non alzano, quindi il tetto morde nello stesso punto.
    */
    const modulationRules = applicaConTetto(modulazioni.get(riskId) ?? [], {
      likelihood: definition.baseLikelihood,
      impact: definition.baseImpact,
    });

    // ── Rischio inerente ────────────────────────────────────────────────────
    const likelihood = clampLikelihood(
      definition.baseLikelihood + sum(modulationRules, (r) => r.likelihoodDelta),
    );
    const impact = clampImpact(definition.baseImpact + sum(modulationRules, (r) => r.impactDelta));
    const inherentScore = riskScore(likelihood, impact);

    // ── Rischio residuo ─────────────────────────────────────────────────────
    const controlRules = applicaConTetto(controlli.get(riskId) ?? [], { likelihood, impact });
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
  const motivo = motivoDellaRegola(rule, facts, suDatoIgnoto);

  if (rule.kind === 'identifica') {
    return {
      ruleId: rule.id,
      rationale: motivo,
      likelihoodDelta: 0,
      impactDelta: 0,
      suDatoIgnoto,
    };
  }
  // Su dato ignoto la modulazione non si applica: si segnala soltanto la verifica da fare.
  return {
    ruleId: rule.id,
    rationale: motivo,
    likelihoodDelta: suDatoIgnoto ? 0 : (rule.likelihood ?? 0),
    impactDelta: suDatoIgnoto ? 0 : (rule.impact ?? 0),
    suDatoIgnoto,
  };
}

/**
 * Il motivo nella forma che corrisponde a ciò che si sa davvero.
 *
 * Sul fatto accertato vale il motivo della regola, all'indicativo. Sul fatto non rilevato
 * vale la sua formulazione condizionale, che porta la riserva **dentro** la frase: la
 * parentesi in coda arrivava dopo l'affermazione, e chi legge ad alta voce l'aveva già
 * pronunciata — «Lavorazioni in cantiere» detto a un fabbricante di serrature.
 *
 * Il ripiego con la parentesi resta per le regole che non hanno ancora la loro forma
 * condizionale: dichiarare la riserva tardi è meno peggio che non dichiararla. Ma è un
 * ripiego, non un'alternativa, e `regole-non-affermano-lignoto.test.ts` lo tiene vuoto.
 */
function motivoDellaRegola(rule: RiskRule, facts: CompanyFacts, suDatoIgnoto: boolean): string {
  const accertato = risolviRationale(rule.rationale, facts);
  if (!suDatoIgnoto) return accertato;

  const seIgnoto = 'rationaleSeIgnoto' in rule ? rule.rationaleSeIgnoto : undefined;
  if (seIgnoto !== undefined) return risolviRationale(seIgnoto, facts);

  return rule.kind === 'identifica' ? `${accertato} (dato da confermare)` : `${accertato} (da verificare)`;
}

/**
 * Le regole applicate una alla volta, ciascuna con il delta che ha davvero prodotto.
 *
 * Dove la scala satura, una regola non sposta nulla e il suo delta esce zero: è la sola
 * forma in cui la somma dei numeri stampati coincide con la differenza fra il livello di
 * partenza e quello di arrivo. Il livello finale non cambia — le modulazioni hanno delta
 * non negativi e i controlli delta non positivi, quindi saturare a ogni passo o alla fine
 * porta allo stesso punto.
 */
function applicaConTetto(
  regole: readonly AppliedRule[],
  da: { readonly likelihood: number; readonly impact: number },
): readonly AppliedRule[] {
  let probabilita = da.likelihood;
  let impatto = da.impact;

  return regole.map((regola) => {
    const nuovaProbabilita = clampLikelihood(probabilita + regola.likelihoodDelta);
    const nuovoImpatto = clampImpact(impatto + regola.impactDelta);
    const applicataProbabilita = nuovaProbabilita - probabilita;
    const applicatoImpatto = nuovoImpatto - impatto;
    const applicata: AppliedRule = {
      ...regola,
      likelihoodDelta: applicataProbabilita,
      impactDelta: applicatoImpatto,
      /*
        Il fatto contava, ma la scala era già in fondo.

        La scheda stampava «±0P ±0I» accanto a «Totale attivo superiore a 5 M€», su un
        rischio già a impatto catastrofico: un numero al posto di una spiegazione, e per di
        più uno zero che sembrava dire «questo fatto non conta». Contava, e non c'era più
        spazio per contare di più. Sono due cose diverse e vanno stampate diverse.
      */
      saturata:
        !regola.suDatoIgnoto &&
        ((regola.likelihoodDelta !== 0 && applicataProbabilita === 0) ||
          (regola.impactDelta !== 0 && applicatoImpatto === 0)),
    };
    probabilita = nuovaProbabilita;
    impatto = nuovoImpatto;
    return applicata;
  });
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
