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
    readonly ricerca: ServiceConfig;
    readonly anagraficaBase: ServiceConfig;
    readonly anagraficaEstesa: ServiceConfig;
    readonly profiloCompleto: ServiceConfig;
    readonly bilancioDettagliato: ServiceConfig;
    readonly eventiNegativi: ServiceConfig;
  };
  /** Percorso di lettura dello stato delle pratiche asincrone. */
  readonly percorsoStatoRichiesta: string;
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
  services: {
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
    profiloCompleto: {
      path: '/IT-full/{id}',
      ttlSeconds: 30 * GIORNO,
      costoCentesimi: 48,
      descrizione: 'Dataset completo. ⚠ Contenuto non ancora verificato: provare prima di abilitarlo.',
      verificato: false,
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
     */
    eventiNegativi: {
      path: '/IT-negativita',
      ttlSeconds: 7 * GIORNO,
      costoCentesimi: 45,
      descrizione: 'Protesti, pregiudizievoli e procedure concorsuali (asincrono)',
      verificato: false,
      scope: 'risk / IT-negativita',
    },
  },
};

/**
 * Costo di un'analisi al livello indicato, in centesimi.
 * Conta solo i servizi verificati: quelli non confermati non vengono chiamati.
 */
export function costoAnalisi(
  livello: 'base' | 'esteso' | 'completo',
  config: OpenApiConfig = OPENAPI_DEFAULT_CONFIG,
): number {
  const s = config.services;
  if (livello === 'base') return s.anagraficaBase.costoCentesimi;
  if (livello === 'esteso') return s.anagraficaEstesa.costoCentesimi;

  return (
    s.anagraficaEstesa.costoCentesimi +
    (s.eventiNegativi.verificato ? s.eventiNegativi.costoCentesimi : 0) +
    (s.bilancioDettagliato.verificato ? s.bilancioDettagliato.costoCentesimi : 0)
  );
}

/** Servizi il cui percorso o autorizzazione non è ancora confermato. */
export function serviziDaConfermare(
  config: OpenApiConfig = OPENAPI_DEFAULT_CONFIG,
): readonly { readonly chiave: string; readonly servizio: ServiceConfig }[] {
  return Object.entries(config.services)
    .filter(([, servizio]) => !servizio.verificato)
    .map(([chiave, servizio]) => ({ chiave, servizio }));
}
