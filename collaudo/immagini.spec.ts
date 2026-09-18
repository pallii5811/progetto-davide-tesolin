import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Le fotografie delle ubicazioni, e la numerazione del report che le accoglie.
 *
 * Fino al 18/09/2026 qui si caricava una fotografia dalla scheda dell'azienda e la si
 * ritrovava nel report. Quel giorno Simone ha tolto dalla scheda il caricamento — «togli anche
 * questo», insieme alle domande e alle fonti sotto le ubicazioni: la scheda si mostra al
 * cliente, e un modulo di caricamento per ogni sede non gli serve. Le fotografie già caricate
 * restano nel report, e il loro salvataggio resta provato dall'API (formato, peso, tetto,
 * isolamento fra intermediari). Qui resta ciò che si vede nel browser: il caricamento non
 * torna nella scheda per sbaglio, e i capitoli del report non saltano un numero.
 */
test.describe('Fotografie delle ubicazioni', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la scheda non offre più il caricamento delle fotografie', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.getByTestId('metrica-property-risk')).toBeVisible({ timeout: 90_000 });

    await expect(page.getByText('Fotografie delle sedi')).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('#ubicazioni').getByText('Da chiedere al cliente')).toHaveCount(0);

    expect(sorveglianza.errori).toEqual([]);
  });

  test('la numerazione dei capitoli del report non salta', async ({ page }) => {
    test.setTimeout(120_000);

    /*
      I capitoli sono numerati da un contatore proprio perché due di essi sono
      condizionali e a mano era già uscito un «3-bis» stampato dopo il quinto. Su un
      documento consegnato a un cliente è la prima cosa che si nota, e mette in dubbio
      tutto il resto: qui si misura che la successione sia intera.
    */
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(page.getByRole('heading', { name: /Sintesi per la direzione/ })).toBeVisible({
      timeout: 90_000,
    });

    const titoli = await page.locator('article h2').allTextContents();
    const numeri = titoli.map((t) => Number.parseInt(t.trim(), 10)).filter((n) => !Number.isNaN(n));

    expect(numeri.length).toBeGreaterThan(5);
    expect(numeri).toEqual(numeri.map((_, i) => i + 1));
  });
});
