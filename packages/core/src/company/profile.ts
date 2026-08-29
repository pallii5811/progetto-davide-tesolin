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
import type { IndicatoriFornitore } from './indicatori-fornitore.js';

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
  /**
   * Frazione o località.
   *
   * Su un rischio incendio o catastrofale non è un dettaglio postale: due frazioni dello
   * stesso comune possono stare una in golena e l'altra sul rilievo, e il perito che va
   * a vedere deve trovare il posto giusto.
   */
  readonly frazione: string | null;
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
  /**
   * Data di cessazione dichiarata dal registro.
   *
   * Distingue «cessata di recente» da «cessata da anni»: sulla prima ci sono ancora
   * polizze in corso da gestire e responsabilità postume degli amministratori, sulla
   * seconda non c'è più niente da fare. Lo stato da solo non lo dice.
   */
  readonly dataCessazione: Date | null;
  /**
   * Codice fiscale cessato.
   *
   * Un codice fiscale chiuso mentre la posizione risulta ancora attiva è una
   * contraddizione che va vista prima di emettere: quasi sempre è una cessazione in
   * corso che il registro non ha ancora propagato.
   */
  readonly codiceFiscaleCessato: boolean | null;
  /** Codice catastale del comune (Belfiore): identifica il territorio senza ambiguità. */
  readonly codiceCatastale: string | null;
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
  /**
   * Da quando detiene la quota.
   *
   * Un cambio di compagine recente è un fatto che pesa: cambia chi decide, spesso cambia
   * la strategia, e su una D&O o una fideiussione è la prima cosa che un assuntore
   * chiede. Senza questa data un passaggio di controllo di tre mesi fa è indistinguibile
   * da un assetto fermo da vent'anni.
   */
  readonly socioDal: Date | null;
}

export interface Carica {
  readonly nominativo: string;
  readonly codiceFiscale: string | null;
  readonly ruolo: string;
  readonly dataNomina: Date | null;
  /** Un amministratore unico o un titolare effettivo è, di norma, anche una persona chiave. */
  readonly isRappresentanteLegale: boolean;
  /**
   * Età, data e luogo di nascita.
   *
   * Non è anagrafe per curiosità: l'età degli amministratori è un fattore di rischio
   * riconosciuto sulla continuità aziendale — un amministratore unico ottantenne senza
   * successione è un rischio di persona chiave che nessun bilancio mostra — e serve alle
   * verifiche antiriciclaggio sul titolare effettivo.
   */
  readonly eta: number | null;
  readonly dataNascita: Date | null;
  readonly luogoNascita: string | null;
}

export interface Assetti {
  readonly soci: readonly Socio[];
  readonly cariche: readonly Carica[];
  readonly controllante: CompanyIdentity | null;
  readonly controllate: readonly CompanyIdentity[];
}

/**
 * Il gruppo societario come lo dichiara il registro.
 *
 * Sezione a sé e non campo dentro `Assetti`, per provenienza: la compagine arriva
 * dall'anagrafica estesa, il gruppo dal profilo completo. Infilarlo dentro l'oggetto
 * tracciato degli assetti attribuirebbe a un servizio un fatto che non ha mai mandato — e
 * la provenienza è ciò che rende difendibile un fascicolo.
 *
 * Il dato veniva estratto dal mappatore, aveva persino un collaudo, e poi non entrava da
 * nessuna parte perché il modello canonico non aveva un posto dove metterlo: si perdeva
 * nel passaggio, in silenzio, dopo essere stato pagato.
 */
export interface GruppoSocietario {
  /** `null` quando il registro non si pronuncia: un gruppo non dichiarato non è un gruppo assente. */
  readonly appartieneAGruppo: boolean | null;
  readonly denominazione: string | null;
  /**
   * Chi sta al vertice, come testo e nient'altro.
   *
   * Si chiama `verticeDichiarato` e non `capogruppo` perché non è la stessa cosa di
   * `AssettoProprietario.capogruppo`: quella è la **società** socia di controllo, e porta
   * una partita IVA con cui l'interfaccia costruisce un collegamento analizzabile. Qui il
   * vertice può essere una **persona fisica** — osservato su una risposta reale — e un
   * collegamento verso di essa produrrebbe una ricerca a vuoto, per giunta a pagamento.
   */
  readonly verticeDichiarato: string | null;
  readonly controllateTotali: number | null;
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
  /**
   * Stato di insolvenza accertato dal tribunale.
   *
   * Non è «altro»: è il **presupposto** della liquidazione giudiziale (art. 2 CCII), cioè
   * la condizione in cui l'impresa non è più in grado di soddisfare regolarmente le proprie
   * obbligazioni. Osservato su una risposta reale il 20/08/2026, dove finiva nel secchio
   * generico — su un prodotto che valuta il merito di credito è la classificazione peggiore
   * che si possa sbagliare.
   */
  | 'stato-insolvenza'
  | 'concordato-preventivo'
  | 'composizione-negoziata'
  | 'liquidazione-coatta'
  | 'amministrazione-straordinaria'
  | 'accordo-ristrutturazione'
  /** Misure cautelari o protettive concesse dal tribunale (art. 54 CCII). */
  | 'misure-protettive'
  | 'scioglimento'
  | 'altro';

export interface ProceduraConcorsuale {
  readonly tipo: TipoProcedura;
  readonly dataApertura: Date;
  readonly dataChiusura: Date | null;
  /**
   * Data di **revoca** del provvedimento, quando c'è.
   *
   * Una procedura revocata è finita esattamente come una chiusa, ma il registro la segnala
   * su un campo diverso e lascia `data_chiusura` vuota. Osservato il 20/08/2026: misure
   * cautelari revocate il 29/02/2024 risultavano ancora aperte, e `aperta` è il flag che
   * **azzera il punteggio di credito**. Su un'impresa il cui unico provvedimento fosse
   * stato revocato, il prodotto avrebbe negato il fido a un'azienda risanata.
   */
  readonly dataRevoca: Date | null;
  /**
   * Data di **omologa**, per le procedure che la prevedono.
   *
   * Un concordato omologato dal tribunale e uno ancora in attesa sono due rischi diversi:
   * il primo ha un piano approvato e vincolante, il secondo può ancora finire in
   * liquidazione giudiziale.
   */
  readonly dataOmologa: Date | null;
  readonly tribunale: string | null;
  /** Vera solo se il provvedimento non è né chiuso né revocato. */
  readonly aperta: boolean;
  /**
   * La dicitura del registro, testuale.
   *
   * Veniva scartata, e con essa l'unica formulazione che si possa citare senza
   * interpretarla. La classificazione serve al calcolo; questa serve al documento — «STATO
   * DI INSOLVENZA» detto dal registro vale più di qualunque etichetta nostra, e davanti a
   * una contestazione è ciò che si mostra.
   */
  readonly descrizione: string | null;
}

export interface EventiNegativi {
  readonly protesti: readonly Protesto[];
  readonly pregiudizievoli: readonly Pregiudizievole[];
  readonly procedure: readonly ProceduraConcorsuale[];
  /**
   * Il registro **dichiara** la presenza di eventi di cui non ha fornito il dettaglio.
   *
   * Non è una sottigliezza: l'archivio risponde con tre indicatori booleani accanto agli
   * elenchi, e gli elenchi possono arrivare vuoti anche quando gli indicatori dicono di
   * sì — dettaglio non incluso nel servizio, oppure ancora in lavorazione.
   *
   * Trattare quel caso come «nessun evento» significa emettere un certificato di buona
   * salute su un'impresa protestata, sul fattore che pesa il **venti per cento** dello
   * score di credito. Un elenco vuoto e un elenco ignoto sono due cose opposte, e vanno
   * tenute distinte fino a schermo.
   */
  readonly presenzaDichiarataSenzaDettaglio: readonly ('protesti' | 'pregiudizievoli' | 'procedure')[];
}

export const NESSUN_EVENTO_NEGATIVO: EventiNegativi = {
  protesti: [],
  pregiudizievoli: [],
  procedure: [],
  presenzaDichiarataSenzaDettaglio: [],
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
 * Le voci di bilancio rilevate in intervista, dal documento che l'impresa ha già.
 *
 * Nasce da una misura, non da un'idea. L'anagrafica estesa porta gli aggregati sintetici
 * — fatturato, patrimonio netto, totale attivo, costo del personale — ma non lo schema
 * CEE, che è un servizio a parte e costa cinquanta volte tanto.
 *
 * Misurato sull'azienda dimostrativa privata del bilancio dettagliato, cioè su ciò che
 * l'utente vede davvero in produzione: contenuto, scorte, danni indiretti e fido clienti
 * tutti «non determinabile», Altman assente, ritenzione assente, e l'esposizione non
 * assicurata che scende da 8,1 a 2,4 milioni — il settanta per cento in meno, non perché
 * l'impresa sia più coperta ma perché il prodotto non sa contare.
 *
 * Quelle voci però **non vanno comprate**: stanno nel bilancio depositato, che
 * l'imprenditore porta all'appuntamento. Si leggono dal suo documento in due minuti.
 *
 * Tre regole, le stesse di tutto il prodotto:
 *
 *  - ogni voce resta `null` finché nessuno la scrive. Uno zero inventato sulle rimanenze
 *    produce «attività senza magazzino» su un'impresa che il magazzino ce l'ha;
 *  - il dichiarato **non scavalca** il registro: se il bilancio dettagliato è stato
 *    acquistato, vince quello;
 *  - dove un capitale nasce da una dichiarazione la confidenza scende e il documento lo
 *    scrive. Un numero rilevato in intervista è vero, ma ne risponde chi l'ha detto.
 */
export interface BilancioDichiarato {
  /** L'esercizio a cui le voci si riferiscono, per non mescolare due anni diversi. */
  readonly anno: number | null;
  /** Voce C-I dell'attivo: base della somma assicuranda per merci e scorte. */
  readonly rimanenze: Euro | null;
  /** Voce C-II-1: base dell'assicurazione del credito commerciale. */
  readonly creditiVersoClienti: Euro | null;
  /**
   * Voci B-II-2 e B-II-3 sommate: impianti, macchinario, attrezzature.
   *
   * Al **costo storico lordo** se la nota integrativa lo riporta. Il valore netto
   * contabile è già ammortizzato e sottostima il costo di rimpiazzo: è la sorgente più
   * comune di sottoassicurazione sul contenuto.
   */
  readonly impiantiEAttrezzature: Euro | null;
  /** Se il valore sopra è al lordo degli ammortamenti: cambia il coefficiente applicato. */
  readonly impiantiAlCostoStorico: boolean | null;
  /** Voce B-6 del conto economico: materie prime, sussidiarie, di consumo e merci. */
  readonly costiMateriePrime: Euro | null;
  /** Voce B-7: costi per servizi. La quota variabile si stima, e si dichiara. */
  readonly costiServizi: Euro | null;
}

export const BILANCIO_DICHIARATO_VUOTO: BilancioDichiarato = {
  anno: null,
  rimanenze: null,
  creditiVersoClienti: null,
  impiantiEAttrezzature: null,
  impiantiAlCostoStorico: null,
  costiMateriePrime: null,
  costiServizi: null,
};

/**
 * Ciò che il bilancio non può dire e che l'intermediario raccoglie in intervista.
 * Tutti i campi sono opzionali: il motore deve produrre un'analisi utile anche a
 * questionario vuoto, e migliorarla man mano che viene compilato.
 */
export interface DatiDichiarati {
  /** Voci lette dal bilancio depositato che l'impresa porta all'appuntamento. */
  readonly bilancio: BilancioDichiarato;
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
  bilancio: BILANCIO_DICHIARATO_VUOTO,
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
  /**
   * Il perimetro di gruppo dichiarato dal registro. `null` finché non lo si acquista.
   *
   * Fratello di `unitaLocali` e non campo di `Assetti`: arriva dallo stesso servizio, e
   * come quello va tracciato alla fonte che l'ha venduto.
   */
  readonly gruppo: Sourced<GruppoSocietario> | null;
  /**
   * Indicatori e qualifiche già elaborati dall'archivio camerale.
   *
   * Arrivano con il profilo completo e costano zero in più: sono compresi nei
   * quarantotto centesimi già spesi. Restano vuoti quando quel servizio non è stato
   * acquistato — mai riempiti di zeri, che su un indice di redditività sarebbero
   * un'affermazione falsa.
   */
  readonly indicatoriFornitore: IndicatoriFornitore;
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
