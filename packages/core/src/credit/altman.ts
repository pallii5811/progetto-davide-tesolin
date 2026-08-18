/**
 * Altman Z''-score.
 *
 * Variante per imprese non quotate e non manifatturiere: è quella corretta per la
 * stragrande maggioranza delle PMI italiane (servizi, commercio, costruzioni).
 *
 * Si è scelta deliberatamente una formula **pubblicata e verificabile** invece di un
 * modello proprietario opaco. Uno score che il cliente può ricalcolare a mano è uno
 * score che il cliente può contestare — ed è precisamente ciò che lo rende difendibile
 * davanti a un tribunale o a un'autorità di vigilanza.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { BilancioRiclassificato } from '../company/financials.js';

export type AltmanZone = 'sicurezza' | 'incertezza' | 'rischio';

export interface AltmanResult {
  readonly z: number;
  readonly zone: AltmanZone;
  readonly x1: number;
  readonly x2: number;
  readonly x3: number;
  readonly x4: number;
}

export const ALTMAN_COEFFICIENTS = {
  x1: 6.56,
  x2: 3.26,
  x3: 6.72,
  x4: 1.05,
} as const;

export const ALTMAN_SOGLIA_SICUREZZA = 2.6;
export const ALTMAN_SOGLIA_RISCHIO = 1.1;

export const ALTMAN_ZONE_LABEL: Readonly<Record<AltmanZone, string>> = {
  sicurezza: 'Zona di sicurezza',
  incertezza: 'Zona di incertezza',
  rischio: 'Zona di rischio di insolvenza',
};

export function computeAltmanZ(b: BilancioRiclassificato): Explained<AltmanResult | null> {
  const { sp, ce } = b;

  const builder = explain("Altman Z''-score")
    .formula("Z'' = 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4")
    .reference("Altman, E. I. — modello Z''-score per imprese non quotate e non manifatturiere");

  if (!Money.isPositive(sp.totaleAttivo)) {
    return builder
      .note('Totale attivo nullo o negativo: lo Z-score non è calcolabile.')
      .confidence('bassa')
      .value(null);
  }

  const totaleAttivo = sp.totaleAttivo;

  // X1 — capitale circolante netto sul totale attivo: tensione di liquidità.
  const x1 = sp.capitaleCircolanteNetto / totaleAttivo;

  // X2 — utili accumulati sul totale attivo: capacità storica di autofinanziamento.
  // Proxy: riserve + utili portati a nuovo (il bilancio abbreviato non isola le riserve di utili).
  const utiliAccumulati = Money.add(b.origine.passivo.riserve, b.origine.passivo.utiliPortatiANuovo);
  const x2 = utiliAccumulati / totaleAttivo;

  // X3 — redditività operativa sul capitale investito.
  const x3 = ce.ebit / totaleAttivo;

  // X4 — mezzi propri su mezzi di terzi: cuscinetto patrimoniale.
  const x4 = Money.isPositive(sp.totaleDebiti) ? sp.patrimonioNetto / sp.totaleDebiti : 4;

  const z =
    ALTMAN_COEFFICIENTS.x1 * x1 +
    ALTMAN_COEFFICIENTS.x2 * x2 +
    ALTMAN_COEFFICIENTS.x3 * x3 +
    ALTMAN_COEFFICIENTS.x4 * x4;

  const zone: AltmanZone =
    z > ALTMAN_SOGLIA_SICUREZZA ? 'sicurezza' : z < ALTMAN_SOGLIA_RISCHIO ? 'rischio' : 'incertezza';

  return builder
    .input('X1 — CCN / Totale attivo', formatRatio(x1))
    .input('X2 — Utili accumulati / Totale attivo', formatRatio(x2))
    .input('X3 — EBIT / Totale attivo', formatRatio(x3))
    .input('X4 — Patrimonio netto / Totale debiti', formatRatio(x4))
    .input('Esercizio', String(b.anno))
    .note(`Z'' = ${z.toFixed(2)} → ${ALTMAN_ZONE_LABEL[zone]}.`)
    .note(
      `Soglie: > ${ALTMAN_SOGLIA_SICUREZZA.toFixed(2)} sicurezza · ` +
        `${ALTMAN_SOGLIA_RISCHIO.toFixed(2)}–${ALTMAN_SOGLIA_SICUREZZA.toFixed(2)} incertezza · ` +
        `< ${ALTMAN_SOGLIA_RISCHIO.toFixed(2)} rischio.`,
    )
    .noteIf(
      !Money.isPositive(sp.totaleDebiti),
      'Assenza di debiti: X4 posto convenzionalmente a 4,00 per evitare la divisione per zero.',
    )
    .noteIf(
      !Money.isPositive(sp.patrimonioNetto),
      'Patrimonio netto negativo: la società è in perdita di capitale, verificare art. 2482-bis/ter c.c.',
    )
    .value({ z, zone, x1, x2, x3, x4 });
}

function formatRatio(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
    value,
  );
}

/**
 * Converte lo Z'' in un punteggio 0–100 con andamento monotono, per poterlo comporre
 * con gli altri fattori dello score. La mappatura è lineare a tratti sulle soglie del modello.
 */
export function altmanToScore(z: number): number {
  if (z <= 0) return 0;
  if (z < ALTMAN_SOGLIA_RISCHIO) return (z / ALTMAN_SOGLIA_RISCHIO) * 30;
  if (z < ALTMAN_SOGLIA_SICUREZZA) {
    return 30 + ((z - ALTMAN_SOGLIA_RISCHIO) / (ALTMAN_SOGLIA_SICUREZZA - ALTMAN_SOGLIA_RISCHIO)) * 45;
  }
  // Oltre la soglia di sicurezza la curva si appiattisce: da 75 a 100, saturando a Z'' = 8.
  return Math.min(100, 75 + ((z - ALTMAN_SOGLIA_SICUREZZA) / (8 - ALTMAN_SOGLIA_SICUREZZA)) * 25);
}
