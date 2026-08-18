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

/**
 * Criteri per cercare aziende che non si conoscono ancora.
 *
 * È una ricerca diversa da `SearchCriteria`: là si parte da un'azienda nota e se ne
 * chiede il profilo, qui si descrive **un insieme** — un territorio, un settore, una
 * dimensione — e si chiede chi lo popola. È la differenza fra analizzare un cliente e
 * trovarne uno.
 */
export interface CriteriProspezione {
  readonly denominazione?: string | undefined;
  /** Sigla provinciale, es. `BS`. */
  readonly provincia?: string | undefined;
  /**
   * Codice ATECO **senza punti**.
   *
   * Il confronto del fornitore è esatto: `25` e `2562` sono due insiemi diversi, e il
   * primo non comprende il secondo. Verificato sui dati reali, e dichiarato
   * nell'interfaccia perché nessuno se lo aspetta.
   */
  readonly ateco?: string | undefined;
  readonly addettiMin?: number | undefined;
  readonly addettiMax?: number | undefined;
  readonly fatturatoMinEuro?: number | undefined;
  readonly fatturatoMaxEuro?: number | undefined;
  /** Codice fiscale di un socio: tutte le società che fanno capo alla stessa persona. */
  readonly socioCodiceFiscale?: string | undefined;
  readonly soloAttive?: boolean | undefined;
  readonly limite?: number | undefined;
  readonly salta?: number | undefined;
}

export interface RisultatoProspezione {
  /** Quante aziende corrispondono ai criteri, indipendentemente da quante se ne scaricano. */
  readonly totale: number;
  /**
   * Quante se ne scaricano davvero.
   *
   * Il prezzo del servizio è **a record**: senza un lotto dichiarato, un elenco su una
   * provincia intera costerebbe centinaia di euro. Totale e lotto sono numeri diversi e
   * vanno mostrati diversi, altrimenti si compra un insieme credendo di comprarne un altro.
   */
  readonly lotto: number;
  /** Costo dell'elenco **per il lotto indicato**, in centesimi, dichiarato dal fornitore. */
  readonly costoElencoCentesimi: number;
  /** Vuoto quando si è chiesto il solo conteggio. */
  readonly aziende: readonly CompanySearchResult[];
  readonly soloConteggio: boolean;
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
  /**
   * Ricerca di prospect.
   *
   * Con `soloConteggio` non scarica nulla e non costa nulla: risponde quante aziende
   * corrispondono e quanto costerebbe averle. È ciò che permette di comporre i filtri
   * a tentativi senza bruciare credito, e va offerto **prima** della ricerca vera.
   */
  cercaProspect(
    criteri: CriteriProspezione,
    opzioni?: { readonly soloConteggio?: boolean | undefined },
  ): Promise<RisultatoProspezione>;
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
