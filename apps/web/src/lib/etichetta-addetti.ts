/**
 * Il numero di persone nell'intestazione, chiamato per quello che è.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * Su un autotrasportatore di Brescia l'intestazione diceva «40 addetti» e il record
 * camerale, mezza pagina più sotto, «Addetti 45». Nessuno dei due numeri era sbagliato:
 * il primo erano i DIPENDENTI dal bilancio, al 31 dicembre; il secondo gli ADDETTI
 * dichiarati al registro, che comprendono chi dipendente non è, aggiornati a settembre.
 *
 * Sbagliata era la parola. Chi legge un rapporto fa l'unico controllo che può fare —
 * confrontare due righe — e davanti a 40 e 45 con lo stesso nome conclude che il conto non
 * torni, oppure riferisce al cliente il numero sbagliato.
 *
 * ── PERCHÉ UN MODULO PER UNA PAROLA ──────────────────────────────────────────
 *
 * L'intestazione compare in due posti — la scheda e il report per il cliente — e la frase
 * era copiata identica in entrambi. Correggerne uno solo avrebbe lasciato la
 * contraddizione proprio nel documento che esce dallo studio.
 */

export type FonteAddetti = 'intervista' | 'bilancio' | 'archivio' | null;

/** «40 dipendenti» se il numero viene dal bilancio, «45 addetti» altrimenti. */
export function etichettaAddetti(numero: number, fonte: FonteAddetti): string {
  return fonte === 'bilancio' ? `${numero} dipendenti` : `${numero} addetti`;
}
