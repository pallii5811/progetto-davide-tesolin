/**
 * Perché il questionario del cliente non si è aperto.
 *
 * La pagina diceva «Questo collegamento non è più attivo» in ogni caso, perché la chiamata
 * era `…catch(() => null)` e un `null` valeva quanto un 404. Ma un servizio che non
 * risponde succede **a ogni riavvio**, ed è il momento in cui un cliente qualunque, con un
 * token valido che nessuno ha toccato, legge che il suo collegamento è morto. Richiede
 * all'intermediario un collegamento nuovo, riceve lo stesso, e conclude che il prodotto
 * non funziona.
 *
 * La distinzione è quella della regola: **un errore della fonte non è un fallimento del
 * lavoro.** Un 404 dice qualcosa sul token; un 503 dice qualcosa sul servizio, e sul token
 * non dice niente.
 *
 * Restano indistinti fra loro i tre casi che riguardano davvero il token — inesistente,
 * scaduto, revocato — e questo è deliberato: separarli direbbe a chi prova indirizzi a
 * caso quando ne ha trovato uno che è esistito, e il rimedio da indicare è lo stesso.
 */
export type EsitoApertura = 'aperto' | 'non-valido' | 'servizio-non-raggiungibile';

/**
 * @param stato Lo stato HTTP della risposta, oppure `null` se la richiesta non è
 *   nemmeno arrivata a una risposta — servizio spento, rete caduta, timeout.
 */
export function esitoApertura(stato: number | null): EsitoApertura {
  if (stato === null) return 'servizio-non-raggiungibile';
  if (stato >= 200 && stato < 300) return 'aperto';

  /*
    Il 5xx è del servizio, non del token. Anche il 408 e il 429: la prima è un'attesa
    scaduta, la seconda un limite di frequenza — in nessuno dei due casi qualcuno ha
    revocato qualcosa.
  */
  if (stato >= 500 || stato === 408 || stato === 429) return 'servizio-non-raggiungibile';

  return 'non-valido';
}
