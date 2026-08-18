import { expect, test } from '@playwright/test';
import { accedi, esci, sorvegliaErrori } from './aiuti.js';
import { AMMINISTRATORE } from './ambiente.js';

test.describe('Accesso e protezione delle pagine', () => {
  test('senza sessione ogni pagina riservata rinvia all’accesso', async ({ page }) => {
    for (const percorso of ['/', '/portafoglio', '/catalogo', '/impostazioni', '/impostazioni/utenti']) {
      const risposta = await page.goto(percorso);

      // Non basta guardare dove si finisce: si verifica che il rinvio sia un vero 307,
      // perché una pagina in streaming può rispondere 200 e rinviare solo lato browser —
      // cosa che un client HTTP qualunque non vedrebbe.
      expect(page.url(), percorso).toContain('/accedi');
      expect(risposta?.request().redirectedFrom(), percorso).not.toBeNull();
    }
  });

  test('la pagina richiesta viene conservata e si torna lì dopo l’accesso', async ({ page }) => {
    await page.goto('/portafoglio');
    await expect(page).toHaveURL(/ritorno=%2Fportafoglio/);

    await page.getByLabel('Indirizzo di posta').fill(AMMINISTRATORE.email);
    await page.getByLabel('Password').fill(AMMINISTRATORE.password);
    await page.getByRole('button', { name: 'Entra' }).click();

    await expect(page).toHaveURL(/\/portafoglio$/);
  });

  test('una password sbagliata non entra e lo dice', async ({ page }) => {
    await page.goto('/accedi');
    await page.getByLabel('Indirizzo di posta').fill(AMMINISTRATORE.email);
    await page.getByLabel('Password').fill('password-decisamente-sbagliata');
    await page.getByRole('button', { name: 'Entra' }).click();

    // Il messaggio è volutamente identico per utente inesistente e password errata:
    // distinguerli lascerebbe enumerare gli indirizzi registrati.
    await expect(page.getByText(/Indirizzo o password non corretti/i)).toBeVisible();
    await expect(page).toHaveURL(/\/accedi/);
  });

  test('l’uscita revoca la sessione, non si limita a cancellare il cookie', async ({ page, context }) => {
    await accedi(page);

    const cookieSessione = (await context.cookies()).find((c) => c.name === 'aegis_sessione');
    expect(cookieSessione).toBeDefined();

    await esci(page);

    // Si rimette in circolo una copia del token: se l'uscita si fosse limitata a
    // cancellare il cookie, questa copia funzionerebbe ancora — ed è esattamente il
    // motivo per cui le sessioni stanno su database invece che in un token firmato.
    await context.addCookies([cookieSessione!]);
    await page.goto('/portafoglio');
    await expect(page).toHaveURL(/\/accedi/);
  });

  test('nessun errore in console durante accesso e uscita', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await accedi(page);
    await esci(page);
    expect(sorveglianza.errori).toEqual([]);
  });
});
