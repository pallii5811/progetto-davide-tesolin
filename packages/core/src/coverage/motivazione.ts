/**
 * La motivazione di adeguatezza, composta sui fatti di questa impresa.
 *
 * Il catalogo delle coperture porta una `motivazioneTipo`: una frase per copertura,
 * uguale per tutti. Dentro quelle frasi erano finite clausole che valgono solo per
 * alcuni — «che nelle società di persone si estende al patrimonio dei soci» mostrata a
 * ogni S.r.l., «Adempimento dell'obbligo assicurativo» mostrata anche a un'impresa
 * agricola che dall'obbligo è esclusa per legge.
 *
 * Il difetto non era testuale ma strutturale: `componiMotivazione` non riceveva i fatti
 * aziendali, quindi **nessuna formulazione condizionale era tecnicamente possibile** e
 * qualunque riscrittura delle stringhe sarebbe rimasta incondizionata.
 *
 * Qui la motivazione diventa: un nucleo vero per chiunque, più i frammenti che i fatti
 * accendono. Ogni frammento porta con sé il **fondamento** — il fatto in base al quale è
 * stato scritto — perché davanti a una contestazione la domanda non è «cosa avete
 * scritto» ma «in base a quale fatto». È l'unica risposta che un fascicolo possa dare.
 *
 * Nessun modello linguistico, come ovunque nel prodotto: frammenti fissi più i valori.
 * Un caso non previsto produce una frase generica e vera, mai una plausibile.
 */

import type { CompanyFacts } from '../company/facts.js';
import type { AssessedRisk } from '../risk/engine.js';
import type { CatNatAssessment } from './catnat.js';
import type { CoverageDefinition, CoverageId } from './taxonomy.js';
import { regimeDiResponsabilita } from '../governance/norme.js';
import type { Confidence } from '../shared/provenance.js';
import { formattaGiorno } from '../shared/tempo.js';
import { inizialeMinuscola } from '../shared/testo.js';

/**
 * Un pezzo di motivazione che si accende su un fatto.
 *
 * `suDatoIgnoto` distingue «il fatto non c'è» da «il fatto non lo sappiamo». Nel secondo
 * caso il frammento entra in forma **ipotetica esplicita** e abbassa la confidenza:
 * affermare all'indicativo un fatto che nessuno ha verificato è il modo più rapido di
 * rendere indifendibile un documento di adeguatezza.
 */
export interface FrammentoMotivazione {
  /** Testo fisso, mai generato. */
  readonly testo: string;
  /** Il fatto che lo rende vero, in italiano leggibile. */
  readonly fondamento: string;
  /** La norma di **questo** frammento, non della copertura in generale. */
  readonly riferimento: string | null;
  readonly suDatoIgnoto: boolean;
  /**
   * Il frammento dice, sui fatti di **questa** impresa, ciò che la frase di catalogo dice
   * in generale. Quando è acceso, la frase di catalogo non si stampa.
   *
   * Le due frasi sono nate in momenti diversi: la `motivazioneTipo` quando i frammenti non
   * esistevano, il frammento dopo, per dire la stessa cosa con più precisione e con il
   * fatto che la regge. Affiancarle produceva una motivazione che ripete sé stessa —
   * «L'indennizzo INAIL non esaurisce il danno risarcibile» due volte in tre righe, i costi
   * di bonifica esclusi dalla RCT ordinaria tre volte nella stessa scheda.
   *
   * Non è un problema di eleganza. Un documento di adeguatezza che ripete la stessa
   * affermazione con parole appena diverse **sembra generato**, e chi lo legge smette di
   * distinguere ciò che è stato accertato su questa impresa da ciò che vale per tutte: è
   * esattamente la distinzione che il fascicolo esiste per fare.
   *
   * Chi lo accende si assume un obbligo: il frammento deve dire **tutto** ciò che diceva la
   * frase di catalogo, non una parte.
   */
  readonly assorbeLaFraseDiCatalogo?: boolean;
}

export interface MotivazioneComposta {
  /** Il testo intero, pronto per il fascicolo. */
  readonly testo: string;
  /** I fatti su cui poggia, uno per frammento acceso. */
  readonly presupposti: readonly string[];
  /** Le sole norme applicabili a questa impresa. */
  readonly riferimenti: readonly string[];
  readonly confidenza: Confidence;
}

type Regola = (f: CompanyFacts, catNat: CatNatAssessment | null) => FrammentoMotivazione | null;

// ─────────────────────────────────────────────────────────────────────────────
// I frammenti, copertura per copertura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chi risponde del risarcimento dovuto a terzi.
 *
 * Cinque regimi, non uno. La frase che il prodotto mostrava era corretta senza riserve
 * per la sola società in nome collettivo — una delle cinque forme a cui la mostrava.
 */
const patrimonioAggredibile: Regola = (f) => {
  const regime = regimeDiResponsabilita(f.formaGiuridica);
  return {
    testo: regime.testo,
    fondamento: `Forma giuridica: ${f.formaGiuridica}.`,
    riferimento: regime.riferimento,
    suDatoIgnoto: false,
  };
};

/**
 * Il socio unico che non ha eseguito i conferimenti o attuato la pubblicità perde il
 * beneficio della responsabilità limitata. È l'eccezione che rende falsa, in un caso
 * preciso, la rassicurazione appena data alla società di capitali.
 */
const socioUnicoDiCapitali: Regola = (f) => {
  const diCapitali =
    f.formaGiuridica === 'spa' || f.formaGiuridica === 'srl' || f.formaGiuridica === 'srls';
  if (!diCapitali || f.numeroSoci !== 1) return null;
  return {
    testo:
      'La società ha un socio unico: in caso di insolvenza il beneficio della responsabilità limitata ' +
      'viene meno se i conferimenti non sono stati integralmente eseguiti o se la pubblicità prescritta ' +
      'non è stata attuata.',
    fondamento: 'Un solo socio risulta dalla compagine acquisita.',
    riferimento: f.formaGiuridica === 'spa' ? 'Art. 2325, c. 2, c.c.' : 'Art. 2462, c. 2, c.c.',
    suDatoIgnoto: false,
  };
};

/** La responsabilità per il fatto dei dipendenti: c'è solo se ci sono dipendenti. */
const fattoDeiCommessi: Regola = (f) => {
  if (f.haDipendenti === false) return null;
  const ignoto = f.haDipendenti === null;
  return {
    /*
      «Danni cagionati a terzi nell'esercizio…» è la formula con cui la frase di catalogo
      apre il paragrafo, tre righe più su. Ripeterla qui faceva sembrare la stessa cosa
      detta due volte, mentre l'art. 2049 aggiunge una regola diversa: non l'oggetto della
      copertura, ma **chi** risponde del fatto altrui. La formulazione qui sotto è quella
      del codice — fatto illecito, incombenze a cui sono adibiti — e dice ciò che la prima
      non dice, senza riecheggiarla.
    */
    testo: ignoto
      ? 'Se l’impresa impiega personale dipendente o collaboratori, risponde anche del loro fatto ' +
        'illecito, per le incombenze a cui sono adibiti.'
      : 'L’impresa risponde anche del fatto illecito dei propri dipendenti e collaboratori, per le ' +
        'incombenze a cui sono adibiti.',
    fondamento: ignoto
      ? 'Presenza di personale dipendente non rilevata in intervista.'
      : 'Personale dipendente rilevato.',
    riferimento: 'Art. 2049 c.c.',
    suDatoIgnoto: ignoto,
  };
};

/**
 * L'obbligo catastrofale, detto solo a chi ce l'ha.
 *
 * Il catalogo affermava l'obbligo come costante della copertura. Ma l'obbligo è una
 * proprietà dell'impresa: l'impresa agricola ne è esclusa per legge — e il motore
 * accanto lo dichiarava correttamente, nella stessa risposta.
 */
const obbligoCatNat: Regola = (_f, catNat) => {
  if (catNat === null) return null;

  if (!catNat.soggetta) {
    return {
      testo:
        'L’impresa non è soggetta all’obbligo assicurativo catastrofale' +
        (catNat.motivoEsclusione === null ? '.' : `: ${catNat.motivoEsclusione}.`) +
        ' La garanzia resta valutabile su base volontaria, per il rischio effettivo delle ubicazioni.',
      fondamento: 'Esclusione accertata dal motore di conformità CAT NAT.',
      riferimento: 'L. 213/2023 art. 1 cc. 101-111',
      suDatoIgnoto: false,
    };
  }

  /*
    «Si tiene conto», non «preclude».

    L'art. 1 c. 102 prevede che dell'inadempimento si tenga conto nell'assegnazione di
    contributi: il catalogo scriveva «condizione per l'accesso», che è più severo della
    norma. Sovradichiarare un obbligo è pericoloso quanto tacerlo — al primo controllo
    fatto dal cliente, tutto il resto del documento perde credito.
  */
  return {
    testo:
      'L’impresa è soggetta all’obbligo assicurativo contro i rischi catastrofali. ' +
      'Dell’eventuale inadempimento si tiene conto nell’assegnazione di contributi, sovvenzioni e ' +
      'agevolazioni di carattere finanziario a valere su risorse pubbliche.',
    fondamento:
      catNat.termine === null
        ? 'Impresa iscritta al Registro delle Imprese e non esclusa.'
        : `Termine di legge per la classe dimensionale: ${formattaData(catNat.termine)}.`,
    riferimento: 'L. 213/2023 art. 1 cc. 101-111 · DM MEF-MIMIT n. 18 del 30/01/2025',
    suDatoIgnoto: false,
  };
};

/**
 * La responsabilità da prodotto: oggettiva per il produttore, sussidiaria per il
 * distributore.
 *
 * Il catalogo diceva «responsabilità oggettiva del produttore o del distributore». Per il
 * mero fornitore la responsabilità è sussidiaria e scatta solo se il produttore non è
 * individuato e il fornitore non ne comunica l'identità entro tre mesi: dire a un negozio
 * che risponde come chi ha fabbricato il prodotto è falso.
 */
const regimeDaProdotto: Regola = (f) => {
  if (f.produceBeniFinali === true) {
    return {
      testo:
        'L’impresa immette sul mercato prodotti finiti: risponde del danno da prodotto difettoso a ' +
        'prescindere dalla colpa, salve le esimenti di legge.',
      fondamento: 'Produzione di beni finali dichiarata in intervista.',
      /*
        L'art. 118 non fonda la responsabilità: la esclude.

        Citato in coppia con il 114 diceva al lettore che è di lì che discende la
        responsabilità oggettiva del produttore, mentre è l'elenco delle **esimenti** —
        fra cui il rischio da sviluppo. È l'articolo che il legale della controparte apre
        per primo, e trovarlo citato al rovescio dentro un fascicolo di adeguatezza toglie
        credito anche a ciò che è giusto. La lettura corretta è quella già scritta in
        coverage/taxonomy.ts: il 114 è la fonte, il 118 le esimenti, il 120 l'onere della
        prova a carico del danneggiato.
      */
      riferimento:
        'Art. 114 D.Lgs. 206/2005 — esimenti: art. 118 · onere della prova a carico del danneggiato: art. 120',
      suDatoIgnoto: false,
      assorbeLaFraseDiCatalogo: true,
    };
  }
  if (f.produceBeniFinali === false) {
    return {
      testo:
        'L’impresa non risulta produttrice: come fornitore risponde in via sussidiaria, quando il ' +
        'produttore non è individuato e non ne comunica l’identità entro tre mesi dalla richiesta. ' +
        // Art. 116, c. 1: il fornitore «è sottoposto alla stessa responsabilità» del
        // produttore. Ometterlo faceva sembrare la posizione del fornitore più mite di
        // quello che è — sussidiaria nel presupposto, identica nella misura.
        'In quel caso risponde alle stesse condizioni del produttore, a prescindere dalla colpa e ' +
        'salve le esimenti di legge.',
      fondamento: 'Produzione di beni finali esclusa in intervista.',
      riferimento: 'Art. 116 D.Lgs. 206/2005',
      suDatoIgnoto: false,
      assorbeLaFraseDiCatalogo: true,
    };
  }
  return {
    testo:
      'Il regime di responsabilità dipende dal ruolo nella catena: è oggettivo per il produttore — ' +
      'salve le esimenti di legge — e sussidiario per il solo fornitore. Va accertato prima di ' +
      'dimensionare il massimale.',
    fondamento: 'Ruolo nella catena di fornitura non rilevato in intervista.',
    riferimento: 'Artt. 114 e 116 D.Lgs. 206/2005',
    suDatoIgnoto: true,
    assorbeLaFraseDiCatalogo: true,
  };
};

/**
 * La responsabilità ambientale è oggettiva **solo** per gli operatori delle attività
 * dell'Allegato 5 alla Parte VI del Codice dell'ambiente. Per tutti gli altri risponde
 * chi ha agito con dolo o colpa — e la regola che identifica il rischio usa diciassette
 * divisioni ATECO, molto più larghe di quell'Allegato.
 */
const regimeAmbientale: Regola = () => ({
  testo:
    'La responsabilità per danno ambientale è oggettiva per gli operatori delle attività elencate ' +
    'nell’Allegato 5 alla Parte VI del Codice dell’ambiente; per le altre attività risponde chi ha ' +
    'agito con dolo o colpa. In entrambi i casi i costi di bonifica e di ripristino restano esclusi ' +
    'dalla RCT ordinaria e possono eccedere di molto il danno cagionato a terzi.',
  fondamento: 'Appartenenza all’Allegato 5 non accertata: la formulazione resta valida in entrambi i casi.',
  riferimento: 'Artt. 298-bis e 311, c. 2, D.Lgs. 152/2006',
  suDatoIgnoto: true,
  assorbeLaFraseDiCatalogo: true,
});

/** L'obbligo assicurativo del professionista vale per chi è iscritto a un albo. */
const obbligoProfessionale: Regola = (f) => {
  // La sezione M raccoglie le attività professionali; J e K no, e a una software house
  // affermare un obbligo di legge inesistente è un errore che si paga subito.
  if (f.atecoSezione !== 'M') return null;
  return {
    testo:
      'Per gli esercenti attività professionale iscritti in albi o elenchi l’assicurazione della ' +
      'responsabilità civile professionale è obbligatoria, e il professionista deve comunicarne gli ' +
      'estremi al cliente al momento dell’incarico.',
    fondamento: 'Attività professionale (sezione ATECO M): l’iscrizione all’albo va confermata.',
    riferimento: 'Art. 3, c. 5, lett. e) D.L. 138/2011 · art. 5 D.P.R. 137/2012',
    suDatoIgnoto: true,
  };
};

/** La D&O ha senso dove esiste un organo amministrativo distinto dalla proprietà. */
const posizioneNelGruppo: Regola = (f) => {
  if (f.esercitaDirezioneECoordinamento) {
    return {
      testo:
        'La società esercita direzione e coordinamento su altre società: risponde verso i soci e i ' +
        'creditori delle società dirette del pregiudizio arrecato alla redditività e al valore della ' +
        'partecipazione.',
      fondamento: 'Società controllate risultanti dall’assetto proprietario.',
      riferimento: 'Art. 2497 c.c.',
      suDatoIgnoto: false,
    };
  }
  if (f.soggettaADirezioneECoordinamento) {
    return {
      testo:
        'La società è soggetta a direzione e coordinamento: la responsabilità dell’art. 2497 c.c. grava ' +
        'sulla capogruppo, mentre gli amministratori di questa società rispondono in solido se hanno ' +
        'preso parte al fatto lesivo. Va verificato se una D&O di gruppo la comprende.',
      fondamento: 'Socio societario di controllo risultante dalla compagine.',
      riferimento: 'Art. 2497, c. 2, c.c.',
      suDatoIgnoto: false,
    };
  }
  return null;
};

/** L'obbligo RCA nasce dal veicolo, non dall'impresa. */
const obbligoRcAuto: Regola = (f) => {
  if (f.numeroVeicoli === null) {
    return {
      testo:
        'Se l’impresa dispone di veicoli a motore, per ciascuno di essi l’assicurazione della ' +
        'responsabilità civile è obbligatoria per la circolazione.',
      fondamento: 'Parco veicoli non rilevato in intervista.',
      riferimento: 'Art. 122 D.Lgs. 209/2005',
      suDatoIgnoto: true,
    };
  }
  if (f.numeroVeicoli === 0) return null;
  return {
    testo:
      `Per ciascuno dei ${f.numeroVeicoli} veicoli aziendali l’assicurazione della responsabilità ` +
      'civile è obbligatoria per la circolazione.',
    fondamento: 'Veicoli aziendali rilevati in intervista.',
    riferimento: 'Art. 122 D.Lgs. 209/2005',
    suDatoIgnoto: false,
  };
};

/** Il datore risponde della sicurezza: è il presupposto stesso della RCO. */
const obbligoDiSicurezza: Regola = (f) => {
  if (f.haDipendenti === false) return null;
  const ignoto = f.haDipendenti === null;
  return {
    testo: ignoto
      ? 'Se l’impresa impiega personale, il datore di lavoro è tenuto ad adottare le misure necessarie ' +
        'a tutelarne l’integrità fisica, e ne risponde civilmente.'
      : 'Il datore di lavoro è tenuto ad adottare le misure necessarie a tutelare l’integrità fisica dei ' +
        'prestatori di lavoro, e ne risponde civilmente. L’indennizzo INAIL non esaurisce il danno ' +
        'risarcibile: restano a carico il differenziale e le voci non indennizzate.',
    fondamento: ignoto
      ? 'Presenza di personale dipendente non rilevata in intervista.'
      : 'Personale dipendente rilevato.',
    riferimento: 'Art. 2087 c.c. · art. 10 D.P.R. 1124/1965 · art. 13 D.Lgs. 38/2000',
    suDatoIgnoto: ignoto,
    // Con il personale accertato il frammento dice già tutto ciò che dice la frase di
    // catalogo, e in più su quale obbligo poggia. Nella forma ipotetica no — lì l'INAIL
    // non è nominato — e la frase di catalogo resta a dirlo.
    assorbeLaFraseDiCatalogo: !ignoto,
  };
};

/** Il perimetro NIS 2 non è ogni impresa: dirlo a una microimpresa è inapplicabile. */
const perimetroNis2: Regola = (f) => {
  if (f.dimensione === 'micro' || f.dimensione === 'piccola') return null;
  return {
    testo:
      'Se l’impresa rientra fra i soggetti essenziali o importanti dei settori individuati dalla ' +
      'normativa NIS 2, è tenuta ad adottare misure di gestione del rischio informatico e a notificare ' +
      'gli incidenti significativi.',
    fondamento: `Classe dimensionale: ${f.dimensione}. L’appartenenza ai settori in perimetro va verificata.`,
    riferimento: 'D.Lgs. 138/2024',
    suDatoIgnoto: true,
  };
};

/** L'impresa a conduzione personale: si accerta sulla compagine, non si presume. */
const conduzionePersonale: Regola = (f) => {
  const regime = regimeDiResponsabilita(f.formaGiuridica);
  if (f.formaGiuridica === 'ditta-individuale') {
    return {
      testo:
        'Nell’impresa individuale la capacità di reddito coincide con la persona del titolare: ' +
        'un’inabilità prolungata interrompe l’attività e, non essendovi separazione patrimoniale, ' +
        'colpisce direttamente il patrimonio familiare.',
      fondamento: 'Impresa individuale.',
      riferimento: regime.riferimento,
      suDatoIgnoto: false,
    };
  }
  if (f.numeroSoci === 1 && !f.haSociPersonaGiuridica) {
    return {
      testo:
        'La società fa capo a un solo socio persona fisica: la sua indisponibilità prolungata blocca ' +
        'le decisioni sociali e, di norma, i rapporti commerciali e bancari.',
      fondamento: 'Socio unico persona fisica risultante dalla compagine.',
      riferimento: null,
      suDatoIgnoto: false,
    };
  }
  return null;
};

/**
 * L'elenco, copertura per copertura.
 *
 * Una copertura assente da questa mappa conserva la sola `motivazioneTipo`: è il
 * comportamento di prima, e va bene finché quella frase è vera per chiunque.
 */
const FRAMMENTI: Readonly<Partial<Record<CoverageId, readonly Regola[]>>> = {
  rct: [patrimonioAggredibile, socioUnicoDiCapitali, fattoDeiCommessi],
  rco: [obbligoDiSicurezza],
  'rc-prodotti': [regimeDaProdotto],
  'rc-inquinamento': [regimeAmbientale],
  'rc-professionale': [obbligoProfessionale],
  'd-and-o': [posizioneNelGruppo],
  catastrofali: [obbligoCatNat],
  'rca-flotta': [obbligoRcAuto],
  cyber: [perimetroNis2],
  'infortuni-titolare': [conduzionePersonale],
  'tcm-key-man': [conduzionePersonale],
};

// ─────────────────────────────────────────────────────────────────────────────
// Composizione
// ─────────────────────────────────────────────────────────────────────────────

export function componiMotivazioneCopertura(
  definition: CoverageDefinition,
  facts: CompanyFacts,
  rischiServiti: readonly AssessedRisk[],
  catNat: CatNatAssessment | null,
): MotivazioneComposta {
  const frammenti = (FRAMMENTI[definition.id] ?? [])
    .map((regola) => regola(facts, catNat))
    .filter((frammento): frammento is FrammentoMotivazione => frammento !== null);

  // La frase di catalogo cede il posto al frammento che dice la stessa cosa sui fatti
  // accertati: due formulazioni della medesima affermazione non rafforzano niente.
  const assorbita = frammenti.some((f) => f.assorbeLaFraseDiCatalogo === true);
  const parti = [...(assorbita ? [] : [definition.motivazioneTipo]), ...frammenti.map((f) => f.testo)];

  if (rischiServiti.length > 0) {
    /*
      «rischio residuo» stava scritto una volta nell'introduzione e poi di nuovo dentro
      ogni voce: tre volte in una riga sola, su ogni copertura di ogni impresa.

      Trovato misurando, non leggendo — `scripts/audit-testo-schermo.ts` lo segnala su
      undici motivazioni su ventiquattro fra le due imprese di prova, ed è il singolo
      difetto che produceva più ripetizioni in tutta la scheda. A occhio era invisibile:
      la frase è corretta, e a leggerla da sola non stona.

      L'introduzione dice già che si parla di rischi residui: alla voce resta il livello.
    */
    const principali = [...rischiServiti]
      .sort((a, b) => b.residualScore - a.residualScore)
      .slice(0, 3)
      /*
        `toLowerCase()` sull'etichetta intera scriveva «(d.lgs. 231/2001)» dentro un
        documento che va al cliente e, davanti a una contestazione, in un fascicolo. E
        «CAT NAT» diventava «cat nat». Quello che serve è solo l'iniziale.
      */
      .map((r) => `${inizialeMinuscola(r.definition.label)} (${r.residualLevel})`);
    parti.push(
      `L'analisi ha rilevato i seguenti rischi residui a carico dell'impresa: ${principali.join('; ')}.`,
    );
  }

  const riferimenti = frammenti
    .map((f) => f.riferimento)
    .filter((r): r is string => r !== null)
    .concat(definition.riferimenti);

  return {
    testo: parti.join(' '),
    presupposti: frammenti.map((f) => f.fondamento),
    riferimenti: [...new Set(riferimenti)],
    // Basta un frammento poggiato su un dato ignoto perché la motivazione non sia
    // interamente accertata: chi la esibisce deve saperlo prima del cliente.
    confidenza: frammenti.some((f) => f.suDatoIgnoto) ? 'bassa' : 'alta',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// L'obbligo di legge è dell'impresa, non della copertura
// ─────────────────────────────────────────────────────────────────────────────

export interface ObbligoPerImpresa {
  /** `null` quando il dato che lo determina non è stato rilevato. */
  readonly dovuto: boolean | null;
  readonly fonte: string | null;
  readonly motivoEsclusione: string | null;
}

/**
 * L'obbligo assicurativo di **questa** impresa.
 *
 * `obbligoDiLegge` nel catalogo è una proprietà della copertura, e come tale non sa nulla
 * dell'azienda: la CAT NAT lo porta a `true` sempre, e un'impresa agricola — esclusa per
 * legge, e dichiarata tale dal motore accanto — si vedeva l'obbligo in cima al piano
 * d'azione con priorità forzata e termine già scaduto.
 *
 * `dovuto === null` è il terzo stato indispensabile: «non so se sei obbligato» non è «sei
 * inadempiente», e non deve produrre né la forzatura di priorità né un termine.
 */
export function obbligoPerImpresa(
  definition: CoverageDefinition,
  facts: CompanyFacts,
  catNat: CatNatAssessment | null,
): ObbligoPerImpresa {
  if (!definition.obbligoDiLegge) {
    return { dovuto: false, fonte: null, motivoEsclusione: null };
  }

  if (definition.id === 'catastrofali') {
    if (catNat === null) return { dovuto: null, fonte: null, motivoEsclusione: null };
    return {
      dovuto: catNat.soggetta,
      fonte: catNat.soggetta ? 'L. 213/2023 art. 1 cc. 101-111' : null,
      motivoEsclusione: catNat.soggetta ? null : catNat.motivoEsclusione,
    };
  }

  if (definition.id === 'rca-flotta') {
    // L'obbligo dell'art. 122 nasce dal veicolo posto in circolazione: senza veicoli non
    // c'è obbligo, e senza il dato non c'è nemmeno la certezza che non ci sia.
    if (facts.numeroVeicoli === null) return { dovuto: null, fonte: null, motivoEsclusione: null };
    return {
      dovuto: facts.numeroVeicoli > 0,
      fonte: facts.numeroVeicoli > 0 ? 'Art. 122 D.Lgs. 209/2005' : null,
      motivoEsclusione: facts.numeroVeicoli > 0 ? null : 'nessun veicolo aziendale rilevato',
    };
  }

  return { dovuto: true, fonte: null, motivoEsclusione: null };
}

function formattaData(d: Date): string {
  return formattaGiorno(d);
}
