/**
 * Il tetto di spesa giornaliero.
 *
 * Su un servizio prepagato l'errore più caro non è l'analisi sbagliata da cinquantacinque
 * centesimi: è l'importazione massiva lanciata due volte, o il filtro impostato male. Il
 * credito non si esaurisce con un avviso — si esaurisce, e il lunedì mattina nessuna
 * analisi funziona più.
 *
 * Due proprietà, e la seconda conta quanto la prima: il tetto deve fermare la spesa, e non
 * deve fermare ciò che è **gratuito**. Un tetto che blocca anche il conteggio dei prospect
 * impedirebbe di stimare i costi proprio a chi sta già attento a non spendere.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registraCosto } from '@aegis/db';
import type { Persistenza } from '../src/persistenza.js';
import { accedi, creaUtenteDiProva, persistenzaDiProva, serverDiProva } from './aiuti.js';

const EMAIL = 'tetto@studio.it';

/** Registra una spesa già avvenuta, come se l'avesse prodotta un'analisi precedente. */
async function spendi(persistenza: Persistenza, centesimi: number, daCache = false): Promise<void> {
  await registraCosto(persistenza.db, {
    tenantId: persistenza.tenantPredefinito,
    aziendaId: null,
    provider: 'OpenAPI.com',
    servizio: 'IT-advanced',
    costoCentesimi: centesimi,
    servitoDaCache: daCache,
  });
}

describe('Tetto di spesa giornaliero', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    // Tetto bassissimo: qualunque spesa già avvenuta lo raggiunge.
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '1';
    persistenza = await persistenzaDiProva('Studio con budget');
    await creaUtenteDiProva(persistenza, EMAIL);
    app = serverDiProva(persistenza);
    cookie = await accedi(app, EMAIL);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('lascia passare l’analisi finché non si è speso nulla', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie },
      payload: {},
    });

    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('rifiuta l’analisi quando il tetto è raggiunto, e dice quanto si è speso', async () => {
    await spendi(persistenza, 500);

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie },
      payload: {},
    });

    expect(risposta.statusCode).toBe(429);
    // «Hai superato il tetto» senza dire di quanto costringe a cercarlo altrove.
    expect(risposta.json().errore).toMatch(/5[.,]00/);
  }, 90_000);

  it('non blocca il conteggio dei prospect, che è gratuito', async () => {
    await spendi(persistenza, 500);

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/prospect?provincia=BS&soloConteggio=1',
      headers: { cookie },
    });

    // Contare non costa: vietarlo a chi ha finito il budget significherebbe togliergli
    // l'unico strumento per pianificare la spesa di domani.
    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('non conta le chiamate servite dalla cache', async () => {
    await spendi(persistenza, 5000, true);

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie },
      payload: {},
    });

    // Un dato riusato dalla cache non è stato pagato: farlo pesare sul tetto
    // penalizzerebbe proprio il comportamento che si vuole incoraggiare.
    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('il tetto vale per intermediario, non per l’intero servizio', async () => {
    await spendi(persistenza, 500);

    const altro = await persistenzaDiProva('Studio senza spese');
    try {
      await creaUtenteDiProva(altro, 'altro@studio.it');
      const suaApp = serverDiProva(altro);
      const suoCookie = await accedi(suaApp, 'altro@studio.it');

      const risposta = await suaApp.inject({
        method: 'POST',
        url: '/api/aziende/03158460174/analisi',
        headers: { cookie: suoCookie },
        payload: {},
      });

      // Le spese di uno studio non devono bloccare il lavoro di un altro: sarebbe un
      // isolamento rotto nel verso opposto, meno visibile e altrettanto grave.
      expect(risposta.statusCode).toBe(200);
      await suaApp.close();
    } finally {
      await altro.chiudi();
    }
  }, 120_000);
});
