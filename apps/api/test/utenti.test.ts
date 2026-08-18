import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creaUtente } from '@aegis/db';
import type { FastifyInstance } from 'fastify';
import { derivaPassword } from '../src/auth.js';
import type { Persistenza } from '../src/persistenza.js';
import {
  accedi,
  creaUtenteDiProva,
  PASSWORD_DI_PROVA,
  persistenzaDiProva,
  serverDiProva,
} from './aiuti.js';

interface RispostaUtenti {
  utenti: { id: string; email: string; ruolo: string; attivo: boolean; seStesso: boolean }[];
}

describe('Gestione utenti', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookieAdmin: string;
  let cookieBroker: string;
  let idAdmin: string;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva('Studio Gamma');

    idAdmin = await creaUtente(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      email: 'capo@studio.it',
      nome: 'Titolare',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    await creaUtenteDiProva(persistenza, 'collaboratore@studio.it');

    app = serverDiProva(persistenza);
    cookieAdmin = await accedi(app, 'capo@studio.it');
    cookieBroker = await accedi(app, 'collaboratore@studio.it');
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('l’amministratore vede gli utenti del proprio studio', async () => {
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/utenti',
      headers: { cookie: cookieAdmin },
    });

    expect(risposta.statusCode).toBe(200);
    const corpo: RispostaUtenti = risposta.json();
    expect(corpo.utenti).toHaveLength(2);
    expect(corpo.utenti.find((u) => u.email === 'capo@studio.it')?.seStesso).toBe(true);
  });

  it('un broker non può vedere né gestire gli utenti', async () => {
    const elenco = await app.inject({
      method: 'GET',
      url: '/api/utenti',
      headers: { cookie: cookieBroker },
    });
    const creazione = await app.inject({
      method: 'POST',
      url: '/api/utenti',
      headers: { cookie: cookieBroker },
      payload: { email: 'intruso@studio.it', nome: 'Intruso' },
    });

    expect(elenco.statusCode).toBe(403);
    expect(creazione.statusCode).toBe(403);
  });

  it('crea un utente e restituisce la password iniziale una sola volta', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/utenti',
      headers: { cookie: cookieAdmin },
      payload: { email: 'nuovo@studio.it', nome: 'Nuovo Collaboratore', ruolo: 'assistente' },
    });

    expect(risposta.statusCode).toBe(201);
    const corpo: { passwordIniziale: string; id: string } = risposta.json();
    expect(corpo.passwordIniziale.length).toBeGreaterThan(15);

    // La password generata deve funzionare davvero: consegnarne una che non apre nulla
    // sarebbe peggio che non consegnarla.
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nuovo@studio.it', password: corpo.passwordIniziale },
    });
    expect(accesso.statusCode).toBe(200);
  });

  it('rifiuta un indirizzo già registrato', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/utenti',
      headers: { cookie: cookieAdmin },
      payload: { email: 'collaboratore@studio.it', nome: 'Doppione' },
    });
    expect(risposta.statusCode).toBe(409);
  });

  it('nessuno può disattivare o declassare sé stesso', async () => {
    // È il modo più rapido per chiudersi fuori dal proprio studio.
    const disattiva = await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${idAdmin}`,
      headers: { cookie: cookieAdmin },
      payload: { attivo: false },
    });
    const declassa = await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${idAdmin}`,
      headers: { cookie: cookieAdmin },
      payload: { ruolo: 'broker' },
    });

    expect(disattiva.statusCode).toBe(400);
    expect(declassa.statusCode).toBe(400);
  });

  it('deve restare almeno un amministratore attivo', async () => {
    const secondo = await app.inject({
      method: 'POST',
      url: '/api/utenti',
      headers: { cookie: cookieAdmin },
      payload: { email: 'secondo.capo@studio.it', nome: 'Secondo', ruolo: 'amministratore' },
    });
    const creato: { id: string } = secondo.json();
    const idSecondo = creato.id;

    // Con due amministratori si può declassare il secondo.
    const primo = await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${idSecondo}`,
      headers: { cookie: cookieAdmin },
      payload: { ruolo: 'broker' },
    });
    expect(primo.statusCode).toBe(200);

    // Ora ne resta uno solo: declassarlo lascerebbe lo studio senza controllo.
    const secondoTentativo = await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${idAdmin}`,
      headers: { cookie: cookieAdmin },
      payload: { ruolo: 'broker' },
    });
    expect(secondoTentativo.statusCode).toBe(400);
  });

  it('la disattivazione ha effetto immediato: le sessioni cadono', async () => {
    const utenti: RispostaUtenti = (
      await app.inject({ method: 'GET', url: '/api/utenti', headers: { cookie: cookieAdmin } })
    ).json();
    const collaboratore = utenti.utenti.find((u) => u.email === 'collaboratore@studio.it');

    const prima = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieBroker },
    });
    expect(prima.statusCode).toBe(200);

    await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${collaboratore!.id}`,
      headers: { cookie: cookieAdmin },
      payload: { attivo: false },
    });

    // Sospendere qualcuno lasciandolo dentro fino a scadenza sessione non è sospendere.
    const dopo = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieBroker },
    });
    expect(dopo.statusCode).toBe(401);
  });

  it('un utente disattivato non può più accedere', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'collaboratore@studio.it', password: PASSWORD_DI_PROVA },
    });
    expect(risposta.statusCode).toBe(401);
  });

  it('non si possono toccare utenti di un altro studio', async () => {
    const { schema } = await import('@aegis/db');
    const altri = await persistenza.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio Estraneo' })
      .returning({ id: schema.tenants.id });

    const idEstraneo = await creaUtenteDiProva(persistenza, 'estraneo@altro.it', altri[0]!.id);

    const modifica = await app.inject({
      method: 'PATCH',
      url: `/api/utenti/${idEstraneo}`,
      headers: { cookie: cookieAdmin },
      payload: { ruolo: 'amministratore' },
    });
    const revoca = await app.inject({
      method: 'POST',
      url: `/api/utenti/${idEstraneo}/revoca-sessioni`,
      headers: { cookie: cookieAdmin },
    });

    // Un identificativo indovinato non deve dare accesso a nulla.
    expect(modifica.statusCode).toBe(404);
    expect(revoca.statusCode).toBe(404);
  });
});

describe('Cambio della propria password', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva('Studio Delta');
    await creaUtenteDiProva(persistenza, 'utente@studio.it');
    app = serverDiProva(persistenza);
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('richiede la password corrente', async () => {
    const cookie = await accedi(app, 'utente@studio.it');
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { corrente: 'password-sbagliata-lunga', nuova: 'nuova-passphrase-robusta' },
    });
    expect(risposta.statusCode).toBe(401);
  });

  it('rifiuta una nuova password che non soddisfa i requisiti', async () => {
    const cookie = await accedi(app, 'utente@studio.it');
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { corrente: PASSWORD_DI_PROVA, nuova: 'corta' },
    });
    expect(risposta.statusCode).toBe(400);
  });

  it('cambia la password, revoca le altre sessioni e mantiene attiva la propria', async () => {
    const primaSessione = await accedi(app, 'utente@studio.it');
    const altraSessione = await accedi(app, 'utente@studio.it');

    const cambio = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: primaSessione },
      payload: { corrente: PASSWORD_DI_PROVA, nuova: 'nuova-passphrase-robusta-2026' },
    });
    expect(cambio.statusCode).toBe(200);

    // L'altra sessione cade: è la ragione principale per cui si cambia una password.
    const altra = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: altraSessione },
    });
    expect(altra.statusCode).toBe(401);

    // Chi ha cambiato riceve una sessione nuova e non viene buttato fuori.
    const nuovoCookie = cambio.cookies.find((c) => c.name === 'aegis_sessione');
    const propria = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: `aegis_sessione=${nuovoCookie!.value}` },
    });
    expect(propria.statusCode).toBe(200);

    // E la vecchia password non funziona più.
    const vecchia = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'utente@studio.it', password: PASSWORD_DI_PROVA },
    });
    expect(vecchia.statusCode).toBe(401);
  });
});
