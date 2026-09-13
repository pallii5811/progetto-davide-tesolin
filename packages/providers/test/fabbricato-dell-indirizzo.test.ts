import { describe, expect, it } from 'vitest';
import { leggiContestoTerritoriale } from '../src/territorio/contesto.js';

/**
 * Il capitale fabbricati si stima sul fabbricato dell'indirizzo, non sull'isolato.
 *
 * Misurato su tre imprese vere il 13/09/2026: la somma dei fabbricati entro 80 m dava 18.944
 * m² a un autotrasportatore (sette capannoni fino a 70 m), 8.264 m² a una carpenteria la cui
 * sede sta fra quaranta case, 7.664 m² a un poliambulatorio in centro. Qui la stessa forma, su
 * geometrie costruite: un fabbricato sul punto e un capannone grande più in là.
 */
const LAT = 45.62741;
const LON = 10.08347;
const M_LAT = 110_574;
const M_LON = 111_320 * Math.cos((LAT * Math.PI) / 180);

/** Un rettangolo di `larghezza` × `altezza` metri con l'angolo sud-ovest a (est, nord) metri dal punto. */
function rettangolo(est: number, nord: number, larghezza: number, altezza: number) {
  const p = (x: number, y: number) => ({ lat: LAT + y / M_LAT, lon: LON + x / M_LON });
  return [
    p(est, nord),
    p(est, nord + altezza),
    p(est + larghezza, nord + altezza),
    p(est + larghezza, nord),
  ];
}

function risposta(...geometrie: ReturnType<typeof rettangolo>[]) {
  return {
    elements: geometrie.map((geometry) => ({ type: 'way', tags: { building: 'industrial' }, geometry })),
  };
}

const fetchDi = (corpo: unknown) =>
  (async () => new Response(JSON.stringify(corpo), { status: 200 })) as unknown as typeof fetch;

describe('Il fabbricato dell’indirizzo', () => {
  it('conta quello che contiene il punto, non il capannone grande a 60 m', async () => {
    const c = await leggiContestoTerritoriale(LAT, LON, {
      fetchImpl: fetchDi(risposta(rettangolo(-20, -20, 40, 40), rettangolo(60, 0, 100, 80))),
    });
    expect(c?.fabbricati?.quanti).toBe(2);
    expect(c?.fabbricati?.principaleDistanzaMetri).toBe(0);
    expect(c?.fabbricati?.principaleMq ?? 0).toBeGreaterThan(1_550);
    expect(c?.fabbricati?.principaleMq ?? 0).toBeLessThan(1_650);
    // La somma resta come contesto, ed è proprio il numero che non va assicurato.
    expect(c?.fabbricati?.superficieCopertaMq ?? 0).toBeGreaterThan(9_500);
  });

  it('entro 30 m vince la distanza, non la grandezza', async () => {
    // RED GROUP: la sede sta in un fabbricato di 349 m² fra case e capannoni più grandi.
    const c = await leggiContestoTerritoriale(LAT, LON, {
      fetchImpl: fetchDi(risposta(rettangolo(-5, -5, 10, 10), rettangolo(8, -20, 40, 40))),
    });
    expect(c?.fabbricati?.principaleDistanzaMetri).toBe(0);
    expect(c?.fabbricati?.principaleMq ?? 0).toBeLessThan(150);
  });

  it('se nessuno contiene il punto prende il più vicino entro 30 m', async () => {
    const c = await leggiContestoTerritoriale(LAT, LON, {
      fetchImpl: fetchDi(risposta(rettangolo(12, 0, 30, 30), rettangolo(55, 0, 80, 80))),
    });
    expect(c?.fabbricati?.principaleDistanzaMetri).toBe(12);
    expect(c?.fabbricati?.principaleMq ?? 0).toBeLessThan(950);
  });

  it('oltre 30 m nessun fabbricato è dell’impresa: il capitale resta da rilevare', async () => {
    const c = await leggiContestoTerritoriale(LAT, LON, {
      fetchImpl: fetchDi(risposta(rettangolo(45, 0, 80, 80))),
    });
    expect(c?.fabbricati?.quanti).toBe(1);
    expect(c?.fabbricati?.principaleMq).toBeNull();
  });
});
