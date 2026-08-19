import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Solidità delle compagnie — il rischio di controparte.
 *
 * È il punto cieco della consulenza assicurativa: si analizza il rischio del cliente nei
 * minimi dettagli e poi lo si trasferisce a un soggetto la cui solidità nessuno ha
 * guardato. Una polizza è una promessa di pagamento futura.
 *
 * Il presidio più importante di questo collaudo è che la piattaforma **non inventa** un
 * punteggio quando non ha dati: senza SFCR non c'è valutazione, e va detto.
 */
test.describe('Solidità delle compagnie', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('senza dati lo dichiara invece di mostrare un punteggio inventato', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto('/impostazioni/compagnie');

    await expect(page.getByRole('heading', { name: /Solidità delle compagnie/i })).toBeVisible();
    await expect(page.getByText(/Nessuna compagnia censita|non li\s+inventa/i).first()).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('censisce una compagnia e ne calcola il punteggio', async ({ page }) => {
    await page.goto('/impostazioni/compagnie');

    await page.getByLabel(/Denominazione/i).fill('COMPAGNIA DI COLLAUDO S.P.A.');
    await page.getByLabel(/Esercizio/i).fill('2025');
    await page.getByLabel(/Fonte/i).fill('SFCR 2025');
    // Si inserisce **260**, come sta scritto nella relazione, non 2,6.
    await page.getByLabel(/Solvency ratio/i).fill('260');
    await page.getByRole('button', { name: /Censisci/i }).click();

    await expect(page.getByText('COMPAGNIA DI COLLAUDO S.P.A.').first()).toBeVisible();
    await expect(page.getByText(/Solvency ratio 260%/i)).toBeVisible();
    // Un solvency del 260% è sopra la media di mercato: la fascia deve rifletterlo.
    await expect(page.getByText(/\/100 · (Solida|Molto solida)/i).first()).toBeVisible();
  });

  test('segnala la compagnia che non copre il proprio requisito patrimoniale', async ({ page }) => {
    await page.goto('/impostazioni/compagnie');

    await page.getByLabel(/Denominazione/i).fill('COMPAGNIA FRAGILE S.P.A.');
    await page.getByLabel(/Esercizio/i).fill('2025');
    await page.getByLabel(/Fonte/i).fill('SFCR 2025');
    // Sotto il 100% la compagnia non copre il requisito patrimoniale di solvibilità:
    // è un fatto che va detto **prima** del collocamento, non dopo il sinistro.
    await page.getByLabel(/Solvency ratio/i).fill('85');
    await page.getByRole('button', { name: /Censisci/i }).click();

    await expect(page.getByText('COMPAGNIA FRAGILE S.P.A.').first()).toBeVisible();
    await expect(page.getByText(/⚠/).first()).toBeVisible();
  });

  test('ogni punteggio sa spiegarsi', async ({ page }) => {
    await page.goto('/impostazioni/compagnie');
    // La stessa regola vale per lo score di credito: un numero mostrato a un cliente
    // deve poter essere difeso, e la spiegazione è a un clic di distanza.
    await expect(page.getByText(/Come è stato calcolato/i).first()).toBeVisible();
  });
});
