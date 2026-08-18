/**
 * Modello canonico dell'azienda.
 *
 * Struttura a sezioni, non a campi: ogni sezione corrisponde a una chiamata distinta al
 * provider, con un costo, un timestamp e una confidenza propri. Modellarlo così rende
 * naturale sia il governo dei costi (si acquisisce solo la sezione che serve) sia la
 * provenienza (`Sourced` per sezione, non per campo, evitando un modello illeggibile).
 */

import type { Sourced } from '../shared/provenance.js';
import type { Money as Euro } from '../shared/money.js';
import type { AtecoCode, CodiceFiscale, PartitaIva } from '../shared/identifiers.js';
import type { Bilancio, BilancioSintetico } from './financials.js';

// ─────────────────────────────────────────────────────────────────────────────
// Identità
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyIdentity {
  readonly partitaIva: PartitaIva | null;
  readonly codiceFiscale: CodiceFiscale | null;
  readonly denominazione: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anagrafica
// ─────────────────────────────────────────────────────────────────────────────

export type StatoAttivita = 'attiva' | 'inattiva' | 'sospesa' | 'cessata' | 'in-liquidazione' | 'fallita';

/**
 * Forma giuridica normalizzata. Rileva per la responsabilità dei soci, per la D&O
 * e per l'obbligo di deposito del bilancio.
 */
export type FormaGiuridica =
  | 'spa'
  | 'srl'
  | 'srls'
  | 'sapa'
  | 'snc'
  | 'sas'
  | 'ditta-individuale'
  | 'cooperativa'
  | 'consorzio'
  | 'associazione'
  | 'fondazione'
  | 'ente-pubblico'
  | 'altro';

/** Le società di capitali depositano il bilancio: l'analisi finanziaria è possibile. */
export const FORME_CON_BILANCIO_DEPOSITATO: readonly FormaGiuridica[] = [
  'spa',
  'srl',
  'srls',
  'sapa',
  'cooperativa',
  'consorzio',
];

/** Nelle società di persone i soci rispondono illimitatamente: cambia l'analisi del rischio. */
export const FORME_A_RESPONSABILITA_ILLIMITATA: readonly FormaGiuridica[] = [
  'snc',
  'sas',
  'ditta-individuale',
  'sapa',
];

export interface Indirizzo {
  readonly via: string;
  readonly civico: string | null;
  readonly cap: string;
  readonly comune: string;
  readonly provincia: string;
  readonly regione: string | null;
  readonly latitudine: number | null;
  readonly longitudine: number | null;
}

export type TipoUnitaLocale =
  'sede-legale' | 'sede-operativa' | 'stabilimento' | 'magazzino' | 'punto-vendita' | 'ufficio' | 'altro';

export interface UnitaLocale {
  readonly tipo: TipoUnitaLocale;
  readonly indirizzo: Indirizzo;
  readonly attivita: string | null;
  readonly addetti: number | null;
}

export interface Anagrafica {
  readonly formaGiuridica: FormaGiuridica;
  readonly formaGiuridicaDescrizione: string;
  readonly statoAttivita: StatoAttivita;
  readonly dataCostituzione: Date | null;
  readonly dataInizioAttivita: Date | null;
  readonly numeroREA: string | null;
  readonly cciaa: string | null;
  readonly atecoPrimario: AtecoCode | null;
  readonly atecoPrimarioDescrizione: string | null;
  readonly atecoSecondari: readonly AtecoCode[];
  readonly sedeLegale: Indirizzo | null;
  readonly capitaleSocialeDeliberato: Euro | null;
  readonly capitaleSocialeVersato: Euro | null;
  readonly pec: string | null;
  readonly sitoWeb: string | null;
  readonly telefono: string | null;
  readonly numeroAddetti: number | null;
  readonly fatturatoDichiarato: Euro | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assetti proprietari e cariche
// ─────────────────────────────────────────────────────────────────────────────

export interface Socio {
  readonly denominazione: string;
  readonly codiceFiscale: string | null;
  readonly tipo: 'persona-fisica' | 'persona-giuridica';
  readonly quotaPercentuale: number | null;
  readonly quotaValore: Euro | null;
}

export interface Carica {
  readonly nominativo: string;
  readonly codiceFiscale: string | null;
  readonly ruolo: string;
  readonly dataNomina: Date | null;
  /** Un amministratore unico o un titolare effettivo è, di norma, anche una persona chiave. */
  readonly isRappresentanteLegale: boolean;
}

export interface Assetti {
  readonly soci: readonly Socio[];
  readonly cariche: readonly Carica[];
  readonly controllante: CompanyIdentity | null;
  readonly controllate: readonly CompanyIdentity[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventi negativi
// ─────────────────────────────────────────────────────────────────────────────

export interface Protesto {
  readonly data: Date;
  readonly importo: Euro;
  readonly tipo: string;
  readonly luogo: string | null;
  readonly levato: boolean;
}

export type TipoPregiudizievole =
  | 'ipoteca-giudiziale'
  | 'pignoramento'
  | 'sequestro'
  | 'domanda-giudiziale'
  | 'decreto-ingiuntivo'
  | 'altro';

export interface Pregiudizievole {
  readonly data: Date;
  readonly tipo: TipoPregiudizievole;
  readonly importo: Euro | null;
  readonly descrizione: string;
}

export type TipoProcedura =
  | 'fallimento'
  | 'liquidazione-giudiziale'
  | 'concordato-preventivo'
  | 'composizione-negoziata'
  | 'liquidazione-coatta'
  | 'amministrazione-straordinaria'
  | 'accordo-ristrutturazione'
  | 'scioglimento'
  | 'altro';

export interface ProceduraConcorsuale {
  readonly tipo: TipoProcedura;
  readonly dataApertura: Date;
  readonly dataChiusura: Date | null;
  readonly tribunale: string | null;
  readonly aperta: boolean;
}

export interface EventiNegativi {
  readonly protesti: readonly Protesto[];
  readonly pregiudizievoli: readonly Pregiudizievole[];
  readonly procedure: readonly ProceduraConcorsuale[];
}

export const NESSUN_EVENTO_NEGATIVO: EventiNegativi = {
  protesti: [],
  pregiudizievoli: [],
  procedure: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Dati dichiarati dal cliente (intervista dell'intermediario)
// ─────────────────────────────────────────────────────────────────────────────

export type TitoloOccupazione = 'proprieta' | 'locazione' | 'comodato' | 'leasing' | 'misto';

export interface ImmobileDichiarato {
  readonly descrizione: string;
  readonly indirizzo: Indirizzo | null;
  readonly superficieMq: number | null;
  readonly titolo: TitoloOccupazione;
  /** Classe di rischio costruttivo: incide sul costo di ricostruzione e sul rischio incendio. */
  readonly tipologiaCostruttiva:
    'muratura' | 'cemento-armato' | 'prefabbricato' | 'acciaio' | 'legno' | 'misto' | null;
  readonly annoCostruzione: number | null;
  readonly presenzaImpiantoAntincendio: boolean | null;
  readonly presenzaAllarme: boolean | null;
  /**
   * Compartimentazione antincendio (muri e porte REI).
   *
   * È il dato che più abbassa il danno massimo probabile: un compartimento confina
   * l'incendio, e il danno atteso diventa una frazione del valore complessivo. Senza
   * questa informazione il danno va stimato sul valore intero — non per prudenza formale,
   * ma perché non c'è nulla che dica il contrario.
   */
  readonly compartimentazioneRei: boolean | null;
  /**
   * Impianto sprinkler o altra estinzione automatica.
   *
   * Distinto da `presenzaImpiantoAntincendio`, che comprende anche estintori e idranti:
   * quelli richiedono una persona presente, uno sprinkler no. Sul danno probabile è una
   * differenza sostanziale, e le compagnie la trattano in modo diverso.
   */
  readonly impiantoSprinkler: boolean | null;
}

/**
 * Ciò che il bilancio non può dire e che l'intermediario raccoglie in intervista.
 * Tutti i campi sono opzionali: il motore deve produrre un'analisi utile anche a
 * questionario vuoto, e migliorarla man mano che viene compilato.
 */
export interface DatiDichiarati {
  readonly immobili: readonly ImmobileDichiarato[];
  readonly numeroVeicoli: number | null;
  readonly numeroDipendenti: number | null;
  readonly quotaExportPercentuale: number | null;
  readonly esportaVersoUsaCanada: boolean | null;
  readonly trattaDatiPersonali: boolean | null;
  readonly trattaDatiParticolari: boolean | null;
  readonly haSitoEcommerce: boolean | null;
  readonly haModello231: boolean | null;
  readonly certificazioni: readonly string[];
  readonly numeroClientiPrincipaliSuFatturato: number | null;
  /** Quota di fatturato concentrata sul primo cliente: rischio di credito e di continuità. */
  readonly concentrazionePrimoCliente: number | null;
  readonly lavoraInCantiere: boolean | null;
  readonly produceBeniFinali: boolean | null;
  readonly trasportaMerciProprie: boolean | null;
  readonly periodoIndennizzoMesi: number | null;
  /**
   * Quanto rischio il titolare è disposto a tenersi.
   *
   * Si chiede, non si deduce: un imprenditore prudente con mezzi solidi ha ogni diritto di
   * assicurare tutto, e dedurre la propensione dai numeri significherebbe decidere al suo
   * posto. È il primo passo dell'ISO 31000 — la definizione del contesto — e ciò che
   * rende il trattamento una decisione invece che un calcolo.
   */
  readonly propensioneAlRischio: 'prudente' | 'equilibrata' | 'incline-a-ritenere' | null;
}

export const DATI_DICHIARATI_VUOTI: DatiDichiarati = {
  immobili: [],
  numeroVeicoli: null,
  numeroDipendenti: null,
  quotaExportPercentuale: null,
  esportaVersoUsaCanada: null,
  trattaDatiPersonali: null,
  trattaDatiParticolari: null,
  haSitoEcommerce: null,
  haModello231: null,
  certificazioni: [],
  numeroClientiPrincipaliSuFatturato: null,
  concentrazionePrimoCliente: null,
  lavoraInCantiere: null,
  produceBeniFinali: null,
  trasportaMerciProprie: null,
  periodoIndennizzoMesi: null,
  propensioneAlRischio: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Profilo
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  readonly identity: CompanyIdentity;
  readonly anagrafica: Sourced<Anagrafica>;
  readonly assetti: Sourced<Assetti> | null;
  /** Bilanci in schema CEE dettagliato, in ordine decrescente di anno. Spesso vuoti: costano. */
  readonly bilanci: readonly Sourced<Bilancio>[];
  /**
   * Bilanci in forma sintetica, in ordine decrescente di anno.
   * Arrivano senza costo aggiuntivo con l'anagrafica estesa e coprono fino a dieci esercizi.
   */
  readonly bilanciSintetici: readonly Sourced<BilancioSintetico>[];
  readonly eventiNegativi: Sourced<EventiNegativi> | null;
  readonly unitaLocali: Sourced<readonly UnitaLocale[]> | null;
  readonly datiDichiarati: DatiDichiarati;
}

/** Bilancio più recente disponibile, o `null`. */
export function ultimoBilancio(profile: CompanyProfile): Sourced<Bilancio> | null {
  return profile.bilanci[0] ?? null;
}

/** Bilancio dell'esercizio precedente, per i confronti di trend. */
export function penultimoBilancio(profile: CompanyProfile): Sourced<Bilancio> | null {
  return profile.bilanci[1] ?? null;
}

export function ultimoBilancioSintetico(profile: CompanyProfile): Sourced<BilancioSintetico> | null {
  return profile.bilanciSintetici[0] ?? null;
}

export function penultimoBilancioSintetico(profile: CompanyProfile): Sourced<BilancioSintetico> | null {
  return profile.bilanciSintetici[1] ?? null;
}

/**
 * Livello di dati economici disponibili.
 * Determina quanto l'analisi può spingersi e cosa dichiarare all'utente.
 */
export function livelloDatiEconomici(profile: CompanyProfile): 'assente' | 'sintetico' | 'completo' {
  if (profile.bilanci.length > 0) return 'completo';
  if (profile.bilanciSintetici.length > 0) return 'sintetico';
  return 'assente';
}

/** Esercizi economici disponibili, a qualunque livello di dettaglio. */
export function eserciziDisponibili(profile: CompanyProfile): number {
  return Math.max(profile.bilanci.length, profile.bilanciSintetici.length);
}

export function haProceduraAperta(profile: CompanyProfile): boolean {
  return profile.eventiNegativi?.value.procedure.some((p) => p.aperta) ?? false;
}

export function isOperativa(profile: CompanyProfile): boolean {
  const stato = profile.anagrafica.value.statoAttivita;
  return stato === 'attiva' && !haProceduraAperta(profile);
}

/** Anni di attività alla data indicata. */
export function anniDiAttivita(profile: CompanyProfile, asOf: Date): number | null {
  const inizio = profile.anagrafica.value.dataInizioAttivita ?? profile.anagrafica.value.dataCostituzione;
  if (inizio === null) return null;
  const ms = asOf.getTime() - inizio.getTime();
  return Math.max(0, Math.floor(ms / (365.25 * 86_400_000)));
}
