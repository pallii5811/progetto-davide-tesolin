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

import { DATI_DICHIARATI_VUOTI, perPrioritaDiIntervento } from '@aegis/core';
import type { DatiDichiarati, PolizzaInEssere, StatoCrm, VoceCrm } from '@aegis/core';

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
  /** Le tre protezioni, per il CRM in memoria: facoltative, come per chi registra senza. */
  readonly propertyRisk?: number | null | undefined;
  readonly biPunteggio?: number | null | undefined;
  readonly biPerditaGiornalieraCentesimi?: number | null | undefined;
  readonly cyberRisk?: number | null | undefined;
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
// CRM
// ─────────────────────────────────────────────────────────────────────────────

/** Ciò che l'intermediario cambia a mano: un campo assente non si tocca. */
export interface ModificheCrm {
  readonly stato?: StatoCrm | undefined;
  readonly nota?: string | null | undefined;
}

/** Un'azienda di un elenco comprato, come arriva dal fornitore. */
export interface AziendaDaElenco {
  readonly partitaIva: string;
  readonly denominazione: string;
  readonly comune: string | null;
  readonly provincia: string | null;
  readonly ateco: string | null;
}

/**
 * Il CRM dello studio (17/09/2026, «AEGIS - cambi.pptx»): le aziende analizzate e quelle degli
 * elenchi comprati, con stato e nota, in ordine di priorità di intervento.
 */
export interface CrmStore {
  elenco(): Promise<readonly VoceCrm[]>;
  /** `false` se lo studio non conosce l'azienda. */
  aggiorna(identificativo: string, modifiche: ModificheCrm): Promise<boolean>;
  /** Le aziende di un elenco comprato entrano nel CRM e ci restano. */
  salvaDaElenco(aziende: readonly AziendaDaElenco[]): Promise<void>;
  /**
   * Quante aziende di una combinazione di filtri sono già state comprate, e quali
   * (18/09/2026): il prossimo elenco con gli stessi filtri riparte da lì.
   */
  elencoScaricato(chiave: string): Promise<ElencoScaricato>;
  /** Il contatore non torna mai indietro, e le partite IVA si sommano. */
  registraElencoScaricato(chiave: string, scaricate: number, partiteIva: readonly string[]): Promise<void>;
}

/** Quante posizioni di una combinazione di filtri sono già state comprate, e quali aziende. */
export interface ElencoScaricato {
  readonly scaricate: number;
  readonly partiteIva: readonly string[];
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

/**
 * Il CRM senza database: le aziende analizzate le legge dal portafoglio in memoria, quelle
 * degli elenchi e le modifiche le tiene per conto suo. Senza contatti, che stanno nel record
 * camerale congelato e in memoria non c'è.
 */
export class MemoryCrmStore implements CrmStore {
  readonly #daElenco = new Map<string, { readonly azienda: AziendaDaElenco; readonly quando: Date }>();
  readonly #modifiche = new Map<string, { stato: StatoCrm; nota: string | null; quando: Date }>();
  readonly #aggiunte = new Map<string, Date>();
  readonly #portafoglio: PortafoglioStore;

  constructor(portafoglio: PortafoglioStore) {
    this.#portafoglio = portafoglio;
  }

  async elenco(): Promise<readonly VoceCrm[]> {
    const analizzate = await this.#portafoglio.elenco();
    const chiavi = new Set([
      ...analizzate.map((v) => normalizza(v.identificativo)),
      ...this.#daElenco.keys(),
    ]);

    const voci = [...chiavi].map((chiave): VoceCrm => {
      const analisi = analizzate.find((v) => normalizza(v.identificativo) === chiave);
      const elenco = this.#daElenco.get(chiave);
      const modifica = this.#modifiche.get(chiave);
      if (!this.#aggiunte.has(chiave)) {
        this.#aggiunte.set(chiave, elenco?.quando ?? analisi?.analizzataIl ?? new Date());
      }
      return {
        identificativo: chiave,
        denominazione: analisi?.denominazione ?? elenco?.azienda.denominazione ?? chiave,
        partitaIva: analisi?.partitaIva ?? elenco?.azienda.partitaIva ?? null,
        comune: elenco?.azienda.comune ?? null,
        provincia: analisi?.provincia ?? elenco?.azienda.provincia ?? null,
        atecoDescrizione: analisi?.atecoDescrizione ?? elenco?.azienda.ateco ?? null,
        telefono: null,
        pec: null,
        sitoWeb: null,
        stato: modifica?.stato ?? 'da-contattare',
        nota: modifica?.nota ?? null,
        scoreCredito: analisi?.scoreCredito ?? null,
        classeCredito: analisi?.classeCredito ?? null,
        propertyRisk: analisi?.propertyRisk ?? null,
        biPunteggio: analisi?.biPunteggio ?? null,
        biPerditaGiornalieraCentesimi: analisi?.biPerditaGiornalieraCentesimi ?? null,
        cyberRisk: analisi?.cyberRisk ?? null,
        analizzataIl: analisi?.analizzataIl ?? null,
        daElencoIl: elenco?.quando ?? null,
        statoAggiornatoIl: modifica?.quando ?? null,
        aggiuntaIl: this.#aggiunte.get(chiave) ?? new Date(),
      };
    });
    return voci.sort(perPrioritaDiIntervento);
  }

  async aggiorna(identificativo: string, modifiche: ModificheCrm): Promise<boolean> {
    const chiave = normalizza(identificativo);
    const voce = (await this.elenco()).find((v) => v.identificativo === chiave);
    if (voce === undefined) return false;
    this.#modifiche.set(chiave, {
      stato: modifiche.stato ?? voce.stato,
      nota: modifiche.nota === undefined ? voce.nota : modifiche.nota,
      quando: new Date(),
    });
    return true;
  }

  salvaDaElenco(aziende: readonly AziendaDaElenco[]): Promise<void> {
    for (const azienda of aziende) {
      const chiave = normalizza(azienda.partitaIva);
      // Il primo arrivo resta: ricomprare lo stesso elenco non cambia la data.
      if (!this.#daElenco.has(chiave)) this.#daElenco.set(chiave, { azienda, quando: new Date() });
    }
    return Promise.resolve();
  }

  readonly #elenchi = new Map<string, { scaricate: number; partiteIva: ReadonlySet<string> }>();

  elencoScaricato(chiave: string): Promise<ElencoScaricato> {
    const voce = this.#elenchi.get(chiave);
    return Promise.resolve(
      voce === undefined
        ? { scaricate: 0, partiteIva: [] }
        : { scaricate: voce.scaricate, partiteIva: [...voce.partiteIva] },
    );
  }

  registraElencoScaricato(chiave: string, scaricate: number, partiteIva: readonly string[]): Promise<void> {
    const voce = this.#elenchi.get(chiave);
    this.#elenchi.set(chiave, {
      scaricate: Math.max(voce?.scaricate ?? 0, scaricate),
      partiteIva: new Set([...(voce?.partiteIva ?? []), ...partiteIva]),
    });
    return Promise.resolve();
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
