/**
 * Identificativi italiani con validazione reale del carattere di controllo.
 *
 * Il tipo branded impedisce di passare una stringa qualsiasi dove il dominio si aspetta
 * una partita IVA: se il valore è nel tipo, il check digit è già stato verificato.
 * Un errore di digitazione su una P.IVA costa una chiamata a pagamento al provider
 * e, peggio, un'analisi fatta sull'azienda sbagliata.
 */

declare const PartitaIvaBrand: unique symbol;
declare const CodiceFiscaleBrand: unique symbol;
declare const AtecoBrand: unique symbol;

export type PartitaIva = string & { readonly [PartitaIvaBrand]: true };
export type CodiceFiscale = string & { readonly [CodiceFiscaleBrand]: true };
export type AtecoCode = string & { readonly [AtecoBrand]: true };

// ─────────────────────────────────────────────────────────────────────────────
// Partita IVA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica il check digit della partita IVA italiana (11 cifre).
 * Algoritmo: DM 23/12/1976 — cifre di posizione pari (1-based) raddoppiate,
 * riduzione modulo 9, complemento a 10 sull'ultima cifra.
 */
export function isValidPartitaIva(input: string): boolean {
  const digits = normalizeVatDigits(input);
  if (digits === null) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = digits.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      sum += d;
    } else {
      const doubled = d * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === digits.charCodeAt(10) - 48;
}

/** Rimuove prefisso `IT`, spazi e punti; restituisce 11 cifre o `null`. */
function normalizeVatDigits(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/^IT/, '')
    .replace(/[\s.-]/g, '');
  return /^\d{11}$/.test(cleaned) ? cleaned : null;
}

/** Costruisce una `PartitaIva` validata. Lancia se non valida. */
export function partitaIva(input: string): PartitaIva {
  const parsed = parsePartitaIva(input);
  if (parsed === null) {
    throw new TypeError(`Partita IVA non valida: "${input}"`);
  }
  return parsed;
}

/** Variante non lanciante: `null` se non valida. */
export function parsePartitaIva(input: string): PartitaIva | null {
  const digits = normalizeVatDigits(input);
  if (digits === null || !isValidPartitaIva(digits)) return null;
  return digits as PartitaIva;
}

// ─────────────────────────────────────────────────────────────────────────────
// Codice fiscale
// ─────────────────────────────────────────────────────────────────────────────

const CF_ODD: Readonly<Record<string, number>> = {
  '0': 1,
  '1': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 13,
  '6': 15,
  '7': 17,
  '8': 19,
  '9': 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

const CF_EVEN: Readonly<Record<string, number>> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  H: 7,
  I: 8,
  J: 9,
  K: 10,
  L: 11,
  M: 12,
  N: 13,
  O: 14,
  P: 15,
  Q: 16,
  R: 17,
  S: 18,
  T: 19,
  U: 20,
  V: 21,
  W: 22,
  X: 23,
  Y: 24,
  Z: 25,
};

const CF_REMAINDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Valida un codice fiscale.
 * Accetta sia la forma a 16 caratteri (persona fisica, con carattere di controllo verificato)
 * sia la forma a 11 cifre (soggetto diverso da persona fisica, che coincide con la partita IVA).
 */
export function isValidCodiceFiscale(input: string): boolean {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, '');

  if (/^\d{11}$/.test(cleaned)) return isValidPartitaIva(cleaned);
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cleaned[i]!;
    // Posizione 1-based: i pari (0-indexed) sono le posizioni dispari.
    const table = i % 2 === 0 ? CF_ODD : CF_EVEN;
    const value = table[ch];
    if (value === undefined) return false;
    sum += value;
  }
  return CF_REMAINDER[sum % 26] === cleaned[15];
}

export function parseCodiceFiscale(input: string): CodiceFiscale | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, '');
  return isValidCodiceFiscale(cleaned) ? (cleaned as CodiceFiscale) : null;
}

export function codiceFiscale(input: string): CodiceFiscale {
  const parsed = parseCodiceFiscale(input);
  if (parsed === null) {
    throw new TypeError(`Codice fiscale non valido: "${input}"`);
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATECO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizza un codice ATECO in forma canonica puntata (`62.01.00`).
 * Regge sia ATECO 2007 sia ATECO 2025, e sia l'input puntato sia quello compatto.
 */
export function parseAteco(input: string): AtecoCode | null {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (compact.length < 2 || compact.length > 7) return null;
  if (!/^\d{2}/.test(compact)) return null;

  const parts: string[] = [compact.slice(0, 2)];
  let rest = compact.slice(2);
  while (rest.length > 0) {
    parts.push(rest.slice(0, 2));
    rest = rest.slice(2);
  }
  return parts.join('.') as AtecoCode;
}

export function ateco(input: string): AtecoCode {
  const parsed = parseAteco(input);
  if (parsed === null) {
    throw new TypeError(`Codice ATECO non valido: "${input}"`);
  }
  return parsed;
}

/** Divisione ATECO: le prime due cifre (`62.01.00` → `62`). */
export function atecoDivision(code: AtecoCode): string {
  return code.slice(0, 2);
}

/** Gruppo ATECO: prime due cifre + primo livello (`62.01.00` → `62.0`). */
export function atecoGroup(code: AtecoCode): string {
  return code.length >= 4 ? code.slice(0, 4) : code;
}

/** Sezione ATECO (A–U) derivata dalla divisione. */
export function atecoSection(code: AtecoCode): string {
  const division = Number.parseInt(atecoDivision(code), 10);
  if (Number.isNaN(division)) return '?';
  if (division <= 3) return 'A'; // agricoltura, silvicoltura, pesca
  if (division <= 9) return 'B'; // estrazione
  if (division <= 33) return 'C'; // manifatturiero
  if (division === 35) return 'D'; // energia
  if (division <= 39) return 'E'; // acqua, rifiuti
  if (division <= 43) return 'F'; // costruzioni
  if (division <= 47) return 'G'; // commercio
  if (division <= 53) return 'H'; // trasporto e magazzinaggio
  if (division <= 56) return 'I'; // alloggio e ristorazione
  if (division <= 63) return 'J'; // informazione e comunicazione
  if (division <= 66) return 'K'; // attività finanziarie e assicurative
  if (division === 68) return 'L'; // immobiliare
  if (division <= 75) return 'M'; // professionali, scientifiche, tecniche
  if (division <= 82) return 'N'; // noleggio, agenzie di viaggio, servizi alle imprese
  if (division === 84) return 'O'; // amministrazione pubblica
  if (division === 85) return 'P'; // istruzione
  if (division <= 88) return 'Q'; // sanità e assistenza sociale
  if (division <= 93) return 'R'; // arte, sport, intrattenimento
  if (division <= 96) return 'S'; // altri servizi
  if (division <= 98) return 'T'; // famiglie datori di lavoro
  return 'U'; // organizzazioni extraterritoriali
}

/** Verifica se un codice appartiene a un prefisso (`62.01.00` ⊂ `62`, `62.0`, `62.01`). */
export function atecoStartsWith(code: AtecoCode, prefix: string): boolean {
  const normalizedPrefix = prefix.trim();
  return code === normalizedPrefix || code.startsWith(`${normalizedPrefix}.`);
}
