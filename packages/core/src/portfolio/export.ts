/**
 * Esportazione del portafoglio in CSV.
 *
 * È il gesto opposto alla presa in carico, e ha lo stesso scopo pratico: il broker non
 * lavora solo dentro la piattaforma. Porta la lista in riunione, la manda al collega che
 * fa le telefonate, la incrocia col proprio gestionale. Una piattaforma da cui i dati non
 * escono è una piattaforma di cui non ci si fida — ed è l'unica voce del report Creditsafe
 * che era rimasta segnata «da fare» senza una ragione tecnica.
 *
 * ## Il file è per Excel italiano, e questo detta ogni scelta
 *
 * Non è pedanteria: un file che si apre storto viene richiuso, e la funzione conta come
 * non fatta.
 *
 *  - **Separatore `;`**. In Italia la virgola separa i decimali, ed è quello che Excel si
 *    aspetta. Con la virgola come separatore ogni importo spaccherebbe la riga in due.
 *  - **BOM in testa**. Senza, Excel legge l'UTF-8 come ANSI e ogni accento diventa
 *    `Ã¨`: su un elenco di ragioni sociali italiane si nota alla prima riga.
 *  - **Fine riga CRLF**, come vuole lo standard CSV e come Excel preferisce.
 *  - **Decimali con la virgola**, altrimenti gli importi restano testo e non si sommano.
 *  - **Date in forma italiana**, che Excel riconosce come date invece che come stringhe.
 *
 * ## Le partite IVA e gli zeri iniziali
 *
 * Excel tratta `00743110157` come un numero e ne mangia gli zeri. È lo stesso guasto che
 * la presa in carico corregge in entrata, e qui non si può impedire: dipende da come Excel
 * apre il file, non da come il file è scritto.
 *
 * Restano quindi due certezze da dichiarare: il campo esce **completo e fra virgolette**,
 * quindi ogni lettore rispettoso dello standard lo legge intero; e se il file torna qui
 * dopo un passaggio da Excel, `leggiCsvPortafoglio` gli rimette gli zeri contando le cifre
 * e verificando il carattere di controllo. Il giro completo è sicuro per costruzione.
 */

import { componentiDelGiorno } from '../shared/tempo.js';

/**
 * I filtri del portafoglio, in un posto solo.
 *
 * Vivevano nella pagina, ed erano l'unico posto dove esistevano. Nel momento in cui
 * l'elenco si può anche **esportare**, la stessa regola serve in due punti: se le due
 * copie divergono, il broker scarica una lista diversa da quella che sta guardando — e se
 * ne accorge davanti al cliente, non prima.
 *
 * Il tipo richiede solo i due campi su cui si filtra, così serve tanto al modello di
 * dominio quanto al DTO dell'interfaccia senza costringerli a coincidere.
 */
export interface FiltrabilePortafoglio {
  readonly catNatConforme: boolean;
  readonly coperturaAssente: number;
}

export const FILTRI_PORTAFOGLIO = {
  /** Non conformi all'obbligo di legge sulle calamità naturali: si lavorano per prime. */
  catnat: (v: FiltrabilePortafoglio) => !v.catNatConforme,
  /** Con almeno una garanzia del tutto assente. */
  scoperte: (v: FiltrabilePortafoglio) => v.coperturaAssente > 0,
} as const;

export type FiltroPortafoglio = keyof typeof FILTRI_PORTAFOGLIO;

export function isFiltroPortafoglio(valore: unknown): valore is FiltroPortafoglio {
  return typeof valore === 'string' && valore in FILTRI_PORTAFOGLIO;
}

/** Applica un filtro noto; un valore sconosciuto o assente non filtra nulla. */
export function applicaFiltroPortafoglio<T extends FiltrabilePortafoglio>(
  voci: readonly T[],
  filtro: string | undefined,
): readonly T[] {
  return isFiltroPortafoglio(filtro) ? voci.filter(FILTRI_PORTAFOGLIO[filtro]) : voci;
}

export interface VoceEsportabile {
  readonly identificativo: string;
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly provincia: string | null;
  readonly atecoDescrizione: string | null;
  readonly scoreCredito: number | null;
  readonly classeCredito: string;
  readonly statoCatNat: string;
  readonly catNatConforme: boolean;
  readonly coperturaAssente: number;
  readonly coperturaDaQuantificare: number;
  readonly rischiCritici: number;
  readonly esposizioneNonAssicurataCentesimi: number;
  readonly completezza: number;
  readonly azionePrioritaria: string | null;
  readonly analizzataIl: Date;
}

const SEPARATORE = ';';
const FINE_RIGA = '\r\n';
const BOM = '﻿';

/**
 * Le colonne, nell'ordine in cui servono a chi lavora la lista.
 *
 * Prima chi è e dove, poi **cosa fare** — l'azione prioritaria e le coperture mancanti —
 * e solo dopo i numeri di supporto. Un elenco che comincia dai punteggi si guarda; uno che
 * comincia dall'azione si lavora.
 */
const COLONNE: readonly {
  readonly intestazione: string;
  readonly valore: (v: VoceEsportabile) => string;
}[] = [
  { intestazione: 'Denominazione', valore: (v) => v.denominazione },
  { intestazione: 'Partita IVA', valore: (v) => v.partitaIva ?? '' },
  { intestazione: 'Provincia', valore: (v) => v.provincia ?? '' },
  { intestazione: 'Settore', valore: (v) => v.atecoDescrizione ?? '' },
  { intestazione: 'Azione prioritaria', valore: (v) => v.azionePrioritaria ?? '' },
  {
    /*
      «DA SANARE (inadempiente)» era un'inadempienza a un obbligo di legge scritta accanto
      al nome di un cliente, in un file che esce dalla piattaforma e finisce in una casella
      di posta, in un foglio condiviso, in mano a chi capita.

      La piattaforma quell'inadempienza non l'ha accertata: sa soltanto che fra le
      coperture che conosce non ce n'è una catastrofale, e le coperture le conosce solo se
      qualcuno gliele ha censite. La stessa frase era già stata corretta a schermo; qui era
      rimasta, ed è il posto in cui pesa di più, perché un file lo si rilegge fuori
      contesto e senza l'avviso che lo accompagnava.
    */
    intestazione: 'Obbligo CAT NAT',
    valore: (v) => (v.catNatConforme ? 'conforme' : 'copertura non censita — da verificare'),
  },
  { intestazione: 'Coperture da attivare', valore: (v) => String(v.coperturaAssente) },
  {
    /*
      Una colonna a sé, e non sommata alla precedente.

      Una copertura il cui capitale non è determinabile non è una copertura adeguata né una
      assente: è un'esposizione **ignota**, e le due cose portano a decisioni opposte.
      Confonderle in un totale farebbe sparire dalla lista proprio le posizioni da chiarire
      per prime.
    */
    intestazione: 'Coperture da quantificare',
    valore: (v) => String(v.coperturaDaQuantificare),
  },
  {
    intestazione: 'Esposizione non assicurata (EUR)',
    valore: (v) => importo(v.esposizioneNonAssicurataCentesimi),
  },
  { intestazione: 'Rischi critici', valore: (v) => String(v.rischiCritici) },
  {
    intestazione: 'Score di credito',
    // Cella VUOTA, non «0» e non «null». Questo file si apre in un foglio di calcolo, dove
    // una cella vuota resta fuori dalle medie e dagli ordinamenti mentre uno zero ci entra
    // e li falsa. E `String(null)` scriverebbe la parola «null» accanto al nome di
    // un'impresa vera, in un documento che l'intermediario gira al cliente.
    valore: (v) => (v.scoreCredito === null ? '' : String(v.scoreCredito)),
  },
  { intestazione: 'Classe', valore: (v) => v.classeCredito },
  { intestazione: 'Completezza intervista', valore: (v) => percentuale(v.completezza) },
  { intestazione: 'Analizzata il', valore: (v) => data(v.analizzataIl) },
  /*
    L'identificativo interno resta in coda: non serve a chi legge, serve a far tornare
    indietro il file. Senza, un elenco modificato fuori non si può riconciliare.
  */
  { intestazione: 'Identificativo', valore: (v) => v.identificativo },
];

/** Importo in euro con la virgola decimale: senza, Excel lo tiene come testo. */
function importo(centesimi: number): string {
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

function percentuale(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function data(quando: Date): string {
  const c = componentiDelGiorno(quando);
  const g = String(c.giorno).padStart(2, '0');
  const m = String(c.mese).padStart(2, '0');
  return `${g}/${m}/${c.anno}`;
}

/**
 * Una cella, protetta.
 *
 * Si virgoletta **sempre**: una denominazione può contenere un punto e virgola, una
 * virgoletta o un a capo, e la riga si spezzerebbe in silenzio. Le virgolette interne si
 * raddoppiano, come vuole lo standard.
 *
 * Una precauzione in più: una cella che comincia con `=`, `+`, `-` o `@` viene
 * interpretata da Excel come **formula**. In un file che nasce da denominazioni caricate
 * da terzi, è la strada con cui un foglio di calcolo esegue qualcosa che nessuno ha
 * scritto — quindi si antepone un apostrofo, che Excel legge come «questo è testo».
 */
function cella(valore: string): string {
  const pulito = /^[=+\-@]/.test(valore) ? `'${valore}` : valore;
  return `"${pulito.replace(/"/g, '""')}"`;
}

export function esportaPortafoglioCsv(voci: readonly VoceEsportabile[]): string {
  const intestazione = COLONNE.map((c) => cella(c.intestazione)).join(SEPARATORE);
  const righe = voci.map((v) => COLONNE.map((c) => cella(c.valore(v))).join(SEPARATORE));
  return BOM + [intestazione, ...righe].join(FINE_RIGA) + FINE_RIGA;
}

/**
 * Nome del file, con la data: chi ne salva tre in una cartella deve poterli distinguere.
 *
 * Nessun carattere che Windows rifiuti nei nomi di file, e nessuno spazio: un allegato
 * che il destinatario non riesce a salvare vanifica l'esportazione.
 */
export function nomeFileEsportazione(quando: Date, filtro?: string): string {
  const c = componentiDelGiorno(quando);
  const g = String(c.giorno).padStart(2, '0');
  const m = String(c.mese).padStart(2, '0');
  const parti = ['portafoglio', `${c.anno}-${m}-${g}`];
  if (filtro !== undefined && filtro !== '') parti.splice(1, 0, filtro.replace(/[^a-z0-9]/gi, ''));
  return `${parti.join('-')}.csv`;
}
