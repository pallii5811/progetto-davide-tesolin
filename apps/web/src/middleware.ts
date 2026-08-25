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

/** Solo un nome di host con porta facoltativa: niente barre, chiocciole, spazi. */
const HOST_LECITO = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/**
 * L'origine da cui l'utente sta davvero navigando.
 *
 * In produzione il prodotto era irraggiungibile: chi apriva `https://<dominio>/` riceveva
 * un 307 verso l'indirizzo di ascolto interno del servizio — che per il browser è il
 * computer di chi sta navigando — e vedeva un errore di connessione. Il server era in
 * piedi, rispondeva, aveva un certificato valido: diceva soltanto al browser di andare da
 * un'altra parte.
 *
 * La causa, misurata e non dedotta: dietro un proxy inverso `request.nextUrl` **non**
 * porta l'host pubblico, e non è un difetto di configurazione del proxy. Interrogando il
 * servizio direttamente, con `Host: <dominio>` la destinazione restava quella interna;
 * aggiungendo `X-Forwarded-Host: <dominio>` non cambiava; aggiungendo
 * `X-Forwarded-Proto: https` cambiava soltanto lo schema — protocollo giusto e
 * destinazione sbagliata, cioè il caso peggiore. Next costruisce quell'oggetto dal proprio
 * indirizzo di ascolto e onora le intestazioni inoltrate solo per lo schema.
 *
 * Le intestazioni però **arrivano**: qui si leggono direttamente, invece di passare da un
 * oggetto che le scarta.
 *
 * Un percorso relativo in `Location` sarebbe la soluzione pulita — è valido per l'RFC e non
 * dipenderebbe da nessuna intestazione — ma Next lo rifiuta: dà il valore in pasto al
 * costruttore di `URL` e solleva `ERR_INVALID_URL`, trasformando ogni pagina protetta in un
 * 500. Provato, e scartato per questo.
 *
 * Sull'affidarsi a un'intestazione: `X-Forwarded-Host` è scritto dal proxy, che sovrascrive
 * qualunque valore mandato dal client, e il servizio ascolta solo sull'interfaccia di
 * ritorno locale, con le proprie porte chiuse dal firewall: al middleware non arriva nulla
 * che non sia passato di lì. Il controllo su `HOST_LECITO` è comunque una seconda
 * serratura: un host che non sia un nome di host viene ignorato, e si torna all'origine
 * locale.
 */
function origineVisibile(request: NextRequest): string {
  const primo = (nome: string): string | null => {
    // Le intestazioni inoltrate possono elencare più valori: vale il primo, l'originale.
    const valore = request.headers.get(nome)?.split(',')[0]?.trim();
    return valore === undefined || valore === '' ? null : valore;
  };

  const host = primo('x-forwarded-host') ?? primo('host');
  if (host === null || !HOST_LECITO.test(host)) return request.nextUrl.origin;

  const schema = primo('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${schema}://${host}`;
}

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

  return new NextResponse(null, {
    status: 307,
    headers: { Location: `${origineVisibile(request)}/accedi${ritorno}` },
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
