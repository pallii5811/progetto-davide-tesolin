/**
 * Tassonomia delle coperture assicurative per il rischio d'impresa (mercato italiano, rami danni).
 *
 * È il vocabolario comune della piattaforma: i rischi vi puntano per indicare come si
 * trasferiscono, le somme assicurande vi si agganciano per sapere su quale base si calcolano,
 * la gap analysis la usa per confrontare il dovuto con l'esistente.
 */

export type CoverageId =
  // Patrimonio
  | 'incendio'
  | 'furto-rapina'
  | 'catastrofali'
  | 'guasti-macchine'
  | 'elettronica'
  | 'danni-indiretti'
  // Responsabilità civile
  | 'rct'
  | 'rco'
  | 'rc-prodotti'
  | 'rc-inquinamento'
  | 'rc-professionale'
  | 'd-and-o'
  // Cyber
  | 'cyber'
  // Persone
  | 'infortuni-dipendenti'
  | 'infortuni-titolare'
  | 'malattia-key-man'
  | 'tcm-key-man'
  // Flotta
  | 'rca-flotta'
  | 'kasko-flotta'
  // Merci e trasporti
  | 'merci-trasportate'
  // Finanziarie
  | 'credito-commerciale'
  | 'cauzioni'
  // Legale
  | 'tutela-legale';

export type CoverageCategory =
  | 'patrimonio'
  | 'responsabilita-civile'
  | 'cyber'
  | 'persone'
  | 'flotta'
  | 'merci'
  | 'finanziarie'
  | 'legale';

export const COVERAGE_CATEGORY_LABEL: Readonly<Record<CoverageCategory, string>> = {
  patrimonio: 'Patrimonio',
  'responsabilita-civile': 'Responsabilità civile',
  cyber: 'Cyber e dati',
  persone: 'Persone',
  flotta: 'Flotta e veicoli',
  merci: 'Merci e trasporti',
  finanziarie: 'Rischi finanziari',
  legale: 'Tutela legale',
};

/**
 * Su quale base si determina il capitale da assicurare.
 * Guida il motore di calcolo delle somme assicurande.
 */
export type BasiDiCalcolo =
  /** Valore di ricostruzione a nuovo dei fabbricati. */
  | 'valore-ricostruzione'
  /** Valore di rimpiazzo a nuovo di macchinari e attrezzature. */
  | 'valore-rimpiazzo'
  /** Valore delle scorte, corretto per il picco stagionale. */
  | 'valore-scorte'
  /** Margine di contribuzione per il periodo di indennizzo. */
  | 'margine-contribuzione'
  /** Massimale determinato per benchmark di settore e classe dimensionale. */
  | 'massimale-benchmark'
  /** Monte salari annuo. */
  | 'monte-salari'
  /** Fido complessivo concesso ai clienti. */
  | 'fido-clienti'
  /** Capitale determinato caso per caso in sede di analisi. */
  | 'da-definire';

export interface CoverageDefinition {
  readonly id: CoverageId;
  readonly category: CoverageCategory;
  readonly label: string;
  readonly description: string;
  readonly base: BasiDiCalcolo;
  /** Obbligatoria per legge (non contrattualmente). */
  readonly obbligoDiLegge: boolean;
  /** Testo che l'intermediario può usare nella motivazione di adeguatezza. */
  readonly motivazioneTipo: string;
  /** Errori ricorrenti su questa copertura: alimentano gli avvisi in fase di gap analysis. */
  readonly insidie: readonly string[];
  readonly riferimenti: readonly string[];
}

export const COVERAGE_CATALOG: Readonly<Record<CoverageId, CoverageDefinition>> = {
  incendio: {
    id: 'incendio',
    category: 'patrimonio',
    label: 'Incendio ed eventi complementari',
    description:
      'Danni materiali diretti a fabbricati, macchinari, attrezzature e merci da incendio, fulmine, esplosione, ' +
      'eventi atmosferici, acqua condotta e, se estesa, sovraccarico neve e atti vandalici.',
    base: 'valore-ricostruzione',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Protegge il capitale produttivo dell’impresa da eventi che possono comprometterne la continuità.',
    insidie: [
      'Assicurare i fabbricati al valore contabile netto anziché al costo di ricostruzione a nuovo: è la prima causa di sottoassicurazione.',
      'Omettere la clausola di rinuncia alla rivalsa verso i locatari o il proprietario nei rapporti di locazione.',
      'Non aggiornare le somme dopo investimenti rilevanti in macchinari.',
    ],
    riferimenti: ['Art. 1907 c.c. — assicurazione parziale'],
  },
  'furto-rapina': {
    id: 'furto-rapina',
    category: 'patrimonio',
    label: 'Furto e rapina',
    description:
      'Sottrazione di beni, merci e valori a seguito di furto con violenza o rapina, con eventuale estensione ' +
      'ai guasti cagionati dai ladri e al portavalori.',
    base: 'valore-scorte',
    obbligoDiLegge: false,
    motivazioneTipo: 'Trasferisce il rischio di sottrazione di scorte, attrezzature e valori aziendali.',
    insidie: [
      'Le condizioni impongono requisiti di protezione (serramenti, allarme) la cui mancanza fa decadere la garanzia.',
      'I limiti per i valori in cassa sono quasi sempre molto inferiori alla somma assicurata complessiva.',
    ],
    riferimenti: [],
  },
  catastrofali: {
    id: 'catastrofali',
    category: 'patrimonio',
    label: 'Rischi catastrofali (CAT NAT)',
    description:
      'Danni da sismi, alluvioni, inondazioni, esondazioni e frane ai beni di cui all’art. 2424 c.c., ' +
      'attivo B-II, numeri 1, 2 e 3.',
    base: 'valore-ricostruzione',
    obbligoDiLegge: true,
    /*
      L'obbligo è dell'impresa, non della copertura.

      Questa frase affermava l'obbligo a chiunque, e veniva letta anche a un'impresa
      agricola — esclusa per legge, e dichiarata tale dal motore CAT NAT nella stessa
      risposta. Il documento si contraddiceva al proprio interno.

      Anche «condizione per l'accesso» era più severa della norma: l'art. 1 c. 102
      prevede che dell'inadempimento «si tenga conto» nell'assegnazione dei contributi.
      Sovradichiarare un obbligo si paga come tacerlo, al primo controllo del cliente.
    */
    motivazioneTipo:
      'Trasferisce il danno da sisma, alluvione, inondazione, esondazione e frana ai beni indicati ' +
      'dalla norma, che nessuna polizza incendio ordinaria comprende per intero.',
    insidie: [
      'Scoperti e franchigie non possono superare il 15% del danno indennizzabile per somme fino a 30 M€.',
      'La copertura deve riguardare i beni indicati dalla norma: una polizza incendio con estensione ' +
        'terremoto non necessariamente soddisfa l’obbligo.',
    ],
    riferimenti: ['L. 213/2023 art. 1 cc. 101-111', 'DM MEF-MIMIT n. 18 del 30/01/2025'],
  },
  'guasti-macchine': {
    id: 'guasti-macchine',
    category: 'patrimonio',
    label: 'Guasti macchine',
    description:
      'Danni accidentali interni al macchinario (rotture, corti circuiti, errori di manovra) non coperti ' +
      'dalla polizza incendio.',
    base: 'valore-rimpiazzo',
    obbligoDiLegge: false,
    // Prometteva il «fermo», che questa garanzia non paga: il fermo è la danni indiretti.
    // Qui si indennizza il danno al bene, ed è il prodotto stesso ad assegnarle come
    // capitale il valore di rimpiazzo del macchinario.
    motivazioneTipo:
      'Indennizza il danno al macchinario per cause interne — rotture, corti circuiti, errori di ' +
      'manovra — che la garanzia incendio esclude.',
    insidie: [
      'Spesso confusa con la garanzia incendio, che non copre il guasto meccanico o elettrico interno.',
    ],
    riferimenti: [],
  },
  elettronica: {
    id: 'elettronica',
    category: 'patrimonio',
    label: 'Elettronica (all risks)',
    description:
      'Apparecchiature elettroniche, server, hardware e strumentazione, in forma all risks, con eventuale ' +
      'garanzia per maggiori costi e ricostruzione archivi.',
    base: 'valore-rimpiazzo',
    obbligoDiLegge: false,
    motivazioneTipo: 'Protegge l’infrastruttura tecnologica su cui poggia l’operatività quotidiana.',
    insidie: ['La ricostruzione degli archivi elettronici richiede una garanzia dedicata.'],
    riferimenti: [],
  },
  'danni-indiretti': {
    id: 'danni-indiretti',
    category: 'patrimonio',
    label: 'Danni indiretti / Business Interruption',
    description:
      'Perdita di margine e costi supplementari conseguenti a un sinistro che interrompe o riduce l’attività, ' +
      'per il periodo necessario al ripristino.',
    base: 'margine-contribuzione',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Il danno economico da fermo attività supera regolarmente il danno materiale: senza questa garanzia ' +
      'l’impresa ricostruisce i beni ma non sopravvive al periodo di inattività.',
    insidie: [
      'Assicurare il fatturato invece del margine di contribuzione: si paga premio su costi che, a impianto fermo, non si sostengono.',
      'Scegliere un periodo di indennizzo inferiore al tempo reale di ricostruzione, che per un capannone raramente è sotto i 12 mesi.',
    ],
    riferimenti: [],
  },
  rct: {
    id: 'rct',
    category: 'responsabilita-civile',
    label: 'RCT — Responsabilità civile verso terzi',
    description:
      'Danni involontariamente cagionati a terzi nell’esercizio dell’attività, per morte, lesioni personali ' +
      'e danneggiamento di cose.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    /*
      Il nucleo vero per chiunque.

      Qui c'era «…che nelle società di persone si estende al patrimonio dei soci»: una
      clausola condizionale finita dentro una stringa fissa, e quindi letta anche a ogni
      S.r.l. e S.p.A., dove non si applica. Chi risponde, e con quale patrimonio, ora lo
      dice un frammento scelto sulla forma giuridica (`coverage/motivazione.ts`).

      Questo campo resta esposto senza impresa in contesto dall'endpoint del catalogo:
      deve poter essere letto da solo senza dire il falso a nessuno.
    */
    motivazioneTipo:
      'Trasferisce l’obbligazione risarcitoria per i danni involontariamente cagionati a terzi ' +
      'nell’esercizio dell’attività.',
    insidie: [
      'Il massimale unico per sinistro è spesso tarato su una sinistrosità storica, non sul danno massimo ipotizzabile.',
      'Le garanzie postume e la RC prodotti richiedono estensioni specifiche.',
    ],
    // L'art. 2050 riguarda le sole attività pericolose per natura o per i mezzi adoperati:
    // citarlo a uno studio di consulenza è sbagliato. Le norme che dipendono dall'impresa
    // — art. 2049 sul fatto dei commessi — le aggiunge il frammento condizionale, che sa
    // se ci sono dipendenti.
    riferimenti: ['Art. 2043 c.c.'],
  },
  rco: {
    id: 'rco',
    category: 'responsabilita-civile',
    label: 'RCO — Responsabilità civile verso prestatori di lavoro',
    description:
      'Azioni di rivalsa INAIL e richieste di danno differenziale dei dipendenti infortunati sul lavoro.',
    base: 'monte-salari',
    obbligoDiLegge: false,
    /*
      La formulazione precedente confondeva due cose.

      Dall'art. 13 D.Lgs. 38/2000 l'INAIL indennizza anche il danno biologico permanente
      dal 6%: dire che «il danno differenziale e biologico resta a carico del datore»
      afferma che l'istituto non lo copra. Ciò che resta a carico è il differenziale —
      quantitativo e qualitativo — e le voci che l'INAIL non indennizza.
    */
    motivazioneTipo:
      'L’indennizzo INAIL non esaurisce il danno risarcibile: restano a carico del datore di lavoro ' +
      'il danno differenziale e le voci che l’istituto non indennizza.',
    insidie: [
      'Il massimale per persona è la voce che conta davvero: le condanne per infortunio grave superano di norma il milione di euro.',
      'Le malattie professionali richiedono estensione espressa.',
    ],
    riferimenti: ['D.P.R. 1124/1965', 'D.Lgs. 81/2008'],
  },
  'rc-prodotti': {
    id: 'rc-prodotti',
    category: 'responsabilita-civile',
    label: 'RC Prodotti',
    description:
      'Danni causati a terzi da difetti dei prodotti dopo la consegna, comprese le spese di ritiro dal mercato ' +
      'se espressamente garantite.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    // «Oggettiva» senza riserve è la versione che il legale della controparte smonta per
    // primo: l'art. 118 Cod. cons. elenca le esimenti, fra cui il rischio da sviluppo, e
    // l'art. 120 pone al danneggiato la prova di difetto, danno e nesso. Chi risponde —
    // produttore o mero fornitore — lo stabilisce il frammento condizionale.
    motivazioneTipo:
      'La responsabilità da prodotto difettoso prescinde dalla colpa, nei limiti delle esimenti ' +
      'previste dalla legge.',
    insidie: [
      'L’esportazione verso USA e Canada richiede estensione territoriale espressa e comporta massimali sensibilmente superiori.',
      'Il ritiro prodotti (recall) è quasi sempre escluso dalla garanzia base.',
    ],
    riferimenti: ['D.Lgs. 206/2005, artt. 114-127 — Codice del consumo'],
  },
  'rc-inquinamento': {
    id: 'rc-inquinamento',
    category: 'responsabilita-civile',
    label: 'RC Inquinamento e danno ambientale',
    description:
      'Danni da inquinamento accidentale e costi di bonifica, anche in forma di responsabilità ambientale ' +
      'da normativa pubblicistica.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    // La responsabilità ambientale è oggettiva SOLO per gli operatori delle attività
    // dell'Allegato 5 alla Parte VI; per le altre risponde chi ha agito con dolo o colpa.
    // La regola che identifica il rischio usa diciassette divisioni ATECO, molto più
    // larghe di quell'Allegato — fra cui quella dell'azienda dimostrativa.
    motivazioneTipo:
      'I costi di bonifica e di ripristino ambientale non sono coperti dalla RCT ordinaria e possono ' +
      'eccedere di molto il danno cagionato a terzi.',
    insidie: [
      'L’inquinamento graduale è escluso dalle polizze RCT standard e richiede un prodotto dedicato.',
    ],
    riferimenti: ['D.Lgs. 152/2006 — Testo unico ambientale'],
  },
  'rc-professionale': {
    id: 'rc-professionale',
    category: 'responsabilita-civile',
    label: 'RC Professionale',
    description:
      'Danni patrimoniali cagionati a terzi nell’esercizio dell’attività professionale o di servizio.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    motivazioneTipo: 'Copre il danno puramente patrimoniale, che la RCT esclude in via ordinaria.',
    insidie: [
      'Regime claims made: la retroattività e la garanzia postuma determinano l’effettiva ampiezza della copertura.',
    ],
    // L'obbligo vale per chi è iscritto a un albo, non per una sezione ATECO: era
    // un'insidia fissa, e a una software house affermava una legge che non esiste. Ora è
    // un frammento condizionato sulla sezione professionale.
    //
    // La L. 124/2017 art. 1 c. 26 riguarda la polizza degli avvocati, non un obbligo
    // generale: la norma generale è quella del D.L. 138/2011 con il D.P.R. 137/2012.
    riferimenti: [
      'Art. 1176, c. 2, c.c.',
      'Art. 2236 c.c.',
      'Art. 3, c. 5, lett. e) D.L. 138/2011',
      'Art. 5 D.P.R. 137/2012',
    ],
  },
  'd-and-o': {
    id: 'd-and-o',
    category: 'responsabilita-civile',
    label: 'D&O — Responsabilità di amministratori e sindaci',
    description:
      'Responsabilità personale e patrimoniale degli amministratori verso la società, i soci, i creditori e i terzi.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    motivazioneTipo:
      'L’amministratore risponde con il patrimonio personale: gli adeguati assetti ex art. 2086 c.c. hanno ' +
      'ampliato in modo sostanziale il perimetro della responsabilità.',
    insidie: [
      'La garanzia opera in claims made: la cessazione della carica senza garanzia postuma lascia scoperto l’ex amministratore.',
      // «Statisticamente più frequente» era un superlativo che nessuno può verificare.
      // Il fatto normativo dice la stessa cosa e si può difendere.
      'In caso di liquidazione giudiziale l’azione di responsabilità è esercitata dal curatore (art. 255 CCII): il massimale va rapportato al passivo potenziale.',
    ],
    // Gli artt. 2392-2395 sono norme della S.p.A.: per la S.r.l. — la forma della quasi
    // totalità del portafoglio — la norma è l'art. 2476 c.c. La citazione giusta per
    // questa impresa la sceglie `governance/norme.ts` e la porta il frammento.
    riferimenti: ['Art. 2086 c.c.', 'Art. 255 CCII', 'D.Lgs. 14/2019 — Codice della crisi'],
  },
  cyber: {
    id: 'cyber',
    category: 'cyber',
    label: 'Cyber risk',
    description:
      'Danni propri e di terzi da attacchi informatici: ransomware, violazione di dati, interruzione dei ' +
      'sistemi, frode informatica, con servizi di gestione dell’incidente.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    motivazioneTipo:
      'La violazione di dati personali espone a sanzioni GDPR e ad azioni risarcitorie degli interessati, ' +
      'oltre al costo diretto del ripristino e del fermo operativo.',
    insidie: [
      'Le compagnie subordinano la copertura a requisiti minimi di sicurezza (backup, autenticazione a più fattori): la loro assenza è causa di decadenza.',
      'La sanzione amministrativa GDPR non è assicurabile in tutti gli ordinamenti: verificare la clausola di assicurabilità.',
    ],
    riferimenti: ['Reg. UE 2016/679 (GDPR)', 'D.Lgs. 138/2024 — NIS 2'],
  },
  'infortuni-dipendenti': {
    id: 'infortuni-dipendenti',
    category: 'persone',
    label: 'Infortuni dipendenti',
    description: 'Indennizzo diretto ai dipendenti per infortuni professionali ed extraprofessionali.',
    base: 'monte-salari',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Copertura spesso prevista dal contratto collettivo di categoria; integra le prestazioni INAIL.',
    insidie: ['Verificare gli obblighi del CCNL applicato, che possono renderla contrattualmente dovuta.'],
    riferimenti: [],
  },
  'infortuni-titolare': {
    id: 'infortuni-titolare',
    category: 'persone',
    label: 'Infortuni titolare e soci',
    description:
      'Indennizzo per invalidità permanente o morte del titolare, dei soci e dei collaboratori familiari.',
    base: 'da-definire',
    obbligoDiLegge: false,
    // «A conduzione familiare» era un'affermazione sull'impresa dentro una stringa fissa,
    // e la regola che accende il rischio scatta anche su una S.r.l. con tre soci
    // societari e quattordici addetti. Se la conduzione sia personale lo stabilisce ora
    // un frammento che guarda forma giuridica e compagine.
    motivazioneTipo:
      'L’invalidità o la morte del titolare e dei soci operativi non trova ristoro in alcuna garanzia ' +
      'di responsabilità: è un capitale che va costituito a parte.',
    insidie: [
      'I capitali sono spesso simbolici rispetto al reddito effettivamente prodotto dalla persona.',
    ],
    riferimenti: [],
  },
  'malattia-key-man': {
    id: 'malattia-key-man',
    category: 'persone',
    label: 'Malattia e spese mediche key man',
    description: 'Rimborso spese mediche e diaria da ricovero per figure chiave dell’organizzazione.',
    base: 'da-definire',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Riduce il tempo di indisponibilità delle figure critiche e ne fidelizza la permanenza.',
    insidie: [
      'Le preesistenze sono escluse: la sottoscrizione va fatta prima che il rischio si manifesti.',
    ],
    riferimenti: [],
  },
  'tcm-key-man': {
    id: 'tcm-key-man',
    category: 'persone',
    label: 'Temporanea caso morte su persona chiave',
    description:
      'Capitale a favore della società in caso di premorienza della persona chiave, a copertura della perdita ' +
      'di reddito e della continuità aziendale.',
    base: 'da-definire',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Consente alla società di assorbire la perdita di una figura da cui dipendono fatturato e relazioni.',
    insidie: [
      'Se la società è beneficiaria, il capitale deve essere dimensionato sul margine perso, non sul reddito personale.',
      'Frequentemente richiesta dagli istituti di credito a garanzia dei finanziamenti.',
    ],
    riferimenti: [],
  },
  'rca-flotta': {
    id: 'rca-flotta',
    category: 'flotta',
    label: 'RC Auto (libro matricola)',
    description:
      'Responsabilità civile obbligatoria per i veicoli aziendali, in gestione a libro matricola.',
    base: 'da-definire',
    obbligoDiLegge: true,
    motivazioneTipo: 'Adempimento dell’obbligo assicurativo per la circolazione dei veicoli a motore.',
    insidie: [
      'La gestione a libro matricola evita scoperture nei passaggi di proprietà e nelle immatricolazioni.',
    ],
    riferimenti: ['D.Lgs. 209/2005 — Codice delle assicurazioni private, art. 122'],
  },
  'kasko-flotta': {
    id: 'kasko-flotta',
    category: 'flotta',
    label: 'Garanzie accessorie veicoli (kasko, furto, incendio)',
    description: 'Danni al parco veicoli aziendale, anche per colpa del conducente.',
    base: 'da-definire',
    obbligoDiLegge: false,
    motivazioneTipo: 'Protegge il valore del parco mezzi e stabilizza il costo di gestione della flotta.',
    insidie: ['Sui veicoli in leasing la garanzia è spesso contrattualmente imposta dal concedente.'],
    riferimenti: [],
  },
  'merci-trasportate': {
    id: 'merci-trasportate',
    category: 'merci',
    label: 'Merci trasportate',
    description: 'Danni e furto delle merci durante il trasporto, in conto proprio o affidato a terzi.',
    base: 'da-definire',
    obbligoDiLegge: false,
    motivazioneTipo:
      'I limiti di responsabilità del vettore sono normativamente contenuti e non risarciscono il valore reale della merce.',
    insidie: [
      'Il limite del vettore stradale nazionale è irrisorio rispetto al valore trasportato: senza polizza merci il danno resta all’azienda.',
    ],
    riferimenti: ['Art. 1696 c.c.', 'Convenzione CMR per il trasporto internazionale'],
  },
  'credito-commerciale': {
    id: 'credito-commerciale',
    category: 'finanziarie',
    label: 'Assicurazione del credito commerciale',
    description:
      'Indennizzo per insolvenza e mancato pagamento dei clienti, con servizi di valutazione e recupero.',
    base: 'fido-clienti',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Protegge la voce più esposta dell’attivo circolante e trasforma la perdita su crediti in un costo prevedibile.',
    insidie: [
      'La copertura opera entro i fidi deliberati dalla compagnia: la vendita oltre fido resta scoperta.',
      'Gli obblighi di denuncia e di messa in mora hanno termini decadenziali stringenti.',
    ],
    riferimenti: [],
  },
  cauzioni: {
    id: 'cauzioni',
    category: 'finanziarie',
    label: 'Cauzioni e fideiussioni assicurative',
    description:
      'Garanzie richieste da committenti pubblici e privati: provvisorie, definitive, di buona esecuzione, ' +
      'rimborso anticipazioni.',
    base: 'da-definire',
    obbligoDiLegge: false,
    motivazioneTipo:
      'Consente di partecipare a gare e commesse senza immobilizzare linee di credito bancarie.',
    insidie: ['Il plafond va dimensionato sul portafoglio ordini prospettico, non su quello storico.'],
    riferimenti: ['D.Lgs. 36/2023 — Codice dei contratti pubblici'],
  },
  'tutela-legale': {
    id: 'tutela-legale',
    category: 'legale',
    label: 'Tutela legale',
    description:
      'Spese di assistenza legale e peritale in sede civile, penale e amministrativa, comprese le contestazioni ' +
      'in materia di sicurezza sul lavoro.',
    base: 'massimale-benchmark',
    obbligoDiLegge: false,
    /*
      Diceva «e degli amministratori», e contraddiceva la voce D&O dello stesso catalogo.

      La tutela legale aziendale standard non difende gli amministratori nelle azioni di
      responsabilità: quelle sono precisamente l'oggetto della D&O. Letta a voce, quella
      frase vendeva la rinuncia alla D&O — cioè faceva perdere all'intermediario la
      copertura più redditizia mentre gli faceva sbagliare il consiglio.
    */
    motivazioneTipo:
      'Garantisce le spese di difesa dell’impresa nei procedimenti civili, penali e amministrativi, ' +
      'comprese le contestazioni in materia di sicurezza sul lavoro, dove nessuna garanzia di ' +
      'responsabilità è chiamata a rispondere.',
    insidie: [
      'La libera scelta del legale e i massimali per grado di giudizio sono i due elementi che ne determinano l’utilità reale.',
    ],
    riferimenti: ['D.Lgs. 209/2005, artt. 163-164'],
  },
};

export function coverageDefinition(id: CoverageId): CoverageDefinition {
  return COVERAGE_CATALOG[id];
}

export const ALL_COVERAGE_IDS: readonly CoverageId[] = Object.keys(COVERAGE_CATALOG) as CoverageId[];
