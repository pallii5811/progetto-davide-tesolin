/**
 * Explained<T> — la "scatola di vetro".
 *
 * Ogni numero che AEGIS mostra all'utente deve poter rispondere a tre domande:
 *   1. con quale formula è stato ottenuto,
 *   2. da quali input,
 *   3. quanto ci si può fidare.
 *
 * Il tipo lo impone: le funzioni di calcolo del dominio non restituiscono `number`,
 * restituiscono `Explained<number>`. Non è possibile produrre un numero opaco senza
 * che il compilatore se ne accorga.
 */

import type { Confidence, DataSource } from './provenance.js';
import { weakestConfidence } from './provenance.js';

export interface ExplanationInput {
  readonly label: string;
  /** Valore già formattato per la lettura umana. */
  readonly value: string;
  readonly source?: DataSource;
}

export interface Explanation {
  /** Cosa è stato calcolato. Es. «Somma assicuranda fabbricati». */
  readonly label: string;
  /** La formula, in notazione leggibile. Es. «mq × costo ricostruzione/mq». */
  readonly formula: string | null;
  readonly inputs: readonly ExplanationInput[];
  /** Avvertenze, ipotesi adottate, limiti del calcolo. */
  readonly notes: readonly string[];
  /** Riferimenti normativi o metodologici. */
  readonly references: readonly string[];
}

export interface Explained<T> {
  readonly value: T;
  readonly explanation: Explanation;
  readonly confidence: Confidence;
}

/**
 * Costruttore fluente. Uso tipico:
 *
 * ```ts
 * explain('Margine di contribuzione')
 *   .formula('Ricavi − Costi variabili')
 *   .input('Ricavi', Money.format(ricavi))
 *   .input('Costi variabili', Money.format(costi))
 *   .note('Il periodo di indennizzo scelto è 12 mesi')
 *   .confidence('media')
 *   .value(margine);
 * ```
 */
export class ExplanationBuilder {
  readonly #label: string;
  #formula: string | null = null;
  readonly #inputs: ExplanationInput[] = [];
  readonly #notes: string[] = [];
  readonly #references: string[] = [];
  #confidence: Confidence = 'alta';

  constructor(label: string) {
    this.#label = label;
  }

  formula(expression: string): this {
    this.#formula = expression;
    return this;
  }

  input(label: string, value: string, source?: DataSource): this {
    this.#inputs.push(source === undefined ? { label, value } : { label, value, source });
    return this;
  }

  note(text: string): this {
    this.#notes.push(text);
    return this;
  }

  /** Aggiunge una nota solo se la condizione è vera. Evita `if` sparsi nei calcoli. */
  noteIf(condition: boolean, text: string): this {
    if (condition) this.#notes.push(text);
    return this;
  }

  reference(text: string): this {
    this.#references.push(text);
    return this;
  }

  confidence(level: Confidence): this {
    this.#confidence = level;
    return this;
  }

  /** La confidenza non può superare quella dei calcoli da cui dipende. */
  inheritConfidence(...upstream: readonly Confidence[]): this {
    this.#confidence = weakestConfidence(this.#confidence, ...upstream);
    return this;
  }

  value<T>(value: T): Explained<T> {
    return {
      value,
      confidence: this.#confidence,
      explanation: {
        label: this.#label,
        formula: this.#formula,
        inputs: [...this.#inputs],
        notes: [...this.#notes],
        references: [...this.#references],
      },
    };
  }
}

export function explain(label: string): ExplanationBuilder {
  return new ExplanationBuilder(label);
}

/** Trasforma il valore conservando spiegazione e confidenza. */
export function mapExplained<T, U>(e: Explained<T>, fn: (value: T) => U): Explained<U> {
  return { value: fn(e.value), explanation: e.explanation, confidence: e.confidence };
}

/** Estrae i soli valori da una mappa di risultati spiegati. */
export function valuesOf<T extends Record<string, Explained<unknown>>>(
  results: T,
): { [K in keyof T]: T[K] extends Explained<infer V> ? V : never } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(results)) {
    out[key] = value.value;
  }
  return out as { [K in keyof T]: T[K] extends Explained<infer V> ? V : never };
}

/** Rende la spiegazione come testo, per report PDF e log di audit. */
export function renderExplanation(explanation: Explanation): string {
  const lines: string[] = [explanation.label];
  if (explanation.formula !== null) {
    lines.push(`  Formula: ${explanation.formula}`);
  }
  for (const input of explanation.inputs) {
    lines.push(`  · ${input.label}: ${input.value}`);
  }
  for (const note of explanation.notes) {
    lines.push(`  ⚠ ${note}`);
  }
  for (const reference of explanation.references) {
    lines.push(`  § ${reference}`);
  }
  return lines.join('\n');
}
