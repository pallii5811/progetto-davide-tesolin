import { expect, test } from '@playwright/test';
import { accedi, esci, sorvegliaErrori } from './aiuti.js';
import { AMMINISTRATORE } from './ambiente.js';

/**
 * Il ciclo di vita di un collaboratore, come lo vive un titolare di agenzia.
 *
 * Non si verifica solo che i comandi rispondano: si verifica che abbiano **effetto sul
 * mondo**. Una sospensione che lascia l'utente dentro fino a scadenza sessione non è una
 * sospensione, ed è una differenza che si scopre solo provando ad entrare.
 */
test.describe('Gestione dei collaboratori', () => {
  const collaboratore = { email: 'nuovo.collaboratore@studio.it', nome: 'Nuovo Collaboratore' };

  test('crea, sospende e riattiva un collaboratore', async ({ page, browser }) => {
    // Apre una seconda sessione in un browser separato e ne verifica la revoca: è il
    // collaudo più lungo della suite, e su una macchina carica il minuto preimpostato
    // non basta. Il rosso che ne deriva non riguarda il software.
    test.setTimeout(180_000);

    const sorveglianza = sorvegliaErrori(page);
    await accedi(page);
    await page.goto('/impostazioni/utenti');

    // ── Creazione ────────────────────────────────────────────────────────────
    await page.getByLabel('Nome e cognome').fill(collaboratore.nome);
    await page.getByLabel('Indirizzo di posta').fill(collaboratore.email);
    await page.getByRole('button', { name: 'Crea utente' }).click();

    const riquadro = page.getByText(/Password iniziale/);
    await expect(riquadro).toBeVisible();

    const testoPagina = await page.locator('body').innerText();
    const password = /\b([A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5})\b/.exec(
      testoPagina,
    )?.[1];
    expect(password, 'la password iniziale deve essere leggibile a schermo').toBeDefined();

    // ── La password consegnata deve funzionare ───────────────────────────────
    const suo = await browser.newContext();
    const suaPagina = await suo.newPage();
    await accedi(suaPagina, { email: collaboratore.email, password: password! });
    await suaPagina.goto('/portafoglio');
    await expect(suaPagina).toHaveURL(/\/portafoglio$/);

    // ── Sospensione: deve mordere subito ─────────────────────────────────────
    const riga = page.locator('li').filter({ hasText: collaboratore.email });
    await riga.getByRole('button', { name: 'Sospendi' }).click();
    await expect(riga.getByText('sospeso', { exact: true })).toBeVisible();

    await suaPagina.goto('/portafoglio');
    await expect(suaPagina, 'la sessione aperta deve cadere all’istante').toHaveURL(/\/accedi/);

    // ── E non deve poter rientrare ───────────────────────────────────────────
    await suaPagina.getByLabel('Indirizzo di posta').fill(collaboratore.email);
    await suaPagina.getByLabel('Password').fill(password!);
    await suaPagina.getByRole('button', { name: 'Entra' }).click();
    await expect(suaPagina).toHaveURL(/\/accedi/);

    // ── Riattivazione ────────────────────────────────────────────────────────
    await riga.getByRole('button', { name: 'Riattiva' }).click();
    await expect(riga.getByText('sospeso', { exact: true })).toBeHidden();

    await accedi(suaPagina, { email: collaboratore.email, password: password! });
    await suo.close();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('l’amministratore non può chiudersi fuori da solo', async ({ page }) => {
    await accedi(page);
    await page.goto('/impostazioni/utenti');

    const propria = page.locator('li').filter({ hasText: AMMINISTRATORE.email });

    // Nessun comando che porti all'autoesclusione deve nemmeno comparire: proporre
    // un'azione che finirà in errore è peggio che non offrirla.
    await expect(propria.getByRole('button', { name: 'Sospendi' })).toHaveCount(0);
    await expect(propria.getByRole('combobox')).toBeDisabled();
  });

  test('un collaboratore non vede la gestione utenti', async ({ page, browser }) => {
    await accedi(page);
    await page.goto('/impostazioni/utenti');

    await page.getByLabel('Nome e cognome').fill('Broker Semplice');
    await page.getByLabel('Indirizzo di posta').fill('broker.semplice@studio.it');
    await page.getByRole('button', { name: 'Crea utente' }).click();
    await expect(page.getByText(/Password iniziale/)).toBeVisible();

    const password = /\b([A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5})\b/.exec(
      await page.locator('body').innerText(),
    )?.[1];

    const suo = await browser.newContext();
    const suaPagina = await suo.newPage();
    await accedi(suaPagina, { email: 'broker.semplice@studio.it', password: password! });

    // La scheda non compare…
    await expect(suaPagina.getByRole('link', { name: 'Utenti dello studio' })).toHaveCount(0);

    // …e nemmeno andandoci a mano si ottiene qualcosa.
    await suaPagina.goto('/impostazioni/utenti');
    await expect(suaPagina.getByText(/Riservato agli amministratori/)).toBeVisible();

    await suo.close();
  });
});

test.describe('Cambio della propria password', () => {
  test('scollega gli altri dispositivi ma non chi lo esegue', async ({ page, browser }) => {
    const nuova = 'chiave-rossa-ventidue-lune';

    // Una seconda sessione dello stesso utente: è quella che deve cadere.
    const altrove = await browser.newContext();
    const altraPagina = await altrove.newPage();
    await accedi(altraPagina);

    await accedi(page);
    await page.goto('/impostazioni');
    await page.getByLabel('Password attuale').fill(AMMINISTRATORE.password);
    await page.getByLabel('Nuova password', { exact: true }).fill(nuova);
    await page.getByLabel('Conferma nuova password').fill(nuova);
    await page.getByRole('button', { name: /aggiorna password/i }).click();

    await expect(page.getByText(/Password aggiornata/)).toBeVisible();

    // Chi ha cambiato resta dentro: buttarlo fuori subito dopo sarebbe assurdo.
    await page.goto('/portafoglio');
    await expect(page).toHaveURL(/\/portafoglio$/);

    // L'altro dispositivo no: è la ragione principale per cui si cambia una password.
    await altraPagina.goto('/portafoglio');
    await expect(altraPagina).toHaveURL(/\/accedi/);
    await altrove.close();

    // Si ripristina la password per non lasciare l'ambiente in uno stato diverso da
    // quello in cui gli altri collaudi si aspettano di trovarlo.
    await page.goto('/impostazioni');
    await page.getByLabel('Password attuale').fill(nuova);
    await page.getByLabel('Nuova password', { exact: true }).fill(AMMINISTRATORE.password);
    await page.getByLabel('Conferma nuova password').fill(AMMINISTRATORE.password);
    await page.getByRole('button', { name: /aggiorna password/i }).click();
    await expect(page.getByText(/Password aggiornata/)).toBeVisible();

    await esci(page);
  });
});
