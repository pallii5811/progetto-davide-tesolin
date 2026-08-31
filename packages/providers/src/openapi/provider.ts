/**
 * Provider OpenAPI.com.
 *
 * Acquisizione **a livelli**: si parte dal servizio più economico e si sale solo se
 * l'analisi lo richiede. Le chiamate di uno stesso livello partono in parallelo, ma il
 * fallimento di una sezione accessoria non fa cadere l'intero profilo: meglio un'analisi
 * con gli eventi negativi mancanti e dichiarati tali, che nessuna analisi.
 */

import { DATI_DICHIARATI_VUOTI, parsePartitaIva } from '@aegis/core';
import {
  BILANCIO_DEPOSITATO,
  INDICATORI_FORNITORE_VUOTI,
  REGISTRO_IMPRESE,
  Money,
  fromProvider,
  isBilancioSinteticoUtile,
} from '@aegis/core';
import type {
  Bilancio,
  CompanyProfile,
  EventiNegativi,
  Money as Euro,
  PartitaIva,
  Sourced,
} from '@aegis/core';
import { HttpProviderClient } from '../http.js';
import type { Cache, CostLedger, RequestOptions } from '../http.js';
import { ProviderError } from '../port.js';
import type {
  CompanyDataProvider,
  CompanySearchResult,
  AcquistoFacoltativo,
  CriteriProspezione,
  FetchLevel,
  RisultatoProspezione,
  SearchCriteria,
  SintesiAzienda,
} from '../port.js';
import { OPENAPI_DEFAULT_CONFIG, baseUrlPer, baseUrlRischioPer } from './config.js';
import type { AmbienteOpenApi, OpenApiConfig, ServiceConfig } from './config.js';
import {
  atecoDi,
  mappaProfiloCompleto,
  mappaAnagrafica,
  mappaAssetti,
  mappaBilanciSintetici,
  mappaBilancio,
  normalizzaStatoAttivita,
  sedeDi,
} from './mapper.js';
import type { ProfiloCompleto } from './mapper.js';
import { fondiIndicatori, mappaIndicatoriFornitore } from './indicatori.js';
import { mappaNegativita } from './negativita.js';
import { asArray, bool, codiceFiscaleOf, money, num, partitaIvaOf, pick, str } from './parse.js';

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

/**
 * Quanto si attende un accertamento asincrono prima di restituire l'analisi senza.
 *
 * Misurato sul servizio reale: una pratica di negatività si completa in una trentina di
 * secondi. Aspettarla tutta significa lasciare l'intermediario davanti a una pagina bianca
 * per quarantasette secondi — e chi aspetta quarantasette secondi conclude che il software
 * è rotto, non che sta lavorando.
 *
 * Si attende dieci secondi: quel tanto che basta a raccogliere le pratiche veloci. Se non
 * fa in tempo, l'analisi esce comunque e **dichiara** che l'accertamento è in corso;
 * l'identificativo resta in memoria e il ricaricamento successivo lo completa in meno di un
 * secondo, gratis. Un'attesa breve con un dato dichiarato mancante è onesta; un'attesa
 * lunga con lo stesso dato è solo lenta.
 */
const ATTESA_ACCERTAMENTI_MS = 10_000;

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
  /**
   * Memoria delle pratiche asincrone già aperte.
   *
   * Una pratica costa all'apertura e la lettura è gratuita: se l'attesa scade e la
   * successiva analisi ne aprisse un'altra, si pagherebbe due volte lo stesso
   * accertamento. Qui si conserva l'identificativo, così il secondo tentativo **legge**
   * invece di comprare.
   */
  readonly #cache: Cache | undefined;

  constructor(options: OpenApiProviderOptions) {
    if (options.token.trim() === '') {
      throw new ProviderError('Token OpenAPI.com mancante', 'autenticazione');
    }
    this.#config = options.config ?? OPENAPI_DEFAULT_CONFIG;
    this.#now = options.now ?? ((): Date => new Date());
    this.#cache = options.cache;
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
    // Il livello di dettaglio è una scelta di chi paga, non una costante nascosta qui.
    const arricchimento = criteri.arricchimento ?? ARRICCHIMENTO;

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
      legalFormCode: criteri.formaGiuridicaCodice,
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
        this.#contaProspect({ ...filtri, limit: limite, dataEnrichment: arricchimento }),
      ]);

      const lotto = Math.min(limite, totali.count);

      return {
        totale: totali.count,
        /*
          Il preventivo mostrato **davanti al pulsante che spende**.

          Quando il fornitore non dichiara il costo, qui usciva `0,00 €`: non «non lo so»,
          ma «gratis» — l'unica lettura che un numero a zero consente a chi legge, e quella
          che porta a premere. Ora si ricade sul listino verificato (cinque centesimi a
          record), che è un prezzo noto, non un'invenzione: un preventivo prudenziale è
          onesto, uno a zero no.

          Resta un difetto dichiarato: la forma giusta sarebbe distinguere «costo non
          dichiarato dal fornitore» da «costo zero», e per farlo `costoElencoCentesimi`
          dovrebbe poter valere `null` — cioè cambiare il contratto in `port.ts` e le
          quattro schermate che lo leggono.
        */
        costoElencoCentesimi: preventivo.costoCentesimi ?? costoLotto(lotto),
        aziende: [],
        soloConteggio: true,
        lotto,
        // Zero senza spiegazione fa sembrare rotto un servizio che sta funzionando.
        ...(totali.count === 0 ? { diagnosiZero: await this.#diagnosticaZero(filtri) } : {}),
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
        dataEnrichment: arricchimento,
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

  /**
   * Perché la ricerca non ha trovato nulla.
   *
   * Si riconta togliendo un filtro per volta e si riportano quelli che, da soli, stavano
   * chiudendo l'insieme. Sono tutte chiamate in `dryRun`: gratuite, quindi la diagnosi si
   * può fare sempre, senza chiedere permesso e senza far pagare una risposta vuota.
   *
   * Serve perché l'incrocio di due filtri sensati può essere vuoto senza che nessuno dei
   * due sia sbagliato — diciassette imprese in un settore, nessuna delle quali abbia anche
   * venti addetti — e da fuori quel caso non si distingue da un guasto. È la differenza
   * fra «non funziona» e «questo settore, in questa provincia, non ha imprese di quella
   * dimensione»: la seconda è un'informazione commerciale, la prima fa chiudere il
   * programma.
   */
  async #diagnosticaZero(
    filtri: Record<string, unknown>,
  ): Promise<readonly { filtro: string; etichetta: string; totaleSenza: number }[]> {
    const ETICHETTE: Record<string, string> = {
      companyName: 'denominazione',
      province: 'provincia',
      atecoCode: 'codice ATECO',
      minEmployees: 'addetti da',
      maxEmployees: 'addetti a',
      minTurnover: 'fatturato da',
      maxTurnover: 'fatturato a',
      legalFormCode: 'forma giuridica',
      shareHolderTaxCode: 'codice fiscale del socio',
    };

    const attivi = Object.keys(filtri).filter(
      (k) => k in ETICHETTE && filtri[k] !== undefined && filtri[k] !== '',
    );
    // Con un filtro solo non c'è nulla da diagnosticare: è quello, e si vede.
    if (attivi.length < 2) return [];

    const esiti = await Promise.all(
      attivi.map(async (chiave) => {
        const senza = { ...filtri };
        delete senza[chiave];
        const { count } = await this.#contaProspect(senza);
        return { filtro: chiave, etichetta: ETICHETTE[chiave] ?? chiave, totaleSenza: count };
      }),
    );

    // Solo quelli che riaprirebbero davvero la ricerca, dal più generoso.
    return esiti.filter((e) => e.totaleSenza > 0).sort((a, b) => b.totaleSenza - a.totaleSenza);
  }

  /**
   * Conteggio in modalità `dryRun`: non scarica nulla, non addebita nulla.
   *
   * `costoCentesimi` vale `null` quando il fornitore non dichiara il prezzo. Valeva zero, e
   * zero è un'affermazione: significa «gratis». Chi decide cosa mostrare sta a monte.
   */
  async #contaProspect(
    query: Record<string, unknown>,
  ): Promise<{ count: number; costoCentesimi: number | null }> {
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
      // nel codice significherebbe accorgersi di un aumento solo a fine mese. Ma se non lo
      // dichiara, l'assenza resta assenza — mai zero.
      costoCentesimi: dichiarato === null ? null : Math.round(dichiarato * 100),
    };
  }

  /**
   * L'approfondimento di questa impresa è già stato pagato?
   *
   * IL DIFETTO CHE L'HA RESA NECESSARIA. Il pulsante annunciava «Analisi approfondita
   * +0,30 €» anche su un'impresa approfondita il giorno prima, la cui risposta era in
   * archivio e valida per altri ventinove giorni. Chi lo leggeva non aveva modo di sapere
   * che quel clic non costava niente, e ha smesso di cliccare — cioè il prodotto ha
   * impedito di usare un dato già comprato, per un prezzo che non avrebbe addebitato.
   *
   * Il salto da «completo» a «profondito» acquista UN servizio, il profilo completo: la
   * domanda ha quindi una risposta sola e non ambigua. Se un giorno l'approfondimento ne
   * comprasse due, questa funzione dovrà chiederli entrambi — «senza spesa» è vero solo se
   * lo sono tutti.
   */
  async acquistoSenzaSpesa(identifier: string, cosa: AcquistoFacoltativo): Promise<boolean> {
    const servizio =
      cosa === 'approfondimento'
        ? this.#config.services.profiloCompleto
        : this.#config.services.eventiNegativi;
    return this.#company.serviblePerCache(this.#opzioniDi(servizio, identifier));
  }

  async fetchProfile(
    identifier: string,
    level: FetchLevel,
    opzioni: { readonly conEventiNegativi?: boolean | undefined } = {},
  ): Promise<CompanyProfile> {
    const osservatoIl = this.#now();
    const services = this.#config.services;

    const anagraficaService = level === 'base' ? services.anagraficaBase : services.anagraficaEstesa;
    const approfondito = level === 'profondito';
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
            source: {
              kind: 'provider' as const,
              provider: this.name,
              service: servizio,
              registro: BILANCIO_DEPOSITATO,
            },
            // Un bilancio "vale" alla data di chiusura dell'esercizio, non a quella di
            // lettura: è questa distinzione a far scattare la penalità per dato obsoleto.
            observedAt: b.dataChiusura ?? new Date(Date.UTC(b.anno, 11, 31)),
            confidence: 'alta' as const,
          }));

    const identity = {
      partitaIva: partitaIvaOf(rawAnagrafica, 'vatCode', 'partitaIva') ?? parsePartitaIva(identifier),
      /*
        Il codice fiscale era cablato a `null`.

        Non per mancanza di dato: `taxCode` è presente in ogni risposta registrata, il
        parser esiste (`codiceFiscaleOf`), la colonna esiste e il campo del modello pure.
        Restava `null`, e con esso ogni riconciliazione fatta sul codice fiscale — che è
        l'identificatore che non cambia quando la partita IVA cambia.

        Resta una **stringa**: un identificatore di cifre non si converte mai. Sessantasei
        partite IVA su ottanta cominciano per zero, e `Number('01528120981')` aggancerebbe
        un'altra impresa.
      */
      codiceFiscale: codiceFiscaleOf(rawAnagrafica, 'taxCode', 'codiceFiscale', 'fiscalCode'),
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
        // Il perimetro di gruppo lo porta solo il profilo completo.
        gruppo: null,
        // L'anagrafica minima non porta indici: dichiararlo, non riempire di zeri.
        indicatoriFornitore: INDICATORI_FORNITORE_VUOTI,
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
        gruppo: null,
        // L'anagrafica estesa porta le qualifiche che sa (gruppo IVA); gli indici
        // economico-finanziari arrivano solo con il profilo completo.
        indicatoriFornitore: mappaIndicatoriFornitore(rawAnagrafica),
        datiDichiarati: DATI_DICHIARATI_VUOTI,
      };
    }

    // Livello completo: si acquistano i servizi aggiuntivi, ma solo quelli verificati.
    // Un percorso non confermato produrrebbe una chiamata a vuoto — pagata comunque.
    const [bilanci, eventiNegativi, profilo] = await Promise.all([
      services.bilancioDettagliato.verificato ? this.#fetchBilanci(identifier) : Promise.resolve([]),
      // Solo se richiesto: 45 centesimi non si addebitano per un valore predefinito.
      services.eventiNegativi.verificato && opzioni.conEventiNegativi === true
        ? this.#fetchEventiNegativi(identifier, osservatoIl)
        : Promise.resolve(null),
      approfondito ? this.#fetchProfiloCompleto(identifier) : Promise.resolve(null),
    ]);

    /*
      Le cariche arrivano solo dal profilo completo, e vanno unite ai soci che vengono
      dall'anagrafica estesa: sono due metà dello stesso assetto societario. Sostituire
      l'una con l'altra perderebbe metà dell'informazione pagata.
    */
    const assettiCompleti =
      profilo === null
        ? assetti
        : {
            ...assetti,
            value: { ...assetti.value, cariche: profilo.cariche },
          };

    return {
      identity,
      anagrafica,
      assetti: assettiCompleti,
      bilanci,
      bilanciSintetici,
      eventiNegativi,
      unitaLocali:
        profilo === null || profilo.unitaLocali.length === 0
          ? null
          : fromProvider(profilo.unitaLocali, this.name, 'IT-full', REGISTRO_IMPRESE, osservatoIl),
      /*
        Il punto esatto in cui il gruppo veniva buttato via.

        `profilo.cariche` e `profilo.unitaLocali` venivano letti, `profilo.gruppo` no —
        e non perché qualcuno l'avesse deciso: il modello canonico non aveva un campo
        dove metterlo, quindi la riga non si poteva scrivere e nessuno se n'è accorto.
        Il collaudo del mappatore continuava a passare, perché verificava l'estrazione e
        non l'arrivo.

        Non si fonde dentro `assettiCompleti`: quello spread conserva la provenienza
        dell'anagrafica estesa, e il gruppo verrebbe attribuito al servizio sbagliato.
      */
      gruppo:
        profilo?.gruppo == null
          ? null
          : fromProvider(profilo.gruppo, this.name, 'IT-full', REGISTRO_IMPRESE, osservatoIl),
      /*
        I due servizi si **sommano**, campo per campo: non è uno il superset dell'altro.

        Qui il profilo completo *sostituiva* la lettura dell'anagrafica estesa, e con essa
        sparivano il gruppo IVA e il codice SDI — che `IT-advanced` porta e `IT-full` no.
        Risultato: chi pagava l'approfondimento a quaranta centesimi vedeva una bandiera in
        meno di chi si fermava ai dieci. Pagare di più e vedere di meno.

        Il profilo completo vince dove ha un valore, perché è il più ricco e il più
        aggiornato; dove non ce l'ha non cancella niente.
      */
      indicatoriFornitore: fondiIndicatori(
        mappaIndicatoriFornitore(rawAnagrafica),
        profilo?.indicatori ?? INDICATORI_FORNITORE_VUOTI,
      ),
      datiDichiarati: DATI_DICHIARATI_VUOTI,
    };
  }

  /**
   * Profilo completo: cariche, sedi e gruppo.
   *
   * Il fallimento non fa cadere l'analisi. Chi ha chiesto l'approfondimento ha già pagato
   * l'anagrafica estesa: restituire un errore invece di un'analisi un po' meno ricca
   * significherebbe fargli perdere anche quella.
   */
  async #fetchProfiloCompleto(identifier: string): Promise<ProfiloCompleto | null> {
    try {
      const raw = this.#unwrap(await this.#get(this.#config.services.profiloCompleto, identifier));
      return mappaProfiloCompleto(raw);
    } catch {
      return null;
    }
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
          source: {
            kind: 'provider' as const,
            provider: this.name,
            service: 'IT-balance-sheet',
            registro: BILANCIO_DEPOSITATO,
          },
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
    const chiavePratica = `pratica:negativita:${identifier}`;

    try {
      /*
        Se una pratica per questa azienda è già stata aperta, se ne legge il risultato:
        gratis. Aprirne un'altra costerebbe altri quarantacinque centesimi per accertare
        gli stessi protesti — e succede proprio nel caso peggiore, quando la prima attesa
        è scaduta perché il servizio era lento.
      */
      const gia = await this.#cache?.get(chiavePratica);
      if (gia !== undefined && typeof gia.value === 'string') {
        const risultato = await this.#leggiNegativita(gia.value);
        return risultato === null ? null : mappaNegativita(risultato, osservatoIl);
      }

      const esito = await this.#risk.requestAsync({
        service: servizio.path,
        startPath: servizio.path,
        body: { cf_piva: identifier },
        statusPath: this.#config.percorsoStatoRichiestaRischio,
        resultPath: this.#config.percorsoRisultatoNegativita,
        costoCentesimi: servizio.costoCentesimi,
        cacheTtlSeconds: servizio.ttlSeconds,
        timeoutMs: ATTESA_ACCERTAMENTI_MS,
      });

      // L'identificativo si conserva **anche quando l'attesa è scaduta**: è esattamente
      // il caso in cui evita di ricomprare.
      if (esito.richiestaId !== null) {
        // Attesa e non lasciata correre: con una cache su database, non attenderla
        // significherebbe che una seconda richiesta partita subito dopo non trova
        // l'identificativo e riapre la pratica — cioè ricompra ciò che si voleva evitare.
        await this.#cache?.set(chiavePratica, {
          value: esito.richiestaId,
          expiresAt: Date.now() + servizio.ttlSeconds * 1000,
        });
      }

      if (esito.stato !== 'completata') return null;
      return mappaNegativita(esito.payload, osservatoIl);
    } catch {
      return null;
    }
  }

  /**
   * Risultato di una pratica già aperta — **solo se conclusa**.
   *
   * Lo stato si controlla prima, e non è una cautela accademica: una pratica ancora in
   * lavorazione può restituire un documento con gli elenchi vuoti, indistinguibile da
   * «nessun protesto». Mapparlo significherebbe dichiarare pulita un'azienda che nessuno
   * ha finito di verificare, e quel «pulita» finisce in uno score di credito e in un
   * fascicolo di adeguatezza.
   *
   * Entrambe le letture sono gratuite: si è pagata l'apertura, una volta sola.
   */
  async #leggiNegativita(richiestaId: string): Promise<unknown> {
    try {
      const stato = await this.#risk.request<unknown>({
        service: `${this.#config.services.eventiNegativi.path}/stato`,
        path: this.#config.percorsoStatoRichiestaRischio.replace('{id}', encodeURIComponent(richiestaId)),
        cacheTtlSeconds: 0,
        costoCentesimi: 0,
      });

      if (!praticaConclusa(stato)) return null;

      return await this.#risk.request<unknown>({
        service: `${this.#config.services.eventiNegativi.path}/risultato`,
        path: this.#config.percorsoRisultatoNegativita.replace('{id}', encodeURIComponent(richiestaId)),
        cacheTtlSeconds: this.#config.services.eventiNegativi.ttlSeconds,
        costoCentesimi: 0,
      });
    } catch {
      return null;
    }
  }

  async #get(service: ServiceConfig, identifier: string): Promise<unknown> {
    return this.#company.request<unknown>(this.#opzioniDi(service, identifier));
  }

  /**
   * Le opzioni della richiesta, costruite in un posto solo.
   *
   * Stavano dentro `#get`. Sono uscite di lì perché servono anche SENZA eseguire la
   * richiesta — per sapere se quel dato è già in archivio — e la chiave della cache nasce
   * proprio da queste opzioni. Ricostruirle una seconda volta significherebbe due tabelle
   * identiche oggi e divergenti il giorno in cui una cambia: e allora il prodotto
   * annuncerebbe «già pagato» su qualcosa che invece pagherà.
   */
  #opzioniDi(service: ServiceConfig, identifier: string): RequestOptions {
    return {
      service: service.path,
      path: service.path.replace('{id}', encodeURIComponent(identifier)),
      cacheTtlSeconds: service.ttlSeconds,
      costoCentesimi: service.costoCentesimi,
    };
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
      sintesi: sintesiDa(raw),
      /*
        Il record per intero, senza selezione.

        La ricerca testuale restituisce un elenco camerale povero: mappare quelle voci
        produrrebbe anagrafiche quasi vuote che sembrano dati mancanti invece che dati
        non acquistati. Si valorizza quindi solo quando c'è la partita IVA, cioè quando
        si è comprata davvero l'anagrafica estesa.
      */
      ...(piva === null
        ? { anagrafica: null, bilanciSintetici: [], soci: [] }
        : {
            anagrafica: mappaAnagrafica(raw, 'IT-advanced', this.#now()).value,
            bilanciSintetici: mappaBilanciSintetici(raw),
            soci: mappaAssetti(raw, 'IT-advanced', this.#now()).value.soci,
          }),
    };
  }
}

/**
 * I numeri che il record acquistato porta già con sé.
 *
 * Si legge l'ultimo esercizio **utile** — le anagrafiche restituiscono anche l'anno in
 * corso con tutti i valori nulli, e mostrarlo darebbe «fatturato: —» su un'azienda che il
 * fatturato ce l'ha. Gli altri campi si cercano prima fra quelli anagrafici, che sono più
 * aggiornati del bilancio depositato, e solo poi nel bilancio.
 *
 * Restituisce `null` quando non c'è **niente** da mostrare: una riga di trattini fa
 * credere che l'azienda non abbia dati, mentre il vero significato è che quel record non
 * li contiene.
 */
function sintesiDa(raw: unknown): SintesiAzienda | null {
  const esercizi = mappaBilanciSintetici(raw).filter(isBilancioSinteticoUtile);
  const ultimo = esercizi[0] ?? null;

  const dipendenti =
    num(raw, 'employees', 'numeroDipendenti', 'addetti', 'employeesNumber') ?? ultimo?.dipendenti ?? null;

  const euro = (valore: Euro | null | undefined): number | null =>
    valore === null || valore === undefined ? null : Money.toEuro(valore);

  const sintesi: SintesiAzienda = {
    annoUltimoBilancio: ultimo?.anno ?? null,
    dipendenti,
    fatturatoEuro: euro(money(raw, 'turnover', 'fatturato', 'revenue') ?? ultimo?.fatturato),
    patrimonioNettoEuro: euro(ultimo?.patrimonioNetto),
    totaleAttivoEuro: euro(ultimo?.totaleAttivo),
    capitaleSocialeEuro: euro(money(raw, 'shareCapital', 'capitaleSociale') ?? ultimo?.capitaleSociale),
    retribuzioneMediaEuro: euro(ultimo?.retribuzioneMediaLorda),
    numeroSoci: contaSoci(raw),
    eserciziDisponibili: esercizi.length,
  };

  const qualcosa =
    sintesi.dipendenti !== null ||
    sintesi.fatturatoEuro !== null ||
    sintesi.capitaleSocialeEuro !== null ||
    sintesi.numeroSoci !== null ||
    sintesi.eserciziDisponibili > 0;

  return qualcosa ? sintesi : null;
}

/** Quanti soci dichiara il record. `null` distingue «non li porta» da «non ne ha». */
function contaSoci(raw: unknown): number | null {
  const elenco = pick(raw, 'shareHolders', 'shareholders', 'soci', 'members');
  return Array.isArray(elenco) ? elenco.length : null;
}

/**
 * La pratica è conclusa?
 *
 * Solo uno stato esplicitamente concluso autorizza a leggerne il risultato. Nel dubbio si
 * risponde «no»: attendere un minuto in più non costa nulla, dichiarare pulita un'azienda
 * non verificata costa un'analisi sbagliata.
 */
function praticaConclusa(risposta: unknown): boolean {
  const dati = pick(risposta, 'data') ?? risposta;
  const stato = str(dati, 'status', 'stato', 'state') ?? '';
  return /^(DONE|COMPLETED|COMPLETE|OK|SUCCESS)$/i.test(stato.trim());
}
