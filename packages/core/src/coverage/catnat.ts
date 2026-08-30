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
import type { CompanySize } from '../company/size.js';
import { formattaGiorno } from '../shared/tempo.js';

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
 * Scadenze per classe dimensionale.
 * Tabella volutamente isolata e datata: la materia è stata oggetto di proroghe ripetute
 * e va aggiornata qui, in un punto solo.
 *
 * Ultimo allineamento: agosto 2026.
 */
export const TERMINI_CATNAT: Readonly<Record<CompanySize, Date>> = {
  grande: new Date('2025-03-31T23:59:59Z'),
  media: new Date('2025-10-01T23:59:59Z'),
  piccola: new Date('2026-01-01T23:59:59Z'),
  micro: new Date('2026-01-01T23:59:59Z'),
};

/**
 * Proroghe settoriali per micro e piccole imprese (Milleproroghe).
 * Chiave: divisione ATECO. Valore: termine prorogato.
 */
export const PROROGHE_SETTORIALI: Readonly<
  Record<string, { readonly termine: Date; readonly settore: string }>
> = {
  '03': { termine: new Date('2026-12-31T23:59:59Z'), settore: 'pesca e acquacoltura' },
  '55': { termine: new Date('2026-03-31T23:59:59Z'), settore: 'alloggio e strutture turistico-ricettive' },
  '56': { termine: new Date('2026-03-31T23:59:59Z'), settore: 'somministrazione di alimenti e bevande' },
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

export const CONSEGUENZE_INADEMPIMENTO: readonly string[] = [
  'L’inadempimento è considerato nell’assegnazione di contributi, sovvenzioni e agevolazioni ' +
    'di carattere finanziario a valere su risorse pubbliche.',
  'In caso di evento calamitoso, nessun accesso ai sostegni statali straordinari: la ricostruzione ' +
    'resta interamente a carico dell’impresa.',
  'Possibile rilievo nella valutazione degli adeguati assetti organizzativi ex art. 2086 c.c. ' +
    'in capo all’organo amministrativo.',
];

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

  const giorniAlTermine = Math.ceil((termine.getTime() - asOf.getTime()) / 86_400_000);
  const scaduto = giorniAlTermine < 0;

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
    conseguenzeInadempimento: status === 'adempiente' ? [] : CONSEGUENZE_INADEMPIMENTO,
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

function valutaEsclusione(facts: CompanyFacts): string | null {
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
  if (facts.statoAttivita === 'cessata') {
    return 'impresa cessata';
  }
  return null;
}

function formatDate(date: Date): string {
  return formattaGiorno(date);
}
