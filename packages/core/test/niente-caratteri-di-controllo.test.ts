import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nessun carattere di controllo nel codice, e in particolare nessun BACKSPACE.
 *
 * ── PERCHÉ ────────────────────────────────────────────────────────────────────
 *
 * Una modifica scritta con uno heredoc di shell passa dall'interprete prima di arrivare sul
 * disco, e `\b` non arriva come due caratteri: arriva come il byte 0x08. Il file continua a
 * compilare, il diff a occhio sembra identico, e una regex come `/\bparola\b/` diventa una
 * regex che cerca due caratteri di controllo — non aggancia mai niente, e non lo dice.
 *
 * È successo mentre si scriveva il collaudo sulla copertura dei campi acquistati: il
 * confine di parola nel rilevatore era diventato un BACKSPACE, il controllo dichiarava «mai
 * letti» ventitré campi che il codice legge riga per riga, e per un quarto d'ora il difetto
 * è sembrato un problema di cache. Costo: nessun dato sbagliato, solo tempo — ma la volta
 * precedente, su un altro progetto, erano trentuno espressioni regolari morte in silenzio.
 *
 * Il rimedio scritto era «si cercano con `tr -cd '\\010' < file | wc -c`, che nessuno pensa
 * a lanciare». Questo collaudo è quel comando, lanciato da solo a ogni esecuzione.
 *
 * ── COSA SI AMMETTE ──────────────────────────────────────────────────────────
 *
 * Tabulazione, ritorno a capo e ritorno carrello: sono formattazione. Tutto il resto sotto
 * lo spazio è un byte che nessuno scrive apposta in un sorgente.
 */

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const ESTENSIONI = ['.ts', '.tsx', '.sql', '.sh', '.mjs', '.cjs'];
const SALTA = new Set(['node_modules', '.git', 'dist', '.next', 'test-results', '.sonda', 'coverage']);

/** Ammessi perché sono formattazione: tabulazione, avanzamento riga, ritorno carrello. */
const AMMESSI = new Set([0x09, 0x0a, 0x0d]);

function sorgenti(cartella: string, raccolti: string[] = []): string[] {
  for (const voce of readdirSync(cartella)) {
    if (SALTA.has(voce)) continue;
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) sorgenti(percorso, raccolti);
    else if (ESTENSIONI.some((e) => percorso.endsWith(e))) raccolti.push(percorso);
  }
  return raccolti;
}

describe('Nessun carattere di controllo è finito nel codice', () => {
  const file = sorgenti(RADICE);

  it('misura su tutto il codice, non su un campione', () => {
    // Se questo numero crolla, il collaudo sta guardando meno di prima e resterebbe verde
    // per assenza di file invece che per assenza di difetti.
    expect(file.length).toBeGreaterThan(200);
  });

  it('nessun BACKSPACE, che è la forma in cui un \\b muore in silenzio', () => {
    const guasti: string[] = [];
    for (const percorso of file) {
      const grezzo = readFileSync(percorso);
      const dove = grezzo.indexOf(0x08);
      if (dove >= 0) {
        const riga = grezzo.subarray(0, dove).toString('utf8').split('\n').length;
        guasti.push(`${percorso.slice(RADICE.length)}:${riga}`);
      }
    }
    expect(
      guasti,
      `byte BACKSPACE (0x08) nel codice: quasi sempre un \\b mangiato da uno heredoc di shell.\n` +
        `Regola 2c: le modifiche al codice si fanno con strumenti di modifica diretta, o con uno\n` +
        `script di patch scritto COME FILE.\n${guasti.join('\n')}`,
    ).toEqual([]);
  });

  it('nessun altro carattere di controllo, a parte la formattazione', () => {
    const guasti: string[] = [];
    for (const percorso of file) {
      const grezzo = readFileSync(percorso);
      for (const byte of grezzo) {
        if (byte < 0x20 && !AMMESSI.has(byte)) {
          guasti.push(`${percorso.slice(RADICE.length)} · byte 0x${byte.toString(16).padStart(2, '0')}`);
          break;
        }
      }
    }
    expect(guasti, `caratteri di controllo nel codice:\n${guasti.join('\n')}`).toEqual([]);
  });
});
