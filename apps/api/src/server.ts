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
import {
  MemoryCache,
  MemoryCostLedger,
  OPENAPI_DEFAULT_CONFIG,
  ProviderError,
  costoAnalisi,
  createCompanyProvider,
  verificaAutorizzazioni,
} from '@aegis/providers';
import type { CostEvent } from '@aegis/providers';
import { RegistroPerRichiesta, conCostiDellaRichiesta, costoDegliEventi } from './costi-richiesta.js';
import { raccogliConEsito } from './contesto-ubicazioni.js';
import type { CompanyDataProvider, FetchLevel } from '@aegis/providers';
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
import { presentAnalysis, presentaSolidita } from './presenter.js';
import { z } from 'zod';
import {
  LIMITE_IMMAGINE_BYTE,
  MAX_IMMAGINI_PER_UBICAZIONE,
  analisiRequestSchema,
  byteDiDataUri,
  compagniaSchema,
  fetchLevelSchema,
  immagineSchema,
  searchQuerySchema,
  toDatiDichiarati,
  toPolizza,
} from './schemas.js';
// L'anagrafe delle compagnie è condivisa fra intermediari: non passa dal contesto tenant.
import {
  elencoSolidita,
  salvaSolidita,
  spesaComplessiva,
  spesaOdierna,
  spesaOdiernaComplessiva,
} from '@aegis/db';
import { MemoryDossierStore, MemoryImmaginiStore, MemoryPortafoglioStore } from './store.js';
import type { DossierStore, ImmaginiStore, PortafoglioStore } from './store.js';
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

  /*
    Cache del contesto territoriale, separata da quella dei dati d'impresa.

    Separata perché la volatilità è un'altra: una caserma e una carrozzeria non si spostano,
    mentre un bilancio o un protesto sì. Tenerle insieme costringerebbe a un TTL solo, e
    quello giusto per il secondo farebbe ricomprare il primo — qui non in denaro, ma in
    carico su un servizio donato, che è la valuta con cui lo si paga.
  */
  const cacheContesto = new MemoryCache();

  /*
    Quando raccogliere il contesto territoriale.

    Il predefinito è **solo sui dati veri**: in modalità dimostrativa le coordinate sono
    inventate, e interrogare una fonte reale attorno a un punto immaginario restituirebbe
    il vicinato vero di un'azienda che non esiste — rumore presentato come osservazione. In
    più farebbe dipendere i collaudi da un servizio esterno.

    Due deroghe esplicite, perché servono a chi manda in esercizio il prodotto:

      CONTESTO_TERRITORIALE=mai     spegne la raccolta anche sui dati veri. Serve a chi
                                    lavora dietro una rete chiusa, o quando la fonte è
                                    ferma e si preferisce un report senza il capitolo a
                                    uno che attende inutilmente il tempo massimo.
      CONTESTO_TERRITORIALE=sempre  la accende anche in dimostrativa. Serve a verificare
                                    la resa del capitolo senza acquistare un'anagrafica.
  */
  const modoContesto = process.env['CONTESTO_TERRITORIALE'] ?? 'auto';
  const contestoAttivo =
    modoContesto === 'sempre' || (modoContesto !== 'mai' && !provider.name.startsWith('Demo'));

  // Senza persistenza il servizio lavora in memoria e non richiede autenticazione:
  // è la modalità dei test di dominio e della dimostrazione locale. Con la persistenza
  // attiva, invece, ogni rotta è protetta e ogni dato è legato a un intermediario.
  const storeInMemoria = options.store ?? new MemoryDossierStore();
  const portafoglioInMemoria = options.portafoglio ?? new MemoryPortafoglioStore();
  const immaginiInMemoria = new MemoryImmaginiStore();
  const autenticazioneRichiesta = persistenza !== undefined;

  const app = Fastify({ logger: options.logger ?? false });

  /*
    Lo stato del contesto territoriale, dichiarato all'avvio.

    Serve perché la sua assenza è silenziosa: un report senza il capitolo sul contesto è
    un report valido, e chi lo guarda non ha modo di sapere se la fonte fosse spenta o
    semplicemente muta su quelle ubicazioni. Dirlo una volta all'avvio costa una riga e
    toglie un'ambiguità che altrimenti si paga in diagnosi.
  */
  app.log.info(
    `Contesto territoriale: ${contestoAttivo ? `attivo · ${process.env['OVERPASS_URL'] ?? 'Overpass pubblico'}` : `spento (CONTESTO_TERRITORIALE=${modoContesto}, provider ${provider.name})`}`,
  );

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
  /**
   * Tetto di spesa giornaliero, in centesimi.
   *
   * Zero disattiva il controllo. Il valore predefinito è deliberatamente basso: su un
   * servizio prepagato l'errore più caro non è la singola analisi sbagliata, è
   * l'importazione lanciata due volte o il filtro impostato male — e il credito non si
   * esaurisce con un avviso, si esaurisce e basta.
   *
   * Chi vuole spendere di più lo dichiara: alzare un numero in configurazione è una
   * decisione consapevole, scoprire il conto a zero non lo è.
   */
  const tettoGiornaliero = Number.parseInt(
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] ?? '2000',
    10,
  );

  /**
   * Il tetto complessivo, su tutti gli studi insieme.
   *
   * Il tetto per studio difende lo studio dal proprio errore; questo difende la fornitura
   * dalla somma degli studi. Con un contratto unico e credito condiviso, dieci studi
   * ciascuno entro il proprio tetto lo esauriscono comunque, e si fermano tutti — anche i
   * nove che non hanno sbagliato niente.
   *
   * Predefinito a zero, cioè disattivato: su un'installazione con un solo studio
   * sarebbe un secondo limite che duplica il primo e confonde chi legge il rifiuto.
   */
  const tettoComplessivo = Number.parseInt(
    process.env['AEGIS_TETTO_SPESA_COMPLESSIVO_CENTESIMI'] ?? '0',
    10,
  );

  /**
   * Credito caricato sul contratto dati, in centesimi.
   *
   * Serve solo a calcolare il residuo per differenza con quanto il registro dei costi ha
   * segnato. Va riallineato a ogni ricarica: è una dichiarazione di chi gestisce la
   * piattaforma, non un dato letto dal fornitore.
   */
  const creditoCaricato = Number.parseInt(process.env['AEGIS_CREDITO_CARICATO_CENTESIMI'] ?? '0', 10);

  /**
   * Rifiuta le operazioni a pagamento quando un tetto è stato raggiunto.
   *
   * Il controllo è **prima** della chiamata, non dopo: un tetto verificato a consuntivo
   * è un rendiconto, non un tetto.
   *
   * Restituisce quale dei due limiti ha fermato l'operazione, perché i due rifiuti vanno
   * detti in modo diverso: «hai speso troppo tu oggi» si risolve domani o alzando il
   * proprio tetto, «il servizio ha raggiunto il limite» non dipende da chi legge, e
   * suggerirgli di cambiare le proprie impostazioni lo manderebbe a sbattere.
   */
  const oltreIlTetto = async (
    request: FastifyRequest,
  ): Promise<{ speso: number; limite: number; ambito: 'studio' | 'piattaforma' } | null> => {
    if (persistenza === undefined) return null;
    const sessione = request.sessione;
    if (sessione === undefined) return null;

    if (tettoComplessivo > 0) {
      const totale = await spesaOdiernaComplessiva(persistenza.db);
      if (totale >= tettoComplessivo) {
        return { speso: totale, limite: tettoComplessivo, ambito: 'piattaforma' };
      }
    }

    if (tettoGiornaliero <= 0) return null;
    const speso = await spesaOdierna(persistenza.db, sessione.tenantId);
    return speso >= tettoGiornaliero ? { speso, limite: tettoGiornaliero, ambito: 'studio' } : null;
  };

  /**
   * Il testo del rifiuto, scritto per chi lo legge.
   *
   * Le versioni precedenti citavano il nome della variabile d'ambiente da alzare: è
   * un'istruzione per chi amministra il server, e un intermediario che la legge non può
   * farci niente se non sentirsi davanti a un attrezzo rotto. Qui si dice cosa è successo,
   * quando si riparte e a chi rivolgersi.
   */
  const messaggioTetto = (
    esito: { speso: number; limite: number; ambito: 'studio' | 'piattaforma' },
    ripresa: string,
  ): string => {
    const euro = (c: number): string => (c / 100).toFixed(2).replace('.', ',');
    return esito.ambito === 'piattaforma'
      ? `Il servizio ha raggiunto il proprio limite di consumo giornaliero. ${ripresa} ` +
          'Se la cosa si ripete, segnalarlo all’assistenza.'
      : `Tetto di spesa giornaliero dello studio raggiunto: ${euro(esito.speso)} € su ` +
          `${euro(esito.limite)} €. ${ripresa}`;
  };

  const registraSpese = async (request: FastifyRequest, eventi: readonly CostEvent[]): Promise<void> => {
    if (eventi.length === 0 || persistenza === undefined) return;
    const sessione = request.sessione;
    if (sessione === undefined) return;
    await persistenza.perTenant(sessione.tenantId).registraCostiDati(eventi);
  };

  const contestoDi = (
    request: FastifyRequest,
  ): {
    dossier: DossierStore;
    portafoglio: PortafoglioStore;
    immagini: ImmaginiStore;
    tenant: ContestoTenant | null;
  } => {
    if (persistenza === undefined) {
      return {
        dossier: storeInMemoria,
        portafoglio: portafoglioInMemoria,
        immagini: immaginiInMemoria,
        tenant: null,
      };
    }
    const sessione = request.sessione;
    if (sessione === undefined) {
      throw new ProviderError('Sessione assente', 'autenticazione');
    }
    const tenant = persistenza.perTenant(sessione.tenantId);
    return {
      dossier: tenant.dossier,
      portafoglio: tenant.portafoglio,
      immagini: tenant.immagini,
      tenant,
    };
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
    /*
      Il costo di un'analisi lo dichiara il servizio, non lo scrive a mano l'interfaccia.
      Dipende da quali fonti sono attive — collegare gli eventi negativi lo ha portato da
      dieci a cinquantacinque centesimi — e un numero scritto a mano in una pagina resta
      quello del giorno in cui è stato scritto.
    */
    costoAnalisiCentesimi: costoAnalisi('completo'),
    costoAnalisiApprofonditaCentesimi: costoAnalisi('profondito'),
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

    const { statoStudio, trovaUtentePerEmail, registraTentativoAccesso, creaSessione } =
      await import('@aegis/db');
    const utente = await trovaUtentePerEmail(persistenza.db, parsed.data.email);

    // Messaggio identico per utente inesistente e password errata: distinguerli
    // consentirebbe di enumerare gli indirizzi registrati.
    const rifiuto = { errore: 'Indirizzo o password non corretti' };

    // Lo studio sospeso rientra nello stesso rifiuto indistinto: dire «il tuo studio è
    // sospeso» a chi ha indovinato un indirizzo confermerebbe che quell'indirizzo esiste.
    if (utente !== null && !(await statoStudio(persistenza.db, utente.tenantId)).attivo) {
      await verificaPassword(parsed.data.password, ESCA_VERIFICA);
      return reply.status(401).send(rifiuto);
    }

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
          gestorePiattaforma: sessione.gestorePiattaforma,
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
   * Riservato a chi gestisce la piattaforma, non a chi la usa.
   *
   * Protegge tutto ciò che riguarda la **fornitura** dei dati: quali servizi il contratto
   * autorizza, quanto credito resta, quanto si è speso in totale. Sono informazioni di chi
   * paga il contratto, e uno studio cliente non deve poterle leggere nemmeno conoscendo
   * l'indirizzo della rotta — nascondere la voce di menù non è un presidio.
   *
   * La risposta è 404 e non 403: un «riservato» confermerebbe che dietro quell'indirizzo
   * c'è qualcosa, e a chi non ne ha titolo non si dà nemmeno quella notizia.
   */
  const soloGestore = (request: FastifyRequest, reply: FastifyReply): Sessione | null => {
    const sessione = request.sessione;
    if (sessione === undefined) {
      void reply.status(401).send({ errore: 'Autenticazione richiesta' });
      return null;
    }
    if (!sessione.gestorePiattaforma) {
      void reply.status(404).send({ errore: 'Risorsa non trovata' });
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

  /**
   * Stato delle autorizzazioni sui servizi dati.
   *
   * Verifica **gratuita**: si sonda con una partita IVA inesistente, e il rifiuto per
   * scope mancante arriva prima di ogni lavorazione. Serve a rispondere alla domanda che
   * l'intermediario si pone guardando un'analisi incompleta — «manca il dato o manca
   * l'abbonamento?» — senza che debba aprire un terminale.
   */
  app.get('/api/servizi', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;

    const token = process.env['OPENAPI_TOKEN']?.trim() ?? '';
    if (token === '') {
      return { datiReali: false, servizi: [] };
    }

    const servizi = await verificaAutorizzazioni({ token, config: OPENAPI_DEFAULT_CONFIG });
    return { datiReali: true, servizi };
  });

  /**
   * Gli studi presenti sulla piattaforma.
   *
   * Il gestore amministra le utenze dei propri clienti, non i loro portafogli: l'elenco
   * dice quanti collaboratori ha ciascuno studio e se è attivo, mai cosa ci sia dentro.
   * L'isolamento vale anche verso l'alto.
   */
  app.get('/api/studi', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) return { studi: [] };

    const { elencoStudi } = await import('@aegis/db');
    const studi = await elencoStudi(persistenza.db);
    return {
      studi: studi.map((s) => ({
        id: s.id,
        denominazione: s.denominazione,
        numeroRui: s.numeroRui,
        gestore: s.gestorePiattaforma,
        attivo: s.attivo,
        utenti: s.utenti,
        apertoIl: s.creatoIl.toISOString(),
      })),
    };
  });

  /**
   * Apre uno studio cliente con il suo primo amministratore.
   *
   * La password iniziale è generata qui e restituita **una sola volta**: non viene
   * scritta da nessuna parte in chiaro, e chi apre lo studio la consegna al cliente per
   * il canale che ritiene. È lo stesso criterio del primo avvio — un valore predefinito
   * sarebbe la credenziale che tutti conoscono.
   */
  app.post('/api/studi', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile' });
    }

    const parsed = nuovoStudioSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const { creaStudio, creaUtente, trovaUtentePerEmail } = await import('@aegis/db');
    const email = parsed.data.email.trim().toLowerCase();

    // Gli indirizzi sono unici su tutta la piattaforma: verificarlo qui dà un errore
    // comprensibile invece della violazione di vincolo che arriverebbe dal database.
    if ((await trovaUtentePerEmail(persistenza.db, email)) !== null) {
      return reply.status(409).send({ errore: 'Questo indirizzo è già registrato' });
    }

    const password = generaPasswordIniziale();
    const tenantId = await creaStudio(persistenza.db, parsed.data.denominazione.trim());
    await creaUtente(persistenza.db, {
      tenantId,
      email,
      nome: parsed.data.nome.trim(),
      passwordHash: await derivaPassword(password),
      ruolo: 'amministratore',
    });

    return reply.status(201).send({ id: tenantId, email, passwordIniziale: password });
  });

  /** Sospende o riattiva uno studio: i dati restano, gli accessi no. */
  app.patch<{ Params: { id: string } }>('/api/studi/:id', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile' });
    }

    const parsed = z.object({ attivo: z.boolean() }).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi' });
    }

    // Il gestore non può sospendere sé stesso: si chiuderebbe fuori dalla piattaforma
    // che amministra, e nessun altro potrebbe riaprirgliela.
    if (request.params.id === sessione.tenantId) {
      return reply.status(409).send({ errore: 'Lo studio che gestisce la piattaforma non si sospende' });
    }

    const { impostaAttivitaStudio } = await import('@aegis/db');
    await impostaAttivitaStudio(persistenza.db, request.params.id, parsed.data.attivo);
    return { attivo: parsed.data.attivo };
  });

  /**
   * Stato della fornitura dati: quanto credito resta e quanto si sta consumando.
   *
   * Il residuo si calcola per differenza fra il credito dichiarato caricato e quanto il
   * **nostro** registro ha segnato: ogni centesimo è annotato al momento della risposta,
   * e ciò che è arrivato dalla cache non è stato pagato. Non si chiede al fornitore
   * perché una lettura del saldo sarebbe essa stessa una chiamata, e perché un residuo
   * che non torna con il proprio registro è un problema da vedere, non da nascondere.
   *
   * `creditoCaricato` a zero significa «non dichiarato»: allora il residuo non si può
   * calcolare e si dice, invece di mostrare un numero negativo che sembrerebbe un debito.
   */
  app.get('/api/fornitura', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) {
      return { persistenza: false, creditoCaricatoCentesimi: 0 };
    }

    const [consumatoTotale, consumatoOggi] = await Promise.all([
      spesaComplessiva(persistenza.db),
      spesaOdiernaComplessiva(persistenza.db),
    ]);

    return {
      persistenza: true,
      creditoCaricatoCentesimi: creditoCaricato,
      consumatoTotaleCentesimi: consumatoTotale,
      residuoCentesimi: creditoCaricato > 0 ? creditoCaricato - consumatoTotale : null,
      consumatoOggiCentesimi: consumatoOggi,
      tettoComplessivoCentesimi: tettoComplessivo,
      tettoPerStudioCentesimi: tettoGiornaliero,
    };
  });

  /**
   * Solidità delle compagnie.
   *
   * Il punteggio si **ricalcola a ogni lettura** dal motore, non si conserva in tabella:
   * un numero congelato sopravvive alla regola che l'ha prodotto, e nessuno si accorge che
   * è vecchio finché non deve difenderlo davanti a un cliente.
   *
   * I dati sono condivisi fra tutti gli intermediari, e deliberatamente: il solvency ratio
   * è pubblicato nella SFCR che la direttiva Solvency II impone. Non è informazione di
   * portafoglio, è un fatto pubblico.
   */
  app.get('/api/compagnie', async (request, reply) => {
    if (persistenza === undefined) return { compagnie: [] };
    if (request.sessione === undefined && autenticazioneRichiesta) {
      return reply.status(401).send({ errore: 'Autenticazione richiesta' });
    }

    const righe = await elencoSolidita(persistenza.db);
    return { compagnie: righe.map(presentaSolidita) };
  });

  app.post('/api/compagnie', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) {
      return reply.status(409).send({ errore: 'Senza persistenza non è possibile censire compagnie' });
    }

    const parsed = compagniaSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    await salvaSolidita(persistenza.db, {
      denominazione: parsed.data.denominazione,
      gruppo: parsed.data.gruppo ?? null,
      codiceIvass: parsed.data.codiceIvass ?? null,
      anno: parsed.data.anno,
      solvencyRatio: parsed.data.solvencyRatio ?? null,
      quotaTier1Unrestricted: parsed.data.quotaTier1Unrestricted ?? null,
      fondiPropriCentesimi:
        parsed.data.fondiPropriEuro === undefined ? null : Math.round(parsed.data.fondiPropriEuro * 100),
      scrCentesimi: parsed.data.scrEuro === undefined ? null : Math.round(parsed.data.scrEuro * 100),
      premiLordiCentesimi:
        parsed.data.premiLordiEuro === undefined ? null : Math.round(parsed.data.premiLordiEuro * 100),
      reclamiAnno: parsed.data.reclamiAnno ?? null,
      ratingAgenzia: parsed.data.ratingAgenzia ?? null,
      ratingValore: parsed.data.ratingValore ?? null,
      fonte: parsed.data.fonte,
    });

    const righe = await elencoSolidita(persistenza.db);
    return { compagnie: righe.map(presentaSolidita) };
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

    /*
      La ricerca per partita IVA **è a pagamento**: acquista l'anagrafica estesa, che poi
      l'analisi riusa dalla cache invece di ricomprarla.

      Per un periodo il costo non è stato né registrato né soggetto al tetto: il credito
      usciva dal contratto e il registro diceva zero. Ne seguivano tre cose, tutte gravi —
      il tetto giornaliero non proteggeva la ricerca, il credito residuo mostrava un numero
      falso, e chi vedeva il saldo calare non aveva modo di sapere dove fossero finiti i
      soldi. Una spesa che non compare nella propria contabilità è peggio di una spesa
      alta: non si può governare.
    */
    const esitoTetto = await oltreIlTetto(request);
    if (esitoTetto !== null) {
      return reply.status(429).send({
        errore: messaggioTetto(esitoTetto, 'Le ricerche riprendono domani.'),
      });
    }

    const { risultato: risultati, eventi } = await conCostiDellaRichiesta(() =>
      provider.search(parsed.data),
    );
    await registraSpese(request, eventi);

    return { risultati, provider: provider.name, costoCentesimi: costoDegliEventi(eventi) };
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

    // Il conteggio è gratuito e non tocca il tetto: bloccarlo impedirebbe di capire
    // quanto costerebbe una ricerca proprio a chi sta già attento alla spesa.
    if (!soloConteggio) {
      const esito = await oltreIlTetto(request);
      if (esito !== null) {
        return reply.status(429).send({
          errore: messaggioTetto(esito, 'Il conteggio dei risultati resta disponibile e gratuito.'),
        });
      }
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
      /**
       * Livello di acquisizione. Predefinito `completo`: l'approfondimento costa quasi
       * cinque volte tanto e va chiesto, non subito.
       */
      livello?: 'completo' | 'profondito' | undefined;
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

    const profilo = await caricaProfilo(provider, identificativo, opzioni.livello ?? 'completo');
    if (profilo === null) return null;

    const dossier = await contesto.dossier.get(identificativo);
    const profiloArricchito: CompanyProfile = {
      ...profilo,
      datiDichiarati: unisciDatiDichiarati(profilo.datiDichiarati, dossier?.datiDichiarati),
    };

    // Il contesto fisico delle ubicazioni: rete, quindi fuori dal motore puro. Non può
    // far cadere l'analisi — se la fonte tace, la mappa resta vuota e il report lo dice.
    const territorio = contestoAttivo
      ? await raccogliConEsito(profiloArricchito, {
          cache: cacheContesto,
          baseUrl: process.env['OVERPASS_URL'],
          userAgent: process.env['OVERPASS_USER_AGENT'],
        })
      : undefined;

    const analisi = analyzeCompany(
      profiloArricchito,
      dossier?.polizze ?? [],
      opzioni.asOf ?? new Date(),
      territorio === undefined
        ? {}
        : {
            contestiTerritoriali: territorio.contesti,
            esitoContesto: { occupate: territorio.occupate, nonRaggiunte: territorio.nonRaggiunte },
          },
    );

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

    const esito = await oltreIlTetto(request);
    if (esito !== null) {
      return reply.status(429).send({
        errore: messaggioTetto(esito, 'Le analisi riprendono domani.'),
      });
    }

    const { risultato: analisi, eventi } = await conCostiDellaRichiesta(() =>
      analizzaERegistra(request, request.params.id, {
        ...(parsed.data.datiDichiarati === undefined
          ? {}
          : { datiDichiarati: toDatiDichiarati(parsed.data.datiDichiarati) }),
        ...(parsed.data.polizze === undefined ? {} : { polizze: parsed.data.polizze.map(toPolizza) }),
        ...(parsed.data.asOf === undefined ? {} : { asOf: parsed.data.asOf }),
        // L'approfondimento si chiede esplicitamente: costa quasi cinque volte l'analisi
        // ordinaria, e nessuno deve trovarselo addebitato per una svista.
        ...(parsed.data.approfondita === true ? { livello: 'profondito' as const } : {}),
      }),
    );

    await registraSpese(request, eventi);

    if (analisi === null) return reply.status(404).send({ errore: 'Azienda non trovata' });

    /*
      Un accertamento asincrono aperto e non ancora concluso non è un dato mancante: è un
      dato **in arrivo**, già pagato. Dirlo cambia l'azione di chi legge — ricaricare fra
      un minuto invece di chiedere i protesti al cliente — e la pratica resta in memoria,
      quindi il ricaricamento non costa nulla.
    */
    const accertamentiInCorso =
      analisi.profile.eventiNegativi === null &&
      OPENAPI_DEFAULT_CONFIG.services.eventiNegativi.verificato &&
      !provider.name.startsWith('Demo');

    return { ...presentAnalysis(analisi), accertamentiInCorso };
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

    const esito = await oltreIlTetto(request);
    if (esito !== null) {
      return reply.status(429).send({
        errore: messaggioTetto(
          esito,
          'L’importazione riprende domani. Le aziende già acquisite restano in portafoglio.',
        ),
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

  // ── Immagini delle ubicazioni ──────────────────────────────────────────────
  /*
    Le fotografie di sopralluogo, allegate alla singola ubicazione.

    Sono in rotte a sé e non dentro l'analisi per una ragione di peso: l'analisi si esegue
    e si congela di continuo, le immagini si leggono solo quando si compone il documento.
    Tenerle insieme significherebbe trascinare megabyte a ogni calcolo di uno score.
  */
  app.get<{ Params: { id: string } }>('/api/aziende/:id/immagini', async (request) => {
    const immagini = await contestoDi(request).immagini.elenca(request.params.id);
    return {
      immagini: immagini.map((i) => ({
        id: i.id,
        ubicazioneId: i.ubicazioneId,
        didascalia: i.didascalia,
        tipoMime: i.tipoMime,
        dati: i.dati,
        dimensioneByte: i.dimensioneByte,
        caricataIl: i.caricataIl.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/api/aziende/:id/immagini',
    {
      /*
        Il tetto predefinito di Fastify per un corpo è **un megabyte**: sotto la dimensione
        di una fotografia una volta codificata in base64, che cresce di circa un terzo.
        Senza questa riga ogni caricamento un po' grande verrebbe respinto dal telaio prima
        di arrivare al codice, con un messaggio che non nomina né le immagini né il limite
        vero — e chi carica concluderebbe che il prodotto è rotto.

        Il margine sta sopra `LIMITE_IMMAGINE_BYTE` perché il rifiuto per «troppo grande»
        deve arrivare dalla nostra validazione, che dice quanti megabyte sono ammessi.
      */
      bodyLimit: Math.ceil(LIMITE_IMMAGINE_BYTE * 1.5) + 1024,
    },
    async (request, reply) => {
      const parsed = immagineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ errore: 'Immagine non valida', dettagli: parsed.error.issues });
      }

      /*
      Il peso si misura **qui**, sui byte decodificati, non sulla lunghezza del testo che
      arriva. Il controllo nel browser è una cortesia verso chi carica: chiunque può
      chiamare questa rotta senza passare dalla pagina, e il tetto esiste perché un
      documento di venti pagine resti stampabile e spedibile.
    */
      const byte = byteDiDataUri(parsed.data.dati);
      if (byte > LIMITE_IMMAGINE_BYTE) {
        return reply.status(413).send({
          errore: `L'immagine supera ${Math.round(LIMITE_IMMAGINE_BYTE / (1024 * 1024))} MB.`,
        });
      }

      // Il tipo dichiarato deve combaciare con quello del contenuto: due campi che dicono
      // cose diverse sono un campo che mente, e uno dei due finirebbe in un `src`.
      if (!parsed.data.dati.startsWith(`data:${parsed.data.tipoMime};base64,`)) {
        return reply.status(400).send({ errore: 'Il tipo dichiarato non corrisponde al contenuto.' });
      }

      const immagini = contestoDi(request).immagini;
      const gia = await immagini.quante(request.params.id, parsed.data.ubicazioneId);
      if (gia >= MAX_IMMAGINI_PER_UBICAZIONE) {
        return reply.status(409).send({
          errore: `Massimo ${MAX_IMMAGINI_PER_UBICAZIONE} immagini per ubicazione. Rimuoverne una per aggiungerne un'altra.`,
        });
      }

      const salvata = await immagini.aggiungi(
        request.params.id,
        {
          ubicazioneId: parsed.data.ubicazioneId,
          didascalia: parsed.data.didascalia,
          tipoMime: parsed.data.tipoMime,
          dati: parsed.data.dati,
          dimensioneByte: byte,
        },
        request.sessione?.utenteId ?? null,
      );

      return reply.status(201).send({
        id: salvata.id,
        ubicazioneId: salvata.ubicazioneId,
        didascalia: salvata.didascalia,
        tipoMime: salvata.tipoMime,
        dati: salvata.dati,
        dimensioneByte: salvata.dimensioneByte,
        caricataIl: salvata.caricataIl.toISOString(),
      });
    },
  );

  app.delete<{ Params: { id: string; immagineId: string } }>(
    '/api/aziende/:id/immagini/:immagineId',
    async (request, reply) => {
      const rimossa = await contestoDi(request).immagini.rimuovi(
        request.params.id,
        request.params.immagineId,
      );
      // 404 anche quando l'immagine esiste ma è di un altro intermediario: distinguere i
      // due casi direbbe a chi prova a indovinare un identificativo che ha indovinato.
      if (!rimossa) return reply.status(404).send({ errore: 'Immagine non trovata' });
      return { rimossa: true };
    },
  );

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

const nuovoStudioSchema = z.object({
  denominazione: z.string().trim().min(2).max(200),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
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
  /**
   * Logo dello studio, come data URI di un'immagine.
   *
   * Si accettano solo `data:image/...`: un data URI è testo, e senza questo vincolo
   * qualunque contenuto — compreso uno script — finirebbe in un attributo `src` del
   * report, che l'intermediario consegna al proprio cliente.
   *
   * Il limite di 512 KB è generoso per un logo e stretto abbastanza da non trasformare
   * l'anagrafica dello studio in un archivio di immagini.
   */
  logo: z
    .string()
    .trim()
    .max(512 * 1024)
    .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/, {
      message: 'Il logo deve essere un’immagine PNG, JPEG, WebP o SVG',
    })
    .nullable()
    .optional(),
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
  const { statoStudio, trovaSessioneValida, trovaUtentePerId } = await import('@aegis/db');
  const database = db as Parameters<typeof trovaSessioneValida>[0];

  const sessione = await trovaSessioneValida(database, improntaToken(token), new Date());
  if (sessione === null) return null;

  const utente = await trovaUtentePerId(database, sessione.utenteId);
  if (utente === null || !utente.attivo) return null;

  // La sospensione dello studio si verifica **a ogni richiesta**, non solo all'accesso:
  // controllarla al solo login lascerebbe lavorare per giorni chi ha già il cookie.
  const studio = await statoStudio(database, utente.tenantId);
  if (!studio.attivo) return null;

  return {
    utenteId: utente.id,
    tenantId: utente.tenantId,
    email: utente.email,
    nome: utente.nome,
    ruolo: utente.ruolo,
    gestorePiattaforma: studio.gestorePiattaforma,
  };
}

async function caricaProfilo(
  provider: CompanyDataProvider,
  identificativo: string,
  livello: FetchLevel,
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
