/**
 * Il questionario compilato dal cliente.
 *
 * Apre l'unica porta del prodotto **senza autenticazione**: chi ha il collegamento entra.
 * Le prove qui sotto non riguardano la comodità della funzione ma le quattro proprietà che
 * la rendono accettabile.
 *
 *  1. Il token esiste **una volta sola**: in archivio ne resta l'impronta.
 *  2. Da quella porta si vede **solo il questionario**, mai l'analisi, mai il portafoglio,
 *     mai un'altra azienda.
 *  3. Scaduto, revocato e inesistente danno la **stessa** risposta: distinguerli direbbe a
 *     chi tenta collegamenti a caso quando ne ha trovato uno che è esistito.
 *  4. Chi ha compilato resta **a verbale**: un dato dichiarato dall'assicurato e uno
 *     rilevato dall'intermediario hanno un peso diverso davanti a una contestazione.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creaPersistenza } from '../src/persistenza.js';
import type { Persistenza } from '../src/persistenza.js';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';
import { MockCompanyProvider } from '@aegis/providers';
import { improntaToken } from '../src/auth.js';
import { accedi, creaUtenteDiProva } from './aiuti.js';

const AZIENDA = '03158460174';

describe('Questionario compilato dal cliente', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    persistenza = await creaPersistenza({ denominazioneTenant: 'Broker di prova' });
    app = buildServer({ persistenza, provider: new MockCompanyProvider() });
    await creaUtenteDiProva(persistenza, 'broker@studio.it');
    cookie = await accedi(app, 'broker@studio.it');
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  async function creaInvito(): Promise<string> {
    const risposta = await app.inject({
      method: 'POST',
      url: `/api/aziende/${AZIENDA}/questionario/invito`,
      headers: { cookie },
      payload: {},
    });
    expect(risposta.statusCode).toBe(201);
    return risposta.json().token;
  }

  it('genera un collegamento e in archivio ne conserva solo l’impronta', async () => {
    const token = await creaInvito();
    expect(token.length).toBeGreaterThan(30);

    const { schema } = await import('@aegis/db');
    const righe = await persistenza.db.select().from(schema.invitiQuestionario);
    const riga = righe.find((r) => r.impronta === improntaToken(token));

    expect(riga).toBeDefined();
    // Il token in chiaro non deve comparire da nessuna parte: chi legge una copia
    // dell'archivio non deve ottenere collegamenti funzionanti.
    expect(JSON.stringify(righe)).not.toContain(token);
  });

  it('senza sessione si apre il questionario, e nient’altro', async () => {
    const token = await creaInvito();

    const risposta = await app.inject({ method: 'GET', url: `/api/questionario/${token}` });
    expect(risposta.statusCode).toBe(200);

    const corpo = risposta.json();
    expect(corpo['denominazione']).toBeTruthy();
    expect(corpo).toHaveProperty('datiDichiarati');
    expect(corpo).toHaveProperty('polizze');

    /*
      La proprietà che conta: da questa porta non si vede l'analisi. Uno score di credito o
      un'esposizione patrimoniale sono dati dell'intermediario sul proprio cliente, non
      cose da mostrare a chiunque abbia un collegamento.
    */
    expect(corpo).not.toHaveProperty('scoreCredito');
    expect(corpo).not.toHaveProperty('sintesi');
    expect(corpo).not.toHaveProperty('rischi');
    expect(risposta.body).not.toContain('fidoConsigliato');
  });

  it('il cliente salva, e il dato arriva nel dossier dell’intermediario', async () => {
    const token = await creaInvito();

    const salvataggio = await app.inject({
      method: 'PUT',
      url: `/api/questionario/${token}`,
      payload: { datiDichiarati: { numeroVeicoli: 9, lavoraInCantiere: true } },
    });
    expect(salvataggio.statusCode).toBe(200);

    const dossier = await persistenza.perTenant(persistenza.tenantPredefinito).dossier.get(AZIENDA);
    expect(dossier?.datiDichiarati.numeroVeicoli).toBe(9);
  });

  it('resta a verbale che ha compilato il cliente, non l’intermediario', async () => {
    const token = await creaInvito();
    await app.inject({
      method: 'PUT',
      url: `/api/questionario/${token}`,
      payload: { datiDichiarati: { numeroVeicoli: 3 } },
    });

    const { schema } = await import('@aegis/db');
    const righe = await persistenza.db.select().from(schema.auditLog);
    expect(righe.map((r) => r.azione)).toContain('questionario.compilato-dal-cliente');
  });

  it('un collegamento revocato smette di funzionare, e non dice di essere esistito', async () => {
    const token = await creaInvito();
    expect((await app.inject({ method: 'GET', url: `/api/questionario/${token}` })).statusCode).toBe(200);

    const revoca = await app.inject({
      method: 'DELETE',
      url: `/api/aziende/${AZIENDA}/questionario/invito`,
      headers: { cookie },
    });
    expect(revoca.statusCode).toBe(200);

    const dopo = await app.inject({ method: 'GET', url: `/api/questionario/${token}` });
    const inventato = await app.inject({ method: 'GET', url: '/api/questionario/mai-esistito' });

    // Stessa risposta, stesso corpo: chi tenta collegamenti a caso non deve poter
    // distinguere «revocato» da «mai esistito».
    expect(dopo.statusCode).toBe(404);
    expect(inventato.statusCode).toBe(404);
    expect(dopo.body).toBe(inventato.body);
  });

  it('generarne uno nuovo revoca il precedente', async () => {
    const primo = await creaInvito();
    const secondo = await creaInvito();

    /*
      Se l'intermediario ne genera un altro è perché il primo non va bene — indirizzo
      sbagliato, referente cambiato, sospetto che sia finito altrove. Lasciarlo valido
      sarebbe il contrario di ciò che sta facendo.
    */
    expect((await app.inject({ method: 'GET', url: `/api/questionario/${primo}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/questionario/${secondo}` })).statusCode).toBe(200);
  });

  it('un collegamento scaduto non apre più nulla', async () => {
    const token = await creaInvito();

    // Si sposta la scadenza indietro invece di attendere trenta giorni.
    const { schema } = await import('@aegis/db');
    const { eq } = await import('drizzle-orm');
    await persistenza.db
      .update(schema.invitiQuestionario)
      .set({ scadeIl: new Date(Date.now() - 1000) })
      .where(eq(schema.invitiQuestionario.impronta, improntaToken(token)));

    expect((await app.inject({ method: 'GET', url: `/api/questionario/${token}` })).statusCode).toBe(404);
  });

  it('le rotte dell’intermediario restano protette', async () => {
    // La deroga di autenticazione vale per `/api/questionario/`, e solo per quello.
    const senzaSessione = await app.inject({
      method: 'POST',
      url: `/api/aziende/${AZIENDA}/questionario/invito`,
      payload: {},
    });
    expect(senzaSessione.statusCode).toBe(401);

    const analisi = await app.inject({
      method: 'POST',
      url: `/api/aziende/${AZIENDA}/analisi`,
      payload: {},
    });
    expect(analisi.statusCode).toBe(401);
  });
});
