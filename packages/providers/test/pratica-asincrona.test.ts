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

    await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });
    const dopoLaPrima = ledger.totaleCentesimi();
    chiamate.length = 0;

    await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });

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

    await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });

    /*
      È il caso che conta: il servizio non ha risposto in tempo, l'analisi è uscita senza
      eventi negativi — legittimo — ma la pratica **è stata aperta e pagata**. Dimenticarla
      qui significa ricomprarla al prossimo tentativo, cioè esattamente quando l'utente
      riprova perché la prima volta non aveva funzionato.
    */
    expect(cache.get('pratica:negativita:12485671007')?.value).toBe('pratica-1');
  }, 120_000);
});

/**
 * Una pratica in lavorazione non è una pratica pulita.
 *
 * È la distinzione più pericolosa di tutta l'integrazione. Il servizio, interrogato mentre
 * l'accertamento è ancora in corso, può restituire un documento con gli elenchi vuoti:
 * identico, byte per byte, a quello di un'azienda senza protesti.
 *
 * Confonderli significa scrivere «nessun evento pregiudizievole» in uno score di credito e
 * in un fascicolo di adeguatezza, su un'impresa che nessuno ha finito di verificare.
 */
describe('Risultato letto solo a pratica conclusa', () => {
  function servizio(statoPratica: string, chiamate: string[]) {
    return ((url: string, init?: RequestInit): Promise<Response> => {
      const indirizzo = String(url);
      chiamate.push(`${init?.method ?? 'GET'} ${indirizzo}`);

      if (indirizzo.includes('/dettaglio')) {
        // Elenchi vuoti: la forma che, letta senza controllare lo stato, assolve.
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
        new Response(JSON.stringify({ data: { id: 'pratica-1', status: statoPratica } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;
  }

  it('non legge il risultato di una pratica ancora in lavorazione', async () => {
    const cache = new MemoryCache();
    cache.set('pratica:negativita:12485671007', {
      value: 'pratica-1',
      expiresAt: Date.now() + 600_000,
    });

    const chiamate: string[] = [];
    const provider = new OpenApiProvider({ token: 't', cache, fetchImpl: servizio('PENDING', chiamate) });

    const profilo = await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });

    // Nessun evento negativo **dichiarato**: il fattore resta non valutabile, che è la
    // verità. Il contrario sarebbe un'assoluzione senza processo.
    expect(profilo.eventiNegativi).toBeNull();
    expect(chiamate.some((c) => c.includes('/dettaglio'))).toBe(false);
  }, 90_000);

  it('legge il risultato quando la pratica è conclusa', async () => {
    const cache = new MemoryCache();
    cache.set('pratica:negativita:12485671007', {
      value: 'pratica-1',
      expiresAt: Date.now() + 600_000,
    });

    const chiamate: string[] = [];
    const provider = new OpenApiProvider({
      token: 't',
      cache,
      fetchImpl: servizio('COMPLETED', chiamate),
    });

    const profilo = await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });

    expect(profilo.eventiNegativi?.value.protesti).toEqual([]);
    expect(chiamate.some((c) => c.includes('/dettaglio'))).toBe(true);
  }, 90_000);
});

describe('La verifica protesti si compra solo se richiesta', () => {
  it('un’analisi ordinaria non apre nessuna pratica e non addebita 45 centesimi', async () => {
    /*
      Il difetto più caro che questo software abbia avuto, e il più silenzioso.

      Al livello «completo» gli eventi negativi venivano acquistati **sempre**: chi apriva
      un prospect per dargli un'occhiata credeva di spendere i dieci centesimi
      dell'anagrafica e ne spendeva cinquantacinque. Su venti prospect guardati e scartati
      sono undici euro invece di due, e in nessun punto dell'interfaccia era scritto.

      Non era un errore di calcolo ma una scelta implicita, ed è per questo che nessun
      collaudo poteva vederla: il codice faceva esattamente quello che diceva di fare.
      Questo collaudo esiste perché quella scelta torni a essere esplicita e ci resti.
    */
    const ledger = new MemoryCostLedger();
    const chiamate: string[] = [];

    const provider = new OpenApiProvider({
      token: 't',
      cache: new MemoryCache(),
      ledger,
      fetchImpl: servizioPronto(chiamate),
      now: () => new Date('2026-08-21T00:00:00Z'),
    });

    await provider.fetchProfile('12485671007', 'completo');

    expect(
      chiamate.filter((c) => c.includes('IT-negativita')),
      'nessuna chiamata alla verifica protesti senza averla chiesta',
    ).toEqual([]);
    expect(
      ledger.totaleCentesimi(),
      'un’analisi ordinaria costa l’anagrafica, non l’anagrafica più i protesti',
    ).toBeLessThan(45);
  });

  it('chiedendola, la pratica parte e il costo compare', async () => {
    const ledger = new MemoryCostLedger();
    const chiamate: string[] = [];

    const provider = new OpenApiProvider({
      token: 't',
      cache: new MemoryCache(),
      ledger,
      fetchImpl: servizioPronto(chiamate),
      now: () => new Date('2026-08-21T00:00:00Z'),
    });

    await provider.fetchProfile('12485671007', 'completo', { conEventiNegativi: true });

    expect(chiamate.some((c) => c.includes('IT-negativita'))).toBe(true);
    expect(ledger.totaleCentesimi()).toBeGreaterThanOrEqual(45);
  });
});
