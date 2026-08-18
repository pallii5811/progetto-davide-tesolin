/** Utilità numeriche condivise dal motore di scoring. */

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface ControlPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Interpolazione lineare a tratti su una curva definita da punti di controllo.
 *
 * È il modo con cui il motore traduce un indice di bilancio in un punteggio 0–100
 * senza soglie a gradino: due aziende con current ratio 1,49 e 1,51 non devono
 * ritrovarsi in classi di merito diverse per due centesimi.
 *
 * I punti devono essere ordinati per `x` crescente. Fuori dagli estremi il valore
 * è bloccato sul punto più vicino.
 */
export function interpolate(value: number, points: readonly ControlPoint[]): number {
  if (points.length === 0) throw new RangeError('interpolate() richiede almeno un punto di controllo');
  const first = points[0]!;
  const last = points[points.length - 1]!;

  if (value <= first.x) return first.y;
  if (value >= last.x) return last.y;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (value >= a.x && value <= b.x) {
      const span = b.x - a.x;
      if (span === 0) return b.y;
      return a.y + ((value - a.x) / span) * (b.y - a.y);
    }
  }
  return last.y;
}

/**
 * Media dei valori non nulli. Restituisce `null` se non ce n'è nessuno:
 * un indice mancante non deve essere trattato come uno zero.
 */
export function averageDefined(values: readonly (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length === 0) return null;
  return defined.reduce((sum, v) => sum + v, 0) / defined.length;
}

/** Media pesata dei soli valori disponibili, con rinormalizzazione dei pesi. */
export function weightedAverageDefined(
  entries: readonly { readonly value: number | null; readonly weight: number }[],
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    if (entry.value === null) continue;
    weightedSum += entry.value * entry.weight;
    totalWeight += entry.weight;
  }
  return totalWeight === 0 ? null : weightedSum / totalWeight;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatPercent(value: number, decimals = 1): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
