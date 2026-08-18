import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Il monitoraggio è ciò che trasforma la piattaforma da analisi una tantum a servizio
 * continuo. Deve funzionare dal primo giorno — quando c'è una sola analisi e nulla da
 * confrontare — perché è proprio allora che serve sapere cosa scade e cosa è già fuori
 * norma.
 */
test.describe('Monitoraggio continuo', () => {
  test('rileva gli eventi del portafoglio e li mette in coda ordinati', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await accedi(page);

    // Serve almeno un'azienda analizzata: il monitoraggio confronta fotografie salvate.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.getByTestId('metrica-score-di-credito')).toBeVisible();

    await page.goto('/monitoraggio');
    await page.getByRole('button', { name: /aggiorna monitoraggio/i }).click();

    // L'azienda dimostrativa è inadempiente all'obbligo CAT NAT: quell'evento deve esserci.
    const eventi = page.locator('ul > li');
    await expect(eventi.first()).toBeVisible();
    // Ogni azienda non conforme ne produce uno: si verifica che ci sia, non che sia solo.
    await expect(page.getByText(/Obbligo assicurativo catastrofale/).first()).toBeVisible();

    // In cima ciò che costa di più non fare.
    await expect(eventi.first().getByText('urgente')).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('ogni evento dice il fatto, la conseguenza e cosa fare', async ({ page }) => {
    await accedi(page);
    await page.goto('/monitoraggio');

    const primo = page.locator('ul > li').first();
    await expect(primo).toBeVisible();

    // La conseguenza sulla copertura è ciò che distingue un avviso da una vendita.
    const testo = await primo.innerText();
    expect(testo).toMatch(/Da fare:/);
    expect(testo.length).toBeGreaterThan(200);
  });

  test('la riesecuzione non riempie la coda di doppioni', async ({ page }) => {
    await accedi(page);
    await page.goto('/monitoraggio');

    const quanti = async (): Promise<number> => page.locator('ul > li').count();
    const prima = await quanti();
    expect(prima).toBeGreaterThan(0);

    await page.getByRole('button', { name: /aggiorna monitoraggio/i }).click();
    await expect(page.getByText(/nessuna novità|nuovi? eventi?/)).toBeVisible();

    // Senza deduplica la coda raddoppierebbe a ogni giro e diventerebbe illeggibile
    // nel giro di una settimana.
    expect(await quanti()).toBe(prima);
  });

  test('un evento gestito esce dalla coda di lavoro ma resta a verbale', async ({ page }) => {
    await accedi(page);
    await page.goto('/monitoraggio');

    const prima = await page.locator('ul > li').count();
    await page
      .locator('ul > li')
      .first()
      .getByRole('button', { name: /segna gestito/i })
      .click();

    await expect(page.locator('ul > li')).toHaveCount(prima - 1);

    // Ma non sparisce: davanti a una contestazione «l'avevamo segnalato» vale solo se
    // resta dimostrabile.
    await page.goto('/monitoraggio?tutti=1');
    await expect(page.getByText('gestito').first()).toBeVisible();
  });
});
