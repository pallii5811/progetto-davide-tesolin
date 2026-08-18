/**
 * Accesso all'API dal server di Next.
 *
 * Tutte le chiamate avvengono in Server Component: la UI riceve HTML già calcolato,
 * l'analisi non transita per il browser e nessun token finisce nel bundle.
 */

import { NOME_COOKIE_SESSIONE } from './cookie-sessione';

export { NOME_COOKIE_SESSIONE };

const BASE_URL = process.env.AEGIS_API_URL ?? 'http://127.0.0.1:3001';

/**
 * L'indirizzo effettivo del servizio, per i messaggi di errore.
 *
 * Un avviso che nomina una porta fissa mentre la porta è configurabile manda a cercare
 * il guasto nel posto sbagliato: è già successo, con l'API su una porta diversa dalla
 * 3001 e l'interfaccia che continuava a indicare la 3001.
 */
export const INDIRIZZO_API = BASE_URL;

export interface MoneyDto {
  centesimi: number;
  euro: number;
  formattato: string;
}

export interface ExplanationDto {
  titolo: string;
  formula: string | null;
  input: { etichetta: string; valore: string; fonte: string | null }[];
  note: string[];
  riferimenti: string[];
}

export interface ExplainedDto<T> {
  valore: T;
  confidenza: string;
  spiegazione: ExplanationDto;
}

export interface RisultatoRicerca {
  partitaIva: string | null;
  denominazione: string;
  comune: string | null;
  provincia: string | null;
  ateco: string | null;
  attiva: boolean;
  statoAttivita: 'attiva' | 'inattiva' | 'sospesa' | 'cessata' | 'in-liquidazione' | 'fallita';
  providerId: string;
}

export type LivelloRischio = 'basso' | 'moderato' | 'rilevante' | 'alto' | 'critico';

export interface RischioDto {
  id: string;
  etichetta: string;
  descrizione: string;
  categoria: string;
  categoriaEtichetta: string;
  probabilita: number;
  probabilitaEtichetta: string;
  impatto: number;
  impattoEtichetta: string;
  punteggioInerente: number;
  livelloInerente: LivelloRischio;
  punteggioResiduo: number;
  livelloResiduo: LivelloRischio;
  livelloResiduoEtichetta: string;
  trattamento: string;
  trattamentoEtichetta: string;
  assicurabile: boolean;
  coperture: string[];
  controlliTipici: string[];
  riferimenti: string[];
  daVerificare: boolean;
  motivazioni: {
    identificazione: string[];
    modulazione: { motivazione: string; deltaProbabilita: number; deltaImpatto: number }[];
    controlli: { motivazione: string; deltaProbabilita: number; deltaImpatto: number }[];
  };
}

export type StatoGap =
  | 'assente'
  | 'sottoassicurata'
  | 'massimale-insufficiente'
  | 'in-scadenza'
  | 'adeguata'
  | 'da-quantificare';

export interface GapDto {
  copertura: string;
  etichetta: string;
  descrizione: string;
  categoriaEtichetta: string;
  stato: StatoGap;
  statoEtichetta: string;
  priorita: number;
  obbligoDiLegge: boolean;
  capitaleRaccomandato: ExplainedDto<MoneyDto | null>;
  capitaleInEssere: MoneyDto | null;
  polizza: {
    compagnia: string;
    numero: string | null;
    scadenza: string;
    premioAnnuo: MoneyDto | null;
  } | null;
  sottoassicurazione: {
    sottoassicurata: boolean;
    gradoDiCopertura: number;
    scoperturaDiCapitale: MoneyDto;
    simulazione: { danno: MoneyDto; indennizzo: MoneyDto; aCaricoAssicurato: MoneyDto };
    spiegazione: ExplanationDto;
  } | null;
  rischiServiti: { id: string; etichetta: string; livelloResiduo: LivelloRischio }[];
  azione: string;
  motivazioneAdeguatezza: string;
  /** Chi fa cosa ed entro quando: l'ISO 31000 chiede che il trattamento sia un piano. */
  piano: {
    urgenza: 'immediata' | 'entro-30-giorni' | 'alla-scadenza' | 'prossima-revisione';
    termine: string | null;
    aCura: 'intermediario' | 'cliente' | 'congiunta';
    motivazioneTermine: string;
  };
  insidie: string[];
}

export interface AnalisiDto {
  asOf: string;
  azienda: {
    denominazione: string;
    partitaIva: string | null;
    formaGiuridica: string;
    statoAttivita: string;
    ateco: string | null;
    atecoDescrizione: string | null;
    sedeLegale: { comune: string; provincia: string; via: string; civico: string | null } | null;
    dimensione: string;
    dimensioneEtichetta: string;
    anniDiAttivita: number | null;
    addetti: number | null;
    fonte: { descrizione: string; osservatoIl: string } | null;
  };
  completezza: {
    percentuale: number;
    livello: 'insufficiente' | 'parziale' | 'buona' | 'completa';
    punteggio: number;
    punteggioMassimo: number;
    compilati: string[];
    mancanti: {
      chiave: string;
      etichetta: string;
      area: string;
      areaEtichetta: string;
      beneficio: string;
      peso: number;
    }[];
  };
  sintesi: {
    scoreCredito: number;
    classeCredito: string;
    probabilitaDefault: number;
    fidoConsigliato: MoneyDto;
    rischiIdentificati: number;
    rischiDaTrasferire: number;
    rischiCritici: number;
    coperturaAssente: number;
    /** Coperture senza capitale ricavabile: «0 €» di esposizione con questo numero > 0 significa «ignoto». */
    coperturaDaQuantificare: number;
    /** `null` quando i beni non sono quantificabili con i dati disponibili. */
    patrimonioEsposto: MoneyDto | null;
    esposizioneNonAssicurata: MoneyDto;
    incidenzaEsposizioneSuPatrimonio: number | null;
    catNatConforme: boolean;
    datiDaCompletare: number;
    azioniPrioritarie: string[];
  };
  credito: {
    score: number;
    classe: string;
    probabilitaDefault: number;
    limitazione: string | null;
    confidenza: string;
    spiegazione: ExplanationDto;
    fattori: {
      chiave: string;
      etichetta: string;
      peso: number;
      punteggio: number | null;
      motivazione: string;
      dettagli: string[];
    }[];
    altman: { z: number; zona: string; spiegazione: ExplanationDto } | null;
    fido: {
      importo: MoneyDto;
      vincoloAttivo: string;
      limitePatrimoniale: MoneyDto;
      limiteDimensionale: MoneyDto;
      limiteFlusso: MoneyDto;
      fattoreScore: number;
      spiegazione: ExplanationDto;
    };
  };
  bilancio: {
    anno: number;
    fonte: { descrizione: string; osservatoIl: string } | null;
    contoEconomico: Record<string, MoneyDto>;
    statoPatrimoniale: Record<string, MoneyDto>;
    indici: {
      chiave: string;
      etichetta: string;
      formula: string;
      descrizione: string;
      valore: number | null;
      formattato: string;
      meglioSeAlto: boolean;
    }[];
  } | null;
  livelloDatiEconomici: 'assente' | 'sintetico' | 'completo';
  arricchimentiPossibili: { dato: string; sbloccherebbe: string[] }[];
  rischi: RischioDto[];
  rischiMeta: {
    totale: number;
    daTrasferire: number;
    daVerificare: number;
    versioneCatalogo: string;
    versioneRegole: string;
  };
  sommeAssicurande: Record<string, ExplainedDto<MoneyDto | null>>;
  /**
   * Danno massimo probabile. `disponibile: false` quando i beni non sono quantificabili:
   * un danno massimo su un valore ignoto sarebbe un numero senza significato.
   */
  dannoMassimo:
    | { disponibile: false; confidenza: string; spiegazione: ExplanationDto }
    | {
        disponibile: true;
        possibile: MoneyDto;
        probabile: MoneyDto;
        quota: number;
        forma: 'valore-intero' | 'primo-rischio-assoluto';
        motivazioneForma: string;
        domandeCheAbbassanoLaStima: string[];
        confidenza: string;
        spiegazione: ExplanationDto;
      };
  ritenzione: {
    disponibile: boolean;
    perSinistro?: MoneyDto;
    annua?: MoneyDto;
    franchigiaConsigliata?: MoneyDto;
    vincoloAttivo?: string;
    propensione?: string;
    propensioneDichiarata: boolean;
    effettoAtteso?: string;
    confidenza: string;
    spiegazione: ExplanationDto;
  };
  prevenzione: {
    rischio: string;
    etichettaRischio: string;
    misura: string;
    livelloAttuale: LivelloRischio;
    livelloConLaMisura: LivelloRischio;
    gradiniGuadagnati: number;
    accertataAssente: boolean;
  }[];
  catNat: {
    stato: 'non-soggetta' | 'in-scadenza' | 'inadempiente' | 'adempiente';
    soggetta: boolean;
    motivoEsclusione: string | null;
    termine: string | null;
    giorniAlTermine: number | null;
    baseAssicurabile: MoneyDto | null;
    beniInclusi: string[];
    eventiCoperti: string[];
    vincoliDiProdotto: string[];
    conseguenzeInadempimento: string[];
    spiegazione: ExplanationDto;
  };
  /** Dove l'impresa sta davvero: una scheda per ubicazione, non solo la sede legale. */
  ubicazioni: {
    elenco: {
      id: string;
      etichetta: string;
      origini: ('sede-legale' | 'unita-locale' | 'immobile-rilevato')[];
      tipo: string | null;
      comune: string;
      provincia: string;
      via: string;
      civico: string | null;
      cap: string;
      superficieMq: number | null;
      addetti: number | null;
      haCoordinate: boolean;
      sismica: 'alta' | 'media' | 'bassa';
      idraulica: 'alta' | 'media' | 'bassa';
      piuEsposta: boolean;
    }[];
    complessiIncendio: { ubicazioni: string[]; motivo: string }[];
    aggregatiTerritoriali: { ubicazioni: string[]; motivo: string }[];
    unicoComplesso: boolean;
    distanzaMassimaKm: number | null;
    province: string[];
    comuni: string[];
    domande: string[];
    note: string[];
    confidenza: string;
  };

  /** Chi possiede e chi risponde: presupposto di D&O e key man. */
  assetto: {
    tipoControllo:
      | 'socio-unico-persona-fisica'
      | 'controllo-societario'
      | 'maggioranza-persona-fisica'
      | 'compagine-paritetica'
      | 'compagine-frammentata'
      | 'non-disponibile';
    tipoControlloEtichetta: string;
    numeroSoci: number;
    soci: {
      denominazione: string;
      codiceFiscale: string | null;
      tipo: 'persona-fisica' | 'persona-giuridica';
      quotaPercentuale: number | null;
    }[];
    quotaPrimoSocio: number | null;
    compagineCompleta: boolean;
    capogruppo: {
      denominazione: string;
      partitaIva: string | null;
      quotaPercentuale: number | null;
      controlloDiDiritto: boolean;
    } | null;
    soggettaADirezioneECoordinamento: boolean;
    personeChiave: { denominazione: string; quotaPercentuale: number | null }[];
    caricheDisponibili: boolean;
    cariche: { nominativo: string; ruolo: string; isRappresentanteLegale: boolean }[];
    implicazioni: {
      titolo: string;
      conseguenza: string;
      azione: string;
      riferimento: string | null;
    }[];
    domande: string[];
    confidenza: string;
  };
  gap: {
    voci: GapDto[];
    coperturaAssente: number;
    coperturaInadeguata: number;
    coperturaAdeguata: number;
    coperturaDaQuantificare: number;
    esposizioneNonAssicurata: MoneyDto;
    premioInEssere: MoneyDto | null;
  };
}

/** Sollevato quando la sessione manca o è scaduta: le pagine lo traducono in un rinvio. */
export class NonAutenticato extends Error {
  constructor() {
    super('Sessione assente o scaduta');
    this.name = 'NonAutenticato';
  }
}

/**
 * Inoltra il cookie di sessione del browser all'API.
 *
 * Le chiamate partono dal server di Next, non dal browser: senza questo inoltro l'API
 * vedrebbe una richiesta anonima e risponderebbe 401 a un utente regolarmente collegato.
 */
async function intestazioniSessione(): Promise<Record<string, string>> {
  const { cookies } = await import('next/headers');
  const raccolta = await cookies();
  const sessione = raccolta.get(NOME_COOKIE_SESSIONE);
  return sessione === undefined ? {} : { cookie: `${NOME_COOKIE_SESSIONE}=${sessione.value}` };
}

async function chiama<T>(percorso: string, init?: RequestInit): Promise<T> {
  const risposta = await fetch(`${BASE_URL}${percorso}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(await intestazioniSessione()),
      ...(init?.headers ?? {}),
    },
  });

  if (risposta.status === 401) throw new NonAutenticato();

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    throw new Error(corpo.errore ?? `Errore ${risposta.status} nella chiamata a ${percorso}`);
  }
  return (await risposta.json()) as T;
}

export interface UtenteCorrente {
  autenticato: boolean;
  email?: string;
  nome?: string;
  ruolo?: string;
}

export async function utenteCorrente(): Promise<UtenteCorrente> {
  try {
    return await chiama<UtenteCorrente>('/api/auth/me');
  } catch {
    return { autenticato: false };
  }
}

export async function autenticazioneRichiesta(): Promise<boolean> {
  try {
    const stato = await chiama<{ autenticazioneRichiesta: boolean }>('/api/auth/stato');
    return stato.autenticazioneRichiesta;
  } catch {
    return false;
  }
}

export async function cercaAziende(criteri: {
  denominazione?: string;
  partitaIva?: string;
  provincia?: string;
}): Promise<{ risultati: RisultatoRicerca[]; provider: string }> {
  const query = new URLSearchParams();
  // La firma di `Object.entries` è ottimista: dichiara `string` anche per le proprietà
  // opzionali, che a runtime possono benissimo essere `undefined`.
  for (const [chiave, valore] of Object.entries(criteri) as [string, string | undefined][]) {
    if (valore !== undefined && valore.trim() !== '') query.set(chiave, valore.trim());
  }
  return chiama(`/api/aziende/ricerca?${query.toString()}`);
}

export interface CollegamentoSocietario {
  socioDenominazione: string;
  socioCodiceFiscale: string;
  aziende: {
    identificativo: string;
    denominazione: string;
    quotaPercentuale: number | null;
    diControllo: boolean;
  }[];
}

/**
 * Collegamenti societari dentro il portafoglio.
 *
 * Non fa parte dell'analisi: dipende da quali altre aziende sono state analizzate, e
 * quindi cambia senza che questa azienda sia cambiata.
 */
export async function collegamentiDiAzienda(
  identificativo: string,
): Promise<{ collegamenti: CollegamentoSocietario[] }> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/collegamenti`);
}

export interface CriteriProspezione {
  denominazione?: string;
  provincia?: string;
  ateco?: string;
  addettiMin?: string;
  addettiMax?: string;
  fatturatoMinEuro?: string;
  fatturatoMaxEuro?: string;
  socioCodiceFiscale?: string;
  limite?: string;
}

export interface RisultatoProspezione {
  totale: number;
  /** Quante se ne scaricano: il prezzo è a record, non a ricerca. */
  lotto: number;
  costoElencoCentesimi: number;
  aziende: RisultatoRicerca[];
  soloConteggio: boolean;
  provider: string;
}

/**
 * Ricerca di prospect.
 *
 * `soloConteggio` è gratuito e non scarica nulla: è la modalità con cui si compongono
 * i filtri prima di decidere se pagare l'elenco.
 */
export async function cercaProspect(
  criteri: CriteriProspezione,
  opzioni: { soloConteggio?: boolean } = {},
): Promise<RisultatoProspezione> {
  const query = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(criteri) as [string, string | undefined][]) {
    if (valore !== undefined && valore.trim() !== '') query.set(chiave, valore.trim());
  }
  if (opzioni.soloConteggio === true) query.set('soloConteggio', '1');

  return chiama(`/api/prospect?${query.toString()}`);
}

export interface DatiStudio {
  denominazione: string;
  numeroRui: string | null;
  partitaIva: string | null;
  indirizzo: string | null;
  email: string | null;
  telefono: string | null;
}

/** Anagrafica dell'intermediario: intesta i documenti consegnati al contraente. */
export async function leggiStudio(): Promise<DatiStudio | { errore: string }> {
  return chiama('/api/studio');
}

export async function analizzaAzienda(identificativo: string): Promise<AnalisiDto> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/analisi`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function statoServizio(): Promise<{ stato: string; provider: string; datiReali: boolean }> {
  return chiama('/health');
}

export interface DossierDto {
  identificativo: string;
  datiDichiarati: Record<string, unknown> | null;
  polizze: {
    id: string;
    coverage: string;
    compagnia: string;
    numeroPolizza: string | null;
    sommaAssicurata: number | null;
    massimale: number | null;
    franchigia: number | null;
    premioAnnuo: number | null;
    dataEffetto: string;
    dataScadenza: string;
    formaGaranzia: string | null;
  }[];
}

export async function leggiDossier(identificativo: string): Promise<DossierDto> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/dossier`);
}

export interface VocePortafoglio {
  identificativo: string;
  denominazione: string;
  partitaIva: string | null;
  provincia: string | null;
  atecoDescrizione: string | null;
  scoreCredito: number;
  classeCredito: string;
  statoCatNat: string;
  catNatConforme: boolean;
  coperturaAssente: number;
  coperturaDaQuantificare: number;
  rischiCritici: number;
  esposizioneNonAssicurata: MoneyDto;
  completezza: number;
  azionePrioritaria: string | null;
  analizzataIl: string;
}

export interface EventoMonitoraggioDto {
  id: string;
  identificativoAzienda: string;
  denominazioneAzienda: string;
  tipo: string;
  titolo: string;
  descrizione: string;
  rilevanza: number;
  azioneSuggerita: string | null;
  valorePrecedente: unknown;
  valoreNuovo: unknown;
  rilevatoIl: string;
  gestitoIl: string | null;
}

export async function leggiMonitoraggio(
  tutti = false,
): Promise<{ eventi: EventoMonitoraggioDto[]; daGestire: number }> {
  return chiama(`/api/monitoraggio${tutti ? '?tutti=1' : ''}`);
}

export interface RischioCatalogo {
  id: string;
  etichetta: string;
  categoria: string;
  descrizione: string;
  probabilitaBase: number;
  impattoBase: number;
  coperture: string[];
  assicurabile: boolean;
  riferimenti: string[];
}

export interface CoperturaCatalogo {
  id: string;
  etichetta: string;
  categoria: string;
  descrizione: string;
  obbligoDiLegge: boolean;
  motivazioneTipo: string;
  insidie: string[];
  riferimenti: string[];
}

export async function leggiCatalogoRischi(): Promise<{ rischi: RischioCatalogo[] }> {
  return chiama('/api/catalogo/rischi');
}

export async function leggiCatalogoCoperture(): Promise<{ coperture: CoperturaCatalogo[] }> {
  return chiama('/api/catalogo/coperture');
}

export type RuoloUtente = 'amministratore' | 'broker' | 'assistente' | 'sola-lettura';

export interface UtenteElencoDto {
  id: string;
  email: string;
  nome: string;
  ruolo: RuoloUtente;
  attivo: boolean;
  bloccato: boolean;
  ultimoAccesso: string | null;
  creatoIl: string;
  /** Vero per l'utente collegato: la sua riga non offre azioni che lo chiuderebbero fuori. */
  seStesso: boolean;
}

export async function leggiUtenti(): Promise<{ utenti: UtenteElencoDto[] }> {
  return chiama('/api/utenti');
}

export async function leggiPortafoglio(): Promise<{
  aziende: VocePortafoglio[];
  riepilogo: {
    totale: number;
    nonConformiCatNat: number;
    esposizioneComplessivaEuro: number;
    coperturaAssenteTotale: number;
  };
}> {
  return chiama('/api/portafoglio');
}
