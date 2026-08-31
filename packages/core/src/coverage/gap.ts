/**
 * Gap analysis: ciò che serve contro ciò che c'è.
 *
 * È il documento che il cliente porta a casa. Per ogni copertura risponde a quattro domande:
 * *serve? perché? quanto? cosa manca rispetto a oggi?* — e la risposta al «perché» è già
 * scritta nella forma richiesta dal Reg. IVASS 40/2018 per la motivazione dell'adeguatezza.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { AssessedRisk, RiskAssessment } from '../risk/engine.js';
import { riskLevelRank } from '../risk/assessment.js';
import type { RiskLevel } from '../risk/assessment.js';
import type { CatNatAssessment } from './catnat.js';
import {
  capitaleDiPolizza,
  giorniAllaScadenza,
  indexPolizze,
  isScaduta,
  metroDiIndennizzo,
} from './policy.js';
import type { PolizzaInEssere } from './policy.js';
import type { SumsInsured } from './sums-insured.js';
import { COVERAGE_CATALOG } from './taxonomy.js';
import type { BasiDiCalcolo, CoverageDefinition, CoverageId } from './taxonomy.js';
import { computeUnderinsurance } from './underinsurance.js';
import type { Underinsurance } from './underinsurance.js';
import type { DannoMassimo } from './danno-massimo.js';
import { componiMotivazioneCopertura, obbligoPerImpresa } from './motivazione.js';
import type { ObbligoPerImpresa } from './motivazione.js';
import type { CompanyFacts } from '../company/facts.js';
import type { Confidence } from '../shared/provenance.js';
import { formattaGiorno } from '../shared/tempo.js';

export type GapStatus =
  /** Copertura necessaria e completamente assente. */
  | 'assente'
  /** Copertura presente ma con capitale insufficiente rispetto al valore reale. */
  | 'sottoassicurata'
  /** Copertura presente con massimale inferiore al benchmark consigliato. */
  | 'massimale-insufficiente'
  /** Copertura presente e congrua, ma in scadenza ravvicinata. */
  | 'in-scadenza'
  /** Copertura presente e congrua. */
  | 'adeguata'
  /** Copertura necessaria ma capitale non determinabile con i dati disponibili. */
  | 'da-quantificare';

export const GAP_STATUS_LABEL: Readonly<Record<GapStatus, string>> = {
  assente: 'Copertura assente',
  sottoassicurata: 'Sottoassicurata',
  'massimale-insufficiente': 'Massimale insufficiente',
  'in-scadenza': 'In scadenza',
  adeguata: 'Adeguata',
  'da-quantificare': 'Da quantificare',
};

/** Giorni entro i quali una polizza è considerata «in scadenza». */
export const SOGLIA_SCADENZA_GIORNI = 90;

export interface CoverageGap {
  readonly definition: CoverageDefinition;
  readonly status: GapStatus;
  /** Priorità 0-100 per l'ordinamento del piano d'azione. */
  readonly priorita: number;
  readonly rischiServiti: readonly AssessedRisk[];
  readonly livelloRischioMassimo: RiskLevel | null;
  readonly capitaleRaccomandato: Explained<Euro | null>;
  /**
   * Il capitale che una garanzia **in vigore oggi** assicura.
   *
   * `null` anche quando una polizza c'è ma è scaduta: un contratto cessato non garantisce
   * un euro, e sottrarlo dall'esposizione la dichiarerebbe coperta da qualcosa che non
   * esiste più.
   */
  readonly capitaleInEssere: Euro | null;
  readonly polizza: PolizzaInEssere | null;
  /**
   * La polizza indicizzata per questa garanzia risulta scaduta alla data dell'analisi.
   *
   * Resta a fascicolo — va nominata, perché il cliente ce l'ha in mano e chiederà conto
   * di che fine ha fatto — ma non conta come copertura.
   */
  readonly polizzaScaduta: boolean;
  readonly sottoassicurazione: Explained<Underinsurance | null> | null;
  /**
   * `true` solo quando l'obbligo grava su **questa** impresa.
   *
   * Conservato per compatibilità con chi già lo legge; il dettaglio — compreso il caso
   * «non si sa» e il motivo dell'esclusione — sta in `obbligo`.
   */
  readonly obbligoDiLegge: boolean;
  readonly obbligo: ObbligoPerImpresa;
  readonly azione: string;
  /** Motivazione pronta per il fascicolo di adeguatezza (Reg. IVASS 40/2018, All. 4-ter). */
  readonly motivazioneAdeguatezza: string;
  /**
   * I fatti in base ai quali la motivazione è stata scritta.
   *
   * Davanti a una contestazione la domanda non è «cosa avete scritto» ma «in base a
   * quale fatto»: senza questa riga il fascicolo non ha risposta.
   */
  readonly motivazionePresupposti: readonly string[];
  /** Le sole norme applicabili a questa impresa, non quelle della copertura in astratto. */
  readonly motivazioneRiferimenti: readonly string[];
  /** `bassa` quando un frammento poggia su un dato che nessuno ha rilevato. */
  readonly motivazioneConfidenza: Confidence;
  readonly insidie: readonly string[];
  /** Chi fa cosa ed entro quando: l'ISO 31000 chiede che il trattamento sia un piano. */
  readonly piano: PianoDiTrattamento;
}

/**
 * Il piano di trattamento.
 *
 * L'ISO 31000 (§6.5.3) non si accontenta che il trattamento sia scelto: chiede che sia
 * **pianificato** — chi agisce, entro quando, e perché quel termine. Un'azione scritta bene
 * ma senza titolare né data è un buon proposito, e davanti a una contestazione dimostra che
 * si è emesso un documento, non che si è seguita la pratica.
 *
 * Il titolare dell'azione non è un dettaglio organizzativo: alcune cose le può fare solo
 * l'intermediario — chiedere una quotazione, far emettere un'appendice — altre solo il
 * cliente, come installare una protezione o fornire un dato che nessun bilancio contiene.
 * Attribuirle tutte all'intermediario significa promettere ciò che non si può mantenere.
 */
export interface PianoDiTrattamento {
  readonly urgenza: 'immediata' | 'entro-30-giorni' | 'alla-scadenza' | 'prossima-revisione';
  /** Termine entro cui agire. `null` quando dipende da una scadenza non ancora nota. */
  readonly termine: Date | null;
  readonly aCura: 'intermediario' | 'cliente' | 'congiunta';
  readonly motivazioneTermine: string;
}

export interface GapAnalysis {
  readonly gaps: readonly CoverageGap[];
  readonly asOf: Date;
  readonly coperturaAssente: number;
  readonly coperturaInadeguata: number;
  readonly coperturaAdeguata: number;
  /**
   * Garanzie il cui capitale non è determinabile con i dati disponibili.
   *
   * Vanno contate a parte: la loro esposizione **non entra** in `esposizioneNonAssicurata`,
   * che altrimenti dichiarerebbe come zero ciò che è soltanto ignoto. Un «0 €» accanto a
   * sei coperture assenti non è un dato rassicurante, è un dato falso.
   */
  readonly coperturaDaQuantificare: number;
  /**
   * Quante polizze in essere sono state dichiarate.
   *
   * **Zero cambia il significato di tutto il resto.** Senza polizze inserite, «copertura
   * assente» non è un accertamento: è l'assenza di un'informazione. Il piano continua a
   * dire quali garanzie servono — che è utile e corretto — ma non può affermare che
   * manchino, perché nessuno gli ha detto cosa c'è.
   *
   * Su un prodotto che un intermediario mostra a un cliente già assicurato, la differenza
   * fra «non risulta» e «non ce l'hai» è la differenza fra una proposta e una figuraccia.
   */
  readonly polizzeDichiarate: number;
  /**
   * Capitale complessivo non assicurato sulle garanzie a valore.
   *
   * Somma **solo ciò che è stato possibile quantificare**: si legge insieme a
   * `coperturaDaQuantificare`, mai da solo.
   */
  readonly esposizioneNonAssicurata: Euro;
  /** Premio annuo complessivo delle polizze in essere, ove noto. */
  readonly premioInEssere: Euro | null;
}

export interface GapAnalysisInput {
  readonly assessment: RiskAssessment;
  /**
   * I fatti dell'impresa.
   *
   * Senza di essi la motivazione di adeguatezza non poteva che essere uguale per tutti:
   * era il motivo strutturale per cui clausole valide solo per alcune forme giuridiche
   * finivano stampate a chiunque.
   */
  readonly facts: CompanyFacts;
  readonly sums: SumsInsured;
  readonly polizze: readonly PolizzaInEssere[];
  readonly catNat: CatNatAssessment | null;
  /**
   * Il danno massimo probabile, quando è stato stimato.
   *
   * Serve a giudicare una polizza scritta a **primo rischio assoluto**: quella forma non
   * si misura sul valore dei beni ma sulla perdita attesa in un solo sinistro, ed è il
   * metro che mancava. Vale per l'incendio, perché il modello è fisicamente specifico di
   * quel rischio: compartimentazione e sprinkler non fanno nulla contro un sisma.
   */
  readonly dannoMassimo: DannoMassimo | null;
  readonly asOf: Date;
}

export function analyzeGaps(input: GapAnalysisInput): GapAnalysis {
  const { assessment, facts, sums, polizze, catNat, dannoMassimo, asOf } = input;
  const indice = indexPolizze(polizze, asOf);

  // Coperture da valutare: quelle richieste dall'analisi dei rischi più quelle
  // già in portafoglio (vanno comunque verificate, e talvolta risultano superflue).
  const daValutare = new Set<CoverageId>();
  for (const risk of assessment.risks) {
    if (risk.treatment !== 'trasferire') continue;
    for (const coverage of risk.coverages) daValutare.add(coverage);
  }
  for (const polizza of polizze) daValutare.add(polizza.coverage);
  if (catNat?.soggetta === true) daValutare.add('catastrofali');

  const gaps: CoverageGap[] = [];
  for (const coverageId of daValutare) {
    gaps.push(
      buildGap(
        coverageId,
        assessment,
        facts,
        sums,
        indice.get(coverageId) ?? null,
        catNat,
        dannoMassimo,
        asOf,
      ),
    );
  }

  // Ordinamento totale e deterministico: due esecuzioni sulla stessa azienda devono
  // produrre lo stesso piano d'azione, altrimenti il confronto storico è impossibile.
  gaps.sort((a, b) => {
    if (b.priorita !== a.priorita) return b.priorita - a.priorita;
    if (a.obbligoDiLegge !== b.obbligoDiLegge) return a.obbligoDiLegge ? -1 : 1;
    const livelloA = a.livelloRischioMassimo === null ? -1 : riskLevelRank(a.livelloRischioMassimo);
    const livelloB = b.livelloRischioMassimo === null ? -1 : riskLevelRank(b.livelloRischioMassimo);
    if (livelloA !== livelloB) return livelloB - livelloA;
    return a.definition.label.localeCompare(b.definition.label, 'it');
  });

  const esposizioneNonAssicurata = calcolaEsposizioneNonAssicurata(gaps);

  const premi = polizze.map((p) => p.premioAnnuo).filter((p): p is Euro => p !== null);

  return {
    gaps,
    asOf,
    coperturaAssente: gaps.filter((g) => g.status === 'assente').length,
    coperturaInadeguata: gaps.filter(
      (g) => g.status === 'sottoassicurata' || g.status === 'massimale-insufficiente',
    ).length,
    coperturaAdeguata: gaps.filter((g) => g.status === 'adeguata' || g.status === 'in-scadenza').length,
    coperturaDaQuantificare: gaps.filter((g) => g.status === 'da-quantificare').length,
    esposizioneNonAssicurata,
    polizzeDichiarate: polizze.length,
    premioInEssere: premi.length === 0 ? null : Money.add(...premi),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function buildGap(
  coverageId: CoverageId,
  assessment: RiskAssessment,
  facts: CompanyFacts,
  sums: SumsInsured,
  polizza: PolizzaInEssere | null,
  catNat: CatNatAssessment | null,
  dannoMassimo: DannoMassimo | null,
  asOf: Date,
): CoverageGap {
  const definition = COVERAGE_CATALOG[coverageId];
  const rischiServiti = assessment.risks.filter((r) => r.coverages.includes(coverageId));
  const livelloRischioMassimo = worstLevel(rischiServiti);

  const capitaleRaccomandato = capitalePerCopertura(coverageId, sums);
  const polizzaScaduta = polizza !== null && isScaduta(polizza, asOf);
  const capitaleInEssere = polizza === null || polizzaScaduta ? null : capitaleDiPolizza(polizza);

  const { status, sottoassicurazione } = determinaStato(
    coverageId,
    capitaleRaccomandato.value,
    capitaleInEssere,
    polizza,
    dannoMassimo,
    asOf,
  );

  // L'obbligo è dell'impresa, non della copertura: la CAT NAT non è dovuta da chi la
  // legge esclude, e la RCA nasce dal veicolo posto in circolazione.
  const obbligo = obbligoPerImpresa(definition, facts, catNat);
  const priorita = calcolaPriorita(obbligo, status, livelloRischioMassimo, catNat, definition.id);
  const motivazione = componiMotivazioneCopertura(definition, facts, rischiServiti, catNat);

  return {
    definition,
    status,
    priorita,
    rischiServiti,
    livelloRischioMassimo,
    capitaleRaccomandato,
    capitaleInEssere,
    polizza,
    polizzaScaduta,
    sottoassicurazione,
    obbligoDiLegge: obbligo.dovuto === true,
    obbligo,
    azione: descriviAzione(definition, status, capitaleRaccomandato.value, capitaleInEssere, polizza, asOf),
    motivazioneAdeguatezza: motivazione.testo,
    motivazionePresupposti: motivazione.presupposti,
    motivazioneRiferimenti: motivazione.riferimenti,
    motivazioneConfidenza: motivazione.confidenza,
    insidie: definition.insidie,
    piano: componiPiano(status, obbligo, livelloRischioMassimo, polizza, catNat, asOf),
  };
}

/**
 * Termine e titolare, dedotti da ciò che rende l'azione urgente.
 *
 * L'ordine di precedenza non è estetico: prima gli obblighi di legge già scaduti, poi le
 * garanzie cessate, poi le scadenze contrattuali, poi la gravità del rischio. È l'ordine
 * in cui le conseguenze si manifestano.
 */
function componiPiano(
  status: GapStatus,
  obbligo: ObbligoPerImpresa,
  livello: RiskLevel | null,
  polizza: PolizzaInEssere | null,
  catNat: CatNatAssessment | null,
  asOf: Date,
): PianoDiTrattamento {
  const fraGiorni = (giorni: number): Date => new Date(asOf.getTime() + giorni * 86_400_000);

  // Obbligo di legge non adempiuto: il termine è già passato, non se ne fissa un altro.
  //
  // `dovuto === true` e non `definition.obbligoDiLegge`: quest'ultimo è una proprietà
  // della copertura e vale per chiunque. Con quello, a un'impresa agricola — che dalla
  // CAT NAT è esclusa per legge — il piano dichiarava un termine scaduto oggi stesso,
  // perché `catNat.termine` per una non soggetta è `null` e il ripiego era `asOf`.
  if (obbligo.dovuto === true && status === 'assente') {
    return {
      urgenza: 'immediata',
      termine: catNat?.termine ?? asOf,
      aCura: 'intermediario',
      motivazioneTermine:
        'Obbligo di legge: il termine è fissato dalla norma, non dalla pianificazione. Va documentato di averlo rappresentato al cliente anche se questi decide di non adempiere.',
    };
  }

  /*
    Garanzia cessata: la scopertura è in atto oggi, non è un termine da pianificare.

    Prima questo caso cadeva nel ramo 'in-scadenza' e fissava come termine la data di
    scadenza — cioè una data del passato — con urgenza «alla scadenza». Un piano che
    programma un'azione per un giorno già trascorso non è un piano.
  */
  if (polizza !== null && isScaduta(polizza, asOf)) {
    return {
      urgenza: 'immediata',
      termine: asOf,
      aCura: 'intermediario',
      motivazioneTermine:
        'La garanzia risulta scaduta: il periodo scoperto è cominciato ed è in corso. Va verificato ' +
        'se il contratto è stato rinnovato altrove e, in mancanza, ripristinata la copertura. ' +
        'Ogni giorno di attesa è un giorno in cui il danno resta interamente a carico dell’impresa.',
    };
  }

  // «Non so se sei obbligato» non è «sei inadempiente»: si verifica, non si intima.
  if (obbligo.dovuto === null && status === 'assente') {
    return {
      urgenza: 'prossima-revisione',
      termine: null,
      aCura: 'congiunta',
      motivazioneTermine:
        'Per questa copertura esiste un obbligo di legge, ma il dato che stabilisce se gravi su questa impresa non è stato rilevato. Va accertato prima di dichiarare un inadempimento.',
    };
  }

  // Il dato manca: nessun termine ha senso finché il cliente non lo fornisce.
  if (status === 'da-quantificare') {
    return {
      urgenza: 'prossima-revisione',
      termine: null,
      aCura: 'cliente',
      motivazioneTermine:
        'Il capitale non è determinabile con i dati disponibili: la palla è al cliente, e fissare una scadenza su un dato che non si possiede sarebbe un termine finto.',
    };
  }

  if (status === 'in-scadenza' && polizza !== null) {
    return {
      urgenza: 'alla-scadenza',
      termine: polizza.dataScadenza,
      aCura: 'intermediario',
      motivazioneTermine:
        'Il rinnovo è anche l’unico momento in cui i capitali si adeguano senza appendici: accorparvi la revisione evita un secondo passaggio.',
    };
  }

  if (status === 'sottoassicurata' || status === 'massimale-insufficiente') {
    return {
      urgenza: 'entro-30-giorni',
      termine: fraGiorni(30),
      aCura: 'intermediario',
      motivazioneTermine:
        'La garanzia c’è ma non è capiente: fino all’appendice ogni sinistro viene indennizzato in misura ridotta. Non è un’attesa che si possa portare alla scadenza.',
    };
  }

  if (status === 'assente' && (livello === 'critico' || livello === 'alto')) {
    return {
      urgenza: 'entro-30-giorni',
      termine: fraGiorni(30),
      aCura: 'intermediario',
      motivazioneTermine:
        'Rischio residuo elevato e nessuna copertura: il tempo che passa è tempo in cui il danno resta interamente a carico dell’impresa.',
    };
  }

  if (status === 'assente') {
    return {
      urgenza: 'prossima-revisione',
      termine: fraGiorni(180),
      aCura: 'congiunta',
      motivazioneTermine:
        'Rischio presente ma di gravità contenuta: si affronta alla prossima revisione del programma assicurativo, valutandolo insieme alle altre priorità.',
    };
  }

  return {
    urgenza: 'prossima-revisione',
    termine: polizza?.dataScadenza ?? null,
    aCura: 'intermediario',
    motivazioneTermine:
      'Copertura adeguata: si riesamina alla scadenza, verificando che i capitali siano rimasti allineati.',
  };
}

/** Mappa copertura → capitale consigliato, attingendo alle somme assicurande calcolate. */
function capitalePerCopertura(coverageId: CoverageId, sums: SumsInsured): Explained<Euro | null> {
  switch (coverageId) {
    case 'incendio':
      return widen(sums.patrimonioEsposto);
    case 'furto-rapina':
      return widen(sums.scorte);
    case 'catastrofali':
      return widen(sums.baseCatNat);
    case 'guasti-macchine':
      return widen(sums.contenuto);
    case 'elettronica':
      return nonQuantificabile(
        'Elettronica',
        'Rilevare il valore a nuovo di server, hardware e strumentazione: la voce non è isolabile dal bilancio.',
      );
    case 'danni-indiretti':
      return widen(sums.danniIndiretti);
    case 'rct':
    case 'rc-professionale':
      return widen(sums.massimaleRct);
    /*
      Due garanzie che prendevano in prestito il numero e la spiegazione della RCT.

      Il benchmark RCT misura il danno risarcibile a terzi per classe di fatturato. Alla
      tutela legale quel numero non si applica in nessun senso — le spese di difesa si
      dimensionano per grado di giudizio — e l'esito era la riga «Attivare la copertura
      Tutela legale con capitale di 10,0 Mln €», con allegata, parola per parola, la
      motivazione della RCT: fatturato, settore pericoloso, «un solo evento con lesioni
      gravi esaurisce un massimale da 1 M€». Priorità 80, in cima al piano d'azione.

      Un capitale preso in prestito non è una stima prudente: è un numero senza base.
      Meglio dire che va rilevato — che è vero — e dire cosa rilevare.
    */
    case 'tutela-legale':
      return nonQuantificabile(
        'Tutela legale',
        'Dimensionare i massimali per grado di giudizio e per anno assicurativo: il benchmark della ' +
          'RCT misura il danno risarcibile a terzi, non le spese di assistenza legale e peritale.',
      );
    case 'rc-inquinamento':
      return nonQuantificabile(
        'RC Inquinamento',
        'Dimensionare il massimale sui costi di bonifica e di ripristino ambientale del sito, che ' +
          'non seguono il benchmark della RCT e restano esclusi dalla RCT ordinaria.',
      );
    case 'rco':
      return widen(sums.massimaleRcoPerPersona);
    case 'rc-prodotti':
      return sums.massimaleRcProdotti;
    case 'd-and-o':
      return sums.massimaleDandO;
    case 'cyber':
      return widen(sums.massimaleCyber);
    case 'credito-commerciale':
      return widen(sums.fidoClienti);
    case 'infortuni-dipendenti':
      return widen(sums.monteSalari);
    case 'merci-trasportate':
      return nonQuantificabile(
        'Merci trasportate',
        'Rilevare il valore massimo trasportato per singolo viaggio e il numero di spedizioni annue.',
      );
    case 'rca-flotta':
    case 'kasko-flotta':
      return nonQuantificabile(
        'Flotta',
        'Rilevare il libro matricola: targhe, valori a nuovo e massimali per veicolo.',
      );
    case 'cauzioni':
      return nonQuantificabile(
        'Cauzioni',
        'Dimensionare il plafond sul portafoglio ordini prospettico e sulle gare in programma.',
      );
    case 'infortuni-titolare':
    case 'malattia-key-man':
    case 'tcm-key-man':
      return nonQuantificabile(
        'Persone chiave',
        'Definire i capitali in funzione del margine attribuibile alla persona e degli impegni finanziari in essere.',
      );
  }
}

function widen(source: Explained<Euro | null>): Explained<Euro | null> {
  return source;
}

function nonQuantificabile(label: string, nota: string): Explained<Euro | null> {
  return explain(`Capitale — ${label}`).note(nota).confidence('bassa').value<Euro | null>(null);
}

/** Le garanzie a valore sono quelle su cui opera la regola proporzionale. */
function isGaranziaAValore(coverageId: CoverageId): boolean {
  return baseEconomica(coverageId) !== null;
}

/**
 * Base economica sottostante alla garanzia.
 *
 * Serve a non sommare due volte lo stesso patrimonio: incendio, catastrofali, guasti
 * macchine, elettronica e furto assicurano **gli stessi beni** contro cause diverse.
 * Sommare i rispettivi capitali mancanti produrrebbe un'esposizione multipla del
 * patrimonio realmente posseduto — un numero da titolo di giornale, e privo di significato.
 *
 * Il furto sta qui, e non in una base propria: la somma assicurata incendio comprende
 * già le scorte (fabbricati + contenuto + scorte). Trattarle a parte le conterebbe due
 * volte, gonfiando l'esposizione esattamente del loro valore. Le merci sono un
 * sottoinsieme dei beni, non un patrimonio aggiuntivo.
 *
 * Resta separato il **margine**: i danni indiretti non distruggono beni, misurano il
 * guadagno perduto mentre l'attività è ferma. Si somma ai beni perché accade insieme
 * a essi, ed è di norma esattamente ciò che accade.
 */
function baseEconomica(coverageId: CoverageId): 'patrimonio-fisico' | 'margine' | null {
  switch (coverageId) {
    case 'incendio':
    case 'catastrofali':
    case 'guasti-macchine':
    case 'elettronica':
    case 'furto-rapina':
      return 'patrimonio-fisico';
    case 'danni-indiretti':
      return 'margine';
    default:
      return null;
  }
}

/**
 * Esposizione patrimoniale non coperta, nello scenario di sinistro massimo.
 *
 * Per ciascuna base economica si prende il **maggiore** dei capitali mancanti — non la
 * somma — perché un singolo evento colpisce i beni una volta sola, quale che sia la
 * causa. Le due basi si sommano fra loro: la distruzione dei beni e il fermo dell'attività
 * che ne consegue avvengono insieme, ed è di norma esattamente ciò che accade.
 */
function calcolaEsposizioneNonAssicurata(gaps: readonly CoverageGap[]): Euro {
  const perBase = new Map<string, Euro>();

  for (const gap of gaps) {
    const base = baseEconomica(gap.definition.id);
    if (base === null) continue;
    const raccomandato = gap.capitaleRaccomandato.value;
    if (raccomandato === null) continue;

    /*
      Ciò che è ignoto non entra nella somma: è la promessa scritta su
      `coperturaDaQuantificare`, e qui non veniva mantenuta.

      Una polizza in essere senza capitale dichiarato — il frontespizio che il broker non
      ha ancora ricopiato — produceva `null`, e il `?? Money.ZERO` due righe più sotto lo
      trattava come una garanzia da zero euro. Risultato: l'esposizione non assicurata era
      **identica** nei due scenari «nessuna polizza» e «polizza dal capitale ignoto», e
      dei due solo il primo era un accertamento. Lo stato di questi gap è già
      'da-quantificare': si contano lì, e lì soltanto.
    */
    if (gap.status === 'da-quantificare') continue;

    const mancante = Money.max(
      Money.ZERO,
      Money.subtract(raccomandato, gap.capitaleInEssere ?? Money.ZERO),
    );
    const attuale = perBase.get(base) ?? Money.ZERO;
    if (mancante > attuale) perBase.set(base, mancante);
  }

  return Money.add(...perBase.values());
}

/**
 * Il frammento fisso che spiega perché su una garanzia a valore allo stato d'uso il
 * verdetto resta sospeso. Sta qui, e non dentro `computeUnderinsurance`, perché è questo
 * modulo a sapere con quale metro il capitale raccomandato è stato calcolato.
 */
const METRO_STATO_DUSO =
  'Garanzia prestata a valore allo stato d’uso: l’indennizzo si commisura al bene degradato, ' +
  'mentre il capitale calcolato qui è a valore di rimpiazzo a nuovo. Il valore allo stato ' +
  'd’uso dei beni non è fra i dati disponibili, e va rilevato prima di giudicare il capitale.';

function determinaStato(
  coverageId: CoverageId,
  raccomandato: Euro | null,
  inEssere: Euro | null,
  polizza: PolizzaInEssere | null,
  dannoMassimo: DannoMassimo | null,
  asOf: Date,
): { status: GapStatus; sottoassicurazione: Explained<Underinsurance | null> | null } {
  if (polizza === null) {
    return { status: raccomandato === null ? 'da-quantificare' : 'assente', sottoassicurazione: null };
  }

  /*
    Una polizza scaduta è una copertura assente, non una copertura in scadenza.

    Il confronto con la soglia dei 90 giorni si faceva su un numero che per un contratto
    cessato è negativo, e `-181 <= 90` è vero: la garanzia morta finiva fra le «coperture
    adeguate» del riepilogo e il piano d'azione annunciava «in scadenza fra -181 giorni».
    Il segno meno era l'unico indizio dato al broker.

    Lo stato è 'assente' perché è ciò che è vero oggi: a questa data l'impresa, per questa
    garanzia, non è coperta. Il contratto scaduto non sparisce — resta in `polizza` e
    `polizzaScaduta` lo dichiara — ma non concorre né al capitale in essere né ai conteggi
    di adeguatezza.
  */
  if (isScaduta(polizza, asOf)) {
    return { status: raccomandato === null ? 'da-quantificare' : 'assente', sottoassicurazione: null };
  }

  if (raccomandato === null || inEssere === null || !Money.isPositive(raccomandato)) {
    return { status: 'da-quantificare', sottoassicurazione: null };
  }

  if (isGaranziaAValore(coverageId)) {
    /*
      La polizza in essere si giudica sulla SUA forma, non su quella raccomandata.

      Sono due domande diverse che finora condividevano un numero solo: «quanto
      proporre» e «quanto vale il contratto che c'è già». Un cliente che ha comprato bene
      — primo rischio sul danno probabile, su protezioni accertate — deve leggere
      «adeguata»; e uno con una polizza a valore intero da 2 M su 6,2 M di beni deve
      continuare a leggere che al sinistro prende un terzo.

      Il metro del primo rischio è il danno massimo probabile, e vale per il solo
      incendio: il modello è fisicamente specifico di quel rischio. Su furto o guasti
      macchine riusarlo produrrebbe un numero vero in apparenza e senza base — un ladro
      non ragiona per carico d'incendio.
    */
    const metro = metroDiIndennizzo(polizza);
    const aValoreIntero = metro !== 'limite-pattuito';
    const riferimentoPrimoRischio =
      coverageId === 'incendio' && dannoMassimo !== null ? dannoMassimo.probabile : undefined;

    const verifica = computeUnderinsurance(raccomandato, inEssere, {
      soggettaARegolaProporzionale: aValoreIntero,
      ...(metro === 'valore-allo-stato-duso' ? { metroNonOmogeneo: METRO_STATO_DUSO } : {}),
      ...(riferimentoPrimoRischio === undefined ? {} : { riferimentoAdeguatezza: riferimentoPrimoRischio }),
    });

    // Il limite di un primo rischio senza un metro non si può giudicare: dirlo è più
    // utile che dedurne un'insufficienza dal confronto con il valore intero, che è il
    // confronto sbagliato per costruzione.
    if (verifica.value?.adeguatezzaDelLimite === 'non-verificabile') {
      return { status: 'da-quantificare', sottoassicurazione: verifica };
    }
    if (verifica.value?.sottoassicurata === true) {
      return { status: 'sottoassicurata', sottoassicurazione: verifica };
    }
    if (giorniAllaScadenza(polizza, asOf) <= SOGLIA_SCADENZA_GIORNI) {
      return { status: 'in-scadenza', sottoassicurazione: verifica };
    }
    return { status: 'adeguata', sottoassicurazione: verifica };
  }

  // Garanzie a massimale: si confronta con il benchmark, con una tolleranza del 10%.
  if (inEssere < Money.multiply(raccomandato, 0.9)) {
    return { status: 'massimale-insufficiente', sottoassicurazione: null };
  }
  if (giorniAllaScadenza(polizza, asOf) <= SOGLIA_SCADENZA_GIORNI) {
    return { status: 'in-scadenza', sottoassicurazione: null };
  }
  return { status: 'adeguata', sottoassicurazione: null };
}

function calcolaPriorita(
  obbligo: ObbligoPerImpresa,
  status: GapStatus,
  livello: RiskLevel | null,
  catNat: CatNatAssessment | null,
  coverageId: CoverageId,
): number {
  const pesoRischio = livello === null ? 0.4 : (riskLevelRank(livello) + 1) / 5;

  const pesoStato =
    status === 'assente'
      ? 1
      : status === 'sottoassicurata'
        ? 0.85
        : status === 'massimale-insufficiente'
          ? 0.7
          : status === 'da-quantificare'
            ? 0.55
            : status === 'in-scadenza'
              ? 0.35
              : 0.05;

  // Le priorità di merito si fermano a 99: il gradino 100 è riservato agli obblighi
  // di legge già scaduti, che devono restare in cima senza pareggi.
  let priorita = Math.min(99, pesoRischio * pesoStato * 100);

  // Un obbligo di legge non adempiuto viene prima di qualunque valutazione di merito —
  // ma solo se grava davvero su questa impresa. `dovuto === null` non forza nulla:
  // un obbligo non accertato non è un inadempimento, e metterlo in cima al piano
  // sposterebbe in basso i rischi reali per una supposizione.
  if (obbligo.dovuto === true && status !== 'adeguata' && status !== 'in-scadenza') {
    priorita = Math.max(priorita, 92);
  }
  if (coverageId === 'catastrofali' && obbligo.dovuto === true && catNat?.status === 'inadempiente') {
    priorita = 100;
  }

  return Math.round(priorita);
}

/**
 * Il dato che manca, garanzia per garanzia.
 *
 * «Rilevare i dati necessari a dimensionare X» compariva **identica su nove schede della
 * stessa pagina**: nove volte la stessa istruzione col nome cambiato, cioè nessuna
 * istruzione. Chi la legge deve presentarsi dal cliente sapendo QUALE domanda fare, ed è
 * esattamente la cosa che quella riga non diceva.
 *
 * Il catalogo però lo sa già: ogni garanzia dichiara la propria `base` di calcolo. Qui
 * quella base diventa la domanda da fare, composta con frammenti fissi — nessuna frase
 * generata e **nessun capitale inventato**, perché un massimale plausibile letto ad alta
 * voce a un cliente è peggio di un massimale mancante.
 *
 * Due basi valgono `null` di proposito. `massimale-benchmark` e `da-definire` non hanno
 * un dato da chiedere: la prima si fissa per confronto con il settore, la seconda caso per
 * caso. Fingere una domanda precisa dove non c'è sarebbe la stessa colpa della frase che
 * questo blocco sostituisce, commessa con più parole.
 */
const DATO_MANCANTE: Readonly<Record<BasiDiCalcolo, string | null>> = {
  'valore-ricostruzione':
    'il costo di ricostruzione a nuovo dei fabbricati, non il valore contabile netto',
  'valore-rimpiazzo': 'il valore di rimpiazzo a nuovo di macchinari e attrezzature',
  'valore-scorte': 'il valore delle scorte al picco stagionale',
  'margine-contribuzione': 'il margine di contribuzione e il periodo di indennizzo da garantire',
  'monte-salari': 'il monte salari annuo',
  'fido-clienti': 'il fido complessivo concesso ai clienti',
  'massimale-benchmark': null,
  'da-definire': null,
};

function descriviAzione(
  definition: CoverageDefinition,
  status: GapStatus,
  raccomandato: Euro | null,
  inEssere: Euro | null,
  polizza: PolizzaInEssere | null,
  asOf: Date,
): string {
  /*
    La garanzia c'era e non c'è più: è un'altra frase, non un'altra sfumatura.

    Si compone dai valori — la data che sta sul contratto e i giorni passati — perché
    «attivare la copertura» detto a chi una polizza l'aveva fatta suona come se nessuno
    avesse guardato il suo fascicolo, e la prima cosa che il cliente risponde è che quella
    polizza l'ha comprata.
  */
  if (polizza !== null && isScaduta(polizza, asOf)) {
    const giorni = Math.abs(giorniAllaScadenza(polizza, asOf));
    const premessa =
      `Polizza ${definition.label} scaduta il ${formattaGiorno(polizza.dataScadenza)} ` +
      `(${giorni} giorni fa): la garanzia non è in vigore.`;
    return raccomandato === null
      ? `${premessa} Verificarne il rinnovo e, in mancanza, riattivarla: capitale da definire in sede di intervista.`
      : `${premessa} Verificarne il rinnovo e, in mancanza, riattivarla con capitale di ${Money.formatCompact(raccomandato)}.`;
  }

  switch (status) {
    case 'assente':
      return raccomandato === null
        ? `Attivare la copertura ${definition.label}: capitale da definire in sede di intervista.`
        : `Attivare la copertura ${definition.label} con capitale di ${Money.formatCompact(raccomandato)}.`;
    case 'sottoassicurata': {
      const delta =
        raccomandato !== null && inEssere !== null ? Money.subtract(raccomandato, inEssere) : null;
      return delta === null
        ? `Adeguare la somma assicurata di ${definition.label}.`
        : `Integrare la somma assicurata di ${Money.formatCompact(delta)} ` +
            `(da ${Money.formatCompact(inEssere ?? Money.ZERO)} a ${Money.formatCompact(raccomandato ?? Money.ZERO)}).`;
    }
    case 'massimale-insufficiente':
      return raccomandato === null
        ? `Elevare il massimale di ${definition.label}.`
        : `Elevare il massimale a ${Money.formatCompact(raccomandato)} ` +
            `(attuale: ${Money.formatCompact(inEssere ?? Money.ZERO)}).`;
    case 'in-scadenza': {
      const giorni = polizza === null ? 0 : giorniAllaScadenza(polizza, asOf);
      return `Polizza in scadenza fra ${giorni} giorni: avviare la verifica di rinnovo e la riquotazione.`;
    }
    case 'da-quantificare': {
      const dato = DATO_MANCANTE[definition.base];
      if (dato !== null) {
        return `Per dimensionare ${definition.label} serve ${dato}: da rilevare in sede di intervista.`;
      }
      return definition.base === 'massimale-benchmark'
        ? `Fissare il massimale di ${definition.label} per confronto con il settore e la classe dimensionale, da concordare in sede di intervista.`
        : `Dimensionare ${definition.label} in sede di intervista: il capitale si determina caso per caso.`;
    }
    case 'adeguata':
      return 'Copertura congrua: nessun intervento richiesto in questa fase.';
  }
}

function worstLevel(risks: readonly AssessedRisk[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const risk of risks) {
    if (worst === null || riskLevelRank(risk.residualLevel) > riskLevelRank(worst)) {
      worst = risk.residualLevel;
    }
  }
  return worst;
}
