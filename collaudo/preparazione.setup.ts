import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, esci } from './aiuti.js';

/**
 * Preriscaldamento.
 *
 * In sviluppo Next compila ogni rotta alla prima richiesta: il primo accesso può
 * richiedere più dei quindici secondi concessi a un'attesa. Senza questa fase il primo
 * collaudo del gruppo fallisce sempre, e per una ragione che non riguarda il software.
 *
 * Allungare i tempi d'attesa nasconderebbe il problema e renderebbe lento ogni collaudo
 * successivo. Meglio pagare la compilazione una volta sola, qui, dove è dichiarata.
 */
test('le rotte sono compilate e pronte', async ({ page }) => {
  test.setTimeout(240_000);

  await accedi(page);

  for (const percorso of [
    '/',
    '/prospect',
    '/portafoglio',
    '/portafoglio/importa',
    '/catalogo',
    '/impostazioni',
    '/impostazioni/utenti',
    '/impostazioni/studio',
    '/monitoraggio',
    `/azienda/${AZIENDA_DI_PROVA}`,
    `/azienda/${AZIENDA_DI_PROVA}/dati`,
    `/azienda/${AZIENDA_DI_PROVA}/report`,
  ]) {
    const risposta = await page.goto(percorso, { timeout: 120_000 });
    expect(risposta?.status(), percorso).toBeLessThan(400);
  }

  await esci(page);
});
