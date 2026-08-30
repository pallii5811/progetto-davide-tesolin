/**
 * Obbligo assicurativo contro le calamità naturali (CAT NAT).
 *
 * Riferimenti: L. 213/2023 (Bilancio 2024) art. 1 cc. 101-111 · DM MEF-MIMIT n. 18 del
 * 30/01/2025 · successivi decreti di proroga.
 *
 * Perché è un motore e non un banner: solo il 15% circa delle imprese italiane risulta
 * effettivamente coperto. Su un portafoglio di 500 aziende significa oltre 400 posizioni
 * non conformi — con esclusione dall'accesso a contributi e agevolazioni pubbliche.
 * È la lista di lavoro più redditizia che un intermediario possa avere in questo momento,
 * ma solo se qualcuno gliela sa produrre in automatico.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { CompanyFacts } from '../company/facts.js';
import type { FormaGiuridica, StatoAttivita } from '../company/profile.js';
import type { CompanySize } from '../company/size.js';
import { formattaGiorno, inizioDellaGiornata } from '../shared/tempo.js';

export type CatNatStatus =
  /** Non soggetta all'obbligo. */
  | 'non-soggetta'
  /** Soggetta, termine non ancora scaduto. */
  | 'in-scadenza'
  /** Soggetta, termine scaduto, nessuna copertura risultante. */
  | 'inadempiente'
  /** Soggetta e coperta. */
  | 'adempiente';

export interface CatNatAssessment {
  readonly status: CatNatStatus;
  readonly soggetta: boolean;
  readonly motivoEsclusione: string | null;
  readonly termine: Date | null;
  readonly giorniAlTermine: number | null;
  /** `null` se il valore dei beni non è quantificabile: l'obbligo di legge resta comunque. */
  readonly baseAssicurabile: Euro | null;
  readonly beniInclusi: readonly string[];
  readonly eventiCoperti: readonly string[];
  readonly vincoliDiProdotto: readonly string[];
  readonly conseguenzeInadempimento: readonly string[];
}

/**
 * L'ultimo istante del giorno indicato, letto a Roma.
 *
 * I termini erano scritti T23:59:59Z, che a Roma è l'01:59:59 del giorno dopo: sette
 * termini di legge su sette uscivano stampati il giorno successivo a quello della tabella
 * di docs/DOMINIO.md — 01/04/2025 invece di 31/03/2025, e così tutti gli altri. Le prove
 * non lo vedevano perché confrontavano la stringa ISO della costante o getUTCFullYear,
 * cioè il valore che dentro la costante è già corretto; il giorno che il cliente legge non
 * è quello.
 *
 * Il fuso non si eredita dalla macchina: inizioDellaGiornata lo dichiara, ed è la stessa
 * funzione con cui il resto del prodotto risponde alla stessa domanda.
 *
 * Un termine di legge scade alla fine del giorno che porta, non al suo inizio: qui si
 * tiene l'ultimo millisecondo, così il giorno stampato e il giorno utile coincidono.
 */
function fineDelGiorno(giorno: string): Date {
  const mezzogiorno = new Date(`${giorno}T12:00:00Z`);
  /*
    Trentasei ore da mezzanotte cadono dentro il giorno dopo che quel giorno duri 23, 24 o
    25 ore: il cambio d'ora non sposta il risultato. Poi si riporta alla mezzanotte romana
    e si toglie un millisecondo.
  */
  const giornoDopo = inizioDellaGiornata(
    new Date(inizioDellaGiornata(mezzogiorno).getTime() + 36 * 3_600_000),
  );
  return new Date(giornoDopo.getTime() - 1);
}

/**
 * Scadenze per classe dimensionale.
 * Tabella volutamente isolata e datata: la materia è stata oggetto di proroghe ripetute
 * e va aggiornata qui, in un punto solo.
 *
 * Ultimo allineamento: agosto 2026.
 */
export const TERMINI_CATNAT: Readonly<Record<CompanySize, Date>> = {
  grande: fineDelGiorno('2025-03-31'),
  media: fineDelGiorno('2025-10-01'),
  piccola: fineDelGiorno('2026-01-01'),
  micro: fineDelGiorno('2026-01-01'),
};

/**
 * Proroghe settoriali per micro e piccole imprese (Milleproroghe).
 * Chiave: divisione ATECO. Valore: termine prorogato.
 */
export const PROROGHE_SETTORIALI: Readonly<
  Record<string, { readonly termine: Date; readonly settore: string }>
> = {
  '03': { termine: fineDelGiorno('2026-12-31'), settore: 'pesca e acquacoltura' },
  '55': { termine: fineDelGiorno('2026-03-31'), settore: 'alloggio e strutture turistico-ricettive' },
  '56': { termine: fineDelGiorno('2026-03-31'), settore: 'somministrazione di alimenti e bevande' },
};

export const BENI_INCLUSI: readonly string[] = [
  'Terreni e fabbricati (art. 2424 c.c., attivo B-II n. 1)',
  'Impianti e macchinario (art. 2424 c.c., attivo B-II n. 2)',
  'Attrezzature industriali e commerciali (art. 2424 c.c., attivo B-II n. 3)',
];

export const EVENTI_COPERTI: readonly string[] = [
  'Sismi',
  'Alluvioni, inondazioni ed esondazioni',
  'Frane',
];

/**
 * «Si tiene conto», non «preclude».
 *
 * L'art. 1 c. 102 dispone che dell'inadempimento si tenga conto nell'assegnazione di
 * contributi, sovvenzioni e agevolazioni di carattere finanziario a valere su risorse
 * pubbliche, anche di quelli previsti in occasione di eventi calamitosi e catastrofali.
 * Qui era scritto «nessun accesso ai sostegni statali straordinari: la ricostruzione resta
 * interamente a carico dell'impresa», che è più severo della norma — e che si
 * contraddiceva con la riga sopra a tre righe di distanza, dentro l'avviso critico letto
 * dal cliente. Sovradichiarare un obbligo è pericoloso quanto tacerlo: al primo controllo
 * fatto dal cliente, tutto il resto del documento perde credito.
 *
 * La formulazione corretta era già scritta nel prodotto — motivazione.ts, la regola
 * obbligoCatNat — ed è quella che si copia qui invece di inventarne una terza.
 */
export const CONSEGUENZE_INADEMPIMENTO: readonly string[] = [
  'Dell’inadempimento si tiene conto nell’assegnazione di contributi, sovvenzioni e agevolazioni ' +
    'di carattere finanziario a valere su risorse pubbliche.',
  'Se ne tiene conto anche per i contributi previsti in occasione di eventi calamitosi e ' +
    'catastrofali: l’inadempimento è un elemento della valutazione, non una decadenza automatica.',
];

/**
 * Gli adeguati assetti, detti a chi la norma li chiede.
 *
 * L'art. 2086, c. 2, c.c. grava sull'imprenditore «che operi in forma societaria o
 * collettiva»: alla ditta individuale non si applica, e affermarglielo in un documento
 * firmato è un obbligo di legge inventato. Sulla forma non rilevata — 'altro' è il valore
 * dell'ignoto — non si afferma nulla: l'assenza resta assenza.
 */
export const CONSEGUENZA_ASSETTI_ADEGUATI =
  'Possibile rilievo nella valutazione degli adeguati assetti organizzativi ex art. 2086, c. 2, ' +
  'c.c. in capo all’organo amministrativo.';

/** Chi non opera in forma societaria o collettiva, e chi non si sa in quale forma operi. */
const FORME_SENZA_ORGANO_AMMINISTRATIVO: readonly FormaGiuridica[] = ['ditta-individuale', 'altro'];

function conseguenzeInadempimentoPer(facts: CompanyFacts): readonly string[] {
  if (FORME_SENZA_ORGANO_AMMINISTRATIVO.includes(facts.formaGiuridica)) {
    return CONSEGUENZE_INADEMPIMENTO;
  }
  return [...CONSEGUENZE_INADEMPIMENTO, CONSEGUENZA_ASSETTI_ADEGUATI];
}

export const VINCOLI_DI_PRODOTTO: readonly string[] = [
  'Scoperto o franchigia non superiore al 15% del danno indennizzabile per somme assicurate fino a 30 M€.',
  'I limiti di indennizzo minimi variano per fascia di somma assicurata: verificarne il rispetto sul contratto proposto.',
  'Una polizza incendio con semplice estensione al terremoto non necessariamente soddisfa l’obbligo: ' +
    'devono risultare coperti tutti gli eventi e tutti i beni indicati dalla norma.',
];

export interface CatNatInput {
  readonly facts: CompanyFacts;
  readonly baseAssicurabile: Euro | null;
  /** Esiste già una copertura catastrofale conforme in portafoglio. */
  readonly giaCoperta: boolean;
  readonly asOf: Date;
}

export function assessCatNat(input: CatNatInput): Explained<CatNatAssessment> {
  const { facts, baseAssicurabile, giaCoperta, asOf } = input;

  const builder = explain('Obbligo assicurativo catastrofale (CAT NAT)')
    .reference('L. 213/2023 art. 1 cc. 101-111')
    .reference('DM MEF-MIMIT n. 18 del 30/01/2025')
    .input('Dimensione impresa', facts.dimensione)
    .input('Sezione ATECO', facts.atecoSezione ?? 'da rilevare in intervista')
    .input(
      'Base assicurabile',
      baseAssicurabile === null ? 'non quantificabile' : Money.formatCompact(baseAssicurabile),
    );

  // ── Esclusioni ────────────────────────────────────────────────────────────
  const esclusione = valutaEsclusione(facts);
  if (esclusione !== null) {
    return builder.note(`Impresa non soggetta all’obbligo: ${esclusione}`).confidence('media').value({
      status: 'non-soggetta',
      soggetta: false,
      motivoEsclusione: esclusione,
      termine: null,
      giorniAlTermine: null,
      baseAssicurabile,
      beniInclusi: BENI_INCLUSI,
      eventiCoperti: EVENTI_COPERTI,
      vincoliDiProdotto: VINCOLI_DI_PRODOTTO,
      conseguenzeInadempimento: [],
    });
  }

  // ── Termine applicabile ───────────────────────────────────────────────────
  let termine = TERMINI_CATNAT[facts.dimensione];
  const piccolaOMicro = facts.dimensione === 'micro' || facts.dimensione === 'piccola';
  const proroga = facts.atecoDivisione === null ? undefined : PROROGHE_SETTORIALI[facts.atecoDivisione];

  if (piccolaOMicro && proroga !== undefined && proroga.termine.getTime() > termine.getTime()) {
    termine = proroga.termine;
    builder.note(
      `Termine prorogato al ${formatDate(termine)} per le micro e piccole imprese del comparto ` +
        `${proroga.settore} (decreto Milleproroghe).`,
    );
  }

  /*
    La scadenza si decide sugli istanti, non sul segno di un arrotondamento.

    Math.ceil di un valore fra -1 e 0 vale meno zero, e meno zero minore di zero è falso:
    per ventiquattro ore piene dopo la scadenza il prodotto scriveva «Termine fra 0 giorni»
    e la priorità non saliva. Era il giorno in cui la telefonata conta di più.

    I giorni si contano fra due mezzanotti romane — è il numero che il cliente conta sul
    calendario — e non fra due istanti divisi per 86.400.000: fra due mezzanotti separate
    da un cambio d'ora ci sono 23 o 25 ore, e la divisione nuda perderebbe un giorno.
  */
  const scaduto = asOf.getTime() > termine.getTime();
  const giorniAlTermine = Math.round(
    (inizioDellaGiornata(termine).getTime() - inizioDellaGiornata(asOf).getTime()) / 86_400_000,
  );

  const status: CatNatStatus = giaCoperta ? 'adempiente' : scaduto ? 'inadempiente' : 'in-scadenza';

  builder
    .input('Termine di legge', formatDate(termine))
    .input('Copertura in essere', giaCoperta ? 'sì' : 'no')
    .formula('Dimensione impresa → termine di legge, con eventuale proroga settoriale');

  if (status === 'inadempiente') {
    builder.note(
      `⚠ INADEMPIENTE: il termine è scaduto da ${Math.abs(giorniAlTermine)} giorni e non risulta ` +
        'alcuna copertura catastrofale in portafoglio.',
    );
    builder.note(
      baseAssicurabile === null
        ? 'Capitale da assicurare non ancora quantificato: rilevare il valore dei beni indicati dalla norma.'
        : `Capitale da assicurare stimato: ${Money.formatCompact(baseAssicurabile)} sui beni indicati dalla norma.`,
    );
  } else if (status === 'in-scadenza') {
    builder.note(`Obbligo da adempiere entro ${giorniAlTermine} giorni (${formatDate(termine)}).`);
  } else {
    builder.note(
      'Copertura catastrofale risultante in portafoglio: verificarne la conformità ai vincoli di legge.',
    );
  }

  /*
    L'impresa iscritta ma ferma resta obbligata, e l'intermediario deve saperlo prima di
    telefonare. Togliere l'obbligo sarebbe inventare un'esclusione che la norma non
    concede; tacere lo stato la fa sembrare una posizione ordinaria in cima alla coda.
  */
  const statoNonOperativo = STATI_NON_OPERATIVI[facts.statoAttivita];
  if (statoNonOperativo !== undefined) {
    builder.note(
      `L’impresa risulta ${statoNonOperativo}: resta iscritta al registro delle imprese e ` +
        'l’obbligo permane, ma la posizione va verificata prima di trattarla come una lavorazione ' +
        'ordinaria.',
    );
  }

  // Sezione A senza divisione: non si sa se sia agricoltura (esclusa) o pesca (soggetta).
  // Si prosegue come soggetta — è il verso che non espone — ma dichiarandolo.
  builder.noteIf(
    facts.atecoSezione === 'A' && facts.atecoDivisione === null,
    'Attività della sezione ATECO A senza divisione rilevata: l’esclusione delle imprese agricole ' +
      'ex art. 2135 c.c. non è verificabile e l’obbligo è trattato come sussistente. Rilevare il ' +
      'codice ATECO completo per stabilirlo.',
  );

  builder.noteIf(
    baseAssicurabile === null || !Money.isPositive(baseAssicurabile),
    'Base assicurabile non quantificata: rilevare il valore dei beni ex art. 2424 c.c. B-II 1/2/3 ' +
      'prima di procedere alla quotazione.',
  );

  return builder.confidence(facts.atecoSezione === null ? 'bassa' : 'media').value({
    status,
    soggetta: true,
    motivoEsclusione: null,
    termine,
    giorniAlTermine,
    baseAssicurabile,
    beniInclusi: BENI_INCLUSI,
    eventiCoperti: EVENTI_COPERTI,
    vincoliDiProdotto: VINCOLI_DI_PRODOTTO,
    conseguenzeInadempimento: status === 'adempiente' ? [] : conseguenzeInadempimentoPer(facts),
  });
}

/**
 * Divisione ATECO della pesca e dell'acquacoltura.
 *
 * È l'unica divisione della sezione A che il Fondo AGRICAT non copre: l'esclusione
 * dall'obbligo catastrofale riguarda l'attività agricola ex art. 2135 c.c. — coltivazione
 * del fondo, selvicoltura, allevamento — cioè le divisioni 01 e 02.
 */
export const DIVISIONE_PESCA = '03';

/**
 * Gli stati in cui l'impresa non è più in condizione di adempiere in proprio.
 *
 * Prima escludeva la sola 'cessata': fallita, in liquidazione, inattiva e sospesa uscivano
 * soggette e inadempienti, con l'avviso critico e la priorità massima — cioè in cima alla
 * coda di telefonate dell'intermediario.
 *
 * Terminali sono queste due, ed è la stessa coppia che il motore di credito tratta
 * insieme in score.ts. Sulle altre non si inventa un'esclusione che la norma non concede:
 * si dichiara lo stato, qui sotto.
 */
const STATI_TERMINALI: Partial<Readonly<Record<StatoAttivita, string>>> = {
  cessata:
    'impresa cessata: cancellata dal registro delle imprese, non è più tenuta all’iscrizione ex art. 2188 c.c.',
  fallita:
    'impresa in liquidazione giudiziale: con l’apertura della procedura l’imprenditore è spossessato ' +
    'dei beni, che passano nella disponibilità del curatore',
};

/**
 * Gli stati in cui l'impresa è ancora iscritta — l'obbligo permane — ma non sta operando.
 * L'obbligo non si toglie; si dice all'intermediario che cosa ha davanti.
 */
const STATI_NON_OPERATIVI: Partial<Readonly<Record<StatoAttivita, string>>> = {
  'in-liquidazione': 'in liquidazione',
  inattiva: 'inattiva',
  sospesa: 'sospesa',
};

/**
 * Gli enti che non sono imprese tenute all'iscrizione nel registro delle imprese.
 *
 * L'art. 1 c. 101 della L. 213/2023 grava sulle imprese tenute all'iscrizione ex art. 2188
 * c.c.; docs/DOMINIO.md lo dichiara allo stesso modo. valutaEsclusione non leggeva mai la
 * forma giuridica: un comune usciva «soggetto e inadempiente», identico a una S.r.l.
 *
 * 'altro' non è in questo elenco: è il valore dell'ignoto, e l'ignoto non vale esclusione.
 */
const FORME_NON_IMPRENDITORIALI: Partial<Readonly<Record<FormaGiuridica, string>>> = {
  associazione: 'associazione',
  fondazione: 'fondazione',
  'ente-pubblico': 'ente pubblico',
};

function valutaEsclusione(facts: CompanyFacts): string | null {
  /*
    Lo stato per primo, e non è un dettaglio d'ordine.

    Questo controllo stava in fondo, dopo il ramo della sezione A — che ritorna sempre,
    in tutti e tre i suoi esiti. Dentro la sezione A il controllo sullo stato era quindi
    irraggiungibile, e un peschereccio cessato usciva soggetto e inadempiente.
  */
  const terminale = STATI_TERMINALI[facts.statoAttivita];
  if (terminale !== undefined) return terminale;

  const ente = FORME_NON_IMPRENDITORIALI[facts.formaGiuridica];
  if (ente !== undefined) {
    return (
      `ente non imprenditoriale (${ente}): l’obbligo grava sulle imprese tenute all’iscrizione nel ` +
      'registro delle imprese ex art. 2188 c.c.; se l’ente esercita un’attività d’impresa ' +
      'commerciale iscritta l’obbligo sussiste e va verificato in intervista'
    );
  }

  /*
    L'esclusione è dell'attività agricola, non dell'intera sezione A.

    La sezione A comprende le divisioni 01, 02 e 03, e la 03 è la pesca. Escludere la
    sezione intera significava dichiarare **non soggetta a un obbligo di legge** anche
    un peschereccio — mentre nello stesso file la tabella delle proroghe assegna alla
    divisione 03 un termine prorogato al 31 dicembre 2026. Le due affermazioni non
    possono essere vere insieme: un termine non si proroga a chi non è obbligato. E
    infatti quel ramo del codice non era raggiungibile, perché l'esclusione ritornava
    prima: la proroga era scritta, documentata e morta.

    Delle due si è tenuta quella che, sbagliando, costa meno. Su un obbligo di legge
    «non sei obbligato» è il verso che espone il cliente — e l'intermediario che
    gliel'ha detto.
  */
  if (facts.atecoSezione === 'A') {
    // Divisione non rilevata: dentro la sezione A non si distingue l'agricoltura dalla
    // pesca, e l'esclusione non si può accertare. Si prosegue come soggetta, dichiarandolo
    // nella nota qui sotto.
    if (facts.atecoDivisione === null) return null;
    if (facts.atecoDivisione === DIVISIONE_PESCA) return null;
    return 'impresa agricola ex art. 2135 c.c., per la quale opera il Fondo AGRICAT';
  }
  return null;
}

function formatDate(date: Date): string {
  return formattaGiorno(date);
}
