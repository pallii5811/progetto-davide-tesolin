import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Guardia di ingresso.
 *
 * Perché qui e non solo nelle pagine: le pagine con un confine di caricamento
 * (`loading.tsx`) vengono trasmesse in **streaming**. Next invia intestazioni e stato
 * `200` prima che il componente abbia finito di eseguire, e a quel punto un rinvio non può
 * più essere espresso come `307`: diventa un'istruzione dentro il flusso, che solo un
 * browser sa interpretare. Un client HTTP qualunque vedrebbe una pagina «riuscita».
 *
 * Il middleware gira **prima** di qualunque rendering, quindi il rinvio è un vero 307 per
 * tutti. Qui si verifica la sola presenza del cookie: la validità della sessione la
 * accerta l'API, che resta il vero cancello. Tre strati, nessuno dei quali si fida
 * dell'altro — ed è così che deve essere.
 */
/*
  Le due porte che si aprono senza sessione.

  `/questionario/` è il collegamento che l'intermediario manda al proprio cliente: chi lo
  apre **non ha e non deve avere** un accesso alla piattaforma. L'autorizzazione è il token
  nell'indirizzo, e a verificarla è l'API — che dal token ricava l'azienda e
  l'intermediario, e non espone nient'altro.

  Dimenticarlo qui non produce un guasto visibile dal lato dell'intermediario: il
  collegamento si genera, sembra tutto a posto, e il cliente riceve una schermata di
  accesso a un prodotto che non ha mai comprato. Nessuna prova sull'API se ne accorge,
  perché l'API funzionava.
*/
const PUBBLICI = ['/accedi', '/questionario'];

export function middleware(request: NextRequest): Response {
  const percorso = request.nextUrl.pathname;

  if (PUBBLICI.some((p) => percorso === p || percorso.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const sessione = request.cookies.get('aegis_sessione');
  if (sessione !== undefined && sessione.value !== '') {
    return NextResponse.next();
  }

  // Si conserva la pagina richiesta: dopo l'accesso l'utente torna dove voleva andare,
  // invece di ritrovarsi sulla schermata iniziale e dover ricominciare.
  const ritorno = percorso === '/' ? '' : `?ritorno=${encodeURIComponent(percorso)}`;

  /*
    Rinvio **relativo**, e non `NextResponse.redirect(request.nextUrl.clone())`.

    Con l'indirizzo assoluto il prodotto era irraggiungibile in produzione: chi apriva
    https://<dominio>/ riceveva un 307 verso `https://localhost:3000/accedi` — cioè verso
    il proprio computer — e vedeva un errore di connessione. Il sito era in piedi e
    rispondeva; semplicemente diceva al browser di andare altrove.

    La causa, misurata e non dedotta: dietro un proxy inverso `request.nextUrl` non porta
    l'host pubblico. Non basta configurare il proxy — con `Host: <dominio>` e persino con
    `X-Forwarded-Host: <dominio>` la risposta restava `localhost:3000`. Next costruisce
    quell'oggetto dal proprio indirizzo di ascolto, e onora le intestazioni inoltrate solo
    per lo schema: con `X-Forwarded-Proto: https` l'esito diventava `https://localhost:3000`,
    che è il caso peggiore — protocollo giusto, destinazione sbagliata.

    Un percorso relativo nell'intestazione `Location` è pienamente valido (RFC 9110 §10.2.2)
    e il browser lo risolve sull'origine da cui sta navigando. Così il rinvio è corretto
    dietro qualunque proxy, su qualunque dominio, e in sviluppo locale — senza che nulla
    debba essere configurato da nessuna parte.

    `Response` e non `NextResponse`: quest'ultima passa il valore di `Location` al
    costruttore di `URL`, che su un percorso relativo solleva `ERR_INVALID_URL`. L'errore
    non compare in un collaudo unitario — lì la validazione non scatta — ma in esecuzione
    trasforma ogni pagina protetta in un 500. Vale per tutte e due: il collaudo qui sotto
    non basta, e la verifica che conta è quella sull'istanza avviata, descritta in
    `deploy/LEGGIMI.md`.
  */
  return new Response(null, {
    status: 307,
    headers: { Location: `/accedi${ritorno}` },
  });
}

export const config = {
  /**
   * Esclude risorse statiche e immagini: sono servite prima di ogni logica applicativa e
   * non contengono dati riservati. Includerle significherebbe pagare il middleware su
   * ogni singola richiesta di un foglio di stile.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
