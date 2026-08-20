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

/**
 * L'unica chiamata **deliberatamente senza sessione**: il questionario del cliente.
 *
 * Chi apre quel collegamento non ha un accesso alla piattaforma, e non deve averlo:
 * l'autorizzazione è il token nell'indirizzo, verificata dall'API. Inoltrare un cookie che
 * si trovasse per caso nel browser — l'intermediario che prova il proprio collegamento —
 * sarebbe anzi la cosa sbagliata: confonderebbe **chi ha compilato**, che è il dato che
 * resta a verbale e che davanti a una contestazione distingue una dichiarazione
 * dell'assicurato da un rilievo dell'intermediario.
 *
 * Sta qui e non nella pagina perché la regola del progetto è che l'indirizzo dell'API si
 * costruisca in due soli moduli — una `fetch` sparsa nel frontend prima o poi dimentica il
 * cookie, ed è già successo. L'eccezione resta un'eccezione, ma dichiarata e in un posto
 * solo.
 */
export async function chiamaQuestionarioPubblico(
  token: string,
  init: { metodo: 'GET' | 'PUT'; corpo?: unknown },
): Promise<Response> {
  return fetch(`${BASE_URL}/api/questionario/${encodeURIComponent(token)}`, {
    method: init.metodo,
    headers: init.corpo === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(init.corpo === undefined ? {} : { body: JSON.stringify(init.corpo) }),
    cache: 'no-store',
  });
}

const BASE_URL = process.env.AEGIS_API_URL ?? 'http://127.0.0.1:3001';
