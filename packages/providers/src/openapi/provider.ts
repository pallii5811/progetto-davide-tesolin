/**
 * Provider OpenAPI.com.
 *
 * Acquisizione **a livelli**: si parte dal servizio più economico e si sale solo se
 * l'analisi lo richiede. Le chiamate di uno stesso livello partono in parallelo, ma il
 * fallimento di una sezione accessoria non fa cadere l'intero profilo: meglio un'analisi
 * con gli eventi negativi mancanti e dichiarati tali, che nessuna analisi.
 */

import { DATI_DICHIARATI_VUOTI, parsePartitaIva } from '@aegis/core';
import type { Bilancio, CompanyProfile, EventiNegativi, PartitaIva, Sourced } from '@aegis/core';
import { HttpProviderClient } from '../http.js';
import type { Cache, CostLedger } from '../http.js';
import { ProviderError } from '../port.js';
import type {
  CompanyDataProvider,
  CompanySearchResult,
  CriteriProspezione,
  FetchLevel,
  RisultatoProspezione,
  SearchCriteria,
} from '../port.js';
import { OPENAPI_DEFAULT_CONFIG, baseUrlPer, baseUrlRischioPer } from './config.js';
import type { AmbienteOpenApi, OpenApiConfig, ServiceConfig } from './config.js';
import {
  atecoDi,
  mappaAnagrafica,
  mappaAssetti,
  mappaBilanciSintetici,
  mappaBilancio,
  normalizzaStatoAttivita,
  sedeDi,
} from './mapper.js';
import { mappaNegativita } from './negativita.js';
import { asArray, bool, num, partitaIvaOf, pick, str } from './parse.js';

/**
 * Quante aziende si scaricano per volta, se non è chiesto altrimenti.
 *
 * Il prezzo della ricerca è **a record**: un elenco senza limite su una provincia intera
 * costerebbe centinaia di euro. Il valore predefinito è quindi deliberatamente piccolo, e
 * il preventivo esatto viene mostrato prima di ogni scarico.
 */
const LOTTO_PREDEFINITO = 25;

/**
 * Livello di arricchimento dei risultati.
 *
 * Senza, il servizio restituisce **solo gli identificativi interni**: nessuna
 * denominazione, nessuna partita IVA, nessun indirizzo. Costa un centesimo e non serve a
 * niente. Con `start` costa cinque centesimi ad azienda e restituisce l'anagrafica
 * minima, che è il minimo per decidere se quell'impresa interessa.
 */
const ARRICCHIMENTO = 'start';

/** Cinque centesimi ad azienda: verificato sul servizio reale. */
function costoLotto(record: number): number {
  return record * 5;
}

export interface OpenApiProviderOptions {
  readonly token: string;
  /**
   * Ambiente. Il sandbox richiede un token proprio, emesso separatamente dalla console:
   * usare quello di produzione su `test.company.openapi.com` restituisce 401.
   */
  readonly ambiente?: AmbienteOpenApi | undefined;
  readonly config?: OpenApiConfig | undefined;
  readonly cache?: Cache | undefined;
  readonly ledger?: CostLedger | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  /** Orologio iniettabile: rende deterministici i test sulla freschezza dei dati. */
  readonly now?: (() => Date) | undefined;
}

export class OpenApiProvider implements CompanyDataProvider {
  readonly name = 'OpenAPI.com';

  readonly #config: OpenApiConfig;
  readonly #company: HttpProviderClient;
  /** Dominio distinto per i servizi di rischio, con scope di token proprio. */
  readonly #risk: HttpProviderClient;
  readonly #now: () => Date;

  constructor(options: OpenApiProviderOptions) {
    if (options.token.trim() === '') {
      throw new ProviderError('Token OpenAPI.com mancante', 'autenticazione');
    }
    this.#config = options.config ?? OPENAPI_DEFAULT_CONFIG;
    this.#now = options.now ?? ((): Date => new Date());
    this.#company = new HttpProviderClient({
      baseUrl: options.ambiente === undefined ? this.#config.baseUrlCompany : baseUrlPer(options.ambiente),
      token: options.token,
      provider: this.name,
      cache: options.cache,
      ledger: options.ledger,
      fetchImpl: options.fetchImpl,
    });
    this.#risk = new HttpProviderClient({
      baseUrl:
        options.ambiente === undefined ? this.#config.baseUrlRisk : baseUrlRischioPer(options.ambiente),
      token: options.token,
      provider: this.name,
      cache: options.cache,
      ledger: options.ledger,
      fetchImpl: options.fetchImpl,
    });
  }

  async search(criteria: SearchCriteria): Promise<readonly CompanySearchResult[]> {
    const service = this.#config.services.ricerca;

    // Una P.IVA valida rende inutile la ricerca testuale: si va diretti all'anagrafica,
    // che restituisce il dato esatto invece di un elenco di candidati.
    //
    // E si acquista **l'anagrafica estesa**, non quella minima: allo stesso prezzo —
    // dieci centesimi entrambe — IT-advanced contiene tutto ciò che contiene IT-start,
    // più ATECO, addetti e bilanci sintetici. Poiché la cache è indicizzata sull'URL,
    // l'analisi che segue trova la risposta già pagata e non spende una seconda volta:
    // cercare e poi analizzare costa dieci centesimi in tutto, non venti.
    const piva = criteria.partitaIva === undefined ? null : parsePartitaIva(criteria.partitaIva);
    if (piva !== null) {
      const raw = await this.#get(this.#config.services.anagraficaEstesa, piva);
      return [this.#toSearchResult(this.#unwrap(raw), piva)];
    }

    const raw = await this.#company.request<unknown>({
      service: 'ricerca',
      path: service.path,
      query: {
        denominazione: criteria.denominazione,
        provincia: criteria.provincia,
        atecoCode: criteria.ateco,
        limit: criteria.limit ?? 20,
      },
      cacheTtlSeconds: service.ttlSeconds,
      costoCentesimi: service.costoCentesimi,
    });

    const elementi = asArray(pick(raw, 'data', 'result', 'items') ?? raw);
    return elementi.map((item) => this.#toSearchResult(item, partitaIvaOf(item, 'vatCode', 'partitaIva')));
  }

  /**
   * Ricerca di prospect su `/IT-search`.
   *
   * Due modalità con lo stesso identico filtro, e questo è il punto: la modalità di solo
   * conteggio (`dryRun`) risponde **quante** aziende corrispondono e quanto costerebbe
   * scaricarle, senza scaricare nulla e senza costare nulla. Comporre i filtri a
   * tentativi diventa gratuito, e chi cerca vede il prezzo prima di pagarlo — che su un
   * servizio a consumo è la differenza fra uno strumento e una trappola.
   */
  async cercaProspect(
    criteri: CriteriProspezione,
    opzioni: { readonly soloConteggio?: boolean | undefined } = {},
  ): Promise<RisultatoProspezione> {
    const service = this.#config.services.prospezione;
    const soloConteggio = opzioni.soloConteggio ?? false;
    const limite = criteri.limite ?? LOTTO_PREDEFINITO;

    const filtri = {
      companyName: criteri.denominazione,
      province: criteri.provincia?.toUpperCase(),
      // Il fornitore confronta il codice così com'è archiviato, cioè **senza punti**:
      // «25.62.00» non trova nulla, «2562» trova sessantuno aziende.
      atecoCode: criteri.ateco?.replace(/[^0-9]/g, ''),
      minEmployees: criteri.addettiMin,
      maxEmployees: criteri.addettiMax,
      minTurnover: criteri.fatturatoMinEuro,
      maxTurnover: criteri.fatturatoMaxEuro,
      shareHolderTaxCode: criteri.socioCodiceFiscale,
      activityStatus: criteri.soloAttive === false ? undefined : 'ATTIVA',
    };

    if (soloConteggio) {
      /*
        Due domande diverse, due conteggi — entrambi gratuiti.

        Senza limite il servizio dice **quante aziende esistono**; con il limite e
        l'arricchimento dice **quanto costa il lotto** che si sta per comprare, perché il
        prezzo va a record. Chiederne uno solo significherebbe mostrare o un totale senza
        prezzo o un prezzo senza sapere di quante aziende si stia parlando.
      */
      const [totali, preventivo] = await Promise.all([
        this.#contaProspect({ ...filtri }),
        this.#contaProspect({ ...filtri, limit: limite, dataEnrichment: ARRICCHIMENTO }),
      ]);

      return {
        totale: totali.count,
        costoElencoCentesimi: preventivo.costoCentesimi,
        aziende: [],
        soloConteggio: true,
        lotto: Math.min(limite, totali.count),
      };
    }

    const raw = await this.#company.request<unknown>({
      service: 'prospezione',
      path: service.path,
      query: {
        ...filtri,
        limit: limite,
        skip: criteri.salta,
        // Senza arricchimento la risposta contiene **soltanto gli identificativi**: un
        // elenco di stringhe opache, inutile da mostrare e comunque da pagare.
        dataEnrichment: ARRICCHIMENTO,
      },
      cacheTtlSeconds: service.ttlSeconds,
      // Stima prudenziale prima della chiamata, corretta subito dopo con il costo che il
      // fornitore dichiara: si paga per i record restituiti, non per quelli chiesti.
      costoCentesimi: costoLotto(limite),
      costoDallaRisposta: (payload) => {
        const dichiarato = num(payload, 'cost');
        return dichiarato === null ? null : Math.round(dichiarato * 100);
      },
    });

    const elementi = asArray(pick(raw, 'data') ?? []);
    const dichiarato = num(raw, 'cost');

    return {
      totale: num(raw, 'count') ?? elementi.length,
      costoElencoCentesimi:
        dichiarato === null ? costoLotto(elementi.length) : Math.round(dichiarato * 100),
      aziende: elementi.map((item) =>
        this.#toSearchResult(item, partitaIvaOf(item, 'vatCode', 'partitaIva')),
      ),
      soloConteggio: false,
      lotto: elementi.length,
    };
  }

  /** Conteggio in modalità `dryRun`: non scarica nulla, non addebita nulla. */
  async #contaProspect(
    query: Record<string, unknown>,
  ): Promise<{ count: number; costoCentesimi: number }> {
    const raw = await this.#company.request<unknown>({
      service: 'prospezione',
      path: this.#config.services.prospezione.path,
      query: { ...query, dryRun: 1 },
      // Nessuna cache: è gratuito, e un numero di ieri varrebbe meno della chiamata.
      cacheTtlSeconds: 0,
      costoCentesimi: 0,
    });

    const dichiarato = num(raw, 'cost');
    return {
      count: num(raw, 'count') ?? 0,
      // Il prezzo lo dichiara il fornitore a ogni risposta: fidarsi del listino scritto
      // nel codice significherebbe accorgersi di un aumento solo a fine mese.
      costoCentesimi: dichiarato === null ? 0 : Math.round(dichiarato * 100),
    };
  }

  async fetchProfile(identifier: string, level: FetchLevel): Promise<CompanyProfile> {
    const osservatoIl = this.#now();
    const services = this.#config.services;

    const anagraficaService = level === 'base' ? services.anagraficaBase : services.anagraficaEstesa;
    const rawAnagrafica = this.#unwrap(await this.#get(anagraficaService, identifier));

    const servizio = level === 'base' ? 'IT-start' : 'IT-advanced';
    const anagrafica = mappaAnagrafica(rawAnagrafica, servizio, osservatoIl);

    // IT-advanced restituisce anche bilanci sintetici e soci nella stessa risposta:
    // estrarli qui evita due chiamate a pagamento per dati già pagati.
    const bilanciSintetici =
      level === 'base'
        ? []
        : mappaBilanciSintetici(rawAnagrafica).map((b) => ({
            value: b,
            source: { kind: 'provider' as const, provider: this.name, service: servizio },
            // Un bilancio "vale" alla data di chiusura dell'esercizio, non a quella di
            // lettura: è questa distinzione a far scattare la penalità per dato obsoleto.
            observedAt: b.dataChiusura ?? new Date(Date.UTC(b.anno, 11, 31)),
            confidence: 'alta' as const,
          }));

    const identity = {
      partitaIva: partitaIvaOf(rawAnagrafica, 'vatCode', 'partitaIva') ?? parsePartitaIva(identifier),
      codiceFiscale: null,
      denominazione:
        str(rawAnagrafica, 'companyName', 'denominazione', 'ragioneSociale', 'name') ?? identifier,
    };

    if (level === 'base') {
      return {
        identity,
        anagrafica,
        assetti: null,
        bilanci: [],
        bilanciSintetici: [],
        eventiNegativi: null,
        unitaLocali: null,
        datiDichiarati: DATI_DICHIARATI_VUOTI,
      };
    }

    // Anche i soci arrivano dalla stessa risposta di IT-advanced.
    const assetti = mappaAssetti(rawAnagrafica, servizio, osservatoIl);

    if (level === 'esteso') {
      return {
        identity,
        anagrafica,
        assetti,
        bilanci: [],
        bilanciSintetici,
        eventiNegativi: null,
        unitaLocali: null,
        datiDichiarati: DATI_DICHIARATI_VUOTI,
      };
    }

    // Livello completo: si acquistano i servizi aggiuntivi, ma solo quelli verificati.
    // Un percorso non confermato produrrebbe una chiamata a vuoto — pagata comunque.
    const [bilanci, eventiNegativi] = await Promise.all([
      services.bilancioDettagliato.verificato ? this.#fetchBilanci(identifier) : Promise.resolve([]),
      services.eventiNegativi.verificato
        ? this.#fetchEventiNegativi(identifier, osservatoIl)
        : Promise.resolve(null),
    ]);

    return {
      identity,
      anagrafica,
      assetti,
      bilanci,
      bilanciSintetici,
      eventiNegativi,
      unitaLocali: null,
      datiDichiarati: DATI_DICHIARATI_VUOTI,
    };
  }

  // ── Interni ────────────────────────────────────────────────────────────────

  async #fetchBilanci(identifier: string): Promise<readonly Sourced<Bilancio>[]> {
    const service = this.#config.services.bilancioDettagliato;
    try {
      const raw = this.#unwrap(await this.#get(service, identifier));
      const esercizi = asArray(pick(raw, 'balanceSheets', 'bilanci', 'years') ?? [raw]);

      return esercizi
        .map((e) => mappaBilancio(e))
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .sort((a, b) => b.anno - a.anno)
        .slice(0, 5)
        .map((b) => ({
          value: b,
          source: { kind: 'provider' as const, provider: this.name, service: 'IT-balance-sheet' },
          // Il bilancio "vale" alla data di chiusura dell'esercizio, non alla data di lettura:
          // è questa distinzione a far scattare correttamente la penalità per dato obsoleto.
          observedAt: b.dataChiusura,
          confidence: 'alta' as const,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Verifica eventi negativi, servizio asincrono.
   *
   * Restituisce `null` — e non «nessun evento» — quando la verifica non è andata a buon
   * fine. La distinzione è il presidio più importante dell'intero motore di credito:
   * trattare «non ho controllato» come «non ci sono protesti» regala venti punti di score
   * a un soggetto che potrebbe averne dieci.
   */
  async #fetchEventiNegativi(
    identifier: string,
    osservatoIl: Date,
  ): Promise<Sourced<EventiNegativi> | null> {
    const servizio = this.#config.services.eventiNegativi;

    try {
      const esito = await this.#risk.requestAsync({
        service: servizio.path,
        startPath: servizio.path,
        body: { cf_piva: identifier },
        statusPath: this.#config.percorsoStatoRichiesta,
        costoCentesimi: servizio.costoCentesimi,
        cacheTtlSeconds: servizio.ttlSeconds,
      });

      if (esito.stato !== 'completata') return null;
      return mappaNegativita(esito.payload, osservatoIl);
    } catch {
      return null;
    }
  }

  async #get(service: ServiceConfig, identifier: string): Promise<unknown> {
    return this.#company.request<unknown>({
      service: service.path,
      path: service.path.replace('{id}', encodeURIComponent(identifier)),
      cacheTtlSeconds: service.ttlSeconds,
      costoCentesimi: service.costoCentesimi,
    });
  }

  /**
   * Scarta l'involucro `{ success, message, error, data }`.
   *
   * ⚠ `data` è un **array**, anche quando si interroga una singola azienda per partita IVA.
   * Trattarlo come oggetto produrrebbe un profilo con tutti i campi vuoti e nessun errore
   * visibile — il tipo di guasto peggiore, perché silenzioso.
   */
  #unwrap(raw: unknown): unknown {
    const contenuto = pick(raw, 'data', 'result') ?? raw;
    if (Array.isArray(contenuto)) return contenuto[0] ?? {};
    return contenuto;
  }

  #toSearchResult(raw: unknown, piva: PartitaIva | null): CompanySearchResult {
    // Gli stessi lettori dell'anagrafica, non una copia semplificata: la sede è annidata
    // in `address.registeredOffice` e l'ATECO in `atecoClassification`, e una seconda
    // implementazione di quelle due letture è già divergita una volta.
    const sede = sedeDi(raw);
    const stato = normalizzaStatoAttivita(str(raw, 'activityStatus', 'statoAttivita', 'status'));

    return {
      partitaIva: piva,
      denominazione:
        str(raw, 'companyName', 'denominazione', 'ragioneSociale', 'name') ?? 'Non specificata',
      comune: str(sede, 'comune', 'city', 'town'),
      provincia: str(sede, 'provincia', 'province', 'sigla'),
      // `IT-start` non porta l'ATECO: resta nullo finché non si acquista l'anagrafica estesa.
      ateco: atecoDi(raw),
      // Il fornitore dichiara `activityStatus: "ATTIVA" | "CESSATA" | …`, non un booleano:
      // `bool(...)` non lo trovava e ricadeva sempre sul valore di comodo `true`, cioè
      // mostrava come attive anche le cessate.
      attiva: bool(raw, 'active', 'attiva') ?? stato === 'attiva',
      statoAttivita: stato,
      // La partita IVA per prima. Sulla risposta vera `id` è l'identificativo interno del
      // fornitore (`60d1bfc7…`): finiva nel collegamento «Analizza», che è la chiave con
      // cui l'archivio riconosce l'azienda ed evita di riacquistarla.
      providerId: piva ?? str(raw, 'vatCode', 'partitaIva', 'taxCode', 'id') ?? '',
    };
  }
}
