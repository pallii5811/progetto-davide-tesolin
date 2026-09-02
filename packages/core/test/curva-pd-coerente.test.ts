import { describe, expect, it } from 'vitest';
import { classifica, probabilitaDefault, probabilitaDefaultSpiegata } from '../src/index.js';
import type { ClasseDiMerito } from '../src/index.js';

/**
 * La curva score → PD, tenuta coerente finché non sarà calibrata.
 *
 * La curva è dichiarata per quello che è — otto punti tarati sull'esperienza di settore, non
 * sui default osservati dalla piattaforma — e la scheda lo scrive accanto a ogni PD. La
 * calibrazione vera richiede esiti: imprese analizzate a una data e poi, dodici mesi dopo,
 * fallite o no. `scripts/calibra-curva-pd.ts` la esegue quando gli esiti bastano e si
 * rifiuta, dicendolo, quando non bastano. Oggi non bastano.
 *
 * Nel frattempo ciò che si può garantire è la COERENZA: che la curva non contraddica sé
 * stessa né le classi che le stanno sopra. Non è calibrazione, e non finge di esserlo; è
 * il requisito minimo perché una calibrazione futura abbia una forma su cui poggiare.
 *
 *  - la PD scende sempre quando lo score sale: due punteggi non possono avere PD invertite;
 *  - resta fra 0 e il 35% del punto peggiore: nessuno score produce una PD assurda;
 *  - le cinque classi occupano intervalli di PD che non si sovrappongono, e i confini di
 *    classe coincidono con i punti dichiarati della curva — 80 → 0,80 %, 65 → 2 %,
 *    50 → 4,5 %, 35 → 9 % — così la scheda e la tabella di DOMINIO.md dicono la stessa cosa;
 *  - senza score non c'è PD: la curva non si applica a un numero inventato.
 */
describe('La curva score → PD non contraddice sé stessa', () => {
  it('scende strettamente da score 1 a score 100', () => {
    for (let s = 2; s <= 100; s += 1) {
      expect(probabilitaDefault(s), `PD(${s}) ≥ PD(${s - 1})`).toBeLessThan(probabilitaDefault(s - 1));
    }
  });

  it('resta fra zero e il punto peggiore dichiarato', () => {
    for (let s = 1; s <= 100; s += 1) {
      const pd = probabilitaDefault(s);
      expect(pd).toBeGreaterThan(0);
      expect(pd).toBeLessThanOrEqual(0.35);
    }
    expect(probabilitaDefault(1)).toBeCloseTo(0.35, 6);
    expect(probabilitaDefault(100)).toBeCloseTo(0.0015, 6);
  });

  it('ai confini di classe vale esattamente il punto dichiarato', () => {
    // Sono i numeri scritti in DOMINIO.md § 4 e stampati dalla scheda in «Come è stato
    // calcolato»: se qualcuno sposta un punto della curva senza aggiornare la tabella, è
    // questa riga a fermarlo.
    expect(probabilitaDefault(80)).toBeCloseTo(0.008, 6);
    expect(probabilitaDefault(65)).toBeCloseTo(0.02, 6);
    expect(probabilitaDefault(50)).toBeCloseTo(0.045, 6);
    expect(probabilitaDefault(35)).toBeCloseTo(0.09, 6);
  });

  it('le classi occupano intervalli di PD disgiunti e ordinati', () => {
    const ordine: readonly ClasseDiMerito[] = ['A', 'B', 'C', 'D', 'E'];
    const intervalli = new Map<ClasseDiMerito, { min: number; max: number }>();

    for (let s = 1; s <= 100; s += 1) {
      const classe = classifica(s);
      const pd = probabilitaDefault(s);
      const attuale = intervalli.get(classe) ?? { min: pd, max: pd };
      intervalli.set(classe, { min: Math.min(attuale.min, pd), max: Math.max(attuale.max, pd) });
    }

    expect([...intervalli.keys()].sort()).toEqual([...ordine].sort());
    for (let i = 1; i < ordine.length; i += 1) {
      const migliore = intervalli.get(ordine[i - 1]!)!;
      const peggiore = intervalli.get(ordine[i]!)!;
      expect(migliore.max, `${ordine[i - 1]} deve stare sotto ${ordine[i]}`).toBeLessThan(peggiore.min);
    }
  });

  it('senza score non c’è PD, e la spiegazione lo dice', () => {
    const spiegata = probabilitaDefaultSpiegata(null, 'bassa');
    expect(spiegata.value).toBeNull();
    expect(spiegata.explanation.notes.join(' ')).toMatch(/non è determinabile/);
  });

  it('con lo score la spiegazione dichiara che la curva NON è calibrata sui default osservati', () => {
    // La riserva è parte del numero: toglierla dalla spiegazione renderebbe la PD una
    // misura, e non lo è ancora.
    const spiegata = probabilitaDefaultSpiegata(44, 'media');
    expect(spiegata.value).toBeCloseTo(probabilitaDefault(44), 9);
    expect(spiegata.explanation.notes.join(' ')).toMatch(/non una stima sui default osservati/);
  });
});
