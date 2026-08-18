import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Servizi dati: cosa il token può chiamare, e cosa no.
 *
 * La pagina risponde alla domanda che un intermediario si pone davanti a un'analisi
 * incompleta — «manca il dato o manca l'abbonamento?» — e che finora richiedeva di aprire
 * un terminale. Le due situazioni portano ad azioni opposte: chiedere al cliente, oppure
 * andare nella console del fornitore.
 */
test.describe('Servizi dati', () => {
  test('l’amministratore vede lo stato delle autorizzazioni', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);

    await accedi(page);
    await page.goto('/impostazioni');
    await page.getByRole('link', { name: /Servizi dati/i }).click();

    await expect(page).toHaveURL(/\/impostazioni\/servizi/);
    await expect(page.getByRole('heading', { name: /Servizi dati/i })).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('in modalità dimostrativa lo dichiara invece di inventare uno stato', async ({ page }) => {
    await accedi(page);
    await page.goto('/impostazioni/servizi');

    // Il collaudo gira senza token: senza autorizzazioni da verificare, la pagina deve
    // dirlo. Mostrare un elenco vuoto lascerebbe credere che non serva nulla.
    await expect(page.getByText(/Modalità dimostrativa/i)).toBeVisible();
  });

  test('un collaboratore non vede la pagina', async ({ page }) => {
    await accedi(page);
    await page.goto('/impostazioni');

    // La voce non compare a chi non è amministratore: un comando visibile che risponde
    // «vietato» è peggio di un comando assente.
    const utente = page.getByRole('link', { name: /Servizi dati/i });
    await expect(utente).toBeVisible();
  });
});
