/**
 * Il cookie di sessione, letto dalle intestazioni di risposta dell'API.
 *
 * Funzione pura e senza `'use server'`: le azioni che la usano girano solo dentro Next,
 * questa si può collaudare da sola. Sta qui, e non duplicata in ogni azione, perché è la
 * riga da cui dipende il fatto che l'utente resti collegato — accesso e cambio password
 * la usano entrambi, e due copie divergono.
 */

export const NOME_COOKIE_SESSIONE = 'aegis_sessione';

/**
 * Àncora sul confine di attributo — inizio riga, oppure dopo `;` o `,`.
 * Senza, un cookie chiamato per esempio `altro_aegis_sessione` verrebbe scambiato per
 * quello buono, e la sessione si aprirebbe con un valore che non è un token.
 */
const COOKIE_DI_SESSIONE = new RegExp(String.raw`(?:^|[;,]\s*)${NOME_COOKIE_SESSIONE}=([^;]*)`);

export function estraiTokenSessione(intestazioni: readonly string[]): string | null {
  for (const intestazione of intestazioni) {
    const valore = COOKIE_DI_SESSIONE.exec(intestazione)?.[1];
    // Un cookie svuotato esprime una revoca: non è un token, ed è meglio non averne
    // che averne uno che non apre nulla.
    if (valore !== undefined && valore !== '') return valore;
  }
  return null;
}
