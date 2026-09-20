/**
 * Il CRM: le aziende dello studio, con uno stato commerciale e una nota.
 *
 * Nasce il 17/09/2026 da due richieste di Simone («AEGIS - cambi.pptx»):
 *
 *  - sul Portafoglio: «Questa pagina deve essere un CRM non un tracker assicurativo. Non
 *    abbiamo la maggior parte dei dati per poter dire cosa è coperto e cosa no». Via le
 *    colonne assicurative — CAT NAT, coperture da attivare, esposizione non assicurata,
 *    prossima azione — e al loro posto chi è l'azienda, come la si raggiunge, a che punto è;
 *  - sugli elenchi comprati in Ricerca Clienti: «Questo deve andare nel CRM per sempre non
 *    per 24 ore».
 *
 * Nel CRM ci sono quindi le aziende **analizzate** e quelle degli **elenchi comprati**, anche
 * mai analizzate. Lo stato e la nota sono il lavoro dell'intermediario: non li calcola niente.
 */

import { BOM_CSV, FINE_RIGA_CSV, SEPARATORE_CSV, cellaCsv, dataCsv } from './export.js';
import { componentiDelGiorno } from '../shared/tempo.js';

/** Gli stati, nell'ordine in cui si presentano nel menu: il percorso di un contatto. */
export const STATI_CRM = [
  'da-contattare',
  'contattata',
  'in-trattativa',
  'cliente',
  'non-interessata',
] as const;

export type StatoCrm = (typeof STATI_CRM)[number];

export const ETICHETTE_STATO_CRM: Readonly<Record<StatoCrm, string>> = {
  'da-contattare': 'Da contattare',
  contattata: 'Contattata',
  'in-trattativa': 'In trattativa',
  cliente: 'Cliente',
  'non-interessata': 'Non interessata',
};

export function isStatoCrm(valore: unknown): valore is StatoCrm {
  return typeof valore === 'string' && (STATI_CRM as readonly string[]).includes(valore);
}

/**
 * La priorità di intervento: chi va lavorato prima.
 *
 * Prima le trattative aperte, che si perdono se non si seguono; poi le aziende ancora da
 * contattare, che sono il lavoro nuovo; poi quelle già contattate, in attesa di una risposta.
 * I clienti e chi non è interessato in fondo: non chiedono un'azione oggi.
 *
 * È una convenzione di questo prodotto, dichiarata qui e non dedotta: la pagina la dice.
 */
export const PRIORITA_STATO_CRM: Readonly<Record<StatoCrm, number>> = {
  'in-trattativa': 0,
  'da-contattare': 1,
  contattata: 2,
  cliente: 3,
  'non-interessata': 4,
};

export interface VoceCrm {
  /** La chiave con cui l'archivio conosce l'azienda: la partita IVA. */
  readonly identificativo: string;
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly comune: string | null;
  readonly provincia: string | null;
  readonly atecoDescrizione: string | null;
  /** Dal record camerale dell'ultima analisi; `null` se l'azienda non è mai stata analizzata. */
  readonly telefono: string | null;
  readonly pec: string | null;
  readonly sitoWeb: string | null;
  readonly stato: StatoCrm;
  readonly nota: string | null;
  /** `null` se l'azienda non è stata analizzata, o se il merito non era determinabile. */
  readonly scoreCredito: number | null;
  readonly classeCredito: string | null;
  /**
   * Le tre protezioni dell'ultima analisi, da 1 a 7 (dal 19/09/2026). `null` quando non
   * calcolabili, per le aziende mai analizzate e per le analisi salvate prima di allora.
   */
  readonly propertyRisk: number | null;
  /** Il punteggio fisico della Business Interruption: per il foglio Veezco è il Property Risk. */
  readonly biPunteggio: number | null;
  /** Quanto perde l'azienda in un giorno di fermo, in centesimi. */
  readonly biPerditaGiornalieraCentesimi: number | null;
  readonly cyberRisk: number | null;
  /** Data dell'ultima analisi; `null` per le aziende arrivate solo da un elenco. */
  readonly analizzataIl: Date | null;
  /** Quando è arrivata da un elenco comprato; `null` se non ci è mai arrivata. */
  readonly daElencoIl: Date | null;
  /** Quando l'intermediario ha cambiato stato o nota l'ultima volta. */
  readonly statoAggiornatoIl: Date | null;
  /** Quando l'azienda è entrata nell'archivio dello studio. */
  readonly aggiuntaIl: Date;
}

/** L'ultima cosa successa all'azienda: un'analisi, un elenco, un cambio di stato. */
export function ultimaAttivitaCrm(voce: VoceCrm): Date {
  const date = [voce.aggiuntaIl, voce.analizzataIl, voce.daElencoIl, voce.statoAggiornatoIl]
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return new Date(Math.max(...date));
}

/**
 * Ordine di lavoro: per priorità dello stato, poi dall'attività più recente.
 *
 * A parità di stato, in cima c'è l'azienda toccata per ultima — analizzata, arrivata da un
 * elenco, o aggiornata a mano — perché è quella di cui chi lavora si ricorda.
 */
export function perPrioritaDiIntervento(a: VoceCrm, b: VoceCrm): number {
  const perStato = PRIORITA_STATO_CRM[a.stato] - PRIORITA_STATO_CRM[b.stato];
  if (perStato !== 0) return perStato;
  const perAttivita = ultimaAttivitaCrm(b).getTime() - ultimaAttivitaCrm(a).getTime();
  if (perAttivita !== 0) return perAttivita;
  return a.denominazione.localeCompare(b.denominazione, 'it');
}

/** Il filtro per stato; un valore sconosciuto o assente non filtra nulla. */
export function applicaFiltroCrm<T extends { readonly stato: StatoCrm }>(
  voci: readonly T[],
  filtro: string | undefined | null,
): readonly T[] {
  return isStatoCrm(filtro) ? voci.filter((v) => v.stato === filtro) : voci;
}

/**
 * Le colonne del file: chi è, dove sta, a che punto è, come la si raggiunge, poi i numeri.
 *
 * Nessuna colonna assicurativa: il CRM non dice cosa è coperto, perché non ha i dati per
 * dirlo. Il file del portafoglio assicurativo resta dove stava, per chi lo chiama dall'API.
 */
const COLONNE: readonly { readonly intestazione: string; readonly valore: (v: VoceCrm) => string }[] = [
  { intestazione: 'Denominazione', valore: (v) => v.denominazione },
  { intestazione: 'Partita IVA', valore: (v) => v.partitaIva ?? '' },
  { intestazione: 'Comune', valore: (v) => v.comune ?? '' },
  { intestazione: 'Provincia', valore: (v) => v.provincia ?? '' },
  { intestazione: 'Settore', valore: (v) => v.atecoDescrizione ?? '' },
  { intestazione: 'Stato', valore: (v) => ETICHETTE_STATO_CRM[v.stato] },
  { intestazione: 'Nota', valore: (v) => v.nota ?? '' },
  { intestazione: 'Telefono', valore: (v) => v.telefono ?? '' },
  { intestazione: 'PEC', valore: (v) => v.pec ?? '' },
  { intestazione: 'Sito web', valore: (v) => v.sitoWeb ?? '' },
  // Cella vuota e non «0»: in un foglio di calcolo uno zero entra nelle medie, un vuoto no.
  {
    intestazione: 'Score di credito',
    valore: (v) => (v.scoreCredito === null ? '' : String(v.scoreCredito)),
  },
  { intestazione: 'Classe', valore: (v) => v.classeCredito ?? '' },
  // I punteggi come nella scheda, con la virgola: cella vuota se non calcolabili.
  { intestazione: 'Property Risk', valore: (v) => punteggioCsv(v.propertyRisk, 2) },
  {
    intestazione: 'Business Interruption al giorno',
    valore: (v) =>
      v.biPerditaGiornalieraCentesimi === null
        ? ''
        : (v.biPerditaGiornalieraCentesimi / 100).toFixed(2).replace('.', ','),
  },
  { intestazione: 'Cyber Risk', valore: (v) => punteggioCsv(v.cyberRisk, 1) },
  {
    intestazione: 'Analizzata il',
    valore: (v) => (v.analizzataIl === null ? '' : dataCsv(v.analizzataIl)),
  },
  { intestazione: 'Nel CRM dal', valore: (v) => dataCsv(v.aggiuntaIl) },
  // L'identificativo in coda: non serve a chi legge, serve a riconciliare il file.
  { intestazione: 'Identificativo', valore: (v) => v.identificativo },
];

/** Un punteggio da 1 a 7 con la virgola, come nella scheda; vuoto se non c'è. */
function punteggioCsv(valore: number | null, cifre: number): string {
  return valore === null ? '' : valore.toFixed(cifre).replace('.', ',');
}

/** Lo stesso formato del portafoglio: punto e virgola, BOM, CRLF, celle protette. */
export function esportaCrmCsv(voci: readonly VoceCrm[]): string {
  const intestazione = COLONNE.map((c) => cellaCsv(c.intestazione)).join(SEPARATORE_CSV);
  const righe = voci.map((v) => COLONNE.map((c) => cellaCsv(c.valore(v))).join(SEPARATORE_CSV));
  return BOM_CSV + [intestazione, ...righe].join(FINE_RIGA_CSV) + FINE_RIGA_CSV;
}

/** «crm-2026-09-17.csv», o «crm-in-trattativa-2026-09-17.csv» con un filtro. */
export function nomeFileEsportazioneCrm(quando: Date, filtro?: string | null): string {
  const c = componentiDelGiorno(quando);
  const g = String(c.giorno).padStart(2, '0');
  const m = String(c.mese).padStart(2, '0');
  const parti = ['crm', `${c.anno}-${m}-${g}`];
  if (isStatoCrm(filtro)) parti.splice(1, 0, filtro);
  return `${parti.join('-')}.csv`;
}
