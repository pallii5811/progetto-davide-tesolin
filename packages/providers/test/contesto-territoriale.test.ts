/**
 * Il contesto fisico attorno a un'ubicazione.
 *
 * Due presidi, e nessuno dei due riguarda la felicità del caso normale.
 *
 * Il primo: **il servizio si identifica**. Overpass rifiuta con 406 chi non lo fa, e il
 * rifiuto arriva come pagina HTML — che letta come JSON diventa un'eccezione oscura,
 * lontanissima dalla causa vera. Il client HTTP di Node non manda alcuna identificazione:
 * il difetto è quindi invisibile finché non si prova contro il servizio reale, e sparisce
 * appena qualcuno riscrive la chiamata senza sapere perché quell'intestazione c'era.
 *
 * Il secondo: **un guasto esterno non fa cadere l'analisi**. Il contesto arricchisce il
 * documento, non lo determina. Un servizio volontario lento, sovraccarico o irraggiungibile
 * deve costare una sezione in meno, mai il documento che l'intermediario deve consegnare.
 */

import { describe, expect, it, vi } from 'vitest';
import { leggiContestoTerritoriale, leggiEsitoContesto } from '../src/territorio/contesto.js';
import { MemoryCache } from '../src/http.js';

/** Risposta minima nella forma di Overpass. */
const RISPOSTA = {
  elements: [
    {
      type: 'node',
      lat: 41.83,
      lon: 12.48,
      tags: { amenity: 'fire_station', name: 'Distaccamento di prova' },
    },
    {
      type: 'node',
      lat: 41.8072,
      lon: 12.4785,
      tags: { shop: 'car_repair', name: 'Autofficina Vicina' },
    },
    {
      type: 'node',
      lat: 41.8073,
      lon: 12.4786,
      tags: { shop: 'greengrocer', name: 'Fruttivendolo' },
    },
  ],
};

function fetchFinto(risposta: unknown, stato = 200): typeof fetch {
  return vi.fn(async () =>
    Promise.resolve(
      new Response(JSON.stringify(risposta), {
        status: stato,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('Contesto territoriale', () => {
  it('si identifica verso il servizio', async () => {
    /*
      Overpass è donato, e la sua politica d'uso chiede di dichiarare chi chiama perché
      chi lo gestisce possa contattare chi ne abusa invece di bloccarlo. Senza questa
      intestazione la risposta è 406, e il prodotto risulta «senza dati» su ogni
      ubicazione — un guasto che sembra assenza di copertura e non lo è.
    */
    const chiamata = fetchFinto(RISPOSTA);
    await leggiContestoTerritoriale(41.8071, 12.47843, { fetchImpl: chiamata });

    const intestazioni = (chiamata as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]![1].headers as Record<string, string>;

    expect(intestazioni['User-Agent']).toBeDefined();
    expect(intestazioni['User-Agent']!.length).toBeGreaterThan(10);
  });

  it('riconosce le attività che aggravano il rischio incendio', async () => {
    const c = await leggiContestoTerritoriale(41.8071, 12.47843, {
      fetchImpl: fetchFinto(RISPOSTA),
    });

    // L'autofficina aggrava — solventi e inneschi a pochi metri — il fruttivendolo no.
    // È la distinzione che i questionari incendio chiedono, e che qui è automatica.
    expect(c?.attivitaCheAggravano).toBe(1);
    expect(c?.attivitaVicine.find((a) => a.aggravaIlRischio)?.categoria).toBe('autofficina');
  });

  it('ordina le caserme dalla più vicina e stima il tempo di arrivo', async () => {
    const c = await leggiContestoTerritoriale(41.8071, 12.47843, {
      fetchImpl: fetchFinto(RISPOSTA),
    });

    const prima = c?.vigiliDelFuoco[0];
    expect(prima?.nome).toBe('Distaccamento di prova');
    expect(prima?.distanzaKm).toBeGreaterThan(0);
    // Il tempo non è mai zero: anche la caserma di fianco impiega qualcosa a uscire.
    expect(prima?.minutiStimati).toBeGreaterThanOrEqual(1);
  });

  it('attribuisce la fonte, come la licenza richiede', async () => {
    // I dati sono ODbL: mostrarli senza attribuzione è una violazione di licenza su un
    // documento che l'intermediario consegna a un cliente.
    const c = await leggiContestoTerritoriale(41.8071, 12.47843, {
      fetchImpl: fetchFinto(RISPOSTA),
    });
    expect(c?.fonte).toContain('OpenStreetMap');
  });

  it('un guasto del servizio non fa cadere l’analisi', async () => {
    for (const scenario of [
      { nome: 'rifiuto HTTP', impl: fetchFinto({}, 429) },
      { nome: 'risposta illeggibile', impl: fetchFinto('non json') },
      {
        nome: 'rete assente',
        impl: vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))) as unknown as typeof fetch,
      },
    ]) {
      const c = await leggiContestoTerritoriale(41.8071, 12.47843, { fetchImpl: scenario.impl });
      expect(c, `${scenario.nome} avrebbe dovuto restituire null senza sollevare`).toBeNull();
    }
  });

  it('distingue «fonte occupata» da «fonte muta»', async () => {
    /*
      Overpass concede due slot per indirizzo IP e rifiuta con 429 quando sono presi. Per
      una piattaforma che analizza aziende una dopo l'altra è la condizione **normale**, e
      un `null` indistinto la faceva sembrare un vicinato pulito.

      Le due condizioni portano ad azioni opposte: «occupato» si risolve riprovando,
      «non raggiunto» va indagato. Chi legge il report deve poterle distinguere.
    */
    const occupato = await leggiEsitoContesto(41.8071, 12.47843, {
      fetchImpl: fetchFinto({}, 429),
      attesaMassimaMs: 0,
    });
    expect(occupato.esito).toBe('occupato');

    const muto = await leggiEsitoContesto(41.8071, 12.47843, {
      fetchImpl: fetchFinto({}, 503),
    });
    expect(muto.esito).toBe('non-raggiunto');
  });

  it('dopo un rifiuto per limite d’uso attende lo slot annunciato e riprova una volta', async () => {
    /*
      Ritentare subito è il comportamento che fa bloccare un indirizzo IP. La politica
      d'uso di Overpass chiede di leggere `/api/status`, che dichiara quando il prossimo
      slot si libera, e di aspettare quel tempo.
    */
    const chiamate: string[] = [];
    let interrogazioni = 0;

    const impl = vi.fn(async (url: string | URL | Request) => {
      const indirizzo = url instanceof Request ? url.url : url.toString();
      chiamate.push(indirizzo);

      if (indirizzo.endsWith('/status')) {
        return Promise.resolve(new Response('Rate limit: 2\n1 slots available now.\n', { status: 200 }));
      }

      interrogazioni += 1;
      // Il primo tentativo trova la coda, il secondo passa.
      return Promise.resolve(
        interrogazioni === 1
          ? new Response('{}', { status: 429 })
          : new Response(JSON.stringify(RISPOSTA), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
      );
    }) as unknown as typeof fetch;

    const esito = await leggiEsitoContesto(41.8071, 12.47843, { fetchImpl: impl });

    expect(esito.esito).toBe('osservato');
    expect(chiamate.filter((c) => c.endsWith('/status'))).toHaveLength(1);
    expect(interrogazioni).toBe(2);
  });

  it('se l’attesa annunciata è troppo lunga, rinuncia e lo dichiara', async () => {
    /*
      Il contesto è un accessorio: far aspettare mezzo minuto chi sta producendo un
      documento, per una sezione in più, è la scelta sbagliata. Meglio dirlo.
    */
    const impl = vi.fn(async (url: string | URL | Request) =>
      Promise.resolve(
        (url instanceof Request ? url.url : url.toString()).endsWith('/status')
          ? new Response('Rate limit: 2\n0 slots available now.\nSlot available after: ..., in 240 seconds.\n', { status: 200 })
          : new Response('{}', { status: 429 }),
      ),
    ) as unknown as typeof fetch;

    const esito = await leggiEsitoContesto(41.8071, 12.47843, { fetchImpl: impl, attesaMassimaMs: 8_000 });

    expect(esito.esito).toBe('occupato');
  });

  it('non richiama il servizio per un’ubicazione già letta', async () => {
    /*
      La cache è la difesa verso un'infrastruttura volontaria: il vicinato di un capannone
      non cambia in novanta giorni, e rileggerlo a ogni analisi significa pesare su un
      servizio donato per un dato che si sapeva già.
    */
    const chiamata = fetchFinto(RISPOSTA);
    const cache = new MemoryCache();

    await leggiContestoTerritoriale(45.622, 9.96, { fetchImpl: chiamata, cache });
    await leggiContestoTerritoriale(45.622, 9.96, { fetchImpl: chiamata, cache });

    expect((chiamata as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });
});
