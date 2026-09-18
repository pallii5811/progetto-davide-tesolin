import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';

/**
 * Cattura delle schermate, per guardarle.
 *
 * Non è un collaudo automatico: non asserisce nulla. Serve a esaminare l'interfaccia
 * come la vedrà un assicuratore — su schermo largo, su schermo stretto e in stampa —
 * perché ci sono difetti che nessuna asserzione descrive: una gerarchia visiva confusa,
 * un numero che non risalta, una tabella che esce dallo schermo del telefono.
 *
 *   npx playwright test --grep @visuale
 */

const PAGINE: { nome: string; percorso: string }[] = [
  // La pagina «Ricerca» non c'è più dal 13/09/2026: la ricerca per partita IVA è una sezione
  // di «Ricerca Clienti», che si fotografa vuota, con un conteggio e con una ricerca fatta.
  { nome: '01-nuovi-clienti', percorso: '/prospect' },
  { nome: '01b-nuovi-clienti-conteggio', percorso: '/prospect?comune=A060' },
  { nome: '01c-nuovi-clienti-partita-iva', percorso: '/prospect?piva=03158460174#ricerca-azienda' },
  { nome: '02-portafoglio', percorso: '/portafoglio' },
  // Dichiarata «in arrivo» dal 18/09/2026: si fotografa perché è una pagina che il cliente vede.
  { nome: '02b-monitoraggio', percorso: '/monitoraggio' },
  { nome: '03-analisi', percorso: `/azienda/${AZIENDA_DI_PROVA}` },
  { nome: '04-intervista', percorso: `/azienda/${AZIENDA_DI_PROVA}/dati` },
  { nome: '05-report', percorso: `/azienda/${AZIENDA_DI_PROVA}/report` },
  { nome: '08-impostazioni', percorso: '/impostazioni' },
  { nome: '09-utenti', percorso: '/impostazioni/utenti' },
];

test.describe('@visuale schermate', () => {
  /*
    La vetrina (18/09/2026) si vede solo SENZA sessione, quindi si fotografa prima dell'accesso.
    Animazioni ferme: una carta a metà del suo fluttuare non è un difetto da cercare.
  */
  test('vetrina, senza accesso', async ({ page }) => {
    test.setTimeout(240_000);
    for (const [nome, larghezza, altezza] of [
      ['largo', 1440, 900],
      ['stretto', 390, 844],
    ] as const) {
      await page.setViewportSize({ width: larghezza, height: altezza });
      await page.goto('/', { timeout: 180_000 });
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `schermate/${nome}-00-vetrina.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('schermo largo', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await accedi(page);
    await popolaCrm(page);

    for (const { nome, percorso } of PAGINE) {
      await page.goto(percorso);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `schermate/largo-${nome}.png`, fullPage: true });
    }
  });

  test('schermo stretto', async ({ page }) => {
    test.setTimeout(180_000);
    // 390 × 844: un telefono corrente. Il broker apre la piattaforma in azienda,
    // davanti al cliente, e non sempre ha un portatile aperto.
    await page.setViewportSize({ width: 390, height: 844 });
    await accedi(page);
    await popolaCrm(page);

    for (const { nome, percorso } of PAGINE) {
      await page.goto(percorso);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `schermate/stretto-${nome}.png`, fullPage: true });
    }
  });

  test('sezioni singole, per esaminarle da vicino', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await page.waitForLoadState('networkidle');

    for (const id of ['property-risk', 'business-interruption', 'cyber-risk', 'credito']) {
      const sezione = page.locator(`#${id}`);
      if ((await sezione.count()) === 0) continue;
      await sezione.scrollIntoViewIfNeeded();
      await sezione.screenshot({ path: `schermate/sezione-${id}.png` });
    }
  });

  /*
    Il popup del Property Risk con le lancette (richiesta di Simone del 14/09/2026): una finestra
    chiusa non compare nelle schermate della pagina, e un ago storto o una lancetta tagliata su
    telefono non li descrive nessuna asserzione.
  */
  test('popup del Property Risk, aperto', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('apri-popup-property').click();
    const popup = page.locator('dialog[open]');
    await popup.waitFor();
    await popup.screenshot({ path: 'schermate/popup-property-risk.png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await popup.screenshot({ path: 'schermate/popup-property-risk-stretto.png' });
  });

  test('stampa del report', async ({ page }) => {
    test.setTimeout(120_000);
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await page.waitForLoadState('networkidle');

    // Con i fogli di stile di stampa attivi: è il documento che finisce in mano al
    // cliente, e le parti «no-print» devono sparire davvero.
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: 'schermate/stampa-report.png', fullPage: true });
  });
});

/**
 * Un CRM vuoto non mostra nulla di ciò che va guardato: prima si analizza un'azienda, così
 * le immagini rappresentano la piattaforma al lavoro e non appena installata.
 *
 * Eseguiva anche il monitoraggio, tolto il 17/09/2026 («AEGIS - cambi.pptx»).
 */
async function popolaCrm(page: Page): Promise<void> {
  await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  await page.waitForLoadState('networkidle');
}
