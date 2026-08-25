/**
 * La variabile che diceva di risparmiare e non risparmiava.
 *
 * `.env.example` documenta `OPENAPI_AMBIENTE`: «test usa il sandbox — chiamate gratuite,
 * dati fittizi; produzione usa i dati reali e consuma credito». Era scritta nei file di
 * configurazione, e **nessuna riga di codice la leggeva**. Il provider partiva sempre su
 * produzione.
 *
 * Le due direzioni dell'errore non si equivalgono:
 *
 *  - chi impostava `test` per provare senza spendere, **spendeva**, credendosi al sicuro.
 *    È ciò che accadeva davvero, ed è il motivo per cui la variabile andava collegata;
 *  - se un domani l'impostazione finisse a `test` in produzione, il prodotto servirebbe
 *    anagrafiche inventate del sandbox. `datiReali` lo dichiarava vero comunque, perché
 *    guardava solo se il provider fosse quello dimostrativo — e il sandbox non lo è.
 *
 * Qui si tengono ferme entrambe: la variabile ha effetto, e `/health` non dichiara dati
 * reali quando non lo sono.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CHIAVI = ['OPENAPI_AMBIENTE', 'OPENAPI_TOKEN'] as const;

/*
  Soglia larga, e non per nascondere una lentezza.

  Ogni caso qui costruisce e chiude un server Fastify intero, perché l'ambiente va deciso
  **prima** che il provider venga creato: non c'è modo di riusarne uno. Da solo il file
  passa in meno di due secondi; dentro la suite completa, con cinquanta file in parallelo
  su una macchina condivisa, supera i cinque secondi predefiniti e diventa rosso a caso.

  Un collaudo intermittente è peggio di un collaudo assente: insegna a ignorare il rosso.
*/
describe('L’ambiente della fonte dati è dichiarato e ha effetto', { timeout: 60_000 }, () => {
  let originali: Partial<Record<string, string | undefined>>;

  beforeEach(() => {
    originali = Object.fromEntries(CHIAVI.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
    for (const k of CHIAVI) {
      if (originali[k] === undefined) delete process.env[k];
      else process.env[k] = originali[k];
    }
  });

  async function salute(): Promise<Record<string, unknown>> {
    const { buildServer } = await import('../src/server.js');
    const app = buildServer({ autenticazione: false });
    try {
      const risposta = await app.inject({ method: 'GET', url: '/health' });
      return risposta.json<Record<string, unknown>>();
    } finally {
      await app.close();
    }
  }

  it('senza token resta dimostrativo, e lo dice', async () => {
    delete process.env['OPENAPI_TOKEN'];
    delete process.env['OPENAPI_AMBIENTE'];
    const s = await salute();
    expect(s['datiReali']).toBe(false);
  });

  it('con token e ambiente di produzione dichiara dati reali', async () => {
    process.env['OPENAPI_TOKEN'] = 'token-finto-per-il-collaudo';
    process.env['OPENAPI_AMBIENTE'] = 'produzione';
    const s = await salute();
    expect(s['ambiente']).toBe('produzione');
    expect(s['datiReali']).toBe(true);
  });

  it('con ambiente `test` NON dichiara dati reali, pur avendo un token', async () => {
    /*
      Il caso che il campo sbagliava: il sandbox non è il provider dimostrativo, quindi il
      vecchio controllo — «il provider non si chiama Demo» — rispondeva «dati reali» su
      anagrafiche inventate.
    */
    process.env['OPENAPI_TOKEN'] = 'token-finto-per-il-collaudo';
    process.env['OPENAPI_AMBIENTE'] = 'test';
    const s = await salute();
    expect(s['ambiente']).toBe('test');
    expect(
      s['datiReali'],
      'il sandbox restituisce anagrafiche inventate: non sono dati reali',
    ).toBe(false);
  });

  it('un valore incomprensibile vale produzione, non sandbox', async () => {
    /*
      Davanti a una configurazione che non si capisce si sceglie la lettura che spende —
      e di cui quindi ci si accorge — invece di quella che consegna dati inventati in
      silenzio. Un refuso non deve poter trasformare le analisi in finzione.
    */
    process.env['OPENAPI_TOKEN'] = 'token-finto-per-il-collaudo';
    process.env['OPENAPI_AMBIENTE'] = 'prod';
    const s = await salute();
    expect(s['ambiente']).toBe('produzione');
  });
});
