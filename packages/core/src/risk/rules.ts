/**
 * Regole di identificazione e modulazione dei rischi.
 *
 * Dichiarative, non imperative: ogni regola è un dato, non una `if` sepolta in una funzione.
 * Questo consente di versionarle, testarle una per una, mostrarle all'utente come motivazione
 * («questo rischio ti è stato attribuito perché…») e — passo successivo — renderle modificabili
 * dall'intermediario senza toccare il codice.
 *
 * Il predicato restituisce tre valori, non due:
 *   `true`   → il fatto sussiste
 *   `false`  → il fatto non sussiste
 *   `ignoto` → il dato non c'è. Il rischio viene comunque proposto, marcato «da verificare».
 *
 * Trattare `ignoto` come `false` significherebbe far sparire dal report i rischi su cui il
 * questionario non è stato compilato: esattamente quelli su cui il cliente è più scoperto.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { CompanyFacts } from '../company/facts.js';
import { atecoStartsWith } from '../shared/identifiers.js';
import type { RiskId } from './taxonomy.js';
import { territorialExposure, worstExposure } from './geo.js';
import {
  categoriaSocietaria,
  normaResponsabilitaAmministratori,
  regimeDiResponsabilita,
} from '../governance/norme.js';

export type Verdict = true | false | 'ignoto';

/**
 * Il motivo per cui la regola si è accesa, come lo legge l'utente.
 *
 * Può essere una funzione dei fatti, e in un caso **doveva** esserlo: una regola
 * annunciava «ogni mese di fermo vale oltre 80.000 €» prendendo il numero dalla propria
 * soglia divisa per dodici, non dal margine di quell'impresa. Su un'azienda con dodici
 * milioni di margine il numero vero era dodici volte quello mostrato — e il broker lo
 * leggeva a voce al cliente.
 *
 * Resta una **composizione**, non una generazione: frammenti fissi più i valori.
 */
export type Rationale = string | ((facts: CompanyFacts) => string);

/**
 * Il motivo quando il fatto **non è stato rilevato**.
 *
 * `rationale` descrive un fatto accertato, e va scritto all'indicativo. Ma la stessa regola
 * si accende anche in forma ignota — `when` restituisce `'ignoto'`, i delta si azzerano — e
 * lì la frase all'indicativo diventa un'affermazione sull'impresa che nessuno ha verificato.
 *
 * > Letto sulla scheda di un fabbricante di serrature, che in cantiere non ci mette piede:
 * >
 * >   «Lavorazioni in cantiere: settore a più elevata incidenza infortunistica. (da verificare)»
 * >   «Canale e-commerce attivo: superficie di attacco esposta su internet.  (da verificare)»
 * >   «Gli immobili sono di proprietà: il danno colpisce il patrimonio aziendale. (da verificare)»
 * >
 * > Trentadue regole su sessantotto si accendono così, e tutte e trentadue lo facevano al
 * > presente indicativo. La parentesi in coda non salva la frase: arriva dopo
 * > l'affermazione, e l'intermediario che legge quella riga al telefono l'ha già detta.
 *
 * La riserva quindi non si aggiunge in coda: si scrive nella **forma** della frase — «Da
 * accertare se…», «Il dato non è stato rilevato: sopra la soglia…» — perché una condizione
 * dichiarata all'inizio è l'unica che il lettore non può scavalcare.
 *
 * Non è facoltativo dove serve: `regole-non-affermano-lignoto.test.ts` valuta ogni regola
 * su un'impresa di cui non si sa nulla e pretende questa formulazione per ognuna che si
 * accenda. Le regole di controllo ne sono esenti, e per una ragione dimostrata: il motore
 * le scarta prima di applicarle quando il verdetto è ignoto.
 */
type ConRiservaSuDatoIgnoto = {
  readonly rationaleSeIgnoto?: Rationale | undefined;
};

export interface IdentifyRule extends ConRiservaSuDatoIgnoto {
  readonly kind: 'identifica';
  readonly id: string;
  readonly risk: RiskId;
  readonly when: (facts: CompanyFacts) => Verdict;
  readonly rationale: Rationale;
}

export interface ModulateRule extends ConRiservaSuDatoIgnoto {
  readonly kind: 'modula';
  readonly id: string;
  readonly risk: RiskId;
  readonly when: (facts: CompanyFacts) => Verdict;
  /** Variazione della probabilità, in passi della scala 1-5. */
  readonly likelihood?: number | undefined;
  /** Variazione dell'impatto, in passi della scala 1-5. */
  readonly impact?: number | undefined;
  readonly rationale: Rationale;
}

/**
 * Risolve il motivo sui fatti di questa impresa.
 *
 * Una composizione difettosa non deve far cadere l'analisi: se solleva, si ripiega su una
 * frase generica e vera invece che su una plausibile.
 */
export function risolviRationale(rationale: Rationale, facts: CompanyFacts): string {
  if (typeof rationale === 'string') return rationale;
  try {
    return rationale(facts);
  } catch {
    return 'Motivazione non componibile con i dati disponibili.';
  }
}

/**
 * Misura di prevenzione o protezione già in essere presso l'azienda.
 * Si applica **dopo** la modulazione, per ottenere il rischio residuo: è la differenza
 * fra inerente e residuo a dimostrare al cliente il valore di ciò che ha già fatto —
 * e a giustificare perché il capitale da trasferire è quello e non un altro.
 */
export interface ControlRule {
  readonly kind: 'controllo';
  readonly id: string;
  readonly risk: RiskId;
  readonly when: (facts: CompanyFacts) => Verdict;
  readonly likelihood?: number | undefined;
  readonly impact?: number | undefined;
  /** Perché il controllo, se presente, riduce il rischio. */
  readonly rationale: string;
  /**
   * La misura, scritta come la si propone a un imprenditore.
   *
   * Distinta dal `rationale`, che descrive un controllo **presente**: questa descrive un
   * controllo **da mettere**, ed è ciò che permette di raccomandare la prevenzione invece
   * di limitarsi a constatarne l'assenza. Per un consulente è un argomento di vendita;
   * per il cliente, un investimento di cui si può discutere il ritorno.
   */
  readonly misura: string;
}

export type RiskRule = IdentifyRule | ModulateRule | ControlRule;

// ─────────────────────────────────────────────────────────────────────────────
// Predicati di supporto
// ─────────────────────────────────────────────────────────────────────────────

const SEMPRE = (): Verdict => true;

/** Converte un booleano opzionale in un verdetto a tre stati. */
function tri(value: boolean | null): Verdict {
  return value ?? 'ignoto';
}

function sezione(facts: CompanyFacts, ...sezioni: readonly string[]): Verdict {
  if (facts.atecoSezione === null) return 'ignoto';
  return sezioni.includes(facts.atecoSezione);
}

function divisione(facts: CompanyFacts, ...divisioni: readonly string[]): Verdict {
  if (facts.atecoDivisione === null) return 'ignoto';
  return divisioni.includes(facts.atecoDivisione);
}

/** Vero se il codice ATECO primario o uno dei secondari inizia con uno dei prefissi. */
function atecoTra(facts: CompanyFacts, ...prefissi: readonly string[]): Verdict {
  if (facts.ateco === null) return 'ignoto';
  const tutti = [facts.ateco, ...facts.atecoSecondari];
  return tutti.some((code) => prefissi.some((p) => atecoStartsWith(code, p)));
}

function importoOltre(value: Euro | null, soglia: number): Verdict {
  if (value === null) return 'ignoto';
  return Money.toEuro(value) > soglia;
}

function numeroOltre(value: number | null, soglia: number): Verdict {
  if (value === null) return 'ignoto';
  return value > soglia;
}

/*
  «Non classificata» non è «zona 4».

  Questa regola rispondeva `false` per trentatré province su centosette — Milano, Torino,
  Venezia, Padova, Piacenza — perché la tabella non le contiene. E una regola con verdetto
  falso non entra affatto nel registro (`engine.ts`): la modulazione sismica spariva senza
  che nessuno potesse accorgersene, proprio dove non si sapeva.

  Le province si guardano una per una e non attraverso `worstExposure`: quell'aggregato
  restituisce il livello più alto fra quelli **noti**, e su un'impresa con una provincia
  «media» e una non classificata risponderebbe «media», nascondendo l'ignoto dietro un
  livello misurato. Finché una provincia operativa non è classificata, «no» non è una
  risposta che il prodotto possa dare.
*/
function sismicaAlta(facts: CompanyFacts): Verdict {
  if (facts.provinceOperative.length === 0) return 'ignoto';
  const esposizioni = facts.provinceOperative.map(territorialExposure);
  if (esposizioni.some((e) => e.sismica === 'alta')) return true;
  if (esposizioni.some((e) => e.sismica === null)) return 'ignoto';
  return false;
}

function idraulicaAlta(facts: CompanyFacts): Verdict {
  const exposure = worstExposure(facts.provinceOperative);
  if (exposure === null) return 'ignoto';
  return exposure.idraulica === 'alta';
}

/** Vero se l'azienda dichiara una certificazione fra quelle indicate (confronto insensibile a maiuscole). */
function certificata(facts: CompanyFacts, ...norme: readonly string[]): Verdict {
  if (facts.certificazioni.length === 0) return 'ignoto';
  const dichiarate = facts.certificazioni.map((c) => c.toUpperCase().replace(/[\s:]/g, ''));
  return norme.some((n) => dichiarate.some((d) => d.includes(n.toUpperCase().replace(/[\s:]/g, ''))));
}

// Divisioni ATECO a rischio ambientale rilevante: chimica, gomma-plastica, metallurgia,
// trattamento rifiuti, estrazione, energia.
const DIVISIONI_AMBIENTALI = [
  '05',
  '06',
  '07',
  '08',
  '09',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '35',
  '36',
  '37',
  '38',
  '39',
];

// Divisioni con lavorazione fisica e macchinari critici.
const DIVISIONI_PRODUTTIVE = [
  '10',
  '11',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
];

// ─────────────────────────────────────────────────────────────────────────────
// Regole
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_RULES: readonly RiskRule[] = [
  // ── Patrimonio ────────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'incendio/sempre',
    risk: 'incendio-fabbricati',
    when: SEMPRE,
    rationale: 'Ogni impresa occupa locali e detiene beni strumentali esposti al rischio di incendio.',
  },
  {
    kind: 'modula',
    id: 'incendio/immobili-di-proprieta',
    rationaleSeIgnoto:
      'Il titolo di godimento degli immobili non è stato rilevato: se sono di proprietà il danno ' +
      'colpisce direttamente il patrimonio aziendale, se sono in locazione resta la responsabilità ' +
      'verso il proprietario e il contenuto.',
    risk: 'incendio-fabbricati',
    when: (f) => tri(f.possiedeImmobili),
    impact: 1,
    rationale: 'Gli immobili sono di proprietà: il danno colpisce direttamente il patrimonio aziendale.',
  },
  {
    kind: 'modula',
    id: 'incendio/attivita-produttiva',
    risk: 'incendio-fabbricati',
    when: (f) => divisione(f, ...DIVISIONI_PRODUTTIVE),
    likelihood: 1,
    rationale: 'Attività di trasformazione con presenza di fonti di innesco e materiali combustibili.',
  },

  {
    kind: 'identifica',
    id: 'furto/scorte-o-commercio',
    rationaleSeIgnoto:
      'Da accertare se l’impresa detiene scorte o beni facilmente asportabili: è il presupposto ' +
      'stesso della garanzia furto.',
    risk: 'furto-scorte',
    when: (f) => {
      const conScorte = importoOltre(f.rimanenze, 10_000);
      if (conScorte === true) return true;
      const commercio = sezione(f, 'G');
      if (commercio === true) return true;
      return conScorte === 'ignoto' || commercio === 'ignoto' ? 'ignoto' : false;
    },
    rationale: 'Presenza di scorte o attività commerciale con beni facilmente asportabili.',
  },
  {
    kind: 'modula',
    id: 'furto/scorte-rilevanti',
    rationaleSeIgnoto:
      'Il valore delle rimanenze non è stato rilevato: oltre i 500.000 € il rischio furto cambia di ' +
      'grado. Si legge dalla voce C-I dello stato patrimoniale del bilancio depositato.',
    risk: 'furto-scorte',
    when: (f) => importoOltre(f.rimanenze, 500_000),
    impact: 1,
    rationale: 'Valore delle rimanenze superiore a 500.000 €.',
  },

  {
    kind: 'identifica',
    id: 'atmosferici/sempre',
    risk: 'eventi-atmosferici',
    when: SEMPRE,
    rationale: 'Esposizione generalizzata a vento, grandine e sovraccarico neve sui fabbricati occupati.',
  },

  {
    kind: 'identifica',
    id: 'sisma/sempre',
    risk: 'catastrofale-sisma',
    when: SEMPRE,
    rationale: "L'intero territorio nazionale è classificato in zona sismica.",
  },
  {
    kind: 'modula',
    id: 'sisma/zona-alta',
    rationaleSeIgnoto:
      'La zona sismica delle ubicazioni non è stata determinata: nelle zone 1 e 2 la probabilità ' +
      'dell’evento è sensibilmente maggiore.',
    risk: 'catastrofale-sisma',
    when: sismicaAlta,
    likelihood: 1,
    rationale: 'Sede o unità locali in provincia a sismicità prevalente elevata (zone 1-2).',
  },

  {
    kind: 'identifica',
    id: 'alluvione/sempre',
    risk: 'catastrofale-alluvione',
    when: SEMPRE,
    // L'obbligo lo afferma il capitolo CAT NAT, che sa per chi vale: qui si dice il
    // rischio, che c'è per tutti, non l'obbligo, che non è di tutti.
    rationale: 'Rischio idrogeologico diffuso su gran parte del territorio nazionale.',
  },
  {
    kind: 'modula',
    id: 'alluvione/zona-idraulica-alta',
    rationaleSeIgnoto:
      'La pericolosità idraulica delle ubicazioni non è stata determinata: nelle aree classificate ' +
      'a pericolosità elevata dal PAI la probabilità dell’evento cresce.',
    risk: 'catastrofale-alluvione',
    when: idraulicaAlta,
    likelihood: 1,
    rationale: 'Insediamento in provincia ad elevata pericolosità idraulica.',
  },

  {
    kind: 'identifica',
    id: 'guasto-macchinario/produttiva',
    risk: 'guasto-macchinario',
    when: (f) => {
      const produttiva = divisione(f, ...DIVISIONI_PRODUTTIVE);
      if (produttiva === true) return true;
      const impianti = importoOltre(f.valoreImpiantiNetto, 50_000);
      if (impianti === true) return true;
      return produttiva === 'ignoto' || impianti === 'ignoto' ? 'ignoto' : false;
    },
    rationale: 'Presenza di impianti e macchinari rilevanti nel ciclo produttivo.',
  },
  {
    kind: 'modula',
    id: 'guasto-macchinario/impianti-rilevanti',
    rationaleSeIgnoto:
      'Il valore degli impianti non è stato rilevato: oltre i 500.000 € al netto degli ammortamenti ' +
      'il guasto di un macchinario critico pesa in modo diverso. Si legge dalle voci B-II-2 e ' +
      'B-II-3 dello stato patrimoniale.',
    risk: 'guasto-macchinario',
    when: (f) => importoOltre(f.valoreImpiantiNetto, 500_000),
    impact: 1,
    rationale: 'Impianti iscritti a bilancio per oltre 500.000 € al netto degli ammortamenti.',
  },

  {
    kind: 'identifica',
    id: 'elettronica/sempre',
    risk: 'danno-elettronica',
    when: SEMPRE,
    rationale: 'Ogni impresa dipende da apparecchiature elettroniche per la propria operatività.',
  },

  // ── Interruzione ──────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'fermo/sempre',
    risk: 'fermo-attivita',
    when: SEMPRE,
    rationale:
      'Un danno materiale rilevante comporta sempre una perdita di margine nel periodo di ripristino.',
  },
  {
    kind: 'modula',
    id: 'fermo/margine-elevato',
    rationaleSeIgnoto:
      'Il margine di contribuzione non è stato rilevato: è la grandezza che misura quanto costa un ' +
      'mese di fermo, e si ricava dalle voci B-6 e B-7 del conto economico depositato.',
    risk: 'fermo-attivita',
    when: (f) => importoOltre(f.margineDiContribuzione, 1_000_000),
    impact: 1,
    /*
      Il numero è di questa impresa, non della soglia.

      Qui c'era «ogni mese di fermo vale oltre 80.000 €»: ottantamila è un milione diviso
      dodici, cioè la soglia della regola. Su un'azienda con dodici milioni di margine il
      valore vero era dodici volte tanto, e il broker leggeva al cliente il numero
      sbagliato — per difetto, che su una business interruption è il verso peggiore.
    */
    rationale: (f) =>
      f.margineDiContribuzione === null
        ? 'Margine di contribuzione rilevante: ogni mese di fermo attività ne perde una quota.'
        : `Margine di contribuzione annuo di ${Money.formatCompact(f.margineDiContribuzione)}: ` +
          `ogni mese di fermo vale ${Money.formatCompact(Money.multiply(f.margineDiContribuzione, 1 / 12))} ` +
          'di margine perso.',
  },
  {
    kind: 'modula',
    id: 'fermo/immobilizzazioni-specifiche',
    risk: 'fermo-attivita',
    when: (f) => divisione(f, ...DIVISIONI_PRODUTTIVE),
    likelihood: 1,
    rationale:
      'Ciclo produttivo legato a impianti specifici, difficilmente sostituibili nel breve periodo.',
  },

  {
    kind: 'identifica',
    id: 'fornitore-critico/produttiva',
    risk: 'dipendenza-fornitore-critico',
    when: (f) => divisione(f, ...DIVISIONI_PRODUTTIVE),
    rationale: 'Attività di trasformazione dipendente da forniture di materie prime e semilavorati.',
  },
  {
    kind: 'identifica',
    id: 'indisponibilita-sede/sempre',
    risk: 'indisponibilita-sede',
    when: SEMPRE,
    rationale: 'Ordinanze dell’autorità e danni a immobili limitrofi possono impedire l’accesso ai locali.',
  },
  {
    kind: 'modula',
    id: 'indisponibilita-sede/sede-unica',
    rationaleSeIgnoto:
      'Il numero di sedi operative non è stato rilevato: con un’unica sede non esiste alternativa ' +
      'operativa immediata dopo un sinistro.',
    risk: 'indisponibilita-sede',
    when: (f) => (f.numeroUnitaLocali === null ? 'ignoto' : f.numeroUnitaLocali <= 1),
    impact: 1,
    rationale: 'Sede unica: nessuna alternativa operativa immediata.',
  },

  // ── Responsabilità civile ─────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'rct/sempre',
    risk: 'rc-verso-terzi',
    when: SEMPRE,
    rationale: 'L’esercizio di qualunque attività d’impresa genera esposizione risarcitoria verso terzi.',
  },
  {
    kind: 'modula',
    id: 'rct/cantiere',
    rationaleSeIgnoto:
      'Da accertare se l’impresa opera presso cantieri o sedi di terzi: fuori dai propri locali ' +
      'l’esposizione a danni verso terzi è molto più elevata.',
    risk: 'rc-verso-terzi',
    when: (f) => {
      const dichiarato = tri(f.lavoraInCantiere);
      if (dichiarato === true) return true;
      return sezione(f, 'F') === true ? true : dichiarato;
    },
    likelihood: 1,
    impact: 1,
    rationale:
      'Attività svolta presso cantieri o sedi di terzi: esposizione a danni verso terzi molto più elevata.',
  },
  {
    kind: 'modula',
    id: 'rct/responsabilita-illimitata',
    risk: 'rc-verso-terzi',
    when: (f) => f.responsabilitaIllimitata,
    impact: 1,
    // «Il patrimonio dei soci» non vale per tutte e quattro le forme: nell'accomandita
    // rispondono i soli accomandatari, e nella ditta individuale non ci sono soci ma
    // l'imprenditore. Il regime esatto lo compone `governance/norme.ts`.
    rationale: (f) => regimeDiResponsabilita(f.formaGiuridica).testo,
  },

  {
    kind: 'identifica',
    id: 'rco/dipendenti',
    risk: 'rc-verso-dipendenti',
    when: (f) => tri(f.haDipendenti),
    rationale: 'Presenza di lavoratori subordinati: esposizione a rivalsa INAIL e danno differenziale.',
  },
  {
    kind: 'modula',
    id: 'rco/organico-esteso',
    risk: 'rc-verso-dipendenti',
    when: (f) => numeroOltre(f.addetti, 30),
    likelihood: 1,
    rationale:
      'Organico superiore a 30 addetti: frequenza attesa degli infortuni proporzionalmente maggiore.',
  },
  {
    kind: 'modula',
    id: 'rco/cantiere',
    rationaleSeIgnoto:
      'Da accertare se l’impresa svolge lavorazioni in cantiere: è il contesto a più elevata ' +
      'incidenza infortunistica.',
    risk: 'rc-verso-dipendenti',
    when: (f) => {
      const dichiarato = tri(f.lavoraInCantiere);
      return dichiarato === true || sezione(f, 'F') === true ? true : dichiarato;
    },
    likelihood: 1,
    rationale: 'Lavorazioni in cantiere: settore a più elevata incidenza infortunistica.',
  },

  {
    kind: 'identifica',
    id: 'rc-prodotto/produzione-o-distribuzione',
    risk: 'rc-prodotto',
    when: (f) => {
      const dichiarato = tri(f.produceBeniFinali);
      if (dichiarato === true) return true;
      const settore = sezione(f, 'C', 'G');
      if (settore === true) return true;
      return dichiarato === 'ignoto' || settore === 'ignoto' ? 'ignoto' : false;
    },
    /*
      Produttore e fornitore non rispondono allo stesso modo.

      Qui c'era «responsabilità oggettiva del produttore o del distributore». Per il mero
      fornitore la responsabilità è **sussidiaria**: scatta solo se il produttore non è
      individuato e il fornitore non ne comunica l'identità entro tre mesi (art. 116 Cod.
      cons.). Dire a un negozio che risponde come chi ha fabbricato il prodotto è falso.

      E l'art. 118 stava dalla parte sbagliata. Era citato accanto al 114 come fonte della
      responsabilità del produttore, mentre è la norma delle **esimenti** — fra cui il
      rischio da sviluppo. Il file gemello `coverage/taxonomy.ts` lo legge correttamente
      da tempo («nei limiti delle esimenti previste dalla legge»): qui la copia rovesciata
      era sopravvissuta, e stava nella frase che il broker legge al cliente. «Oggettiva»
      senza riserve è la versione che il legale della controparte smonta per primo.
    */
    rationale: (f) =>
      f.produceBeniFinali === true
        ? 'Immissione sul mercato di prodotti finiti: il produttore risponde del danno da prodotto ' +
          'difettoso a prescindere dalla colpa (art. 114 D.Lgs. 206/2005), nei limiti delle esimenti ' +
          'previste dall’art. 118.'
        : f.produceBeniFinali === false
          ? 'Commercializzazione di prodotti: il fornitore risponde in via sussidiaria quando il ' +
            'produttore non è individuato (art. 116 D.Lgs. 206/2005).'
          : 'Prodotti immessi sul mercato: il regime di responsabilità dipende dal ruolo nella catena — ' +
            'oggettivo per il produttore, sussidiario per il solo fornitore — e va accertato.',
  },
  {
    kind: 'modula',
    id: 'rc-prodotto/export-nord-america',
    risk: 'rc-prodotto',
    when: (f) => tri(f.esportaUsaCanada),
    likelihood: 1,
    impact: 1,
    rationale:
      'Esportazione verso USA e Canada: regime risarcitorio con danni punitivi e costi di difesa ' +
      'non comparabili a quelli europei.',
    /*
      La forma condizionale, qui, ha una cosa in più da dire: i mercati d'esportazione sono
      comprati e stampati due sezioni più su. Un dubbio che non ammette ciò che è già noto
      sembra una frase di riempimento, e chi legge smette di distinguerla da quelle che
      valgono.

      Il dubbio però resta, e non si chiude con quell'elenco: «altri paesi» comprende gli
      Stati Uniti senza nominarli.
    */
    rationaleSeIgnoto: (f) =>
      (f.paesiExportArchivio ?? null) !== null
        ? `Mercati di esportazione dichiarati all’archivio: ${(f.paesiExportArchivio ?? '').toLowerCase()}. ` +
          'Gli Stati Uniti e il Canada non vi risultano nominati, ma un elenco per aree non li ' +
          'esclude: la destinazione va accertata in intervista, perché là il regime risarcitorio ' +
          'prevede danni punitivi e costi di difesa non comparabili a quelli europei.'
        : 'Da accertare se l’impresa esporta verso USA e Canada: là il regime risarcitorio prevede ' +
          'danni punitivi e costi di difesa non comparabili a quelli europei.',
  },
  {
    kind: 'modula',
    id: 'rc-prodotto/export-rilevante',
    rationaleSeIgnoto:
      'La quota di export sul fatturato non è stata rilevata: oltre il 30% l’esposizione a più ' +
      'ordinamenti e a un foro competente estero diventa rilevante.',
    risk: 'rc-prodotto',
    when: (f) => (f.quotaExport === null ? 'ignoto' : f.quotaExport > 0.3),
    impact: 1,
    rationale:
      'Quota di export superiore al 30%: esposizione a più ordinamenti e a foro competente estero.',
  },

  {
    kind: 'identifica',
    id: 'inquinamento/settori-ambientali',
    risk: 'rc-inquinamento',
    when: (f) => divisione(f, ...DIVISIONI_AMBIENTALI),
    rationale:
      'Attività con potenziale impatto ambientale e obblighi di bonifica in caso di contaminazione.',
  },

  {
    kind: 'identifica',
    id: 'rc-professionale/servizi-professionali',
    risk: 'rc-professionale',
    /*
      La sezione Q mancava, e con lei l'unico obbligo di legge del gruppo.

      Misurato su 86.10.10 con sessanta dipendenti: quattordici coperture richieste e
      nessuna responsabilità professionale. L'art. 10 della L. 24/2017 impone alle
      strutture sanitarie e sociosanitarie, pubbliche e private, la copertura per la
      responsabilità civile verso terzi e verso i prestatori d'opera, anche per i danni
      cagionati dal personale a qualunque titolo operante. Non è un rischio sottostimato:
      è un obbligo che il prodotto non nominava, e l'intermediario che non lo nomina
      risponde lui.
    */
    when: (f) => sezione(f, 'M', 'J', 'K', 'Q'),
    /*
      Il titolo di responsabilità non è lo stesso, e la frase lo deve dire.

      Per la struttura sanitaria la responsabilità verso il paziente è contrattuale
      (art. 7 c. 1 L. 24/2017); per lo studio professionale è il danno patrimoniale da
      inesatta prestazione. Una frase sola per entrambi sarebbe vera per uno solo.
    */
    rationale: (f) =>
      f.atecoSezione === 'Q'
        ? 'Struttura sanitaria o sociosanitaria: risponde a titolo contrattuale dell’operato del ' +
          'personale a qualunque titolo operante, e la copertura della responsabilità verso terzi e ' +
          'verso i prestatori d’opera è imposta dalla legge.'
        : 'Prestazione di servizi professionali e tecnici: esposizione al danno puramente patrimoniale.',
  },

  // ── Persone ───────────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'infortunio-titolare/conduzione-personale',
    risk: 'infortunio-titolare',
    when: (f) => {
      if (f.responsabilitaIllimitata) return true;
      if (f.numeroSoci > 0 && f.numeroSoci <= 3) return true;
      return f.addetti === null ? 'ignoto' : f.addetti < 15;
    },
    rationale: 'Impresa a conduzione personale o familiare: il reddito dipende dalla persona del titolare.',
  },
  {
    kind: 'identifica',
    id: 'key-man/pmi',
    risk: 'perdita-key-man',
    when: (f) => (f.dimensione === 'grande' ? false : true),
    rationale: 'Nelle PMI competenze e relazioni commerciali sono concentrate su poche persone.',
  },
  {
    kind: 'modula',
    id: 'key-man/socio-unico-persona-fisica',
    risk: 'perdita-key-man',
    // Un solo socio persona fisica: la sua uscita non lascia nessuno legittimato a
    // decidere, e le banche revocano gli affidamenti prima che il notaio abbia finito.
    when: (f) => f.numeroSoci === 1 && !f.haSociPersonaGiuridica,
    impact: 1,
    likelihood: 0,
    rationale: 'Socio unico persona fisica: nessun altro socio può assumere le decisioni sociali.',
  },
  {
    kind: 'modula',
    id: 'key-man/organico-ridotto',
    risk: 'perdita-key-man',
    when: (f) => (f.addetti === null ? 'ignoto' : f.addetti < 10),
    impact: 1,
    rationale: 'Organico inferiore a 10 addetti: nessuna ridondanza sulle funzioni critiche.',
  },
  {
    kind: 'identifica',
    id: 'infortunio-dipendenti/presenza-organico',
    risk: 'infortunio-dipendenti',
    when: (f) => tri(f.haDipendenti),
    rationale: 'Presenza di personale dipendente esposto a rischio infortunistico.',
  },

  // ── Cyber ─────────────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'ransomware/sempre',
    risk: 'ransomware',
    when: SEMPRE,
    rationale: 'Le PMI sono il bersaglio prevalente degli attacchi ransomware opportunistici.',
  },
  {
    kind: 'modula',
    id: 'ransomware/dipendenza-produttiva',
    risk: 'ransomware',
    when: (f) => divisione(f, ...DIVISIONI_PRODUTTIVE),
    impact: 1,
    rationale: 'Sistemi gestionali e di controllo di produzione interconnessi: il blocco ferma la linea.',
  },
  {
    kind: 'identifica',
    id: 'data-breach/trattamento-dati',
    risk: 'data-breach',
    when: (f) => {
      const dichiarato = tri(f.trattaDatiPersonali);
      if (dichiarato === true) return true;
      // Con dipendenti si trattano comunque dati personali: il fatto è deducibile.
      return f.haDipendenti === true ? true : dichiarato;
    },
    rationale: 'Trattamento di dati personali di clienti, fornitori o dipendenti.',
  },
  {
    kind: 'modula',
    id: 'data-breach/dati-particolari',
    rationaleSeIgnoto:
      'Da accertare se l’impresa tratta categorie particolari di dati (art. 9 GDPR): in quel caso ' +
      'sanzioni e danno reputazionale sono superiori.',
    risk: 'data-breach',
    when: (f) => tri(f.trattaDatiParticolari),
    impact: 1,
    rationale:
      'Trattamento di categorie particolari di dati (art. 9 GDPR): sanzioni e danno reputazionale superiori.',
  },
  {
    kind: 'modula',
    id: 'data-breach/ecommerce',
    rationaleSeIgnoto:
      'Da accertare se esiste un canale e-commerce: espone una superficie di attacco su internet e ' +
      'comporta il trattamento di dati di pagamento.',
    risk: 'data-breach',
    when: (f) => tri(f.haEcommerce),
    likelihood: 1,
    rationale: 'Canale e-commerce attivo: superficie di attacco esposta su internet e dati di pagamento.',
  },
  {
    kind: 'identifica',
    id: 'frode-informatica/sempre',
    risk: 'frode-informatica',
    when: SEMPRE,
    rationale:
      'Le frodi su cambio IBAN e compromissione della posta aziendale colpiscono trasversalmente ogni settore.',
  },

  // ── Legale e governance ───────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'd-and-o/societa-di-capitali',
    risk: 'responsabilita-amministratori',
    /*
      Consorzio, associazione e fondazione mancavano — e lo stesso file asseriva loro la
      231.

      Le due cose non stanno insieme: se un ente risponde in proprio dei reati commessi
      nel suo interesse, ha un organo che quei reati può commetterli, e chi lo compone
      risponde della gestione. Il consorzio con attività esterna, l'associazione
      riconosciuta e la fondazione hanno amministratori distinti da chi conferisce i
      mezzi, ed è esattamente la fattispecie che la D&O serve.

      Restano fuori le forme in cui amministra chi possiede: società di persone e ditta
      individuale. Lì il tema non è la responsabilità dell'organo verso l'ente, ma quella
      patrimoniale del socio — che il prodotto tratta con `regimeDiResponsabilita`.
    */
    when: (f) =>
      f.formaGiuridica === 'spa' ||
      f.formaGiuridica === 'srl' ||
      f.formaGiuridica === 'srls' ||
      f.formaGiuridica === 'sapa' ||
      f.formaGiuridica === 'cooperativa' ||
      f.formaGiuridica === 'consorzio' ||
      f.formaGiuridica === 'associazione' ||
      f.formaGiuridica === 'fondazione',
    /*
      La norma non è la stessa per tutte. Qui c'era «artt. 2392 ss. c.c.» per tutte e
      cinque le forme: sono norme della S.p.A., citate a ogni S.r.l. — cioè alla forma
      più diffusa del portafoglio, e a quella dell'azienda dimostrativa.

      Corretta la norma restava sbagliata la prima parola: «Società di capitali» veniva
      detto anche alla società cooperativa, che di capitali non è — è mutualistica, e
      adotta il modello S.p.A. o quello S.r.l. secondo lo statuto. Una frase che comincia
      con una categoria falsa e prosegue con una citazione esatta è peggio di una
      generica: la citazione le dà l'aria di essere stata verificata.
    */
    rationale: (f) => {
      const norma = normaResponsabilitaAmministratori(f.formaGiuridica);
      if (norma !== null) {
        const categoria = categoriaSocietaria(f.formaGiuridica) ?? 'Ente con organo amministrativo';
        return `${categoria}: gli amministratori rispondono personalmente ex ${norma}`;
      }
      /*
        Senza norma nominata la frase non si completa con un default plausibile.

        «Rispondono verso la società, i soci e i terzi» era la coda che restava quando la
        norma mancava: in una fondazione non ci sono soci, e in un'associazione non c'è
        una società. Si dice ciò che vale per ogni ente collettivo — la responsabilità di
        chi amministra verso l'ente e verso i terzi — e non si nomina un articolo che il
        prodotto non ha accertato.
      */
      return (
        'Ente collettivo con organo amministrativo distinto da chi ne conferisce i mezzi: chi ' +
        'amministra risponde personalmente, verso l’ente e verso i terzi, degli atti di gestione.'
      );
    },
  },
  {
    kind: 'modula',
    id: 'd-and-o/patrimonio-rilevante',
    rationaleSeIgnoto:
      'Il totale attivo non è stato rilevato: oltre i 5 M€ l’entità delle azioni di responsabilità ' +
      'cresce in proporzione al patrimonio aggredibile.',
    risk: 'responsabilita-amministratori',
    when: (f) => importoOltre(f.totaleAttivo, 5_000_000),
    impact: 1,
    rationale:
      'Totale attivo superiore a 5 M€: entità delle azioni di responsabilità proporzionalmente maggiore.',
  },
  /*
    Le due posizioni nel gruppo non si equivalgono, e prima condividevano una regola sola.

    L'art. 2497 c.c. grava su chi ESERCITA la direzione e il coordinamento, a tutela dei
    soci e dei creditori della società diretta. Con `appartieneAGruppo` — vero anche per
    la controllata — il prodotto diceva alla parte che la norma protegge di esserne
    responsabile: rovesciava il ruolo giuridico.
  */
  {
    kind: 'modula',
    id: 'd-and-o/gruppo-esercita-direzione',
    risk: 'responsabilita-amministratori',
    when: (f) => f.esercitaDirezioneECoordinamento,
    likelihood: 1,
    rationale:
      'La società esercita direzione e coordinamento su altre società: risponde verso i soci e i ' +
      'creditori delle dirette (art. 2497 c.c.).',
  },
  {
    kind: 'modula',
    id: 'd-and-o/gruppo-soggetta-a-direzione',
    risk: 'responsabilita-amministratori',
    when: (f) => f.soggettaADirezioneECoordinamento,
    likelihood: 1,
    rationale:
      'La società è soggetta a direzione e coordinamento: i suoi amministratori rispondono in solido ' +
      'con la capogruppo se hanno preso parte al fatto lesivo (art. 2497, c. 2, c.c.), e vanno ' +
      'verificati i limiti della D&O di gruppo.',
  },
  {
    kind: 'identifica',
    id: 'contenzioso/sempre',
    risk: 'contenzioso-legale',
    when: SEMPRE,
    rationale:
      'Esposizione ordinaria a controversie con clienti, fornitori, dipendenti e pubbliche amministrazioni.',
  },
  {
    kind: 'identifica',
    id: '231/enti',
    risk: 'sanzioni-231',
    /*
      Il perimetro della norma non ha soglie dimensionali.

      L'art. 1, c. 2, D.Lgs. 231/2001 comprende «gli enti forniti di personalità giuridica
      e le società e associazioni anche prive di personalità giuridica»: niente addetti,
      niente fatturato. Il filtro precedente — società di capitali *e* oltre 15 addetti o
      5 M€ — lasciava fuori la S.r.l.s., l'accomandita, la s.n.c. e la s.a.s., e con esse
      ogni impresa piccola. È un falso negativo su un rischio con sanzioni interdittive
      che possono fermare l'attività.

      Le soglie erano un criterio commerciale di priorità travestito da perimetro
      normativo: la priorità resta, ma la dice la modulazione qui sotto, non l'esclusione.

      Ma il perimetro ha **due** commi, e qui se ne leggeva uno solo. Il comma 3 esclude
      lo Stato, gli enti pubblici territoriali, gli altri enti pubblici non economici e
      gli enti con funzioni di rilievo costituzionale: il codice asseriva la 231 a un
      comune. E la asseriva anche alla forma `'altro'`, che non è una forma — è il valore
      in cui finisce ciò che non si è saputo classificare, cioè l'ignoto travestito da
      dato.

      Dichiarato: `'ente-pubblico'` è un secchio grosso. Il normalizzatore vi fa cadere
      «comune», «provincia» e «regione» — enti territoriali, esclusi per nome dal comma 3
      — insieme a un generico «ente pubblico», che potrebbe essere economico e quindi
      dentro il perimetro. Si segue il comma che nomina la popolazione dominante; il caso
      dell'ente pubblico economico resta un falso negativo consapevole, e si chiude solo
      leggendo la natura dell'ente, che l'anagrafica camerale non porta.
    */
    when: (f) => {
      // L'impresa individuale non è un ente distinto dalla persona: fuori perimetro.
      if (f.formaGiuridica === 'ditta-individuale') return false;
      // Art. 1, c. 3: Stato, enti pubblici territoriali, enti pubblici non economici.
      if (f.formaGiuridica === 'ente-pubblico') return false;
      // Non una forma: il ripiego in cui cade ciò che non è stato riconosciuto.
      if (f.formaGiuridica === 'altro') return 'ignoto';
      return true;
    },
    rationale: (f) =>
      f.formaGiuridica === 'altro'
        ? 'Forma giuridica non riconosciuta dall’anagrafica: il perimetro del D.Lgs. 231/2001 ' +
          'comprende gli enti e le società di diritto privato ed esclude lo Stato e gli enti pubblici ' +
          'non economici (art. 1, cc. 2 e 3). Va accertata la natura dell’ente prima di concludere.'
        : 'La responsabilità amministrativa da reato riguarda gli enti e le società, senza soglie ' +
          'dimensionali (art. 1, c. 2, D.Lgs. 231/2001). Le sanzioni comprendono misure interdittive ' +
          'che possono sospendere l’attività.',
  },
  {
    kind: 'modula',
    id: '231/ente-strutturato',
    risk: 'sanzioni-231',
    when: (f) => {
      const perAddetti = numeroOltre(f.addetti, 15);
      if (perAddetti === true) return true;
      const perFatturato = importoOltre(f.fatturato, 5_000_000);
      if (perFatturato === true) return true;
      return perAddetti === 'ignoto' && perFatturato === 'ignoto' ? 'ignoto' : false;
    },
    likelihood: 1,
    rationale:
      'Organizzazione strutturata: più funzioni delegate, più occasioni in cui un reato presupposto ' +
      'può essere commesso nell’interesse dell’ente.',
  },

  // ── Credito ───────────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'insolvenza-clienti/crediti-commerciali',
    rationaleSeIgnoto:
      'L’entità dei crediti commerciali non è stata rilevata: è la voce dell’attivo esposta al ' +
      'mancato incasso, e si legge dalla voce C-II-1 dello stato patrimoniale.',
    risk: 'insolvenza-clienti',
    when: (f) => importoOltre(f.creditiVersoClienti, 25_000),
    rationale: 'Presenza di crediti commerciali significativi esposti al rischio di mancato incasso.',
  },
  {
    kind: 'modula',
    id: 'insolvenza-clienti/esposizione-rilevante',
    rationaleSeIgnoto:
      'Crediti verso clienti e patrimonio netto non sono entrambi disponibili: quando i primi ' +
      'superano il secondo, una sola insolvenza rilevante erode i mezzi propri.',
    risk: 'insolvenza-clienti',
    when: (f) => {
      if (f.creditiVersoClienti === null || f.patrimonioNetto === null) return 'ignoto';
      if (!Money.isPositive(f.patrimonioNetto)) return true;
      return Money.toEuro(f.creditiVersoClienti) > Money.toEuro(f.patrimonioNetto);
    },
    impact: 1,
    rationale:
      'I crediti verso clienti superano il patrimonio netto: un’insolvenza rilevante erode i mezzi propri.',
  },
  {
    kind: 'identifica',
    id: 'concentrazione/primo-cliente',
    rationaleSeIgnoto:
      'La concentrazione del fatturato sul primo cliente non è stata rilevata: è il dato che ' +
      'determina se questo rischio riguardi l’impresa, e nessun archivio lo contiene.',
    risk: 'concentrazione-clienti',
    when: (f) => (f.concentrazionePrimoCliente === null ? 'ignoto' : f.concentrazionePrimoCliente > 0.2),
    rationale: 'Quota rilevante del fatturato concentrata su un singolo cliente.',
  },
  {
    kind: 'modula',
    id: 'concentrazione/molto-elevata',
    rationaleSeIgnoto:
      'La quota del primo cliente non è stata rilevata: oltre il 40% la sua perdita compromette ' +
      'l’equilibrio economico dell’impresa.',
    risk: 'concentrazione-clienti',
    when: (f) => (f.concentrazionePrimoCliente === null ? 'ignoto' : f.concentrazionePrimoCliente > 0.4),
    impact: 1,
    likelihood: 1,
    rationale:
      'Oltre il 40% del fatturato su un solo cliente: la sua perdita compromette l’equilibrio economico.',
  },

  // ── Trasporti ─────────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'merci/trasporto-proprio-o-settore',
    rationaleSeIgnoto:
      'Da accertare se l’impresa movimenta merci proprie o per conto terzi: i limiti di ' +
      'responsabilità del vettore non risarciscono il valore reale della merce.',
    risk: 'danno-merci-trasporto',
    when: (f) => {
      const dichiarato = tri(f.trasportaMerciProprie);
      if (dichiarato === true) return true;
      const settore = sezione(f, 'G', 'H');
      if (settore === true) return true;
      return dichiarato === 'ignoto' || settore === 'ignoto' ? 'ignoto' : false;
    },
    rationale:
      'Movimentazione di merci proprie o per conto terzi oltre i limiti di responsabilità del vettore.',
  },
  {
    kind: 'identifica',
    id: 'flotta/veicoli-aziendali',
    rationaleSeIgnoto:
      'Il parco veicoli non è stato rilevato: ogni veicolo aziendale è soggetto a obbligo ' +
      'assicurativo per la circolazione e a rischio di sinistro.',
    risk: 'sinistro-flotta',
    when: (f) => (f.numeroVeicoli === null ? 'ignoto' : f.numeroVeicoli > 0),
    rationale: 'Presenza di veicoli aziendali soggetti a obbligo assicurativo e a rischio di sinistro.',
  },
  {
    kind: 'modula',
    id: 'flotta/parco-esteso',
    rationaleSeIgnoto:
      'Il numero di veicoli non è stato rilevato: oltre i dieci la gestione passa al libro ' +
      'matricola e la sinistrosità attesa diventa significativa.',
    risk: 'sinistro-flotta',
    when: (f) => numeroOltre(f.numeroVeicoli, 10),
    likelihood: 1,
    impact: 1,
    rationale:
      'Parco superiore a 10 veicoli: gestione a libro matricola e sinistrosità attesa significativa.',
  },

  // ── Contrattuale ──────────────────────────────────────────────────────────
  {
    kind: 'identifica',
    id: 'garanzie/costruzioni-e-appalti',
    risk: 'escussione-garanzie',
    when: (f) => sezione(f, 'F'),
    rationale:
      'Attività su appalti e commesse con obbligo di prestare cauzioni e garanzie di buona esecuzione.',
  },

  // ── Normativo ─────────────────────────────────────────────────────────────
  /*
    Qui c'era `catnat/imprese-registro-imprese`, una **seconda** implementazione del
    perimetro dell'obbligo catastrofale: `atecoSezione !== 'A'`.

    Divergeva dal motore su tre popolazioni su tre, dentro lo stesso documento.
    All'impresa cessata e all'agricola — che `coverage/catnat.ts` esclude — il registro
    dichiarava «soggetta all'obbligo assicurativo catastrofale ex L. 213/2023» e apriva la
    strada a ventidue coperture; alla pesca, che il motore dichiara soggetta perché il
    Fondo AGRICAT non la copre, il registro taceva.

    Il perimetro di un obbligo di legge non può avere due letture: sta in `catnat.ts`, che
    conosce la forma giuridica, lo stato di attività e la divisione ATECO. Il registro
    riceve l'esito già preso (`AssessRisksOptions.catNat`) e lo riporta. È lo schema che
    `obbligoPerImpresa` adottava già leggendo `catNat.soggetta` invece di ricalcolarlo.
  */
  {
    kind: 'modula',
    id: 'catnat/beni-rilevanti',
    rationaleSeIgnoto:
      'Il valore degli immobili strumentali non è stato rilevato: determina l’entità dei beni da ' +
      'assicurare per obbligo di legge.',
    risk: 'inadempimento-catnat',
    when: (f) => importoOltre(f.valoreImmobiliNetto, 200_000),
    impact: 1,
    rationale:
      'Immobili strumentali di valore rilevante: entità dei beni da assicurare per obbligo di legge.',
  },
  {
    kind: 'identifica',
    id: 'sicurezza-lavoro/dipendenti',
    risk: 'sicurezza-lavoro',
    when: (f) => tri(f.haDipendenti),
    rationale: 'Obblighi del datore di lavoro in materia di salute e sicurezza ex D.Lgs. 81/2008.',
  },
  {
    kind: 'modula',
    id: 'sicurezza-lavoro/settore-a-rischio',
    risk: 'sicurezza-lavoro',
    when: (f) => {
      const costruzioni = sezione(f, 'F');
      if (costruzioni === true) return true;
      return divisione(f, ...DIVISIONI_PRODUTTIVE);
    },
    likelihood: 1,
    rationale: 'Settore ad elevata incidenza infortunistica secondo le statistiche INAIL.',
  },

  // ── Controlli in essere (riducono il rischio residuo) ──────────────────────
  {
    kind: 'controllo',
    id: 'controllo/impianto-antincendio',
    risk: 'incendio-fabbricati',
    when: (f) => tri(f.haImpiantoAntincendio),
    likelihood: -1,
    rationale: 'Impianto di rilevazione e spegnimento dichiarato presente.',
    misura:
      'Installare un impianto di rilevazione e spegnimento automatico: è la protezione che le compagnie riconoscono con lo sconto più consistente sul premio incendio.',
  },
  {
    kind: 'controllo',
    id: 'controllo/allarme-antifurto',
    risk: 'furto-scorte',
    when: (f) => tri(f.haAllarme),
    likelihood: -1,
    rationale: 'Impianto di allarme dichiarato presente.',
    misura:
      'Installare un impianto di allarme con collegamento a istituto di vigilanza. Molte polizze furto lo richiedono come condizione di operatività, non come sconto: senza, la garanzia può non rispondere.',
  },
  {
    kind: 'controllo',
    id: 'controllo/modello-231',
    risk: 'sanzioni-231',
    when: (f) => tri(f.haModello231),
    likelihood: -1,
    impact: -1,
    rationale:
      'Modello di organizzazione, gestione e controllo adottato: efficacia esimente ex art. 6 D.Lgs. 231/2001 se attuato e vigilato.',
    misura:
      'Adottare un modello di organizzazione e gestione ex D.Lgs. 231/2001 con organismo di vigilanza: è l’unica esimente prevista dalla norma, e senza di essa la responsabilità dell’ente non si esclude.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-27001-ransomware',
    risk: 'ransomware',
    when: (f) => certificata(f, 'ISO 27001', 'ISO/IEC 27001'),
    likelihood: -1,
    rationale: 'Sistema di gestione della sicurezza delle informazioni certificato ISO/IEC 27001.',
    misura:
      'Certificare un sistema di gestione della sicurezza delle informazioni (ISO/IEC 27001): sopra certe soglie di fatturato le compagnie cyber ne condizionano l’offerta.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-27001-databreach',
    risk: 'data-breach',
    when: (f) => certificata(f, 'ISO 27001', 'ISO/IEC 27001'),
    likelihood: -1,
    rationale: 'Sistema di gestione della sicurezza delle informazioni certificato ISO/IEC 27001.',
    misura:
      'Certificare un sistema di gestione della sicurezza delle informazioni (ISO/IEC 27001): riduce la probabilità di violazione e documenta le misure adeguate richieste dall’art. 32 GDPR.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-45001',
    risk: 'sicurezza-lavoro',
    when: (f) => certificata(f, 'ISO 45001', 'OHSAS 18001'),
    likelihood: -1,
    rationale: 'Sistema di gestione della salute e sicurezza sul lavoro certificato.',
    misura:
      'Certificare un sistema di gestione della salute e sicurezza sul lavoro (ISO 45001): incide sulla frequenza degli infortuni e sulla posizione dell’impresa in caso di contestazione.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-45001-infortuni',
    risk: 'infortunio-dipendenti',
    when: (f) => certificata(f, 'ISO 45001', 'OHSAS 18001'),
    likelihood: -1,
    rationale: 'Sistema di gestione della sicurezza certificato: minore frequenza attesa degli infortuni.',
    misura:
      'Certificare un sistema di gestione della sicurezza (ISO 45001): minore frequenza attesa degli infortuni, e un elemento a favore nella valutazione della responsabilità.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-9001-prodotto',
    risk: 'rc-prodotto',
    when: (f) => certificata(f, 'ISO 9001'),
    likelihood: -1,
    rationale:
      'Sistema di gestione della qualità certificato ISO 9001: tracciabilità e controllo dei lotti.',
    misura:
      'Certificare un sistema di gestione della qualità (ISO 9001) con tracciabilità dei lotti: in caso di difetto la tracciabilità circoscrive il richiamo invece di estenderlo a tutta la produzione.',
  },
  {
    kind: 'controllo',
    id: 'controllo/iso-14001',
    risk: 'rc-inquinamento',
    when: (f) => certificata(f, 'ISO 14001', 'EMAS'),
    likelihood: -1,
    rationale: 'Sistema di gestione ambientale certificato.',
    misura:
      'Certificare un sistema di gestione ambientale (ISO 14001): riduce la probabilità di evento inquinante e documenta la diligenza dell’impresa.',
  },
];

/** Regole applicabili a un dato rischio, per mostrarne la motivazione nel report. */
export function rulesForRisk(risk: RiskId): readonly RiskRule[] {
  return RISK_RULES.filter((r) => r.risk === risk);
}

export const RULES_VERSION = '2026.1';

/** Predicati esportati per la scrittura di regole personalizzate per singolo intermediario. */
export const predicates = {
  tri,
  sezione,
  divisione,
  atecoTra,
  importoOltre,
  numeroOltre,
  certificata,
  sismicaAlta,
  idraulicaAlta,
} as const;
