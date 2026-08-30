/**
 * Tassonomia dei rischi d'impresa.
 *
 * Catalogo chiuso e versionato: due analisi fatte a distanza di mesi devono parlare
 * la stessa lingua, altrimenti il confronto storico e il monitoraggio non hanno senso.
 * L'aggiunta di un rischio è un evento di versione, non una modifica silenziosa.
 */

import type { CompanyFacts } from '../company/facts.js';
import type { CoverageId } from '../coverage/taxonomy.js';
import { normaResponsabilitaAmministratori } from '../governance/norme.js';
import type { Impact, Likelihood } from './assessment.js';

export type RiskCategory =
  | 'patrimoniale'
  | 'interruzione'
  | 'responsabilita-civile'
  | 'persone'
  | 'cyber'
  | 'legale-governance'
  | 'credito'
  | 'trasporti'
  | 'contrattuale'
  | 'normativo';

export const RISK_CATEGORY_LABEL: Readonly<Record<RiskCategory, string>> = {
  patrimoniale: 'Rischi patrimoniali',
  interruzione: "Rischi di interruzione dell'attività",
  'responsabilita-civile': 'Rischi di responsabilità civile',
  persone: 'Rischi legati alle persone',
  cyber: 'Rischi cyber e dati',
  'legale-governance': 'Rischi legali e di governance',
  credito: 'Rischi di credito commerciale',
  trasporti: 'Rischi di trasporto e merci',
  contrattuale: 'Rischi contrattuali',
  normativo: 'Rischi normativi e di conformità',
};

export type RiskId =
  | 'incendio-fabbricati'
  | 'furto-scorte'
  | 'eventi-atmosferici'
  | 'catastrofale-sisma'
  | 'catastrofale-alluvione'
  | 'guasto-macchinario'
  | 'danno-elettronica'
  | 'fermo-attivita'
  | 'dipendenza-fornitore-critico'
  | 'indisponibilita-sede'
  | 'rc-verso-terzi'
  | 'rc-verso-dipendenti'
  | 'rc-prodotto'
  | 'rc-inquinamento'
  | 'rc-professionale'
  | 'infortunio-titolare'
  | 'perdita-key-man'
  | 'infortunio-dipendenti'
  | 'ransomware'
  | 'data-breach'
  | 'frode-informatica'
  | 'responsabilita-amministratori'
  | 'contenzioso-legale'
  | 'sanzioni-231'
  | 'insolvenza-clienti'
  | 'concentrazione-clienti'
  | 'danno-merci-trasporto'
  | 'sinistro-flotta'
  | 'escussione-garanzie'
  | 'inadempimento-catnat'
  | 'sicurezza-lavoro';

export interface RiskDefinition {
  readonly id: RiskId;
  readonly category: RiskCategory;
  readonly label: string;
  readonly description: string;
  /** Probabilità di base, prima della modulazione sui fatti aziendali. */
  readonly baseLikelihood: Likelihood;
  /** Impatto di base, prima della modulazione sui fatti aziendali. */
  readonly baseImpact: Impact;
  /** Coperture che realizzano il trasferimento di questo rischio. */
  readonly coverages: readonly CoverageId[];
  /** Misure di prevenzione e protezione che ne riducono probabilità o impatto. */
  readonly controlliTipici: readonly string[];
  /** Alcuni rischi non sono assicurabili: vanno ridotti o ritenuti, non trasferiti. */
  readonly assicurabile: boolean;
  readonly riferimenti: readonly string[];
}

export const RISK_CATALOG: Readonly<Record<RiskId, RiskDefinition>> = {
  'incendio-fabbricati': {
    id: 'incendio-fabbricati',
    category: 'patrimoniale',
    label: 'Incendio di fabbricati e contenuto',
    description:
      'Distruzione o danneggiamento di immobili, macchinari, attrezzature e merci a seguito di incendio, ' +
      'fulmine o esplosione.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['incendio', 'danni-indiretti'],
    controlliTipici: [
      'Impianto di rilevazione e spegnimento automatico',
      'Certificato di prevenzione incendi in corso di validità',
      'Compartimentazione antincendio e separazione dei depositi',
      'Manutenzione programmata degli impianti elettrici',
    ],
    assicurabile: true,
    riferimenti: ['D.P.R. 151/2011 — prevenzione incendi'],
  },
  'furto-scorte': {
    id: 'furto-scorte',
    category: 'patrimoniale',
    label: 'Furto e rapina di beni e scorte',
    description: 'Sottrazione di merci, attrezzature, materie prime e valori dai locali aziendali.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['furto-rapina'],
    controlliTipici: [
      'Impianto di allarme collegato a istituto di vigilanza',
      'Videosorveglianza',
      'Serramenti e inferriate conformi ai requisiti di polizza',
      'Custodia dei valori in cassaforte',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'eventi-atmosferici': {
    id: 'eventi-atmosferici',
    category: 'patrimoniale',
    label: 'Eventi atmosferici',
    description:
      'Danni da vento, grandine, sovraccarico neve e acqua condotta ai fabbricati e ai beni contenuti.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['incendio'],
    controlliTipici: [
      'Manutenzione di coperture e pluviali',
      'Verifica strutturale del carico neve per le coperture leggere',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'catastrofale-sisma': {
    id: 'catastrofale-sisma',
    category: 'patrimoniale',
    label: 'Evento sismico',
    description:
      'Danni da terremoto ai beni immobili e mobili strumentali. Rientra nell’obbligo assicurativo CAT NAT.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['catastrofali', 'danni-indiretti'],
    controlliTipici: [
      'Verifica di vulnerabilità sismica del fabbricato',
      'Interventi di adeguamento o miglioramento sismico',
      'Ancoraggio di scaffalature e macchinari',
    ],
    assicurabile: true,
    riferimenti: ['L. 213/2023 art. 1 cc. 101-111', 'DM 18/2025'],
  },
  'catastrofale-alluvione': {
    id: 'catastrofale-alluvione',
    category: 'patrimoniale',
    label: 'Alluvione, inondazione, frana',
    description:
      'Danni da esondazione, allagamento e movimenti franosi ai beni aziendali. Rientra nell’obbligo CAT NAT.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['catastrofali', 'danni-indiretti'],
    controlliTipici: [
      'Verifica della classe di pericolosità idraulica del sito (PAI)',
      'Sopraelevazione di macchinari e quadri elettrici',
      'Piano di emergenza e paratie mobili',
    ],
    assicurabile: true,
    riferimenti: ['L. 213/2023 art. 1 cc. 101-111', 'DM 18/2025'],
  },
  'guasto-macchinario': {
    id: 'guasto-macchinario',
    category: 'patrimoniale',
    label: 'Guasto di macchinari critici',
    description:
      'Rottura accidentale, danno elettrico o errore di manovra su macchinari essenziali al ciclo produttivo.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['guasti-macchine', 'danni-indiretti'],
    controlliTipici: [
      'Manutenzione predittiva e programmata',
      'Disponibilità di ricambi critici a magazzino',
      'Ridondanza delle macchine collo di bottiglia',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'danno-elettronica': {
    id: 'danno-elettronica',
    category: 'patrimoniale',
    label: 'Danno ad apparecchiature elettroniche',
    description: 'Danni a server, hardware, strumentazione elettronica e ricostruzione degli archivi.',
    baseLikelihood: 3,
    baseImpact: 2,
    coverages: ['elettronica'],
    controlliTipici: ['Gruppi di continuità e protezioni da sovratensione', 'Backup off-site verificato'],
    assicurabile: true,
    riferimenti: [],
  },
  'fermo-attivita': {
    id: 'fermo-attivita',
    category: 'interruzione',
    label: 'Interruzione dell’attività a seguito di sinistro',
    description:
      'Perdita di margine di contribuzione e costi supplementari nel periodo necessario al ripristino ' +
      'dell’operatività dopo un danno materiale.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['danni-indiretti'],
    controlliTipici: [
      'Piano di continuità operativa documentato',
      'Sito alternativo o accordi di lavorazione presso terzi',
      'Duplicazione delle utenze critiche',
    ],
    assicurabile: true,
    riferimenti: ['ISO 22301 — Business continuity'],
  },
  'dipendenza-fornitore-critico': {
    id: 'dipendenza-fornitore-critico',
    category: 'interruzione',
    label: 'Dipendenza da fornitore critico',
    description:
      'Interruzione della fornitura di un input insostituibile, per sinistro o insolvenza del fornitore.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['danni-indiretti'],
    controlliTipici: [
      'Doppia fonte di approvvigionamento sugli input critici',
      'Scorta di sicurezza',
      'Clausole contrattuali di continuità',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'indisponibilita-sede': {
    id: 'indisponibilita-sede',
    category: 'interruzione',
    label: 'Indisponibilità della sede operativa',
    description:
      'Impossibilità di accedere ai locali per ordinanza dell’autorità, danno a terzi limitrofi o interruzione ' +
      'di pubbliche forniture.',
    baseLikelihood: 2,
    baseImpact: 4,
    coverages: ['danni-indiretti'],
    controlliTipici: ['Accordi di sede alternativa', 'Predisposizione al lavoro da remoto'],
    assicurabile: true,
    riferimenti: [],
  },
  'rc-verso-terzi': {
    id: 'rc-verso-terzi',
    category: 'responsabilita-civile',
    label: 'Responsabilità civile verso terzi',
    description:
      'Obbligo risarcitorio per danni a persone o cose cagionati a terzi nell’esercizio dell’attività.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['rct'],
    controlliTipici: [
      'Procedure operative e formazione del personale',
      'Segnaletica e delimitazione delle aree di lavoro',
      'Verifica delle coperture dei subappaltatori',
    ],
    assicurabile: true,
    /*
      L'art. 2050 riguarda le sole attività pericolose per natura o per i mezzi adoperati,
      e stava qui accanto al 2043 come se valesse per chiunque: a uno studio di consulenza
      è falso, e ribalta l'onere della prova in una direzione che quell'impresa non ha.

      Non lo si sostituisce con una regola che indovini quali attività siano pericolose —
      quella qualificazione la fa il giudice sul caso concreto, non una divisione ATECO.
      Si cita ciò che vale per tutti, e sull'impresa pericolosa il riferimento resta
      incompleto invece che sbagliato.
    */
    riferimenti: ['Art. 2043 c.c.', 'Art. 2051 c.c.'],
  },
  'rc-verso-dipendenti': {
    id: 'rc-verso-dipendenti',
    category: 'responsabilita-civile',
    label: 'Responsabilità verso i prestatori di lavoro',
    description:
      'Rivalsa INAIL e danno differenziale a seguito di infortunio o malattia professionale dei dipendenti.',
    baseLikelihood: 3,
    baseImpact: 5,
    coverages: ['rco'],
    controlliTipici: [
      'Documento di valutazione dei rischi aggiornato',
      'Formazione e addestramento documentati',
      'Sorveglianza sanitaria e dispositivi di protezione',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 81/2008', 'D.P.R. 1124/1965'],
  },
  'rc-prodotto': {
    id: 'rc-prodotto',
    category: 'responsabilita-civile',
    label: 'Responsabilità da prodotto difettoso',
    description:
      'Danni cagionati a terzi da difetti del prodotto immesso sul mercato, con eventuale onere di ritiro.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['rc-prodotti'],
    controlliTipici: [
      'Controllo qualità e tracciabilità dei lotti',
      'Marcatura CE e fascicolo tecnico',
      'Procedura di richiamo documentata',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 206/2005, artt. 114-127'],
  },
  'rc-inquinamento': {
    id: 'rc-inquinamento',
    category: 'responsabilita-civile',
    label: 'Inquinamento e danno ambientale',
    description: 'Contaminazione accidentale di suolo, acque o aria, con obbligo di bonifica e ripristino.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['rc-inquinamento'],
    controlliTipici: [
      'Bacini di contenimento per i serbatoi',
      'Gestione conforme dei rifiuti e dei registri',
      'Analisi periodiche di suolo e scarichi',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 152/2006'],
  },
  'rc-professionale': {
    id: 'rc-professionale',
    category: 'responsabilita-civile',
    label: 'Responsabilità professionale',
    description: 'Danni patrimoniali cagionati a clienti e terzi da errori nella prestazione di servizi.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['rc-professionale'],
    controlliTipici: [
      'Revisione fra pari degli elaborati',
      'Contratti con limitazione di responsabilità',
      'Documentazione delle istruzioni ricevute dal committente',
    ],
    assicurabile: true,
    /*
      La L. 124/2017 art. 1 c. 26 riguarda la polizza degli **avvocati**, e stava qui
      addosso a ogni impresa delle sezioni M, J e K — software house comprese. Il file
      gemello `coverage/taxonomy.ts` aveva già accertato che la norma è sbagliata e
      l'aveva sostituita: qui la copia era sopravvissuta.

      Restano le due norme che valgono per chiunque presti un servizio. L'obbligo
      assicurativo del professionista iscritto a un albo lo aggiunge
      `riferimentiPerImpresa`, che sa se l'impresa sta nella sezione professionale.
    */
    riferimenti: ['Art. 1176, c. 2, c.c.', 'Art. 2236 c.c.'],
  },
  'infortunio-titolare': {
    id: 'infortunio-titolare',
    category: 'persone',
    label: 'Infortunio o invalidità del titolare',
    description:
      'Perdita della capacità lavorativa del titolare o dei soci operativi, con impatto diretto sul reddito d’impresa.',
    baseLikelihood: 2,
    baseImpact: 4,
    coverages: ['infortuni-titolare', 'tcm-key-man'],
    controlliTipici: ['Deleghe operative e procure', 'Formazione di una figura sostitutiva'],
    assicurabile: true,
    riferimenti: [],
  },
  'perdita-key-man': {
    id: 'perdita-key-man',
    category: 'persone',
    label: 'Perdita di una persona chiave',
    description:
      'Morte, malattia grave o uscita improvvisa di una figura da cui dipendono fatturato, competenze o relazioni.',
    baseLikelihood: 2,
    baseImpact: 4,
    coverages: ['tcm-key-man', 'malattia-key-man'],
    controlliTipici: [
      'Documentazione dei processi e del know-how',
      'Piano di successione',
      'Patti di non concorrenza',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'infortunio-dipendenti': {
    id: 'infortunio-dipendenti',
    category: 'persone',
    label: 'Infortunio dei dipendenti',
    description: 'Eventi lesivi a carico del personale, con conseguenze indennitarie e organizzative.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['infortuni-dipendenti', 'rco'],
    controlliTipici: [
      'Valutazione dei rischi aggiornata',
      'Dispositivi di protezione individuale',
      'Formazione periodica',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 81/2008'],
  },
  ransomware: {
    id: 'ransomware',
    category: 'cyber',
    label: 'Attacco ransomware',
    description:
      'Cifratura dei sistemi e dei dati aziendali con richiesta di riscatto, blocco dell’operatività e costi di ripristino.',
    baseLikelihood: 4,
    baseImpact: 4,
    coverages: ['cyber', 'danni-indiretti'],
    controlliTipici: [
      'Backup con copia immutabile e off-site, testato nel ripristino',
      'Autenticazione a più fattori su tutti gli accessi remoti',
      'Segmentazione della rete e aggiornamento dei sistemi',
      'Formazione anti-phishing del personale',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 138/2024 — NIS 2'],
  },
  'data-breach': {
    id: 'data-breach',
    category: 'cyber',
    label: 'Violazione di dati personali',
    description:
      'Perdita di riservatezza o disponibilità di dati personali, con obblighi di notifica, sanzioni e ' +
      'azioni risarcitorie degli interessati.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['cyber'],
    controlliTipici: [
      'Registro dei trattamenti e valutazione d’impatto',
      'Cifratura dei dati a riposo e in transito',
      'Procedura di notifica entro 72 ore',
      'Nomina del responsabile della protezione dei dati ove dovuta',
    ],
    assicurabile: true,
    riferimenti: ['Reg. UE 2016/679 artt. 33-34, 82-83'],
  },
  'frode-informatica': {
    id: 'frode-informatica',
    category: 'cyber',
    label: 'Frode informatica e social engineering',
    description:
      'Dirottamento di pagamenti tramite compromissione della posta elettronica o falsificazione di coordinate bancarie.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['cyber'],
    controlliTipici: [
      'Doppia firma sui pagamenti oltre soglia',
      'Verifica telefonica del cambio IBAN su canale indipendente',
      'Protezione della posta elettronica aziendale',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'responsabilita-amministratori': {
    id: 'responsabilita-amministratori',
    category: 'legale-governance',
    label: 'Responsabilità di amministratori e organi di controllo',
    description:
      'Azioni di responsabilità promosse da società, soci, creditori o curatore per atti di gestione, ' +
      'con aggressione del patrimonio personale.',
    baseLikelihood: 2,
    baseImpact: 5,
    coverages: ['d-and-o', 'tutela-legale'],
    controlliTipici: [
      'Adeguati assetti organizzativi ex art. 2086 c.c.',
      'Verbalizzazione delle decisioni consiliari',
      'Sistema di allerta sulla continuità aziendale',
    ],
    assicurabile: true,
    /*
      Qui c'era «Artt. 2392-2395 c.c.» — norme della S.p.A. — a ogni impresa, due righe
      sotto una motivazione che per la S.r.l. citava correttamente l'art. 2476. Era la
      **quarta** copia della stessa citazione, quella che `governance/norme.ts` dichiara
      per iscritto eliminata: se ne erano corrette tre e questa era rimasta.

      Il catalogo è statico e non conosce la forma giuridica: qui restano le sole norme
      vere per tutti, e la norma sulla responsabilità la aggiunge `riferimentiPerImpresa`
      leggendola dall'unico punto in cui vive.
    */
    riferimenti: ['Art. 2086 c.c.', 'D.Lgs. 14/2019'],
  },
  'contenzioso-legale': {
    id: 'contenzioso-legale',
    category: 'legale-governance',
    label: 'Contenzioso civile, penale e amministrativo',
    description:
      'Costi di difesa legale e peritale in controversie con clienti, fornitori, dipendenti o autorità.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['tutela-legale'],
    controlliTipici: [
      'Contrattualistica standardizzata e revisionata',
      'Gestione documentale delle commesse',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'sanzioni-231': {
    id: 'sanzioni-231',
    category: 'legale-governance',
    label: 'Responsabilità amministrativa dell’ente (D.Lgs. 231/2001)',
    description:
      'Sanzioni pecuniarie e interdittive a carico della società per reati commessi nel suo interesse o vantaggio.',
    baseLikelihood: 2,
    baseImpact: 4,
    coverages: ['tutela-legale', 'd-and-o'],
    controlliTipici: [
      'Modello di organizzazione, gestione e controllo adottato e aggiornato',
      'Organismo di vigilanza operativo',
      'Canale di segnalazione whistleblowing',
    ],
    // Le sanzioni penali-amministrative non sono assicurabili: si assicurano le sole spese di difesa.
    assicurabile: false,
    riferimenti: ['D.Lgs. 231/2001', 'D.Lgs. 24/2023 — whistleblowing'],
  },
  'insolvenza-clienti': {
    id: 'insolvenza-clienti',
    category: 'credito',
    label: 'Insolvenza dei clienti',
    description:
      'Mancato incasso dei crediti commerciali per insolvenza o protratto inadempimento del debitore.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['credito-commerciale'],
    controlliTipici: [
      'Valutazione del merito creditizio prima della concessione del fido',
      'Monitoraggio continuo del portafoglio clienti',
      'Politica di sollecito e messa in mora strutturata',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'concentrazione-clienti': {
    id: 'concentrazione-clienti',
    category: 'credito',
    label: 'Concentrazione del fatturato',
    description:
      'Dipendenza da pochi clienti: la perdita o l’insolvenza di uno solo compromette l’equilibrio economico.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['credito-commerciale'],
    controlliTipici: [
      'Piano di diversificazione commerciale',
      'Contratti pluriennali con preavviso di recesso',
    ],
    assicurabile: true,
    riferimenti: [],
  },
  'danno-merci-trasporto': {
    id: 'danno-merci-trasporto',
    category: 'trasporti',
    label: 'Danno o furto delle merci in trasporto',
    description:
      'Perdita o danneggiamento delle merci durante il trasporto, oltre i limiti di responsabilità del vettore.',
    baseLikelihood: 3,
    baseImpact: 3,
    coverages: ['merci-trasportate'],
    controlliTipici: [
      'Imballaggio conforme',
      'Selezione di vettori qualificati',
      'Tracciabilità delle spedizioni',
    ],
    assicurabile: true,
    riferimenti: ['Art. 1696 c.c.', 'Convenzione CMR'],
  },
  'sinistro-flotta': {
    id: 'sinistro-flotta',
    category: 'trasporti',
    label: 'Sinistrosità del parco veicoli',
    description: 'Danni causati o subiti dai veicoli aziendali nella circolazione.',
    baseLikelihood: 4,
    baseImpact: 2,
    coverages: ['rca-flotta', 'kasko-flotta'],
    controlliTipici: [
      'Politica aziendale di guida sicura e formazione dei conducenti',
      'Manutenzione programmata del parco',
      'Telematica di bordo',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 209/2005 art. 122'],
  },
  'escussione-garanzie': {
    id: 'escussione-garanzie',
    category: 'contrattuale',
    label: 'Escussione di garanzie e penali contrattuali',
    description:
      'Escussione di cauzioni e fideiussioni o applicazione di penali per ritardi e inadempimenti contrattuali.',
    baseLikelihood: 2,
    baseImpact: 3,
    coverages: ['cauzioni'],
    controlliTipici: [
      'Pianificazione e controllo avanzamento commesse',
      'Negoziazione dei tetti di penale',
    ],
    assicurabile: true,
    riferimenti: ['D.Lgs. 36/2023'],
  },
  'inadempimento-catnat': {
    id: 'inadempimento-catnat',
    category: 'normativo',
    label: 'Inadempimento dell’obbligo assicurativo CAT NAT',
    description:
      'Mancata stipula della copertura catastrofale obbligatoria, con esclusione dall’accesso a contributi, ' +
      'incentivi e agevolazioni pubbliche e dai sostegni straordinari in caso di evento.',
    baseLikelihood: 4,
    baseImpact: 3,
    coverages: ['catastrofali'],
    controlliTipici: ['Verifica dell’adempimento e archiviazione della polizza'],
    assicurabile: true,
    riferimenti: ['L. 213/2023 art. 1 cc. 101-111', 'DM 18/2025'],
  },
  'sicurezza-lavoro': {
    id: 'sicurezza-lavoro',
    category: 'normativo',
    label: 'Non conformità in materia di sicurezza sul lavoro',
    description:
      'Sanzioni, sospensione dell’attività e responsabilità penale del datore di lavoro per violazioni ' +
      'della normativa antinfortunistica.',
    baseLikelihood: 3,
    baseImpact: 4,
    coverages: ['tutela-legale', 'rco'],
    controlliTipici: [
      'Documento di valutazione dei rischi aggiornato',
      'Nomina di RSPP e medico competente',
      'Registro della formazione',
    ],
    // Le sanzioni penali non sono trasferibili: si assicura la difesa, non la sanzione.
    assicurabile: false,
    riferimenti: ['D.Lgs. 81/2008'],
  },
};

export function riskDefinition(id: RiskId): RiskDefinition {
  return RISK_CATALOG[id];
}

/**
 * I riferimenti normativi di un rischio **per questa impresa**.
 *
 * Il catalogo è statico e versionato, e va bene così: è la stessa lingua che due analisi
 * a mesi di distanza devono parlare. Ma una norma non è una proprietà del rischio, è una
 * proprietà del rapporto fra quel rischio e quell'impresa — e scriverla nel catalogo
 * significa affermarla per tutte.
 *
 * Da qui passano le sole norme che cambiano con l'impresa. Le altre restano dove sono.
 */
export function riferimentiPerImpresa(
  id: RiskId,
  facts: Pick<CompanyFacts, 'formaGiuridica' | 'atecoSezione'>,
): readonly string[] {
  const base = RISK_CATALOG[id].riferimenti;

  if (id === 'responsabilita-amministratori') {
    const norma = normaResponsabilitaAmministratori(facts.formaGiuridica);
    // `null` nelle società di persone e nella ditta individuale: lì non c'è un organo
    // amministrativo distinto dalla proprietà, e non si cita nulla al suo posto.
    return norma === null ? base : [norma, ...base];
  }

  if (id === 'rc-professionale') {
    /*
      L'obbligo vale per chi è iscritto a un albo, non per una sezione ATECO.

      La sezione M raccoglie le attività professionali; J e K no — e la regola che
      identifica questo rischio prende tutte e tre. Dentro la M l'iscrizione all'albo
      resta da confermare in intervista, ma l'affermazione è almeno plausibile; fuori è
      falsa e basta.
    */
    if (facts.atecoSezione !== 'M') return base;
    return [...base, 'Art. 3, c. 5, lett. e) D.L. 138/2011', 'Art. 5 D.P.R. 137/2012'];
  }

  return base;
}

export const ALL_RISK_IDS: readonly RiskId[] = Object.keys(RISK_CATALOG) as RiskId[];

/** Versione del catalogo: cambia a ogni aggiunta o modifica di un rischio. */
export const RISK_CATALOG_VERSION = '2026.1';
