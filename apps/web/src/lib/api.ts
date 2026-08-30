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
  /**
   * Lo stato camerale, oppure `null` quando non è stato rilevato.
   *
   * Le aziende ritrovate in archivio non lo portano: quella tabella non ha la colonna, e
   * fino a ieri il servizio ci scriveva sopra `'attiva'` fisso — un bollino verde su ogni
   * riga, indipendentemente dalla realtà. Ora arriva `null`, e il tipo deve dirlo:
   * dichiararlo non nullabile non impediva lo `null`, impediva solo di vederlo, e la
   * schermata di ricerca ci finiva sopra con un `.replace()`.
   */
  statoAttivita: 'attiva' | 'inattiva' | 'sospesa' | 'cessata' | 'in-liquidazione' | 'fallita' | null;
  providerId: string;
  /**
   * I numeri che il record acquistato porta già con sé.
   *
   * `null` sulle ricerche per denominazione: l'elenco camerale non li contiene, e mostrare
   * dei trattini farebbe credere che l'azienda non abbia dati.
   */
  sintesi: SintesiRicerca | null;
  /** Il record acquistato per intero. Gli importi sono in **centesimi**, come nel dominio. */
  anagrafica: AnagraficaRicerca | null;
  bilanciSintetici: BilancioSinteticoDto[];
  soci: SocioDto[];
}

export interface AnagraficaRicerca {
  formaGiuridica: string;
  formaGiuridicaDescrizione: string;
  statoAttivita: string;
  dataCostituzione: string | null;
  dataInizioAttivita: string | null;
  dataCessazione: string | null;
  codiceFiscaleCessato: boolean | null;
  numeroREA: string | null;
  cciaa: string | null;
  atecoPrimario: string | null;
  atecoPrimarioDescrizione: string | null;
  atecoSecondari: string[];
  sedeLegale: {
    via: string;
    civico: string | null;
    cap: string;
    frazione: string | null;
    comune: string;
    provincia: string;
    regione: string | null;
    latitudine: number | null;
    longitudine: number | null;
  } | null;
  codiceCatastale: string | null;
  capitaleSocialeDeliberato: number | null;
  capitaleSocialeVersato: number | null;
  pec: string | null;
  sitoWeb: string | null;
  telefono: string | null;
  numeroAddetti: number | null;
  fatturatoDichiarato: number | null;
}

export interface BilancioSinteticoDto {
  anno: number;
  dataChiusura: string | null;
  fatturato: number | null;
  patrimonioNetto: number | null;
  totaleAttivo: number | null;
  costoDelPersonale: number | null;
  capitaleSociale: number | null;
  dipendenti: number | null;
  retribuzioneMediaLorda: number | null;
}

export interface SocioDto {
  denominazione: string;
  codiceFiscale: string | null;
  tipo: 'persona-fisica' | 'persona-giuridica';
  quotaPercentuale: number | null;
  quotaValore: number | null;
  socioDal: string | null;
}

export interface SintesiRicerca {
  annoUltimoBilancio: number | null;
  dipendenti: number | null;
  fatturatoEuro: number | null;
  patrimonioNettoEuro: number | null;
  totaleAttivoEuro: number | null;
  capitaleSocialeEuro: number | null;
  retribuzioneMediaEuro: number | null;
  numeroSoci: number | null;
  eserciziDisponibili: number;
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
  /**
   * Il record camerale per intero, così com'è stato comprato.
   *
   * Ne arrivavano a schermo dodici campi su venti: gli altri venivano letti, usati nei
   * calcoli e mai mostrati. Pagati e invisibili.
   */
  /**
   * Può mancare **ed essere nullo**, e la differenza non è accademica.
   *
   * Le analisi si congelano su archivio: quelle salvate prima che questo blocco esistesse
   * non lo contengono. Dichiararlo solo `?:` ha portato il compilatore a segnalare come
   * superfluo il controllo su `null` — l'ho tolto, e la pagina è caduta di nuovo sulla
   * stessa riga. Il tipo deve descrivere ciò che arriva dalla rete, non ciò che vorremmo.
   */
  registro?: {
    formaGiuridicaDescrizione: string;
    dataCostituzione: string | null;
    dataInizioAttivita: string | null;
    dataCessazione: string | null;
    numeroREA: string | null;
    cciaa: string | null;
    atecoSecondari: string[];
    capitaleSocialeDeliberato: MoneyDto | null;
    capitaleSocialeVersato: MoneyDto | null;
    fatturatoDichiarato: MoneyDto | null;
    numeroAddetti: number | null;
    pec: string | null;
    sitoWeb: string | null;
    telefono: string | null;
    codiceCatastale: string | null;
    codiceFiscaleCessato: boolean | null;
    sedeLegale: {
      via: string;
      civico: string | null;
      cap: string | null;
      comune: string;
      frazione: string | null;
      provincia: string;
    } | null;
  } | null;
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
  /**
   * Protesti, pregiudizievoli e procedure concorsuali, in dettaglio.
   *
   * `null` quando la verifica non è stata acquistata: è diverso da «nessun evento», e la
   * pagina lo dice invece di lasciar intendere che l’impresa risulti pulita.
   */
  eventiNegativi: {
    fonte: { descrizione: string; osservatoIl: string } | null;
    protesti: {
      data: string;
      importo: MoneyDto;
      tipo: string;
      luogo: string | null;
      levato: boolean;
    }[];
    pregiudizievoli: {
      data: string;
      tipo: string;
      importo: MoneyDto | null;
      descrizione: string;
    }[];
    procedure: {
      denominazione: string;
      tipo: string;
      dataApertura: string;
      dataChiusura: string | null;
      dataRevoca: string | null;
      dataOmologa: string | null;
      tribunale: string | null;
      aperta: boolean;
    }[];
    /** Il registro dichiara eventi di cui non ha mandato il dettaglio. */
    dichiaratiSenzaDettaglio: string[];
  } | null;
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
  /**
   * Un accertamento asincrono è stato aperto e non è ancora concluso.
   *
   * Non è un dato mancante: è un dato in arrivo, già pagato. Ricaricare fra un minuto lo
   * include, e non costa nulla perché la pratica resta in memoria.
   */
  accertamentiInCorso: boolean;
  /** Le quattro fasce di impatto, con importo e giorni di fermo equivalenti. */
  metricheDiImpatto: MetricheDiImpattoDto;
  /** Da quali voci nasce il margine di contribuzione, e con quali quote. */
  schemaMargine: SchemaMargineDto | null;
  /** Serie storica: un esercizio è una fotografia, tre sono una direzione. */
  andamentoPluriennale: AndamentoEsercizioDto[];
  /** Indicatori e qualifiche già elaborati dall'archivio camerale, compresi nel prezzo. */
  indicatoriArchivio: IndicatoriArchivioDto;
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
      /**
       * Contesto fisico attorno all'ubicazione: caserme e attività confinanti.
       *
       * `null` vuol dire **non osservato** — nessuna coordinata, oppure fonte non
       * raggiunta. Non vuol dire che intorno non ci sia niente, e la pagina non deve
       * mai lasciarlo intendere.
       */
      contesto: {
        vigiliDelFuoco: { nome: string; distanzaKm: number; minutiStimati: number }[];
        attivitaVicine: {
          nome: string;
          categoria: string;
          distanzaMetri: number;
          aggravaIlRischio: boolean;
        }[];
        attivitaCheAggravano: number;
        raggioAnalizzatoMetri: number;
        fonte: string;
        fabbricati: { quanti: number; superficieCopertaMq: number; maggioreMq: number } | null;
        meteo: {
          anni: number;
          dal: string;
          al: string;
          soglie: { descrizione: string; giorni: number; anniConEvento: number; massimo: string }[];
          fonte: string;
          fenomeniNonCoperti: string[];
        } | null;
      } | null;
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
  /**
   * Chi possiede davvero (art. 20 D.Lgs. 231/2007), ricavato dai soci già acquistati.
   *
   * `azione` è il campo che conta: dice se la visura dedicata da 1,10 € serva davvero o
   * se il dato sia già in mano. È l'unica parte del prodotto in cui il risultato migliore
   * può essere «non comprare niente».
   */
  titolareEffettivo: {
    titolari: {
      nominativo: string;
      codiceFiscale: string | null;
      quotaPercentuale: number | null;
      criterio: 'partecipazione' | 'controllo' | 'residuale-amministratore' | 'non-determinato';
      motivazione: string;
    }[];
    catenaChiusa: boolean;
    daRisalire: { denominazione: string; codiceFiscale: string | null; quotaPercentuale: number | null }[];
    confidenza: string;
    azione: string;
    note: string[];
  };

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
    /**
     * Chi ferma l'impresa uscendo di scena.
     *
     * `motivo` distingue chi comanda perché possiede da chi comanda perché è stato
     * nominato: senza, la frase attribuisce a un amministratore senza quote un capitale
     * che non ha.
     */
    personeChiave: {
      denominazione: string;
      codiceFiscale: string | null;
      quotaPercentuale: number | null;
      ruolo: string | null;
      rappresentanteLegale: boolean;
      motivo: 'quota' | 'carica' | 'quota-e-carica';
    }[];
    caricheDisponibili: boolean;
    /*
      Tutti i campi che l'API manda davvero.

      Qui ne erano dichiarati tre su otto: gli altri attraversavano il filo e TypeScript
      non li vedeva, quindi nessuno poteva disegnarli nemmeno volendo. Le date sono
      **stringhe ISO** — arrivano da JSON.stringify, e tiparle come `Date` produrrebbe un
      `.getFullYear()` che esplode a runtime senza che il compilatore fiati.
    */
    cariche: {
      nominativo: string;
      codiceFiscale: string | null;
      ruolo: string;
      isRappresentanteLegale: boolean;
      dataNomina: string | null;
      dataNascita: string | null;
      luogoNascita: string | null;
    }[];
    implicazioni: {
      titolo: string;
      conseguenza: string;
      azione: string;
      riferimento: string | null;
    }[];
    domande: string[];
    confidenza: string;
  };
  /**
   * Il perimetro di gruppo dichiarato dal registro.
   *
   * Blocco a sé e non campo dell'assetto: `verticeDichiarato` può essere una persona
   * fisica, mentre `assetto.capogruppo` è una società con partita IVA che l'interfaccia
   * trasforma in un collegamento. Confonderli produrrebbe un link verso una persona.
   */
  gruppo: {
    /** `false` finché il profilo completo non è stato acquistato. */
    disponibile: boolean;
    /** `null` quando il registro non si pronuncia: non è un «no». */
    appartieneAGruppo: boolean | null;
    denominazione: string | null;
    verticeDichiarato: string | null;
    controllateTotali: number | null;
    controllantiEstere: boolean | null;
    /** Controllate nominate dall'anagrafica: nomi, senza partita IVA, quindi non link. */
    controllateNote: string[];
  };
  gap: {
    voci: GapDto[];
    coperturaAssente: number;
    coperturaInadeguata: number;
    coperturaAdeguata: number;
    coperturaDaQuantificare: number;
    /** Zero significa che il confronto non è stato fatto: nessuna polizza è stata inserita. */
    polizzeDichiarate: number;
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
  /** Se lo studio di questo utente gestisce la piattaforma: apre le pagine di filiera. */
  gestorePiattaforma?: boolean;
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
}): Promise<{
  risultati: RisultatoRicerca[];
  provider: string;
  /** `true` quando il risultato viene dal proprio archivio: nessuna chiamata, nessun costo. */
  daArchivio?: boolean;
  /** Quando quel dato è stato acquistato: dice se convenga rinfrescarlo. */
  aggiornatoIl?: string | null;
}> {
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

export interface SoliditaCompagnia {
  compagniaId: string;
  denominazione: string;
  gruppo: string | null;
  anno: number;
  solvencyRatio: number | null;
  fonte: string;
  punteggio: number;
  fascia: 'critica' | 'debole' | 'adeguata' | 'solida' | 'molto-solida';
  fasciaEtichetta: string;
  componenti: { key: string; label: string; weight: number; score: number | null; rationale: string }[];
  allerte: string[];
  confidenza: string;
  spiegazione: ExplanationDto;
}

/**
 * Compagnie censite con la loro solidità.
 *
 * Il punteggio è ricalcolato dal servizio a ogni lettura: un numero congelato
 * sopravvivrebbe alla regola che l'ha prodotto.
 */
export async function compagnieCensite(): Promise<{ compagnie: SoliditaCompagnia[] }> {
  return chiama('/api/compagnie');
}

export interface StatoServizioDati {
  chiave: string;
  descrizione: string;
  scope: string;
  costoCentesimi: number;
  stato: 'autorizzato' | 'non-autorizzato' | 'non-raggiungibile';
  dettaglio: string;
}

/**
 * Quali servizi dati il token può chiamare.
 *
 * La verifica è gratuita e va fatta al momento: le autorizzazioni si cambiano dalla
 * console del fornitore, e un elenco memorizzato racconterebbe la situazione di ieri.
 */
export async function statoServiziDati(): Promise<{
  datiReali: boolean;
  servizi: StatoServizioDati[];
}> {
  return chiama('/api/servizi');
}

export interface StudioOspitato {
  id: string;
  denominazione: string;
  numeroRui: string | null;
  gestore: boolean;
  attivo: boolean;
  utenti: number;
  apertoIl: string;
}

/** Gli studi ospitati. Riservata a chi gestisce la piattaforma: altrove risponde 404. */
export async function elencoStudi(): Promise<{ studi: StudioOspitato[] }> {
  return chiama('/api/studi');
}

export interface StatoFornitura {
  persistenza: boolean;
  creditoCaricatoCentesimi: number;
  consumatoTotaleCentesimi?: number;
  /** `null` quando il credito caricato non è stato dichiarato: non si stima, si dice. */
  residuoCentesimi?: number | null;
  consumatoOggiCentesimi?: number;
  tettoComplessivoCentesimi?: number;
  tettoPerStudioCentesimi?: number;
}

export async function statoFornitura(): Promise<StatoFornitura> {
  return chiama('/api/fornitura');
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
  /** Quando il totale è zero: quali filtri lo stanno azzerando, e cosa si troverebbe senza. */
  diagnosiZero?: { filtro: string; etichetta: string; totaleSenza: number }[];
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
  /** Logo come data URI: intesta il report che il cliente riceve. */
  logo: string | null;
}

/** Anagrafica dell'intermediario: intesta i documenti consegnati al contraente. */
export async function leggiStudio(): Promise<DatiStudio | { errore: string }> {
  return chiama('/api/studio');
}

/**
 * @param approfondita Aggiunge cariche, sedi operative e struttura del gruppo. Costa quasi
 *   cinque volte l'analisi ordinaria: si chiede, non si dà per scontato.
 */
/**
 * @param opzioni.eventiNegativi acquista protesti, pregiudizievoli e procedure (45 cent).
 *
 * Falso per definizione. Veniva comprato d'ufficio a ogni analisi: chi premeva
 * «Analizza» credendo di spendere i dieci centesimi dell'anagrafica ne spendeva
 * cinquantacinque, su ogni prospect anche solo aperto per curiosità.
 */
export async function analizzaAzienda(
  identificativo: string,
  opzioni: { approfondita?: boolean; eventiNegativi?: boolean } = {},
): Promise<AnalisiDto> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/analisi`, {
    method: 'POST',
    body: JSON.stringify({
      ...(opzioni.approfondita === true ? { approfondita: true } : {}),
      ...(opzioni.eventiNegativi === true ? { eventiNegativi: true } : {}),
    }),
  });
}

/**
 * Il registro delle spese.
 *
 * Esisteva sul servizio e non era leggibile da nessuna pagina: si poteva conoscere solo
 * interrogandolo a mano, cosa che un intermediario non farà mai.
 */
export async function leggiCosti(): Promise<{
  totaleEuro: number;
  risparmioDaCacheEuro: number;
  chiamate: number;
  persistente: boolean;
  perServizio: { servizio: string; chiamate: number; costoEuro: number }[];
}> {
  return chiama('/api/costi');
}

export async function statoServizio(): Promise<{
  stato: string;
  provider: string;
  datiReali: boolean;
  costoAnalisiCentesimi: number;
  costoAnalisiApprofonditaCentesimi: number;
  /** Prezzi dei due acquisti facoltativi, dal listino del fornitore. */
  costoEventiNegativiCentesimi: number;
  costoApprofondimentoCentesimi: number;
}> {
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

/**
 * Indicatori e qualifiche già elaborati dall'archivio camerale.
 *
 * Rispecchia esattamente il blocco del dominio: sono compresi nel prezzo del profilo
 * completo, e sceglierne qui un sottoinsieme rifarebbe l'errore da cui il blocco nasce —
 * comprare il record intero e mostrarne una parte.
 */
export interface IndicatoriArchivioDto {
  redditivita: {
    roe: number | null;
    roi: number | null;
    ros: number | null;
    roaMonetario: number | null;
    incidenzaGestioneStraordinaria: number | null;
  } | null;
  risultatiOperativi: {
    cashFlow: number | null;
    ebit: number | null;
    ebitda: number | null;
    cashFlowDueEserciziPrima: number | null;
    ebitDueEserciziPrima: number | null;
    ebitdaDueEserciziPrima: number | null;
  } | null;
  solidita: {
    acidTest: number | null;
    currentRatio: number | null;
    coperturaCapitaleCircolante: number | null;
    tassoCoperturaImmobilizzazioni: number | null;
    margineDiStruttura: number | null;
    indiceMargineDiStruttura: number | null;
    margineDiStrutturaSecondario: number | null;
  } | null;
  indebitamento: {
    rapportoDebitoBancario: number | null;
    gradoDiCapitalizzazione: number | null;
    debitoBancarioSuTotaleAttivo: number | null;
    debtRatio: number | null;
    leva: number | null;
  } | null;
  liquidita: {
    cassaSuDebitiBancariBreve: number | null;
    cassaSuDebitiFinanziariBreve: number | null;
    cassaSuDebitiTotaliBreve: number | null;
  } | null;
  leveFinanziarie: {
    ebitdaLevaLorda: number | null;
    ebitdaLevaNetta: number | null;
    pfnSuEbitda: number | null;
  } | null;
  coperturaOneri: {
    ebitdaSuInteressiLordi: number | null;
    ebitdaSuInteressiNetti: number | null;
    ebitSuInteressiLordi: number | null;
    ebitSuInteressiNetti: number | null;
  } | null;
  strutturaFinanziaria: {
    composizioneDebitoFinanziario: number | null;
    debitoFinanziarioLordoSuPatrimonio: number | null;
    debitoFinanziarioNettoSuPatrimonio: number | null;
    pfnSuPatrimonio: number | null;
  } | null;
  cicloFinanziario: {
    durataCreditiVersoClienti: number | null;
    durataDebitiVersoFornitori: number | null;
    durataCicloFinanziario: number | null;
    durataScorte: number | null;
  } | null;
  oneriFinanziari: {
    indiceDiOnerosita: number | null;
    rod: number | null;
    rodFinanziario: number | null;
  } | null;
  efficienza: { rotazioneCreditiVersoClienti: number | null; indiceDiRotazione: number | null } | null;
  sviluppo: {
    valoreAggiunto: number | null;
    variazioneEbit: number | null;
    debitoFinanziarioLordo: number | null;
    mol: number | null;
    valoreDellaProduzione: number | null;
    totaleAttivo: number | null;
  } | null;
  kpi: {
    rotazioneDebiti: number | null;
    oneriFinanziariSuEbitda: number | null;
    rotazioneMagazzino: number | null;
    marginePercentualeEbitda: number | null;
    patrimonioSuTotaleAttivo: number | null;
  } | null;
  gare: {
    anno: number;
    presentate: number | null;
    vinte: number | null;
    valoreEuro: number | null;
  }[];
  statisticheAddetti: {
    impiegati: number | null;
    tempoDeterminato: number | null;
    tempoIndeterminato: number | null;
    tempoPieno: number | null;
    tempoParziale: number | null;
  } | null;
  qualifiche: {
    haCertificazioneSoa: boolean | null;
    esportatore: boolean | null;
    importatore: boolean | null;
    pmiInnovativa: boolean | null;
    startUpInnovativa: boolean | null;
    impresaArtigiana: boolean | null;
    numeroUnitaLocali: number | null;
    appartieneAGruppoIva: boolean | null;
    capogruppoIva: boolean | null;
    sitoWeb: string | null;
    telefono: string | null;
    fax: string | null;
    dimensioneImpresa: string | null;
    fasciaDiFatturato: string | null;
    andamentoFatturatoPercentuale: number | null;
    annoFatturato: number | null;
    atecoSecondario: string | null;
    settoreRae: string | null;
    settoreSae: string | null;
    codiceNace: string | null;
    codiceSicPrimario: string | null;
    codiceSicSecondario: string | null;
    addetti: number | null;
    fasciaAddetti: string | null;
    andamentoAddettiPercentuale: number | null;
    dataCostituzione: string | null;
    haControllantiEstere: boolean | null;
    haControllateEstere: boolean | null;
    email: string | null;
    codiceSdi: string | null;
    presenteSuiSocial: boolean | null;
    commercializzabile: boolean | null;
    aggiornatoIl: string | null;
  } | null;
}

/**
 * Le fasce di impatto economico.
 *
 *  quando manca il bilancio riclassificato: le soglie sono ancorate a
 * liquidità, EBITDA, patrimonio e capitale sociale, e inventarle darebbe numeri che
 * sembrano misurati senza esserlo.
 */
export type MetricheDiImpattoDto =
  | { disponibile: false; spiegazione: ExplanationDto }
  | {
      disponibile: true;
      fasce: {
        livello: 'trascurabile' | 'gestibile' | 'grave' | 'critico';
        etichetta: string;
        descrizione: string;
        importo: MoneyDto;
        giorniDiFermoEquivalenti: number | null;
        ancoraggio: string;
      }[];
      margineDiTesoreria: MoneyDto;
      indiceDiDisponibilita: number | null;
      margineDiContribuzioneGiornaliero: MoneyDto | null;
      confidenza: string;
      spiegazione: ExplanationDto;
    };

export interface SchemaMargineDto {
  righe: {
    voce: string;
    importoDiBilancio: MoneyDto;
    quotaVariabile: number | null;
    effetto: MoneyDto;
    motivazione: string;
  }[];
  margineDiContribuzione: MoneyDto;
  incidenzaSuRicavi: number | null;
}

export interface AndamentoEsercizioDto {
  anno: number;
  valoreDellaProduzione: MoneyDto | null;
  patrimonioNetto: MoneyDto | null;
  costoDelPersonale: MoneyDto | null;
  dipendenti: number | null;
  retribuzioneMediaLorda: MoneyDto | null;
}

/**
 * Le fotografie allegate alle ubicazioni.
 *
 * Lettura separata dall'analisi, e non un campo del suo risultato: l'analisi si esegue di
 * continuo e le immagini pesano megabyte. Chi non le mostra non le paga.
 */
export interface ImmagineUbicazioneDto {
  id: string;
  ubicazioneId: string;
  didascalia: string | null;
  tipoMime: string;
  /** L'immagine come data URI, pronta per l'attributo `src`. */
  dati: string;
  dimensioneByte: number;
  caricataIl: string;
}

export async function leggiImmaginiUbicazioni(
  identificativo: string,
): Promise<{ immagini: ImmagineUbicazioneDto[] }> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/immagini`);
}

/** Lo stato del collegamento con cui il cliente compila da sé il questionario. */
export interface InvitoQuestionarioDto {
  creatoIl: string;
  scadeIl: string;
  /** Quando il cliente ha salvato l'ultima volta. `null` se non ha ancora aperto. */
  compilatoIl: string | null;
}

export async function leggiInvitoQuestionario(
  identificativo: string,
): Promise<{ invito: InvitoQuestionarioDto | null }> {
  return chiama(`/api/aziende/${encodeURIComponent(identificativo)}/questionario/invito`);
}
