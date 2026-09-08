import { describe, expect, it } from 'vitest';
import { leggiPericolositaIdraulica, urlGetFeature } from '../src/territorio/idraulica.js';

function fetchConRisposte(
  risposte: readonly { readonly ok: boolean; readonly body: unknown }[],
): typeof fetch {
  let i = 0;
  return async () => {
    const r = risposte[i] ?? { ok: false, body: {} };
    i += 1;
    return {
      ok: r.ok,
      json: async () => r.body,
    } as Response;
  };
}

describe('leggiPericolositaIdraulica', () => {
  it('restituisce alta al primo hit P3', async () => {
    const livello = await leggiPericolositaIdraulica(44.8, 11.6, {
      fetchImpl: fetchConRisposte([{ ok: true, body: { features: [{}] } }]),
    });
    expect(livello).toBe('alta');
  });

  it('passa a P2 se P3 è vuoto', async () => {
    const livello = await leggiPericolositaIdraulica(44.8, 11.6, {
      fetchImpl: fetchConRisposte([
        { ok: true, body: { features: [] } },
        { ok: true, body: { numberMatched: 1 } },
      ]),
    });
    expect(livello).toBe('media');
  });

  it('restituisce null fuori area e su timeout — non inventa bassa', async () => {
    const fuori = await leggiPericolositaIdraulica(45.5, 9.2, {
      fetchImpl: fetchConRisposte([
        { ok: true, body: { features: [] } },
        { ok: true, body: { features: [] } },
        { ok: true, body: { features: [] } },
      ]),
    });
    expect(fuori).toBeNull();

    const timeout = await leggiPericolositaIdraulica(45.5, 9.2, {
      fetchImpl: async () => {
        throw new Error('timeout');
      },
    });
    expect(timeout).toBeNull();
  });
});

describe('L’ordine degli assi del bbox', () => {
  /*
    La riga che ha tenuto la funzione spenta senza che nulla diventasse rosso.

    Il bbox era scritto `lat,lon` — l'ordine che la norma WFS 2.0 prescrive per EPSG:4326 —
    e il servizio rispondeva HTTP 200 con zero poligoni su OGNI punto d'Italia, delta del
    Po compreso. Zero poligoni diventa `null`, che la scheda stampa «non determinata»:
    identico a com'era prima che la funzione esistesse. Le prove a risposte finte non
    potevano vederlo, perché la risposta finta non sa dove le è stato chiesto di guardare.

    Misurato sul servizio vero prendendo una coordinata DA DENTRO un poligono dello strato:
    con `lat,lon` numberMatched 0, con `lon,lat` numberMatched 1.
  */
  it('mette la longitudine per prima, e il punto chiesto sta dentro il riquadro', () => {
    const url = urlGetFeature(
      'https://esempio.invalid/wfs',
      'nz1:aree_peric_idraulica_p3',
      12.2503,
      44.4762,
    );
    const bbox = new URL(url).searchParams.get('bbox') ?? '';
    const [minX, minY, maxX, maxY, crs] = bbox.split(',');

    expect(crs).toBe('EPSG:4326');
    expect(Number(minX)).toBeLessThan(12.2503);
    expect(Number(maxX)).toBeGreaterThan(12.2503);
    expect(Number(minY)).toBeLessThan(44.4762);
    expect(Number(maxY)).toBeGreaterThan(44.4762);

    // La longitudine italiana sta sotto la latitudine italiana: se i due si invertissero,
    // il primo numero diventerebbe il più grande, ed è l'unico modo di accorgersene qui.
    expect(Number(minX)).toBeLessThan(Number(minY));
  });

  it('il riquadro è piccolo: undici metri, non un comune', () => {
    const url = urlGetFeature('https://esempio.invalid/wfs', 'nz1:aree_peric_idraulica_p1', 9.19, 45.46);
    const [minX, minY, maxX, maxY] = (new URL(url).searchParams.get('bbox') ?? '').split(',').map(Number);
    expect(maxX - minX).toBeLessThan(0.001);
    expect(maxY - minY).toBeLessThan(0.001);
  });
});
