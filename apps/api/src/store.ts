/**
 * Archivio dei dati aggiunti dall'intermediario.
 *
 * Ciò che viene dal provider è dato pubblico e si ricarica quando serve; ciò che
 * l'intermediario raccoglie in intervista — metri quadri, veicoli, certificazioni,
 * polizze in essere — è **il suo lavoro**, ed è il vero patrimonio della piattaforma.
 *
 * Le interfacce sono asincrone perché l'implementazione reale parla con PostgreSQL.
 * Quella in memoria resta per i test: un test che deve avviare un database per verificare
 * una regola di dominio è un test che nessuno eseguirà.
 */

import { DATI_DICHIARATI_VUOTI } from '@aegis/core';
import type { DatiDichiarati, PolizzaInEssere } from '@aegis/core';

export interface DossierAzienda {
  readonly identificativo: string;
  readonly datiDichiarati: DatiDichiarati;
  readonly polizze: readonly PolizzaInEssere[];
  readonly aggiornatoIl: Date;
}

export interface PatchDossier {
  readonly datiDichiarati?: Partial<DatiDichiarati> | undefined;
  readonly polizze?: readonly PolizzaInEssere[] | undefined;
}

export interface DossierStore {
  get(identificativo: string): Promise<DossierAzienda | null>;
  upsert(identificativo: string, patch: PatchDossier): Promise<DossierAzienda>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Immagini delle ubicazioni
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una fotografia allegata a un'ubicazione.
 *
 * Non entra nell'analisi: non modifica un punteggio, non muove un capitale. Serve al
 * documento — un capannone si descrive male a parole, e struttura, copertura, distanza
 * dal confine e ordine del piazzale un assuntore li legge in due secondi da una foto.
 * Per questo vive in un archivio suo e si legge **solo quando si compone il report**.
 */
export interface ImmagineUbicazione {
  readonly id: string;
  /** Chiave stabile dell'ubicazione, la stessa che produce `analizzaUbicazioni`. */
  readonly ubicazioneId: string;
  readonly didascalia: string | null;
  readonly tipoMime: string;
  /** L'immagine come data URI. */
  readonly dati: string;
  /** Dimensione del file originale, prima della codifica. */
  readonly dimensioneByte: number;
  readonly caricataIl: Date;
}

export interface NuovaImmagine {
  readonly ubicazioneId: string;
  readonly didascalia: string | null;
  readonly tipoMime: string;
  readonly dati: string;
  readonly dimensioneByte: number;
}

export interface ImmaginiStore {
  elenca(identificativo: string): Promise<readonly ImmagineUbicazione[]>;
  quante(identificativo: string, ubicazioneId: string): Promise<number>;
  aggiungi(
    identificativo: string,
    immagine: NuovaImmagine,
    utenteId: string | null,
  ): Promise<ImmagineUbicazione>;
  /** `false` se l'immagine non esiste o appartiene a un altro intermediario. */
  rimuovi(identificativo: string, immagineId: string): Promise<boolean>;
}

/**
 * Sintesi dell'ultima analisi per azienda.
 *
 * Alimenta la vista portafoglio, che è la funzione con il ritorno commerciale più immediato:
 * «mostrami tutte le aziende che seguo non conformi all'obbligo CAT NAT» è una lista di
 * telefonate da fare, non un cruscotto da guardare.
 */
export interface VoceportafoglioAzienda {
  readonly identificativo: string;
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly provincia: string | null;
  readonly atecoDescrizione: string | null;
  /**
   * `null` quando il merito non è determinabile su quell'impresa.
   *
   * La colonna del database lo diceva già — `score_credito` è annullabile — ed era questo
   * strato a schiacciare l'assenza su zero con un `?? 0`. In un portafoglio zero non è un
   * buco: è il punteggio peggiore possibile, ordina l'impresa in cima alla lista dei
   * rischi e trascina all'ingiù ogni media. La distinzione esisteva in fondo e si perdeva
   * a un passo dallo schermo.
   */
  readonly scoreCredito: number | null;
  readonly classeCredito: string;
  readonly statoCatNat: string;
  readonly catNatConforme: boolean;
  readonly coperturaAssente: number;
  /** Coperture senza capitale determinabile: qualificano l'esposizione, non la sommano. */
  readonly coperturaDaQuantificare: number;
  readonly rischiCritici: number;
  readonly esposizioneNonAssicurataCentesimi: number;
  readonly completezza: number;
  readonly azionePrioritaria: string | null;
  readonly analizzataIl: Date;
}

/** Aziende del portafoglio che condividono un socio con quella indicata. */
export interface CollegamentoSocietarioDto {
  readonly socioDenominazione: string;
  readonly socioCodiceFiscale: string;
  readonly aziende: readonly {
    readonly identificativo: string;
    readonly denominazione: string;
    readonly quotaPercentuale: number | null;
    readonly diControllo: boolean;
  }[];
}

export interface PortafoglioStore {
  registra(voce: VoceportafoglioAzienda): Promise<void>;
  elenco(): Promise<readonly VoceportafoglioAzienda[]>;
  /**
   * Collegamenti societari dentro il portafoglio.
   *
   * Richiede la persistenza: in modalità dimostrativa non c'è un archivio su cui
   * incrociare le compagini, e restituire un elenco vuoto è più onesto che simulare
   * legami inventati fra aziende di prova.
   */
  collegamenti(identificativo: string): Promise<readonly CollegamentoSocietarioDto[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementazioni in memoria (test e modalità dimostrativa senza database)
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryDossierStore implements DossierStore {
  readonly #dossier = new Map<string, DossierAzienda>();

  get(identificativo: string): Promise<DossierAzienda | null> {
    return Promise.resolve(this.#dossier.get(normalizza(identificativo)) ?? null);
  }

  upsert(identificativo: string, patch: PatchDossier): Promise<DossierAzienda> {
    const chiave = normalizza(identificativo);
    const corrente = this.#dossier.get(chiave);

    const aggiornato: DossierAzienda = {
      identificativo: chiave,
      datiDichiarati: unisciDati(corrente?.datiDichiarati, patch.datiDichiarati),
      polizze: patch.polizze ?? corrente?.polizze ?? [],
      aggiornatoIl: new Date(),
    };

    this.#dossier.set(chiave, aggiornato);
    return Promise.resolve(aggiornato);
  }
}

export class MemoryImmaginiStore implements ImmaginiStore {
  readonly #per = new Map<string, ImmagineUbicazione[]>();
  #contatore = 0;

  elenca(identificativo: string): Promise<readonly ImmagineUbicazione[]> {
    return Promise.resolve(this.#per.get(normalizza(identificativo)) ?? []);
  }

  async quante(identificativo: string, ubicazioneId: string): Promise<number> {
    const tutte = await this.elenca(identificativo);
    return tutte.filter((i) => i.ubicazioneId === ubicazioneId).length;
  }

  aggiungi(
    identificativo: string,
    immagine: NuovaImmagine,
    _utenteId: string | null,
  ): Promise<ImmagineUbicazione> {
    const chiave = normalizza(identificativo);
    this.#contatore += 1;
    const salvata: ImmagineUbicazione = {
      id: `img-${this.#contatore}`,
      ubicazioneId: immagine.ubicazioneId,
      didascalia: immagine.didascalia,
      tipoMime: immagine.tipoMime,
      dati: immagine.dati,
      dimensioneByte: immagine.dimensioneByte,
      caricataIl: new Date(),
    };

    const elenco = this.#per.get(chiave) ?? [];
    elenco.push(salvata);
    this.#per.set(chiave, elenco);
    return Promise.resolve(salvata);
  }

  rimuovi(identificativo: string, immagineId: string): Promise<boolean> {
    const chiave = normalizza(identificativo);
    const elenco = this.#per.get(chiave);
    if (elenco === undefined) return Promise.resolve(false);

    const indice = elenco.findIndex((i) => i.id === immagineId);
    if (indice === -1) return Promise.resolve(false);

    elenco.splice(indice, 1);
    return Promise.resolve(true);
  }
}

export class MemoryPortafoglioStore implements PortafoglioStore {
  readonly #voci = new Map<string, VoceportafoglioAzienda>();

  registra(voce: VoceportafoglioAzienda): Promise<void> {
    this.#voci.set(normalizza(voce.identificativo), voce);
    return Promise.resolve();
  }

  elenco(): Promise<readonly VoceportafoglioAzienda[]> {
    return Promise.resolve([...this.#voci.values()].sort(perUrgenza));
  }

  collegamenti(): Promise<readonly CollegamentoSocietarioDto[]> {
    return Promise.resolve([]);
  }
}

/** Ordine di lavoro: prima le non conformi a un obbligo di legge, poi per esposizione. */
export function perUrgenza(a: VoceportafoglioAzienda, b: VoceportafoglioAzienda): number {
  if (a.catNatConforme !== b.catNatConforme) return a.catNatConforme ? 1 : -1;
  return b.esposizioneNonAssicurataCentesimi - a.esposizioneNonAssicurataCentesimi;
}

/**
 * Merge parziale: la UI invia solo i campi toccati, non tutto il questionario.
 * Un campo assente significa «non toccare», non «cancella»: la distinzione è ciò che
 * evita di perdere mezz'ora di intervista con un salvataggio parziale.
 */
export function unisciDati(
  corrente: DatiDichiarati | undefined,
  patch: Partial<DatiDichiarati> | undefined,
): DatiDichiarati {
  const base = corrente ?? DATI_DICHIARATI_VUOTI;
  if (patch === undefined) return base;

  const out = { ...base } as Record<string, unknown>;
  // `Object.entries` è ottimista: dichiara i valori come non opzionali anche per le
  // proprietà facoltative, che a runtime arrivano benissimo come `undefined`.
  for (const [chiave, valore] of Object.entries(patch) as [string, unknown][]) {
    if (valore !== undefined) out[chiave] = valore;
  }
  return out as unknown as DatiDichiarati;
}

export function normalizza(identificativo: string): string {
  return identificativo.trim().toUpperCase().replace(/\s/g, '');
}
