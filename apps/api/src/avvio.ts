/**
 * Predisposizione al primo avvio.
 *
 * Se non esiste alcun utente, ne crea uno amministratore con una password generata e la
 * stampa **una sola volta**, a schermo. Non viene scritta su file né inviata da nessuna
 * parte: chi avvia il servizio la legge e la cambia.
 *
 * L'alternativa diffusa — un `admin/admin` predefinito — è il modo più rapido per mettere
 * in rete un sistema con le credenziali che tutti conoscono.
 */

import { contaUtenti, creaUtente } from '@aegis/db';
import { derivaPassword, generaPasswordIniziale } from './auth.js';
import type { Persistenza } from './persistenza.js';

export interface EsitoPredisposizione {
  readonly creato: boolean;
  readonly email: string | null;
  readonly password: string | null;
}

export async function predisponiPrimoAccesso(
  persistenza: Persistenza,
  emailAmministratore: string,
): Promise<EsitoPredisposizione> {
  const utentiEsistenti = await contaUtenti(persistenza.db);
  if (utentiEsistenti > 0) {
    return { creato: false, email: null, password: null };
  }

  const password = generaPasswordIniziale();
  await creaUtente(persistenza.db, {
    tenantId: persistenza.tenantPredefinito,
    email: emailAmministratore,
    nome: 'Amministratore',
    passwordHash: await derivaPassword(password),
    ruolo: 'amministratore',
  });

  return { creato: true, email: emailAmministratore, password };
}

/** Riquadro leggibile, perché la password non passi inosservata fra i log di avvio. */
export function stampaCredenzialiIniziali(email: string, password: string): void {
  const larghezza = 78;
  const linea = '─'.repeat(larghezza);

  console.log('');
  console.log(`┌${linea}┐`);
  console.log(`│ PRIMO AVVIO — utente amministratore creato${' '.repeat(larghezza - 43)}│`);
  console.log(`├${linea}┤`);
  console.log(`│  Indirizzo: ${email.padEnd(larghezza - 14)}│`);
  console.log(`│  Password:  ${password.padEnd(larghezza - 14)}│`);
  console.log(`├${linea}┤`);
  console.log(
    `│  Questa password non verrà mostrata di nuovo. Annotarla e cambiarla.${' '.repeat(larghezza - 69)}│`,
  );
  console.log(`└${linea}┘`);
  console.log('');
}
