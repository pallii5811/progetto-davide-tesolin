/**
 * Presa in carico di un portafoglio esistente.
 *
 * È il primo momento in cui un intermediario incontra davvero la piattaforma: ha
 * quattrocento clienti in un foglio di calcolo e nessuna intenzione di digitarli uno a uno.
 * Se questo passaggio non funziona, tutto il resto non arriva mai in mano a nessuno.
 *
 * Il file che arriva **non è pulito**, e non ha senso pretenderlo: esportazioni da
 * gestionali diversi, separatori diversi, intestazioni scritte come capita, partite IVA a
 * cui Excel ha mangiato gli zeri iniziali. Il modulo accetta ciò che può accettare, e per
 * il resto dice riga per riga cosa non va — invece di rifiutare l'intero file per un
 * refuso alla riga 213.
 */

import { isValidPartitaIva, parsePartitaIva } from '../shared/identifiers.js';
import type { PartitaIva } from '../shared/identifiers.js';

export interface RigaImportata {
  /** Numero di riga nel file originale, intestazione compresa: serve a chi deve correggere. */
  readonly riga: number;
  readonly partitaIva: PartitaIva;
  /** Denominazione dichiarata dall'intermediario. Il provider fornirà quella ufficiale. */
  readonly denominazione: string | null;
  readonly riferimentoInterno: string | null;
}

export interface RigaScartata {
  readonly riga: number;
  readonly contenuto: string;
  readonly motivo: string;
}

export interface EsitoLettura {
  readonly righe: readonly RigaImportata[];
  readonly scartate: readonly RigaScartata[];
  /** Duplicati interni al file: si tengono una volta sola, ma vanno dichiarati. */
  readonly duplicati: number;
  readonly separatore: string;
  readonly intestazioneRiconosciuta: boolean;
}

/**
 * Intestazioni riconosciute, in minuscolo e senza accenti.
 *
 * Ogni gestionale la scrive a modo suo. Riconoscerne una manciata costa poche righe e
 * risparmia all'intermediario di dover riformattare un'esportazione.
 */
const INTESTAZIONI_PIVA = [
  'partita iva',
  'partitaiva',
  'p.iva',
  'piva',
  'p iva',
  'vat',
  'codice fiscale',
  'codicefiscale',
  'cf',
];
const INTESTAZIONI_DENOMINAZIONE = [
  'denominazione',
  'ragione sociale',
  'ragionesociale',
  'nome',
  'cliente',
  'azienda',
];
const INTESTAZIONI_RIFERIMENTO = ['riferimento', 'codice', 'codice cliente', 'rif', 'id'];

export function leggiPortafoglioCsv(contenuto: string): EsitoLettura {
  // Il BOM che Excel antepone ai file UTF-8 finirebbe dentro la prima intestazione,
  // rendendola irriconoscibile per un carattere invisibile. Scritto per punto di codice:
  // nel sorgente, letteralmente, sarebbe altrettanto invisibile.
  const testo = contenuto.replace(/^\uFEFF/, '');
  const righeGrezze = testo.split(/\r?\n/);

  const separatore = individuaSeparatore(righeGrezze);
  const celle = righeGrezze.map((r) => dividi(r, separatore));

  const { indici, intestazioneRiconosciuta } = individuaColonne(celle[0] ?? []);

  const righe: RigaImportata[] = [];
  const scartate: RigaScartata[] = [];
  const viste = new Set<string>();
  let duplicati = 0;

  for (let i = intestazioneRiconosciuta ? 1 : 0; i < celle.length; i++) {
    const campi = celle[i] ?? [];
    const numeroRiga = i + 1;

    if (campi.every((c) => c.trim() === '')) continue;

    const grezza = indici.partitaIva === null ? (campi[0] ?? '') : (campi[indici.partitaIva] ?? '');
    const partitaIva = interpretaPartitaIva(grezza);

    if (partitaIva === null) {
      scartate.push({
        riga: numeroRiga,
        contenuto: righeGrezze[i] ?? '',
        motivo: motivoScarto(grezza),
      });
      continue;
    }

    if (viste.has(partitaIva)) {
      duplicati++;
      continue;
    }
    viste.add(partitaIva);

    righe.push({
      riga: numeroRiga,
      partitaIva,
      denominazione: valoreOppureNull(indici.denominazione, campi),
      riferimentoInterno: valoreOppureNull(indici.riferimento, campi),
    });
  }

  return { righe, scartate, duplicati, separatore, intestazioneRiconosciuta };
}

/**
 * Interpreta una partita IVA proveniente da un foglio di calcolo.
 *
 * Il caso che rende inservibile metà delle esportazioni: **Excel tratta la partita IVA come
 * un numero e ne perde gli zeri iniziali**. `01234567890` diventa `1234567890`, dieci cifre.
 * Rifiutarla sarebbe formalmente corretto e praticamente inutile — quella partita IVA è
 * valida, le manca solo uno zero che nessun essere umano ha tolto di proposito.
 *
 * Si reintegra fino a undici cifre e si verifica il carattere di controllo: se torna, il
 * numero è quello. Se non torna, si scarta — non si tira a indovinare su un identificativo.
 */
export function interpretaPartitaIva(grezza: string): PartitaIva | null {
  const diretta = parsePartitaIva(grezza);
  if (diretta !== null) return diretta;

  const soleCifre = grezza
    .trim()
    .toUpperCase()
    .replace(/^IT/, '')
    .replace(/[\s.\-']/g, '');
  if (!/^\d{1,11}$/.test(soleCifre)) return null;

  const reintegrata = soleCifre.padStart(11, '0');
  return isValidPartitaIva(reintegrata) ? parsePartitaIva(reintegrata) : null;
}

function motivoScarto(grezza: string): string {
  const pulita = grezza.trim();
  if (pulita === '') return 'Partita IVA assente';

  const soleCifre = pulita
    .toUpperCase()
    .replace(/^IT/, '')
    .replace(/[\s.\-']/g, '');
  if (!/^\d+$/.test(soleCifre)) return 'Non è una partita IVA: contiene caratteri non numerici';
  if (soleCifre.length > 11) return `Troppe cifre (${soleCifre.length}): una partita IVA ne ha undici`;
  return 'Carattere di controllo non valido: verificare il numero';
}

/**
 * Separatore del file, dedotto dal contenuto.
 *
 * In Italia Excel esporta con il punto e virgola, perché la virgola è il separatore
 * decimale. Un lettore che assume la virgola legge ogni riga come un campo solo e
 * dichiara il file illeggibile — cosa che l'intermediario non ha modo di capire.
 */
function individuaSeparatore(righe: readonly string[]): string {
  const campione = righe.filter((r) => r.trim() !== '').slice(0, 5);
  if (campione.length === 0) return ';';

  const candidati = [';', ',', '\t', '|'];
  let migliore = ';';
  let massimo = 0;

  for (const candidato of candidati) {
    const conteggi = campione.map((r) => dividi(r, candidato).length);
    const minimo = Math.min(...conteggi);
    // Vince il separatore che produce più colonne **in tutte** le righe: uno che funziona
    // solo su alcune sta comparendo dentro i valori, non fra i campi.
    if (minimo > massimo) {
      massimo = minimo;
      migliore = candidato;
    }
  }

  return migliore;
}

/** Divisione rispettosa delle virgolette: una denominazione può contenere il separatore. */
function dividi(riga: string, separatore: string): string[] {
  const campi: string[] = [];
  let corrente = '';
  let dentroVirgolette = false;

  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];

    if (c === '"') {
      // Doppie virgolette dentro un campo quotato significano una virgoletta letterale.
      if (dentroVirgolette && riga[i + 1] === '"') {
        corrente += '"';
        i++;
      } else {
        dentroVirgolette = !dentroVirgolette;
      }
      continue;
    }

    if (c === separatore && !dentroVirgolette) {
      campi.push(corrente);
      corrente = '';
      continue;
    }

    corrente += c;
  }

  campi.push(corrente);
  return campi;
}

interface IndiciColonne {
  partitaIva: number | null;
  denominazione: number | null;
  riferimento: number | null;
}

function individuaColonne(intestazione: readonly string[]): {
  indici: IndiciColonne;
  intestazioneRiconosciuta: boolean;
} {
  const normalizzate = intestazione.map((c) => c.trim().toLowerCase().replace(/["']/g, ''));

  const trova = (candidati: readonly string[]): number | null => {
    const posizione = normalizzate.findIndex((c) => candidati.includes(c));
    return posizione === -1 ? null : posizione;
  };

  const partitaIva = trova(INTESTAZIONI_PIVA);

  // Senza un'intestazione riconoscibile si assume che la prima colonna sia la partita IVA
  // e che la prima riga sia già un dato: un file di sole partite IVA è perfettamente
  // legittimo, ed è anzi il caso più frequente.
  if (partitaIva === null) {
    return {
      indici: { partitaIva: null, denominazione: null, riferimento: null },
      intestazioneRiconosciuta: false,
    };
  }

  return {
    indici: {
      partitaIva,
      denominazione: trova(INTESTAZIONI_DENOMINAZIONE),
      riferimento: trova(INTESTAZIONI_RIFERIMENTO),
    },
    intestazioneRiconosciuta: true,
  };
}

function valoreOppureNull(indice: number | null, campi: readonly string[]): string | null {
  if (indice === null) return null;
  const valore = (campi[indice] ?? '').trim();
  return valore === '' ? null : valore;
}
