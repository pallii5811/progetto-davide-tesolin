/**
 * Provenienza del dato.
 *
 * Principio di prodotto: **nessun campo entra nel modello senza fonte**.
 * Quando l'intermediario dovrà difendere l'adeguatezza di una proposta davanti a un cliente
 * o a IVASS, la domanda non sarà «che numero avevi?» ma «da dove veniva quel numero, e quando».
 */

export type DataSource =
  /**
   * Dato acquistato da un distributore esterno.
   *
   * `registro` è obbligatorio e non è una formalità: il distributore è un tramite tecnico,
   * l'origine del dato è un registro pubblico. In un fascicolo di adeguatezza va difeso
   * «Registro Imprese, visura del 12/03/2026» — nominare l'API da cui è transitato indica
   * un soggetto che né il cliente né IVASS conoscono, e indebolisce il documento.
   * È per questo che `describeSource` mostra il registro e mai il distributore.
   */
  | {
      readonly kind: 'provider';
      readonly provider: string;
      readonly service: string;
      readonly registro: string;
      readonly reference?: string;
    }
  /** Dato estratto da un documento ufficiale (visura, bilancio depositato, SFCR). */
  | { readonly kind: 'documento'; readonly tipo: string; readonly riferimento: string }
  /** Dato dichiarato dal cliente o raccolto dall'intermediario in intervista. */
  | { readonly kind: 'dichiarato'; readonly da: string }
  /** Dato calcolato dal motore a partire da altri dati già presenti nel modello. */
  | { readonly kind: 'calcolato'; readonly da: readonly string[] }
  /** Valore di benchmark di settore o tabella di mercato. */
  | { readonly kind: 'benchmark'; readonly dataset: string }
  /** Ipotesi esplicita del motore in assenza del dato reale. Va sempre mostrata all'utente. */
  | { readonly kind: 'ipotesi'; readonly motivazione: string }
  /** Riferimento normativo (legge, decreto, regolamento). */
  | { readonly kind: 'norma'; readonly riferimento: string };

/** Quanto ci si può fidare del valore. Si propaga sempre al ribasso nei calcoli derivati. */
export type Confidence = 'alta' | 'media' | 'bassa';

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = { alta: 3, media: 2, bassa: 1 };

/** Un valore con la sua provenienza. */
export interface Sourced<T> {
  readonly value: T;
  readonly source: DataSource;
  /** Data alla quale il dato era vero (non la data di lettura). */
  readonly observedAt: Date;
  readonly confidence: Confidence;
}

export function sourced<T>(
  value: T,
  source: DataSource,
  observedAt: Date,
  confidence: Confidence = 'alta',
): Sourced<T> {
  return { value, source, observedAt, confidence };
}

/**
 * I registri pubblici da cui i dati provengono davvero.
 *
 * Nominati qui una volta sola perché sono ciò che il cliente legge e ciò che
 * l'intermediario dovrà difendere: se un domani cambia il distributore, queste stringhe
 * non si toccano — non descrivono da chi compriamo, ma dove il dato è depositato.
 */
export const REGISTRO_IMPRESE = 'Registro Imprese';
export const BILANCIO_DEPOSITATO = 'Bilancio depositato al Registro Imprese';
export const REGISTRO_PROTESTI = 'Registro protesti e procedure concorsuali';

export function fromProvider<T>(
  value: T,
  provider: string,
  service: string,
  registro: string,
  observedAt: Date,
  confidence: Confidence = 'alta',
): Sourced<T> {
  return { value, source: { kind: 'provider', provider, service, registro }, observedAt, confidence };
}

export function declared<T>(value: T, by: string, observedAt: Date): Sourced<T> {
  return { value, source: { kind: 'dichiarato', da: by }, observedAt, confidence: 'media' };
}

export function assumed<T>(value: T, rationale: string, observedAt: Date): Sourced<T> {
  return { value, source: { kind: 'ipotesi', motivazione: rationale }, observedAt, confidence: 'bassa' };
}

/** Trasforma il valore mantenendo la provenienza. */
export function mapSourced<T, U>(s: Sourced<T>, fn: (value: T) => U): Sourced<U> {
  return { value: fn(s.value), source: s.source, observedAt: s.observedAt, confidence: s.confidence };
}

/** La confidenza di un calcolo non può superare quella del suo input peggiore. */
export function weakestConfidence(...values: readonly Confidence[]): Confidence {
  if (values.length === 0) return 'alta';
  let worst: Confidence = 'alta';
  for (const c of values) {
    if (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[worst]) worst = c;
  }
  return worst;
}

export function confidenceOf(...values: readonly Sourced<unknown>[]): Confidence {
  return weakestConfidence(...values.map((v) => v.confidence));
}

/** Il dato più vecchio del gruppo: determina l'obsolescenza dell'intera analisi. */
export function oldestObservation(...values: readonly Sourced<unknown>[]): Date | null {
  if (values.length === 0) return null;
  return values.reduce<Date>(
    (oldest, v) => (v.observedAt.getTime() < oldest.getTime() ? v.observedAt : oldest),
    values[0]!.observedAt,
  );
}

/** Età del dato in giorni rispetto a una data di riferimento. */
export function ageInDays(s: Sourced<unknown>, asOf: Date): number {
  const ms = asOf.getTime() - s.observedAt.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Età del dato in mesi (approssimata a 30,44 giorni). */
export function ageInMonths(s: Sourced<unknown>, asOf: Date): number {
  return Math.floor(ageInDays(s, asOf) / 30.44);
}

/**
 * Descrizione leggibile della fonte, per report e UI.
 *
 * Per i dati acquistati mostra **il registro pubblico, mai il distributore**: si veda la
 * nota su `DataSource`. Per la diagnostica interna esiste `describeSourceTecnica`.
 */
export function describeSource(source: DataSource): string {
  switch (source.kind) {
    case 'provider':
      return source.registro;
    case 'documento':
      return `${source.tipo} (${source.riferimento})`;
    case 'dichiarato':
      return `Dichiarato da ${source.da}`;
    case 'calcolato':
      return `Calcolato da: ${source.da.join(', ')}`;
    case 'benchmark':
      return `Benchmark di settore · ${source.dataset}`;
    case 'ipotesi':
      return `Ipotesi: ${source.motivazione}`;
    case 'norma':
      return `Riferimento normativo: ${source.riferimento}`;
  }
}

/**
 * Come `describeSource`, ma nomina anche il distributore e il servizio interrogato.
 *
 * Riservata alle pagine tecniche di chi gestisce la piattaforma: serve a capire quale
 * chiamata ha prodotto un dato quando qualcosa non torna. Non va usata in nulla che
 * l'intermediario possa mostrare al proprio cliente.
 */
export function describeSourceTecnica(source: DataSource): string {
  return source.kind === 'provider'
    ? `${source.registro} · via ${source.provider} ${source.service}`
    : describeSource(source);
}
