/**
 * Porta di acquisizione dati aziendali.
 *
 * Il dominio non conosce OpenAPI.com, né Creditsafe, né alcun altro fornitore: conosce
 * questa interfaccia. Il giorno in cui il cliente cambia provider — o ne affianca un
 * secondo per la copertura estera — si scrive una nuova implementazione e non si tocca
 * una riga di motore.
 */

import type { CompanyProfile, PartitaIva, StatoAttivita } from '@aegis/core';

/**
 * Livello di approfondimento richiesto.
 *
 * Governa direttamente il costo: ogni livello superiore attiva chiamate aggiuntive
 * a pagamento. Si acquisisce il minimo necessario e si sale solo quando l'analisi lo richiede.
 */
export type FetchLevel =
  /** Solo anagrafica di base. Costo minimo, sufficiente per la ricerca e la qualificazione. */
  | 'base'
  /** Anagrafica completa, assetti proprietari, unità locali. */
  | 'esteso'
  /** Tutto il precedente più bilanci ed eventi negativi. È il livello dell'analisi completa. */
  | 'completo';

export interface CompanySearchResult {
  readonly partitaIva: PartitaIva | null;
  readonly denominazione: string;
  readonly comune: string | null;
  readonly provincia: string | null;
  readonly ateco: string | null;
  readonly attiva: boolean;
  /** Stato dichiarato dalla camera di commercio: distingue «cessata» da «in liquidazione». */
  readonly statoAttivita: StatoAttivita;
  /**
   * Identificativo da usare per le chiamate successive.
   *
   * È la partita IVA ogni volta che il fornitore la dichiara: è la chiave su cui sono
   * costruiti l'archivio, i collegamenti dell'interfaccia e gli altri servizi. Solo in
   * sua assenza si ripiega sull'identificativo interno del fornitore, che è opaco e
   * non ha significato fuori da quel fornitore.
   */
  readonly providerId: string;
}

export interface SearchCriteria {
  readonly denominazione?: string | undefined;
  readonly partitaIva?: string | undefined;
  readonly provincia?: string | undefined;
  readonly ateco?: string | undefined;
  readonly limit?: number | undefined;
}

/** Registrazione di una chiamata a pagamento: alimenta il controllo di marginalità. */
export interface CostEvent {
  readonly provider: string;
  readonly service: string;
  readonly costoStimatoCentesimi: number;
  readonly cacheHit: boolean;
  readonly timestamp: Date;
  readonly riferimento: string | null;
}

export interface CompanyDataProvider {
  readonly name: string;
  search(criteria: SearchCriteria): Promise<readonly CompanySearchResult[]>;
  fetchProfile(identifier: string, level: FetchLevel): Promise<CompanyProfile>;
}

/** Errori di provider distinti per poter reagire in modo diverso: ritentare, degradare, fallire. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind:
      'non-trovato' | 'autenticazione' | 'quota' | 'temporaneo' | 'risposta-non-valida' | 'sconosciuto',
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }

  get ritentabile(): boolean {
    return this.kind === 'temporaneo' || this.kind === 'quota';
  }
}
