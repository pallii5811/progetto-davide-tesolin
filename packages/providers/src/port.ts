/**
 * Porta di acquisizione dati aziendali.
 *
 * Il dominio non conosce OpenAPI.com, né Creditsafe, né alcun altro fornitore: conosce
 * questa interfaccia. Il giorno in cui il cliente cambia provider — o ne affianca un
 * secondo per la copertura estera — si scrive una nuova implementazione e non si tocca
 * una riga di motore.
 */

import type {
  Anagrafica,
  BilancioSintetico,
  CompanyProfile,
  PartitaIva,
  Socio,
  StatoAttivita,
} from '@aegis/core';

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
  | 'completo'
  /**
   * Aggiunge cariche, sedi operative e struttura del gruppo.
   *
   * **Non sostituisce** il livello completo, lo affianca: il servizio che porta cariche e
   * sedi non contiene i bilanci sintetici decennali su cui si calcolano crescita e
   * tendenze, e viceversa. Sono due dataset distinti e si pagano entrambi — motivo per cui
   * questo livello è una scelta esplicita dell'intermediario, non il valore predefinito:
   * su un prospect da qualificare è denaro sprecato, su un cliente da assicurare è nulla.
   */
  | 'profondito';

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
  /**
   * I numeri principali, per il colpo d'occhio.
   *
   * `null` quando la ricerca è stata **testuale**: l'elenco camerale per denominazione
   * non porta questi dati, e restituire zeri li farebbe sembrare misurati.
   */
  readonly sintesi: SintesiAzienda | null;
  /**
   * Il record acquistato, **per intero**.
   *
   * La ricerca per partita IVA compra `IT-advanced`: anagrafica completa, dieci esercizi
   * di bilancio sintetico e la compagine sociale. Due volte si è provato a mostrarne una
   * selezione — prima sei colonne, poi otto numeri — e due volte la selezione era troppo
   * stretta, perché chi paga un record intero si aspetta un record intero.
   *
   * Qui non si sceglie più: passa tutto ciò che il mappatore ha estratto, e la decisione
   * su cosa mettere in primo piano resta all'interfaccia, che può cambiarla senza che si
   * perda un dato per strada.
   *
   * `null` sulle ricerche testuali, per la stessa ragione di `sintesi`.
   */
  readonly anagrafica: Anagrafica | null;
  /** Tutti gli esercizi che il record contiene, dal più recente. */
  readonly bilanciSintetici: readonly BilancioSintetico[];
  /** La compagine sociale dichiarata dal record. */
  readonly soci: readonly Socio[];
}

/** I numeri che l'anagrafica estesa porta con sé, già pagati con la ricerca. */
export interface SintesiAzienda {
  readonly annoUltimoBilancio: number | null;
  readonly dipendenti: number | null;
  readonly fatturatoEuro: number | null;
  readonly patrimonioNettoEuro: number | null;
  readonly totaleAttivoEuro: number | null;
  readonly capitaleSocialeEuro: number | null;
  /** Retribuzione annua lorda media, ricavata dal costo del personale sugli addetti. */
  readonly retribuzioneMediaEuro: number | null;
  readonly numeroSoci: number | null;
  /** Quanti esercizi il record contiene: dice se l'analisi avrà una storia da leggere. */
  readonly eserciziDisponibili: number;
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
  /**
   * Forma giuridica, col codice del registro: `SR` S.r.l., `SP` S.p.A., `DI` ditta
   * individuale, `RS` S.r.l. semplificata.
   *
   * È il filtro che decide se un elenco vale qualcosa. Le ditte individuali **non
   * depositano bilanci**: su di esse metà dell'analisi resta vuota qualunque cifra si
   * spenda, e nessun acquisto la riempie. Misurato su una ricerca reale — meccanica in
   * provincia di Brescia — sono 339 imprese su 542, cioè quasi due terzi di ogni elenco
   * pagato a cinque centesimi a riga.
   *
   * Il fornitore accetta **un codice per volta**: l'elenco separato da virgole risponde
   * zero. Verificato il 21/08/2026.
   */
  readonly formaGiuridicaCodice?: string | undefined;
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
  /**
   * Quando il conteggio è zero: quale filtro lo ha azzerato.
   *
   * Un «nessun risultato» senza spiegazione è il modo più veloce di far credere che il
   * servizio sia rotto. Quasi sempre non lo è: è l'incrocio di due filtri ragionevoli a
   * essere vuoto, e da fuori non si vede quale dei due. Qui si ricontano gli stessi
   * criteri togliendone uno per volta — il conteggio non costa nulla, quindi la diagnosi
   * è gratuita — e si riporta quali riaprirebbero la ricerca.
   */
  readonly diagnosiZero?: readonly {
    readonly filtro: string;
    readonly etichetta: string;
    readonly totaleSenza: number;
  }[];
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
  /**
   * @param opzioni.conEventiNegativi acquista anche protesti, pregiudizievoli e procedure.
   *
   * È **falso** per definizione, e non è un dettaglio: quella verifica costa 45 centesimi
   * contro i 10 dell'anagrafica, cioè l'ottantadue per cento del prezzo di un'analisi.
   * Comprarla ogni volta significa spendere cinquantacinque centesimi per guardare un
   * prospect che magari si scarta al primo sguardo — e chi preme «Analizza» credendo di
   * spenderne dieci non capisce dove finisca il credito.
   *
   * Su un cliente vero serve eccome: pesa il venti per cento dello score ed è l'unica
   * cosa che rileva una procedura aperta. Ma è una decisione, e va presa da chi paga.
   */
  fetchProfile(
    identifier: string,
    level: FetchLevel,
    opzioni?: { readonly conEventiNegativi?: boolean | undefined },
  ): Promise<CompanyProfile>;
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
