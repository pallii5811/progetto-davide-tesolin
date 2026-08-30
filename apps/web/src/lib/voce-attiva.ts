/**
 * Quale voce di menu corrisponde alla pagina aperta.
 *
 * Sta in un modulo suo, e non dentro il componente, perché è la sola parte che si può
 * mettere alla prova senza un browser: il resto è marcatura.
 */

/**
 * La radice è attiva **solo** su se stessa.
 *
 * Con un confronto per prefisso «Ricerca» risulterebbe aperta ovunque, perché ogni
 * percorso comincia per `/`: le voci correnti sarebbero due, che è peggio di nessuna.
 * Per le altre il prefisso serve — `/portafoglio/importa` sta sotto il portafoglio — ma
 * si confronta **per segmento**: `startsWith('/prospect')` accenderebbe «Nuovi clienti»
 * anche su un ipotetico `/prospetto`.
 */
export function eAttiva(percorso: string | null, href: string): boolean {
  if (percorso === null || percorso === '') return false;
  if (href === '/') return percorso === '/';
  return percorso === href || percorso.startsWith(`${href}/`);
}
