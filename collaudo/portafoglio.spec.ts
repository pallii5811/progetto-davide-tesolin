import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';

/**
 * Il portafoglio è la schermata di lavoro quotidiano: «non è un cruscotto da guardare,
 * è una lista di telefonate da fare». Se le colonne che dicono *cosa fare* restano vuote,
 * la pagina smentisce la propria promessa.
 */
test.describe('Portafoglio', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    // Un'analisi vera, così il portafoglio ha qualcosa da mostrare.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  });

  test('mostra la prossima azione, non un trattino', async ({ page }) => {
    await page.goto('/portafoglio');

    const riga = page.locator('tbody tr').first();
    const azione = riga.locator('td').nth(4);

    // Con dodici coperture assenti e l'obbligo CAT NAT scaduto, qualcosa da fare c'è
    // per forza: leggendo il risultato congelato dell'analisi, non ricalcolandolo.
    await expect(azione).not.toHaveText('—');
    expect((await azione.innerText()).length).toBeGreaterThan(10);
  });

  test('mostra la percentuale di intervista effettivamente raggiunta', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);
    await page.getByLabel('Dipendenti', { exact: false }).first().fill('62');
    await page.getByRole('button', { name: /salva/i }).click();
    await page.reload();

    await page.goto('/portafoglio');

    // Restava fissa a 0% perché la lettura da database non chiedeva il dato: il broker
    // compilava l'intervista e il portafoglio continuava a dirgli che non l'aveva fatta.
    const testo = await page.locator('tbody tr').first().innerText();
    const percentuale = Number(/Dati di intervista (\d+)%/.exec(testo)?.[1] ?? '0');
    expect(percentuale).toBeGreaterThan(0);
  });

  test('su schermo stretto resta usabile: stato, esposizione e comando visibili', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portafoglio');

    const scheda = page.locator('ul > li').first();

    // Raggiungibile senza cercarla: la lista di lavoro non deve stare sotto una schermata
    // intera di numeri riassuntivi.
    await expect(scheda).toBeInViewport();

    // La tabella con scorrimento orizzontale lasciava fuori schermo proprio queste tre
    // cose, senza alcun indizio che ci fosse dell'altro.
    await expect(scheda.getByText(/inadempiente|conforme|in-scadenza/)).toBeVisible();

    const esposizione = scheda.locator('dd').filter({ hasText: /€/ }).first();
    await expect(esposizione).toBeVisible();

    await expect(scheda.getByRole('link', { name: 'Apri' })).toBeVisible();
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
