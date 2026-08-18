import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AMMINISTRATORE } from './ambiente.js';

/** Partita IVA di un'azienda dimostrativa: nessuna chiamata a pagamento. */
export const AZIENDA_DI_PROVA = '02413390390';

export async function accedi(
  page: Page,
  credenziali: { email: string; password: string } = AMMINISTRATORE,
): Promise<void> {
  await page.goto('/accedi');
  await page.getByLabel('Indirizzo di posta').fill(credenziali.email);
  await page.getByLabel('Password').fill(credenziali.password);
  await page.getByRole('button', { name: 'Entra' }).click();

  // Si attende l'uscita dalla pagina di accesso, non un tempo fisso: un'attesa a tempo
  // è la ricetta per un collaudo che fallisce a caso su una macchina più lenta.
  //
  // L'attesa è però più lunga di quella predefinita, e solo qui: in sviluppo Next compila
  // le azioni alla prima invocazione, e l'accesso è la prima di tutte. Quindici secondi
  // bastano a regime e non bastano al primo giro — il collaudo fallirebbe per la
  // compilazione, non per il software.
  await expect(page).not.toHaveURL(/\/accedi/, { timeout: 90_000 });
}

export async function esci(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Esci' }).click();
  // Stessa ragione dell'accesso: la prima invocazione dell'azione va compilata, e la
  // disconnessione revoca la sessione sul database prima di rinviare.
  await expect(page).toHaveURL(/\/accedi/, { timeout: 90_000 });
}

/**
 * Nessun errore in console e nessuna richiesta fallita.
 *
 * Va installato **prima** della navigazione. Serve a intercettare i guasti che non
 * cambiano l'aspetto della pagina: una `fetch` che torna 401 e viene ingoiata non si vede
 * a schermo, ma qui sì.
 */
export function sorvegliaErrori(page: Page): { errori: string[] } {
  const errori: string[] = [];

  page.on('console', (messaggio) => {
    if (messaggio.type() === 'error') errori.push(`console: ${messaggio.text()}`);
  });
  page.on('pageerror', (errore) => errori.push(`eccezione: ${errore.message}`));
  page.on('response', (risposta) => {
    if (risposta.status() >= 500) errori.push(`${risposta.status()} su ${risposta.url()}`);
  });

  return { errori };
}
