/**
 * Connessione al database.
 *
 * Due driver, **un solo schema e un solo dialetto SQL**:
 *
 *  - in produzione, PostgreSQL vero via `postgres.js`;
 *  - in sviluppo, **PGlite** — PostgreSQL compilato in WebAssembly, che gira nel processo
 *    Node senza Docker, senza servizi da avviare, senza porte da liberare.
 *
 * La scelta non è una comodità: è ciò che consente di far girare la piattaforma completa
 * su qualunque macchina con `npm install`. Un software che per essere visto richiede prima
 * di installare Docker e configurare un database non viene visto — e il progetto muore nella
 * cartella dei buoni propositi. Il dialetto è lo stesso, quindi ciò che funziona in sviluppo
 * funziona in produzione: non è un finto database, è Postgres.
 */

import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import * as schema from './schema.js';

/**
 * Tipo comune ai due driver.
 *
 * `PgDatabase` è la sopraclasse che entrambi estendono: i repository si scrivono una
 * volta sola e non sanno su quale motore stanno girando. È la stessa ragione per cui il
 * dominio non conosce il database.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface ConnessioneOptions {
  /**
   * URL di connessione. Se assente si usa PGlite.
   * Formato: `postgresql://utente:password@host:porta/database`
   */
  readonly url?: string | undefined;
  /**
   * Cartella di persistenza per PGlite. Se assente il database vive in memoria
   * e si azzera alla chiusura del processo — utile nei test, mai altrove.
   */
  readonly cartellaDati?: string | undefined;
  readonly log?: boolean | undefined;
}

export interface Connessione {
  readonly db: Database;
  readonly tipo: 'postgres' | 'pglite';
  readonly descrizione: string;
  chiudi(): Promise<void>;
}

export async function connetti(options: ConnessioneOptions = {}): Promise<Connessione> {
  const url = options.url?.trim() ?? '';

  if (url !== '') {
    const { default: postgres } = await import('postgres');
    const client = postgres(url, { max: 10, onnotice: () => undefined });
    return {
      db: drizzlePostgres(client, { schema, logger: options.log ?? false }),
      tipo: 'postgres',
      descrizione: `PostgreSQL · ${mascheraCredenziali(url)}`,
      chiudi: async () => {
        await client.end();
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');

  // Un archivio su disco appartiene a un processo solo.
  const rilascia = options.cartellaDati === undefined ? null : occupaArchivio(options.cartellaDati);

  try {
    const client = options.cartellaDati === undefined ? new PGlite() : new PGlite(options.cartellaDati);
    await client.waitReady;

    return {
      db: drizzlePglite(client, { schema, logger: options.log ?? false }),
      tipo: 'pglite',
      descrizione:
        options.cartellaDati === undefined
          ? 'PGlite in memoria (i dati non sopravvivono alla chiusura)'
          : `PGlite su disco · ${options.cartellaDati}`,
      chiudi: async () => {
        await client.close();
        rilascia?.();
      },
    };
  } catch (errore) {
    rilascia?.();
    throw errore;
  }
}

/**
 * Presidio contro la doppia apertura dello stesso archivio.
 *
 * PGlite è un Postgres **dentro il processo**: due processi che aprono la stessa cartella
 * scrivono sugli stessi file senza sapere l'uno dell'altro. Non è teoria — è già successo:
 * un avvio fallito per porta occupata, un riavvio sovrapposto, e l'archivio è diventato
 * illeggibile con un laconico «Error: Aborted()», portandosi via il lavoro dentro.
 *
 * Il presidio è un file con dentro il PID. Alla riapertura si guarda se quel processo è
 * ancora vivo: se lo è, ci si ferma **prima** di toccare i dati, dicendo chi occupa la
 * cartella; se non lo è, il file è un residuo di una chiusura brusca e si può rimuovere.
 * Perdere un avvio è un fastidio di secondi, perdere l'archivio è un'altra cosa.
 */
function occupaArchivio(cartella: string): () => void {
  const lock = joinPath(cartella, 'aegis-in-uso.pid');

  if (existsSync(lock)) {
    const pid = Number.parseInt(readFileSync(lock, 'utf8').trim(), 10);

    // Il presidio viene rimosso alla chiusura: se porta il nostro stesso PID, la
    // connessione precedente è ancora aperta qui dentro — due istanze PGlite nello
    // stesso processo si contendono i file esattamente come due processi distinti.
    if (Number.isInteger(pid) && pid === process.pid) {
      throw new Error(
        `L'archivio ${cartella} è già aperto da questo stesso processo. ` +
          'Riusare la connessione esistente, oppure chiuderla con `chiudi()` prima di riaprirla.',
      );
    }

    if (Number.isInteger(pid) && processoVivo(pid)) {
      throw new Error(
        `L'archivio ${cartella} è già aperto dal processo ${pid}. ` +
          'Due processi sullo stesso archivio PGlite lo corrompono: chiudere quello attivo ' +
          '(oppure avviare questo con una cartella dati diversa) e riprovare.',
      );
    }

    // Residuo di un processo morto: nessuno lo tiene, si riprende la cartella.
    rmSync(lock, { force: true });
  }

  mkdirSync(cartella, { recursive: true });
  writeFileSync(lock, String(process.pid), 'utf8');

  let rilasciato = false;
  return () => {
    if (rilasciato) return;
    rilasciato = true;
    // Solo se è ancora il nostro: un altro processo potrebbe averlo legittimamente ripreso.
    try {
      if (existsSync(lock) && readFileSync(lock, 'utf8').trim() === String(process.pid)) {
        rmSync(lock, { force: true });
      }
    } catch {
      // Il rilascio del presidio non deve mai impedire una chiusura pulita.
    }
  };
}

/** `kill(pid, 0)` non invia nulla: verifica soltanto che il processo esista. */
function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (errore) {
    // `EPERM` significa esistente ma di un altro utente: vivo a tutti gli effetti.
    return (errore as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** L'URL di connessione contiene la password: non deve mai finire nei log. */
function mascheraCredenziali(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

/**
 * Applica lo schema.
 *
 * Su PGlite si crea l'intero schema all'avvio: il database nasce vuoto ogni volta o
 * riprende da disco, e in entrambi i casi `IF NOT EXISTS` rende l'operazione idempotente.
 * Su PostgreSQL in produzione si usano invece le migrazioni versionate di drizzle-kit:
 * creare tabelle a runtime su un database con dati reali è una pratica da evitare.
 */
export async function applicaSchema(connessione: Connessione): Promise<void> {
  if (connessione.tipo === 'postgres') {
    throw new Error(
      'Su PostgreSQL usare le migrazioni versionate (`npm run migra`), non la creazione a runtime.',
    );
  }
  for (const comando of DDL) {
    await connessione.db.execute(sql.raw(comando));
  }
}

/**
 * DDL completo, allineato a `schema.ts`.
 *
 * Tenuto in questo file e non generato a runtime dallo schema Drizzle perché il DDL è la
 * verità del database: deve essere leggibile, revisionabile e diffabile in una code review.
 */
const DDL: readonly string[] = [
  `CREATE TYPE ruolo_utente AS ENUM ('amministratore','broker','assistente','sola-lettura')`,
  `CREATE TYPE livello_acquisizione AS ENUM ('base','esteso','completo')`,
  `CREATE TYPE stato_gap AS ENUM ('assente','sottoassicurata','massimale-insufficiente','in-scadenza','adeguata','da-quantificare')`,
  `CREATE TYPE stato_cat_nat AS ENUM ('non-soggetta','in-scadenza','inadempiente','adempiente')`,
  `CREATE TYPE tipo_evento_monitoraggio AS ENUM ('anagrafica-variata','nuova-sede','ateco-variato','salto-dimensionale','bilancio-depositato','evento-negativo','procedura-aperta','score-variato','polizza-in-scadenza','obbligo-normativo')`,

  `CREATE TABLE IF NOT EXISTS tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    denominazione text NOT NULL,
    numero_rui text,
    partita_iva text,
    indirizzo text,
    email text,
    telefono text,
    logo text,
    budget_dati_mensile_centesimi bigint,
    gestore_piattaforma boolean NOT NULL DEFAULT false,
    creato_il timestamptz NOT NULL DEFAULT now(),
    attivo boolean NOT NULL DEFAULT true
  )`,

  `CREATE TABLE IF NOT EXISTS utenti (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email text NOT NULL,
    nome text NOT NULL,
    password_hash text,
    ruolo ruolo_utente NOT NULL DEFAULT 'broker',
    creato_il timestamptz NOT NULL DEFAULT now(),
    ultimo_accesso timestamptz,
    tentativi_falliti integer NOT NULL DEFAULT 0,
    bloccato_fino_a timestamptz,
    attivo boolean NOT NULL DEFAULT true
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS utenti_email_unica ON utenti (email)`,
  `CREATE INDEX IF NOT EXISTS utenti_per_tenant ON utenti (tenant_id)`,

  `CREATE TABLE IF NOT EXISTS sessioni (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id uuid NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    impronta_token text NOT NULL,
    creata_il timestamptz NOT NULL DEFAULT now(),
    scade_il timestamptz NOT NULL,
    ultimo_utilizzo timestamptz NOT NULL DEFAULT now(),
    indirizzo_ip text,
    user_agent text,
    revocata_il timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessioni_impronta_unica ON sessioni (impronta_token)`,
  `CREATE INDEX IF NOT EXISTS sessioni_per_utente ON sessioni (utente_id)`,

  `CREATE TABLE IF NOT EXISTS aziende (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    partita_iva text,
    codice_fiscale text,
    denominazione text NOT NULL,
    provider_id text,
    provincia text,
    ateco_primario text,
    is_cliente boolean NOT NULL DEFAULT false,
    creata_il timestamptz NOT NULL DEFAULT now(),
    aggiornata_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS aziende_piva_per_tenant ON aziende (tenant_id, partita_iva)`,
  `CREATE INDEX IF NOT EXISTS aziende_per_denominazione ON aziende (tenant_id, denominazione)`,

  `CREATE TABLE IF NOT EXISTS snapshot_azienda (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider text NOT NULL,
    livello livello_acquisizione NOT NULL,
    profilo jsonb NOT NULL,
    risposta_grezza jsonb,
    osservato_il timestamptz NOT NULL,
    acquisito_il timestamptz NOT NULL DEFAULT now(),
    costo_centesimi bigint NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS snapshot_per_azienda ON snapshot_azienda (azienda_id, osservato_il)`,

  `CREATE TABLE IF NOT EXISTS dossier (
    azienda_id uuid PRIMARY KEY REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dati_dichiarati jsonb NOT NULL DEFAULT '{}'::jsonb,
    completezza numeric(5,4),
    aggiornato_da uuid REFERENCES utenti(id),
    aggiornato_il timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS immagini_ubicazione (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ubicazione_id text NOT NULL,
    didascalia text,
    tipo_mime text NOT NULL,
    dati text NOT NULL,
    dimensione_byte integer NOT NULL,
    caricata_da uuid REFERENCES utenti(id),
    caricata_il timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS immagini_per_ubicazione ON immagini_ubicazione (azienda_id, ubicazione_id)`,

  `CREATE TABLE IF NOT EXISTS compagnie (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    denominazione text NOT NULL,
    gruppo text,
    codice_ivass text,
    partita_iva text
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS compagnie_denominazione_unica ON compagnie (denominazione)`,

  `CREATE TABLE IF NOT EXISTS solidita_compagnia (
    compagnia_id uuid NOT NULL REFERENCES compagnie(id) ON DELETE CASCADE,
    anno smallint NOT NULL,
    solvency_ratio numeric(6,4),
    quota_tier1_unrestricted numeric(5,4),
    fondi_propri_centesimi bigint,
    scr_centesimi bigint,
    premi_lordi_centesimi bigint,
    reclami_anno integer,
    rating_agenzia text,
    rating_valore text,
    carrier_strength_score smallint,
    fonte text NOT NULL,
    aggiornato_il timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (compagnia_id, anno)
  )`,

  `CREATE TABLE IF NOT EXISTS polizze (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    copertura text NOT NULL,
    compagnia text NOT NULL,
    compagnia_id uuid REFERENCES compagnie(id),
    numero_polizza text,
    somma_assicurata_centesimi bigint,
    massimale_centesimi bigint,
    franchigia_centesimi bigint,
    scoperto numeric(5,4),
    premio_annuo_centesimi bigint,
    forma_garanzia text,
    data_effetto date NOT NULL,
    data_scadenza date NOT NULL,
    documento_url text,
    note text,
    creata_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS polizze_per_azienda ON polizze (azienda_id)`,
  `CREATE INDEX IF NOT EXISTS polizze_per_scadenza ON polizze (tenant_id, data_scadenza)`,

  `CREATE TABLE IF NOT EXISTS partecipazioni (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    socio_denominazione text NOT NULL,
    socio_codice_fiscale text,
    socio_tipo text NOT NULL,
    quota_percentuale numeric(6,3),
    di_controllo boolean NOT NULL DEFAULT false,
    rilevata_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS partecipazioni_per_socio ON partecipazioni (tenant_id, socio_codice_fiscale)`,
  `CREATE INDEX IF NOT EXISTS partecipazioni_per_azienda ON partecipazioni (azienda_id)`,

  `CREATE TABLE IF NOT EXISTS analisi (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    snapshot_id uuid NOT NULL REFERENCES snapshot_azienda(id),
    eseguita_da uuid REFERENCES utenti(id),
    as_of timestamptz NOT NULL,
    score_credito smallint,
    classe_credito text,
    fido_consigliato_centesimi bigint,
    patrimonio_esposto_centesimi bigint,
    esposizione_non_assicurata_centesimi bigint,
    rischi_critici smallint,
    copertura_assente smallint,
    stato_cat_nat stato_cat_nat,
    risultato jsonb NOT NULL,
    stato_sorvegliato jsonb,
    versione_core text NOT NULL,
    versione_catalogo_rischi text NOT NULL,
    versione_regole text NOT NULL,
    creata_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS analisi_per_azienda ON analisi (azienda_id, as_of)`,
  `CREATE INDEX IF NOT EXISTS analisi_per_catnat ON analisi (tenant_id, stato_cat_nat)`,
  `CREATE INDEX IF NOT EXISTS analisi_per_score ON analisi (tenant_id, score_credito)`,

  `CREATE TABLE IF NOT EXISTS gap_coperture (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    analisi_id uuid NOT NULL REFERENCES analisi(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    copertura text NOT NULL,
    stato stato_gap NOT NULL,
    priorita smallint NOT NULL,
    obbligo_di_legge boolean NOT NULL DEFAULT false,
    capitale_raccomandato_centesimi bigint,
    capitale_in_essere_centesimi bigint,
    azione text NOT NULL,
    motivazione_adeguatezza text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS gap_lista_lavoro ON gap_coperture (tenant_id, stato, priorita)`,

  `CREATE TABLE IF NOT EXISTS eventi_monitoraggio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    azienda_id uuid NOT NULL REFERENCES aziende(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tipo tipo_evento_monitoraggio NOT NULL,
    titolo text NOT NULL,
    descrizione text NOT NULL,
    rilevanza smallint NOT NULL DEFAULT 3,
    valore_precedente jsonb,
    valore_nuovo jsonb,
    azione_suggerita text,
    rilevato_il timestamptz NOT NULL DEFAULT now(),
    letto_il timestamptz,
    gestito_il timestamptz,
    gestito_da uuid REFERENCES utenti(id)
  )`,
  `CREATE INDEX IF NOT EXISTS eventi_da_gestire ON eventi_monitoraggio (tenant_id, gestito_il, rilevanza)`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id),
    utente_id uuid REFERENCES utenti(id),
    azione text NOT NULL,
    entita text NOT NULL,
    entita_id uuid,
    dettagli jsonb,
    indirizzo_ip text,
    avvenuto_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS audit_per_entita ON audit_log (entita, entita_id)`,
  `CREATE INDEX IF NOT EXISTS audit_per_tenant ON audit_log (tenant_id, avvenuto_il)`,

  `CREATE TABLE IF NOT EXISTS registro_costi_dati (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    azienda_id uuid REFERENCES aziende(id) ON DELETE SET NULL,
    provider text NOT NULL,
    servizio text NOT NULL,
    costo_centesimi bigint NOT NULL,
    servito_da_cache boolean NOT NULL DEFAULT false,
    avvenuto_il timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS costi_per_tenant ON registro_costi_dati (tenant_id, avvenuto_il)`,
  // Il tetto complessivo somma tutti gli studi: senza indice sulla sola data quella
  // lettura scansiona un registro che cresce di una riga per chiamata e non si pota mai.
  `CREATE INDEX IF NOT EXISTS costi_per_giorno ON registro_costi_dati (avvenuto_il)`,
];

/**
 * Adeguamenti su archivi già esistenti.
 *
 * `CREATE TABLE IF NOT EXISTS` non tocca una tabella che c'è già. Un archivio creato con
 * una versione precedente resta quindi indietro due volte: gli mancano le colonne
 * aggiunte dopo, e conserva i tipi di allora. Entrambe le cose si manifestano come guasti
 * incomprensibili in scrittura — «column does not exist», «value out of range» — a un
 * utente che non ha fatto nulla di sbagliato.
 *
 * Gli adeguamenti sono **ricavati leggendo il DDL**, non elencati a mano: una seconda
 * lista scritta a parte diverge al primo campo aggiunto, e a divergere sarebbe proprio
 * l'adeguamento che serve.
 *
 * Restano fuori le colonne `NOT NULL` senza valore predefinito: aggiungerle a una tabella
 * che ha già righe è una decisione — quale valore dare a ciò che esiste? — e le decisioni
 * si prendono in una migrazione versionata, non in un adeguamento automatico.
 */
export const ADEGUAMENTI: readonly string[] = DDL.flatMap((comando) => {
  const tabella = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(comando)?.[1];
  if (tabella === undefined) return [];

  const adeguamenti: string[] = [];

  // Colonne mancanti, nella forma dichiarata dal DDL.
  for (const riga of comando.split('\n')) {
    const definizione =
      /^\s{4}(\w+) ((?:timestamptz|jsonb|text|bigint|integer|smallint|boolean|numeric|uuid|date)[^,]*),?\s*$/.exec(
        riga,
      );
    if (definizione === null) continue;

    const [, nome, tipo] = definizione;
    if (nome === undefined || tipo === undefined) continue;
    if (/NOT NULL/i.test(tipo) && !/DEFAULT/i.test(tipo)) continue;
    if (/REFERENCES|PRIMARY KEY|UNIQUE/i.test(tipo)) continue;

    adeguamenti.push(`ALTER TABLE ${tabella} ADD COLUMN IF NOT EXISTS ${nome} ${tipo.trim()}`);
  }

  // Denaro a `bigint`: la conversione è **allargante**, nessun valore può perdersi.
  for (const colonna of comando.matchAll(/^\s*(\w+_centesimi) bigint/gm)) {
    adeguamenti.push(`ALTER TABLE ${tabella} ALTER COLUMN ${colonna[1]} TYPE bigint`);
  }

  return adeguamenti;
});

/**
 * I tipi enum non supportano `IF NOT EXISTS` prima di PostgreSQL 17: si ignora il duplicato.
 * Allo stesso modo si ignorano gli adeguamenti su tabelle o colonne non ancora esistenti,
 * che su un archivio appena creato sono già nella forma giusta.
 */
export async function applicaSchemaTollerante(connessione: Connessione): Promise<void> {
  for (const comando of DDL) {
    try {
      await connessione.db.execute(sql.raw(comando));
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      if (!messaggio.includes('already exists')) throw errore;
    }
  }

  for (const comando of ADEGUAMENTI) {
    try {
      await connessione.db.execute(sql.raw(comando));
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      if (!messaggio.includes('does not exist')) throw errore;
    }
  }
}
