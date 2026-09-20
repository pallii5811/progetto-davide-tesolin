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

  /*
    Rifatto il 19/09/2026 («il crm è brutto… rendilo molto più user friendly»): lo stato si salva
    al cambio, senza pulsante, e la nota si apre solo quando serve. Qui si prova che i due gesti
    bastano, che restano dopo il ricaricamento e che i filtri li contano.
  */
  test('lo stato si salva al cambio, la nota si apre e resta dopo il ricaricamento', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portafoglio');

    const riga = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    const nota = `Richiamare lunedì ${Date.now()}`;

    // Lo stato: nessun «Salva» da premere, l'esito compare accanto alla pastiglia.
    await riga.getByLabel(/^Stato di /).selectOption('in-trattativa');
    await expect(riga.getByRole('status')).toHaveText('Salvato.', { timeout: 30_000 });

    // La nota: si apre, si scrive, si salva, e sulla riga resta il testo.
    await riga.getByRole('button', { name: /Aggiungi una nota/ }).click();
    await riga.getByLabel(/^Nota su /).fill(nota);
    await riga.getByRole('button', { name: 'Salva' }).click();
    await expect(riga.getByText(nota)).toBeVisible({ timeout: 30_000 });

    await page.reload();
    const dopo = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    await expect(dopo.getByLabel(/^Stato di /)).toHaveValue('in-trattativa');
    await expect(dopo.getByText(nota)).toBeVisible();
    // L'area di testo non è lì ad aspettare: si riapre solo se serve.
    await expect(dopo.getByLabel(/^Nota su /)).toHaveCount(0);
    await dopo.getByRole('button', { name: /Modifica la nota/ }).click();
    await expect(dopo.getByLabel(/^Nota su /)).toHaveValue(nota);

    // Il filtro per stato mostra la riga, e un altro stato no.
    await page.goto('/portafoglio');
    await page.getByRole('link', { name: /^In trattativa \(\d+\)$/ }).click();
    await expect(page).toHaveURL(/filtro=in-trattativa/);
    await expect(page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i })).toHaveCount(1);

    await page.goto('/portafoglio?filtro=non-interessata');
    await expect(page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i })).toHaveCount(0);
  });

  test('un’azienda analizzata porta contatti e punteggi, e si apre senza rifare l’analisi', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portafoglio');

    const riga = page.locator('tbody tr').filter({ hasText: /MECCANICA BRESCIANA/i });
    await expect(riga.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
    // Il telefono, chiesto il 19/09/2026: è un collegamento che il telefono compone.
    await expect(riga.getByRole('link', { name: /^\+?[\d ]+$/ })).toHaveAttribute('href', /^tel:\+?\d+$/);
    await expect(riga.getByText(/analizzata il \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(riga.getByRole('link', { name: 'Apri' })).toBeVisible();

    /*
      I tre punteggi del foglio Veezco, per ogni azienda analizzata. L'etichetta del cerchio è
      quella che legge un lettore di schermo: «Property: 5,17 su 7».
    */
    for (const rischio of ['Property', 'Interruzione', 'Cyber']) {
      await expect(
        riga.getByRole('img', { name: new RegExp(`^${rischio}: (\\d+(,\\d+)? su 7|non calcolabile)$`) }),
        rischio,
      ).toBeVisible();
    }
  });

  test('la ricerca trova una riga e lo dichiara, senza toccare il filtro', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portafoglio');

    const cerca = page.getByRole('searchbox', { name: /Cerca fra le aziende/i });
    await cerca.fill('meccanica');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText(/MECCANICA BRESCIANA/i);

    await cerca.fill('azienda che non esiste');
    await expect(page.getByText(/Nessuna azienda corrisponde/)).toBeVisible();

    await cerca.fill('');
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('su schermo stretto resta usabile: stato, nota e comando visibili', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portafoglio');

    const scheda = page
      .locator('ul > li')
      .filter({ hasText: /MECCANICA BRESCIANA/i })
      .first();
    await expect(scheda.getByLabel(/^Stato di /)).toBeVisible();
    await expect(scheda.getByRole('button', { name: /Aggiungi una nota|Modifica la nota/ })).toBeVisible();
    await expect(scheda.getByRole('link', { name: /^(Apri|Analizza)$/ })).toBeVisible();

    // La pagina non scorre di lato: l'elenco su telefono è fatto di schede, non di tabella.
    const eccedenza = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(eccedenza, `la pagina sborda di ${eccedenza}px`).toBeLessThanOrEqual(0);
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
