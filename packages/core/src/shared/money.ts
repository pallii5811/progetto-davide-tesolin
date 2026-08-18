/**
 * Money — importi in centesimi di euro, come intero.
 *
 * Perché non `number` in euro: 0.1 + 0.2 !== 0.3. In un motore che calcola somme assicurande
 * e indennizzi, l'errore in virgola mobile non è un dettaglio accademico: è un contenzioso.
 * Tutti gli importi del dominio attraversano questo tipo.
 */

declare const MoneyBrand: unique symbol;

/** Importo monetario espresso in centesimi di euro. */
export type Money = number & { readonly [MoneyBrand]: 'EUR' };

const CENTS_PER_EURO = 100;

/** Costruisce un importo da euro (accetta decimali, arrotonda al centesimo). */
export function euro(amount: number): Money {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Importo non finito: ${amount}`);
  }
  return Math.round(amount * CENTS_PER_EURO) as Money;
}

/** Costruisce un importo da centesimi già interi. */
export function cents(value: number): Money {
  if (!Number.isInteger(value)) {
    throw new RangeError(`I centesimi devono essere interi: ${value}`);
  }
  return value as Money;
}

export const ZERO: Money = 0 as Money;

/** Converte in euro come numero decimale. Usare solo ai bordi (serializzazione, UI). */
export function toEuro(m: Money): number {
  return m / CENTS_PER_EURO;
}

export function add(...values: readonly Money[]): Money {
  let total = 0;
  for (const v of values) total += v;
  return total as Money;
}

export function subtract(a: Money, b: Money): Money {
  return (a - b) as Money;
}

/** Moltiplicazione per uno scalare (coefficienti, percentuali, aliquote). */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new RangeError(`Fattore non finito: ${factor}`);
  }
  return Math.round(m * factor) as Money;
}

/** Divisione per uno scalare. */
export function divide(m: Money, divisor: number): Money {
  if (divisor === 0) throw new RangeError('Divisione per zero');
  return Math.round(m / divisor) as Money;
}

/** Rapporto fra due importi. Restituisce `null` se il denominatore è zero. */
export function ratio(numerator: Money, denominator: Money): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function isZero(m: Money): boolean {
  return m === 0;
}

export function isPositive(m: Money): boolean {
  return m > 0;
}

export function isNegative(m: Money): boolean {
  return m < 0;
}

export function max(...values: readonly Money[]): Money {
  if (values.length === 0) throw new RangeError('max() richiede almeno un valore');
  return Math.max(...values) as Money;
}

export function min(...values: readonly Money[]): Money {
  if (values.length === 0) throw new RangeError('min() richiede almeno un valore');
  return Math.min(...values) as Money;
}

export function abs(m: Money): Money {
  return Math.abs(m) as Money;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Arrotondamento a taglio commerciale: un fido di 187.432 € non si comunica,
 * si comunica 185.000 €. Arrotonda per difetto al multiplo indicato.
 */
export function roundDownTo(m: Money, stepEuro: number): Money {
  const step = euro(stepEuro);
  if (step <= 0) return m;
  return (Math.floor(m / step) * step) as Money;
}

/** Arrotondamento per eccesso al multiplo indicato. */
export function roundUpTo(m: Money, stepEuro: number): Money {
  const step = euro(stepEuro);
  if (step <= 0) return m;
  return (Math.ceil(m / step) * step) as Money;
}

/** Granularità del taglio commerciale, crescente con l'ordine di grandezza. */
function commercialStep(value: number): number {
  if (value < 10_000) return 100;
  if (value < 100_000) return 1_000;
  if (value < 1_000_000) return 5_000;
  if (value < 10_000_000) return 100_000;
  return 500_000;
}

/**
 * Taglio commerciale **per difetto**: da usare sui limiti di esposizione (fidi, plafond),
 * dove arrotondare in eccesso significa concedere più di quanto l'analisi giustifichi.
 * 1.234 € → 1.200 € · 187.432 € → 185.000 € · 4.312.900 € → 4.300.000 €
 */
export function commercialRound(m: Money): Money {
  const value = toEuro(m);
  if (value <= 0) return ZERO;
  return roundDownTo(m, commercialStep(value));
}

/**
 * Taglio commerciale **per eccesso**: da usare su tutte le somme assicurande.
 *
 * Arrotondare per difetto un capitale da assicurare significa introdurre di propria mano
 * la sottoassicurazione che l'art. 1907 c.c. punisce al momento del sinistro. Su un margine
 * di contribuzione di 3.080.000 €, l'arrotondamento per difetto a 3.000.000 € produce
 * un 2,6% di scopertura su ogni singolo indennizzo futuro.
 * 3.080.000 € → 3.100.000 € · 187.432 € → 190.000 €
 */
export function commercialRoundUp(m: Money): Money {
  const value = toEuro(m);
  if (value <= 0) return ZERO;
  return roundUpTo(m, commercialStep(value));
}

const FORMATTER = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FORMATTER_COMPACT = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function format(m: Money): string {
  return FORMATTER.format(toEuro(m));
}

/** Formato senza decimali, per report e dashboard. */
export function formatCompact(m: Money): string {
  return FORMATTER_COMPACT.format(toEuro(m));
}

export const Money = {
  euro,
  cents,
  ZERO,
  toEuro,
  add,
  subtract,
  multiply,
  divide,
  ratio,
  isZero,
  isPositive,
  isNegative,
  max,
  min,
  abs,
  compare,
  roundDownTo,
  roundUpTo,
  commercialRound,
  commercialRoundUp,
  format,
  formatCompact,
} as const;
