/**
 * Schema PostgreSQL.
 *
 * Tre principi non negoziabili, tutti conseguenza di un unico fatto: fra tre anni
 * qualcuno potrebbe contestare una proposta assicurativa fatta oggi.
 *
 * 1. **Immutabilità degli snapshot.** Un dato di provider non si aggiorna mai in place:
 *    si scrive una nuova riga. Un'analisi fatta a marzo deve restare riproducibile a
 *    dicembre, con i dati di marzo — non con quelli aggiornati nel frattempo.
 *
 * 2. **Analisi congelate.** Il risultato di ogni analisi viene salvato per intero,
 *    insieme alla versione del catalogo rischi e delle regole che l'hanno prodotto.
 *    Ricalcolarla con il motore di domani darebbe un altro numero, e sarebbe indifendibile.
 *
 * 3. **Isolamento per intermediario.** Ogni riga porta `tenant_id`, con Row Level Security
 *    a livello di database. Il portafoglio di un broker non è mai visibile a un altro,
 *    nemmeno per un errore applicativo.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Colonna di denaro, in centesimi.
 *
 * **Mai `integer`.** Un `int4` si ferma a 2.147.483.647 centesimi, cioè 21.474.836 €:
 * un massimale RC di 25 milioni — ordinaria amministrazione su un rischio industriale —
 * non ci sta, e il patrimonio di vigilanza di una compagnia lo supera di tre ordini di
 * grandezza. L'errore non degrada il dato: fa fallire la scrittura.
 *
 * `bigint` in modalità numerica resta un `number` JavaScript, esatto fino a
 * 9.007.199.254.740.991 centesimi (90.071 miliardi di euro). Nessun importo assicurativo
 * al mondo si avvicina a quel limite.
 */
const denaro = (nome: string) => bigint(nome, { mode: 'number' });

// ─────────────────────────────────────────────────────────────────────────────
// Enumerazioni
// ─────────────────────────────────────────────────────────────────────────────

export const ruoloUtente = pgEnum('ruolo_utente', [
  'amministratore',
  'broker',
  'assistente',
  'sola-lettura',
]);

export const livelloAcquisizione = pgEnum('livello_acquisizione', ['base', 'esteso', 'completo']);

export const statoGap = pgEnum('stato_gap', [
  'assente',
  'sottoassicurata',
  'massimale-insufficiente',
  'in-scadenza',
  'adeguata',
  'da-quantificare',
]);

export const statoCatNat = pgEnum('stato_cat_nat', [
  'non-soggetta',
  'in-scadenza',
  'inadempiente',
  'adempiente',
]);

export const tipoEventoMonitoraggio = pgEnum('tipo_evento_monitoraggio', [
  'anagrafica-variata',
  'nuova-sede',
  'ateco-variato',
  'salto-dimensionale',
  'bilancio-depositato',
  'evento-negativo',
  'procedura-aperta',
  'score-variato',
  'polizza-in-scadenza',
  'obbligo-normativo',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenancy
// ─────────────────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  denominazione: text('denominazione').notNull(),
  /** Numero di iscrizione al RUI: identifica l'intermediario presso IVASS. */
  numeroRui: text('numero_rui'),
  partitaIva: text('partita_iva'),
  /*
    Recapiti dell'intermediario.

    Non sono decorazione: il Reg. IVASS 40/2018 impone che i documenti consegnati al
    contraente identifichino chi li ha redatti — denominazione, numero di iscrizione al
    RUI, recapiti. Un'analisi di adeguatezza senza intestazione non è un documento
    dell'intermediario, è un foglio.
  */
  indirizzo: text('indirizzo'),
  email: text('email'),
  telefono: text('telefono'),
  /**
   * Logo dello studio, come data URI.
   *
   * Il report è il documento che l'intermediario consegna al proprio cliente e su cui
   * mette la faccia: senza il suo marchio resta lo stampato di un fornitore, e nessuno
   * consegna a un cliente lo stampato di un fornitore.
   *
   * Conservato dentro il record e non come file su disco: sopravvive ai trasferimenti di
   * macchina, entra nei backup del database insieme a tutto il resto, e non introduce una
   * cartella di file caricati da proteggere separatamente.
   */
  logo: text('logo'),
  /** Tetto di spesa mensile sui dati, in centesimi. Oltre, l'acquisizione si blocca. */
  budgetDatiMensileCentesimi: denaro('budget_dati_mensile_centesimi'),
  /**
   * Distingue chi **gestisce** la piattaforma da chi la **usa**.
   *
   * Gli archivi dati si pagano con un contratto unico, intestato al gestore, e gli studi
   * che lavorano sulla piattaforma non ne sanno nulla: non vedono il fornitore, non vedono
   * il credito residuo, non possono toccare le autorizzazioni. Sono informazioni della
   * filiera, non del loro mestiere, e mostrargliele significa esporre la fornitura a
   * chiunque apra le impostazioni.
   *
   * È una proprietà dello studio, non della persona: un amministratore è tale dentro il
   * proprio studio, e questo non gli dà alcun titolo sull'infrastruttura di tutti.
   */
  gestorePiattaforma: boolean('gestore_piattaforma').notNull().default(false),
  creatoIl: timestamp('creato_il', { withTimezone: true }).notNull().defaultNow(),
  attivo: boolean('attivo').notNull().default(true),
});

export const utenti = pgTable(
  'utenti',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    nome: text('nome').notNull(),
    /**
     * Password derivata con scrypt: `scrypt$N$r$p$salt$derivata`, tutto in base64url.
     * I parametri sono nel record perché un irrobustimento futuro non deve invalidare
     * le password esistenti: si verifica con i parametri con cui è stata creata.
     */
    passwordHash: text('password_hash'),
    ruolo: ruoloUtente('ruolo').notNull().default('broker'),
    creatoIl: timestamp('creato_il', { withTimezone: true }).notNull().defaultNow(),
    ultimoAccesso: timestamp('ultimo_accesso', { withTimezone: true }),
    /** Tentativi di accesso falliti consecutivi: alimenta il blocco temporaneo. */
    tentativiFalliti: integer('tentativi_falliti').notNull().default(0),
    bloccatoFinoA: timestamp('bloccato_fino_a', { withTimezone: true }),
    attivo: boolean('attivo').notNull().default(true),
  },
  (t) => [uniqueIndex('utenti_email_unica').on(t.email), index('utenti_per_tenant').on(t.tenantId)],
);

/**
 * Sessioni.
 *
 * Su database e non in un token autofirmato: una sessione deve poter essere **revocata**.
 * Un JWT valido fino a scadenza resta valido anche dopo il licenziamento di un
 * collaboratore, e in uno strumento che custodisce i portafogli clienti di un
 * intermediario questo non è accettabile.
 *
 * In tabella si conserva l'**impronta** del token, non il token: chi legge il database
 * non ottiene sessioni utilizzabili.
 */
export const sessioni = pgTable(
  'sessioni',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    utenteId: uuid('utente_id')
      .notNull()
      .references(() => utenti.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** SHA-256 del token di sessione, in esadecimale. */
    improntaToken: text('impronta_token').notNull(),
    creataIl: timestamp('creata_il', { withTimezone: true }).notNull().defaultNow(),
    scadeIl: timestamp('scade_il', { withTimezone: true }).notNull(),
    ultimoUtilizzo: timestamp('ultimo_utilizzo', { withTimezone: true }).notNull().defaultNow(),
    indirizzoIp: text('indirizzo_ip'),
    userAgent: text('user_agent'),
    revocataIl: timestamp('revocata_il', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessioni_impronta_unica').on(t.improntaToken),
    index('sessioni_per_utente').on(t.utenteId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Aziende
// ─────────────────────────────────────────────────────────────────────────────

export const aziende = pgTable(
  'aziende',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    partitaIva: text('partita_iva'),
    codiceFiscale: text('codice_fiscale'),
    denominazione: text('denominazione').notNull(),
    /** Identificativo presso il provider dati, per le chiamate successive. */
    providerId: text('provider_id'),
    provincia: text('provincia'),
    atecoPrimario: text('ateco_primario'),
    /** L'azienda è cliente dell'intermediario o solo un prospetto in valutazione. */
    isCliente: boolean('is_cliente').notNull().default(false),
    creataIl: timestamp('creata_il', { withTimezone: true }).notNull().defaultNow(),
    aggiornataIl: timestamp('aggiornata_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Stessa azienda in tenant diversi è normale: due broker possono seguirla entrambi.
    uniqueIndex('aziende_piva_per_tenant').on(t.tenantId, t.partitaIva),
    index('aziende_per_denominazione').on(t.tenantId, t.denominazione),
  ],
);

/**
 * Snapshot immutabile dei dati ricevuti dal provider.
 * Non esiste UPDATE su questa tabella: solo INSERT.
 */
export const snapshotAzienda = pgTable(
  'snapshot_azienda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    livello: livelloAcquisizione('livello').notNull(),
    /** Profilo canonico serializzato: è ciò che rende l'analisi riproducibile. */
    profilo: jsonb('profilo').notNull(),
    /** Risposta grezza del provider, per diagnosi e per rimappare senza ripagare il dato. */
    rispostaGrezza: jsonb('risposta_grezza'),
    /** Data alla quale i dati erano veri, non data di lettura. */
    osservatoIl: timestamp('osservato_il', { withTimezone: true }).notNull(),
    acquisitoIl: timestamp('acquisito_il', { withTimezone: true }).notNull().defaultNow(),
    costoCentesimi: denaro('costo_centesimi').notNull().default(0),
  },
  (t) => [index('snapshot_per_azienda').on(t.aziendaId, t.osservatoIl)],
);

/**
 * Dati raccolti dall'intermediario in intervista.
 * A differenza degli snapshot, questi si aggiornano: sono il lavoro del broker,
 * e la loro storia è nell'audit trail.
 */
export const dossier = pgTable(
  'dossier',
  {
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    datiDichiarati: jsonb('dati_dichiarati')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Percentuale di completamento del questionario: guida la qualità dell'analisi. */
    completezza: numeric('completezza', { precision: 5, scale: 4 }),
    aggiornatoDa: uuid('aggiornato_da').references(() => utenti.id),
    aggiornatoIl: timestamp('aggiornato_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.aziendaId] })],
);

// ─────────────────────────────────────────────────────────────────────────────
// Inviti a compilare il questionario
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il collegamento con cui il cliente compila da sé la propria intervista.
 *
 * Oggi il questionario lo compila l'intermediario, al telefono o in visita, e i campi che
 * richiedono un dato che solo l'azienda conosce — le scorte in magazzino, i veicoli, se si
 * lavora in cantiere — restano vuoti. Mandare il collegamento al cliente sposta la
 * compilazione su chi ha la risposta.
 *
 * ## Perché somiglia a una sessione, e non a una chiave
 *
 * Questo collegamento apre una porta **senza autenticazione**: chi ce l'ha entra. Valgono
 * quindi le stesse tre difese delle sessioni:
 *
 *  - in tabella c'è l'**impronta** del token, mai il token. Chi legge una copia
 *    dell'archivio non ottiene collegamenti funzionanti;
 *  - **scade**, perché un collegamento in fondo a una casella di posta non deve restare
 *    valido per sempre;
 *  - si **revoca**, perché un indirizzo sbagliato o un cliente che cambia referente sono
 *    situazioni normali, non incidenti.
 *
 * ## Perché non è fra le tabelle con isolamento per intermediario
 *
 * L'esclusione è **deliberata**, come per `sessioni`: il collegamento va risolto *prima* di
 * sapere per conto di chi si sta lavorando — è il token stesso a dirlo. Una policy che
 * filtrasse per `app.tenant_id` renderebbe la riga invisibile proprio nel momento in cui
 * serve. L'isolamento è garantito dopo: dal token si ricava il tenant, e da lì in poi ogni
 * accesso passa dal contesto giusto.
 */
export const invitiQuestionario = pgTable(
  'inviti_questionario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** `sha256` del token. Il token esiste una volta sola, nella risposta che lo crea. */
    impronta: text('impronta').notNull(),
    creatoDa: uuid('creato_da').references(() => utenti.id),
    creatoIl: timestamp('creato_il', { withTimezone: true }).notNull().defaultNow(),
    scadeIl: timestamp('scade_il', { withTimezone: true }).notNull(),
    /** Ultima compilazione da parte del cliente: dice all'intermediario se aspettare. */
    compilatoIl: timestamp('compilato_il', { withTimezone: true }),
    revocatoIl: timestamp('revocato_il', { withTimezone: true }),
  },
  (t) => [uniqueIndex('inviti_per_impronta').on(t.impronta), index('inviti_per_azienda').on(t.aziendaId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Immagini delle ubicazioni
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le fotografie che l'intermediario allega a una singola ubicazione.
 *
 * Un capannone si descrive male a parole. La struttura portante, la copertura, la
 * distanza dal confine, l'ordine del piazzale: sono cose che un assuntore vede in due
 * secondi da una fotografia e che nessun questionario riesce a farsi raccontare. È anche
 * ciò che rende il report difendibile a distanza di anni — «così era il 20 agosto 2026».
 *
 * ## Perché una tabella a sé
 *
 * Non nel dossier: quello viene letto a **ogni** analisi, e trascinarsi dietro qualche
 * megabyte di fotografie per calcolare uno score è uno spreco che si paga a ogni
 * esecuzione.
 *
 * Non dentro l'analisi congelata: quella si riscrive intera a ogni riesecuzione, e le
 * stesse immagini finirebbero duplicate in archivio una volta per analisi.
 *
 * Qui invece si leggono **solo quando servono**, cioè quando si compone il documento.
 *
 * Il legame con l'ubicazione è la sua chiave stabile (`Ubicazione.id`, derivata
 * dall'indirizzo normalizzato) e non un identificativo di riga: le ubicazioni sono
 * **calcolate** dal profilo a ogni analisi, non righe di tabella. Se un'ubicazione sparisce
 * dalla visura, le sue immagini restano orfane invece di sparire in silenzio — ed è il
 * comportamento voluto: una fotografia scattata resta una prova di com'era.
 */
export const immaginiUbicazione = pgTable(
  'immagini_ubicazione',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Chiave stabile dell'ubicazione, non un id di riga: vedi la nota sopra. */
    ubicazioneId: text('ubicazione_id').notNull(),
    /** Cosa mostra: senza, in un report di venti pagine è una figura senza scopo. */
    didascalia: text('didascalia'),
    tipoMime: text('tipo_mime').notNull(),
    /**
     * L'immagine come data URI, come già il logo dello studio.
     *
     * Testo e non `bytea`: la stessa forma serve al browser e al report, e una colonna
     * binaria costringerebbe a una rotta che serve i byte con il proprio tipo e la propria
     * autorizzazione — superficie in più per un guadagno di un terzo di spazio.
     */
    dati: text('dati').notNull(),
    /** Dimensione del file originale, prima della codifica: è il numero da mostrare. */
    dimensioneByte: integer('dimensione_byte').notNull(),
    caricataDa: uuid('caricata_da').references(() => utenti.id),
    caricataIl: timestamp('caricata_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('immagini_per_ubicazione').on(t.aziendaId, t.ubicazioneId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Polizze
// ─────────────────────────────────────────────────────────────────────────────

export const polizze = pgTable(
  'polizze',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    copertura: text('copertura').notNull(),
    compagnia: text('compagnia').notNull(),
    compagniaId: uuid('compagnia_id').references(() => compagnie.id),
    numeroPolizza: text('numero_polizza'),
    /** Tutti gli importi in centesimi, come nel dominio: nessuna conversione implicita. */
    sommaAssicurataCentesimi: denaro('somma_assicurata_centesimi'),
    massimaleCentesimi: denaro('massimale_centesimi'),
    franchigiaCentesimi: denaro('franchigia_centesimi'),
    scoperto: numeric('scoperto', { precision: 5, scale: 4 }),
    premioAnnuoCentesimi: denaro('premio_annuo_centesimi'),
    formaGaranzia: text('forma_garanzia'),
    dataEffetto: date('data_effetto').notNull(),
    dataScadenza: date('data_scadenza').notNull(),
    /** Testo di polizza allegato: input della Policy Intelligence (fase F3). */
    documentoUrl: text('documento_url'),
    note: text('note'),
    creataIl: timestamp('creata_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('polizze_per_azienda').on(t.aziendaId),
    // Lo scadenzario è la query più frequente del gestionale di un broker.
    index('polizze_per_scadenza').on(t.tenantId, t.dataScadenza),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Compagnie e solidità
// ─────────────────────────────────────────────────────────────────────────────

export const compagnie = pgTable(
  'compagnie',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    denominazione: text('denominazione').notNull(),
    gruppo: text('gruppo'),
    /** Numero di iscrizione all'albo imprese IVASS. */
    codiceIvass: text('codice_ivass'),
    partitaIva: text('partita_iva'),
  },
  (t) => [uniqueIndex('compagnie_denominazione_unica').on(t.denominazione)],
);

/** Dati di solidità per esercizio, dalla SFCR e dalle statistiche IVASS. Condivisi fra tenant. */
export const solidita = pgTable(
  'solidita_compagnia',
  {
    compagniaId: uuid('compagnia_id')
      .notNull()
      .references(() => compagnie.id, { onDelete: 'cascade' }),
    anno: smallint('anno').notNull(),
    solvencyRatio: numeric('solvency_ratio', { precision: 6, scale: 4 }),
    quotaTier1Unrestricted: numeric('quota_tier1_unrestricted', { precision: 5, scale: 4 }),
    fondiPropriCentesimi: denaro('fondi_propri_centesimi'),
    scrCentesimi: denaro('scr_centesimi'),
    premiLordiCentesimi: denaro('premi_lordi_centesimi'),
    reclamiAnno: integer('reclami_anno'),
    ratingAgenzia: text('rating_agenzia'),
    ratingValore: text('rating_valore'),
    /** Punteggio calcolato dal motore, congelato all'atto del calcolo. */
    carrierStrengthScore: smallint('carrier_strength_score'),
    fonte: text('fonte').notNull(),
    aggiornatoIl: timestamp('aggiornato_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.compagniaId, t.anno] })],
);

// ─────────────────────────────────────────────────────────────────────────────
// Analisi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risultato di un'analisi, congelato.
 *
 * Si conservano sia il risultato sia le versioni di catalogo e regole che l'hanno
 * prodotto: senza di esse, il numero non è difendibile perché non è riproducibile.
 */
/**
 * Partecipazioni: chi possiede quale azienda del portafoglio.
 *
 * Tabella separata dall'analisi perché serve a una domanda che l'analisi non sa fare:
 * **quali mie aziende hanno lo stesso socio?** È la domanda che trasforma un elenco di
 * clienti in un gruppo, e un gruppo in un'unica esposizione: se lo stesso imprenditore
 * controlla tre società assicurate dallo stesso intermediario, un sinistro che lo tocca
 * le tocca tutte, e i massimali vanno letti insieme.
 *
 * Il codice fiscale è la chiave del collegamento: le denominazioni si scrivono in dieci
 * modi diversi, il codice fiscale no.
 */
export const partecipazioni = pgTable(
  'partecipazioni',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    socioDenominazione: text('socio_denominazione').notNull(),
    socioCodiceFiscale: text('socio_codice_fiscale'),
    socioTipo: text('socio_tipo').notNull(),
    quotaPercentuale: numeric('quota_percentuale', { precision: 6, scale: 3 }),
    /** Vero se il socio esercita il controllo: distingue la holding dal socio di minoranza. */
    diControllo: boolean('di_controllo').notNull().default(false),
    rilevataIl: timestamp('rilevata_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Il collegamento si cerca per codice fiscale dentro il proprio portafoglio.
    index('partecipazioni_per_socio').on(t.tenantId, t.socioCodiceFiscale),
    index('partecipazioni_per_azienda').on(t.aziendaId),
  ],
);

export const analisi = pgTable(
  'analisi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshotAzienda.id),
    eseguitaDa: uuid('eseguita_da').references(() => utenti.id),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),

    // Denormalizzazioni per interrogare il portafoglio senza aprire il JSON.
    scoreCredito: smallint('score_credito'),
    classeCredito: text('classe_credito'),
    fidoConsigliatoCentesimi: denaro('fido_consigliato_centesimi'),
    patrimonioEspostoCentesimi: denaro('patrimonio_esposto_centesimi'),
    esposizioneNonAssicurataCentesimi: denaro('esposizione_non_assicurata_centesimi'),
    rischiCritici: smallint('rischi_critici'),
    coperturaAssente: smallint('copertura_assente'),
    statoCatNat: statoCatNat('stato_cat_nat'),

    /** Analisi completa serializzata. */
    risultato: jsonb('risultato').notNull(),
    /**
     * Fotografia dei fatti sorvegliati al momento dell'analisi.
     *
     * Il monitoraggio confronta due di queste, non due analisi intere: sono i pochi fatti
     * che, cambiando, spostano una copertura. Conservarli qui rende il confronto
     * riproducibile anche a distanza di anni, con i dati di allora.
     */
    statoSorvegliato: jsonb('stato_sorvegliato'),

    versioneCore: text('versione_core').notNull(),
    versioneCatalogoRischi: text('versione_catalogo_rischi').notNull(),
    versioneRegole: text('versione_regole').notNull(),
    creataIl: timestamp('creata_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analisi_per_azienda').on(t.aziendaId, t.asOf),
    // Alimenta la lista di lavoro: «tutte le mie aziende non conformi CAT NAT».
    index('analisi_per_catnat').on(t.tenantId, t.statoCatNat),
    index('analisi_per_score').on(t.tenantId, t.scoreCredito),
  ],
);

/** Righe della gap analysis, estratte per poterle interrogare come lista di lavoro. */
export const gapCoperture = pgTable(
  'gap_coperture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analisiId: uuid('analisi_id')
      .notNull()
      .references(() => analisi.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    copertura: text('copertura').notNull(),
    stato: statoGap('stato').notNull(),
    priorita: smallint('priorita').notNull(),
    obbligoDiLegge: boolean('obbligo_di_legge').notNull().default(false),
    capitaleRaccomandatoCentesimi: denaro('capitale_raccomandato_centesimi'),
    capitaleInEssereCentesimi: denaro('capitale_in_essere_centesimi'),
    azione: text('azione').notNull(),
    motivazioneAdeguatezza: text('motivazione_adeguatezza').notNull(),
  },
  (t) => [
    // «Mostrami tutte le opportunità aperte, per priorità»: la query che genera fatturato.
    index('gap_lista_lavoro').on(t.tenantId, t.stato, t.priorita),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Monitoraggio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eventi di monitoraggio.
 *
 * La differenza rispetto al monitoraggio creditizio classico: qui gli eventi sono scelti
 * per il loro significato **assicurativo**. Una nuova unità locale non cambia lo score,
 * ma rende inadeguata la polizza incendio; un salto dimensionale sposta la scadenza CAT NAT.
 */
export const eventiMonitoraggio = pgTable(
  'eventi_monitoraggio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tipo: tipoEventoMonitoraggio('tipo').notNull(),
    titolo: text('titolo').notNull(),
    descrizione: text('descrizione').notNull(),
    /** Rilevanza assicurativa 1-5: ordina la coda di lavoro. */
    rilevanza: smallint('rilevanza').notNull().default(3),
    valorePrecedente: jsonb('valore_precedente'),
    valoreNuovo: jsonb('valore_nuovo'),
    /** Azione suggerita all'intermediario: è ciò che trasforma l'alert in una vendita. */
    azioneSuggerita: text('azione_suggerita'),
    rilevatoIl: timestamp('rilevato_il', { withTimezone: true }).notNull().defaultNow(),
    lettoIl: timestamp('letto_il', { withTimezone: true }),
    gestitoIl: timestamp('gestito_il', { withTimezone: true }),
    gestitoDa: uuid('gestito_da').references(() => utenti.id),
  },
  (t) => [index('eventi_da_gestire').on(t.tenantId, t.gestitoIl, t.rilevanza)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Audit e costi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registro append-only. Nessun UPDATE, nessun DELETE: da imporre con permessi di
 * database, non solo per convenzione applicativa.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    utenteId: uuid('utente_id').references(() => utenti.id),
    azione: text('azione').notNull(),
    entita: text('entita').notNull(),
    entitaId: uuid('entita_id'),
    dettagli: jsonb('dettagli'),
    indirizzoIp: text('indirizzo_ip'),
    avvenutoIl: timestamp('avvenuto_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_per_entita').on(t.entita, t.entitaId),
    index('audit_per_tenant').on(t.tenantId, t.avvenutoIl),
  ],
);

/** Costo dei dati, per chiamata. È il numero che dice se il modello di business regge. */
export const registroCostiDati = pgTable(
  'registro_costi_dati',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    aziendaId: uuid('azienda_id').references(() => aziende.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    servizio: text('servizio').notNull(),
    costoCentesimi: denaro('costo_centesimi').notNull(),
    servitoDaCache: boolean('servito_da_cache').notNull().default(false),
    avvenutoIl: timestamp('avvenuto_il', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('costi_per_tenant').on(t.tenantId, t.avvenutoIl),
    /*
      Secondo indice, sulla sola data.

      Il tetto complessivo somma la spesa di **tutti** gli studi, e lo fa prima di ogni
      operazione a pagamento. Su quella lettura l'indice per tenant non serve: comincia
      dalla colonna che la query non filtra, e il motore ripiega su una scansione
      dell'intera tabella. Il registro cresce di una riga per chiamata e non viene mai
      potato — funzionerebbe benissimo il primo mese e sempre peggio dopo.
    */
    index('costi_per_giorno').on(t.avvenutoIl),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Relazioni
// ─────────────────────────────────────────────────────────────────────────────

export const relazioniTenant = relations(tenants, ({ many }) => ({
  utenti: many(utenti),
  aziende: many(aziende),
}));

export const relazioniAzienda = relations(aziende, ({ one, many }) => ({
  tenant: one(tenants, { fields: [aziende.tenantId], references: [tenants.id] }),
  snapshot: many(snapshotAzienda),
  polizze: many(polizze),
  analisi: many(analisi),
  eventi: many(eventiMonitoraggio),
  dossier: one(dossier, { fields: [aziende.id], references: [dossier.aziendaId] }),
}));

export const relazioniAnalisi = relations(analisi, ({ one, many }) => ({
  azienda: one(aziende, { fields: [analisi.aziendaId], references: [aziende.id] }),
  snapshot: one(snapshotAzienda, { fields: [analisi.snapshotId], references: [snapshotAzienda.id] }),
  gap: many(gapCoperture),
}));

export const relazioniPolizza = relations(polizze, ({ one }) => ({
  azienda: one(aziende, { fields: [polizze.aziendaId], references: [aziende.id] }),
  compagnia: one(compagnie, { fields: [polizze.compagniaId], references: [compagnie.id] }),
}));
