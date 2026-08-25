/**
 * Il rinvio all'accesso non deve nominare un host.
 *
 * In produzione, dietro il proxy inverso, chi apriva `https://<dominio>/` riceveva un 307
 * verso **`https://localhost:3000/accedi`**: il browser andava a bussare al computer di chi
 * navigava, e mostrava un errore di connessione. Il server era in piedi, rispondeva, aveva
 * il certificato valido — e diceva al browser di andare altrove.
 *
 * La causa non era il proxy. Misurata sul server: con `Host: <dominio>` la risposta era
 * `http://localhost:3000/accedi`; aggiungendo `X-Forwarded-Host: <dominio>` restava
 * identica; aggiungendo `X-Forwarded-Proto: https` diventava `https://localhost:3000/accedi`
 * — protocollo corretto, destinazione sbagliata, cioè il caso peggiore. Dietro un proxy
 * `request.nextUrl` non porta l'host pubblico, e nessuna configurazione del proxy lo cambia.
 *
 * La correzione è togliere l'host dalla risposta: un percorso relativo in `Location` è
 * valido (RFC 9110 §10.2.2) e il browser lo risolve sull'origine da cui sta navigando.
 *
 * Questo collaudo interroga il middleware con le intestazioni di un proxy e pretende che
 * la destinazione non contenga né schema né host — su nessuna delle rotte protette.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../src/middleware.js';

/** Una richiesta come la inoltra un proxy inverso: host pubblico fuori, localhost dentro. */
function dietroProxy(percorso: string, conSessione = false): NextRequest {
  const richiesta = new NextRequest(new URL(percorso, 'http://localhost:3000'), {
    headers: {
      host: 'presidio.esempio.it',
      'x-forwarded-host': 'presidio.esempio.it',
      'x-forwarded-proto': 'https',
      ...(conSessione ? { cookie: 'aegis_sessione=un-token-qualsiasi' } : {}),
    },
  });
  return richiesta;
}

describe('Il rinvio all’accesso funziona dietro un proxy inverso', () => {
  it('la destinazione è un percorso, senza schema né host', () => {
    const risposta = middleware(dietroProxy('/'));
    const destinazione = risposta.headers.get('location');

    expect(risposta.status).toBe(307);
    expect(destinazione).toBe('/accedi');
    expect(destinazione, 'un rinvio che nomina un host manda il browser altrove').not.toMatch(
      /^https?:\/\//,
    );
  });

  it('nessuna rotta protetta rinvia verso localhost', () => {
    /*
      Il guasto si sarebbe manifestato su ogni pagina, non solo sulla radice: chiunque
      arrivasse da un collegamento a una scheda azienda avrebbe visto lo stesso errore.
    */
    for (const percorso of [
      '/',
      '/portafoglio',
      '/prospect',
      '/monitoraggio',
      '/azienda/03158460174',
      '/impostazioni/costi',
    ]) {
      const destinazione = middleware(dietroProxy(percorso)).headers.get('location') ?? '';
      expect(destinazione, `${percorso} rinvia a un indirizzo assoluto`).not.toMatch(
        /^https?:\/\//,
      );
      expect(destinazione, `${percorso} rinvia verso localhost`).not.toContain('localhost');
      expect(destinazione.startsWith('/accedi'), `${percorso} non porta all’accesso`).toBe(true);
    }
  });

  it('la pagina richiesta si conserva, per tornarci dopo l’accesso', () => {
    const destinazione = middleware(dietroProxy('/azienda/03158460174')).headers.get('location');
    expect(destinazione).toBe('/accedi?ritorno=%2Fazienda%2F03158460174');
  });

  it('la radice non porta con sé un ritorno inutile', () => {
    expect(middleware(dietroProxy('/')).headers.get('location')).toBe('/accedi');
  });

  it('chi ha il cookie passa, senza rinvii', () => {
    const risposta = middleware(dietroProxy('/portafoglio', true));
    expect(risposta.headers.get('location')).toBeNull();
  });

  it('le due porte pubbliche restano aperte', () => {
    /*
      `/questionario/…` è il collegamento che l'intermediario manda al proprio cliente: chi
      lo apre non ha, e non deve avere, un accesso alla piattaforma.
    */
    for (const percorso of ['/accedi', '/questionario/un-token']) {
      expect(
        middleware(dietroProxy(percorso)).headers.get('location'),
        `${percorso} deve restare accessibile senza sessione`,
      ).toBeNull();
    }
  });
});
