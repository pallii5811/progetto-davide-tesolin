/**
 * Una pratica aperta si legge, non si ricompra.
 *
 * Gli accertamenti asincroni si pagano **all'apertura**: quarantacinque centesimi per gli
 * eventi negativi. Le letture successive sono gratuite. Il guasto che questi test
 * presidiano è quindi economico, non funzionale: se l'attesa scade — e scade proprio
 * quando il servizio è lento — l'analisi successiva non deve aprire una seconda pratica
 * per accertare gli stessi protesti.
 *
 * Sul portafoglio di un intermediario che rianalizza duecento aziende, sbagliare qui
 * significa novanta euro invece di quarantacinque.
 */

import { describe, expect, it } from 'vitest';
import { MemoryCache, MemoryCostLedger } from '../src/http.js';
import { OpenApiProvider } from '../src/openapi/provider.js';

/** Risposta della pratica: resta in lavorazione per sempre, così l'attesa scade. */
function servizioLento(chiamate: string[]) {
  return ((url: string, init?: RequestInit): Promise<Response> => {
    chiamate.push(`${init?.method ?? 'GET'} ${String(url)}`);
    const corpo = String(url).includes('/IT-negativita') && init?.method === 'POST'
      ? { data: { id: 'pratica-1', status: 'PENDING' } }
      : { data: { status: 'PENDING' } };
    return Promise.resolve(
      new Response(JSON.stringify(corpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

/** Risposta completa: la pratica esiste già e il risultato è pronto. */
function servizioPronto(chiamate: string[]) {
  return ((url: string, init?: RequestInit): Promise<Response> => {
    chiamate.push(`${init?.method ?? 'GET'} ${String(url)}`);
    const indirizzo = String(url);

    if (indirizzo.includes('/dettaglio')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              presenzaProtesti: false,
              protesti: null,
              presenzaPregiudizievoli: false,
              pregiudizievoli: null,
              presenzaProcedure: false,
              procedure: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({ data: { id: 'pratica-1', status: 'COMPLETED' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

describe('Pratiche asincrone già aperte', () => {
  it('non riapre una pratica di cui conserva l’identificativo', async () => {
    const cache = new MemoryCache();
    const ledger = new MemoryCostLedger();
    const chiamate: string[] = [];

    const provider = new OpenApiProvider({
      token: 't',
      cache,
      ledger,
      fetchImpl: servizioPronto(chiamate),
      // L'orologio fisso rende deterministica la scadenza della cache.
      now: () => new Date('2026-08-19T00:00:00Z'),
    });

    await provider.fetchProfile('12485671007', 'completo');
    const dopoLaPrima = ledger.totaleCentesimi();
    chiamate.length = 0;

    await provider.fetchProfile('12485671007', 'completo');

    // La seconda analisi non deve contenere **nessun POST**: aprire una pratica è
    // l'unica operazione che costa, e quella pratica è già stata pagata.
    expect(chiamate.filter((c) => c.startsWith('POST'))).toEqual([]);
    expect(ledger.totaleCentesimi()).toBe(dopoLaPrima);
  }, 90_000);

  it('conserva l’identificativo anche quando l’attesa scade', async () => {
    const cache = new MemoryCache();
    const chiamate: string[] = [];

    const provider = new OpenApiProvider({
      token: 't',
      cache,
      fetchImpl: servizioLento(chiamate),
    });

    await provider.fetchProfile('12485671007', 'completo');

    /*
      È il caso che conta: il servizio non ha risposto in tempo, l'analisi è uscita senza
      eventi negativi — legittimo — ma la pratica **è stata aperta e pagata**. Dimenticarla
      qui significa ricomprarla al prossimo tentativo, cioè esattamente quando l'utente
      riprova perché la prima volta non aveva funzionato.
    */
    expect(cache.get('pratica:negativita:12485671007')?.value).toBe('pratica-1');
  }, 120_000);
});
