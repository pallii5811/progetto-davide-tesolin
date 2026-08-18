/**
 * Client HTTP per provider a consumo.
 *
 * Tre preoccupazioni, tutte economiche prima che tecniche:
 *  - **cache a TTL differenziato per volatilità del dato**: un bilancio depositato non
 *    cambia per mesi, un protesto sì. Un TTL unico o è troppo corto (si paga due volte
 *    lo stesso dato) o è troppo lungo (si decide su dati vecchi);
 *  - **retry solo su errori ritentabili**: ritentare un 404 significa pagare due volte
 *    per non trovare nulla;
 *  - **cost ledger**: ogni chiamata registra costo e destinatario, così il margine per
 *    cliente è misurabile dal primo giorno e non a consuntivo di fine anno.
 */

import { ProviderError } from './port.js';
import type { CostEvent } from './port.js';

export interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

export interface Cache {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
}

/** Cache in memoria con sfratto dei più vecchi. In produzione si sostituisce con Redis. */
export class MemoryCache implements Cache {
  readonly #entries = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries = 5_000) {}

  get(key: string): CacheEntry | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, entry);
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }
}

export interface CostLedger {
  record(event: CostEvent): void;
}

/** Registro dei costi in memoria, con aggregazioni pronte per il pannello di controllo. */
export class MemoryCostLedger implements CostLedger {
  readonly #events: CostEvent[] = [];

  record(event: CostEvent): void {
    this.#events.push(event);
  }

  get events(): readonly CostEvent[] {
    return this.#events;
  }

  /** Costo complessivo in centesimi, escluse le risposte servite dalla cache. */
  totaleCentesimi(): number {
    return this.#events.reduce((sum, e) => (e.cacheHit ? sum : sum + e.costoStimatoCentesimi), 0);
  }

  /** Risparmio prodotto dalla cache: è il numero che giustifica l'esistenza della cache. */
  risparmioCentesimi(): number {
    return this.#events.reduce((sum, e) => (e.cacheHit ? sum + e.costoStimatoCentesimi : sum), 0);
  }

  perServizio(): ReadonlyMap<string, { chiamate: number; costoCentesimi: number }> {
    const aggregato = new Map<string, { chiamate: number; costoCentesimi: number }>();
    for (const event of this.#events) {
      const chiave = `${event.provider}/${event.service}`;
      const corrente = aggregato.get(chiave) ?? { chiamate: 0, costoCentesimi: 0 };
      aggregato.set(chiave, {
        chiamate: corrente.chiamate + 1,
        costoCentesimi: corrente.costoCentesimi + (event.cacheHit ? 0 : event.costoStimatoCentesimi),
      });
    }
    return aggregato;
  }
}

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly provider: string;
  readonly cache?: Cache | undefined;
  readonly ledger?: CostLedger | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export interface RequestOptions {
  /** Nome del servizio, per cache, log e imputazione del costo. */
  readonly service: string;
  readonly path: string;
  readonly query?: Record<string, string | number | undefined> | undefined;
  readonly method?: 'GET' | 'POST' | undefined;
  readonly body?: unknown;
  /** Durata della cache in secondi. `0` disattiva la cache per questa chiamata. */
  readonly cacheTtlSeconds: number;
  /** Costo stimato della chiamata, in centesimi di euro. */
  readonly costoCentesimi: number;
  /**
   * Costo **effettivo**, letto dalla risposta.
   *
   * Alcuni servizi si pagano a record e dichiarano nella risposta quanto è costata la
   * chiamata. Registrare la stima fatta prima significherebbe scrivere nel registro un
   * numero che non corrisponde all'addebito: chiedendo un lotto di venticinque aziende e
   * ricevendone tre si pagano tre, non venticinque.
   *
   * Restituire `null` lascia in vigore la stima.
   */
  readonly costoDallaRisposta?: ((payload: unknown) => number | null) | undefined;
}

/**
 * Opzioni risolte, con tutti i default applicati.
 * Scritta a mano e non derivata con `Required<>`: con `exactOptionalPropertyTypes` attivo,
 * `Required<>` toglie il `?` ma lascia `| undefined` nel tipo, e i default diventano invisibili
 * al compilatore.
 */
interface ResolvedHttpOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly provider: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly cache: Cache | undefined;
  readonly ledger: CostLedger | undefined;
  readonly fetchImpl: typeof fetch;
}

export class HttpProviderClient {
  readonly #options: ResolvedHttpOptions;

  constructor(options: HttpClientOptions) {
    this.#options = {
      baseUrl: options.baseUrl.replace(/\/$/, ''),
      token: options.token,
      provider: options.provider,
      timeoutMs: options.timeoutMs ?? 20_000,
      maxRetries: options.maxRetries ?? 2,
      cache: options.cache,
      ledger: options.ledger,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
    };
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.#buildUrl(options);
    const cacheKey = `${options.method ?? 'GET'} ${url}`;

    if (options.cacheTtlSeconds > 0) {
      const cached = this.#options.cache?.get(cacheKey);
      if (cached !== undefined) {
        this.#record(options, true);
        return cached.value as T;
      }
    }

    const payload = await this.#requestWithRetry<T>(url, options);

    if (options.cacheTtlSeconds > 0) {
      this.#options.cache?.set(cacheKey, {
        value: payload,
        expiresAt: Date.now() + options.cacheTtlSeconds * 1_000,
      });
    }
    this.#record(options, false, options.costoDallaRisposta?.(payload) ?? null);
    return payload;
  }

  /**
   * Avvia una pratica asincrona e ne attende l'esito.
   *
   * Il costo viene addebitato una sola volta, all'apertura. Se l'attesa scade la pratica
   * **non** viene riaperta: si restituisce l'identificativo perché la lettura possa
   * riprendere gratuitamente in un momento successivo.
   */
  async requestAsync(options: AsyncRequestOptions): Promise<AsyncOutcome> {
    const avvio = await this.request<unknown>({
      service: options.service,
      path: options.startPath,
      method: 'POST',
      body: options.body,
      // L'apertura di una pratica non si mette in cache: sarebbe una risposta interlocutoria.
      cacheTtlSeconds: 0,
      costoCentesimi: options.costoCentesimi,
    });

    const richiestaId = estraiId(avvio);
    if (richiestaId === null) {
      return { stato: 'fallita', richiestaId: null, payload: avvio };
    }

    const scadenza = Date.now() + (options.timeoutMs ?? 45_000);

    for (const attesa of ATTESE_POLLING) {
      if (Date.now() + attesa > scadenza) break;
      await pausa(attesa);

      // Le letture di stato sono gratuite: costo zero nel registro.
      const stato = await this.request<unknown>({
        service: `${options.service}/stato`,
        path: options.statusPath.replace('{id}', encodeURIComponent(richiestaId)),
        cacheTtlSeconds: 0,
        costoCentesimi: 0,
      });

      const descrizione = estraiStato(stato);
      if (descrizione === 'completata') {
        return { stato: 'completata', richiestaId, payload: stato };
      }
      if (descrizione === 'fallita') {
        return { stato: 'fallita', richiestaId, payload: stato };
      }
    }

    return { stato: 'in-corso', richiestaId, payload: null };
  }

  async #requestWithRetry<T>(url: string, options: RequestOptions): Promise<T> {
    let ultimoErrore: ProviderError | null = null;

    for (let tentativo = 0; tentativo <= this.#options.maxRetries; tentativo++) {
      try {
        return await this.#executeRequest<T>(url, options);
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError(descriviErrore(error), 'temporaneo', undefined, { cause: error });

        // Ritentare un 404 o un 401 significa pagare due volte per lo stesso esito.
        if (!providerError.ritentabile || tentativo === this.#options.maxRetries) {
          throw providerError;
        }
        ultimoErrore = providerError;
        await attesa(backoffMs(tentativo));
      }
    }

    throw ultimoErrore ?? new ProviderError('Richiesta fallita', 'sconosciuto');
  }

  async #executeRequest<T>(url: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.#options.timeoutMs);

    try {
      const response = await this.#options.fetchImpl(url, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.#options.token}`,
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderError(
          `${this.#options.provider} · ${options.service}: HTTP ${response.status}`,
          classificaStatus(response.status),
          response.status,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  #buildUrl(options: RequestOptions): string {
    const url = new URL(`${this.#options.baseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  #record(options: RequestOptions, cacheHit: boolean, costoEffettivo: number | null = null): void {
    this.#options.ledger?.record({
      provider: this.#options.provider,
      service: options.service,
      costoStimatoCentesimi: costoEffettivo ?? options.costoCentesimi,
      cacheHit,
      timestamp: new Date(),
      riferimento: null,
    });
  }
}

/**
 * Servizi asincroni.
 *
 * Alcuni servizi non rispondono subito: il POST apre una pratica e restituisce un
 * identificativo, il risultato si legge dopo. Il modello di costo è asimmetrico —
 * **si paga l'avvio, non le verifiche di stato** — e questo determina la strategia:
 * attese crescenti, mai un ciclo stretto, e nessuna nuova apertura in caso di attesa
 * scaduta. Riaprire una pratica già pagata significa pagarla due volte.
 */
export interface AsyncRequestOptions {
  readonly service: string;
  /** Percorso di avvio della pratica. */
  readonly startPath: string;
  readonly body: unknown;
  /** Percorso di lettura dello stato, con `{id}` come segnaposto. */
  readonly statusPath: string;
  readonly costoCentesimi: number;
  readonly cacheTtlSeconds: number;
  /** Tempo massimo di attesa complessivo, in millisecondi. */
  readonly timeoutMs?: number | undefined;
}

export interface AsyncOutcome {
  readonly stato: 'completata' | 'in-corso' | 'fallita';
  /** Identificativo della pratica: consente di riprendere la lettura senza ripagare. */
  readonly richiestaId: string | null;
  readonly payload: unknown;
}

/** Attese crescenti fra un controllo e l'altro, in millisecondi. */
export const ATTESE_POLLING = [1_500, 2_500, 4_000, 6_000, 10_000, 15_000] as const;

function classificaStatus(status: number): ProviderError['kind'] {
  if (status === 404) return 'non-trovato';
  if (status === 401 || status === 403) return 'autenticazione';
  if (status === 429) return 'quota';
  if (status >= 500) return 'temporaneo';
  return 'sconosciuto';
}

function backoffMs(tentativo: number): number {
  // Backoff esponenziale con jitter, per non sincronizzare i retry di più worker.
  const base = 300 * 2 ** tentativo;
  return base + Math.floor(Math.random() * 200);
}

function attesa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function descriviErrore(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Errore sconosciuto nella chiamata al provider';
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contenutoDi(risposta: unknown): Record<string, unknown> {
  if (typeof risposta !== 'object' || risposta === null) return {};
  const involucro = risposta as Record<string, unknown>;
  const dati: unknown = involucro['data'] ?? involucro['result'] ?? involucro;

  if (Array.isArray(dati)) {
    const primo: unknown = dati[0];
    return typeof primo === 'object' && primo !== null ? (primo as Record<string, unknown>) : {};
  }
  return typeof dati === 'object' ? (dati as Record<string, unknown>) : {};
}

function estraiId(risposta: unknown): string | null {
  const dati = contenutoDi(risposta);
  for (const chiave of ['id', '_id', 'requestId', 'request_id']) {
    const valore = dati[chiave];
    if (typeof valore === 'string' && valore !== '') return valore;
  }
  return null;
}

/** Normalizza le molte forme in cui i provider esprimono lo stato di una pratica. */
function estraiStato(risposta: unknown): 'completata' | 'in-corso' | 'fallita' {
  const dati = contenutoDi(risposta);
  const valore = [dati['state'], dati['stato'], dati['status']].find((v) => typeof v === 'string');
  const grezzo = (valore ?? '').toUpperCase();

  if (['DONE', 'COMPLETED', 'COMPLETE', 'OK', 'SUCCESS'].includes(grezzo)) return 'completata';
  if (['ERROR', 'FAILED', 'KO', 'REJECTED', 'NOT_FOUND'].includes(grezzo)) return 'fallita';
  return 'in-corso';
}
