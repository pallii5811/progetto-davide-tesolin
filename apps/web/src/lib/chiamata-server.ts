import { cookies } from 'next/headers';
import { NOME_COOKIE_SESSIONE } from './cookie-sessione';

/**
 * Chiamata all'API dalle Server Action, con la sessione dell'utente collegato.
 *
 * Esiste per togliere di mezzo un'intera classe di difetti. Le azioni girano sul server
 * di Next, non nel browser: una `fetch` nuda parte **anonima**, l'API risponde 401, e il
 * corpo di quel 401 è JSON perfettamente valido — quindi nessuna eccezione da
 * intercettare. Il risultato è una pagina che si rompe su un campo mancante, o un
 * salvataggio che fallisce in silenzio, senza che nulla indichi la causa vera.
 *
 * Passando tutti da qui, dimenticare il cookie non è più possibile.
 */
export async function chiamaApiConSessione(
  percorso: string,
  init: { metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; corpo?: unknown },
): Promise<Response> {
  const raccolta = await cookies();
  const sessione = raccolta.get(NOME_COOKIE_SESSIONE);

  return fetch(`${BASE_URL}${percorso}`, {
    method: init.metodo,
    headers: {
      // Dichiarato solo quando un corpo c'è davvero: annunciare `application/json` a mani
      // vuote fa rifiutare la richiesta con «Body cannot be empty». Sulla disconnessione
      // significherebbe non revocare la sessione — e chi ne avesse una copia potrebbe
      // continuare a usarla dopo che l'utente crede di essere uscito.
      ...(init.corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(sessione === undefined ? {} : { cookie: `${NOME_COOKIE_SESSIONE}=${sessione.value}` }),
    },
    ...(init.corpo === undefined ? {} : { body: JSON.stringify(init.corpo) }),
    cache: 'no-store',
  });
}

const BASE_URL = process.env.AEGIS_API_URL ?? 'http://127.0.0.1:3001';
