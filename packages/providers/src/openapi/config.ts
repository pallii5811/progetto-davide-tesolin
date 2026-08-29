/**
 * Configurazione dei servizi OpenAPI.com.
 *
 * ✅ VERIFICATA SU CHIAMATE REALI (agosto 2026, ambiente di produzione).
 * Percorsi, forma della risposta e campi sono stati accertati con lo strumento
 * `scripts/sonda.ts`, non dedotti dalla documentazione.
 *
 * TTL della cache: differenziati per volatilità reale del dato, non per comodità.
 * Un bilancio depositato non cambia per mesi; un protesto può comparire domani.
 */

export interface ServiceConfig {
  /** Percorso relativo alla base URL, con `{id}` come segnaposto dell'identificativo. */
  readonly path: string;
  /** Durata della cache, in secondi. */
  readonly ttlSeconds: number;
  /** Costo stimato della chiamata, in centesimi di euro. Alimenta il cost ledger. */
  readonly costoCentesimi: number;
  readonly descrizione: string;
  /** `true` se il servizio è stato verificato con una chiamata reale. */
  readonly verificato: boolean;
  /**
   * Scope che il token deve possedere.
   *
   * I token OpenAPI.com sono **per scope**, non per account: avere credito non basta,
   * il token va autorizzato al singolo servizio dalla console. Dichiararlo qui consente
   * alla diagnostica di dire *quale* autorizzazione manca invece di un generico 401.
   */
  readonly scope: string;
}

const GIORNO = 86_400;

export interface OpenApiConfig {
  readonly baseUrlCompany: string;
  readonly baseUrlRisk: string;
  readonly services: {
    readonly prospezione: ServiceConfig;
    readonly ricerca: ServiceConfig;
    readonly anagraficaBase: ServiceConfig;
    readonly anagraficaEstesa: ServiceConfig;
    readonly profiloCompleto: ServiceConfig;
    readonly bilancioDettagliato: ServiceConfig;
    readonly eventiNegativi: ServiceConfig;
  };
  /** Percorso di lettura dello stato delle pratiche asincrone. */
  readonly percorsoStatoRichiesta: string;
  /** Stato di una pratica sul dominio del rischio: percorso diverso da quello aziendale. */
  readonly percorsoStatoRichiestaRischio: string;
  /** Risultato della verifica di negativita: endpoint dedicato, lettura gratuita. */
  readonly percorsoRisultatoNegativita: string;
}

/**
 * Ambiente di lavoro.
 *
 * Il sandbox richiede un token distinto, emesso separatamente dalla console: usare il
 * token di produzione su `test.company.openapi.com` restituisce 401 «Wrong Token».
 */
export type AmbienteOpenApi = 'produzione' | 'test';

export function baseUrlPer(ambiente: AmbienteOpenApi): string {
  return ambiente === 'test' ? 'https://test.company.openapi.com' : 'https://company.openapi.com';
}

export function baseUrlRischioPer(ambiente: AmbienteOpenApi): string {
  return ambiente === 'test' ? 'https://test.risk.openapi.com' : 'https://risk.openapi.com';
}

export const OPENAPI_DEFAULT_CONFIG: OpenApiConfig = {
  baseUrlCompany: 'https://company.openapi.com',
  baseUrlRisk: 'https://risk.openapi.com',
  percorsoStatoRichiesta: '/IT-request/{id}',
  /*
    Il dominio del rischio ha percorsi propri, e non sono una variante ortografica di
    quelli aziendali: lo stato si legge su "/IT-richiesta/{id}", il **risultato** su un
    endpoint dedicato. Riusare il percorso del dominio aziendale produce un 404 su una
    pratica già aperta e già pagata — l'errore più caro possibile.
  */
  percorsoStatoRichiestaRischio: '/IT-richiesta/{id}',
  percorsoRisultatoNegativita: '/IT-negativita/{id}/dettaglio',
  services: {
    /**
     * Ricerca per insiemi: territorio, settore, dimensione.
     *
     * Un centesimo a chiamata — verificato sul servizio reale — e **gratuita** in modalità
     * di solo conteggio, che è il modo in cui va usata finché i filtri non sono giusti.
     */
    prospezione: {
      path: '/IT-search',
      ttlSeconds: GIORNO,
      costoCentesimi: 1,
      descrizione: 'Ricerca per provincia, settore, addetti e fatturato',
      verificato: true,
      scope: 'company / IT',
    },
    ricerca: {
      path: '/IT-start',
      ttlSeconds: 7 * GIORNO,
      costoCentesimi: 10,
      descrizione: 'Ricerca e anagrafica minima',
      verificato: true,
      scope: 'company / IT-start',
    },
    anagraficaBase: {
      path: '/IT-start/{id}',
      ttlSeconds: 30 * GIORNO,
      costoCentesimi: 10,
      descrizione: 'Denominazione, sede, stato attività, identificativo interno',
      verificato: true,
      scope: 'company / IT-start',
    },
    /**
     * Il servizio portante della piattaforma.
     *
     * Include, in **una sola chiamata**: anagrafica completa, ATECO nelle tre versioni,
     * forma giuridica dettagliata, PEC, REA, **dieci anni di bilanci sintetici** e
     * l'elenco dei soci con le quote. È l'osservazione che ha cambiato l'economia del
     * prodotto: un'analisi utile costa 10 centesimi, non la somma di sei servizi.
     */
    anagraficaEstesa: {
      path: '/IT-advanced/{id}',
      ttlSeconds: 30 * GIORNO,
      costoCentesimi: 10,
      descrizione:
        'Anagrafica completa, ATECO, forma giuridica, PEC, REA, bilanci sintetici (10 esercizi), soci',
      verificato: true,
      scope: 'company / IT-advanced',
    },
    /**
     * Profilo completo: cariche, sedi, gruppo e i quarantotto indicatori già elaborati.
     *
     * Il prezzo era indicato a 48 centesimi **per stima**, mai verificato — e infatti il
     * listino pubblico dichiara 0,30 € a chiamata singola. Una stima al rialzo non è
     * innocua: fa scattare il tetto di spesa prima del dovuto e mostra un credito residuo
     * più basso del vero, cioè spinge a non usare un servizio che costa meno di quanto si
     * crede.
     *
     * Resta comunque un valore predefinito, non una verità: il prezzo effettivo dipende
     * dal contratto, e a volume scende sotto i 9 centesimi. Si sovrascrive dalla
     * configurazione con `AEGIS_PREZZI_CENTESIMI`.
     */
    profiloCompleto: {
      path: '/IT-full/{id}',
      ttlSeconds: 30 * GIORNO,
      costoCentesimi: 30,
      descrizione: 'Cariche, sedi operative, gruppo societario e 48 indicatori già elaborati',
      verificato: true,
      scope: 'company / IT-full',
    },
    /**
     * Bilancio riclassificato: oltre 45 parametri economico-finanziari, fra cui EBITDA,
     * valore aggiunto, flussi e indici. Servizio **asincrono** e a listino separato
     * (~5 €). ⚠ Percorso da confermare: dichiarato non verificato, quindi non chiamato.
     */
    bilancioDettagliato: {
      path: '/IT-balance-sheet/{id}',
      ttlSeconds: 180 * GIORNO,
      costoCentesimi: 500,
      descrizione: 'Bilancio riclassificato, oltre 45 parametri. ⚠ Percorso da confermare.',
      verificato: false,
      scope: 'DocuEngine / visure',
    },
    /**
     * Verifica eventi negativi: protesti, pregiudizievoli e procedure concorsuali in
     * un'unica pratica **asincrona** a 45 centesimi — contro i 3,70-3,90 € delle visure
     * dedicate. È il fattore che pesa il 20% dello score, e senza di esso ogni valutazione
     * del merito creditizio resta dichiaratamente provvisoria.
     *
     * ⚠ Richiede che il token sia autorizzato allo scope `risk`: con un token di sole
     * API aziende il servizio risponde `401 Wrong Token` pur essendoci credito sul conto.
     *
     * ✅ Verificato su chiamata reale: la pratica si completa in una trentina di secondi,
     * lo stato si legge su `/IT-richiesta/{id}` e il risultato su
     * `/IT-negativita/{id}/dettaglio`. Gli elenchi arrivano `null` quando non c'è nulla,
     * non come array vuoti.
     */
    eventiNegativi: {
      path: '/IT-negativita',
      ttlSeconds: 7 * GIORNO,
      costoCentesimi: 45,
      descrizione: 'Protesti, pregiudizievoli e procedure concorsuali (asincrono)',
      verificato: true,
      scope: 'risk / IT-negativita',
    },
  },
};

/**
 * Costo di un'analisi al livello indicato, in centesimi.
 * Conta solo i servizi verificati: quelli non confermati non vengono chiamati.
 */
export function costoAnalisi(
  livello: 'base' | 'esteso' | 'completo' | 'profondito',
  config: OpenApiConfig = OPENAPI_DEFAULT_CONFIG,
): number {
  const s = config.services;
  if (livello === 'base') return s.anagraficaBase.costoCentesimi;
  if (livello === 'esteso') return s.anagraficaEstesa.costoCentesimi;

  /*
    Gli eventi negativi **non** entrano qui.

    Ci entravano, e il numero che ne usciva — cinquantacinque centesimi — era il prezzo
    di un'analisi che comprava d'ufficio anche la verifica protesti. Chi premeva
    «Analizza» credeva di spendere i dieci centesimi dell'anagrafica e ne spendeva
    cinquantacinque, cioè cinque volte tanto, su ogni prospect anche solo sfiorato.

    Ora quella verifica è un acquisto a parte, con il suo pulsante e il suo prezzo
    scritto sopra: si somma a questo quando la si chiede, e non prima.
  */
  const completo =
    s.anagraficaEstesa.costoCentesimi +
    (s.bilancioDettagliato.verificato ? s.bilancioDettagliato.costoCentesimi : 0);

  // L'approfondimento **si somma**: il profilo completo non contiene i bilanci sintetici
  // decennali, quindi non sostituisce l'anagrafica estesa, la affianca.
  return livello === 'profondito' ? completo + s.profiloCompleto.costoCentesimi : completo;
}

/**
 * Quanto costa aggiungere la verifica di protesti, pregiudizievoli e procedure.
 *
 * Esposto a parte perché è un pulsante a parte: il prezzo che l'intermediario legge deve
 * venire dal listino, non da una cifra scritta a mano in una pagina. Sul pulsante
 * dell'approfondimento c'era «+0,48 €» per un servizio che ne costa trenta.
 */
export function costoEventiNegativi(config: OpenApiConfig = OPENAPI_DEFAULT_CONFIG): number {
  return config.services.eventiNegativi.verificato ? config.services.eventiNegativi.costoCentesimi : 0;
}

/** Servizi il cui percorso o autorizzazione non è ancora confermato. */
export function serviziDaConfermare(
  config: OpenApiConfig = OPENAPI_DEFAULT_CONFIG,
): readonly { readonly chiave: string; readonly servizio: ServiceConfig }[] {
  return Object.entries(config.services)
    .filter(([, servizio]) => !servizio.verificato)
    .map(([chiave, servizio]) => ({ chiave, servizio }));
}
