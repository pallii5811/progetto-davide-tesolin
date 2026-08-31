import { describe, expect, it } from 'vitest';
import { HttpProviderClient, MemoryCache, MemoryCostLedger } from '../src/http.js';

/**
 * Un dato già pagato non deve annunciare un prezzo.
 *
 * IL DIFETTO. Sulla scheda di un'impresa approfondita il giorno prima, il pulsante
 * continuava a scrivere «Analisi approfondita +0,30 €». La risposta era in archivio, valida
 * per altri ventinove giorni, e quel clic non avrebbe addebitato nulla — ma chi guardava lo
 * schermo non aveva modo di saperlo e ha smesso di cliccare, per non ripagare un dato che
 * possedeva già.
 *
 * È il gemello del difetto opposto, e va tenuto insieme a lui: un addebito taciuto tradisce
 * la fiducia, un prezzo annunciato dove non c'è addebito ferma il lavoro. Il secondo si
 * nota meno perché nessuno si lamenta di una spesa che non ha fatto — semplicemente smette
 * di usare quello che ha comprato.
 *
 * Qui si prova il MECCANISMO, cioè la parte che può rompersi in silenzio: la chiave con cui
 * si interroga l'archivio deve essere la stessa con cui ci si scrive. Se un giorno le due
 * divergessero, il prodotto direbbe «già acquistata» su qualcosa da pagare — e quello sì
 * che si nota, sul conto di fine mese.
 */
describe('Sapere se un acquisto è già stato pagato', () => {
  const richiesta = {
    service: '/IT-full/{id}',
    path: '/IT-full/01686900984',
    cacheTtlSeconds: 30 * 24 * 3600,
    costoCentesimi: 30,
  };

  const client = (fetchImpl: () => Promise<Response>, cache = new MemoryCache()) =>
    new HttpProviderClient({
      baseUrl: 'https://company.openapi.com',
      token: 't',
      provider: 'Test',
      cache,
      ledger: new MemoryCostLedger(),
      fetchImpl,
    });

  it('prima di comprarlo la risposta è no', async () => {
    const c = client(async () => new Response('{}', { status: 200 }));
    expect(await c.serviblePerCache(richiesta)).toBe(false);
  });

  it('dopo averlo comprato è sì, e non è costato una seconda chiamata', async () => {
    let chiamate = 0;
    const c = client(async () => {
      chiamate += 1;
      return new Response(JSON.stringify({ data: [{}] }), { status: 200 });
    });

    await c.request(richiesta);
    expect(await c.serviblePerCache(richiesta)).toBe(true);

    // La domanda non deve interrogare il fornitore: chiederglielo costerebbe quanto il dato.
    expect(chiamate, 'sapere se è già pagato non deve pagare').toBe(1);
  });

  it('e chiedendolo davvero non si paga davvero', async () => {
    /*
      La prova che chiude il cerchio: non basta che il pulsante DICA «già acquistata»,
      deve essere vero che ripremendolo non si spende.
    */
    let chiamate = 0;
    const c = client(async () => {
      chiamate += 1;
      return new Response(JSON.stringify({ data: [{}] }), { status: 200 });
    });

    await c.request(richiesta);
    await c.request(richiesta);

    expect(chiamate, 'il secondo giro deve uscire dall’archivio').toBe(1);
  });

  it('su un servizio senza cache la risposta è no, non «non lo so»', async () => {
    /*
      `cacheTtlSeconds: 0` significa che quel servizio non si archivia mai: ogni chiamata
      paga. Rispondere `true` per un errore di lettura del tetto direbbe «gratis» su una
      spesa certa, ed è la direzione in cui un difetto costa denaro invece che lavoro.
    */
    const c = client(async () => new Response('{}', { status: 200 }));
    expect(await c.serviblePerCache({ ...richiesta, cacheTtlSeconds: 0 })).toBe(false);
  });
});
