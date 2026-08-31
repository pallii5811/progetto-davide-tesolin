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
  { nome: '01-ricerca', percorso: '/' },
  { nome: '02-portafoglio', percorso: '/portafoglio' },
  { nome: '03-analisi', percorso: `/azienda/${AZIENDA_DI_PROVA}` },
  { nome: '04-intervista', percorso: `/azienda/${AZIENDA_DI_PROVA}/dati` },
  { nome: '05-report', percorso: `/azienda/${AZIENDA_DI_PROVA}/report` },
  { nome: '06-monitoraggio', percorso: '/monitoraggio' },
  { nome: '07-catalogo', percorso: '/catalogo' },
  { nome: '08-impostazioni', percorso: '/impostazioni' },
  { nome: '09-utenti', percorso: '/impostazioni/utenti' },
];

test.describe('@visuale schermate', () => {
  test('schermo largo', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await accedi(page);
    await popolaMonitoraggio(page);

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
    await popolaMonitoraggio(page);

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

    for (const id of ['matrice', 'danno-massimo', 'ritenzione', 'somme', 'credito']) {
      const sezione = page.locator(`#${id}`);
      if ((await sezione.count()) === 0) continue;
      await sezione.scrollIntoViewIfNeeded();
      await sezione.screenshot({ path: `schermate/sezione-${id}.png` });
    }
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
 * Una schermata di monitoraggio vuota non mostra nulla di ciò che va guardato: prima si
 * analizza un'azienda e si esegue il monitoraggio, così le immagini rappresentano la
 * piattaforma al lavoro e non appena installata.
 */
async function popolaMonitoraggio(page: Page): Promise<void> {
  await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  await page.waitForLoadState('networkidle');

  await page.goto('/monitoraggio');
  const aggiorna = page.getByRole('button', { name: /aggiorna monitoraggio/i });
  if ((await aggiorna.count()) > 0) {
    await aggiorna.click();
    await page.waitForLoadState('networkidle');
  }
}
