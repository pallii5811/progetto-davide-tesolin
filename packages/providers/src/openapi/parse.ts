/**
 * Lettura difensiva delle risposte del provider.
 *
 * Le risposte di un provider esterno non sono un contratto: cambiano nomi di campo,
 * restituiscono stringhe dove ci si aspetta numeri, e a volte semplicemente omettono.
 * Qui si accetta `unknown` e si estrae ciò che serve provando più alias, senza mai
 * lanciare: un campo mancante diventa `null` e il modello canonico lo tratta come
 * «non lo so», che è la verità.
 *
 * L'alternativa — validazione rigida con schema — farebbe fallire l'intera analisi
 * perché il provider ha rinominato un campo secondario. Inaccettabile in produzione.
 */

import { euro, parseAteco, parseCodiceFiscale, parsePartitaIva } from '@aegis/core';
import type { AtecoCode, CodiceFiscale, Money, PartitaIva } from '@aegis/core';

export type Json = Record<string, unknown>;

export function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Primo alias valorizzato fra quelli indicati. Il provider cambia nomi: noi li accettiamo tutti. */
export function pick(source: unknown, ...keys: readonly string[]): unknown {
  const record = asRecord(source);
  if (record === null) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function str(source: unknown, ...keys: readonly string[]): string | null {
  const value = pick(source, ...keys);
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

export function num(source: unknown, ...keys: readonly string[]): number | null {
  const value = pick(source, ...keys);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    // Il provider può restituire "1.234.567,89" oppure "1234567.89".
    const normalizzato = value.includes(',')
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/\s/g, '');
    const parsed = Number.parseFloat(normalizzato);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Importo monetario. Assume euro (non centesimi) come unità del provider. */
export function money(source: unknown, ...keys: readonly string[]): Money | null {
  const value = num(source, ...keys);
  return value === null ? null : euro(value);
}

/** Importo monetario con default a zero: per le voci di bilancio, dove l'assenza vale zero. */
export function moneyOrZero(source: unknown, ...keys: readonly string[]): Money {
  return money(source, ...keys) ?? euro(0);
}

export function bool(source: unknown, ...keys: readonly string[]): boolean | null {
  const value = pick(source, ...keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalizzato = value.trim().toLowerCase();
    if (['true', 'si', 'sì', 's', 'y', 'yes', '1'].includes(normalizzato)) return true;
    if (['false', 'no', 'n', '0'].includes(normalizzato)) return false;
  }
  return null;
}

export function date(source: unknown, ...keys: readonly string[]): Date | null {
  const value = pick(source, ...keys);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return null;

  const testo = value.trim();

  // Formato italiano gg/mm/aaaa: `new Date()` lo interpreterebbe come mm/gg/aaaa.
  const italiano = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(testo);
  if (italiano !== null) {
    // Il regex accetta anche 99/99/9999: senza questa verifica una data impossibile
    // uscirebbe come `Invalid Date` e avvelenerebbe ogni calcolo di obsolescenza
    // a valle — età del bilancio, decadimento dei protesti, scadenze CAT NAT.
    return validaOppureNull(new Date(`${italiano[3]}-${italiano[2]}-${italiano[1]}T00:00:00Z`));
  }

  return validaOppureNull(new Date(testo));
}

function validaOppureNull(data: Date): Date | null {
  return Number.isNaN(data.getTime()) ? null : data;
}

export function partitaIvaOf(source: unknown, ...keys: readonly string[]): PartitaIva | null {
  const value = str(source, ...keys);
  return value === null ? null : parsePartitaIva(value);
}

export function codiceFiscaleOf(source: unknown, ...keys: readonly string[]): CodiceFiscale | null {
  const value = str(source, ...keys);
  return value === null ? null : parseCodiceFiscale(value);
}

export function atecoOf(source: unknown, ...keys: readonly string[]): AtecoCode | null {
  const value = str(source, ...keys);
  return value === null ? null : parseAteco(value);
}

/** Percentuale: accetta sia `0,42` sia `42`. */
export function percent(source: unknown, ...keys: readonly string[]): number | null {
  const value = num(source, ...keys);
  if (value === null) return null;
  return value > 1 ? value / 100 : value;
}
