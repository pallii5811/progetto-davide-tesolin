/**
 * Registrazione pubblica, conferma dell'indirizzo, password dimenticata (18/09/2026).
 *
 * Le decisioni di Simone che questi collaudi tengono ferme:
 *  - chi si registra entra subito, ma **non compra** finché il gestore non attiva lo studio:
 *    il credito è uno, intestato al gestore;
 *  - l'indirizzo si conferma con un collegamento via email, e dallo stesso canale passa la
 *    password dimenticata;
 *  - nel modulo ci sono nome, email, password, nome dello studio e numero RUI.
 *
 * E le proprietà di sicurezza che una porta aperta a tutti deve avere: il collegamento
 * nell'email non si fa dirottare da un'intestazione, la password dimenticata non rivela
 * quali indirizzi esistono, un codice vale una volta, una password nuova chiude le sessioni,
 * e le raffiche si fermano.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockCompanyProvider } from '@aegis/providers';
import { NOME_COOKIE_SESSIONE } from '../src/auth.js';
import type { Persistenza } from '../src/persistenza.js';
import { PostaDiProva } from '../src/posta.js';
import { buildServer } from '../src/server.js';
import { accedi, creaUtenteDiProva, persistenzaDiProva } from './aiuti.js';

const GESTORE = 'gestore@piattaforma.it';
const PASSWORD = 'una-frase-lunga-e-mia-2026';

const MODULO = {
  nome: 'Giulia Ferri',
  email: 'giulia@studioferri.it',
  password: PASSWORD,
  denominazione: 'Studio Ferri Assicurazioni',
  numeroRui: 'b 000 123 456',
} as const;

/** Un elenco a pagamento (Bergamo, Mock) e il suo conteggio, che invece è gratuito. */
const ELENCO = '/api/prospect?comune=A794&limite=2';
const CONTEGGIO = `${ELENCO}&soloConteggio=1`;

function cookieDa(risposta: { cookies: { name: string; value: string }[] }): string {
  const c = risposta.cookies.find((x) => x.name === NOME_COOKIE_SESSIONE);
  if (c === undefined) throw new Error('Nessun cookie di sessione');
  return `${NOME_COOKIE_SESSIONE}=${c.value}`;
}

function codiceDallEmail(testo: string, percorso: '/conferma-email' | '/nuova-password'): string {
  const trovato = new RegExp(`https://aegis\\.esempio\\.it${percorso}\\?codice=([A-Za-z0-9_-]+)`).exec(
    testo,
  );
  if (trovato?.[1] === undefined) throw new Error(`Nessun collegamento ${percorso} nell'email:\n${testo}`);
  return decodeURIComponent(trovato[1]);
}

describe('Registrazione pubblica', () => {
  let persistenza: Persistenza;
  let posta: PostaDiProva;
  let app: FastifyInstance;
  let cookieGestore: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);
    posta = new PostaDiProva({ avvisiGestore: 'simone@piattaforma.it' });
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta });
    cookieGestore = await accedi(app, GESTORE);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  const registra = (modifiche: Partial<Record<keyof typeof MODULO, string>> = {}, intestazioni = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/registrazione',
      payload: { ...MODULO, ...modifiche },
      headers: intestazioni,
    });

  const io = async (cookie: string) =>
    (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();

  const studioRegistrato = async () =>
    (await app.inject({ method: 'GET', url: '/api/studi', headers: { cookie: cookieGestore } }))
      .json()
      .studi.find((s: { denominazione: string }) => s.denominazione === MODULO.denominazione);

  it('crea studio e amministratore, ed entra subito', async () => {
    const risposta = await registra();

    expect(risposta.statusCode).toBe(201);
    expect(risposta.json()).toMatchObject({
      email: MODULO.email,
      ruolo: 'amministratore',
      emailInviata: true,
    });

    const cookie = cookieDa(risposta);
    expect(await io(cookie)).toMatchObject({
      autenticato: true,
      email: MODULO.email,
      nome: MODULO.nome,
      ruolo: 'amministratore',
      gestorePiattaforma: false,
      acquistiAbilitati: false,
      emailVerificata: false,
    });

    // Il RUI si normalizza: maiuscole, senza spazi.
    expect(await studioRegistrato()).toMatchObject({
      numeroRui: 'B000123456',
      autoRegistrato: true,
      acquistiAbilitati: false,
      attivo: true,
      gestore: false,
      referente: { email: MODULO.email, emailConfermata: false },
    });
  }, 90_000);

  it('con la stessa password può rientrare dalla pagina di accesso', async () => {
    await registra();
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: MODULO.email.toUpperCase(), password: PASSWORD },
    });
    expect(accesso.statusCode).toBe(200);
  }, 90_000);

  it.each([
    ['numeroRui', { numeroRui: 'Z123' }, /lettera da A a F/],
    ['numeroRui', { numeroRui: '' }, /RUI/],
    ['email', { email: 'non-una-email' }, /non è valido/],
    ['nome', { nome: ' ' }, /nome e cognome/],
    ['denominazione', { denominazione: 'X' }, /nome dello studio/],
    ['password', { password: 'corta' }, /almeno 12 caratteri/],
  ] as const)(
    'rifiuta un modulo con %s sbagliato, dicendo quale campo',
    async (campo, modifica, messaggio) => {
      const risposta = await registra(modifica);
      expect(risposta.statusCode).toBe(400);
      expect(risposta.json().campo).toBe(campo);
      expect(risposta.json().errore).toMatch(messaggio);
      // E non lascia niente dietro di sé.
      expect(await studioRegistrato()).toBeUndefined();
    },
    90_000,
  );

  it('un indirizzo già registrato non apre un secondo studio', async () => {
    const risposta = await registra({ email: GESTORE, denominazione: 'Studio doppione' });
    expect(risposta.statusCode).toBe(409);
    expect(risposta.json().campo).toBe('email');
    const studi = (
      await app.inject({ method: 'GET', url: '/api/studi', headers: { cookie: cookieGestore } })
    ).json().studi as { denominazione: string }[];
    expect(studi.map((s) => s.denominazione)).not.toContain('Studio doppione');
  }, 90_000);

  it('uno studio in attesa conta gratis ma non compra, finché il gestore non lo attiva', async () => {
    const cookie = cookieDa(await registra());

    expect((await app.inject({ method: 'GET', url: CONTEGGIO, headers: { cookie } })).statusCode).toBe(200);

    const bloccato = await app.inject({ method: 'GET', url: ELENCO, headers: { cookie } });
    expect(bloccato.statusCode).toBe(403);
    expect(bloccato.json().errore).toMatch(/in attesa di attivazione/);
    expect(bloccato.json().errore).not.toMatch(/domani/);

    // Lo studio non può attivarsi da solo: la rotta è del gestore.
    const studio = await studioRegistrato();
    const daSolo = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studio.id}`,
      headers: { cookie },
      payload: { acquistiAbilitati: true },
    });
    expect(daSolo.statusCode).toBeGreaterThanOrEqual(403);
    expect((await app.inject({ method: 'GET', url: ELENCO, headers: { cookie } })).statusCode).toBe(403);

    // Con la posta attiva, il gestore non attiva finché chi ha aperto lo studio non conferma l'email.
    const troppoPresto = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studio.id}`,
      headers: { cookie: cookieGestore },
      payload: { acquistiAbilitati: true },
    });
    expect(troppoPresto.statusCode).toBe(409);
    expect(troppoPresto.json().errore).toContain(MODULO.email);
    expect((await io(cookie)).acquistiAbilitati).toBe(false);

    const codice = codiceDallEmail(
      posta.inviati.find((m) => m.a === MODULO.email)!.testo,
      '/conferma-email',
    );
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/conferma-email', payload: { codice } }))
        .statusCode,
    ).toBe(200);

    const attivazione = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studio.id}`,
      headers: { cookie: cookieGestore },
      payload: { acquistiAbilitati: true },
    });
    expect(attivazione.statusCode).toBe(200);

    // Vale dalla richiesta successiva, senza dover rientrare.
    expect((await io(cookie)).acquistiAbilitati).toBe(true);
    expect((await app.inject({ method: 'GET', url: ELENCO, headers: { cookie } })).statusCode).toBe(200);
  }, 90_000);

  it('gli studi aperti dal gestore comprano come prima', async () => {
    expect(
      (await app.inject({ method: 'GET', url: ELENCO, headers: { cookie: cookieGestore } })).statusCode,
    ).toBe(200);
  }, 90_000);

  it('il collegamento nell’email usa l’indirizzo configurato, qualunque cosa dica la richiesta', async () => {
    await registra(
      {},
      {
        host: 'sito-attaccante.example',
        origin: 'https://sito-attaccante.example',
        'x-forwarded-host': 'sito-attaccante.example',
      },
    );

    const conferma = posta.inviati.find((m) => m.a === MODULO.email);
    expect(conferma?.oggetto).toMatch(/Conferma/);
    expect(conferma?.testo).toContain('https://aegis.esempio.it/conferma-email?codice=');
    expect(conferma?.html).toContain('https://aegis.esempio.it/conferma-email?codice=');
    expect(JSON.stringify(conferma)).not.toContain('attaccante');
  }, 90_000);

  it('avvisa il gestore del nuovo studio, con RUI e referente', async () => {
    await registra();
    await vi.waitFor(() => expect(posta.inviati.some((m) => m.a === 'simone@piattaforma.it')).toBe(true));
    const avviso = posta.inviati.find((m) => m.a === 'simone@piattaforma.it');
    expect(avviso?.testo).toContain('B000123456');
    expect(avviso?.testo).toContain(MODULO.email);
    expect(avviso?.testo).toContain('https://aegis.esempio.it/impostazioni/studi');
  }, 90_000);

  it('il nome scelto da chi si registra non entra nelle email verso un indirizzo non confermato', async () => {
    // Revisione di sicurezza del 18/09/2026: il «nome» era un campo libero dentro un'email spedita
    // dal nostro mittente autenticato a un indirizzo scelto da chi si registra.
    await registra({
      nome: 'Mario. Il tuo abbonamento si rinnova oggi, annulla su https://truffa.example',
    });
    const conferma = posta.inviati.find((m) => m.a === MODULO.email);
    expect(conferma).toBeDefined();
    expect(JSON.stringify(conferma)).not.toContain('truffa');
    expect(JSON.stringify(conferma)).not.toContain('abbonamento');
  }, 90_000);

  it('uno studio in attesa non spende nemmeno salvando prima un dossier', async () => {
    // Il percorso trovato dalla revisione: il dossier crea la riga dell'azienda gratis, e
    // l'analisi di un'azienda «già in archivio» saltava il blocco e comprava l'anagrafica.
    const cookie = cookieDa(await registra());
    const dossier = await app.inject({
      method: 'PUT',
      url: '/api/aziende/03158460174/dossier',
      headers: { cookie },
      payload: {},
    });
    expect(dossier.statusCode).toBeLessThan(300);

    const analisi = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie },
      payload: {},
    });
    expect(analisi.statusCode).toBe(403);
    expect(analisi.json().errore).toMatch(/in attesa di attivazione/);
  }, 90_000);

  it('uno studio in attesa non aggiunge collaboratori, e non rivela chi è già registrato', async () => {
    const cookie = cookieDa(await registra());
    const aggiungi = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/utenti',
        headers: { cookie },
        payload: { email, nome: 'Collaboratore', ruolo: 'amministratore' },
      });

    const esistente = await aggiungi(GESTORE);
    const nuovo = await aggiungi('collaboratore@altrove.it');
    expect(esistente.statusCode).toBe(403);
    expect(nuovo.statusCode).toBe(403);
    expect(esistente.body).toBe(nuovo.body);
  }, 90_000);

  it('il referente mostrato al gestore resta chi ha aperto lo studio', async () => {
    await registra();
    expect((await studioRegistrato()).referente).toEqual({ email: MODULO.email, emailConfermata: false });
  }, 90_000);

  it('una password che non va bene non consuma i tentativi della rete', async () => {
    for (let i = 0; i < 6; i += 1) {
      const r = await registra({ password: 'broker-assicurazioni-2026' });
      expect(r.statusCode).toBe(400);
      expect(r.json().campo).toBe('password');
    }
    expect((await registra()).statusCode).toBe(201);
  }, 90_000);
});

describe('Conferma dell’indirizzo', () => {
  let persistenza: Persistenza;
  let posta: PostaDiProva;
  let app: FastifyInstance;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    posta = new PostaDiProva();
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta });
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  const conferma = (codice: string) =>
    app.inject({ method: 'POST', url: '/api/auth/conferma-email', payload: { codice } });

  it('il collegamento conferma l’indirizzo, anche aperto due volte; un codice inventato no', async () => {
    const registrazione = await app.inject({
      method: 'POST',
      url: '/api/auth/registrazione',
      payload: MODULO,
    });
    const cookie = cookieDa(registrazione);
    const codice = codiceDallEmail(posta.inviati[0]!.testo, '/conferma-email');

    expect((await conferma('inventato-ma-lungo-abbastanza-per-lo-schema')).statusCode).toBe(400);
    expect((await conferma(codice)).statusCode).toBe(200);
    // Il filtro antivirus della casella lo ha già aperto: il clic della persona funziona lo stesso.
    expect((await conferma(codice)).statusCode).toBe(200);

    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();
    expect(me.emailVerificata).toBe(true);
  }, 90_000);

  it('si può chiedere un nuovo collegamento, fino a tre l’ora', async () => {
    const cookie = cookieDa(
      await app.inject({ method: 'POST', url: '/api/auth/registrazione', payload: MODULO }),
    );
    const invia = () =>
      app.inject({ method: 'POST', url: '/api/auth/conferma-email/invia', headers: { cookie } });

    // La registrazione ne ha già mandato uno: ne restano due.
    expect((await invia()).statusCode).toBe(200);
    expect((await invia()).statusCode).toBe(200);
    expect((await invia()).statusCode).toBe(429);
    expect(posta.inviati.filter((m) => m.a === MODULO.email)).toHaveLength(3);
  }, 90_000);

  it('senza sessione non si chiede un nuovo collegamento', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auth/conferma-email/invia' })).statusCode).toBe(
      401,
    );
  }, 90_000);
});

describe('Password dimenticata', () => {
  let persistenza: Persistenza;
  let posta: PostaDiProva;
  let app: FastifyInstance;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    posta = new PostaDiProva();
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta });
    await app.inject({ method: 'POST', url: '/api/auth/registrazione', payload: MODULO });
    posta.inviati.length = 0;
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  const chiedi = (email: string) =>
    app.inject({ method: 'POST', url: '/api/auth/password-dimenticata', payload: { email } });

  const nuova = (codice: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/nuova-password', payload: { codice, password } });

  it('risponde uguale per un indirizzo registrato e per uno sconosciuto; l’email parte solo per il primo', async () => {
    const noto = await chiedi(MODULO.email);
    const ignoto = await chiedi('nessuno@altrove.it');

    expect(noto.statusCode).toBe(200);
    expect(ignoto.statusCode).toBe(200);
    expect(ignoto.body).toBe(noto.body);

    await vi.waitFor(() => expect(posta.inviati).toHaveLength(1));
    expect(posta.inviati[0]?.a).toBe(MODULO.email);
    expect(posta.inviati[0]?.testo).toContain('https://aegis.esempio.it/nuova-password?codice=');
    // Un attimo in più per essere sicuri che la seconda non arrivi in ritardo.
    await new Promise((r) => setTimeout(r, 200));
    expect(posta.inviati).toHaveLength(1);
  }, 90_000);

  it('la nuova password vale una volta, chiude le sessioni aperte e annulla i collegamenti precedenti', async () => {
    const vecchioCookie = await (async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MODULO.email, password: PASSWORD },
      });
      return cookieDa(r);
    })();

    await chiedi(MODULO.email);
    await chiedi(MODULO.email);
    await vi.waitFor(() => expect(posta.inviati).toHaveLength(2));
    const primo = codiceDallEmail(posta.inviati[0]!.testo, '/nuova-password');
    const secondo = codiceDallEmail(posta.inviati[1]!.testo, '/nuova-password');

    // Una password debole non brucia il collegamento.
    expect((await nuova(secondo, 'debole')).statusCode).toBe(400);

    const NUOVA = 'un-altra-frase-lunga-2026';
    expect((await nuova(secondo, NUOVA)).statusCode).toBe(200);

    // Una volta sola, e i fratelli sono annullati.
    expect((await nuova(secondo, NUOVA)).statusCode).toBe(400);
    expect((await nuova(primo, NUOVA)).statusCode).toBe(400);

    // Chi aveva la vecchia sessione è fuori.
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: vecchioCookie } }))
        .statusCode,
    ).toBe(401);

    // La vecchia password non entra più, la nuova sì — e l'indirizzo risulta confermato.
    const vecchia = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: MODULO.email, password: PASSWORD },
    });
    expect(vecchia.statusCode).toBe(401);
    const entrata = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: MODULO.email, password: NUOVA },
    });
    expect(entrata.statusCode).toBe(200);
    const me = (
      await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieDa(entrata) } })
    ).json();
    expect(me.emailVerificata).toBe(true);
  }, 90_000);

  it('un codice di conferma non vale per la nuova password', async () => {
    const cookie = cookieDa(
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MODULO.email, password: PASSWORD },
      }),
    );
    await app.inject({ method: 'POST', url: '/api/auth/conferma-email/invia', headers: { cookie } });
    const codice = codiceDallEmail(posta.inviati[0]!.testo, '/conferma-email');
    expect((await nuova(codice, 'un-altra-frase-lunga-2026')).statusCode).toBe(400);
  }, 90_000);

  it('più di tre richieste in un’ora per lo stesso indirizzo si fermano', async () => {
    for (let i = 0; i < 3; i += 1) expect((await chiedi(MODULO.email)).statusCode).toBe(200);
    expect((await chiedi(MODULO.email)).statusCode).toBe(429);
  }, 90_000);
});

describe('Con la posta spenta', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    app = buildServer({
      provider: new MockCompanyProvider(),
      persistenza,
      posta: new PostaDiProva({ attiva: false }),
    });
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('la registrazione funziona e dice che l’email non è partita; il recupero dice che non è attivo', async () => {
    const registrazione = await app.inject({
      method: 'POST',
      url: '/api/auth/registrazione',
      payload: MODULO,
    });
    expect(registrazione.statusCode).toBe(201);
    expect(registrazione.json().emailInviata).toBe(false);

    const recupero = await app.inject({
      method: 'POST',
      url: '/api/auth/password-dimenticata',
      payload: { email: MODULO.email },
    });
    expect(recupero.statusCode).toBe(503);
    expect(recupero.json().errore).toMatch(/amministratore del tuo studio/);

    const stato = (await app.inject({ method: 'GET', url: '/api/auth/stato' })).json();
    expect(stato).toEqual({ autenticazioneRichiesta: true, registrazioneAperta: true, postaAttiva: false });
  }, 90_000);
});

describe('Il freno sulle registrazioni', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  const chiavePrima = process.env['AEGIS_CHIAVE_FRONTEND'];

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
    if (chiavePrima === undefined) delete process.env['AEGIS_CHIAVE_FRONTEND'];
    else process.env['AEGIS_CHIAVE_FRONTEND'] = chiavePrima;
  });

  const registraN = async (n: number, intestazioni: (i: number) => Record<string, string>) => {
    const codici: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/registrazione',
        payload: { ...MODULO, email: `studio${i}@esempio.it`, denominazione: `Studio ${i}` },
        headers: intestazioni(i),
      });
      codici.push(r.statusCode);
    }
    return codici;
  };

  it('la sesta registrazione dalla stessa rete in un’ora si ferma', async () => {
    delete process.env['AEGIS_CHIAVE_FRONTEND'];
    persistenza = await persistenzaDiProva('Studio del gestore');
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta: new PostaDiProva() });

    // Senza chiave del frontend l'indirizzo inoltrato non conta: chiunque potrebbe scriverlo.
    const codici = await registraN(6, (i) => ({ 'x-aegis-ip-cliente': `203.0.113.${i}` }));
    expect(codici).toEqual([201, 201, 201, 201, 201, 429]);
  }, 120_000);

  it('con la chiave del frontend conta l’indirizzo del visitatore, non quello del server delle pagine', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = 'chiave-di-prova-del-frontend';
    persistenza = await persistenzaDiProva('Studio del gestore');
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta: new PostaDiProva() });

    const chiave = { 'x-aegis-frontend': 'chiave-di-prova-del-frontend' };
    // Sei visitatori diversi dallo stesso server delle pagine: nessuno è fermato.
    const diversi = await registraN(6, (i) => ({ ...chiave, 'x-aegis-ip-cliente': `203.0.113.${i}` }));
    expect(diversi).toEqual([201, 201, 201, 201, 201, 201]);
  }, 120_000);
});

describe('Il tetto complessivo delle registrazioni', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  const primaTotali = process.env['AEGIS_LIMITE_REGISTRAZIONI_ORA_TOTALI'];
  const primaPerIp = process.env['AEGIS_LIMITE_REGISTRAZIONI_ORA_PER_IP'];

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
    for (const [nome, valore] of [
      ['AEGIS_LIMITE_REGISTRAZIONI_ORA_TOTALI', primaTotali],
      ['AEGIS_LIMITE_REGISTRAZIONI_ORA_PER_IP', primaPerIp],
    ] as const) {
      if (valore === undefined) delete process.env[nome];
      else process.env[nome] = valore;
    }
  });

  it('conta solo gli studi creati davvero: le richieste respinte non lo riempiono', async () => {
    process.env['AEGIS_LIMITE_REGISTRAZIONI_ORA_TOTALI'] = '2';
    process.env['AEGIS_LIMITE_REGISTRAZIONI_ORA_PER_IP'] = '50';
    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);
    app = buildServer({ provider: new MockCompanyProvider(), persistenza, posta: new PostaDiProva() });

    const registra = (email: string, password = PASSWORD) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/registrazione',
        payload: { ...MODULO, email, password, denominazione: `Studio ${email}` },
      });

    // Password deboli e indirizzi già registrati: nessuno studio creato, nessun posto consumato.
    for (let i = 0; i < 5; i += 1)
      expect((await registra(`debole${i}@esempio.it`, 'corta')).statusCode).toBe(400);
    for (let i = 0; i < 5; i += 1) expect((await registra(GESTORE)).statusCode).toBe(409);

    expect((await registra('primo@esempio.it')).statusCode).toBe(201);
    expect((await registra('secondo@esempio.it')).statusCode).toBe(201);
    const terzo = await registra('terzo@esempio.it');
    expect(terzo.statusCode).toBe(429);
    expect(terzo.json().errore).toMatch(/sospese/);
    expect(terzo.json().errore).not.toMatch(/questa rete/);
  }, 120_000);
});
