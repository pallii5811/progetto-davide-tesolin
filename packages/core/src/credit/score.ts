/**
 * Score di credito AEGIS — modello additivo a fattori pesati, interamente esplicabile.
 *
 * Scala 1–100, dove 100 è il rischio minimo (coerente con la convenzione Creditsafe,
 * per non disorientare gli operatori che già la conoscono).
 *
 * Ogni fattore dichiara: il proprio peso, il punteggio ottenuto, gli indici che lo hanno
 * determinato e una motivazione in italiano corrente. Non esistono contributi nascosti.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import {
  clamp,
  formatNumber,
  formatPercent,
  interpolate,
  mediaPesataDefinita,
  weightedAverageDefined,
} from '../shared/math.js';
import { ageInMonths, weakestConfidence } from '../shared/provenance.js';
import type { Confidence, Sourced } from '../shared/provenance.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import { assenzaDi } from '../company/indicators.js';
import type { FinancialIndicators } from '../company/indicators.js';
import type { CompanyProfile, EventiNegativi, ProceduraConcorsuale } from '../company/profile.js';
import {
  anniDiAttivita,
  eserciziDisponibili,
  NESSUN_EVENTO_NEGATIVO,
  ultimoBilancio,
  ultimoBilancioSintetico,
} from '../company/profile.js';
import { altmanToScore, computeAltmanZ } from './altman.js';
import type { ContestoAltman } from './altman.js';
import { atecoSection } from '../shared/identifiers.js';
import { formattaGiorno } from '../shared/tempo.js';
// La norma sta in un posto solo: qui si cita, non si riscrive quale articolo valga per
// quale forma societaria — sbagliarne uno davanti a un intermediario vigilato è un danno
// che nessuna spiegazione recupera.
import { normaRiduzioneCapitalePerPerdite } from '../governance/norme.js';

/**
 * `ND` non è una sesta classe: è il rifiuto di attribuirne una.
 *
 * IL DIFETTO CHE L'HA RESA NECESSARIA. Su un profilo comprato al livello base — 0,10 €,
 * un livello d'acquisto reale — il modello valuta UN fattore su sette, e il prodotto
 * stampava «4/100 · classe E · rischio molto alto». Su un'impresa di cui non sapeva
 * quasi nulla.
 *
 * Il caso limite era ancora più netto: a zero fattori valutabili la funzione scriveva una
 * nota che diceva «dati insufficienti per esprimere un punteggio» e nella riga successiva
 * ne esprimeva uno — 1 su 100, classe E, con tanto di probabilità di default calcolata su
 * quell'uno. Chi legge guarda il numero, non la nota; e su quel numero il prodotto ordina
 * le liste, filtra i portafogli e propone un fido.
 *
 * È il gemello del difetto corretto poco prima, che faceva salire il punteggio a «classe A
 * rischio molto basso» quando i dati mancavano. Stessa causa — estrapolare un giudizio
 * intero da mezzo modello — e verso opposto. Un tetto verso l'alto senza pavimento verso
 * il basso corregge metà di un errore simmetrico.
 *
 * ATTENZIONE alla distinzione che regge tutto: un punteggio basso che nasce da un FATTO
 * resta valido e va mostrato. Procedura concorsuale aperta, impresa cessata, patrimonio
 * netto negativo sono notizie, non lacune: con quelle il giudizio è fondato anche su un
 * modello scarso, e negarlo toglierebbe al venditore l'informazione che più gli serve.
 * `ND` scatta solo quando il punteggio nasce dalla media di troppo pochi fattori e nessun
 * fatto bloccante lo giustifica.
 */
export type ClasseDiMerito = 'A' | 'B' | 'C' | 'D' | 'E' | 'ND';

export const CLASSE_LABEL: Readonly<Record<ClasseDiMerito, string>> = {
  A: 'Rischio molto basso',
  B: 'Rischio basso',
  C: 'Rischio medio',
  D: 'Rischio alto',
  E: 'Rischio molto alto',
  ND: 'Non determinabile: dati insufficienti',
};

export interface ScoreFactor {
  readonly key: string;
  readonly label: string;
  /** Peso nominale del fattore, 0–1. */
  readonly weight: number;
  /** Punteggio del fattore, 0–100. `null` se non valutabile per dati mancanti. */
  readonly score: number | null;
  readonly rationale: string;
  readonly details: readonly string[];
}

export interface CreditScore {
  /**
   * Punteggio finale 1–100, oppure `null` quando non è misurabile.
   *
   * `null` e non 1: è la regola 2d del progetto applicata al numero che decide più di
   * tutti. Un punteggio a 1 su un'impresa che nessuno ha misurato viene sommato, ordinato,
   * mediato in un portafoglio e mostrato a un venditore come «rischio molto alto». Un buco
   * dichiarato si vede; un uno inventato no — e la nota accanto, che diceva «dati
   * insufficienti per esprimere un punteggio», nessuno la legge quando c'è una cifra.
   *
   * Vale sempre insieme a `classe === 'ND'`: le due cose si muovono insieme, e il tipo
   * costringe chi legge a gestire il caso invece di scoprirlo in produzione.
   */
  readonly value: number | null;
  readonly classe: ClasseDiMerito;
  readonly factors: readonly ScoreFactor[];
  /** Se il punteggio è stato forzato verso il basso da una condizione bloccante, il motivo. */
  readonly cap: string | null;
  /**
   * Probabilità di default a 12 mesi, stimata dalla curva di calibrazione.
   *
   * `null` quando il punteggio non è misurabile: la curva trasforma un punteggio in una
   * percentuale, e senza punteggio non c'è niente da trasformare. Stamparne una comunque
   * significherebbe dare a un intermediario una probabilità di insolvenza con due decimali
   * ricavata da un numero inventato.
   */
  readonly probabilitaDefault: number | null;
  /**
   * La stessa probabilità con la formula, il riferimento e la confidenza che merita.
   *
   * Era l'unico numero della scheda che viaggiava nudo. «PD 12 mesi 0,80%» al centesimo
   * di punto usciva da una curva di otto punti mai calibrata sui dati della piattaforma,
   * e in un prodotto che vende la trasparenza del calcolo era proprio il numero che
   * nessuno poteva ricalcolare né contestare.
   *
   * `value` è identico a `probabilitaDefault`: cambia la forma, non la cifra — e resta
   * identico anche quando la cifra è `null`.
   */
  readonly probabilitaDefaultSpiegata: Explained<number | null>;
}

/**
 * I sette pesi del modello, nella scala in cui sono stati decisi: punti percentuali.
 *
 * La loro somma vale **105**, non 100 — l'anzianità viveva fuori dalla tabella e nessuno
 * aveva rifatto la somma. Un fattore stampato «peso 20%» che del modello ne decide 20/105
 * è un'affermazione falsa in una scheda che l'intermediario firma, e sette righe che
 * sommano al 105% sono la prima cosa che un cliente attento verifica.
 *
 * I pesi usati dal calcolo sono questi divisi per la loro somma: la normalizzazione non
 * cambia nessun rapporto fra i fattori, quindi non sposta nessun punteggio di un
 * centesimo. Cambia solo ciò che la scheda dichiara di aver fatto.
 */
const PUNTI = {
  solidita: 20,
  redditivita: 15,
  liquidita: 15,
  sostenibilitaDebito: 15,
  altman: 15,
  eventiNegativi: 20,
  anzianita: 5,
} as const;

const PUNTI_TOTALI: number =
  PUNTI.solidita +
  PUNTI.redditivita +
  PUNTI.liquidita +
  PUNTI.sostenibilitaDebito +
  PUNTI.altman +
  PUNTI.eventiNegativi +
  PUNTI.anzianita;

const PESI = {
  solidita: PUNTI.solidita / PUNTI_TOTALI,
  redditivita: PUNTI.redditivita / PUNTI_TOTALI,
  liquidita: PUNTI.liquidita / PUNTI_TOTALI,
  sostenibilitaDebito: PUNTI.sostenibilitaDebito / PUNTI_TOTALI,
  altman: PUNTI.altman / PUNTI_TOTALI,
  eventiNegativi: PUNTI.eventiNegativi / PUNTI_TOTALI,
  anzianita: PUNTI.anzianita / PUNTI_TOTALI,
} as const;

/**
 * I pesi normalizzati, per chi li cita fuori da qui.
 *
 * L'elenco degli arricchimenti diceva «il fattore che pesa il 20%» — i punti — mentre la
 * scheda, tre riquadri sotto, stampava «peso 19%» — i punti su 105. Chi scrive un peso
 * lo legge da qui, e i due numeri restano uno.
 */
export const PESI_SCORE: Readonly<typeof PESI> = PESI;

/**
 * Quanto modello deve aver pesato perché il punteggio possa dirsi un punteggio.
 *
 * Sotto questa quota la media pesata non redistribuisce ai fattori superstiti il peso di
 * quelli mancanti: non li conta zero — un fattore non valutato resta non valutato, e la
 * scheda lo stampa — ma smette di estrapolare da metà modello il giudizio sull'intero.
 *
 * Metà è la sola soglia che non richiede di inventare un numero: sopra, la media poggia
 * sulla maggioranza del modello; sotto, no. È esportata perché sia contestabile.
 */
export const PAVIMENTO_DI_COPERTURA = 0.5;

/**
 * La soglia della classe A, in un posto solo.
 *
 * La usa classifica() per attribuire la classe e la usa il tetto di copertura per negarla:
 * scritta due volte, la seconda sarebbe diventata falsa il giorno in cui qualcuno sposta
 * la prima.
 */
const SOGLIA_CLASSE_A = 80;

export interface CreditScoreInput {
  readonly profile: CompanyProfile;
  readonly bilancio: BilancioRiclassificato | null;
  readonly indicatori: FinancialIndicators | null;
  /** Livello di dati economici disponibili: limita la confidenza esprimibile. */
  readonly livelloDati: 'assente' | 'sintetico' | 'completo';
  readonly asOf: Date;
}

export function computeCreditScore(input: CreditScoreInput): Explained<CreditScore> {
  const { profile, bilancio, indicatori, livelloDati, asOf } = input;

  const factors: ScoreFactor[] = [];

  factors.push(fattoreSolidita(indicatori));
  factors.push(fattoreRedditivita(indicatori));
  factors.push(fattoreLiquidita(indicatori));
  factors.push(fattoreSostenibilitaDebito(indicatori));
  const anagrafica = profile.anagrafica.value;
  factors.push(
    fattoreAltman(bilancio, {
      formaGiuridica: anagrafica.formaGiuridica,
      atecoSezione: anagrafica.atecoPrimario === null ? null : atecoSection(anagrafica.atecoPrimario),
    }),
  );
  factors.push(fattoreEventiNegativi(profile.eventiNegativi?.value ?? null, asOf));
  factors.push(fattoreAnzianita(profile, asOf));

  // La sezione eventi negativi può essere assente perché non acquistata. In quel caso
  // l'evento peggiore — una procedura concorsuale aperta — resta invisibile, e nessun
  // punteggio può essere considerato definitivo.
  const eventi = profile.eventiNegativi?.value ?? NESSUN_EVENTO_NEGATIVO;

  /*
    Il punteggio non può salire perché mancano dei dati.

    La rinormalizzazione senza pavimento regalava il peso dei fattori assenti a quelli
    presenti. Misurato sulla stessa impresa, unico ingresso cambiato: con il bilancio in
    schema CEE 76 e classe B; togliendolo, 85 e classe A «Rischio molto basso» — perché i
    tre fattori superstiti erano i più alti e si spartivano il peso degli altri quattro.
    E il percorso senza bilancio in schema CEE è l'unico che gira in produzione.

    Il pavimento non attribuisce un valore ai fattori mancanti: quelli restano non
    valutati e la scheda li stampa così. Impedisce soltanto che il punteggio venga
    estrapolato da meno di metà del modello come se il modello fosse intero.
  */
  const misura = mediaPesataDefinita(
    factors.map((f) => ({ value: f.score, weight: f.weight })),
    { pavimentoDiCopertura: PAVIMENTO_DI_COPERTURA },
  );
  const base = misura.media;

  const builder = explain('Score di credito AEGIS')
    .formula(
      'Media pesata dei fattori valutabili, con pavimento di copertura al ' +
        `${formatPercent(PAVIMENTO_DI_COPERTURA, 0)} del peso del modello`,
    )
    .reference('Metodologia AEGIS · docs/DOMINIO.md §4');

  if (base === null) {
    /*
      La nota diceva «dati insufficienti per esprimere un punteggio» e la riga sotto ne
      esprimeva uno: 1 su 100, classe E, «rischio molto alto», con una probabilità di
      default calcolata su quell'uno. Due affermazioni opposte nello stesso oggetto, e
      quella che arriva al venditore è la cifra — perché è la cifra che il prodotto ordina,
      filtra e mostra grande in cima alla scheda.

      Ora l'assenza resta assenza. Chi legge questo oggetto è costretto dal tipo a
      distinguere «non misurato» da «misurato male», che è l'unica distinzione che conta.
    */
    return builder
      .note('Nessun fattore valutabile: dati insufficienti per esprimere un punteggio.')
      .confidence('bassa')
      .value({
        value: null,
        classe: 'ND',
        factors,
        cap: 'Dati insufficienti',
        probabilitaDefault: null,
        probabilitaDefaultSpiegata: probabilitaDefaultSpiegata(null, 'bassa'),
      });
  }

  let value = base;
  let cap: string | null = null;

  /*
    Un tetto che nasce da un FATTO non è una lacuna, ed è la distinzione che tiene in piedi
    la classe `ND`.

    Procedura concorsuale aperta, impresa cessata o in liquidazione, patrimonio netto
    negativo: sono notizie verificate, e con una di queste il giudizio è fondato anche se
    il modello ha valutato due fattori su sette. Negare la classe in quel caso toglierebbe
    al venditore proprio l'informazione per cui ha pagato — «questa impresa è in
    concordato» vale più di tutti gli indici messi insieme.

    Il tetto per copertura insufficiente, invece, non è un fatto sull'impresa: è un fatto
    su quanto ne sappiamo. Solo quello porta a `ND`.
  */
  let fattoBloccante = false;

  // ── Vincoli bloccanti ─────────────────────────────────────────────────────
  const proceduraAperta = eventi.procedure.find((p) => p.aperta);
  if (proceduraAperta !== undefined) {
    value = Math.min(value, 10);
    cap = `Procedura concorsuale aperta (${dicitura(proceduraAperta)}) dal ${formatDate(proceduraAperta.dataApertura)}`;
    fattoBloccante = true;
  }

  const stato = profile.anagrafica.value.statoAttivita;
  if (stato === 'cessata' || stato === 'fallita') {
    value = Math.min(value, 5);
    cap = `Impresa ${stato}`;
    fattoBloccante = true;
  } else if (stato === 'in-liquidazione') {
    value = Math.min(value, 20);
    cap ??= 'Impresa in liquidazione';
    fattoBloccante = true;
  }

  /*
    Il tetto sul patrimonio netto negativo leggeva il solo bilancio in schema CEE.

    In produzione quel bilancio è sempre nullo, quindi il tetto non è mai scattato.
    Misurato con patrimonio netto −1.200.000 € su attivo 3.000.000 €: 53/100, classe C
    «Rischio medio», nessun tetto e nessun avviso — mentre il fido, nella stessa
    esecuzione, stampava il patrimonio netto negativo fra i propri input. Il dato non
    mancava: mancava il percorso che lo legge.

    È la fattispecie degli artt. 2446-2447 e 2482-bis/ter c.c. Se il patrimonio netto non
    è noto da nessuna delle due fonti resta null, e nessun tetto viene applicato: assenza,
    non zero.
  */
  const patrimonioNetto = patrimonioNettoNoto(profile, bilancio);
  if (patrimonioNetto !== null && !Money.isPositive(patrimonioNetto)) {
    value = Math.min(value, 35);
    cap ??= 'Patrimonio netto negativo (perdita di capitale sociale)';
    fattoBloccante = true;
  }

  /*
    IL GRADINO PRIMA DEL PATRIMONIO NEGATIVO, che il motore non guardava.

    Sopra c'è il caso estremo: patrimonio netto sotto zero. Ma la norma scatta molto prima,
    quando la perdita ha eroso più di un terzo del capitale sociale — artt. 2446 c.c. per la
    S.p.A. e 2482-bis per la S.r.l.: gli amministratori devono convocare l'assemblea «senza
    indugio», e chi non lo fa ne risponde di persona.

    Il prodotto aveva entrambi i numeri e non li confrontava mai. Il capitale sociale lo
    mostra sulla scheda («Capitale sociale deliberato»), il patrimonio netto lo usa per il
    primo vincolo del fido, e l'unico posto in cui l'articolo era nominato è la spiegazione
    dell'Altman — dove però si limita a citarlo, senza verificare la fattispecie. Per un
    intermediario è il segnale che vende una D&O, ed è anche il motivo per cui quel cliente
    potrebbe non essere lì l'anno prossimo.

    NON TOCCA IL PUNTEGGIO, di proposito. È un fatto di governance con conseguenze legali,
    non una misura di merito creditizio già coperta dagli indici: farne un tetto sposterebbe
    numeri che nessuno ha chiesto di spostare. Diventa una riga del fascicolo, che è dove
    serve.

    E LA FRASE DICHIARA IL PROPRIO LIMITE. La soglia di legge si calcola sulla perdita al
    netto delle riserve, che il bilancio sintetico non espone: il confronto fra patrimonio
    netto e due terzi del capitale è l'indizio corretto, non l'accertamento. Dirlo come
    certo sarebbe la regola 4 violata sul punto in cui costa una consulenza legale.
  */
  const capitaleDeliberato =
    profile.anagrafica.value.capitaleSocialeDeliberato ??
    ultimoBilancioSintetico(profile)?.value.capitaleSociale ??
    null;

  if (
    patrimonioNetto !== null &&
    Money.isPositive(patrimonioNetto) &&
    capitaleDeliberato !== null &&
    Money.isPositive(capitaleDeliberato) &&
    Money.compare(patrimonioNetto, Money.multiply(capitaleDeliberato, 2 / 3)) < 0
  ) {
    const norma = normaRiduzioneCapitalePerPerdite(profile.anagrafica.value.formaGiuridica);
    builder.note(
      `Patrimonio netto ${Money.format(patrimonioNetto)} contro un capitale sociale di ` +
        `${Money.format(capitaleDeliberato)}: sotto i due terzi del deliberato. ` +
        (norma === null
          ? 'In questa forma societaria non c’è un capitale minimo da ricostituire, ma la perdita arriva al patrimonio personale dei soci. '
          : `È la soglia della disciplina sulla riduzione del capitale per perdite (${norma}): l’assemblea va convocata senza indugio, e chi amministra risponde di persona se non lo fa. `) +
        'Da verificare sul bilancio depositato: la perdita rilevante si calcola al netto delle riserve, ' +
        'che il bilancio sintetico non espone.',
    );
  }

  /*
    «Rischio molto basso» non si afferma su metà modello.

    Il pavimento sopra impedisce al punteggio di salire per assenza; questo impedisce
    all'etichetta di dirlo comunque. Un'impresa con solidità, eventi negativi e anzianità
    tutti ottimi può ancora superare 80 su tre fattori su sette: quel numero è vero come
    media dei tre, ma «Rischio molto basso» è un giudizio sull'impresa, e su quattro
    fattori mai calcolati non si può dare.
  */
  if (misura.copertura < PAVIMENTO_DI_COPERTURA && value >= SOGLIA_CLASSE_A) {
    value = SOGLIA_CLASSE_A - 1;
    cap ??=
      `Copertura del modello ${formatPercent(misura.copertura, 1)} ` +
      `(${misura.valutati} fattori su ${misura.totali}) — classe A non attribuibile`;
  }

  // ── Obsolescenza del bilancio ─────────────────────────────────────────────
  // Vale anche il bilancio sintetico: ai fini della freschezza del dato conta la data,
  // non il livello di dettaglio.
  const bilancioSourced: Sourced<unknown> | null =
    ultimoBilancio(profile) ?? ultimoBilancioSintetico(profile);
  let confidenza: Confidence = 'alta';
  let mesiBilancio: number | null = null;

  // La confidenza non può superare quella consentita dal livello di dati disponibili.
  if (livelloDati === 'sintetico') {
    confidenza = 'media';
    builder.note(
      'Analisi condotta sugli aggregati di bilancio (fatturato, patrimonio netto, totale attivo, ' +
        'costo del personale). Redditività, liquidità e sostenibilità del debito non sono ' +
        'valutabili senza il bilancio in schema CEE dettagliato.',
    );
  }

  if (profile.eventiNegativi === null) {
    confidenza = 'bassa';
    builder.note(
      '⚠ Protesti e pregiudizievoli non acquisiti: il fattore che pesa il ' +
        `${formatPercent(PESI.eventiNegativi, 0)} dello score non è stato valutato. Una ` +
        'procedura concorsuale aperta resterebbe invisibile. Il punteggio va considerato ' +
        'provvisorio.',
    );
  } else if (eventi.presenzaDichiarataSenzaDettaglio.length > 0) {
    /*
      Chi sappiamo protestato non può risultare più affidabile di chi non abbiamo
      controllato.

      La sezione non acquistata abbassava la confidenza a bassa e avvisava la testata; la
      presenza dichiarata dal registro senza elenco no — restava a confidenza media e
      senza una riga. Cioè l'impresa di cui il registro dice «ha protesti» veniva
      presentata come più solida di quella su cui non abbiamo speso nulla. La visura è
      stata pagata e ha detto qualcosa di sfavorevole: quel qualcosa deve arrivare a
      schermo, anche se non si può pesare.
    */
    confidenza = weakestConfidence(confidenza, 'bassa');
    builder.note(
      `⚠ Il registro dichiara la presenza di ${eventi.presenzaDichiarataSenzaDettaglio.join(', ')} ` +
        "senza fornirne l'elenco: il fattore che pesa il " +
        `${formatPercent(PESI.eventiNegativi, 0)} dello score non è valutabile, e non perché ` +
        'non sia stato acquistato ma perché il dettaglio non è arrivato. Richiedere la visura ' +
        'dedicata prima di formulare una proposta: il punteggio va considerato provvisorio.',
    );
  }

  if (bilancioSourced === null) {
    confidenza = 'bassa';
    builder.note(
      'Nessun bilancio disponibile: il punteggio si basa solo su eventi negativi e anzianità. ' +
        'Tipico delle società di persone e delle ditte individuali, che non depositano il bilancio.',
    );
  } else {
    mesiBilancio = ageInMonths(bilancioSourced, asOf);
    if (mesiBilancio > 24) {
      value *= 0.9;
      // `weakestConfidence` e non assegnazione diretta: la confidenza può solo scendere.
      // Un bilancio recente non compensa la mancanza degli eventi negativi.
      confidenza = weakestConfidence(confidenza, 'bassa');
      builder.note(
        `Ultimo bilancio disponibile di ${mesiBilancio} mesi fa: penalizzazione del 10% e confidenza ridotta.`,
      );
    } else if (mesiBilancio > 18) {
      confidenza = weakestConfidence(confidenza, 'media');
      builder.note(`Ultimo bilancio di ${mesiBilancio} mesi fa: confidenza ridotta a media.`);
    }
  }

  /*
    IL PAVIMENTO ANCHE VERSO IL BASSO.

    Poco sopra il modello si rifiuta di dire «Rischio molto basso» quando ha visto meno di
    metà dei fattori. Qui si rifiuta di dire qualunque cosa, per la stessa ragione e nel
    verso opposto: misurato su una risposta reale al livello base, un fattore su sette
    dava «4/100 · classe E · rischio molto alto» su un'impresa di cui il prodotto non
    sapeva praticamente nulla. Quel numero finiva grande in cima alla scheda, e con lui una
    probabilità di default a due decimali.

    A meno che un FATTO non lo giustifichi. Con una procedura concorsuale aperta o
    un'impresa cessata il giudizio regge anche su pochi indici, e nasconderlo sarebbe il
    difetto opposto: tacere l'unica cosa che il venditore doveva sapere.
  */
  const copertoAbbastanza = misura.copertura >= PAVIMENTO_DI_COPERTURA;
  const determinabile = copertoAbbastanza || fattoBloccante;

  const finale = determinabile ? Math.round(clamp(value, 1, 100)) : null;
  const classe: ClasseDiMerito = finale === null ? 'ND' : classifica(finale);

  if (finale === null) {
    cap ??=
      `Copertura del modello ${formatPercent(misura.copertura, 1)} ` +
      `(${misura.valutati} fattori su ${misura.totali}) — punteggio non determinabile`;
    builder.note(
      `Il modello ha potuto valutare ${misura.valutati} fattori su ${misura.totali}. ` +
        'Su questa base non si attribuisce né un punteggio né una classe: ' +
        'acquistare il profilo completo, oppure rilevare i dati in sede di intervista.',
    );
  }

  /*
    Il peso stampato è quello che ha pesato.

    La riga diceva «peso 20%» accanto a un fattore che, essendo uno dei tre superstiti, di
    quel punteggio ne aveva deciso il 44,4%. Due numeri diversi con lo stesso nome: chi
    legge non ha modo di accorgersene, e il fattore che conta davvero non è quello che la
    scheda indica. Ora la riga porta entrambi — quanto vale nel modello e quanto ha pesato
    qui — e il secondo compare solo per i fattori che hanno davvero pesato.
  */
  for (const factor of factors) {
    const effettivo =
      factor.score === null || misura.pesoDisponibile === 0
        ? null
        : factor.weight / Math.max(misura.pesoDisponibile, PAVIMENTO_DI_COPERTURA * misura.pesoTotale);
    builder.input(
      `${factor.label} (peso ${formatPercent(factor.weight, 1)} del modello)`,
      factor.score === null
        ? 'non valutabile'
        : `${Math.round(factor.score)}/100 · peso effettivo su questo punteggio ${formatPercent(effettivo ?? 0, 1)}`,
    );
  }

  /*
    Su quanti fattori il punteggio si regge, detto a schermo e non solo calcolato.

    Il fascicolo stampava «Score 85/100 — classe A» senza dire che quattro fattori su
    sette non erano stati valutati. Questa riga è ciò che rende il numero leggibile: le
    note e gli input della spiegazione sono inoltrati per intero dallo strato di
    presentazione, quindi arrivano davvero sotto gli occhi di chi decide.
  */
  const nonValutati = factors.filter((f) => f.score === null);
  builder.input(
    'Copertura del modello',
    `${misura.valutati} fattori su ${misura.totali} · ${formatPercent(misura.copertura, 1)} del peso`,
  );
  if (nonValutati.length > 0) {
    builder.note(
      `Punteggio calcolato su ${misura.valutati} fattori su ${misura.totali} ` +
        `(${formatPercent(misura.copertura, 1)} del peso del modello): ` +
        `${nonValutati.map((f) => f.label).join(', ')} non valutabili. ` +
        'Il peso dei fattori mancanti non viene redistribuito ai superstiti oltre il ' +
        `pavimento del ${formatPercent(PAVIMENTO_DI_COPERTURA, 0)}: un punteggio non può ` +
        'salire perché mancano dei dati.',
    );
  }

  /*
    La PD entra anche negli input dello score, che è ciò che la scheda stampa.

    La scheda mostra «PD 12 mesi 0,80%» accanto alla classe, e quel numero non aveva né
    formula né riserva: `probabilitaDefaultSpiegata` gliele dà, ma vive in un campo che lo
    strato di presentazione non inoltra ancora. Finché non lo fa, la riserva raggiunge lo
    schermo per questa via — la spiegazione dello score, che il presentatore inoltra
    intera.
  */
  const pd = probabilitaDefaultSpiegata(finale, confidenza);

  return (
    builder
      .note(
        finale === null
          ? `Punteggio non determinabile — ${CLASSE_LABEL[classe]}.`
          : `Punteggio ${finale}/100 — ${CLASSE_LABEL[classe]} (classe ${classe}).`,
      )
      .noteIf(cap !== null, `Punteggio limitato dall'alto: ${cap ?? ''}`)
      .input('Data di valutazione', formatDate(asOf))
      .input(
        'Esercizio di riferimento',
        bilancio === null ? 'da rilevare in intervista' : String(bilancio.anno),
      )
      // `formatPercent` su un'assenza scriverebbe «0,00%», che è una PD bassissima: la
      // regola 2d del progetto vista dal lato della formattazione.
      .input(
        'Probabilità di default a 12 mesi',
        pd.value === null ? 'non determinabile' : formatPercent(pd.value, 2),
      )
      .note(pd.explanation.notes.join(' '))
      .confidence(confidenza)
      .value({
        value: finale,
        classe,
        factors,
        cap,
        probabilitaDefault: pd.value,
        probabilitaDefaultSpiegata: pd,
      })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fattori
// ─────────────────────────────────────────────────────────────────────────────

function fattoreSolidita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('solidita', 'Solidità patrimoniale', PESI.solidita, 'Bilancio non disponibile');
  }

  const equityScore =
    ind.equityRatio === null
      ? null
      : interpolate(ind.equityRatio, [
          { x: -0.2, y: 0 },
          { x: 0, y: 10 },
          { x: 0.1, y: 35 },
          { x: 0.2, y: 55 },
          { x: 0.3, y: 72 },
          { x: 0.5, y: 90 },
          { x: 0.7, y: 100 },
        ]);

  const leverageScore =
    ind.indiceIndebitamento === null
      ? null
      : interpolate(ind.indiceIndebitamento, [
          { x: 0.5, y: 100 },
          { x: 1.5, y: 85 },
          { x: 3, y: 60 },
          { x: 5, y: 35 },
          { x: 8, y: 15 },
          { x: 12, y: 0 },
        ]);

  const coperturaScore =
    ind.coperturaImmobilizzazioni === null
      ? null
      : interpolate(ind.coperturaImmobilizzazioni, [
          { x: 0.4, y: 10 },
          { x: 0.8, y: 45 },
          { x: 1, y: 70 },
          { x: 1.5, y: 90 },
          { x: 2.5, y: 100 },
        ]);

  const score = weightedAverageDefined([
    { value: equityScore, weight: 0.45 },
    { value: leverageScore, weight: 0.35 },
    { value: coperturaScore, weight: 0.2 },
  ]);

  return {
    key: 'solidita',
    label: 'Solidità patrimoniale',
    weight: PESI.solidita,
    score,
    rationale:
      score === null
        ? 'Indici patrimoniali non calcolabili.'
        : score >= 70
          ? 'Struttura patrimoniale robusta: i mezzi propri coprono adeguatamente attivo e immobilizzazioni.'
          : score >= 45
            ? 'Patrimonializzazione nella norma, con dipendenza significativa da fonti di terzi.'
            : 'Patrimonializzazione debole: la struttura finanziaria è esposta a shock di reddito.',
    details: [
      `Equity ratio: ${ind.equityRatio === null ? assenzaDi('equityRatio') : formatPercent(ind.equityRatio)}`,
      `Indice di indebitamento: ${ind.indiceIndebitamento === null ? assenzaDi('indiceIndebitamento') : `${formatNumber(ind.indiceIndebitamento)}×`}`,
      `Copertura immobilizzazioni: ${ind.coperturaImmobilizzazioni === null ? assenzaDi('coperturaImmobilizzazioni') : `${formatNumber(ind.coperturaImmobilizzazioni)}×`}`,
    ],
  };
}

function fattoreRedditivita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('redditivita', 'Redditività', PESI.redditivita, 'Bilancio non disponibile');
  }

  const roiScore =
    ind.roi === null
      ? null
      : interpolate(ind.roi, [
          { x: -0.15, y: 0 },
          { x: -0.05, y: 15 },
          { x: 0, y: 35 },
          { x: 0.03, y: 55 },
          { x: 0.07, y: 75 },
          { x: 0.15, y: 92 },
          { x: 0.25, y: 100 },
        ]);

  const ebitdaScore =
    ind.ebitdaMargin === null
      ? null
      : interpolate(ind.ebitdaMargin, [
          { x: -0.1, y: 0 },
          { x: 0, y: 25 },
          { x: 0.05, y: 50 },
          { x: 0.1, y: 70 },
          { x: 0.18, y: 88 },
          { x: 0.3, y: 100 },
        ]);

  const trendScore =
    ind.crescitaEbitda === null
      ? null
      : interpolate(ind.crescitaEbitda, [
          { x: -0.4, y: 10 },
          { x: -0.15, y: 35 },
          { x: 0, y: 60 },
          { x: 0.15, y: 80 },
          { x: 0.4, y: 100 },
        ]);

  const score = weightedAverageDefined([
    { value: roiScore, weight: 0.4 },
    { value: ebitdaScore, weight: 0.4 },
    { value: trendScore, weight: 0.2 },
  ]);

  return {
    key: 'redditivita',
    label: 'Redditività',
    weight: PESI.redditivita,
    score,
    rationale:
      score === null
        ? 'Indici di redditività non calcolabili.'
        : score >= 70
          ? 'La gestione caratteristica genera margini solidi e sostenibili.'
          : score >= 45
            ? 'Redditività modesta: margini sufficienti ma poco spazio di assorbimento degli shock.'
            : 'Redditività insufficiente: la gestione operativa non remunera il capitale investito.',
    details: [
      `ROI: ${ind.roi === null ? assenzaDi('roi') : formatPercent(ind.roi)}`,
      `EBITDA margin: ${ind.ebitdaMargin === null ? assenzaDi('ebitdaMargin') : formatPercent(ind.ebitdaMargin)}`,
      `Crescita EBITDA: ${ind.crescitaEbitda === null ? assenzaDi('crescitaEbitda') : formatPercent(ind.crescitaEbitda)}`,
    ],
  };
}

/**
 * La frase della tensione si compone dai valori, non dal punteggio.
 *
 * Diceva «gli impegni a breve non sono coperti dalle attività correnti» a un'impresa con
 * current ratio 1,37 — che li copre, e la riga sotto lo stampava. Il punteggio era basso
 * per il quick ratio (0,53) e per un ciclo di 313 giorni, non per il current ratio: la
 * frase, scelta dalla sola soglia del punteggio, affermava ciò che i numeri accanto
 * smentivano. Regola 5 del progetto: le frasi si compongono dai valori.
 */
function motivoDellaTensione(ind: FinancialIndicators): string {
  const corrente = ind.currentRatio;
  const rapido = ind.quickRatio;
  if (corrente !== null && corrente >= 1 && rapido !== null && rapido < 1) {
    return (
      `Tensione di liquidità: le attività correnti coprono gli impegni a breve (${formatNumber(corrente)}×) ` +
      `solo contando le scorte; senza, la copertura scende a ${formatNumber(rapido)}×.`
    );
  }
  if (corrente !== null && corrente < 1) {
    return 'Tensione di liquidità: gli impegni a breve non sono coperti dalle attività correnti.';
  }
  return 'Tensione di liquidità: il circolante assorbe cassa e le risorse a breve sono scarse.';
}

function fattoreLiquidita(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable('liquidita', 'Liquidità', PESI.liquidita, 'Bilancio non disponibile');
  }

  const currentScore =
    ind.currentRatio === null
      ? null
      : interpolate(ind.currentRatio, [
          { x: 0.5, y: 0 },
          { x: 0.8, y: 25 },
          { x: 1, y: 45 },
          { x: 1.3, y: 65 },
          { x: 1.7, y: 85 },
          { x: 2.5, y: 100 },
        ]);

  const quickScore =
    ind.quickRatio === null
      ? null
      : interpolate(ind.quickRatio, [
          { x: 0.3, y: 0 },
          { x: 0.6, y: 30 },
          { x: 0.9, y: 55 },
          { x: 1.2, y: 78 },
          { x: 1.8, y: 100 },
        ]);

  const cicloScore =
    ind.cicloCircolante === null
      ? null
      : interpolate(ind.cicloCircolante, [
          { x: -30, y: 100 },
          { x: 0, y: 90 },
          { x: 45, y: 70 },
          { x: 90, y: 45 },
          { x: 150, y: 20 },
          { x: 240, y: 0 },
        ]);

  const score = weightedAverageDefined([
    { value: currentScore, weight: 0.35 },
    { value: quickScore, weight: 0.4 },
    { value: cicloScore, weight: 0.25 },
  ]);

  return {
    key: 'liquidita',
    label: 'Liquidità',
    weight: PESI.liquidita,
    score,
    rationale:
      score === null
        ? 'Indici di liquidità non calcolabili.'
        : score >= 70
          ? 'Buon equilibrio fra impegni a breve e risorse disponibili.'
          : score >= 45
            ? 'Liquidità appena sufficiente: il circolante assorbe cassa in misura rilevante.'
            : motivoDellaTensione(ind),
    details: [
      `Current ratio: ${ind.currentRatio === null ? assenzaDi('currentRatio') : `${formatNumber(ind.currentRatio)}×`}`,
      `Quick ratio: ${ind.quickRatio === null ? assenzaDi('quickRatio') : `${formatNumber(ind.quickRatio)}×`}`,
      /*
        L'unica riga di questo file che stampava il numero grezzo.

        Le sedici accanto passano da `formatNumber`, questa no: usciva «Ciclo del
        circolante: 313.3014 gg», con il punto come separatore decimale e quattro cifre. Un
        lettore italiano legge trecentotredicimila giorni — e due riquadri più su, nella
        tabella degli indici dell'archivio, lo stesso dato compare come «313 gg».
      */
      `Ciclo del circolante: ${ind.cicloCircolante === null ? assenzaDi('cicloCircolante') : `${formatNumber(ind.cicloCircolante, 0)} gg`}`,
    ],
  };
}

function fattoreSostenibilitaDebito(ind: FinancialIndicators | null): ScoreFactor {
  if (ind === null) {
    return notEvaluable(
      'sostenibilita-debito',
      'Sostenibilità del debito',
      PESI.sostenibilitaDebito,
      'Bilancio non disponibile',
    );
  }

  const pfnScore =
    ind.pfnSuEbitda === null
      ? null
      : interpolate(ind.pfnSuEbitda, [
          { x: -1, y: 100 },
          { x: 0, y: 95 },
          { x: 1.5, y: 80 },
          { x: 3, y: 60 },
          { x: 4.5, y: 35 },
          { x: 6, y: 15 },
          { x: 9, y: 0 },
        ]);

  const coperturaScore =
    ind.coperturaOneriFinanziari === null
      ? null
      : interpolate(ind.coperturaOneriFinanziari, [
          { x: 0, y: 0 },
          { x: 1, y: 25 },
          { x: 2, y: 45 },
          { x: 3, y: 65 },
          { x: 6, y: 85 },
          { x: 12, y: 100 },
        ]);

  const incidenzaScore =
    ind.incidenzaOneriFinanziari === null
      ? null
      : interpolate(ind.incidenzaOneriFinanziari, [
          { x: 0, y: 100 },
          { x: 0.01, y: 85 },
          { x: 0.03, y: 60 },
          { x: 0.06, y: 30 },
          { x: 0.1, y: 0 },
        ]);

  const score = weightedAverageDefined([
    { value: pfnScore, weight: 0.45 },
    { value: coperturaScore, weight: 0.35 },
    { value: incidenzaScore, weight: 0.2 },
  ]);

  return {
    key: 'sostenibilita-debito',
    label: 'Sostenibilità del debito',
    weight: PESI.sostenibilitaDebito,
    score,
    rationale:
      score === null
        ? 'Indici di sostenibilità del debito non calcolabili.'
        : score >= 70
          ? 'Il debito finanziario è ampiamente sostenibile con i flussi operativi correnti.'
          : score >= 45
            ? 'Debito sostenibile ma con margini ridotti: sensibile a un calo della marginalità.'
            : 'Debito non sostenibile con la marginalità attuale: rischio di tensione finanziaria.',
    details: [
      `PFN / EBITDA: ${ind.pfnSuEbitda === null ? assenzaDi('pfnSuEbitda') : `${formatNumber(ind.pfnSuEbitda)}×`}`,
      `Copertura oneri finanziari: ${ind.coperturaOneriFinanziari === null ? assenzaDi('coperturaOneriFinanziari') : `${formatNumber(ind.coperturaOneriFinanziari)}×`}`,
      `Incidenza oneri finanziari sui ricavi: ${ind.incidenzaOneriFinanziari === null ? assenzaDi('incidenzaOneriFinanziari') : formatPercent(ind.incidenzaOneriFinanziari)}`,
    ],
  };
}

function fattoreAltman(bilancio: BilancioRiclassificato | null, contesto: ContestoAltman): ScoreFactor {
  if (bilancio === null) {
    return notEvaluable('altman', "Altman Z''-score", PESI.altman, 'Bilancio non disponibile');
  }

  // Il contesto serve solo alle frasi: la formula e i coefficienti non cambiano.
  const altman = computeAltmanZ(bilancio, contesto);
  if (altman.value === null) {
    return notEvaluable('altman', "Altman Z''-score", PESI.altman, 'Totale attivo non valorizzato');
  }

  const score = altmanToScore(altman.value.z);
  return {
    key: 'altman',
    label: "Altman Z''-score",
    weight: PESI.altman,
    score,
    rationale: `Z'' = ${formatNumber(altman.value.z)} — ${altman.value.zone === 'sicurezza' ? 'zona di sicurezza' : altman.value.zone === 'incertezza' ? 'zona di incertezza' : 'zona di rischio di insolvenza'}.`,
    details: altman.explanation.inputs.map((i) => `${i.label}: ${i.value}`),
  };
}

/**
 * Come si nomina una procedura in un documento che leggerà un broker.
 *
 * `tipo` è un'etichetta interna col trattino — «stato-insolvenza» — e finiva stampata
 * così sotto gli occhi del cliente. Il registro la sua formulazione ce l'ha, ed è quella
 * che regge davanti a una contestazione: si stampa quella, e si ricade sull’etichetta solo
 * quando il registro non l'ha mandata.
 */
function dicitura(procedura: ProceduraConcorsuale): string {
  return procedura.descrizione ?? procedura.tipo;
}

/**
 * @param eventi `null` se la sezione non è stata acquisita.
 *
 * La distinzione è tutt'altro che formale. Trattare «non ho controllato» come «non ci
 * sono protesti» significa regalare venti punti di score — il peso del fattore — a
 * un'azienda che potrebbe averne dieci. È il modo più diretto per far concedere un fido
 * a un soggetto già protestato.
 */
function fattoreEventiNegativi(eventi: EventiNegativi | null, asOf: Date): ScoreFactor {
  if (eventi === null) {
    return notEvaluable(
      'eventi-negativi',
      'Eventi negativi',
      PESI.eventiNegativi,
      'Protesti e pregiudizievoli non acquisiti',
    );
  }

  let punteggio = 100;
  const details: string[] = [];

  /*
    I protesti pesano in funzione dell'importo e della freschezza: uno di 8 anni fa,
    levato, non racconta la stessa storia di uno di sei mesi fa ancora aperto.

    Ma il taglio ai dieci anni avveniva **prima** di scrivere in details, e il controllo
    che più sotto impedisce la contraddizione guardava perciò un elenco già svuotato.
    Misurato: due protesti e un'ipoteca giudiziale da 800.000 € del 2014 davano fattore
    100 su 100 e la frase «Nessun protesto, pregiudizievole o procedura concorsuale a
    carico della società», mentre la schermata li elencava tutti e tre con data e importo.

    Oltre i dieci anni la penalità è zero — la curva di decadimento ci arriva da sola — ma
    l'evento c'è, ed è stato trovato: va scritto, perché è quello che l'intermediario si
    sente contestare in sede di quotazione.
  */
  for (const protesto of eventi.protesti) {
    const anni = anniTra(protesto.data, asOf);
    if (anni > 10) {
      details.push(
        `Protesto ${formatDate(protesto.data)} · ${Money.formatCompact(protesto.importo)}` +
          `${protesto.levato ? ' (levato)' : ''} → oltre dieci anni fa: nessuna penalità sul ` +
          'punteggio, resta da citare in sede di quotazione',
      );
      continue;
    }
    const decadimento = interpolate(anni, [
      { x: 0, y: 1 },
      { x: 2, y: 0.7 },
      { x: 5, y: 0.35 },
      { x: 10, y: 0 },
    ]);
    const gravita = interpolate(Money.toEuro(protesto.importo), [
      { x: 0, y: 8 },
      { x: 5_000, y: 18 },
      { x: 25_000, y: 32 },
      { x: 100_000, y: 45 },
    ]);
    const penalita = gravita * decadimento * (protesto.levato ? 0.4 : 1);
    punteggio -= penalita;
    details.push(
      `Protesto ${formatDate(protesto.data)} · ${Money.formatCompact(protesto.importo)}` +
        `${protesto.levato ? ' (levato)' : ''} → −${Math.round(penalita)} punti`,
    );
  }

  for (const p of eventi.pregiudizievoli) {
    const anni = anniTra(p.data, asOf);
    // Stessa ragione dei protesti: la penalità decade, la pregiudizievole no. Un'iscrizione
    // ipotecaria conserva effetto vent'anni (art. 2847 c.c.), e tacerla perché il modello
    // non la pesa più significa smentire l'elenco stampato due riquadri sotto.
    if (anni > 10) {
      details.push(
        `${p.descrizione} del ${formatDate(p.data)} → oltre dieci anni fa: nessuna penalità ` +
          'sul punteggio, resta da citare in sede di quotazione',
      );
      continue;
    }
    const decadimento = interpolate(anni, [
      { x: 0, y: 1 },
      { x: 3, y: 0.6 },
      { x: 7, y: 0.25 },
      { x: 10, y: 0 },
    ]);
    const base =
      p.tipo === 'ipoteca-giudiziale' || p.tipo === 'pignoramento' || p.tipo === 'sequestro' ? 30 : 15;
    const penalita = base * decadimento;
    punteggio -= penalita;
    // La descrizione della conservatoria, non la nostra categoria col trattino.
    details.push(`${p.descrizione} del ${formatDate(p.data)} → −${Math.round(penalita)} punti`);
  }

  for (const procedura of eventi.procedure) {
    if (procedura.aperta) {
      punteggio = 0;
      details.push(
        `Procedura aperta: ${dicitura(procedura)} dal ${formatDate(procedura.dataApertura)} → azzeramento`,
      );
    } else {
      punteggio -= 20;
      // Chiusa e revocata non sono la stessa cosa, e a chi legge interessa quale delle due.
      const fine =
        procedura.dataRevoca !== null
          ? `revocata il ${formatDate(procedura.dataRevoca)}`
          : procedura.dataChiusura !== null
            ? `chiusa il ${formatDate(procedura.dataChiusura)}`
            : 'chiusa';
      details.push(`Procedura ${fine}: ${dicitura(procedura)} → −20 punti`);
    }
  }

  /*
    Il registro dichiara eventi di cui non ha dato il dettaglio.

    È il caso più insidioso: gli elenchi arrivano vuoti e, letti da soli, dicono «pulita».
    Ma gli indicatori dicono il contrario, e senza importi né date non si può pesare nulla.

    Non si stima una penalità inventata: si dichiara che la valutazione **non è
    completa**. Un punteggio pieno su un'impresa protestata è un certificato di buona
    salute falso, e su una proposta assicurativa vale molto più di qualche punto.
  */
  const dichiaratiSenzaDettaglio = eventi.presenzaDichiarataSenzaDettaglio;
  if (dichiaratiSenzaDettaglio.length > 0) {
    const elenco = dichiaratiSenzaDettaglio.join(', ');
    /*
      La discordanza è quasi sempre **parziale**: il registro tace l'elenco di una
      categoria e manda per intero quello di un'altra. Il ramo scartava tutti i dettagli
      già calcolati, e la scheda finiva per affermare che nessun elenco era stato fornito
      accanto a una pregiudizievole che aveva data, importo e descrizione. Il protesto
      vero spariva dal fattore mentre tre righe dichiaravano il contrario.

      Qui si conserva ciò che è arrivato e si dichiara mancante solo ciò che manca. Il
      punteggio resta comunque non attribuito: senza importi e date della parte taciuta
      sarebbe inventato, e il pavimento di copertura fa sì che l'assenza di questo
      fattore si veda nel punteggio invece di regalarne il peso agli altri.
    */
    const trovato = details.length > 0;
    return {
      key: 'eventi-negativi',
      label: 'Eventi negativi',
      weight: PESI.eventiNegativi,
      score: null,
      rationale:
        `Il registro dichiara la presenza di ${elenco}, senza fornirne il dettaglio: ` +
        'la valutazione resta incompleta finché non si acquisisce la visura specifica. ' +
        'Non si attribuisce un punteggio, perché senza importi e date sarebbe inventato.' +
        (trovato
          ? ' Gli eventi di cui il dettaglio è invece arrivato restano elencati qui sotto e ' +
            'vanno citati in sede di quotazione.'
          : ''),
      details: [
        ...details,
        `Presenza dichiarata dal registro, senza elenco: ${elenco}.`,
        `Di ${elenco} non è arrivato nessun importo e nessuna data: non c'è modo di pesarli.`,
        'Richiedere la visura dedicata prima di formulare una proposta.',
      ],
    };
  }

  /*
    La frase dice cosa è stato trovato, non quanti punti restano.

    Era decisa dal punteggio: sopra 95 scriveva «nessun evento pregiudizievole a carico
    della società». Ma un protesto levato di dodicimila euro del 2021 pesa tre punti —
    è vecchio ed è stato pagato — e lascia il punteggio a 97: la riga diceva «nessun
    evento» mentre l'elenco sotto, a due centimetri, ne stampava uno con data e importo.

    Un lettore che trova due affermazioni opposte nella stessa scheda non sceglie quella
    giusta: smette di fidarsi di entrambe. Qui si guarda se qualcosa è stato davvero
    trovato, e solo allora si parla di gravità.
  */
  const qualcosaTrovato = details.length > 0;
  if (!qualcosaTrovato) {
    details.push('Nessun protesto, pregiudizievole o procedura concorsuale rilevata.');
  }

  const score = clamp(punteggio, 0, 100);
  return {
    key: 'eventi-negativi',
    label: 'Eventi negativi',
    weight: PESI.eventiNegativi,
    score,
    rationale: !qualcosaTrovato
      ? 'Nessun protesto, pregiudizievole o procedura concorsuale a carico della società.'
      : score >= 95
        ? 'Eventi negativi presenti ma di peso trascurabile: risalenti nel tempo, di importo modesto o già estinti. Restano da citare in sede di quotazione.'
        : score >= 60
          ? 'Presenza di eventi negativi di entità contenuta o risalenti nel tempo.'
          : 'Eventi negativi rilevanti e recenti: forte segnale di deterioramento del merito creditizio.',
    details,
  };
}

function fattoreAnzianita(profile: CompanyProfile, asOf: Date): ScoreFactor {
  const anni = anniDiAttivita(profile, asOf);
  const bilanciDepositati = eserciziDisponibili(profile);

  const anniScore =
    anni === null
      ? null
      : interpolate(anni, [
          { x: 0, y: 20 },
          { x: 2, y: 45 },
          { x: 5, y: 70 },
          { x: 10, y: 88 },
          { x: 20, y: 100 },
        ]);

  const continuitaScore = interpolate(bilanciDepositati, [
    { x: 0, y: 40 },
    { x: 1, y: 60 },
    { x: 3, y: 85 },
    { x: 5, y: 100 },
  ]);

  const score = weightedAverageDefined([
    { value: anniScore, weight: 0.6 },
    { value: continuitaScore, weight: 0.4 },
  ]);

  return {
    key: 'anzianita',
    label: 'Anzianità e continuità',
    weight: PESI.anzianita,
    score,
    rationale:
      anni === null
        ? 'Data di costituzione non disponibile.'
        : anni < 3
          ? `Impresa giovane (${anni} anni): storico insufficiente a consolidare il giudizio.`
          : `Impresa attiva da ${anni} anni, con ${bilanciDepositati} esercizi disponibili.`,
    details: [
      `Anni di attività: ${anni ?? 'da rilevare in intervista'}`,
      `Bilanci disponibili: ${bilanciDepositati}`,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il patrimonio netto, da dove c'è.
 *
 * Dal bilancio in schema CEE quando arriva; altrimenti dagli aggregati sintetici, che è
 * la stessa fonte da cui il fido prende il patrimonio nella medesima esecuzione. Se non
 * c'è né l'uno né gli altri restituisce null, e chi chiama non applica nessun tetto: un
 * patrimonio netto ignoto non è un patrimonio netto azzerato.
 */
function patrimonioNettoNoto(
  profile: CompanyProfile,
  bilancio: BilancioRiclassificato | null,
): Euro | null {
  if (bilancio !== null) return bilancio.sp.patrimonioNetto;
  return ultimoBilancioSintetico(profile)?.value.patrimonioNetto ?? null;
}

function notEvaluable(key: string, label: string, weight: number, motivo: string): ScoreFactor {
  return {
    key,
    label,
    weight,
    score: null,
    rationale: `Non valutabile: ${motivo.toLowerCase()}.`,
    details: [],
  };
}

export function classifica(score: number): ClasseDiMerito {
  if (score >= SOGLIA_CLASSE_A) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

/** Gli otto punti della curva score → PD, in un posto solo. */
const CURVA_PD: readonly { readonly x: number; readonly y: number }[] = [
  { x: 1, y: 35 },
  { x: 20, y: 18 },
  { x: 35, y: 9 },
  { x: 50, y: 4.5 },
  { x: 65, y: 2 },
  { x: 80, y: 0.8 },
  { x: 90, y: 0.35 },
  { x: 100, y: 0.15 },
];

/**
 * Curva di calibrazione score → probabilità di default a 12 mesi.
 *
 * I valori attuali sono una calibrazione di riferimento sulla distribuzione tipica del
 * mercato italiano; vanno ricalibrati sui dati storici della piattaforma appena il
 * campione lo consente. La funzione è isolata proprio per rendere la ricalibrazione
 * un intervento a un solo punto.
 */
export function probabilitaDefault(score: number): number {
  return interpolate(score, CURVA_PD) / 100;
}

/**
 * La stessa probabilità, nella forma che questo prodotto usa per ogni altro numero.
 *
 * La confidenza è **al più media**, e non per prudenza generica: la curva non è stimata
 * sui default osservati dalla piattaforma, quindi la cifra è l'ordine di grandezza del
 * rischio, non una misura. Eredita inoltre la confidenza dello score da cui nasce — una
 * PD calcolata su un punteggio provvisorio non può essere più affidabile di lui.
 */
export function probabilitaDefaultSpiegata(
  score: number | null,
  confidenzaScore: Confidence,
): Explained<number | null> {
  /*
    Senza punteggio non c'è niente da interpolare.

    La curva trasforma uno score in una percentuale: chiamarla su un punteggio che non
    esiste produrrebbe una probabilità di insolvenza con due decimali ricavata da un numero
    inventato — e la scheda la stamperebbe accanto al nome di un'impresa vera.
  */
  if (score === null) {
    return explain('Probabilità di default a 12 mesi')
      .formula('Interpolazione lineare dello score sulla curva di calibrazione score → PD')
      .input('Score di credito', 'non determinabile')
      .note(
        'Il punteggio di credito non è determinabile su questi dati, quindi non lo è nemmeno ' +
          'la probabilità di default: la curva trasforma uno score in una percentuale, e qui ' +
          'non c’è uno score da trasformare.',
      )
      .reference('Metodologia AEGIS · docs/DOMINIO.md §4 — curva di calibrazione score → PD')
      .confidence('bassa')
      .value(null);
  }

  const pd = probabilitaDefault(score);
  return explain('Probabilità di default a 12 mesi')
    .formula('Interpolazione lineare dello score sulla curva di calibrazione score → PD')
    .input('Score di credito', `${score}/100`)
    .input('Punti della curva', CURVA_PD.map((p) => `${p.x} → ${formatNumber(p.y, 2)}%`).join(' · '))
    .note(
      `PD stimata: ${formatPercent(pd, 2)}. La curva è una calibrazione di riferimento sulla ` +
        'distribuzione tipica del mercato italiano, non una stima sui default osservati dalla ' +
        'piattaforma: la cifra indica l’ordine di grandezza del rischio, non va letta al centesimo ' +
        'di punto.',
    )
    .reference('Metodologia AEGIS · docs/DOMINIO.md §4 — curva di calibrazione score → PD')
    .confidence('media')
    .inheritConfidence(confidenzaScore)
    .value(pd);
}

function anniTra(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 86_400_000);
}

function formatDate(date: Date): string {
  return formattaGiorno(date);
}
