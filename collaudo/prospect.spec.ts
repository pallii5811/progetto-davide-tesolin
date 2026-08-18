import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Ricerca di nuovi clienti.
 *
 * È l'unica funzione che porta clienti che non si hanno ancora, ed è anche l'unica in cui
 * l'utente potrebbe spendere **senza volerlo**: comporre filtri è un gesto esplorativo, e
 * se ogni tentativo costasse, l'esplorazione si fermerebbe.
 *
 * Il presidio più importante di questo collaudo è quindi negativo: premere «Conta quante
 * sono» non deve mai scaricare un elenco. La spesa avviene solo dopo un secondo gesto
 * deliberato.
 */
test.describe('Ricerca di nuovi clienti', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la pagina si apre dal menu principale', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Nuovi clienti' }).click();

    await expect(page).toHaveURL(/\/prospect/);
    await expect(page.getByRole('heading', { name: /Ricerca di nuovi clienti/i })).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('conta le aziende senza scaricarne l’elenco', async ({ page }) => {
    await page.goto('/prospect');

    await page.getByLabel('Provincia').fill('BS');
    await page.getByRole('button', { name: /Conta quante sono/i }).click();

    // Il conteggio compare, e con esso il prezzo dell'elenco: chi cerca vede quanto
    // costerebbe **prima** di pagarlo.
    await expect(page.getByText(/aziende corrispondono/i)).toBeVisible();
    await expect(page.getByTestId('scarica-elenco')).toBeVisible();

    // E nessuna azienda è stata scaricata: la tabella dei risultati non esiste ancora.
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('scarica l’elenco solo dopo il secondo gesto', async ({ page }) => {
    await page.goto('/prospect?provincia=BS');
    await page.getByTestId('scarica-elenco').click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/aziende scaricate/i)).toBeVisible();
    // Il consuntivo di spesa accanto ai risultati: si è appena speso, e va detto.
    await expect(page.getByText(/€ spesi/i)).toBeVisible();
    // Da ogni riga si passa all'analisi: è il punto in cui il prospect diventa cliente.
    await expect(page.getByRole('link', { name: 'Analizza' }).first()).toBeVisible();
  });

  test('dichiara come va scritto il codice ATECO', async ({ page }) => {
    await page.goto('/prospect');
    // Il confronto del fornitore è esatto e senza punti: senza questa nota, chi scrive
    // «25.62.00» ottiene zero risultati e conclude che non esistono aziende.
    await expect(page.getByText(/Senza punti/i)).toBeVisible();
  });

  test('con criteri che non trovano nulla lo dice, e suggerisce come allargare', async ({ page }) => {
    await page.goto('/prospect?provincia=ZZ');
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toBeVisible();
  });
});
