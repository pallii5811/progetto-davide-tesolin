/**
 * Dove tornare dopo l'accesso, solo se è una pagina di questo sito.
 *
 * Il controllo era «comincia con / e non con //». La revisione di sicurezza del 18/09/2026 ha
 * trovato il buco: `/\attaccante.example` lo supera, e il browser tratta la barra inversa come
 * una barra — `//attaccante.example`, un altro sito. Lo stesso con una tabulazione in mezzo,
 * che il browser toglie. Un collegamento di phishing all'accesso vero, dopo la password giusta,
 * portava su una pagina finta che chiedeva di nuovo la password.
 *
 * Qui si accetta solo un percorso assoluto semplice: una barra iniziale non seguita da un'altra
 * barra o da una barra inversa, e nessun carattere di controllo, spazio o barra inversa in tutto
 * il resto. Tutto il resto torna a Ricerca Clienti.
 */
export const RITORNO_PREDEFINITO = '/prospect';

export function ritornoSicuro(ritorno: string): string {
  if (ritorno.length === 0 || ritorno.length > 512) return RITORNO_PREDEFINITO;
  if (!ritorno.startsWith('/')) return RITORNO_PREDEFINITO;
  if (ritorno.startsWith('//') || ritorno.startsWith('/\\')) return RITORNO_PREDEFINITO;
  for (const carattere of ritorno) {
    const codice = carattere.codePointAt(0) ?? 0;
    if (codice <= 0x20 || codice === 0x7f || carattere === '\\') return RITORNO_PREDEFINITO;
  }
  return ritorno;
}
