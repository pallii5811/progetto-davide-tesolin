import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';

/**
 * Il CRM, che fino al 17/09/2026 era il Portafoglio.
 *
 * «Questa pagina deve essere un CRM non un tracker assicurativo. Non abbiamo la maggior parte
 * dei dati per poter dire cosa è coperto e cosa no» («AEGIS - cambi.pptx», slide 3). Qui si
 * prova nel browser ciò che la sostituisce: stato e nota che si salvano e restano, i filtri per
 * stato, i contatti, il file esportato, e la pagina usabile su un telefono.
 */
test.describe('CRM', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    // Un'analisi vera, così il CRM ha qualcosa da mostrare.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  });

  test('si chiama CRM, e non mostra dati assicurativi', async ({ page }) => {
    await page.goto('/portafoglio');

    await expect(page.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
    await expect(page.getByText(/ordinate per priorità di intervento/)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Principale' }).getByRole('link', { name: 'CRM' }),
    ).toHaveAttribute('aria-current', 'page');

    for (const tolto of [
      /CAT NAT/i,
      /Coperture da attivare/i,
      /Esposizione complessiva/i,
      /Esposizione non assicurata/i,
      /Prossima azione/i,
      /non censita/i,
      /Importa elenco clienti/i,
    ]) {
      await expect(page.getByText(tolto), String(tolto)).toHaveCount(0);
    }
  });

  test('stato e nota si salvano, restano dopo il ricaricamento, e i filtri li contano', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portafoglio');

    const riga = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    const nota = `Richiamare lunedì ${Date.now()}`;
    await riga.getByLabel(/^Stato di /).selectOption('in-trattativa');
    await riga.getByLabel(/^Nota su /).fill(nota);
    await riga.getByRole('button', { name: 'Salva' }).click();
    await expect(riga.getByRole('status')).toHaveText('Salvato.');

    await page.reload();
    const dopo = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    await expect(dopo.getByLabel(/^Stato di /)).toHaveValue('in-trattativa');
    await expect(dopo.getByLabel(/^Nota su /)).toHaveValue(nota);

    // Il filtro per stato mostra la riga, e un altro stato no.
    await page.getByRole('link', { name: /^In trattativa \(\d+\)$/ }).click();
    await expect(page).toHaveURL(/filtro=in-trattativa/);
    await expect(page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i })).toHaveCount(1);

    await page.goto('/portafoglio?filtro=non-interessata');
    await expect(page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i })).toHaveCount(0);
  });

  test('un’azienda analizzata porta i contatti e si apre senza rifare l’analisi', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portafoglio');

    const riga = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    await expect(riga.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
    await expect(riga.getByText(/analizzata il \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(riga.getByRole('link', { name: 'Apri' })).toBeVisible();
  });

  test('su schermo stretto resta usabile: stato, nota e comando visibili', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portafoglio');

    const scheda = page
      .locator('ul > li')
      .filter({ hasText: /MECCANICA BRESCIANA/i })
      .first();
    await expect(scheda.getByLabel(/^Stato di /)).toBeVisible();
    await expect(scheda.getByLabel(/^Nota su /)).toBeVisible();
    await expect(scheda.getByRole('link', { name: /^(Apri|Analizza)$/ })).toBeVisible();
  });

  test('l’elenco si scarica in CSV, con le colonne del CRM', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/portafoglio');

    /*
      Lo scaricamento attraversa tre confini che le prove unitarie non toccano: il gestore
      di rotta di Next, la chiamata all'API con il cookie di sessione, e le intestazioni con
      cui il browser decide se salvare o mostrare a schermo.
    */
    const [scaricamento] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.getByRole('link', { name: 'Esporta in CSV' }).click(),
    ]);

    expect(scaricamento.suggestedFilename()).toMatch(/^crm-\d{4}-\d{2}-\d{2}\.csv$/);

    const percorso = await scaricamento.path();
    const { readFileSync } = await import('node:fs');
    const contenuto = readFileSync(percorso, 'utf8');

    expect(contenuto.startsWith('﻿')).toBe(true);
    expect(contenuto).toContain(
      '"Denominazione";"Partita IVA";"Comune";"Provincia";"Settore";"Stato";"Nota"',
    );
    expect(contenuto).not.toMatch(/CAT NAT|Coperture da attivare|Esposizione non assicurata/);
    expect(contenuto.trimEnd().split('\r\n').length).toBeGreaterThan(1);
  });

  test('il file segue il filtro per stato, e lo dichiara nel nome', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/portafoglio?filtro=da-contattare');

    const [scaricamento] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.getByRole('link', { name: 'Esporta in CSV' }).click(),
    ]);

    expect(scaricamento.suggestedFilename()).toContain('crm-da-contattare-');
  });
});

test.describe('Modulo di accesso', () => {
  test('dopo un errore l’indirizzo resta scritto', async ({ page }) => {
    await page.goto('/accedi');
    await page.getByLabel('Indirizzo di posta').fill('mario.rossi@studio.it');
    await page.getByLabel('Password').fill('password-sbagliata-ma-lunga');
    await page.getByRole('button', { name: 'Entra' }).click();

    await expect(page.getByText(/Indirizzo o password non corretti/)).toBeVisible();

    // Chi ha sbagliato la password non deve riscrivere anche la propria posta.
    await expect(page.getByLabel('Indirizzo di posta')).toHaveValue('mario.rossi@studio.it');
    // La password sì: riproporla a schermo sarebbe un regalo a chi passa di lì.
    await expect(page.getByLabel('Password')).toHaveValue('');
  });
});
