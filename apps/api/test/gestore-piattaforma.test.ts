/**
 * Chi gestisce la piattaforma e chi la usa.
 *
 * Gli archivi dati si pagano con un contratto unico, intestato a chi la piattaforma
 * l'ha messa in piedi. Gli studi che ci lavorano sopra sono clienti: non devono vedere
 * da chi arrivano i dati, quanto credito resta, quanto stanno consumando gli altri.
 *
 * Non è riservatezza commerciale e basta — è la stessa proprietà dell'isolamento fra
 * studi, guardata dall'altro verso. Un intermediario che leggesse il consumo complessivo
 * saprebbe quanto lavorano i concorrenti serviti dalla stessa installazione.
 *
 * Il presidio non può essere «la voce di menù non compare»: si collauda chiamando gli
 * indirizzi direttamente, come farebbe chiunque li conosca.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { creaStudio, creaUtente, registraCosto } from '@aegis/db';
import { derivaPassword, NOME_COOKIE_SESSIONE } from '../src/auth.js';
import type { Persistenza } from '../src/persistenza.js';
import {
  accedi,
  creaUtenteDiProva,
  PASSWORD_DI_PROVA,
  persistenzaDiProva,
  serverDiProva,
} from './aiuti.js';

const GESTORE = 'gestore@piattaforma.it';
const CLIENTE = 'broker@studiocliente.it';

/** Le rotte che espongono la filiera: nessuna deve rispondere a uno studio cliente. */
const RISERVATE = ['/api/servizi', '/api/fornitura', '/api/studi'] as const;

describe('Separazione fra gestore della piattaforma e studi clienti', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookieGestore: string;
  let cookieCliente: string;
  let studioCliente: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);

    // Un secondo studio nello **stesso** archivio: è l'unico modo di collaudare davvero
    // la separazione. Due archivi distinti la mostrerebbero anche se non esistesse.
    studioCliente = await creaStudio(persistenza.db, 'Studio cliente');
    await creaUtente(persistenza.db, {
      tenantId: studioCliente,
      email: CLIENTE,
      nome: 'Amministratore del cliente',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });

    app = serverDiProva(persistenza);
    cookieGestore = await accedi(app, GESTORE);
    cookieCliente = await accedi(app, CLIENTE);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('il primo studio creato è quello che gestisce la piattaforma', async () => {
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/studi',
      headers: { cookie: cookieGestore },
    });

    expect(risposta.statusCode).toBe(200);
    const corpo = risposta.json();
    expect(corpo.studi.find((s) => s.denominazione === 'Studio del gestore')?.gestore).toBe(true);
    expect(corpo.studi.find((s) => s.denominazione === 'Studio cliente')?.gestore).toBe(false);
  });

  it.each(RISERVATE)(
    'uno studio cliente non raggiunge %s nemmeno conoscendo l’indirizzo',
    async (rotta) => {
      const risposta = await app.inject({ method: 'GET', url: rotta, headers: { cookie: cookieCliente } });

      // 404 e non 403: un «riservato» confermerebbe che dietro quell'indirizzo c'è
      // qualcosa, e a chi non ne ha titolo non si dà nemmeno quella notizia.
      expect(risposta.statusCode).toBe(404);
      expect(risposta.body).not.toContain('OpenAPI');
    },
  );

  it('un amministratore del proprio studio non diventa gestore della piattaforma', async () => {
    // Il cliente è amministratore **nel proprio studio**: il ruolo più alto che esista
    // dentro la sua organizzazione non gli dà alcun titolo sull'infrastruttura di tutti.
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/fornitura',
      headers: { cookie: cookieCliente },
    });
    expect(risposta.statusCode).toBe(404);
  });

  it('apre uno studio cliente e la password iniziale funziona una volta sola', async () => {
    const creazione = await app.inject({
      method: 'POST',
      url: '/api/studi',
      headers: { cookie: cookieGestore },
      payload: { denominazione: 'Nuovo studio', nome: 'Titolare', email: 'titolare@nuovo.it' },
    });

    expect(creazione.statusCode).toBe(201);
    const { passwordIniziale } = creazione.json();
    expect(passwordIniziale.length).toBeGreaterThan(12);

    const accesso = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'titolare@nuovo.it', password: passwordIniziale },
    });
    expect(accesso.statusCode).toBe(200);
  }, 90_000);

  it('rifiuta un indirizzo già registrato invece di lasciarlo esplodere nel database', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/studi',
      headers: { cookie: cookieGestore },
      payload: { denominazione: 'Studio doppione', nome: 'Tizio', email: CLIENTE },
    });

    expect(risposta.statusCode).toBe(409);
  });

  it('uno studio cliente non può aprire altri studi', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/studi',
      headers: { cookie: cookieCliente },
      payload: { denominazione: 'Studio abusivo', nome: 'Tizio', email: 'tizio@abusivo.it' },
    });

    expect(risposta.statusCode).toBe(404);
  });

  it('uno studio cliente non può sospendere nessuno, nemmeno sé stesso', async () => {
    // Sospendere gli altri sarebbe un attacco; togliersi la sospensione da soli
    // renderebbe inutile la leva su cui si regge il rapporto commerciale.
    for (const bersaglio of [studioCliente, 'un-identificativo-qualsiasi']) {
      const risposta = await app.inject({
        method: 'PATCH',
        url: `/api/studi/${bersaglio}`,
        headers: { cookie: cookieCliente },
        payload: { attivo: false },
      });
      expect(risposta.statusCode).toBe(404);
    }

    // E infatti continua a lavorare: il rifiuto non ha avuto effetti collaterali.
    const dopo = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieCliente },
    });
    expect(dopo.statusCode).toBe(200);
  }, 90_000);
});

describe('Sospensione di uno studio', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookieGestore: string;
  let studioCliente: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);
    studioCliente = await creaStudio(persistenza.db, 'Studio cliente');
    await creaUtente(persistenza.db, {
      tenantId: studioCliente,
      email: CLIENTE,
      nome: 'Amministratore del cliente',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    app = serverDiProva(persistenza);
    cookieGestore = await accedi(app, GESTORE);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('chiude la porta a chi ha già il cookie in tasca', async () => {
    const cookieCliente = await accedi(app, CLIENTE);

    // Prima della sospensione lavora normalmente.
    const prima = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieCliente },
    });
    expect(prima.statusCode).toBe(200);

    await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioCliente}`,
      headers: { cookie: cookieGestore },
      payload: { attivo: false },
    });

    // Verificare la sospensione al solo accesso lascerebbe lavorare per giorni chi è
    // già entrato: qui la sessione esistente deve smettere di valere subito.
    const dopo = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieCliente },
    });
    expect(dopo.statusCode).toBe(401);
  }, 90_000);

  it('lo studio sospeso non rientra, e il rifiuto non rivela il perché', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioCliente}`,
      headers: { cookie: cookieGestore },
      payload: { attivo: false },
    });

    const accesso = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: CLIENTE, password: PASSWORD_DI_PROVA },
    });

    expect(accesso.statusCode).toBe(401);
    // Dire «il tuo studio è sospeso» a chi ha indovinato un indirizzo confermerebbe
    // che quell'indirizzo esiste: il rifiuto resta indistinguibile da password errata.
    expect(accesso.json()).toEqual({ errore: 'Indirizzo o password non corretti' });
    expect(accesso.cookies.find((c) => c.name === NOME_COOKIE_SESSIONE)).toBeUndefined();
  }, 90_000);

  it('riattivato, lo studio torna a lavorare', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioCliente}`,
      headers: { cookie: cookieGestore },
      payload: { attivo: false },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioCliente}`,
      headers: { cookie: cookieGestore },
      payload: { attivo: true },
    });

    const cookie = await accedi(app, CLIENTE);
    const risposta = await app.inject({ method: 'GET', url: '/api/portafoglio', headers: { cookie } });
    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('il gestore non può sospendere sé stesso', async () => {
    const studi = await app.inject({
      method: 'GET',
      url: '/api/studi',
      headers: { cookie: cookieGestore },
    });
    const corpo = studi.json();
    const proprio = corpo.studi.find((s) => s.gestore);

    const risposta = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${proprio?.id ?? ''}`,
      headers: { cookie: cookieGestore },
      payload: { attivo: false },
    });

    // Si chiuderebbe fuori dalla piattaforma che amministra, e nessun altro potrebbe
    // riaprirgliela: è l'errore da cui non si torna indietro senza toccare il database.
    expect(risposta.statusCode).toBe(409);
  });
});

describe('Fornitura dati: credito residuo e tetto complessivo', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookieGestore: string;
  let studioCliente: string;

  beforeEach(async () => {
    // 50 € caricati, tetto complessivo a 3 €, tetto per studio altissimo: così è il
    // limite della piattaforma a scattare, e si vede che è quello e non l'altro.
    process.env['AEGIS_CREDITO_CARICATO_CENTESIMI'] = '5000';
    process.env['AEGIS_TETTO_SPESA_COMPLESSIVO_CENTESIMI'] = '300';
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '1000000';

    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);
    studioCliente = await creaStudio(persistenza.db, 'Studio cliente');
    await creaUtente(persistenza.db, {
      tenantId: studioCliente,
      email: CLIENTE,
      nome: 'Amministratore del cliente',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    app = serverDiProva(persistenza);
    cookieGestore = await accedi(app, GESTORE);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_CREDITO_CARICATO_CENTESIMI'];
    delete process.env['AEGIS_TETTO_SPESA_COMPLESSIVO_CENTESIMI'];
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('il residuo è il caricato meno quanto il nostro registro ha segnato', async () => {
    await registraCosto(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 120,
      servitoDaCache: false,
    });
    // Servito dalla cache: non è stato pagato, non deve intaccare il residuo.
    await registraCosto(persistenza.db, {
      tenantId: studioCliente,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 9999,
      servitoDaCache: true,
    });

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/fornitura',
      headers: { cookie: cookieGestore },
    });

    expect(risposta.statusCode).toBe(200);
    const corpo = risposta.json();
    expect(corpo.consumatoTotaleCentesimi).toBe(120);
    expect(corpo.residuoCentesimi).toBe(5000 - 120);
  });

  it('il consumo somma tutti gli studi, non solo il proprio', async () => {
    await registraCosto(persistenza.db, {
      tenantId: studioCliente,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 200,
      servitoDaCache: false,
    });

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/fornitura',
      headers: { cookie: cookieGestore },
    });

    // Il gestore ha speso zero: se il totale fosse filtrato per studio direbbe 0, e il
    // credito si esaurirebbe senza che nessuno lo veda arrivare.
    const corpo = risposta.json();
    expect(corpo.consumatoOggiCentesimi).toBe(200);
  });

  it('il tetto complessivo ferma anche chi è ampiamente sotto il proprio', async () => {
    // Speso da un **altro** studio: quello che chiede l'analisi non ha speso nulla.
    await registraCosto(persistenza.db, {
      tenantId: studioCliente,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 400,
      servitoDaCache: false,
    });

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie: cookieGestore },
      payload: {},
    });

    expect(risposta.statusCode).toBe(429);
    const { errore } = risposta.json();
    // Il rifiuto deve dire che è il servizio ad aver raggiunto il limite: mandare
    // l'intermediario a cercare fra le proprie impostazioni lo farebbe sbattere contro
    // un numero che non c'entra e che non può cambiare.
    expect(errore).toContain('servizio');
    expect(errore).not.toContain('AEGIS_');
  }, 90_000);
});
