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
  STATI_CRM,
  analyzeCompany,
  applicaFiltroCrm,
  applicaFiltroPortafoglio,
  componiEsito,
  esportaCrmCsv,
  esportaPortafoglioCsv,
  nomeFileEsportazione,
  nomeFileEsportazioneCrm,
  parsePartitaIva,
  valutaCompletezza,
} from '@aegis/core';
import type { CompanyProfile, DatiDichiarati, PolizzaInEssere, VoceCrm } from '@aegis/core';
import { comunePerCodiceCatastale } from '@aegis/core/comuni';
import {
  MemoryCache,
  MemoryCostLedger,
  OPENAPI_DEFAULT_CONFIG,
  ProviderError,
  conPrezzi,
  costoAnalisi,
  costoEventiNegativi,
  costoMassimoElencoCentesimi,
  createCompanyProvider,
  prezziDaConfigurazione,
  verificaAutorizzazioni,
} from '@aegis/providers';
import type { CostEvent } from '@aegis/providers';
import { RegistroPerRichiesta, conCostiDellaRichiesta, costoDegliEventi } from './costi-richiesta.js';
import { raccogliConEsito } from './contesto-ubicazioni.js';
import { CachePersistente } from './cache-persistente.js';
import type { CompanyDataProvider, FetchLevel } from '@aegis/providers';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { randomUUID, timingSafeEqual } from 'node:crypto';
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
import { Limitatore, chiaveIndirizzo, limiteDaAmbiente } from './limitatore.js';
import {
  emailConfermaIndirizzo,
  emailNuovaPassword,
  emailNuovoStudioPerGestore,
  postaDaAmbiente,
} from './posta.js';
import type { ServizioPosta } from './posta.js';
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
  assicuraAzienda,
  cercaAziendeInArchivio,
  chiaveAzienda,
  conPiattaforma,
  conTenant,
  creaInvito,
  elencoSolidita,
  invitoAttivo,
  registraAudit,
  registraDecisione,
  salvaVerifica,
  revocaInviti,
  risolviInvito,
  salvaSolidita,
  segnaInvitoCompilato,
  spesaComplessiva,
  spesaOdierna,
  spesaOdiernaComplessiva,
  spesaTotaleStudio,
  trovaAziendaPerChiave,
  verifichePerAzienda,
} from '@aegis/db';
import {
  MemoryCrmStore,
  MemoryDossierStore,
  MemoryImmaginiStore,
  MemoryPortafoglioStore,
  normalizza,
} from './store.js';
import type { CrmStore, DossierStore, ImmaginiStore, PortafoglioStore } from './store.js';
import { aziendeDaMostrare, chiaveElenco, cifrePartitaIva } from './elenchi-scaricati.js';
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
  /**
   * La posta in uscita (conferma dell'indirizzo, nuova password). Se assente si legge
   * dall'ambiente; i test passano una posta finta che raccoglie i messaggi.
   */
  readonly posta?: ServizioPosta | undefined;
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
  const persistenza = options.persistenza;
  const posta = options.posta ?? postaDaAmbiente();
  /*
    I freni delle rotte pubbliche (limitatore.ts). I valori predefiniti sono per la
    produzione; il collaudo, che registra molti studi dallo stesso indirizzo, li alza
    dall'ambiente invece di spegnerli.
  */
  const limitatore = new Limitatore();
  const limiteRegistrazioniPerIp = limiteDaAmbiente('AEGIS_LIMITE_REGISTRAZIONI_ORA_PER_IP', 5);
  const limiteRegistrazioniTotali = limiteDaAmbiente('AEGIS_LIMITE_REGISTRAZIONI_ORA_TOTALI', 60);
  /** Lavori partiti dopo la risposta (l'email della password dimenticata): si aspettano alla chiusura. */
  const lavoriInCorso = new Set<Promise<void>>();

  /*
    La cache dei dati comprati vive **sul database**, quando c'è.

    In memoria bastava un riavvio a buttare via tutto ciò che si era pagato: rianalizzare
    la stessa azienda il giorno dopo costava di nuovo cinquantacinque centesimi per dati
    identici, già in archivio. Sul database il dato resta comprato una volta sola — anche
    fra due processi, anche dopo un aggiornamento.

    Senza persistenza (dimostrazione, prove di dominio) resta quella in memoria: non c'è
    nulla da conservare e nulla da spendere.
  */
  const cacheDati = persistenza === undefined ? new MemoryCache() : new CachePersistente(persistenza.db);

  /*
    `OPENAPI_AMBIENTE` non la leggeva nessuno.

    Era documentata in `.env.example` — «test usa il sandbox, chiamate gratuite» — e
    scritta nei file di configurazione, e il codice non la consultava mai: il provider
    partiva sempre su produzione. Chi l'avesse impostata a `test` per fare prove senza
    consumare credito avrebbe consumato credito comunque, credendosi al sicuro. Su una
    fonte a pagamento è la trappola nella direzione peggiore.

    Un valore diverso da `test` significa produzione: davanti a una configurazione
    incomprensibile si sceglie la lettura che spende — e quindi quella di cui ci si
    accorge — piuttosto che quella che consegna dati inventati senza dirlo.
  */
  const ambiente =
    process.env['OPENAPI_AMBIENTE']?.trim().toLowerCase() === 'test'
      ? ('test' as const)
      : ('produzione' as const);

  /*
    Il listino con cui il servizio **dichiara** i prezzi, e che deve essere quello con cui
    li paga.

    `costoAnalisi()` senza argomenti risponde con il listino pubblico. Il provider, invece,
    nasce con i prezzi del contratto — `AEGIS_PREZZI_CENTESIMI`, che `createCompanyProvider`
    applica. I due numeri erano quindi diversi ovunque quella variabile fosse impostata: con
    l'esempio scritto in `.env.example` lo scarto arriva a sette volte e mezzo, e compare
    sulle schermate che dicono quanto costa **prima** di premere il pulsante che spende.

    Un prezzo mostrato più alto di quello vero non è prudenza: è il numero su cui
    l'intermediario decide se può permettersi un'analisi, ed è lo stesso su cui si tara il
    tetto di spesa.
  */
  const listino = conPrezzi(
    OPENAPI_DEFAULT_CONFIG,
    prezziDaConfigurazione(process.env['AEGIS_PREZZI_CENTESIMI']),
  );

  /*
    Il costo di una verifica antiriciclaggio, dichiarato PRIMA che qualcuno prema il tasto.

    Viene dal listino come ogni altro prezzo, e non da una costante scritta a mano: se il
    contratto cambia, cambia qui e cambia a schermo insieme. Un prezzo mostrato piu basso
    del vero e' il numero su cui l'intermediario decide se puo' permettersi la verifica.
  */
  const costoScreening = listino.services.screeningPersona.costoCentesimi;

  const provider =
    options.provider ??
    createCompanyProvider({
      openApiToken: process.env['OPENAPI_TOKEN'],
      ambiente,
      cache: cacheDati,
      ledger: registro,
    });

  /*
    Cache del contesto territoriale, separata da quella dei dati d'impresa.

    Separata perché la volatilità è un'altra: una caserma e una carrozzeria non si spostano,
    mentre un bilancio o un protesto sì. Tenerle insieme costringerebbe a un TTL solo, e
    quello giusto per il secondo farebbe ricomprare il primo — qui non in denaro, ma in
    carico su un servizio donato, che è la valuta con cui lo si paga.
  */
  /*
    Su archivio, non in memoria.

    Stava in RAM, e ne moriva a ogni riavvio. Dietro c'è una fonte gratuita, donata, con
    due slot per indirizzo IP: perderla dalla memoria significa richiamarla, e ogni
    richiamo può fallire perché il servizio è occupato.

    Il guaio non è la chiamata sprecata, è il numero che cambia. L'impronta a terra dei
    fabbricati è l'ingresso del **patrimonio esposto**, cioè della cifra più grande della
    scheda e del report. Osservato dal vivo: due analisi della stessa impresa a pochi
    minuti di distanza, una con 7.800.000 € e l'altra con «capitale da rilevare in
    intervista» — perché nel mezzo Overpass era occupato. Su un documento che si consegna a
    un cliente, un numero che non si riproduce non è un numero.

    Una caserma e una carrozzeria non si spostano: il dato regge nel tempo, e conservarlo
    è anche il modo di restituire qualcosa a un servizio che non ci fa pagare.
  */
  const cacheContesto =
    persistenza === undefined ? new MemoryCache() : new CachePersistente(persistenza.db);

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
  const crmInMemoria = new MemoryCrmStore(portafoglioInMemoria);
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

  /*
    ── Il CORS non e' piu' aperto a chiunque ──────────────────────────────────

    Diceva `origin: true` con `credentials: true`: qualunque sito del mondo poteva far
    partire dal browser di un utente collegato una richiesta autenticata a questa API. Era
    innocuo per una ragione sola, scritta in deploy/01-macchina.sh: l'API ascolta su
    127.0.0.1 e il firewall chiude la porta. Il giorno che la si espone — ed e' il giorno
    in cui il frontend va altrove — quella riga diventa il difetto piu' grave del prodotto.

    Il browser questa API non la chiama MAI: le richieste partono dal server di Next, che
    inoltra il cookie come intestazione. Quindi in produzione non serve nessuna origine
    consentita, e il valore predefinito e' «nessuna». Chi ne avesse davvero bisogno la
    dichiara, una per una, in AEGIS_ORIGINI_CONSENTITE.
  */
  const origini = (process.env['AEGIS_ORIGINI_CONSENTITE'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  const inProduzione = process.env['NODE_ENV'] === 'production';
  // `credentials: true` resta indispensabile dove un'origine e' consentita: senza, il
  // browser scarta il cookie in silenzio e l'utente resta disconnesso senza capire.
  void app.register(cors, {
    origin: origini.length > 0 ? origini : !inProduzione,
    credentials: true,
  });
  void app.register(cookie);

  /*
    ── La chiave che permette di esporre l'API ─────────────────────────────

    Finche' l'API vive dietro a 127.0.0.1 la sua difesa e' la rete. Se il frontend si
    sposta — su Vercel, su un'altra macchina, ovunque — quella difesa sparisce e resta
    solo il cookie di sessione: cioe' chiunque potrebbe interrogare le rotte pubbliche,
    provare password, e misurare il prodotto dall'esterno.

    AEGIS_CHIAVE_FRONTEND e' un segreto che conosce solo chi serve le pagine. Quando c'e',
    ogni richiesta deve portarlo; quando NON c'e', non cambia niente — ed e' voluto: su una
    macchina sola, con l'API su localhost, aggiungere un segreto non protegge da nulla e
    aggiunge un modo di sbagliare.

    Il confronto e' a tempo costante. Confrontare due stringhe con === esce al primo
    carattere diverso, e su una rotta pubblica quella differenza di tempo e' misurabile:
    si indovina un segreto un carattere per volta senza mai vederlo.

    `/health` resta fuori: e' la sonda di vita, non dice nulla che non si veda da fuori, e
    la escludono gli script di installazione e di aggiornamento che la interrogano.
  */
  const chiaveFrontend = process.env['AEGIS_CHIAVE_FRONTEND'] ?? '';
  if (chiaveFrontend !== '') {
    const attesa = Buffer.from(chiaveFrontend);
    app.addHook('onRequest', async (request, reply) => {
      if ((request.url.split('?')[0] ?? '') === '/health') return;
      const fornita = request.headers['x-aegis-frontend'];
      const ricevuta = Buffer.from(typeof fornita === 'string' ? fornita : '');
      if (ricevuta.length !== attesa.length || !timingSafeEqual(ricevuta, attesa)) {
        // Non si dice che esiste una chiave ne' che era sbagliata: a chi ha diritto di
        // parlare con questa API la risposta non serve, e a chi non ce l'ha non si regala.
        return reply.status(404).send({ errore: 'Non trovato' });
      }
    });
  }

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
  const oltreIlTetto = async (request: FastifyRequest, previsto = 0): Promise<EsitoTetto | null> => {
    if (persistenza === undefined) return null;
    const sessione = request.sessione;
    if (sessione === undefined) return null;

    /*
      Lo studio registrato da solo e non ancora attivato dal gestore non compra niente
      (decisione di Simone del 18/09/2026). Sta qui, nel punto da cui passa ogni operazione a
      pagamento, e non nelle singole rotte: una rotta a pagamento aggiunta domani eredita il
      blocco senza che nessuno debba ricordarsene.
    */
    if (!sessione.acquistiAbilitati) return { speso: 0, limite: 0, ambito: 'attivazione' };

    /*
      Il tetto complessivo dello studio: quanto può spendere in dati da sempre (account di prova,
      19/09/2026: «in totale può usare massimo 5 euro»).

      Si confronta la spesa di sempre PIÙ il costo massimo dell'operazione che sta per partire
      (`previsto`, che ogni rotta a pagamento calcola dal listino). Con la sola spesa fatta, chi
      ha ancora venti centesimi comprerebbe un elenco da cinque euro e il tetto diventerebbe un
      rendiconto. Dove il costo non si sa prima, `previsto` è zero e si ferma solo a tetto pieno.

      Resta uno sforamento possibile, dichiarato: due acquisti lanciati nello stesso istante
      leggono la stessa spesa e passano entrambi. Il giornaliero ha lo stesso limite.
    */
    const tettoTotale = sessione.tettoSpesaTotaleCentesimi;
    if (tettoTotale !== null) {
      const spesoTotale = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
        spesaTotaleStudio(tx, sessione.tenantId),
      );
      if (spesoTotale >= tettoTotale || spesoTotale + previsto > tettoTotale) {
        return { speso: spesoTotale, limite: tettoTotale, ambito: 'credito', previsto };
      }
    }

    if (tettoComplessivo > 0) {
      // La spesa di TUTTI gli studi: è l'unica lettura del tetto che attraversa gli studi
      // per disegno, e lo dichiara.
      const totale = await conPiattaforma(persistenza.db, (tx) => spesaOdiernaComplessiva(tx));
      if (totale >= tettoComplessivo) {
        return { speso: totale, limite: tettoComplessivo, ambito: 'piattaforma' };
      }
    }

    if (tettoGiornaliero <= 0) return null;
    const speso = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      spesaOdierna(tx, sessione.tenantId),
    );
    return speso >= tettoGiornaliero ? { speso, limite: tettoGiornaliero, ambito: 'studio' } : null;
  };

  /**
   * L'azienda è già nell'archivio di questo studio.
   *
   * Serve a distinguere ciò che si **ricompra** da ciò che si **rilegge**: una riga
   * presente in archivio è un'azienda per cui la risposta del fornitore è già stata pagata
   * ed è servita dalla cache, che il tetto di spesa non ha ragione di fermare.
   *
   * Una sola lettura su un indice: non pesa sul percorso che protegge.
   */
  const giaInArchivio = async (request: FastifyRequest, identificativo: string): Promise<boolean> => {
    if (persistenza === undefined) return false;
    const sessione = request.sessione;
    if (sessione === undefined) return false;
    const aziendaId = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      trovaAziendaPerChiave(tx, sessione.tenantId, normalizza(identificativo)),
    );
    return aziendaId !== null;
  };

  /**
   * Il testo del rifiuto, scritto per chi lo legge.
   *
   * Le versioni precedenti citavano il nome della variabile d'ambiente da alzare: è
   * un'istruzione per chi amministra il server, e un intermediario che la legge non può
   * farci niente se non sentirsi davanti a un attrezzo rotto. Qui si dice cosa è successo,
   * quando si riparte e a chi rivolgersi.
   */
  const messaggioTetto = (esito: EsitoTetto, ripresa: string): string => {
    const euro = (c: number): string => (c / 100).toFixed(2).replace('.', ',');
    // Qui «domani» non c'entra: si sblocca quando il gestore attiva lo studio, e basta.
    if (esito.ambito === 'attivazione') {
      return (
        'Il tuo studio è in attesa di attivazione: gli acquisti di dati si sbloccano appena la ' +
        'piattaforma lo attiva. Il conteggio delle aziende resta disponibile e gratuito.'
      );
    }
    // Nemmeno qui «domani»: il credito di prova non si ricarica da solo.
    if (esito.ambito === 'credito') {
      const resta = Math.max(0, esito.limite - esito.speso);
      const previsto = esito.previsto ?? 0;
      return resta > 0 && previsto > resta
        ? `Credito di prova insufficiente per questa operazione: restano ${euro(resta)} € dei ` +
            `${euro(esito.limite)} € a disposizione, e può costarne fino a ${euro(previsto)} €. ` +
            'Un’operazione più piccola può ancora passare; per un credito più alto scrivi a chi ti ' +
            'ha dato l’accesso.'
        : `Credito di prova esaurito: hai usato ${euro(esito.speso)} € dei ${euro(esito.limite)} € ` +
            'a disposizione. Le aziende già analizzate restano consultabili; per un credito più alto ' +
            'scrivi a chi ti ha dato l’accesso.';
    }
    return esito.ambito === 'piattaforma'
      ? `Il servizio ha raggiunto il proprio limite di consumo giornaliero. ${ripresa} ` +
          'Se la cosa si ripete, segnalarlo all’assistenza.'
      : `Tetto di spesa giornaliero dello studio raggiunto: ${euro(esito.speso)} € su ` +
          `${euro(esito.limite)} €. ${ripresa}`;
  };

  /*
    L'attesa di attivazione non è un «troppe richieste»: è un permesso che ancora manca. E il
    credito di prova finito nemmeno: riprovare più tardi non cambia niente.
  */
  const codiceTetto = (esito: EsitoTetto): 403 | 429 =>
    esito.ambito === 'attivazione' || esito.ambito === 'credito' ? 403 : 429;

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
    crm: CrmStore;
    immagini: ImmaginiStore;
    tenant: ContestoTenant | null;
  } => {
    if (persistenza === undefined) {
      return {
        dossier: storeInMemoria,
        portafoglio: portafoglioInMemoria,
        crm: crmInMemoria,
        immagini: immaginiInMemoria,
        tenant: null,
      };
    }
    const sessione = request.sessione;
    if (sessione === undefined) {
      throw new ProviderError('Sessione assente', 'autenticazione');
    }
    // L'utente viaggia col contesto: è ciò che mette un nome nell'audit trail e nelle
    // colonne `eseguita_da` e `aggiornato_da`, che finora restavano vuote.
    const tenant = persistenza.perTenant(sessione.tenantId, sessione.utenteId);
    return {
      dossier: tenant.dossier,
      portafoglio: tenant.portafoglio,
      crm: tenant.crm,
      immagini: tenant.immagini,
      tenant,
    };
  };

  // ── Guardia di autenticazione ──────────────────────────────────────────────
  const ROTTE_PUBBLICHE = new Set([
    '/health',
    '/api/auth/login',
    '/api/auth/stato',
    // Registrazione e recupero (18/09/2026): chi le chiama non ha una sessione, per definizione.
    '/api/auth/registrazione',
    '/api/auth/conferma-email',
    '/api/auth/password-dimenticata',
    '/api/auth/nuova-password',
  ]);

  /*
    Il questionario compilato dal cliente è l'unica famiglia di rotte pubbliche con un
    prefisso variabile: il token sta nell'indirizzo.

    Il confronto è su `/api/questionario/` con la barra finale, non su `/api/questionario`:
    senza, un domani una rotta `/api/questionario-interno` sarebbe pubblica per un
    accidente di prefisso. Chi entra da qui non è autenticato, quindi ogni rotta sotto
    questo prefisso deve esporre **solo** il questionario dell'azienda a cui il token si
    riferisce — mai l'analisi, mai il portafoglio, mai un'altra azienda.
  */
  const PREFISSO_QUESTIONARIO_PUBBLICO = '/api/questionario/';

  /**
   * Le rotte che un ruolo in sola lettura può invocare pur non essendo GET.
   *
   * Sono tre, e ciascuna per una ragione dichiarata:
   *
   *  - `/api/auth/logout` e `/api/auth/password` riguardano **il proprio accesso**, non i
   *    dati dello studio. Impedire a qualcuno di uscire o di cambiarsi la password non è
   *    una difesa del portafoglio: è una credenziale che non si può ruotare;
   *  - `/api/aziende/<chiave>/analisi` è l'unico modo di **leggere** un'analisi. Non
   *    esiste una GET equivalente, e finché non esiste è questa la consultazione che il
   *    ruolo promette. Gli acquisti facoltativi restano fuori: li rifiuta la rotta.
   */
  const ROTTE_LETTURA_IN_POST = new Set([
    '/api/auth/logout',
    '/api/auth/password',
    // Riguarda il proprio indirizzo, non i dati dello studio.
    '/api/auth/conferma-email/invia',
  ]);
  const ANALISI_DI_UN_AZIENDA = /^\/api\/aziende\/[^/]+\/analisi$/;

  const consentitaInSolaLettura = (percorso: string): boolean =>
    ROTTE_LETTURA_IN_POST.has(percorso) || ANALISI_DI_UN_AZIENDA.test(percorso);

  app.addHook('preHandler', async (request, reply) => {
    if (!autenticazioneRichiesta) return;
    const percorso = request.url.split('?')[0] ?? '';
    if (ROTTE_PUBBLICHE.has(percorso)) return;
    if (percorso.startsWith(PREFISSO_QUESTIONARIO_PUBBLICO)) return;

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

    /*
      I ruoli in sola lettura non possono modificare nulla — ma «non è una GET» e
      «modifica qualcosa» non sono la stessa cosa.

      La guardia filtrava per **verbo HTTP**, e l'analisi di un'azienda esiste solo in
      POST: il ruolo descritto come «consulta le analisi esistenti» non poteva aprire
      nessuna azienda, nessun report, e nemmeno cambiarsi la password. Un ruolo che non
      apre nulla non è un ruolo in sola lettura, è un accesso che non funziona.

      L'elenco qui sotto è di rotte, non di verbi, e contiene solo ciò che non tocca i
      dati dello studio: la consultazione di un'azienda e le operazioni sul proprio
      accesso. Ciò che *dentro* quelle rotte costa denaro resta interdetto, e il rifiuto
      lo dice — vedi la rotta dell'analisi.
    */
    if (!puoScrivere(sessione.ruolo) && request.method !== 'GET' && !consentitaInSolaLettura(percorso)) {
      return reply.status(403).send({ errore: 'Il ruolo in sola lettura non consente modifiche' });
    }

    request.sessione = sessione;
  });

  // ── Diagnostica ────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    stato: 'ok',
    provider: provider.name,
    /*
      `datiReali` diceva solo «non è il provider dimostrativo». Non bastava: il sandbox del
      fornitore ha lo stesso provider e restituisce anagrafiche inventate, quindi con
      `OPENAPI_AMBIENTE=test` questo campo avrebbe dichiarato dati reali su dati finti.
      Sono i due modi di avere numeri inventati a schermo, e vanno esclusi entrambi.
    */
    datiReali: !provider.name.startsWith('Demo') && ambiente === 'produzione',
    ambiente,
    /*
      Il costo di un'analisi lo dichiara il servizio, non lo scrive a mano l'interfaccia.
      Dipende da quali fonti sono attive — collegare gli eventi negativi lo ha portato da
      dieci a cinquantacinque centesimi — e un numero scritto a mano in una pagina resta
      quello del giorno in cui è stato scritto.
    */
    costoAnalisiCentesimi: costoAnalisi('completo', listino),
    costoAnalisiApprofonditaCentesimi: costoAnalisi('profondito', listino),
    // I due acquisti facoltativi, col prezzo preso dal listino e non da una cifra scritta
    // a mano in una pagina: è così che «+0,48 €» è finito su un pulsante da trenta.
    costoEventiNegativiCentesimi: costoEventiNegativi(listino),
    costoApprofondimentoCentesimi: costoAnalisi('profondito', listino) - costoAnalisi('completo', listino),
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

    const { statoStudio, trovaUtentePerEmail, registraTentativoAccesso } = await import('@aegis/db');
    // L'indirizzo è tutto ciò che si sa: lo studio lo dice la riga. È l'unica lettura di
    // `utenti` che attraversa gli studi per disegno, e lo dichiara.
    const utente = await conPiattaforma(persistenza.db, (tx) => trovaUtentePerEmail(tx, parsed.data.email));

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
    await conTenant(persistenza.db, utente.tenantId, (tx) =>
      registraTentativoAccesso(tx, utente.id, corretta, SOGLIA_BLOCCO_TENTATIVI, DURATA_BLOCCO_MS),
    );

    if (!corretta) return reply.status(401).send(rifiuto);

    // `httpOnly` nel cookie impedisce a qualunque script della pagina di leggere il token:
    // è la difesa che rende un eventuale XSS incapace di rubare la sessione.
    if (!(await rilasciaSessione(request, reply, utente, utente.passwordHash))) {
      // La password è cambiata mentre la si verificava: quella usata non vale più.
      return reply.status(401).send(rifiuto);
    }

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
          acquistiAbilitati: sessione.acquistiAbilitati,
          emailVerificata: sessione.emailVerificata,
          // Solo per gli studi con un tetto complessivo: quanto hanno usato del credito di prova.
          creditoProva:
            sessione.tettoSpesaTotaleCentesimi === null || persistenza === undefined
              ? null
              : {
                  limiteCentesimi: sessione.tettoSpesaTotaleCentesimi,
                  spesoCentesimi: await conTenant(persistenza.db, sessione.tenantId, (tx) =>
                    spesaTotaleStudio(tx, sessione.tenantId),
                  ),
                },
        };
  });

  app.get('/api/auth/stato', async () => ({
    autenticazioneRichiesta,
    // Le pagine pubbliche li usano per offrire registrazione e recupero solo quando funzionano.
    // L'autenticazione c'è solo con l'archivio: dove c'è, la registrazione funziona.
    registrazioneAperta: autenticazioneRichiesta,
    postaAttiva: posta.attiva,
  }));

  // ── Registrazione, conferma dell'indirizzo, password dimenticata ──────────
  /*
    Decisioni di Simone del 18/09/2026: chiunque può registrare il proprio studio e lavorarci
    subito, ma compra dati solo dopo che il gestore lo ha attivato; l'indirizzo si conferma
    con un collegamento via email, e dallo stesso canale passa la password dimenticata.

    Quattro rotte pubbliche nuove, e per ciascuna il freno del limitatore: sono le sole che
    chiunque su internet può chiamare senza sessione.
  */
  const ORA_MS = 60 * 60 * 1_000;
  const DURATA_CONFERMA_MS = 48 * ORA_MS;
  const DURATA_NUOVA_PASSWORD_MS = ORA_MS;

  /**
   * L'indirizzo di chi sta davvero facendo la richiesta.
   *
   * Le chiamate arrivano dal server delle pagine, non dal browser: `request.ip` è quello del
   * server, uguale per tutti, e un freno «per indirizzo» diventerebbe un freno unico per
   * l'intera piattaforma. Il server delle pagine inoltra l'indirizzo del visitatore in
   * `x-aegis-ip-cliente` — e l'API gli crede **solo** se la chiave del frontend è configurata:
   * in quel caso ogni richiesta che arriva fin qui l'ha già presentata, quindi viene dalle
   * nostre pagine. Senza chiave chiunque potrebbe scriversi l'intestazione da solo e
   * ricominciare da zero a ogni tentativo.
   */
  const IP_PLAUSIBILE = /^[0-9a-fA-F:.]{2,45}$/;
  const ipCliente = (request: FastifyRequest): string => {
    if (chiaveFrontend !== '') {
      const inoltrato = request.headers['x-aegis-ip-cliente'];
      if (typeof inoltrato === 'string' && IP_PLAUSIBILE.test(inoltrato.trim())) return inoltrato.trim();
    }
    return request.ip;
  };

  /** Il cookie di sessione, identico per l'accesso e per la registrazione. */
  const rilasciaSessione = async (
    request: FastifyRequest,
    reply: FastifyReply,
    utente: { readonly id: string; readonly tenantId: string },
    /**
     * L'impronta della password appena verificata, nell'accesso. La sessione si apre solo se
     * è ancora quella: se nel frattempo la password è cambiata, la revoca delle sessioni è
     * già passata e questa nascerebbe dopo, valida con la password vecchia (revisione di
     * sicurezza del 18/09/2026). Restituisce se la sessione è stata aperta.
     */
    passwordHashVerificato?: string,
  ): Promise<boolean> => {
    if (persistenza === undefined) return false;
    const { creaSessione, creaSessioneSePasswordInvariata } = await import('@aegis/db');
    const token = generaTokenSessione();
    const dati = {
      utenteId: utente.id,
      tenantId: utente.tenantId,
      improntaToken: improntaToken(token),
      scadeIl: new Date(Date.now() + DURATA_SESSIONE_MS),
      indirizzoIp: ipCliente(request),
      userAgent: request.headers['user-agent'],
    };
    if (passwordHashVerificato === undefined) {
      await creaSessione(persistenza.db, dati);
    } else {
      const aperta = await conTenant(persistenza.db, utente.tenantId, (tx) =>
        creaSessioneSePasswordInvariata(tx, { ...dati, passwordHashAtteso: passwordHashVerificato }),
      );
      if (aperta === null) return false;
    }
    void reply.setCookie(NOME_COOKIE_SESSIONE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: Math.floor(DURATA_SESSIONE_MS / 1_000),
    });
    return true;
  };

  /** La chiave del visitatore per i freni: l'IPv4, oppure la rete /64 di un IPv6. */
  const chiaveIp = (request: FastifyRequest): string => chiaveIndirizzo(ipCliente(request));

  /**
   * Crea un codice, ne conserva l'impronta e spedisce il collegamento. Restituisce se è
   * partito: con la posta spenta non parte, e chi chiama lo dice invece di fingere.
   */
  const inviaCodice = async (
    utente: { readonly id: string; readonly tenantId: string; readonly email: string },
    scopo: 'conferma-email' | 'nuova-password',
  ): Promise<boolean> => {
    if (persistenza === undefined || !posta.attiva || posta.indirizzoPubblico === null) return false;
    const { creaCodiceEmail } = await import('@aegis/db');
    const codice = generaTokenSessione();
    await creaCodiceEmail(persistenza.db, {
      utenteId: utente.id,
      tenantId: utente.tenantId,
      scopo,
      impronta: improntaToken(codice),
      scadeIl: new Date(
        Date.now() + (scopo === 'conferma-email' ? DURATA_CONFERMA_MS : DURATA_NUOVA_PASSWORD_MS),
      ),
    });
    const percorso = scopo === 'conferma-email' ? '/conferma-email' : '/nuova-password';
    const collegamento = `${posta.indirizzoPubblico}${percorso}?codice=${encodeURIComponent(codice)}`;
    await posta.invia(
      scopo === 'conferma-email'
        ? emailConfermaIndirizzo({ a: utente.email, collegamento })
        : emailNuovaPassword({ a: utente.email, collegamento }),
    );
    return true;
  };

  app.post('/api/auth/registrazione', async (request, reply) => {
    if (persistenza === undefined || !autenticazioneRichiesta) {
      return reply
        .status(501)
        .send({ errore: 'La registrazione non è disponibile su questa installazione.' });
    }

    const parsed = registrazioneSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const problema = parsed.error.issues[0];
      return reply.status(400).send({
        errore: problema?.message ?? 'Dati non validi.',
        campo: typeof problema?.path[0] === 'string' ? problema.path[0] : null,
      });
    }

    /*
      Il freno prima di ogni lavoro costoso: la derivazione della password costa un decimo di
      secondo di processore, ed è esattamente ciò che una raffica di registrazioni userebbe
      per rallentare tutti. Due tetti: per indirizzo, contro chi insiste da solo, e complessivo,
      contro chi ruota gli indirizzi.
    */
    /*
      I requisiti della password PRIMA del freno: un errore di battitura non deve consumare i
      tentativi di un ufficio intero dietro lo stesso indirizzo (revisione del 18/09/2026).
    */
    const requisiti = verificaRequisitiPassword(parsed.data.password);
    if (!requisiti.valida) {
      return reply.status(400).send({ errore: requisiti.problemi.join(' '), campo: 'password' });
    }

    const ip = ipCliente(request);
    if (!limitatore.consenti(`registrazione:${chiaveIp(request)}`, limiteRegistrazioniPerIp, ORA_MS)) {
      return reply.status(429).send({
        errore: 'Troppe registrazioni in poco tempo da questa rete. Riprovare fra un’ora.',
        campo: null,
      });
    }

    const { creaStudio, creaUtente, registraAudit, trovaUtentePerEmail } = await import('@aegis/db');
    const email = parsed.data.email;
    const giaRegistrato = async (): Promise<boolean> =>
      (await conPiattaforma(persistenza.db, (tx) => trovaUtentePerEmail(tx, email))) !== null;

    if (await giaRegistrato()) {
      return reply.status(409).send({
        errore: 'Questo indirizzo è già registrato. Accedi, oppure usa «Password dimenticata».',
        campo: 'email',
      });
    }

    /*
      Il tetto complessivo conta solo le registrazioni che creano davvero uno studio: contare
      anche quelle respinte permetteva di tenerlo pieno con richieste senza effetto, e di
      chiudere la registrazione a tutti. La chiave «globale:» non si perde nella pulizia.
    */
    if (
      !limitatore.consenti(`${Limitatore.PREFISSO_GLOBALE}registrazioni`, limiteRegistrazioniTotali, ORA_MS)
    ) {
      return reply.status(429).send({
        errore:
          'Le registrazioni sono sospese per qualche minuto: troppe richieste in poco tempo. Riprova fra un’ora.',
        campo: null,
      });
    }

    const passwordHash = await derivaPassword(parsed.data.password);
    /*
      Studio e primo amministratore nella stessa transazione, con l'identificativo scelto qui:
      se la creazione dell'utente fallisce — due registrazioni con lo stesso indirizzo nello
      stesso istante — non resta in archivio uno studio senza nessuno dentro.
    */
    const tenantId = randomUUID();
    let utenteId: string;
    try {
      utenteId = await conTenant(persistenza.db, tenantId, async (tx) => {
        await creaStudio(tx, parsed.data.denominazione, {
          id: tenantId,
          numeroRui: parsed.data.numeroRui,
          autoRegistrato: true,
        });
        return creaUtente(tx, {
          tenantId,
          email,
          nome: parsed.data.nome,
          passwordHash,
          ruolo: 'amministratore',
          emailDaConfermare: true,
        });
      });
    } catch (errore) {
      if (await giaRegistrato()) {
        return reply.status(409).send({
          errore: 'Questo indirizzo è già registrato. Accedi, oppure usa «Password dimenticata».',
          campo: 'email',
        });
      }
      throw errore;
    }

    await registraAudit(persistenza.db, {
      tenantId,
      utenteId,
      azione: 'studio.registrato',
      entita: 'studio',
      entitaId: tenantId,
      dettagli: { email, numeroRui: parsed.data.numeroRui, ip },
    });

    await rilasciaSessione(request, reply, { id: utenteId, tenantId });

    // L'email non ferma la registrazione: se non parte, l'account c'è comunque e il
    // collegamento si richiede di nuovo dall'avviso dentro l'app.
    let emailInviata = false;
    try {
      emailInviata = await inviaCodice({ id: utenteId, tenantId, email }, 'conferma-email');
    } catch (errore) {
      app.log.error({ err: errore }, 'Email di conferma non partita dopo la registrazione');
    }

    if (posta.attiva && posta.avvisiGestore !== null) {
      const avviso = emailNuovoStudioPerGestore({
        a: posta.avvisiGestore,
        denominazione: parsed.data.denominazione,
        numeroRui: parsed.data.numeroRui,
        referente: parsed.data.nome,
        email,
        collegamento:
          posta.indirizzoPubblico === null ? null : `${posta.indirizzoPubblico}/impostazioni/studi`,
      });
      void posta.invia(avviso).catch((errore: unknown) => {
        app.log.error({ err: errore }, 'Avviso al gestore per il nuovo studio non partito');
      });
    }

    return reply.status(201).send({
      email,
      nome: parsed.data.nome,
      ruolo: 'amministratore',
      emailInviata,
    });
  });

  /**
   * Conferma dell'indirizzo, dal collegamento ricevuto.
   *
   * Si può aprire più volte finché non scade: i filtri antivirus di molte caselle aprono i
   * collegamenti prima della persona, e un codice bruciato dal filtro lascerebbe il titolare
   * davanti a «collegamento non valido» al primo clic. Confermare due volte non fa danni.
   */
  app.post('/api/auth/conferma-email', async (request, reply) => {
    if (persistenza === undefined) {
      return reply.status(501).send({ errore: 'Conferma non disponibile su questa installazione.' });
    }
    if (!limitatore.consenti(`conferma:${chiaveIp(request)}`, 60, ORA_MS)) {
      return reply.status(429).send({ errore: 'Troppi tentativi. Riprovare fra un’ora.' });
    }
    const parsed = codiceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ errore: 'Il collegamento non è completo: aprilo di nuovo dall’email.' });
    }

    const { consumaCodiceEmail, segnaEmailVerificata, trovaCodiceEmailValido } = await import('@aegis/db');
    const adesso = new Date();
    const impronta = improntaToken(parsed.data.codice);
    const codice =
      (await consumaCodiceEmail(persistenza.db, { impronta, scopo: 'conferma-email', adesso })) ??
      (await trovaCodiceEmailValido(persistenza.db, { impronta, scopo: 'conferma-email', adesso }));
    if (codice === null) {
      return reply.status(400).send({
        errore:
          'Il collegamento non è valido o è scaduto (vale 48 ore). Accedi e chiedine uno nuovo dall’avviso in alto.',
      });
    }

    await conTenant(persistenza.db, codice.tenantId, (tx) =>
      segnaEmailVerificata(tx, codice.utenteId, adesso),
    );
    return { confermata: true };
  });

  /** Un nuovo collegamento di conferma, per chi non ha ricevuto il primo. */
  app.post('/api/auth/conferma-email/invia', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined || sessione === undefined) {
      return reply.status(401).send({ errore: 'Autenticazione richiesta' });
    }
    if (sessione.emailVerificata) return { inviata: false, giaConfermata: true };
    if (!posta.attiva) {
      return reply
        .status(503)
        .send({ errore: 'L’invio delle email non è ancora attivo su questa installazione.' });
    }

    const { contaCodiciEmailDal } = await import('@aegis/db');
    const recenti = await contaCodiciEmailDal(
      persistenza.db,
      sessione.utenteId,
      'conferma-email',
      new Date(Date.now() - ORA_MS),
    );
    if (recenti >= 3) {
      return reply.status(429).send({
        errore:
          'Ti abbiamo già mandato tre email nell’ultima ora: controlla anche la posta indesiderata, o riprova più tardi.',
      });
    }
    // E sei al giorno: chi ha una sessione non deve poter usare il nostro mittente come un
    // cannone verso una casella che non conferma (revisione del 18/09/2026).
    const oggi = await contaCodiciEmailDal(
      persistenza.db,
      sessione.utenteId,
      'conferma-email',
      new Date(Date.now() - 24 * ORA_MS),
    );
    if (oggi >= 6) {
      return reply.status(429).send({
        errore: 'Troppe email di conferma per questo account nelle ultime 24 ore. Riprova domani.',
      });
    }

    try {
      await inviaCodice(
        { id: sessione.utenteId, tenantId: sessione.tenantId, email: sessione.email },
        'conferma-email',
      );
    } catch (errore) {
      app.log.error({ err: errore }, 'Email di conferma non partita');
      return reply.status(502).send({ errore: 'Invio non riuscito. Riprovare fra qualche minuto.' });
    }
    return { inviata: true };
  });

  /**
   * Password dimenticata.
   *
   * La risposta è **sempre la stessa**, esista o no l'indirizzo, e arriva prima del lavoro:
   * cercare l'utente, creare il codice e spedire avviene dopo, fuori dal tempo di risposta.
   * Rispondere «indirizzo sconosciuto», o rispondere più in fretta quando non c'è niente da
   * spedire, direbbe a chiunque quali indirizzi sono clienti della piattaforma.
   */
  app.post('/api/auth/password-dimenticata', async (request, reply) => {
    if (persistenza === undefined || !autenticazioneRichiesta) {
      return reply.status(501).send({ errore: 'Non disponibile su questa installazione.' });
    }
    if (!posta.attiva) {
      return reply.status(503).send({
        errore:
          'Il recupero della password via email non è ancora attivo. Chiedi all’amministratore del tuo studio di impostarne una nuova.',
      });
    }
    const parsed = passwordDimenticataSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Indicare un indirizzo email valido.' });
    }
    const email = parsed.data.email;
    if (
      !limitatore.consenti(`password:ip:${chiaveIp(request)}`, 10, ORA_MS) ||
      !limitatore.consenti(`password:email:${email}`, 3, ORA_MS)
    ) {
      return reply.status(429).send({ errore: 'Troppe richieste in poco tempo. Riprovare fra un’ora.' });
    }

    const db = persistenza.db;
    const lavoro = (async () => {
      try {
        const { statoStudio, trovaUtentePerEmail } = await import('@aegis/db');
        const utente = await conPiattaforma(db, (tx) => trovaUtentePerEmail(tx, email));
        if (utente === null || !utente.attivo || utente.passwordHash === null) return;
        if (!(await statoStudio(db, utente.tenantId)).attivo) return;
        await inviaCodice(utente, 'nuova-password');
      } catch (errore) {
        app.log.error({ err: errore }, 'Email per la nuova password non partita');
      }
    })();
    lavoriInCorso.add(lavoro);
    void lavoro.finally(() => lavoriInCorso.delete(lavoro));

    return {
      messaggio:
        'Se l’indirizzo è registrato, riceverai un’email con il collegamento per scegliere una nuova password. Vale 60 minuti.',
    };
  });

  /** La nuova password, dal collegamento ricevuto: vale una volta, e chiude tutte le sessioni aperte. */
  app.post('/api/auth/nuova-password', async (request, reply) => {
    if (persistenza === undefined || !autenticazioneRichiesta) {
      return reply.status(501).send({ errore: 'Non disponibile su questa installazione.' });
    }
    if (!limitatore.consenti(`nuova-password:${chiaveIp(request)}`, 20, ORA_MS)) {
      return reply.status(429).send({ errore: 'Troppi tentativi. Riprovare fra un’ora.' });
    }
    const parsed = nuovaPasswordSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ errore: 'Il collegamento non è completo: aprilo di nuovo dall’email.' });
    }

    // I requisiti prima del codice: una password debole non deve bruciare il collegamento.
    const requisiti = verificaRequisitiPassword(parsed.data.password);
    if (!requisiti.valida) {
      return reply.status(400).send({ errore: requisiti.problemi.join(' '), campo: 'password' });
    }

    const {
      annullaCodiciEmail,
      consumaCodiceEmail,
      impostaPassword,
      revocaSessioniUtente,
      segnaEmailVerificata,
    } = await import('@aegis/db');
    const adesso = new Date();
    const codice = await consumaCodiceEmail(persistenza.db, {
      impronta: improntaToken(parsed.data.codice),
      scopo: 'nuova-password',
      adesso,
    });
    if (codice === null) {
      return reply.status(400).send({
        errore:
          'Il collegamento non è più valido: è scaduto o è già stato usato. Chiedine uno nuovo da «Password dimenticata».',
      });
    }

    const passwordHash = await derivaPassword(parsed.data.password);
    /*
      Una transazione sola: password, conferma, altri collegamenti annullati, sessioni chiuse.
      Separate, un errore a metà lasciava la password cambiata e le sessioni di chi aveva la
      vecchia ancora aperte. E la riga dell'utente resta bloccata fino alla fine: un accesso
      con la vecchia password in volo in questo istante aspetta, poi trova l'impronta nuova e
      non apre niente (creaSessioneSePasswordInvariata).
    */
    await conTenant(persistenza.db, codice.tenantId, async (tx) => {
      await impostaPassword(tx, codice.utenteId, passwordHash);
      // Chi ha aperto il collegamento legge quella casella: l'indirizzo è confermato.
      await segnaEmailVerificata(tx, codice.utenteId, adesso);
      await annullaCodiciEmail(tx, codice.utenteId, 'nuova-password', adesso);
      // Chi aveva la vecchia password — magari proprio chi l'ha rubata — esce da ovunque.
      await revocaSessioniUtente(tx, codice.utenteId);
    });

    return { aggiornata: true };
  });

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

    const { annullaCodiciEmail, trovaUtentePerId, impostaPassword, revocaSessioniUtente, creaSessione } =
      await import('@aegis/db');

    const utente = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      trovaUtentePerId(tx, sessione.utenteId),
    );
    if (utente?.passwordHash == null) {
      return reply.status(401).send({ errore: 'Utente non valido' });
    }

    if (!(await verificaPassword(parsed.data.corrente, utente.passwordHash))) {
      return reply.status(401).send({ errore: 'La password attuale non è corretta' });
    }

    const nuovoHash = await derivaPassword(parsed.data.nuova);
    // Cambiare password deve buttare fuori chiunque altro fosse collegato con la vecchia:
    // è la ragione principale per cui si cambia una password. Nella stessa transazione del
    // cambio, e con i collegamenti per una nuova password ancora in giro resi inutili.
    await conTenant(persistenza.db, sessione.tenantId, async (tx) => {
      await impostaPassword(tx, utente.id, nuovoHash);
      await annullaCodiciEmail(tx, utente.id, 'nuova-password', new Date());
      await revocaSessioniUtente(tx, utente.id);
    });

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
    // Conta i collaboratori di ogni studio: attraversa `utenti` di tutti, per disegno.
    const studi = await conPiattaforma(persistenza.db, (tx) => elencoStudi(tx));
    return {
      studi: studi.map((s) => ({
        id: s.id,
        denominazione: s.denominazione,
        numeroRui: s.numeroRui,
        gestore: s.gestorePiattaforma,
        attivo: s.attivo,
        acquistiAbilitati: s.acquistiAbilitati,
        autoRegistrato: s.autoRegistrato,
        referente: s.referente,
        utenti: s.utenti,
        tettoSpesaTotaleCentesimi: s.tettoSpesaTotaleCentesimi,
        spesaTotaleCentesimi: s.spesaTotaleCentesimi,
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
    if ((await conPiattaforma(persistenza.db, (tx) => trovaUtentePerEmail(tx, email))) !== null) {
      return reply.status(409).send({ errore: 'Questo indirizzo è già registrato' });
    }

    const password = generaPasswordIniziale();
    const passwordHash = await derivaPassword(password);
    const tenantId = await creaStudio(persistenza.db, parsed.data.denominazione.trim());
    // Il primo amministratore appartiene allo studio appena aperto: si dichiara quello.
    await conTenant(persistenza.db, tenantId, (tx) =>
      creaUtente(tx, {
        tenantId,
        email,
        nome: parsed.data.nome.trim(),
        passwordHash,
        ruolo: 'amministratore',
      }),
    );

    return reply.status(201).send({ id: tenantId, email, passwordIniziale: password });
  });

  /**
   * Sospende o riattiva uno studio (i dati restano, gli accessi no), oppure ne attiva o
   * blocca gli acquisti di dati: è così che il gestore apre uno studio registrato da solo.
   */
  app.patch<{ Params: { id: string } }>('/api/studi/:id', async (request, reply) => {
    const sessione = soloGestore(request, reply);
    if (sessione === null) return reply;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile' });
    }

    const parsed = z
      .object({
        attivo: z.boolean().optional(),
        acquistiAbilitati: z.boolean().optional(),
        // Il tetto complessivo in centesimi; `null` lo toglie. Un milione di euro come massimo:
        // una cifra digitata male non deve diventare un tetto che non ferma niente.
        tettoSpesaTotaleCentesimi: z.number().int().min(0).max(100_000_000).nullable().optional(),
      })
      .refine(
        (d) =>
          d.attivo !== undefined ||
          d.acquistiAbilitati !== undefined ||
          d.tettoSpesaTotaleCentesimi !== undefined,
      )
      .safeParse(request.body ?? {});
    if (!parsed.success || !z.string().uuid().safeParse(request.params.id).success) {
      return reply.status(400).send({ errore: 'Dati non validi' });
    }

    // Il gestore non può sospendere sé stesso: si chiuderebbe fuori dalla piattaforma
    // che amministra, e nessun altro potrebbe riaprirgliela.
    if (request.params.id === sessione.tenantId) {
      return reply.status(409).send({ errore: 'Lo studio che gestisce la piattaforma non si sospende' });
    }

    const {
      impostaAcquistiStudio,
      impostaAttivitaStudio,
      impostaTettoTotaleStudio,
      referenteDelloStudio,
      registraAudit,
    } = await import('@aegis/db');

    /*
      Con la posta attiva, uno studio si attiva solo se chi l'ha aperto ha confermato l'email:
      prima di spendere il credito della piattaforma bisogna aver dimostrato di leggere la
      casella dichiarata. Senza posta non si può confermare niente, e la decisione resta tutta
      del gestore (la pagina lo dice).
    */
    if (parsed.data.acquistiAbilitati === true && posta.attiva) {
      const referente = await conTenant(persistenza.db, request.params.id, (tx) =>
        referenteDelloStudio(tx, request.params.id),
      );
      if (referente !== null && !referente.emailConfermata) {
        return reply.status(409).send({
          errore: `${referente.email} non ha ancora confermato l’indirizzo: l’attivazione si sblocca quando lo fa.`,
        });
      }
    }

    if (parsed.data.attivo !== undefined) {
      await impostaAttivitaStudio(persistenza.db, request.params.id, parsed.data.attivo);
    }
    if (parsed.data.acquistiAbilitati !== undefined) {
      await impostaAcquistiStudio(persistenza.db, request.params.id, parsed.data.acquistiAbilitati);
    }
    if (parsed.data.tettoSpesaTotaleCentesimi !== undefined) {
      await impostaTettoTotaleStudio(
        persistenza.db,
        request.params.id,
        parsed.data.tettoSpesaTotaleCentesimi,
      );
    }
    await registraAudit(persistenza.db, {
      tenantId: request.params.id,
      utenteId: sessione.utenteId,
      azione: 'studio.modificato',
      entita: 'studio',
      entitaId: request.params.id,
      dettagli: { ...parsed.data, da: sessione.email },
    });
    return parsed.data;
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

    // La spesa di tutti gli studi verso il fornitore: attraversa gli studi per disegno.
    const [consumatoTotale, consumatoOggi] = await conPiattaforma(persistenza.db, (tx) =>
      Promise.all([spesaComplessiva(tx), spesaOdiernaComplessiva(tx)]),
    );

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
    const utenti = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      elencoUtenti(tx, sessione.tenantId),
    );

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

    /*
      Uno studio registrato da solo e non ancora attivato lavora da solo (revisione di
      sicurezza del 18/09/2026). Chi si registrava con i dati di un broker vero poteva
      aggiungere un secondo amministratore — nato con l'email «confermata» — che restava dentro
      anche dopo che il vero titolare aveva ripreso l'account; e poteva usare questo modulo per
      sapere quali indirizzi sono già clienti della piattaforma, senza nessun freno. Il
      controllo sta prima di qualunque lettura, così non rivela nulla.
    */
    if (!sessione.acquistiAbilitati) {
      return reply.status(403).send({
        errore:
          'Finché lo studio non è attivato lavori da solo: i collaboratori si aggiungono dopo l’attivazione.',
      });
    }

    const parsed = nuovoUtenteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const { trovaUtentePerEmail, creaUtente } = await import('@aegis/db');
    // Gli indirizzi sono unici su tutta la piattaforma: il controllo attraversa gli studi
    // per disegno, e lo dichiara.
    const giaRegistrato = await conPiattaforma(persistenza.db, (tx) =>
      trovaUtentePerEmail(tx, parsed.data.email),
    );
    if (giaRegistrato !== null) {
      return reply.status(409).send({ errore: 'Esiste già un utente con questo indirizzo' });
    }

    // La password iniziale la genera il sistema e viene mostrata una volta sola
    // all'amministratore, che la consegna a voce. Non viene inviata per posta né salvata.
    const password = generaPasswordIniziale();
    const passwordHash = await derivaPassword(password);
    const utenteId = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      creaUtente(tx, {
        tenantId: sessione.tenantId,
        email: parsed.data.email,
        nome: parsed.data.nome,
        passwordHash,
        ruolo: parsed.data.ruolo,
      }),
    );

    const { registraAudit } = await import('@aegis/db');
    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      utenteId: sessione.utenteId,
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

    const destinatario = (
      await conTenant(persistenza.db, sessione.tenantId, (tx) => elencoUtenti(tx, sessione.tenantId))
    ).find((u) => u.id === request.params.id);
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

    const amministratoriAttivi = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      contaAmministratoriAttivi(tx, sessione.tenantId),
    );
    if (eraAmministratoreAttivo && perdeIPoteri && amministratoriAttivi <= 1) {
      return reply.status(400).send({
        errore: 'Deve restare almeno un amministratore attivo.',
      });
    }

    const aggiornato = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      aggiornaUtente(tx, sessione.tenantId, request.params.id, parsed.data),
    );
    if (!aggiornato) return reply.status(404).send({ errore: 'Utente non trovato' });

    // Disattivare un utente senza chiudergli le sessioni lo lascerebbe dentro fino
    // alla scadenza: la sospensione deve avere effetto immediato.
    if (parsed.data.attivo === false) {
      await revocaSessioniUtente(persistenza.db, request.params.id);
    }

    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      utenteId: sessione.utenteId,
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
    const utenti = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      elencoUtenti(tx, sessione.tenantId),
    );
    if (!utenti.some((u) => u.id === request.params.id)) {
      return reply.status(404).send({ errore: 'Utente non trovato' });
    }

    await revocaSessioniUtente(persistenza.db, request.params.id);
    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      utenteId: sessione.utenteId,
      azione: 'utente.sessioni-revocate',
      entita: 'utente',
      entitaId: request.params.id,
      dettagli: { da: sessione.email },
    });

    return { revocate: true };
  });

  /**
   * Reimpostazione della password di un collaboratore, da parte dell'amministratore.
   *
   * Chi dimenticava la password non rientrava: l'unica rotta esistente chiede quella
   * **attuale**, e l'amministratore poteva soltanto revocare le sessioni — cioè buttare
   * fuori chi era già fuori. L'unico rimedio era `scripts/reimposta-password.ts`, che
   * richiede accesso alla macchina e il servizio fermo: non è una via che uno studio ha.
   *
   * Stessa forma della creazione di un utente, e per le stesse ragioni: la password nasce
   * qui, viene mostrata **una volta sola** e non viene scritta in chiaro da nessuna parte.
   * L'amministratore la consegna a voce.
   *
   * Le sessioni aperte si chiudono tutte: se la password viene reimpostata perché si
   * sospetta un accesso altrui, lasciarle aperte vanificherebbe l'operazione.
   *
   * Dal 18/09/2026 c'è anche il recupero autonomo via email (`/api/auth/password-dimenticata`),
   * quando la posta è configurata. Questa via resta: è l'unica finché la posta non lo è, e
   * resta quella dell'amministratore che vuole chiudere fuori qualcuno subito.
   */
  app.post<{ Params: { id: string } }>('/api/utenti/:id/reimposta-password', async (request, reply) => {
    const sessione = soloAmministratore(request, reply);
    if (sessione === null || persistenza === undefined) return reply;

    const { annullaCodiciEmail, elencoUtenti, impostaPassword, revocaSessioniUtente, registraAudit } =
      await import('@aegis/db');

    // Solo dentro il proprio studio: l'elenco è già filtrato per intermediario, e un
    // identificativo indovinato non deve poter toccare l'utenza di un altro.
    const utenti = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      elencoUtenti(tx, sessione.tenantId),
    );
    const destinatario = utenti.find((u) => u.id === request.params.id);
    if (destinatario === undefined) {
      return reply.status(404).send({ errore: 'Utente non trovato' });
    }

    const password = generaPasswordIniziale();
    const nuovoHash = await derivaPassword(password);
    await conTenant(persistenza.db, sessione.tenantId, async (tx) => {
      await impostaPassword(tx, destinatario.id, nuovoHash);
      await annullaCodiciEmail(tx, destinatario.id, 'nuova-password', new Date());
      await revocaSessioniUtente(tx, destinatario.id);
    });

    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      utenteId: sessione.utenteId,
      azione: 'utente.password-reimpostata',
      entita: 'utente',
      entitaId: destinatario.id,
      // Mai la password, nemmeno qui: l'audit trail è append-only e si conserva per anni.
      dettagli: { destinatario: destinatario.email, da: sessione.email },
    });

    return { email: destinatario.email, passwordIniziale: password, sessioniRevocate: true };
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
    /*
      Prima si guarda in casa, e non costa nulla.

      È il difetto più fastidioso del nostro modello rispetto a Creditsafe: da loro cercare
      è gratis e illimitato, da noi ogni ricerca compra un'anagrafica. Un broker che digita
      tre volte il nome sbagliato prima di trovare il cliente giusto ha speso trenta
      centesimi per arrivare a un'azienda che aveva già in archivio.

      L'archivio consultato è **il proprio**, non quello di tutti: le risposte comprate si
      condividono fra gli studi — sono dati pubblici pagati con un contratto unico — ma
      l'elenco di chi si segue no. Sapere quali aziende un altro studio ha analizzato
      significa sapere chi sono i suoi clienti.
    */
    const sessioneRicerca = request.sessione;
    const tenantRicerca = sessioneRicerca?.tenantId ?? persistenza?.tenantPredefinito ?? null;
    const inArchivio =
      persistenza === undefined || tenantRicerca === null
        ? []
        : await conTenant(persistenza.db, tenantRicerca, (tx) =>
            cercaAziendeInArchivio(tx, tenantRicerca, parsed.data),
          );

    if (inArchivio.length > 0) {
      /*
        Trovata in casa: si restituisce e **non si spende**.

        La ricerca sul fornitore resta a un clic di distanza, con il costo dichiarato: chi
        cerca un'azienda nuova la trova comunque, chi cerca una che ha già non paga per
        riscoprirla.
      */
      return {
        risultati: inArchivio.map((a) => ({
          partitaIva: a.partitaIva,
          denominazione: a.denominazione,
          comune: null,
          provincia: a.provincia,
          ateco: a.atecoPrimario,
          /*
            `null`, non «attiva».

            Erano scritte a mano: ogni impresa ritrovata in archivio usciva col bollino
            verde, su una query che lo stato non lo seleziona e una tabella — `aziende` —
            che quella colonna non ce l'ha. Un'impresa cessata il mese scorso continuava a
            comparire come attiva, e il bollino è esattamente ciò che si guarda per
            decidere se vale la pena spendere per analizzarla.

            Lo stato camerale lo porta solo il fornitore. Qui non si sa, e non sapere si
            dichiara: a valle il bollino non deve comparire affatto.
          */
          attiva: null,
          statoAttivita: null,
          providerId: a.identificativo,
          sintesi: null,
          anagrafica: null,
          bilanciSintetici: [],
          soci: [],
        })),
        provider: 'Archivio locale',
        costoCentesimi: 0,
        daArchivio: true,
        aggiornatoIl: inArchivio[0]?.aggiornataIl.toISOString() ?? null,
      };
    }

    // Una partita IVA compra l'anagrafica estesa, un nome la ricerca: dieci centesimi l'una e l'altra.
    const esitoTetto = await oltreIlTetto(
      request,
      Math.max(listino.services.ricerca.costoCentesimi, listino.services.anagraficaEstesa.costoCentesimi),
    );
    if (esitoTetto !== null) {
      return reply.status(codiceTetto(esitoTetto)).send({
        errore: messaggioTetto(esitoTetto, 'Le ricerche riprendono domani.'),
      });
    }

    const { risultato: risultati, eventi } = await conCostiDellaRichiesta(() =>
      provider.search(parsed.data),
    );
    await registraSpese(request, eventi);

    return {
      risultati,
      provider: provider.name,
      costoCentesimi: costoDegliEventi(eventi),
      daArchivio: false,
      aggiornatoIl: null,
    };
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

    const { soloConteggio, comune, salta: saltaRichiesto, ...altri } = parsed.data;
    // Una città lasciata vuota non è un filtro: al fornitore non arriva niente.
    const criteri: typeof altri & { comune?: string } =
      comune === undefined || comune === '' ? altri : { ...altri, comune };
    /*
      Basta un filtro che descriva un'impresa, e la città è uno di questi.

      Richiesta di Simone del 13/09/2026: la città obbligatoria. Dal 17/09/2026 è facoltativa
      come gli altri («Questo non obbligatorio», AEGIS - cambi.pptx). Il controllo sta anche
      qui e non solo nel modulo, perché questa rotta spende: senza nessun filtro la ricerca
      coprirebbe l'Italia intera — forma giuridica e numero di aziende non descrivono
      un'impresa. E una città scritta deve essere un comune: con un codice che non lo è il
      fornitore risponderebbe zero, un «nessuna azienda» che è in realtà un errore di chi
      chiama.
    */
    const descrittivi = [
      criteri.comune,
      criteri.denominazione,
      criteri.ateco,
      criteri.addettiMin,
      criteri.addettiMax,
      criteri.fatturatoMinEuro,
      criteri.fatturatoMaxEuro,
      criteri.socioCodiceFiscale,
    ];
    if (!descrittivi.some((valore) => valore !== undefined && String(valore).trim() !== '')) {
      return reply.status(400).send({
        errore:
          'Indicare almeno un filtro: città, codice ATECO, dipendenti, fatturato, ragione sociale o codice fiscale del socio',
      });
    }
    if (criteri.comune !== undefined && comunePerCodiceCatastale(criteri.comune) === null) {
      return reply
        .status(400)
        .send({ errore: 'Città non riconosciuta: sceglierla dall’elenco dei comuni italiani' });
    }

    // Il conteggio è gratuito e non tocca il tetto: bloccarlo impedirebbe di capire
    // quanto costerebbe una ricerca proprio a chi sta già attento alla spesa.
    if (!soloConteggio) {
      const esito = await oltreIlTetto(request, costoMassimoElencoCentesimi(criteri.limite));
      if (esito !== null) {
        return reply.status(codiceTetto(esito)).send({
          errore: messaggioTetto(esito, 'Il conteggio dei risultati resta disponibile e gratuito.'),
        });
      }
    }

    /*
      Da dove riparte l'elenco (18/09/2026): «se cerco gli stessi filtri quelle aziende già
      nel CRM non devono uscire». Con gli stessi filtri si chiedono al fornitore le aziende
      successive a quelle già comprate, così non si pagano due volte. Se la lettura non riesce
      si riparte dall'inizio: al peggio si ricompra qualche azienda già vista, mai si salta una
      mai vista.
    */
    const crm = contestoDi(request).crm;
    const chiave = chiaveElenco(criteri);
    const giaScaricato = await crm.elencoScaricato(chiave).catch((errore: unknown) => {
      request.log.error({ errore }, 'elenchi già scaricati non leggibili: si riparte dall’inizio');
      return { scaricate: 0, partiteIva: [] as readonly string[] };
    });
    const salta = Math.min(saltaRichiesto ?? giaScaricato.scaricate, giaScaricato.scaricate);

    // Senza niente da saltare la richiesta al fornitore resta quella di prima, parametro per
    // parametro: stessa memoria, stesso prezzo.
    const { risultato, eventi } = await conCostiDellaRichiesta(() =>
      provider.cercaProspect(salta > 0 ? { ...criteri, salta } : criteri, { soloConteggio }),
    );

    // Anche qui: la spesa va nel registro **subito**, non alla prossima analisi. Un
    // elenco di prospect costa quanto un'analisi, e non comparire nel consuntivo lo
    // renderebbe invisibile a chi controlla il credito residuo.
    await registraSpese(request, eventi);

    /*
      Le aziende di un elenco comprato vanno nel CRM, e ci restano (17/09/2026: «Questo deve
      andare nel CRM per sempre non per 24 ore»). Solo quelle con la partita IVA: è la chiave
      con cui l'archivio riconosce un'azienda, e un identificativo opaco del fornitore non lo è.

      Un salvataggio che non riesce non toglie l'elenco a chi l'ha appena pagato: lo si
      mostra comunque, e si dichiara che nel CRM non è entrato invece di lasciarlo credere.
    */
    if (soloConteggio) {
      return { ...risultato, provider: provider.name, giaScaricate: giaScaricato.scaricate };
    }

    /*
      Le aziende già nel CRM non escono (vedi `aziendeDaMostrare`): si guarda il CRM PRIMA di
      salvarci questo elenco. Se non si riesce a leggerlo si mostra tutto: un'azienda mostrata
      due volte è un fastidio, una nascosta per errore è un'azienda pagata e persa.
    */
    const nelCrm = await crm
      .elenco()
      .then(
        (voci) =>
          new Set(
            voci.flatMap((voce) => (voce.partitaIva === null ? [] : [cifrePartitaIva(voce.partitaIva)])),
          ),
      )
      .catch((errore: unknown) => {
        request.log.error({ errore }, 'CRM non leggibile: l’elenco si mostra per intero');
        return new Set<string>();
      });
    const { visibili, nascoste } = aziendeDaMostrare(
      risultato.aziende,
      nelCrm,
      new Set(giaScaricato.partiteIva),
    );

    let salvateNelCrm = true;
    try {
      await crm.salvaDaElenco(
        risultato.aziende.flatMap((azienda) =>
          azienda.partitaIva === null
            ? []
            : [
                {
                  partitaIva: azienda.partitaIva,
                  denominazione: azienda.denominazione,
                  comune: azienda.comune,
                  provincia: azienda.provincia,
                  ateco: azienda.ateco,
                },
              ],
        ),
      );
    } catch (errore) {
      request.log.error({ errore }, 'elenco comprato non salvato nel CRM');
      salvateNelCrm = false;
    }

    /*
      Il punto di ripartenza avanza solo se le aziende sono nel CRM: se il salvataggio non è
      riuscito, ricomprare deve riportare le stesse, che è ciò che la pagina promette.
    */
    if (salvateNelCrm) {
      await crm
        .registraElencoScaricato(
          chiave,
          salta + risultato.aziende.length,
          risultato.aziende.flatMap((azienda) =>
            azienda.partitaIva === null ? [] : [cifrePartitaIva(azienda.partitaIva)],
          ),
        )
        .catch((errore: unknown) => {
          request.log.error({ errore }, 'elenco comprato non registrato: il prossimo ripartirà da qui');
        });
    }

    return {
      ...risultato,
      aziende: visibili,
      provider: provider.name,
      salvateNelCrm,
      saltate: salta,
      giaNelCrm: nascoste,
    };
  });

  // ── Profilo grezzo ─────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/aziende/:id/profilo', async (request, reply) => {
    const livello = fetchLevelSchema.parse(
      (request.query as Record<string, unknown>)['livello'] ?? 'completo',
    );

    /*
      QUESTA ROTTA SPENDE, e per una versione intera lo ha fatto fuori da ogni controllo.

      Il livello predefinito è `completo`: chiamarla compra l'anagrafica estesa, dieci
      centesimi a impresa. Mancavano tutte e due le difese che ogni altra spesa ha —
      il tetto verificato PRIMA, e la registrazione del costo nel registro. Cioè: si poteva
      superare il limite che l'intermediario si è dato, e la spesa non compariva da nessuna
      parte nel rendiconto.

      Nessuna schermata la chiama e nessun collaudo la esercita: la usa solo la sua stessa
      prova. È il modo in cui un difetto sul denaro sopravvive — nessuno ci passa, quindi
      nessuno se ne accorge, finché un giorno qualcuno ci passa.

      Non la tolgo: cancellare una rotta pubblica è una decisione di prodotto e non mia.
      La porto dentro i controlli, che è ciò che serviva.
    */
    const esitoTetto = await oltreIlTetto(request, costoAnalisi(livello, listino));
    if (esitoTetto !== null) {
      return reply.status(codiceTetto(esitoTetto)).send({
        errore: messaggioTetto(
          esitoTetto,
          'Le aziende già in archivio restano consultabili senza spendere.',
        ),
      });
    }

    const { risultato: profilo, eventi } = await conCostiDellaRichiesta(() =>
      caricaProfilo(provider, request.params.id, livello),
    );
    await registraSpese(request, eventi);

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
      /**
       * Acquista anche protesti, pregiudizievoli e procedure: **45 centesimi**.
       *
       * Predefinito falso. Prima veniva comprato a ogni analisi senza dirlo, e un
       * «Analizza» che l'utente credeva da 10 centesimi ne costava 55.
       */
      conEventiNegativi?: boolean | undefined;
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

    const profilo = await caricaProfilo(provider, identificativo, opzioni.livello ?? 'completo', {
      conEventiNegativi: opzioni.conEventiNegativi === true,
    });
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
          /*
            Lo storico meteo si accende da configurazione, e resta spento finché nessuno lo
            accende. La fonte è gratuita per uso non commerciale e a pagamento per un
            prodotto venduto: è una decisione con un costo, e il codice non la prende al
            posto di chi installa.
          */
          meteoAttivo: process.env['METEO_STORICO'] === 'attivo',
          cacheMeteo: cacheContesto,
          baseUrlMeteo: process.env['METEO_URL'],
          // ISPRA attivo di default con il contesto; spegnibile dietro rete chiusa.
          /*
            Spenta finché non risponde in tempi da pagina web.

            Misurato sul servizio vero l'08/09/2026, un punto per strato: da 1,3 a 45
            secondi, con timeout oltre i 90 su alcune coordinate. I poligoni sono enormi —
            quello di Ravenna ha 18.102 vertici — e il tetto qui è di 8 secondi: quasi
            ogni punto che avrebbe una risposta la perde per strada, e un timeout arriva
            alla scheda uguale a «fuori da ogni classe». Si accende con
            IDRAULICA_ISPRA=attivo, e `scripts/prova-ispra-vera.ts` dice se conviene.
          */
          idraulicaAttiva: process.env['IDRAULICA_ISPRA'] === 'attivo',
          cacheIdraulica: cacheContesto,
          baseUrlIdraulica: process.env['ISPRA_WFS_URL'],
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
            idraulichePuntuali: territorio.idraulichePuntuali,
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
      propertyRisk: analisi.protezioni.property.punteggio,
      biPunteggio: analisi.protezioni.businessInterruption.punteggioFisico,
      biPerditaGiornalieraCentesimi: analisi.protezioni.businessInterruption.perditaGiornaliera,
      cyberRisk: analisi.protezioni.cyber.punteggio,
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

    /*
      Il ruolo in sola lettura consulta; non compra.

      Il rifiuto è esplicito e dice quale parte della richiesta lo ha causato. Scartare in
      silenzio i due flag e proseguire sarebbe peggio: chi ha chiesto l'approfondimento
      leggerebbe un'analisi ordinaria credendola approfondita, e non avrebbe modo di
      accorgersene.
    */
    const sessioneAnalisi = request.sessione;
    if (
      sessioneAnalisi !== undefined &&
      !puoScrivere(sessioneAnalisi.ruolo) &&
      (parsed.data.approfondita === true || parsed.data.eventiNegativi === true)
    ) {
      return reply.status(403).send({
        errore:
          'Il ruolo in sola lettura consulta l’analisi ordinaria. L’approfondimento e la ' +
          'verifica di protesti e procedure sono acquisti, e restano ai ruoli che possono scrivere.',
      });
    }

    /*
      Il tetto ferma la **spesa**, non la consultazione di ciò che è già stato pagato.

      Bloccava anche la riapertura di un'azienda già in archivio, cioè di un dato comprato
      giorni prima e servito dalla cache a costo zero: raggiunto il tetto, l'intermediario
      non poteva più nemmeno rileggere il proprio portafoglio fino al giorno dopo.

      L'esenzione vale solo per un'azienda che questo studio ha già, e solo per l'analisi
      ordinaria senza acquisti facoltativi. Resta uno sforamento possibile, ed è
      dichiarato: se nel frattempo la risposta è uscita dalla cache, quella riapertura
      ricompra l'anagrafica. È il costo di **una** operazione, non quello di una giornata
      senza tetto — e il tetto viene comunque riletto a ogni richiesta successiva.
    */
    /*
      Cio' che e' gia' stato pagato si mostra, senza chiedere di ricliccare.

      L'approfondimento comprato resta in archivio trenta giorni. Per tutto quel tempo il
      pulsante diceva «gia' acquistata» — e la pagina, senza il parametro nell'indirizzo,
      continuava a costruire l'analisi ORDINARIA. Su COMINOTTI il risultato era «Score di
      credito: non determinabile» e «Fido consigliato: non determinabile» su un'impresa il
      cui profilo completo era in casa e gratuito: il prodotto nascondeva un dato che il
      cliente aveva gia' comprato, e chiedeva un clic per mostrarlo.

      Il parametro nell'indirizzo serve a COMPRARE, non a vedere cio' che si possiede. Da
      qui in avanti: se la risposta e' servibile dalla cache — cioe' se non costa nulla —
      si usa, punto. Chi apre la scheda vede sempre il meglio di cio' che ha pagato.

      La spesa resta una scelta esplicita: `acquistoSenzaSpesa` risponde `true` solo quando
      la risposta e' in archivio e ancora valida, quindi questa scorciatoia non puo'
      addebitare niente. Se la validita' scade fra questo controllo e la lettura, si ricade
      sul comportamento di prima e la richiesta esplicita torna necessaria.
    */
    const gia = {
      approfondimento: await provider.acquistoSenzaSpesa(request.params.id, 'approfondimento'),
      eventiNegativi: await provider.acquistoSenzaSpesa(request.params.id, 'eventi-negativi'),
    };
    const approfonditaEffettiva = parsed.data.approfondita === true || gia.approfondimento;
    const negativitaEffettiva = parsed.data.eventiNegativi === true || gia.eventiNegativi;
    /** Quello che questa richiesta ADDEBITA davvero: e' su questo che pesa il tetto. */
    const spendeDavvero =
      (parsed.data.approfondita === true && !gia.approfondimento) ||
      (parsed.data.eventiNegativi === true && !gia.eventiNegativi);

    /*
      Quanto può costare al massimo questa analisi: l'anagrafica se l'azienda non è ancora in
      archivio, più gli acquisti facoltativi chiesti e non già in casa. Serve al tetto
      complessivo degli account di prova, che guarda anche l'operazione e non solo il passato.
    */
    const inArchivio = await giaInArchivio(request, request.params.id);
    const previstoAnalisi =
      (inArchivio ? 0 : costoAnalisi('completo', listino)) +
      (parsed.data.approfondita === true && !gia.approfondimento
        ? costoAnalisi('profondito', listino) - costoAnalisi('completo', listino)
        : 0) +
      (parsed.data.eventiNegativi === true && !gia.eventiNegativi ? costoEventiNegativi(listino) : 0);

    const esito = await oltreIlTetto(request, previstoAnalisi);
    /*
      L'esenzione «già in archivio» vale per chi ha raggiunto il tetto, mai per uno studio in
      attesa di attivazione: la riga dell'azienda la crea gratis anche un dossier salvato, e da
      lì l'analisi comprava l'anagrafica col credito della piattaforma (revisione di sicurezza
      del 18/09/2026). Uno studio mai attivato non ha pagato niente da rileggere.
    */
    if (esito !== null && (esito.ambito === 'attivazione' || !inArchivio)) {
      return reply.status(codiceTetto(esito)).send({
        errore: messaggioTetto(esito, 'Le analisi riprendono domani.'),
      });
    }
    /*
      Il tetto pesa su cio' che si addebita, non su cio' che si chiede.

      Diceva «approfondita richiesta» e basta: raggiunto il tetto, un intermediario non
      poteva piu' rileggere un approfondimento comprato la settimana prima, che non costava
      niente. Il tetto esiste per fermare un ciclo impazzito, non per confiscare i dati di
      chi li ha gia' pagati.
    */
    if (esito !== null && spendeDavvero) {
      return reply.status(codiceTetto(esito)).send({
        errore: messaggioTetto(
          esito,
          'L’azienda resta consultabile con l’analisi ordinaria, che non costa nulla perché è già in archivio.',
        ),
      });
    }

    const { risultato: analisi, eventi } = await conCostiDellaRichiesta(() =>
      analizzaERegistra(request, request.params.id, {
        ...(parsed.data.datiDichiarati === undefined
          ? {}
          : { datiDichiarati: toDatiDichiarati(parsed.data.datiDichiarati) }),
        ...(parsed.data.polizze === undefined ? {} : { polizze: parsed.data.polizze.map(toPolizza) }),
        ...(parsed.data.asOf === undefined ? {} : { asOf: parsed.data.asOf }),
        /*
          L'approfondimento si COMPRA esplicitamente — costa quasi cinque volte l'analisi
          ordinaria, e nessuno deve trovarselo addebitato per una svista — ma si USA sempre
          quando e' gia' in casa. Sono due cose diverse, e per un anno sono state la stessa.
        */
        ...(approfonditaEffettiva ? { livello: 'profondito' as const } : {}),
        conEventiNegativi: negativitaEffettiva,
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
    /*
      «In corso» solo se qualcuno l'ha davvero chiesta.

      Questa condizione diceva «avviata e già pagata, ricarica la pagina» ogni volta che
      gli eventi negativi mancavano — cioè, da quando l'acquisto è diventato facoltativo,
      **sempre**. Annunciava una spesa mai fatta e invitava a ricaricare una pagina che
      non sarebbe cambiata: la peggiore combinazione possibile su un prodotto dove la
      fiducia riguarda i soldi di chi lo usa.
    */
    const accertamentiInCorso =
      negativitaEffettiva &&
      analisi.profile.eventiNegativi === null &&
      OPENAPI_DEFAULT_CONFIG.services.eventiNegativi.verificato &&
      !provider.name.startsWith('Demo');

    /*
      QUALI DEI DUE ACQUISTI FACOLTATIVI SONO GIÀ PAGATI, per questa impresa.

      I due pulsanti dichiarano il proprio prezzo — «+0,30 €» e «+0,45 €» — ed è la regola
      giusta: nessuno deve spendere senza saperlo. Ma su un'impresa già approfondita quel
      prezzo è FALSO: la risposta resta in archivio trenta giorni, e in quel periodo il
      secondo clic non addebita nulla.

      È successo davvero. L'approfondimento era stato comprato il giorno prima, la risposta
      era valida per altri ventinove giorni, e il pulsante continuava ad annunciare trenta
      centesimi: chi guardava lo schermo ha smesso di cliccare per non ripagare un dato che
      possedeva già. Un prezzo dichiarato dove non c'è addebito non è prudenza — è lavoro
      che non si fa su dati che si sono pagati.

      Si chiede al fornitore, non alla tabella della cache: la chiave la costruisce lui,
      dalle stesse opzioni della richiesta vera, e così non esiste una seconda copia che
      possa divergere.
    */
    /*
      Le stesse due letture di prima, non ripetute: fra l'una e l'altra ci sarebbe stata la
      lettura del profilo, che riempie la cache — e il pulsante avrebbe detto «gia'
      acquistata» di un dato appena comprato in questa richiesta. Vero, ma per un istante
      soltanto, e chi legge non ha modo di saperlo.
    */
    return {
      ...presentAnalysis(analisi),
      accertamentiInCorso,
      senzaSpesa: gia,
      /** Cosa la pagina sta mostrando davvero, che non e' sempre cio' che ha chiesto. */
      livelloMostrato: {
        approfondita: approfonditaEffettiva,
        eventiNegativi: negativitaEffettiva,
      },
    };
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

  /*
    Esportazione dell'elenco, in CSV per Excel italiano.

    È il gesto opposto alla presa in carico e ha lo stesso scopo: il broker non lavora solo
    dentro la piattaforma. Porta la lista in riunione, la passa al collega che fa le
    telefonate, la incrocia col proprio gestionale. Una piattaforma da cui i dati non
    escono è una piattaforma di cui non ci si fida.

    Il filtro è **lo stesso** che applica la pagina, perché la funzione arriva dal dominio:
    scaricare una lista diversa da quella che si sta guardando è il tipo di sorpresa che si
    scopre davanti al cliente.
  */
  app.get<{ Querystring: { filtro?: string } }>('/api/portafoglio/esporta', async (request, reply) => {
    const voci = await contestoDi(request).portafoglio.elenco();
    const filtrate = applicaFiltroPortafoglio(voci, request.query.filtro);
    const csv = esportaPortafoglioCsv(filtrate);

    /*
        `text/csv` con l'accento dichiarato, e il nome del file nell'intestazione: senza
        `Content-Disposition` il browser mostrerebbe il CSV a schermo invece di salvarlo,
        e con i punti e virgola sarebbe illeggibile.
      */
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${nomeFileEsportazione(new Date(), request.query.filtro)}"`,
      )
      .send(csv);
  });

  // ── CRM ────────────────────────────────────────────────────────────────────
  /*
    Il CRM (17/09/2026, «AEGIS - cambi.pptx»): «Questa pagina deve essere un CRM non un
    tracker assicurativo». Le aziende analizzate e quelle degli elenchi comprati, con lo stato
    commerciale e la nota dell'intermediario, in ordine di priorità di intervento. Le rotte del
    portafoglio assicurativo restano, per chi le chiama: l'interfaccia usa queste.
  */
  const crmDto = (voce: VoceCrm) => ({
    ...voce,
    analizzataIl: voce.analizzataIl?.toISOString() ?? null,
    daElencoIl: voce.daElencoIl?.toISOString() ?? null,
    statoAggiornatoIl: voce.statoAggiornatoIl?.toISOString() ?? null,
    aggiuntaIl: voce.aggiuntaIl.toISOString(),
  });

  app.get('/api/crm', async (request) => {
    const voci = await contestoDi(request).crm.elenco();
    return {
      aziende: voci.map(crmDto),
      conteggi: Object.fromEntries(
        STATI_CRM.map((stato) => [stato, voci.filter((v) => v.stato === stato).length]),
      ),
    };
  });

  app.patch<{ Params: { id: string } }>('/api/crm/:id', async (request, reply) => {
    const parsed = modificheCrmSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Modifica non valida', dettagli: parsed.error.issues });
    }
    if (parsed.data.stato === undefined && parsed.data.nota === undefined) {
      return reply.status(400).send({ errore: 'Nessuna modifica: indicare lo stato o la nota' });
    }
    const trovata = await contestoDi(request).crm.aggiorna(request.params.id, parsed.data);
    if (!trovata) return reply.status(404).send({ errore: 'Azienda non presente nel CRM' });
    return { ok: true };
  });

  // Lo stesso formato del file del portafoglio, con le colonne del CRM e il filtro per stato.
  app.get<{ Querystring: { filtro?: string } }>('/api/crm/esporta', async (request, reply) => {
    const voci = await contestoDi(request).crm.elenco();
    const csv = esportaCrmCsv(applicaFiltroCrm(voci, request.query.filtro));
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${nomeFileEsportazioneCrm(new Date(), request.query.filtro)}"`,
      )
      .send(csv);
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

    const presenti = new Set((await contestoDi(request).portafoglio.elenco()).map((v) => v.identificativo));

    // Col listino del contratto, non con quello pubblico: è il preventivo che si legge
    // prima di decidere se importare quattrocento aziende.
    const costoUnitarioCentesimi = costoAnalisi('completo', listino);
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

    const contesto = contestoDi(request);
    const presenti = new Set((await contesto.portafoglio.elenco()).map((v) => v.identificativo));
    const anteprima = preparaImportazione(
      parsed.data.contenuto,
      presenti,
      costoAnalisi('completo', listino),
    );

    if (anteprima.daAcquisire.length > MASSIMO_PER_IMPORTAZIONE) {
      return reply.status(400).send({
        errore:
          `Il file contiene ${anteprima.daAcquisire.length} aziende da acquisire: il massimo per ` +
          `singola importazione è ${MASSIMO_PER_IMPORTAZIONE}. Procedere a scaglioni.`,
      });
    }

    const esito = await oltreIlTetto(request, costoAnalisi('completo', listino));
    if (esito !== null) {
      return reply.status(codiceTetto(esito)).send({
        errore: messaggioTetto(
          esito,
          'L’importazione riprende domani. Le aziende già acquisite restano in portafoglio.',
        ),
      });
    }

    const fallite: { partitaIva: string; motivo: string }[] = [];
    const eventiTotali: CostEvent[] = [];
    let acquisite = 0;
    let interrottaPerTetto = false;

    /*
      Il tetto si rilegge **prima di ogni azienda**, e la spesa si annota subito dopo.

      Controllarlo una volta sola prima di un ciclo da duecentocinquanta non è un tetto:
      è una domanda posta quando la risposta è ancora zero. Con le spese registrate solo
      alla fine, `spesaOdierna` restituiva lo stesso numero per tutta la durata
      dell'importazione — duecentocinquanta analisi da dieci centesimi passavano intere
      sotto un tetto da venti euro, superandolo del venticinque per cento, e due
      importazioni lanciate insieme passavano entrambe perché nessuna delle due vedeva
      ciò che l'altra stava spendendo.

      Ora ogni giro scrive nel registro ciò che ha appena speso, e il giro successivo lo
      legge. Lo sforamento residuo è quello di **una** azienda, non quello di un file.
    */
    for (const riga of anteprima.daAcquisire) {
      const oltre = await oltreIlTetto(request, costoAnalisi('completo', listino));
      if (oltre !== null) {
        interrottaPerTetto = true;
        // Ciò che resta fuori si dichiara riga per riga: un elenco che si accorcia in
        // silenzio fa credere che il file fosse più corto.
        fallite.push({
          partitaIva: riga.partitaIva,
          motivo: messaggioTetto(oltre, 'Non acquisita: riprendere l’importazione domani.'),
        });
        continue;
      }

      const { risultato, eventi } = await conCostiDellaRichiesta(async () => {
        try {
          const analisi = await analizzaERegistra(request, riga.partitaIva);
          if (analisi === null) {
            fallite.push({ partitaIva: riga.partitaIva, motivo: 'Azienda non trovata dal provider' });
            return false;
          }
          return true;
        } catch (errore) {
          fallite.push({
            partitaIva: riga.partitaIva,
            motivo: errore instanceof ProviderError ? errore.message : 'Errore durante l’acquisizione',
          });
          return false;
        }
      });

      // Prima si registra la spesa, poi si conta l'acquisto: un fallimento non deve poter
      // lasciare fuori dal registro un dato che è già stato pagato.
      eventiTotali.push(...eventi);
      await registraSpese(request, eventi);
      if (risultato) acquisite++;
    }

    const costoEffettivoCentesimi = costoDegliEventi(eventiTotali);

    return {
      acquisite,
      fallite,
      costoEffettivoCentesimi,
      giaPresenti: anteprima.giaPresenti.length,
      interrottaPerTetto,
    };
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
    const [eventi, daGestire] = await conTenant(persistenza.db, tenantId, (tx) =>
      Promise.all([elencoEventi(tx, tenantId, { soloDaGestire }), contaEventiDaGestire(tx, tenantId)]),
    );

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
    return conTenant(persistenza.db, tenantId, (tx) => eseguiMonitoraggio(tx, tenantId));
  });

  app.post<{ Params: { id: string } }>('/api/monitoraggio/:id/gestito', async (request, reply) => {
    const sessione = request.sessione;
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Monitoraggio non disponibile senza persistenza' });
    }

    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;
    const { segnaGestito, registraAudit } = await import('@aegis/db');

    const fatto = await conTenant(persistenza.db, tenantId, (tx) =>
      segnaGestito(tx, tenantId, request.params.id, sessione?.utenteId ?? null),
    );
    if (!fatto) return reply.status(404).send({ errore: 'Evento non trovato' });

    // A verbale: davanti a una contestazione, «l'avevamo segnalato» vale solo se è
    // dimostrabile chi l'ha preso in carico e quando.
    await registraAudit(persistenza.db, {
      tenantId,
      utenteId: sessione?.utenteId ?? null,
      azione: 'monitoraggio.evento-gestito',
      entita: 'evento',
      entitaId: request.params.id,
      dettagli: { da: sessione?.email ?? null },
    });

    return { gestito: true };
  });

  // ── Dossier: dati di intervista e polizze ──────────────────────────────────
  // ── Adeguata verifica della clientela (D.Lgs. 231/2007) ────────────────────
  /*
    L'obbligo dell'intermediario, non un miglioramento dell'analisi.

    Prima di instaurare un rapporto continuativo il distributore identifica il cliente e i
    suoi titolari effettivi e li verifica contro liste di sanzioni e persone politicamente
    esposte. AEGIS sa già CHI verificare — il titolare effettivo lo ricava dai soci che ha
    comprato — e qui aggiunge il confronto con le liste.

    Tre rotte, e la terza è quella che chiude l'obbligo: la ricerca la fa la macchina, la
    valutazione la fa una persona, e in ispezione si guarda la seconda.
  */
  app.get<{ Params: { id: string } }>('/api/aziende/:id/adeguata-verifica', async (request) => {
    if (persistenza === undefined) return { verifiche: [], costoCentesimi: 0 };

    const tenantId = request.sessione?.tenantId ?? persistenza.tenantPredefinito;
    const aziendaId = await conTenant(persistenza.db, tenantId, (tx) =>
      trovaAziendaPerChiave(tx, tenantId, request.params.id),
    );
    if (aziendaId === null) return { verifiche: [], costoCentesimi: costoScreening };

    const verifiche = await conTenant(persistenza.db, tenantId, (tx) =>
      verifichePerAzienda(tx, tenantId, aziendaId),
    );

    return {
      // Il costo della prossima verifica, dichiarato PRIMA che qualcuno prema il tasto.
      costoCentesimi: costoScreening,
      verifiche: verifiche.map((v) => ({
        id: v.id,
        nome: v.nome,
        ruolo: v.ruolo,
        annoNascita: v.annoNascita,
        stato: v.stato,
        conclusione: v.conclusione,
        candidati: v.candidati,
        decisioni: v.decisioni,
        nota: v.nota,
        verificataIl: v.verificataIl?.toISOString() ?? null,
        decisaIl: v.decisaIl?.toISOString() ?? null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>('/api/aziende/:id/adeguata-verifica', async (request, reply) => {
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile' });
    }

    const parsed = adeguataVerificaSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    // La verifica è un acquisto: il ruolo in sola lettura consulta, non compra.
    const sessione = request.sessione;
    if (sessione !== undefined && !puoScrivere(sessione.ruolo)) {
      return reply.status(403).send({
        errore: 'L’adeguata verifica è un acquisto, e resta ai ruoli che possono scrivere.',
      });
    }

    const esitoTetto = await oltreIlTetto(request, costoScreening * parsed.data.persone.length);
    if (esitoTetto !== null) {
      return reply
        .status(codiceTetto(esitoTetto))
        .send({ errore: messaggioTetto(esitoTetto, 'Le verifiche riprendono domani.') });
    }

    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;
    const aziendaId = await conTenant(persistenza.db, tenantId, (tx) =>
      trovaAziendaPerChiave(tx, tenantId, request.params.id),
    );

    const quando = new Date();
    const salvate: string[] = [];

    for (const persona of parsed.data.persone) {
      /*
          Una persona per volta, e ognuna con il proprio esito salvato.

          Non si accorpano in un'unica riga: le decisioni si prendono su una persona
          per volta, spesso in giorni diversi, e un fascicolo che le tiene insieme
          costringerebbe a rivalutare tutti per registrarne uno.
        */
      const candidati = await provider.screeningPersona(persona.nome, persona.annoNascita ?? undefined);
      const esito = componiEsito(
        {
          nome: persona.nome,
          ruolo: persona.ruolo,
          ...(persona.annoNascita === undefined ? {} : { annoDiNascita: persona.annoNascita }),
        },
        candidati,
        quando,
      );

      const id = await conTenant(persistenza.db, tenantId, (tx) =>
        salvaVerifica(tx, {
          tenantId,
          aziendaId,
          nome: persona.nome,
          ruolo: persona.ruolo,
          annoNascita: persona.annoNascita ?? null,
          stato: esito.stato,
          conclusione: esito.conclusione,
          candidati: esito.riscontri,
          costoCentesimi: costoScreening,
          verificataIl: quando,
        }),
      );
      salvate.push(id);

      await registraAudit(persistenza.db, {
        tenantId,
        utenteId: sessione?.utenteId ?? null,
        azione: 'adeguata-verifica.eseguita',
        entita: 'azienda',
        ...(aziendaId === null ? {} : { entitaId: aziendaId }),
        dettagli: {
          nome: persona.nome,
          ruolo: persona.ruolo,
          stato: esito.stato,
          candidati: esito.riscontri.length,
          costoCentesimi: costoScreening,
        },
      });
    }

    return { verificate: salvate.length, costoCentesimi: costoScreening * salvate.length };
  });

  /*
    La decisione, che è ciò che chiude l'obbligo.

    Il prodotto non conclude mai al posto dell'intermediario: la fonte cerca per nome, e un
    nome può appartenere a due persone diverse — una in lista e una no. Qui si registra chi
    ha guardato, quando, e cosa ha concluso su ogni candidato. Il registro delle operazioni
    ne conserva la prova in modo che nessuno possa riscriverla.
  */
  app.post<{ Params: { id: string } }>('/api/adeguata-verifica/:id/decisione', async (request, reply) => {
    if (persistenza === undefined) {
      return reply.status(503).send({ errore: 'Archivio non disponibile' });
    }

    const parsed = decisioneVerificaSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const sessione = request.sessione;
    if (sessione === undefined) {
      return reply.status(401).send({ errore: 'Sessione richiesta' });
    }

    const quando = new Date();
    const aggiornata = await conTenant(persistenza.db, sessione.tenantId, (tx) =>
      registraDecisione(tx, {
        id: request.params.id,
        tenantId: sessione.tenantId,
        decisioni: parsed.data.decisioni,
        nota: parsed.data.nota ?? null,
        utenteId: sessione.utenteId,
        quando,
      }),
    );

    if (!aggiornata) {
      return reply.status(404).send({ errore: 'Verifica non trovata' });
    }

    await registraAudit(persistenza.db, {
      tenantId: sessione.tenantId,
      utenteId: sessione.utenteId,
      azione: 'adeguata-verifica.decisa',
      entita: 'verifica-antiriciclaggio',
      entitaId: request.params.id,
      dettagli: { decisioni: parsed.data.decisioni, nota: parsed.data.nota ?? null },
    });

    return { decisa: true, decisaIl: quando.toISOString() };
  });

  app.get<{ Params: { id: string } }>('/api/aziende/:id/dossier', async (request) => {
    return (
      (await contestoDi(request).dossier.get(request.params.id)) ?? {
        identificativo: request.params.id,
        datiDichiarati: null,
        polizze: [],
      }
    );
  });

  // ── Questionario compilato dal cliente ─────────────────────────────────────
  /*
    Oggi l'intervista la compila l'intermediario, e i campi che richiedono un dato che solo
    l'azienda conosce — le scorte, i veicoli, se si lavora in cantiere — restano vuoti. Il
    collegamento sposta la compilazione su chi ha la risposta.

    Il token viaggia **una volta sola**, nella risposta che lo crea: in archivio ne resta
    l'impronta. È la stessa regola delle password iniziali, e per la stessa ragione — se un
    domani qualcuno legge una copia del database, non ottiene collegamenti funzionanti.
  */
  const DURATA_INVITO_MS = 30 * 24 * 60 * 60 * 1000;

  app.post<{ Params: { id: string } }>('/api/aziende/:id/questionario/invito', async (request, reply) => {
    if (persistenza === undefined) {
      return reply
        .status(503)
        .send({ errore: 'Il questionario condiviso richiede la persistenza su database.' });
    }

    const sessione = request.sessione;
    const tenantId = sessione?.tenantId ?? persistenza.tenantPredefinito;

    const aziendaId = await conTenant(persistenza.db, tenantId, (tx) =>
      assicuraAzienda(tx, tenantId, {
        partitaIva: request.params.id,
        codiceFiscale: null,
        denominazione: request.params.id,
        providerId: request.params.id,
        provincia: null,
        atecoPrimario: null,
      }),
    );

    const token = generaTokenSessione();
    const invito = await creaInvito(persistenza.db, {
      aziendaId,
      tenantId,
      impronta: improntaToken(token),
      scadeIl: new Date(Date.now() + DURATA_INVITO_MS),
      creatoDa: sessione?.utenteId ?? null,
    });

    await registraAudit(persistenza.db, {
      tenantId,
      utenteId: sessione?.utenteId ?? null,
      azione: 'questionario.invito-creato',
      entita: 'azienda',
      entitaId: aziendaId,
      dettagli: { invitoId: invito.id, scadeIl: invito.scadeIl.toISOString() },
    });

    // Il token compare qui e mai più: chi non lo copia adesso ne genera un altro.
    return reply.status(201).send({ token, scadeIl: invito.scadeIl.toISOString() });
  });

  app.get<{ Params: { id: string } }>('/api/aziende/:id/questionario/invito', async (request) => {
    if (persistenza === undefined) return { invito: null };

    const tenantId = request.sessione?.tenantId ?? persistenza.tenantPredefinito;
    const aziendaId = await conTenant(persistenza.db, tenantId, (tx) =>
      trovaAziendaPerChiave(tx, tenantId, request.params.id),
    );
    if (aziendaId === null) return { invito: null };

    const invito = await invitoAttivo(persistenza.db, aziendaId);
    return {
      invito:
        invito === null
          ? null
          : {
              creatoIl: invito.creatoIl.toISOString(),
              scadeIl: invito.scadeIl.toISOString(),
              compilatoIl: invito.compilatoIl?.toISOString() ?? null,
            },
    };
  });

  app.delete<{ Params: { id: string } }>('/api/aziende/:id/questionario/invito', async (request, reply) => {
    if (persistenza === undefined) return reply.status(404).send({ errore: 'Nessun invito' });

    const tenantId = request.sessione?.tenantId ?? persistenza.tenantPredefinito;
    const aziendaId = await conTenant(persistenza.db, tenantId, (tx) =>
      trovaAziendaPerChiave(tx, tenantId, request.params.id),
    );
    if (aziendaId === null) return reply.status(404).send({ errore: 'Nessun invito' });

    const revocati = await revocaInviti(persistenza.db, tenantId, aziendaId);
    if (revocati > 0) {
      await registraAudit(persistenza.db, {
        tenantId,
        utenteId: request.sessione?.utenteId ?? null,
        azione: 'questionario.invito-revocato',
        entita: 'azienda',
        entitaId: aziendaId,
        dettagli: { quanti: revocati },
      });
    }
    return { revocati };
  });

  /*
    ── Porta pubblica ────────────────────────────────────────────────────────

    Da qui entra chi ha il collegamento, e nessun altro controllo lo protegge. Due regole
    che non vanno allentate:

     1. **Si espone solo il questionario** dell'azienda a cui il token si riferisce: la
        denominazione, i dati di intervista e le polizze dichiarate. Mai lo score, mai
        l'analisi, mai il portafoglio, mai un'altra azienda.
     2. **Invito assente, scaduto e revocato danno la stessa risposta.** Distinguerli
        direbbe a chi prova collegamenti a caso quando ne ha trovato uno che è esistito.
  */
  const invitoDa = async (token: string) => {
    if (persistenza === undefined) return null;
    const invito = await risolviInvito(persistenza.db, improntaToken(token));
    if (invito === null) return null;

    // Lo studio lo dice l'invito, che non è protetto proprio perché si risolve prima di
    // sapere per conto di chi. Da qui in poi il tenant è noto, e si dichiara.
    const azienda = await conTenant(persistenza.db, invito.tenantId, (tx) =>
      chiaveAzienda(tx, invito.aziendaId),
    );
    if (azienda === null) return null;

    /*
      Il database viaggia insieme al risultato.

      Dentro questo ramo la persistenza esiste per costruzione, ma affermarlo più avanti
      con un punto esclamativo sarebbe una promessa non verificata: fra sei mesi qualcuno
      sposta il controllo e resta l'asserzione.
    */
    return {
      invito,
      azienda,
      db: persistenza.db,
      /*
        Senza utente, e deliberatamente: da questa porta entra il **cliente**
        dell'intermediario, che un utente della piattaforma non è. Il suo lavoro non si
        attribuisce a un collaboratore dello studio — l'audit trail lo registra con
        un'azione propria, che dice esattamente da dove è arrivato.
      */
      contesto: persistenza.perTenant(invito.tenantId, null),
    };
  };

  app.get<{ Params: { token: string } }>('/api/questionario/:token', async (request, reply) => {
    const risolto = await invitoDa(request.params.token);
    if (risolto === null) {
      return reply.status(404).send({ errore: 'Collegamento non valido o scaduto' });
    }

    const [dossier, studio] = await Promise.all([
      risolto.contesto.dossier.get(risolto.azienda.chiave),
      risolto.contesto.studio.leggi().catch(() => null),
    ]);

    /*
      La pagina la apre il cliente **dell'intermediario**, non il nostro.

      Deve quindi portare il marchio dello studio, come il report: senza, chi compila si
      trova davanti il nome di un fornitore che non ha mai scelto e non sa se fidarsi. Sono
      dati che l'intermediario mette su ogni documento — denominazione e numero RUI — non
      informazioni riservate.
    */
    return {
      denominazione: risolto.azienda.denominazione,
      scadeIl: risolto.invito.scadeIl.toISOString(),
      studio:
        studio === null
          ? null
          : {
              denominazione: studio.denominazione,
              logo: studio.logo,
              numeroRui: studio.numeroRui,
            },
      datiDichiarati: dossier?.datiDichiarati ?? null,
      polizze: dossier?.polizze ?? [],
    };
  });

  app.put<{ Params: { token: string } }>('/api/questionario/:token', async (request, reply) => {
    const risolto = await invitoDa(request.params.token);
    if (risolto === null) {
      return reply.status(404).send({ errore: 'Collegamento non valido o scaduto' });
    }

    const parsed = analisiRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ errore: 'Dati non validi', dettagli: parsed.error.issues });
    }

    const dossier = await risolto.contesto.dossier.upsert(risolto.azienda.chiave, {
      ...(parsed.data.datiDichiarati === undefined
        ? {}
        : { datiDichiarati: toDatiDichiarati(parsed.data.datiDichiarati) }),
      ...(parsed.data.polizze === undefined ? {} : { polizze: parsed.data.polizze.map(toPolizza) }),
    });

    await segnaInvitoCompilato(risolto.db, risolto.invito.id);

    /*
      A verbale che ha compilato **il cliente**, non l'intermediario.

      È una distinzione che conta davanti a una contestazione: un dato dichiarato
      dall'assicurato e uno rilevato dall'intermediario hanno un peso diverso, e a
      distanza di anni nessuno se lo ricorda.
    */
    await registraAudit(risolto.db, {
      tenantId: risolto.invito.tenantId,
      azione: 'questionario.compilato-dal-cliente',
      entita: 'azienda',
      entitaId: risolto.invito.aziendaId,
      dettagli: { invitoId: risolto.invito.id },
    });

    return { salvato: true, completezza: valutaCompletezza(dossier.datiDichiarati) };
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
  /**
   * L'errore del fornitore tradotto per chi lo legge a schermo.
   *
   * Ogni voce dice **cosa è successo** e **cosa fare**, e nessuna nomina il fornitore o il
   * percorso chiamato: un intermediario non deve scoprire da un messaggio d'errore a chi
   * compriamo i dati, e un cliente che guarda lo schermo ancora meno.
   */
  function messaggioLeggibile(errore: ProviderError): string {
    switch (errore.kind) {
      case 'non-trovato':
        return 'Nessuna impresa risulta con questa partita IVA nel Registro Imprese. Verificare le undici cifre, oppure cercare per denominazione.';
      case 'autenticazione':
        return 'Il servizio dati non ha accettato le credenziali. Controllare la configurazione in Impostazioni → Servizi dati: nessun credito è stato consumato.';
      case 'quota':
        return 'Credito esaurito presso il fornitore dei dati, oppure troppe richieste ravvicinate. Riprovare fra qualche minuto o ricaricare il credito.';
      case 'temporaneo':
        return 'Il servizio dati non ha risposto in tempo. È una interruzione momentanea: riprovare fra poco, nessun credito è stato consumato.';
      case 'risposta-non-valida':
        return 'Il servizio dati ha risposto in un formato inatteso. La segnalazione è stata registrata; riprovare più tardi.';
      default:
        return 'Il servizio dati non è al momento disponibile. Riprovare fra qualche minuto.';
    }
  }

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
      /*
        Il messaggio tecnico non esce di qui.

        Usciva: chi cercava una partita IVA inesistente leggeva «OpenAPI.com ·
        /IT-advanced/{id}: HTTP 406». Tre danni in una riga — non dice niente a un
        intermediario, non suggerisce cosa fare, e soprattutto **rivela il fornitore e il
        percorso interno** a chiunque guardi lo schermo, cliente compreso.

        Il messaggio originale resta nei log, dove serve a chi indaga. A schermo va una
        frase che dica cosa è successo e cosa fare.
      */
      app.log.warn({ err: error }, 'errore dal fornitore dati');
      return reply.status(status).send({ errore: messaggioLeggibile(error), tipo: error.kind });
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

  // Le email partite dopo la risposta finiscono prima che l'archivio si chiuda: altrimenti
  // un riavvio a metà lascerebbe un codice in tabella senza l'email che lo porta.
  app.addHook('onClose', async () => {
    await Promise.allSettled([...lavoriInCorso]);
  });

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

const adeguataVerificaSchema = z.object({
  /*
    Chi verificare, dichiarato da chi chiede.

    Il tetto di dieci non è prudenza generica: ogni nome è una chiamata a pagamento, e una
    richiesta con cento nomi svuoterebbe il tetto giornaliero in un colpo. Un'impresa con
    più di dieci titolari effettivi esiste, e in quel caso si verifica in due volte —
    guardando cosa si sta comprando.
  */
  persone: z
    .array(
      z.object({
        nome: z.string().trim().min(2).max(200),
        ruolo: z.string().trim().min(2).max(120),
        annoNascita: z.number().int().min(1900).max(2100).optional(),
      }),
    )
    .min(1)
    .max(10),
});

const decisioneVerificaSchema = z.object({
  /*
    La decisione su ogni candidato, per identificativo.

    «confermato» significa «è la stessa persona»; «escluso» significa «è un omonimo». Non
    esiste un terzo valore, e non esiste il silenzio: un candidato lasciato senza decisione
    resta da valutare, ed è giusto che si veda.
  */
  decisioni: z.record(z.string(), z.enum(['confermato', 'escluso'])),
  nota: z.string().trim().max(2000).optional(),
});

/** Perché un'operazione a pagamento è stata fermata: tetto dello studio, della piattaforma, o studio non ancora attivato. */
interface EsitoTetto {
  readonly speso: number;
  readonly limite: number;
  readonly ambito: 'studio' | 'piattaforma' | 'attivazione' | 'credito';
  /** Solo per `credito`: quanto poteva costare al massimo l'operazione rifiutata, in centesimi. */
  readonly previsto?: number;
}

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const nuovoStudioSchema = z.object({
  denominazione: z.string().trim().min(2).max(200),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
});

/**
 * Il RUI: una lettera di sezione (A agenti, B broker, C produttori diretti, D banche e
 * intermediari finanziari, E collaboratori, F intermediari a titolo accessorio) e nove cifre.
 * Si controlla la forma, non l'esistenza nel registro: quella la verifica il gestore prima
 * di attivare gli acquisti.
 */
export const FORMA_RUI = /^[A-F]\d{9}$/;

const registrazioneSchema = z.object({
  nome: z
    .string({ message: 'Indicare nome e cognome.' })
    .trim()
    .min(2, 'Indicare nome e cognome.')
    .max(120, 'Il nome non può superare i 120 caratteri.'),
  email: z
    .string({ message: 'Indicare l’indirizzo email.' })
    .trim()
    .toLowerCase()
    .email('L’indirizzo email non è valido.')
    .max(200, 'L’indirizzo email è troppo lungo.'),
  password: z
    .string({ message: 'Scegliere una password.' })
    .max(200, 'La password non può superare i 200 caratteri.'),
  denominazione: z
    .string({ message: 'Indicare il nome dello studio.' })
    .trim()
    .min(2, 'Indicare il nome dello studio.')
    .max(200, 'Il nome dello studio non può superare i 200 caratteri.'),
  numeroRui: z
    .string({ message: 'Indicare il numero di iscrizione al RUI.' })
    .transform((v) => v.replace(/[\s.-]/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          FORMA_RUI,
          'Il numero RUI è una lettera da A a F seguita da nove cifre, per esempio B000123456.',
        ),
    ),
});

const codiceSchema = z.object({ codice: z.string().min(20).max(200) });

const passwordDimenticataSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

const nuovaPasswordSchema = z.object({
  codice: z.string().min(20).max(200),
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

/**
 * Ciò che l'intermediario cambia nel CRM. Una nota vuota è «nessuna nota», non un testo vuoto:
 * nel file esportato una cella vuota e una nota cancellata devono essere la stessa cosa.
 */
const modificheCrmSchema = z.object({
  stato: z.enum(STATI_CRM).optional(),
  nota: z
    .string()
    .trim()
    .max(2000)
    .transform((testo) => (testo === '' ? null : testo))
    .nullable()
    .optional(),
});

const prospezioneSchema = z.object({
  denominazione: z.string().trim().max(120).optional(),
  // Codice catastale del comune, es. B157: facoltativo dal 17/09/2026, e verificato nella rotta
  // contro l'elenco ISTAT perché il messaggio dica cosa non va invece di «filtri non validi».
  comune: z.string().trim().max(4).toUpperCase().optional(),
  ateco: z.string().trim().max(12).optional(),
  addettiMin: numeroFacoltativo,
  addettiMax: numeroFacoltativo,
  fatturatoMinEuro: numeroFacoltativo,
  fatturatoMaxEuro: numeroFacoltativo,
  arricchimento: z.enum(['start', 'advanced']).optional(),
  formaGiuridicaCodice: z.string().trim().max(4).toUpperCase().optional(),
  socioCodiceFiscale: z.string().trim().max(20).optional(),
  // Tetto basso e dichiarato: a cinque centesimi ad azienda, duecento record sono dieci
  // euro. Il massimo esiste per impedire che una cifra digitata male costi una giornata.
  limite: z.coerce.number().int().min(1).max(100).optional(),
  /*
    La posizione da cui era partito un elenco già comprato: la porta l'indirizzo della pagina
    dell'elenco, così ricaricarla ripete la stessa richiesta — servita dalla memoria senza
    pagare — invece di comprare le aziende successive. Mai oltre quelle già scaricate.
  */
  salta: z.coerce.number().int().min(0).max(100_000).optional(),
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
  const { conTenant, statoStudio, trovaSessioneValida, trovaUtentePerId } = await import('@aegis/db');
  const database = db as Parameters<typeof trovaSessioneValida>[0];

  // La sessione non è protetta dalle policy — è il token stesso a dire lo studio — e da
  // qui in poi lo studio è noto: la lettura dell'utente lo dichiara.
  const sessione = await trovaSessioneValida(database, improntaToken(token), new Date());
  if (sessione === null) return null;

  const utente = await conTenant(database, sessione.tenantId, (tx) =>
    trovaUtentePerId(tx, sessione.utenteId),
  );
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
    acquistiAbilitati: studio.acquistiAbilitati,
    tettoSpesaTotaleCentesimi: studio.tettoSpesaTotaleCentesimi,
    emailVerificata: utente.emailVerificataIl !== null,
  };
}

async function caricaProfilo(
  provider: CompanyDataProvider,
  identificativo: string,
  livello: FetchLevel,
  opzioni: { readonly conEventiNegativi?: boolean | undefined } = {},
): Promise<CompanyProfile | null> {
  try {
    return await provider.fetchProfile(identificativo, livello, opzioni);
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
