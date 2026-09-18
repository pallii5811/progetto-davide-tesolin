/**
 * Il rinvio all'accesso deve portare sul dominio da cui si sta navigando.
 *
 * In produzione, dietro il proxy inverso, chi apriva `https://<dominio>/` riceveva un 307
 * verso **`https://localhost:3000/accedi`**: il browser andava a bussare al computer di chi
 * navigava, e mostrava un errore di connessione. Il server era in piedi, rispondeva, aveva
 * un certificato valido — e diceva al browser di andare altrove.
 *
 * La causa non era il proxy. Misurata interrogando il servizio direttamente: con
 * `Host: <dominio>` la risposta era `http://localhost:3000/accedi`; aggiungendo
 * `X-Forwarded-Host: <dominio>` restava identica; aggiungendo `X-Forwarded-Proto: https`
 * diventava `https://localhost:3000/accedi` — protocollo corretto, destinazione sbagliata,
 * cioè il caso peggiore. Dietro un proxy `request.nextUrl` non porta l'host pubblico, e
 * nessuna configurazione del proxy lo cambia.
 *
 * ⚠️ **Questo collaudo da solo non basta.** Un rinvio *relativo* passerebbe tutte le
 * verifiche qui sotto ed è ciò che si era provato per primo — ma in esecuzione Next dà il
 * valore di `Location` al costruttore di `URL` e solleva `ERR_INVALID_URL`, e ogni pagina
 * protetta risponde 500. Quella validazione non scatta in ambiente di collaudo. La prova
 * che conta resta sull'istanza avviata: `curl -sS -o /dev/null -w '%{redirect_url}' https://<dominio>/prospect`
 * deve stampare un indirizzo sul dominio pubblico (non più la radice, che dal 18/09/2026 senza
 * sessione è la vetrina). È scritto anche in `deploy/LEGGIMI.md`.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../src/middleware.js';
import { INTESTAZIONE_VETRINA } from '../src/lib/vetrina.js';

const PUBBLICO = 'presidio.esempio.it';

/** Una richiesta come la inoltra un proxy inverso: host pubblico fuori, localhost dentro. */
function dietroProxy(
  percorso: string,
  opzioni: { sessione?: boolean; intestazioni?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL(percorso, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': PUBBLICO,
      'x-forwarded-proto': 'https',
      ...(opzioni.sessione === true ? { cookie: 'aegis_sessione=un-token-qualsiasi' } : {}),
      ...opzioni.intestazioni,
    },
  });
}

const destinazioneDi = (r: Response): string => r.headers.get('location') ?? '';

describe('Il rinvio all’accesso funziona dietro un proxy inverso', () => {
  it('porta sul dominio pubblico, non su localhost', () => {
    // Era «/»: dal 18/09/2026 la radice senza sessione è la vetrina e non rinvia (sotto).
    const risposta = middleware(dietroProxy('/prospect'));

    expect(risposta.status).toBe(307);
    expect(destinazioneDi(risposta)).toBe(`https://${PUBBLICO}/accedi?ritorno=%2Fprospect`);
  });

  it('nessuna rotta protetta rinvia verso localhost', () => {
    /*
      Il guasto si manifestava su ogni pagina, non solo sulla radice: chiunque arrivasse da
      un collegamento a una scheda azienda vedeva lo stesso errore di connessione.
    */
    for (const percorso of ['/portafoglio', '/prospect', '/azienda/03158460174', '/impostazioni/costi']) {
      const destinazione = destinazioneDi(middleware(dietroProxy(percorso)));
      expect(destinazione, `${percorso} rinvia verso localhost`).not.toContain('localhost');
      expect(
        destinazione.startsWith(`https://${PUBBLICO}/accedi`),
        `${percorso} non porta all’accesso sul dominio pubblico: ${destinazione}`,
      ).toBe(true);
    }
  });

  it('la pagina richiesta si conserva, per tornarci dopo l’accesso', () => {
    expect(destinazioneDi(middleware(dietroProxy('/azienda/03158460174')))).toBe(
      `https://${PUBBLICO}/accedi?ritorno=%2Fazienda%2F03158460174`,
    );
  });

  it('una pagina il cui nome comincia come la radice non è la vetrina', () => {
    // «/» è un confronto esatto: nessun altro percorso eredita l'apertura della radice.
    for (const percorso of ['/prospect', '/portafoglio', '/monitoraggio', '/azienda/03158460174']) {
      const risposta = middleware(dietroProxy(percorso));
      expect(risposta.status, percorso).toBe(307);
      expect(risposta.headers.get(`x-middleware-request-${INTESTAZIONE_VETRINA}`), percorso).toBeNull();
    }
  });

  it('senza proxy usa l’origine locale, così lo sviluppo non cambia', () => {
    const locale = new NextRequest(new URL('/portafoglio', 'http://localhost:3000'), {
      headers: { host: 'localhost:3000' },
    });
    expect(destinazioneDi(middleware(locale))).toBe('http://localhost:3000/accedi?ritorno=%2Fportafoglio');
  });

  it('un host inoltrato malformato viene ignorato', () => {
    /*
      L'intestazione la scrive il proxy, che sovrascrive quella del client, e il servizio
      ascolta solo su 127.0.0.1 — ma un rinvio è pur sempre un'istruzione che il browser
      esegue, e non deve poter puntare altrove per via di un'intestazione storta.
    */
    for (const cattivo of ['evil.com/percorso', 'utente@evil.com', 'due host', '//evil.com']) {
      const destinazione = destinazioneDi(
        middleware(dietroProxy('/portafoglio', { intestazioni: { 'x-forwarded-host': cattivo } })),
      );
      expect(destinazione, `«${cattivo}» è finito nella destinazione`).toBe(
        'http://localhost:3000/accedi?ritorno=%2Fportafoglio',
      );
    }
  });

  it('chi ha il cookie passa, senza rinvii', () => {
    expect(middleware(dietroProxy('/portafoglio', { sessione: true })).headers.get('location')).toBeNull();
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

/*
  La vetrina (18/09/2026): «/» senza sessione non rinvia più all'accesso, mostra la pagina che
  presenta AEGIS. Il middleware lo dice alla pagina con un'intestazione di richiesta, che Next
  trasporta come `x-middleware-request-<nome>`; `x-middleware-override-headers` elenca le
  intestazioni che la pagina riceverà.
*/
describe('La radice senza sessione è la vetrina', () => {
  const segnale = (r: Response): string | null =>
    r.headers.get(`x-middleware-request-${INTESTAZIONE_VETRINA}`);
  const intestazioniPassate = (r: Response): string[] =>
    (r.headers.get('x-middleware-override-headers') ?? '').split(',').map((s) => s.trim());

  it('senza cookie «/» non rinvia e porta il segnale della vetrina', () => {
    const risposta = middleware(dietroProxy('/'));
    expect(risposta.headers.get('location')).toBeNull();
    expect(risposta.status).toBe(200);
    expect(segnale(risposta)).toBe('1');
  });

  it('con il cookie «/» prosegue verso Ricerca Clienti, senza vetrina', () => {
    const risposta = middleware(dietroProxy('/', { sessione: true }));
    expect(risposta.headers.get('location')).toBeNull();
    expect(segnale(risposta)).toBeNull();
    expect(intestazioniPassate(risposta)).not.toContain(INTESTAZIONE_VETRINA);
  });

  it('un segnale mandato dal visitatore non arriva a nessuna pagina', () => {
    /*
      Con o senza sessione, su qualunque percorso che prosegue: l'intestazione scritta dal
      client si perde nel middleware. Solo sulla radice senza cookie la riscrive lui.
    */
    const falsa = { intestazioni: { [INTESTAZIONE_VETRINA]: '1' } };
    for (const [percorso, sessione] of [
      ['/', true],
      ['/prospect', true],
      ['/azienda/03158460174', true],
      ['/accedi', false],
      ['/questionario/un-token', false],
    ] as const) {
      const risposta = middleware(dietroProxy(percorso, { ...falsa, sessione }));
      expect(risposta.headers.get('location'), percorso).toBeNull();
      expect(segnale(risposta), percorso).toBeNull();
      expect(intestazioniPassate(risposta), percorso).not.toContain(INTESTAZIONE_VETRINA);
    }
  });

  it('un cookie di sessione vuoto non conta come sessione: si vede la vetrina', () => {
    const risposta = middleware(dietroProxy('/', { intestazioni: { cookie: 'aegis_sessione=' } }));
    expect(segnale(risposta)).toBe('1');
  });
});
