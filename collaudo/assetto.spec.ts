import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Assetto proprietario, gruppo e collegamenti.
 *
 * Il valore di questa sezione non sta nell'elenco dei soci — quello lo dà una visura — ma
 * in ciò che se ne deduce: chi controlla, quale responsabilità ne discende, e **quali
 * altre aziende dello stesso intermediario** fanno capo alle stesse persone.
 *
 * L'ultimo test è quello che conta davvero, perché attraversa tutta la catena: analisi →
 * salvataggio della compagine → interrogazione incrociata → collegamento in pagina. È
 * anche l'unico modo di accorgersi se una di quelle giunture si stacca.
 */
const SECONDA_AZIENDA = '02657870644';

test.describe('Assetto proprietario e gruppo', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('mostra la compagine sociale con le quote', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const sezione = page.locator('#assetto');
    await expect(sezione).toBeVisible();
    await expect(sezione.getByText('ROSSI GIOVANNI').first()).toBeVisible();

    // Le quote arrivano dal fornitore come frazioni (0,6): mostrarle così direbbe
    // «0,6%» invece di «60%», cioè un socio di minoranza al posto del controllante.
    await expect(sezione.getByText('60%').first()).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('dichiara il tipo di controllo, non solo l’elenco dei nomi', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toContainText(/Maggioranza in capo a una persona fisica/i);
  });

  test('spiega la responsabilità degli amministratori e cosa farne', async ({ page }) => {
    const sezione = page.locator('#assetto');
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    await expect(sezione).toContainText(/Responsabilità personale degli amministratori/i);
    // Un'implicazione senza azione è un'informazione; con l'azione è consulenza.
    await expect(sezione).toContainText(/D&O/);
    await expect(sezione).toContainText(/2392/);
  });

  test('elenca le domande da porre al cliente', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toContainText(/Da chiedere al cliente/i);
  });

  test('collega le aziende del portafoglio che hanno lo stesso socio', async ({ page }) => {
    // Due analisi distinte: il collegamento nasce dal confronto fra le due compagini
    // salvate, quindi prima devono esistere entrambe.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toBeVisible();

    await page.goto(`/azienda/${SECONDA_AZIENDA}`);
    await expect(page.locator('#assetto')).toBeVisible();

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    const collegamenti = page.getByText('Collegamenti nel tuo portafoglio');
    await expect(collegamenti).toBeVisible();

    // Il collegamento deve essere percorribile: è il gesto che trasforma la scoperta
    // in un'altra analisi.
    const sezione = page.locator('#assetto');
    await expect(sezione.getByRole('link', { name: /S\.R\.L\.|S\.P\.A\./ }).first()).toBeVisible();
  });
});
