import { describe, expect, it } from 'vitest';
import { HttpProviderClient, MemoryCache, MemoryCostLedger } from '../src/http.js';

/**
 * Un doppio clic non deve comprare due volte.
 *
 * La cache impedisce il secondo acquisto **dopo** che il primo è tornato. Non impediva
 * nulla mentre il primo era ancora per aria: due chiamate partite insieme trovavano
 * entrambe la cache vuota e pagavano entrambe.
 *
 * Non è un caso di laboratorio. Un doppio clic su «Analizza», un ricaricamento impaziente,
 * un browser che ritenta: sono i gesti normali di chi aspetta una pagina lenta. Il registro
 * segnava due chiamate legittime e nessuno poteva accorgersene.
 */
describe('Due richieste identiche partite insieme', () => {
  it('pagano una volta sola', async () => {
    let chiamate = 0;
    const cache = new MemoryCache();
    const ledger = new MemoryCostLedger();
    const client = new HttpProviderClient({
      baseUrl: 'https://esempio.test',
      token: 't',
      provider: 'Test',
      cache,
      ledger,
      fetchImpl: (async () => {
        chiamate += 1;
        await new Promise((r) => setTimeout(r, 50));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    });

    const richiesta = {
      service: 'anagrafica',
      path: '/IT-advanced/123',
      cacheTtlSeconds: 3600,
      costoCentesimi: 10,
    };

    await Promise.all([client.request(richiesta), client.request(richiesta)]);

    expect(chiamate, 'due clic ravvicinati non devono comprare due volte').toBe(1);
    expect(ledger.totaleCentesimi(), 'e si paga una volta sola').toBe(10);
  });

  it('una richiesta fallita non resta per aria a bloccare le successive', async () => {
    /*
      La deduplicazione tiene una promessa in una mappa. Se quella promessa fallisce e non
      viene tolta, ogni tentativo successivo attende per sempre un risultato che non
      arriverà — un rimedio peggiore del male.
    */
    let chiamate = 0;
    const client = new HttpProviderClient({
      baseUrl: 'https://esempio.test',
      token: 't',
      provider: 'Test',
      cache: new MemoryCache(),
      ledger: new MemoryCostLedger(),
      maxRetries: 0,
      fetchImpl: (async () => {
        chiamate += 1;
        return new Response('{}', { status: 404 });
      }),
    });

    const richiesta = {
      service: 'anagrafica',
      path: '/IT-advanced/999',
      cacheTtlSeconds: 3600,
      costoCentesimi: 10,
    };

    await expect(client.request(richiesta)).rejects.toThrow();
    await expect(client.request(richiesta)).rejects.toThrow();

    expect(chiamate, 'il secondo tentativo deve ripartire, non attendere il primo').toBe(2);
  });
});
