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

/**
 * La media pesata dei valori disponibili, insieme a **quanto modello ha davvero pesato**.
 *
 * La copertura non è un di più: senza, chi legge il numero non sa se poggia su sette
 * fattori o su tre, e una media rinormalizzata su tre fattori scelti dall'assenza degli
 * altri non è la stessa grandezza di una calcolata su sette. Prima veniva calcolata e
 * buttata via dentro la funzione.
 */
export interface MediaPesata {
  /** La media, oppure null se nessun valore era disponibile. */
  readonly media: number | null;
  /** Somma dei pesi dei valori effettivamente disponibili. */
  readonly pesoDisponibile: number;
  /** Somma di tutti i pesi dichiarati, disponibili o no. */
  readonly pesoTotale: number;
  /** Quota del peso complessivo su cui la media si regge, da 0 a 1. */
  readonly copertura: number;
  readonly valutati: number;
  readonly totali: number;
}

export interface OpzioniMediaPesata {
  /**
   * Pavimento sulla copertura, da 0 a 1: il denominatore non scende sotto questa
   * frazione del peso totale.
   *
   * Senza pavimento la rinormalizzazione **regala** il peso dei valori assenti a quelli
   * presenti, e il risultato sale quando i superstiti sono i più alti — cioè il punteggio
   * migliora togliendo dati. Il pavimento non attribuisce un valore ai mancanti (quello
   * sarebbe inventarli, e l'assenza resta assenza): dice che oltre una certa quota di
   * modello mancante la media smette di estrapolare, e non certifica più di quanto abbia
   * misurato.
   *
   * Assente: nessun pavimento, comportamento storico.
   */
  readonly pavimentoDiCopertura?: number;
}

export function mediaPesataDefinita(
  entries: readonly { readonly value: number | null; readonly weight: number }[],
  opzioni: OpzioniMediaPesata = {},
): MediaPesata {
  let weightedSum = 0;
  let pesoDisponibile = 0;
  let pesoTotale = 0;
  let valutati = 0;
  for (const entry of entries) {
    pesoTotale += entry.weight;
    if (entry.value === null) continue;
    weightedSum += entry.value * entry.weight;
    pesoDisponibile += entry.weight;
    valutati += 1;
  }

  const copertura = pesoTotale === 0 ? 0 : pesoDisponibile / pesoTotale;
  const pavimento =
    opzioni.pavimentoDiCopertura === undefined ? 0 : opzioni.pavimentoDiCopertura * pesoTotale;
  const denominatore = Math.max(pesoDisponibile, pavimento);

  return {
    media: pesoDisponibile === 0 ? null : weightedSum / denominatore,
    pesoDisponibile,
    pesoTotale,
    copertura,
    valutati,
    totali: entries.length,
  };
}

/**
 * Media pesata dei soli valori disponibili, con rinormalizzazione dei pesi.
 *
 * Delega a mediaPesataDefinita e ne scarta la copertura: due implementazioni della
 * stessa domanda sono il modo con cui questo prodotto ha già pagato più di un difetto.
 */
export function weightedAverageDefined(
  entries: readonly { readonly value: number | null; readonly weight: number }[],
): number | null {
  return mediaPesataDefinita(entries).media;
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
