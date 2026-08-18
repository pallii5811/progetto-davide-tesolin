/**
 * Server HTTP.
 *
 * Fastify + Zod anziché NestJS: i pacchetti di dominio sono ESM puro, e NestJS in questo
 * momento vive meglio in CommonJS con `emitDecoratorMetadata` — combinazione che avrebbe
 * imposto o un doppio build dei pacchetti condivisi o l'abbandono di
 * `verbatimModuleSyntax`. Per una superficie di dieci rotte, il valore di moduli e DI
 * non ripaga quel costo. La composizione avviene qui, esplicitamente: nessuna magia,
 * nessun contenitore da capire.
 */

import {
  COVERAGE_CATALOG,
  Money,
  RISK_CATALOG,
  analyzeCompany,
  parsePartitaIva,
  valutaCompletezza,
} from '@aegis/core';
import type { CompanyProfile, DatiDichiarati, PolizzaInEssere } from '@aegis/core';
import { MemoryCache, MemoryCostLedger, ProviderError, createCompanyProvider } from '@aegis/providers';
import type { CostEvent } from '@aegis/providers';
import { RegistroPerRichiesta, conCostiDellaRichiesta, costoDegliEventi } from './costi-richiesta.js';
import type { CompanyDataProvider } from '@aegis/providers';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DURATA_SESSIONE_MS,
  DURATA_BLOCCO_MS,
  NOME_COOKIE_SESSIONE,
  SOGLIA_BLOCCO_TENTATIVI,
  derivaPassword,
  generaPasswordIniziale,
  generaTokenSessione,
  improntaToken,
  puoScrivere,
  verificaPassword,
  verificaRequisitiPassword,
} from './auth.js';
import type { Sessione } from './auth.js';
import type { ContestoTenant } from './persistenza.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Popolata dalla guardia di autenticazione. Assente sulle rotte pubbliche. */
    sessione?: Sessione;
  }
}
import { presentAnalysis } from './presenter.js';
import { z } from 'zod';
import {
  analisiRequestSchema,
  fetchLevelSchema,
  searchQuerySchema,
  toDatiDichiarati,
  toPolizza,
} from './schemas.js';
import { MemoryDossierStore, MemoryPortafoglioStore } from './store.js';
import type { DossierStore, PortafoglioStore } from './store.js';
import type { Persistenza } from './persistenza.js';

export interface BuildServerOptions {
  readonly provider?: CompanyDataProvider | undefined;
  readonly store?: DossierStore | undefined;
  readonly portafoglio?: PortafoglioStore | undefined;
  readonly ledger?: MemoryCostLedger | undefined;
  readonly logger?: boolean | undefined;
  /**
   * Persistenza su database. Se assente il servizio funziona ugualmente in memoria,
   * ma i dati non sopravvivono al riavvio: modalità accettabile solo per i test.
   */
  readonly persistenza?: Persistenza | undefined;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const ledger = options.ledger ?? new MemoryCostLedger();
  /*
    Il provider scrive su un registro che, oltre ad alimentare le statistiche globali,
    deposita ogni evento nel contenitore della richiesta in corso. Senza, le spese si
    imputano guardando quanto è cresciuto un elenco condiviso — e con due richieste in
    volo insieme si addebitano all'intermediario sbagliato.
  */
  const registro = new RegistroPerRichiesta(ledger);
  const provider =
    options.provider ??
    createCompanyProvider({
      openApiToken: process.env['OPENAPI_TOKEN'],
      cache: new MemoryCache(),
      ledger: registro,
    });
  const persistenza = options.persistenza;

  // Senza persistenza il servizio lavora in memoria e non richiede autenticazione:
  // è la modalità dei test di dominio e della dimostrazione locale. Con la persistenza
  // attiva, invece, ogni rotta è protetta e ogni dato è legato a un intermediario.
  const storeInMemoria = options.store ?? new MemoryDossierStore();
  const portafoglioInMemoria = options.portafoglio ?? new MemoryPortafoglioStore();
  const autenticazioneRichiesta = persistenza !== undefined;

  const app = Fastify({ logger: options.logger ?? false });

  // `credentials: true` è indispensabile perché il cookie di sessione viaggi:
  // senza, il browser lo scarta silenziosamente e l'utente resta disconnesso senza capire.
  void app.register(cors, { origin: true, credentials: true });
  void app.register(cookie);

  /**
   * Corpi non JSON.
   *
   * Fastify respinge con 415 ogni POST il cui `Content-Type` non abbia un parser
   * registrato. Le rotte senza corpo — la disconnessione, per esempio — lo dichiarano in
   * modo diverso a seconda del client: un modulo HTML manda
   * `application/x-www-form-urlencoded`, `fetch` senza corpo non manda nulla.
   * Senza questo parser la disconnessione dall'interfaccia fallirebbe, e l'utente
   * resterebbe collegato credendo di essere uscito.
   */
  app.addContentTypeParser(
    ['application/x-www-form-urlencoded', 'text/plain'],
    { parseAs: 'string' },
    (_richiesta, corpo: string, done) => {
      if (corpo === '') return done(null, undefined);
      try {
        done(null, Object.fromEntries(new URLSearchParams(corpo)));
      } catch {
        done(null, undefined);
      }
    },
  );

  /** Risolve il contesto dati della richiesta corrente. */
  /**
   * Imputa all'intermediario della richiesta le spese che la richiesta ha prodotto.
   *
   * Senza persistenza non c'è dove scriverle: la modalità in memoria serve ai test e alla
   * dimostrazione, dove il credito non esiste.
   */
  const registraSpese = async (
    request: FastifyRequest,
    eventi: readonly CostEvent[],
  ): Promise<void> => {
    if (eventi.length === 0 || persistenza === undefined) return;
    const sessione = request.sessione;
    if (sessione === undefined) return;
    await persistenza.perTenant(sessione.tenantId).registraCostiDati(eventi);
  };

  const contestoDi = (
    request: FastifyRequest,
  ): { dossier: DossierStore; portafoglio: PortafoglioStore; tenant: ContestoTenant | null } => {
    if (persistenza === undefined) {
      return { dossier: storeInMemoria, portafoglio: portafoglioInMemoria, tenant: null };
    }
    const sessione = request.sessione;
    if (sessione === undefined) {
      throw new ProviderError('Sessione assente', 'autenticazione');
    }
    const tenant = persistenza.perTenant(sessione.tenantId);
    return { dossier: tenant.dossier, portafoglio: tenant.portafoglio, tenant };
  };

  // ── Guardia di autenticazione ──────────────────────────────────────────────
  const ROTTE_PUBBLICHE = new Set(['/health', '/api/auth/login', '/api/auth/stato']);

  app.addHook('preHandler', async (request, reply) => {
    if (!autenticazioneRichiesta) return;
    if (ROTTE_PUBBLICHE.has(request.url.split('?')[0] ?? '')) return;

    const token = request.cookies[NOME_COOKIE_SESSIONE];
    if (token === undefined || token === '') {
      return reply.status(401).send({ errore: 'Autenticazione richiesta' });
    }

    const sessione = await risolviSessione(persistenza.db, token);
    if (sessione === null) {
      // Il cookie non è più valido: si rimuove, altrimenti il browser continuerebbe a
      // inviarlo a ogni richiesta e l'utente resterebbe in un limbo di 401.
      void reply.clearCookie(NOME_COOKIE_SESSIONE, { path: '/' });
      return reply.status(401).send({ errore: 'Sessione scaduta o revocata' });
    }

    // I ruoli in sola lettura non possono modificare nulla.
    if (!puoScrivere(sessione.ruolo) && request.method !== 'GET') {
      return reply.status(403).send({ errore: 'Il ruolo in sola lettura non consente modifiche' });
    }

    request.sessione = sessione;
  });

  // ── Diagnostica ────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    stato: 'ok',
    provider: provider.name,
    datiReali: !provider.name.startsWith('Demo'),
    persistenza: persistenza?.descrizione ?? 'in memoria (i dati non sopravvivono al riavvio)',
    datiPersistenti: persistenza !== undefined,
    autenticazione: autenticazioneRichiesta,
    versione: '0.1.0',
  }));

  // ── Autenticazione ─────────────────────────────────────────────────────────

  app.post('/api/auth/login', async (request, reply) => {
    if (persistenza === undefined) {
      return reply.status(501).send({ errore: 'Autenticazione non disponibile senza persistenza' });
    }

    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Credenziali non valide' });
    }

    const { trovaUtentePerEmail, registraTentativoAccesso, creaSessione } = await import('@aegis/db');
    const utente = await trovaUtentePerEmail(persistenza.db, parsed.data.email);

    // Messaggio identico per utente inesistente e password errata: distinguerli
    // consentirebbe di enumerare gli indirizzi registrati.
    const rifiuto = { errore: 'Indirizzo o password non corretti' };

    if (utente === null || !utente.attivo || utente.passwordHash === null) {
      // Si consuma comunque tempo di verifica, così la risposta non è più veloce
      // per un utente inesistente: sarebbe un canale laterale.
      await verificaPassword(parsed.data.password, ESCA_VERIFICA);
      return reply.status(401).send(rifiuto);
    }

    if (utente.bloccatoFinoA !== null && utente.bloccatoFinoA.getTime() > Date.now()) {
      const minuti = Math.ceil((utente.bloccatoFinoA.getTime() - Date.now()) / 60_000);
      return reply.status(429).send({
        errore: `Troppi tentativi falliti. Riprovare fra ${minuti} minuti.`,
      });
    }

    const corretta = await verificaPassword(parsed.data.password, utente.passwordHash);
    await registraTentativoAccesso(
      persistenza.db,
      utente.id,
      corretta,
      SOGLIA_BLOCCO_TENTATIVI,
      DURATA_BLOCCO_MS,
    );

    if (!corretta) return reply.status(401).send(rifiuto);

    const token = generaTokenSessione();
    await creaSessione(persistenza.db, {
      utenteId: utente.id,
      tenantId: utente.tenantId,
      improntaToken: improntaToken(token),
      scadeIl: new Date(Date.now() + DURATA_SESSIONE_MS),
      indirizzoIp: request.ip,
      userAgent: request.headers['user-agent'],
    });

    void reply.setCookie(NOME_COOKIE_SESSIONE, token, {
      path: '/',
      // `httpOnly` impedisce a qualunque script della pagina di leggere il token:
      // è la difesa che rende un eventuale XSS incapace di rubare la sessione.
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: Math.floor(DURATA_SESSIONE_MS / 1_000),
    });

    return {
      email: utente.email,
      nome: utente.nome,
      ruolo: utente.ruolo,
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[NOME_COOKIE_SESSIONE];
    if (token !== undefined && persistenza !== undefined) {
      const { revocaSessione } = await import('@aegis/db');
      await revocaSessione(persistenza.db, improntaToken(token));
    }
    void reply.clearCookie(NOME_COOKIE_SESSIONE, { path: '/' });
    return { uscito: true };
  });

  app.get('/api/auth/me', async (request) => {
    const sessione = request.sessione;
    return sessione === undefined
      ? { autenticato: false }
      : {
          autenticato: true,
          email: sessione.email,
          nome: sessione.nome,
          ruolo: sessione.ruolo,
        };
  });

  app.get('/api/auth/stato', async () => ({
    autenticazioneRichiesta,
  }));

  /**
   * Cambio della propria password.
   *
   * Richiede quella corrente: senza, chiunque trovasse una postazione incustodita
   * cambierebbe la password e chiuderebbe fuori il legittimo titolare.
   */
  app.post('/api/auth/password', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined || sessione === undefined) {
      return reply.status(401).send({ errore: 'Autenticazione richiesta' });
    }

    const parsed = cambioPasswordSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi' });
    }

    const requisiti = verificaRequisitiPassword(parsed.data.nuova);
    if (!requisiti.valida) {
      return reply.status(400).send({ errore: requisiti.problemi.join(' ') });
    }

    const { trovaUtentePerId, impostaPassword, revocaSessioniUtente, creaSessione } =
      await import('@aegis/db');

    const utente = await trovaUtentePerId(persistenza.db, sessione.utenteId);
    if (utente?.passwordHash == null) {
      return reply.status(401).send({ errore: 'Utente non valido' });
    }

    if (!(await verificaPassword(parsed.data.corrente, utente.passwordHash))) {
      return reply.status(401).send({ errore: 'La password attuale non è corretta' });
    }

    await impostaPassword(persistenza.db, utente.id, await derivaPassword(parsed.data.nuova));

    // Cambiare password deve buttare fuori chiunque altro fosse collegato con la vecchia:
    // è la ragione principale per cui si cambia una password.
    await revocaSessioniUtente(persistenza.db, utente.id);

    const token = generaTokenSessione();
    await creaSessione(persistenza.db, {
      utenteId: utente.id,
      tenantId: utente.tenantId,
      improntaToken: improntaToken(token),
      scadeIl: new Date(Date.now() + DURATA_SESSIONE_MS),
      indirizzoIp: request.ip,
      userAgent: request.headers['user-agent'],
    });

    void reply.setCookie(NOME_COOKIE_SESSIONE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: Math.floor(DURATA_SESSIONE_MS / 1_000),
    });

    return { aggiornata: true, sessioniRevocate: true };
  });

  // ── Gestione utenti (solo amministratore) ──────────────────────────────────

  /** Verifica il ruolo e risponde al posto della rotta se non è sufficiente. */
  const soloAmministratore = (request: FastifyRequest, reply: FastifyReply): Sessione | null => {
    const sessione = request.sessione;
    if (sessione === undefined) {
      void reply.status(401).send({ errore: 'Autenticazione richiesta' });
      return null;
    }
    if (sessione.ruolo !== 'amministratore') {
      void reply.status(403).send({ errore: 'Operazione riservata agli amministratori' });
      return null;
    }
    return sessione;
  };

  /**
   * Anagrafica dello studio.
   *
   * In lettura è aperta a chiunque abbia una sessione: serve a intestare il report, e
   * ogni collaboratore ne produce. In scrittura è dell'amministratore, perché il numero
   * di iscrizione al RUI che finisce sui documenti non è un campo qualsiasi.
   */
  app.get('/api/studio', async (request, reply) => {
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile in modalità senza persistenza' });
    }
    const tenant = contestoDi(request).tenant;
    if (tenant === null) {
      return reply.status(503).send({ errore: 'Archivio non disponibile in modalità senza persistenza' });
    }
    return (await tenant.studio.leggi()) ?? { errore: 'Studio non trovato' };
  });

  app.put('/api/studio', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const parsed = datiStudioSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const tenant = contestoDi(request).tenant;
    if (tenant === null) {
      return reply.status(503).send({ errore: 'Archivio non disponibile in modalità senza persistenza' });
    }
    await tenant.studio.aggiorna(parsed.data);
    return tenant.studio.leggi();
  });

  app.get('/api/utenti', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const { elencoUtenti } = await import('@aegis/db');
    const utenti = await elencoUtenti(persistenza.db, sessione.tenantId);

    return {
      utenti: utenti.map((u) => ({
        ...u,
        ultimoAccesso: u.ultimoAccesso?.toISOString() ?? null,
        creatoIl: u.creatoIl.toISOString(),
        seStesso: u.id === sessione.utenteId,
      })),
    };
  });

  app.post('/api/utenti', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const parsed = nuovoUtenteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const { trovaUtentePerEmail, creaUtente } = await import('@aegis/db');
    if ((await trovaUtentePerEmail(persistenza.db, parsed.data.email)) !== null) {
      return reply.status(409).send({ errore: 'Esiste già un utente con questo indirizzo' });
    }

    // La password iniziale la genera il sistema e viene mostrata una volta sola
    // all'amministratore, che la consegna a voce. Non viene inviata per posta né salvata.
    const password = generaPasswordIniziale();
    const utenteId = await creaUtente(persistenza.db, {
      tenantId: sessione.tenantId,
      email: parsed.data.email,
      nome: parsed.data.nome,
      passwordHash: await derivaPassword(password),
      ruolo: parsed.data.ruolo,
    });

    const { registraAudit } = await import('@aegis/db');
    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      azione: 'utente.creato',
      entita: 'utente',
      entitaId: utenteId,
      dettagli: { email: parsed.data.email, ruolo: parsed.data.ruolo, da: sessione.email },
    });

    return reply.status(201).send({ id: utenteId, email: parsed.data.email, passwordIniziale: password });
  });

  app.patch<{ Params: { id: string } }>('/api/utenti/:id', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const parsed = modificaUtenteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    // Nessuno può disattivare o declassare sé stesso: sarebbe il modo più rapido per
    // chiudersi fuori dal proprio studio senza avere nessuno che possa riaprire.
    if (request.params.id === sessione.utenteId) {
      if (
        parsed.data.attivo === false ||
        (parsed.data.ruolo !== undefined && parsed.data.ruolo !== 'amministratore')
      ) {
        return reply.status(400).send({
          errore: 'Non è possibile disattivare o declassare sé stessi.',
        });
      }
    }

    const { contaAmministratoriAttivi, elencoUtenti, aggiornaUtente, revocaSessioniUtente, registraAudit } =
      await import('@aegis/db');

    const destinatario = (await elencoUtenti(persistenza.db, sessione.tenantId)).find(
      (u) => u.id === request.params.id,
    );
    if (destinatario === undefined) {
      return reply.status(404).send({ errore: 'Utente non trovato' });
    }

    // Il vincolo «deve restare un amministratore» riguarda solo le modifiche che tolgono
    // di mezzo un amministratore **attivo**. Applicarlo a ogni disattivazione impedirebbe
    // di sospendere un collaboratore qualsiasi.
    const eraAmministratoreAttivo = destinatario.ruolo === 'amministratore' && destinatario.attivo;
    const perdeIPoteri =
      parsed.data.attivo === false ||
      (parsed.data.ruolo !== undefined && parsed.data.ruolo !== 'amministratore');

    if (
      eraAmministratoreAttivo &&
      perdeIPoteri &&
      (await contaAmministratoriAttivi(persistenza.db, sessione.tenantId)) <= 1
    ) {
      return reply.status(400).send({
        errore: 'Deve restare almeno un amministratore attivo.',
      });
    }

    const aggiornato = await aggiornaUtente(
      persistenza.db,
      sessione.tenantId,
      request.params.id,
      parsed.data,
    );
    if (!aggiornato) return reply.status(404).send({ errore: 'Utente non trovato' });

    // Disattivare un utente senza chiudergli le sessioni lo lascerebbe dentro fino
    // alla scadenza: la sospensione deve avere effetto immediato.
    if (parsed.data.attivo === false) {
      await revocaSessioniUtente(persistenza.db, request.params.id);
    }

    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      azione: 'utente.modificato',
      entita: 'utente',
      entitaId: request.params.id,
      dettagli: { ...parsed.data, da: sessione.email },
    });

    return { aggiornato: true };
  });

  app.post<{ Params: { id: string } }>('/api/utenti/:id/revoca-sessioni', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const { elencoUtenti, revocaSessioniUtente, registraAudit } = await import('@aegis/db');

    // Si verifica che l'utente appartenga allo stesso studio prima di toccarlo.
    const utenti = await elencoUtenti(persistenza.db, sessione.tenantId);
    if (!utenti.some((u) => u.id === request.params.id)) {
      return reply.status(404).send({ errore: 'Utente non trovato' });
    }

    await revocaSessioniUtente(persistenza.db, request.params.id);
    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      azione: 'utente.sessioni-revocate',
      entita: 'utente',
      entitaId: request.params.id,
      dettagli: { da: sessione.email },
    });

    return { revocate: true };
  });

  // ── Ricerca ────────────────────────────────────────────────────────────────
  app.get('/api/aziende/ricerca', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ errore: 'Parametri di ricerca non validi', dettagli: parsed.error.issues });
    }
    if (parsed.data.denominazione === undefined && parsed.data.partitaIva === undefined) {
      return reply.status(400).send({ errore: 'Indicare almeno una denominazione o una partita IVA' });
    }
    // Una P.IVA con check digit errato è quasi sempre un errore di battitura:
    // dirlo subito costa nulla, cercarla costa una chiamata a pagamento.
    if (parsed.data.partitaIva !== undefined && parsePartitaIva(parsed.data.partitaIva) === null) {
      return reply.status(400).send({
        errore:
          'Partita IVA non valida: il carattere di controllo non corrisponde. Verificare la digitazione.',
      });
    }

    const risultati = await provider.search(parsed.data);
    return { risultati, provider: provider.name };
  });

  /**
   * Ricerca di prospect.
   *
   * Con `soloConteggio` non scarica e non addebita: risponde quante aziende
   * corrispondono e quanto costerebbe l'elenco. È la modalità con cui si compongono i
   * filtri, e l'interfaccia la usa a ogni modifica: senza, comporre una ricerca per
   * tentativi costerebbe un centesimo a tentativo — poco, ma sufficiente a far smettere
   * di provare, che è il modo peggiore di risparmiare.
   */
  app.get('/api/prospect', async (request, reply) => {
    const parsed = prospezioneSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Filtri non validi', dettagli: parsed.error.issues });
    }

    const { soloConteggio, ...criteri } = parsed.data;
    const haFiltri = Object.values(criteri).some((v) => v !== undefined && v !== '');
    if (!haFiltri) {
      return reply.status(400).send({ errore: 'Indicare almeno un criterio di ricerca' });
    }

    const { risultato, eventi } = await conCostiDellaRichiesta(() =>
      provider.cercaProspect(criteri, { soloConteggio }),
    );

    // Anche qui: la spesa va nel registro **subito**, non alla prossima analisi. Un
    // elenco di prospect costa quanto un'analisi, e non comparire nel consuntivo lo
    // renderebbe invisibile a chi controlla il credito residuo.
    await registraSpese(request, eventi);

    return { ...risultato, provider: provider.name };
  });

  // ── Profilo grezzo ─────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/aziende/:id/profilo', async (request, reply) => {
    const livello = fetchLevelSchema.parse(
      (request.query as Record<string, unknown>)['livello'] ?? 'completo',
    );
    const profilo = await caricaProfilo(provider, request.params.id, livello);
    if (profilo === null) return reply.status(404).send({ errore: 'Azienda non trovata' });

    return {
      identita: profilo.identity,
      anagrafica: profilo.anagrafica.value,
      assetti: profilo.assetti?.value ?? null,
      unitaLocali: profilo.unitaLocali?.value ?? null,
      eserciziDisponibili: profilo.bilanci.map((b) => b.value.anno),
    };
  });

  // ── Analisi completa ───────────────────────────────────────────────────────
  /**
   * Analisi di un'azienda, con congelamento su database.
   *
   * Estratta dall'endpoint perché la usa anche la presa in carico massiva: due copie
   * della stessa procedura divergerebbero, e a divergere sarebbe ciò che finisce
   * nell'archivio — cioè la parte che fra tre anni qualcuno potrebbe contestare.
   */
  const analizzaERegistra = async (
    request: FastifyRequest,
    identificativo: string,
    opzioni: {
      datiDichiarati?: Partial<DatiDichiarati> | undefined;
      polizze?: PolizzaInEssere[] | undefined;
      asOf?: Date | undefined;
    } = {},
  ) => {
    const contesto = contestoDi(request);

    // I dati raccolti in intervista vengono conservati: la seconda analisi della stessa
    // azienda non deve ripartire da un questionario vuoto.
    if (opzioni.datiDichiarati !== undefined || opzioni.polizze !== undefined) {
      await contesto.dossier.upsert(identificativo, {
        ...(opzioni.datiDichiarati === undefined ? {} : { datiDichiarati: opzioni.datiDichiarati }),
        ...(opzioni.polizze === undefined ? {} : { polizze: opzioni.polizze }),
      });
    }

    const profilo = await caricaProfilo(provider, identificativo, 'completo');
    if (profilo === null) return null;

    const dossier = await contesto.dossier.get(identificativo);
    const profiloArricchito: CompanyProfile = {
      ...profilo,
      datiDichiarati: unisciDatiDichiarati(profilo.datiDichiarati, dossier?.datiDichiarati),
    };

    const analisi = analyzeCompany(profiloArricchito, dossier?.polizze ?? [], opzioni.asOf ?? new Date());

    // L'analisi viene congelata su database insieme allo snapshot dei dati che l'hanno
    // prodotta: senza, fra tre anni sarebbe impossibile dimostrare su cosa si fondava.
    if (contesto.tenant !== null) {
      await contesto.tenant.registraAnalisi(identificativo, analisi, provider.name);
    }

    await contesto.portafoglio.registra({
      identificativo,
      denominazione: analisi.profile.identity.denominazione,
      partitaIva: analisi.profile.identity.partitaIva,
      provincia: analisi.profile.anagrafica.value.sedeLegale?.provincia ?? null,
      atecoDescrizione: analisi.profile.anagrafica.value.atecoPrimarioDescrizione,
      scoreCredito: analisi.sintesi.scoreCredito,
      classeCredito: analisi.sintesi.classeCredito,
      statoCatNat: analisi.catNat.value.status,
      catNatConforme: analisi.sintesi.catNatConforme,
      coperturaAssente: analisi.sintesi.coperturaAssente,
      coperturaDaQuantificare: analisi.sintesi.coperturaDaQuantificare,
      rischiCritici: analisi.sintesi.rischiCritici,
      esposizioneNonAssicurataCentesimi: analisi.sintesi.esposizioneNonAssicurata,
      completezza: analisi.completezza.percentuale,
      azionePrioritaria: analisi.sintesi.azioniPrioritarie[0] ?? null,
      analizzataIl: new Date(),
    });

    return analisi;
  };

  // ── Analisi completa ───────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/aziende/:id/analisi', async (request, reply) => {
    const parsed = analisiRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ errore: 'Corpo della richiesta non valido', dettagli: parsed.error.issues });
    }

    const { risultato: analisi, eventi } = await conCostiDellaRichiesta(() =>
      analizzaERegistra(request, request.params.id, {
        ...(parsed.data.datiDichiarati === undefined
          ? {}
          : { datiDichiarati: toDatiDichiarati(parsed.data.datiDichiarati) }),
        ...(parsed.data.polizze === undefined ? {} : { polizze: parsed.data.polizze.map(toPolizza) }),
        ...(parsed.data.asOf === undefined ? {} : { asOf: parsed.data.asOf }),
      }),
    );

    await registraSpese(request, eventi);

    if (analisi === null) return reply.status(404).send({ errore: 'Azienda non trovata' });
    return presentAnalysis(analisi);
  });

  // ── Salvataggio dei dati di intervista, senza ricalcolo ─────────────────────
  app.put<{ Params: { id: string } }>('/api/aziende/:id/dossier', async (request, reply) => {
    const parsed = analisiRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const dossier = await contestoDi(request).dossier.upsert(request.params.id, {
      ...(parsed.data.datiDichiarati === undefined
        ? {}
        : { datiDichiarati: toDatiDichiarati(parsed.data.datiDichiarati) }),
      ...(parsed.data.polizze === undefined ? {} : { polizze: parsed.data.polizze.map(toPolizza) }),
    });

    // Restituire subito la completezza aggiornata evita un secondo giro di rete
    // per dire all'utente cosa gli manca ancora.
    return { ...dossier, completezza: valutaCompletezza(dossier.datiDichiarati) };
  });

  // ── Portafoglio ────────────────────────────────────────────────────────────
  /**
   * Collegamenti societari di un'azienda dentro il portafoglio.
   *
   * Rotta separata dall'analisi perché la risposta dipende da **cos'altro** è in
   * portafoglio: cambia quando si analizza un'altra azienda, non quando cambia questa.
   * Tenerla dentro l'analisi congelata darebbe una fotografia che invecchia da sola.
   */
  app.get<{ Params: { id: string } }>('/api/aziende/:id/collegamenti', async (request) => {
    const collegamenti = await contestoDi(request).portafoglio.collegamenti(request.params.id);
    return { collegamenti };
  });

  app.get('/api/portafoglio', async (request) => {
    const voci = await contestoDi(request).portafoglio.elenco();
    return {
      aziende: voci.map((v) => ({
        ...v,
        esposizioneNonAssicurata: {
          centesimi: v.esposizioneNonAssicurataCentesimi,
          euro: v.esposizioneNonAssicurataCentesimi / 100,
          formattato: Money.formatCompact(v.esposizioneNonAssicurataCentesimi as never),
        },
        analizzataIl: v.analizzataIl.toISOString(),
      })),
      riepilogo: {
        totale: voci.length,
        nonConformiCatNat: voci.filter((v) => !v.catNatConforme).length,
        esposizioneComplessivaEuro:
          voci.reduce((sum, v) => sum + v.esposizioneNonAssicurataCentesimi, 0) / 100,
        coperturaAssenteTotale: voci.reduce((sum, v) => sum + v.coperturaAssente, 0),
      },
    };
  });

  // ── Presa in carico massiva del portafoglio ────────────────────────────────

  /**
   * Cosa succederebbe, e quanto costerebbe. Non tocca nulla e non spende nulla.
   *
   * È un passaggio separato per una ragione precisa: un'importazione che parte da sola su
   * quattrocento aziende brucia quaranta euro prima che chiunque possa fermarla.
   */
  app.post('/api/portafoglio/importa/anteprima', async (request, reply) => {
    const parsed = importazioneSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Contenuto non valido', dettagli: parsed.error.issues });
    }

    const { preparaImportazione, MASSIMO_PER_IMPORTAZIONE } = await import('./importazione.js');
    const { costoAnalisi } = await import('@aegis/providers');

    const presenti = new Set((await contestoDi(request).portafoglio.elenco()).map((v) => v.identificativo));

    const costoUnitarioCentesimi = costoAnalisi('completo');
    const anteprima = preparaImportazione(parsed.data.contenuto, presenti, costoUnitarioCentesimi);

    return {
      ...anteprima,
      // Dichiarato, non lasciato dedurre: il prezzo unitario dipende da quali servizi il
      // token è autorizzato a usare, e cambia da un'installazione all'altra.
      costoUnitarioCentesimi,
      // Solo un campione: un'anteprima di quattrocento righe non si legge, e trasferirle
      // tutte non aggiunge nulla a una decisione che riguarda il totale e il costo.
      daAcquisire: anteprima.daAcquisire.slice(0, 25),
      totaleDaAcquisire: anteprima.daAcquisire.length,
      scartate: anteprima.scartate.slice(0, 25),
      totaleScartate: anteprima.scartate.length,
      massimoPerImportazione: MASSIMO_PER_IMPORTAZIONE,
      oltreIlMassimo: anteprima.daAcquisire.length > MASSIMO_PER_IMPORTAZIONE,
    };
  });

  /**
   * Esegue la presa in carico. Qui si spende.
   *
   * Le aziende si acquisiscono **una per volta e in sequenza**: in parallelo si
   * moltiplicherebbero le chiamate simultanee al provider e si supererebbe il tetto di
   * spesa prima che il guardiano se ne accorga. Un fallimento non ferma le altre: si
   * annota e si prosegue, perché rifare da capo un'importazione di duecento aziende per
   * una che non risponde costa altre duecento chiamate.
   */
  app.post('/api/portafoglio/importa', async (request, reply) => {
    const parsed = importazioneSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Contenuto non valido', dettagli: parsed.error.issues });
    }

    const { preparaImportazione, MASSIMO_PER_IMPORTAZIONE } = await import('./importazione.js');
    const { costoAnalisi } = await import('@aegis/providers');

    const contesto = contestoDi(request);
    const presenti = new Set((await contesto.portafoglio.elenco()).map((v) => v.identificativo));
    const anteprima = preparaImportazione(parsed.data.contenuto, presenti, costoAnalisi('completo'));

    if (anteprima.daAcquisire.length > MASSIMO_PER_IMPORTAZIONE) {
      return reply.status(400).send({
        errore:
          `Il file contiene ${anteprima.daAcquisire.length} aziende da acquisire: il massimo per ` +
          `singola importazione è ${MASSIMO_PER_IMPORTAZIONE}. Procedere a scaglioni.`,
      });
    }

    const fallite: { partitaIva: string; motivo: string }[] = [];
    let acquisite = 0;

    const { eventi } = await conCostiDellaRichiesta(async () => {
      for (const riga of anteprima.daAcquisire) {
        try {
          const analisi = await analizzaERegistra(request, riga.partitaIva);
          if (analisi === null) {
            fallite.push({ partitaIva: riga.partitaIva, motivo: 'Azienda non trovata dal provider' });
            continue;
          }
          acquisite++;
        } catch (errore) {
          fallite.push({
            partitaIva: riga.partitaIva,
            motivo: errore instanceof ProviderError ? errore.message : 'Errore durante l’acquisizione',
          });
        }
      }
    });

    await registraSpese(request, eventi);
    const costoEffettivoCentesimi = costoDegliEventi(eventi);

    return { acquisite, fallite, costoEffettivoCentesimi, giaPresenti: anteprima.giaPresenti.length };
  });

  // ── Monitoraggio continuo ──────────────────────────────────────────────────

  /**
   * La coda di lavoro generata dal monitoraggio.
   *
   * Ordinata per rilevanza assicurativa: prima ciò che costa di più non fare. Un evento
   * resta in coda finché qualcuno non lo segna gestito — non è una notifica che scorre via.
   */
  app.get<{ Querystring: { tutti?: string } }>('/api/monitoraggio', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Monitoraggio non disponibile senza persistenza' });
    }

    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;
    const { elencoEventi, contaEventiDaGestire } = await import('@aegis/db');

    const soloDaGestire = request.query.tutti !== '1';
    const [eventi, daGestire] = await Promise.all([
      elencoEventi(persistenza.db, tenantId, { soloDaGestire }),
      contaEventiDaGestire(persistenza.db, tenantId),
    ]);

    return {
      eventi: eventi.map((e) => ({
        ...e,
        rilevatoIl: e.rilevatoIl.toISOString(),
        gestitoIl: e.gestitoIl?.toISOString() ?? null,
      })),
      daGestire,
    };
  });

  /**
   * Riesegue il monitoraggio sull'intero portafoglio.
   *
   * Non costa nulla: lavora sulle fotografie già salvate, senza interrogare il provider.
   * Va rieseguito comunque ogni giorno, perché scadenze e obblighi di legge dipendono
   * dalla data odierna e non da una variazione dei dati.
   */
  app.post('/api/monitoraggio/esegui', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Monitoraggio non disponibile senza persistenza' });
    }

    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;
    const { eseguiMonitoraggio } = await import('./monitoraggio.js');
    return eseguiMonitoraggio(persistenza.db, tenantId);
  });

  app.post<{ Params: { id: string } }>('/api/monitoraggio/:id/gestito', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Monitoraggio non disponibile senza persistenza' });
    }

    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;
    const { segnaGestito, registraAudit } = await import('@aegis/db');

    const fatto = await segnaGestito(
      persistenza.db,
      tenantId,
      request.params.id,
      sessione?.utenteId ?? null,
    );
    if (!fatto) return reply.status(404).send({ errore: 'Evento non trovato' });

    // A verbale: davanti a una contestazione, «l'avevamo segnalato» vale solo se è
    // dimostrabile chi l'ha preso in carico e quando.
    await registraAudit(persistenza.db, {
      tenantId,
      azione: 'monitoraggio.evento-gestito',
      entita: 'evento',
      entitaId: request.params.id,
      dettagli: { da: sessione?.email ?? null },
    });

    return { gestito: true };
  });

  // ── Dossier: dati di intervista e polizze ──────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/aziende/:id/dossier', async (request) => {
    return (
      (await contestoDi(request).dossier.get(request.params.id)) ?? {
        identificativo: request.params.id,
        datiDichiarati: null,
        polizze: [],
      }
    );
  });

  // ── Cataloghi ──────────────────────────────────────────────────────────────
  app.get('/api/catalogo/rischi', async () => ({
    rischi: Object.values(RISK_CATALOG).map((r) => ({
      id: r.id,
      etichetta: r.label,
      categoria: r.category,
      descrizione: r.description,
      probabilitaBase: r.baseLikelihood,
      impattoBase: r.baseImpact,
      coperture: r.coverages,
      assicurabile: r.assicurabile,
      riferimenti: r.riferimenti,
    })),
  }));

  app.get('/api/catalogo/coperture', async () => ({
    coperture: Object.values(COVERAGE_CATALOG).map((c) => ({
      id: c.id,
      etichetta: c.label,
      categoria: c.category,
      descrizione: c.description,
      base: c.base,
      obbligoDiLegge: c.obbligoDiLegge,
      motivazioneTipo: c.motivazioneTipo,
      insidie: c.insidie,
      riferimenti: c.riferimenti,
    })),
  }));

  // ── Costi dati ─────────────────────────────────────────────────────────────
  app.get('/api/costi', async (request) => {
    // Con la persistenza attiva il registro è quello storico del database, non quello
    // volatile del processo: è l'unico che consenta di misurare il margine per cliente.
    const tenant = contestoDi(request).tenant;
    if (tenant !== null) {
      const riepilogo = await tenant.riepilogoCosti();
      return {
        totaleEuro: riepilogo.totaleCentesimi / 100,
        risparmioDaCacheEuro: riepilogo.risparmioCentesimi / 100,
        chiamate: riepilogo.chiamate,
        persistente: true,
        perServizio: riepilogo.perServizio.map((s) => ({
          servizio: s.servizio,
          chiamate: s.chiamate,
          costoEuro: s.costoCentesimi / 100,
        })),
      };
    }

    return {
      totaleEuro: ledger.totaleCentesimi() / 100,
      risparmioDaCacheEuro: ledger.risparmioCentesimi() / 100,
      chiamate: ledger.events.length,
      persistente: false,
      perServizio: [...ledger.perServizio().entries()].map(([servizio, dati]) => ({
        servizio,
        chiamate: dati.chiamate,
        costoEuro: dati.costoCentesimi / 100,
      })),
    };
  });

  // ── Gestione degli errori ──────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    // Un errore che porta già il proprio codice di stato lo conserva: trasformare un 415
    // o un 413 in un 500 nasconde la causa e manda in caccia al fantasma chi indaga.
    const dichiarato = error as { statusCode?: number; message?: string };
    const statoDichiarato = dichiarato.statusCode;
    if (typeof statoDichiarato === 'number' && statoDichiarato >= 400 && statoDichiarato < 500) {
      return reply.status(statoDichiarato).send({ errore: dichiarato.message ?? 'Richiesta non valida' });
    }

    if (error instanceof ProviderError) {
      const status =
        error.kind === 'non-trovato'
          ? 404
          : error.kind === 'autenticazione'
            ? 502
            : error.kind === 'quota'
              ? 429
              : 502;
      return reply.status(status).send({ errore: error.message, tipo: error.kind });
    }
    app.log.error(error);
    return reply.status(500).send({ errore: 'Errore interno' });
  });

  /**
   * Pulizia periodica delle sessioni scadute.
   *
   * Una sessione scaduta non è più valida — la validità la decide `trovaSessioneValida` —
   * ma la riga resta, e senza rimozione la tabella cresce per sempre: uno studio di dieci
   * persone in tre anni ci lascia dentro decine di migliaia di righe inutili, con i loro
   * indici. Non è un guasto, è manutenzione che nessuno ricorderebbe di fare a mano.
   *
   * `unref()` perché questo timer non deve tenere vivo il processo: se il servizio ha
   * finito di lavorare, deve poter uscire senza aspettare la prossima pulizia.
   */
  if (persistenza !== undefined) {
    const archivio = persistenza;
    const pulizia = setInterval(() => {
      void (async () => {
        try {
          const { purgaSessioniScadute } = await import('@aegis/db');
          await purgaSessioniScadute(archivio.db, new Date());
        } catch (errore) {
          // La manutenzione non deve poter abbattere il servizio: si annota e si riprova
          // al giro successivo.
          app.log.warn({ errore }, 'Pulizia delle sessioni scadute non riuscita');
        }
      })();
    }, INTERVALLO_PULIZIA_SESSIONI_MS);
    pulizia.unref();

    app.addHook('onClose', async () => {
      clearInterval(pulizia);
    });
  }

  return app;
}

/** Una volta l'ora: le sessioni durano dodici ore, non serve guardare più spesso. */
const INTERVALLO_PULIZIA_SESSIONI_MS = 60 * 60 * 1_000;

/**
 * Impronta di una password inesistente, usata per consumare tempo di verifica quando
 * l'utente non esiste. Senza, il tempo di risposta rivelerebbe quali indirizzi sono
 * registrati: un attaccante enumererebbe l'anagrafica clienti senza mai autenticarsi.
 */
const ESCA_VERIFICA =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const cambioPasswordSchema = z.object({
  corrente: z.string().min(1).max(200),
  nuova: z.string().min(1).max(200),
});

const importazioneSchema = z.object({
  /** Contenuto testuale del file, non il file: l'API resta senza dipendenze da multipart. */
  contenuto: z.string().min(1).max(2_000_000),
});

const RUOLI = ['amministratore', 'broker', 'assistente', 'sola-lettura'] as const;

/**
 * Anagrafica dello studio.
 *
 * I campi facoltativi accettano la stringa vuota e non solo `null`: un modulo HTML che
 * svuota un campo invia `''`, e rifiutarlo impedirebbe di **cancellare** un recapito
 * sbagliato — che è esattamente ciò che si vuole poter fare.
 */
/**
 * Filtri di prospezione.
 *
 * I numeri arrivano dalla stringa di query e vanno convertiti: `z.coerce` accetta sia
 * il numero sia la stringa vuota di un campo lasciato in bianco, che va trattata come
 * «nessun filtro» e non come zero — un fatturato minimo di zero escluderebbe le aziende
 * che non lo dichiarano.
 */
const numeroFacoltativo = z
  .preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().min(0))
  .optional();

const prospezioneSchema = z.object({
  denominazione: z.string().trim().max(120).optional(),
  provincia: z.string().trim().length(2).toUpperCase().optional(),
  ateco: z.string().trim().max(12).optional(),
  addettiMin: numeroFacoltativo,
  addettiMax: numeroFacoltativo,
  fatturatoMinEuro: numeroFacoltativo,
  fatturatoMaxEuro: numeroFacoltativo,
  socioCodiceFiscale: z.string().trim().max(20).optional(),
  // Tetto basso e dichiarato: a cinque centesimi ad azienda, duecento record sono dieci
  // euro. Il massimo esiste per impedire che una cifra digitata male costi una giornata.
  limite: z.coerce.number().int().min(1).max(100).optional(),
  soloConteggio: z
    .preprocess((v) => v === '1' || v === 'true' || v === true, z.boolean())
    .optional()
    .default(false),
});

const datiStudioSchema = z.object({
  denominazione: z.string().trim().min(2).max(200).optional(),
  numeroRui: z.string().trim().max(40).nullable().optional(),
  partitaIva: z.string().trim().max(20).nullable().optional(),
  indirizzo: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
});

const nuovoUtenteSchema = z.object({
  email: z.string().trim().email().max(200),
  nome: z.string().trim().min(2).max(120),
  ruolo: z.enum(RUOLI).default('broker'),
});

const modificaUtenteSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    ruolo: z.enum(RUOLI).optional(),
    attivo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nessuna modifica indicata' });

/** Traduce il cookie in una sessione applicativa, o `null` se non più valida. */
async function risolviSessione(db: unknown, token: string): Promise<Sessione | null> {
  const { trovaSessioneValida, trovaUtentePerId } = await import('@aegis/db');
  const database = db as Parameters<typeof trovaSessioneValida>[0];

  const sessione = await trovaSessioneValida(database, improntaToken(token), new Date());
  if (sessione === null) return null;

  const utente = await trovaUtentePerId(database, sessione.utenteId);
  if (utente === null || !utente.attivo) return null;

  return {
    utenteId: utente.id,
    tenantId: utente.tenantId,
    email: utente.email,
    nome: utente.nome,
    ruolo: utente.ruolo,
  };
}

async function caricaProfilo(
  provider: CompanyDataProvider,
  identificativo: string,
  livello: 'base' | 'esteso' | 'completo',
): Promise<CompanyProfile | null> {
  try {
    return await provider.fetchProfile(identificativo, livello);
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'non-trovato') return null;
    throw error;
  }
}

/** I dati di intervista sovrascrivono quelli del provider solo dove sono valorizzati. */
function unisciDatiDichiarati(base: DatiDichiarati, raccolti: DatiDichiarati | undefined): DatiDichiarati {
  if (raccolti === undefined) return base;

  const unito = { ...base } as Record<string, unknown>;
  for (const [chiave, valore] of Object.entries(raccolti)) {
    if (valore === null || valore === undefined) continue;
    if (Array.isArray(valore) && valore.length === 0) continue;
    unito[chiave] = valore;
  }
  return unito as unknown as DatiDichiarati;
}
