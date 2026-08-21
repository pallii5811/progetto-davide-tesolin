import { describe, expect, it, vi } from 'vitest';
import { HttpProviderClient, MemoryCache, MemoryCostLedger } from '../src/http.js';
import { ProviderError } from '../src/port.js';

function rispostaOk(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rispostaErrore(status: number): Response {
  return new Response(JSON.stringify({ errore: 'ko' }), { status });
}

function client(fetchImpl: typeof fetch, extra: { cache?: MemoryCache; ledger?: MemoryCostLedger } = {}) {
  return new HttpProviderClient({
    baseUrl: 'https://esempio.test',
    token: 'token-di-prova',
    provider: 'Test',
    fetchImpl,
    maxRetries: 2,
    ...extra,
  });
}

const richiesta = {
  service: 'anagrafica',
  path: '/IT-advanced/123',
  cacheTtlSeconds: 60,
  costoCentesimi: 60,
} as const;

describe('Client HTTP dei provider', () => {
  it('inoltra il token di autorizzazione', async () => {
    const fetchMock = vi.fn(async () => rispostaOk({ ok: true }));
    await client(fetchMock as unknown as typeof fetch).request(richiesta);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-di-prova');
  });

  it('serve dalla cache la seconda chiamata identica', async () => {
    const fetchMock = vi.fn(async () => rispostaOk({ valore: 1 }));
    const cache = new MemoryCache();
    const c = client(fetchMock, { cache });

    await c.request(richiesta);
    await c.request(richiesta);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('non usa la cache quando il TTL è zero', async () => {
    const fetchMock = vi.fn(async () => rispostaOk({ valore: 1 }));
    const c = client(fetchMock, { cache: new MemoryCache() });

    await c.request({ ...richiesta, cacheTtlSeconds: 0 });
    await c.request({ ...richiesta, cacheTtlSeconds: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('registra il costo solo per le chiamate effettivamente pagate', async () => {
    const fetchMock = vi.fn(async () => rispostaOk({ valore: 1 }));
    const ledger = new MemoryCostLedger();
    const c = client(fetchMock, { cache: new MemoryCache(), ledger });

    await c.request(richiesta);
    await c.request(richiesta); // servita dalla cache

    expect(ledger.events).toHaveLength(2);
    expect(ledger.totaleCentesimi()).toBe(60);
    expect(ledger.risparmioCentesimi()).toBe(60);
  });

  it('non ritenta un 404: pagare due volte per non trovare nulla è puro spreco', async () => {
    const fetchMock = vi.fn(async () => rispostaErrore(404));
    await expect(client(fetchMock as unknown as typeof fetch).request(richiesta)).rejects.toThrow(
      ProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('non ritenta un errore di autenticazione', async () => {
    const fetchMock = vi.fn(async () => rispostaErrore(401));
    await expect(client(fetchMock as unknown as typeof fetch).request(richiesta)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ritenta gli errori temporanei del server', async () => {
    let chiamate = 0;
    const fetchMock = vi.fn(async () => {
      chiamate += 1;
      return chiamate < 3 ? rispostaErrore(503) : rispostaOk({ valore: 'finalmente' });
    });

    const risultato = await client(fetchMock).request<{ valore: string }>(richiesta);

    expect(risultato.valore).toBe('finalmente');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('classifica correttamente il tipo di errore', async () => {
    const casi: [number, ProviderError['kind']][] = [
      [404, 'non-trovato'],
      [403, 'autenticazione'],
      [429, 'quota'],
    ];

    for (const [status, atteso] of casi) {
      const fetchMock = vi.fn(async () => rispostaErrore(status));
      // La quota è ritentabile: si esauriscono i tentativi prima di propagare.
      await client(fetchMock as unknown as typeof fetch)
        .request(richiesta)
        .catch((errore: unknown) => {
          expect(errore).toBeInstanceOf(ProviderError);
          expect((errore as ProviderError).kind).toBe(atteso);
        });
    }
  });

  it('aggrega i costi per servizio', async () => {
    const fetchMock = vi.fn(async () => rispostaOk({}));
    const ledger = new MemoryCostLedger();
    const c = client(fetchMock, { ledger });

    await c.request({ ...richiesta, cacheTtlSeconds: 0 });
    await c.request({ ...richiesta, cacheTtlSeconds: 0, path: '/IT-protests/123', costoCentesimi: 150 });

    const aggregato = ledger.perServizio();
    expect([...aggregato.values()].reduce((s, v) => s + v.costoCentesimi, 0)).toBe(210);
  });
});

describe('Cache in memoria', () => {
  it('fa scadere le voci oltre il TTL', () => {
    const cache = new MemoryCache();
    cache.set('k', { value: 'v', expiresAt: Date.now() - 1 });
    expect(cache.get('k')).toBeUndefined();
  });

  it('sfratta le voci più vecchie oltre la capienza', () => {
    const cache = new MemoryCache(2);
    const fraUnOra = Date.now() + 3_600_000;
    cache.set('a', { value: 1, expiresAt: fraUnOra });
    cache.set('b', { value: 2, expiresAt: fraUnOra });
    cache.set('c', { value: 3, expiresAt: fraUnOra });

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')?.value).toBe(3);
  });
});

describe('Il «non trovata» di questo fornitore', () => {
  it('riconosce il 406 come partita IVA inesistente, non come guasto', async () => {
    /*
      Verificato sul servizio reale il 21/08/2026: una partita IVA inesistente ma con
      carattere di controllo valido riceve `HTTP 406` con
      `{"message":"taxCode/vatCode/id not valid","error":304}`.

      Classificarlo «sconosciuto» faceva leggere all'intermediario «il servizio dati non è
      al momento disponibile» — un guasto nostro — quando la verità è che quel numero non
      esiste e va ricontrollato. Le due frasi portano ad azioni opposte: aspettare, o
      correggere le cifre.
    */
    const c = client(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, message: 'taxCode/vatCode/id not valid' }), {
          status: 406,
        }),
      ),
    );

    await expect(c.request(richiesta)).rejects.toMatchObject({ kind: 'non-trovato' });
  });
});
