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
 *
 * I margini sono larghi **solo qui**, e a ragion veduta: la macchina di chi sviluppa
 * compila spesso anche altro, e sotto contesa una singola rotta ha superato i due minuti
 * — su una pagina che esisteva da settimane, cioè per fame di CPU e non per un difetto.
 * Un preriscaldamento che cede in quel caso fa fallire l'intera suite senza dire nulla
 * sul software. I collaudi veri restano stretti: è lì che una lentezza va notata.
 */
const ATTESA_COMPILAZIONE_MS = 300_000;

test('le rotte sono compilate e pronte', async ({ page }) => {
  // Quindici rotte da compilare: il bilancio complessivo deve poterle contenere tutte,
  // altrimenti è il limite del test a scattare e il messaggio indica la rotta sbagliata.
  test.setTimeout(900_000);

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
    '/impostazioni/servizi',
    '/impostazioni/studi',
    '/impostazioni/compagnie',
    '/monitoraggio',
    `/azienda/${AZIENDA_DI_PROVA}`,
    `/azienda/${AZIENDA_DI_PROVA}/dati`,
    `/azienda/${AZIENDA_DI_PROVA}/report`,
  ]) {
    const risposta = await page.goto(percorso, { timeout: ATTESA_COMPILAZIONE_MS });
    expect(risposta?.status(), percorso).toBeLessThan(400);
  }

  await esci(page);
});
