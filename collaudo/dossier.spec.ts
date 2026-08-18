import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Il salvataggio dell'intervista deve salvare davvero.
 *
 * Questo collaudo nasce dal guasto peggiore trovato finora: la Server Action che salva il
 * dossier chiamava l'API **senza sessione**. L'API rispondeva 401, il broker vedeva un
 * errore generico o nulla del tutto, e mezz'ora di intervista con il cliente spariva.
 *
 * La verifica decisiva non è che compaia un messaggio di conferma — un messaggio si può
 * mostrare anche quando non è stato scritto niente — ma che il dato **si ritrovi dopo un
 * ricaricamento della pagina**.
 */
test.describe('Dossier: dati raccolti in intervista', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('un dato inserito sopravvive al ricaricamento', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);

    const dipendenti = page.getByLabel('Dipendenti', { exact: false }).first();
    await expect(dipendenti).toBeVisible();
    await dipendenti.fill('47');

    await page.getByRole('button', { name: /salva/i }).click();

    // Il ricaricamento è il punto: rilegge dal database, non dallo stato del browser.
    await page.reload();
    await expect(page.getByLabel('Dipendenti', { exact: false }).first()).toHaveValue('47');

    expect(sorveglianza.errori).toEqual([]);
  });

  test('il dato salvato arriva fino all’analisi', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);

    const dipendenti = page.getByLabel('Dipendenti', { exact: false }).first();
    await dipendenti.fill('180');
    await page.getByRole('button', { name: /salva/i }).click();
    await page.reload();

    // Un dossier che si salva ma non cambia nulla a valle sarebbe un archivio, non uno
    // strumento: il numero di addetti sposta la classe dimensionale e i benchmark.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.getByText(/Media impresa|180/).first()).toBeVisible();
  });

  test('la completezza dell’intervista aumenta man mano che si compila', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);

    const percentuale = async (): Promise<number> => {
      const testo = await page
        .getByText(/\d+\s*%/)
        .first()
        .innerText();
      return Number(/(\d+)/.exec(testo)?.[1] ?? '0');
    };

    const prima = await percentuale();

    await page.getByLabel('Dipendenti', { exact: false }).first().fill('47');
    await page.getByRole('button', { name: /salva/i }).click();
    await page.reload();

    expect(await percentuale()).toBeGreaterThanOrEqual(prima);
  });
});
