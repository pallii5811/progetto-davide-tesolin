/**
 * Estrae i nomi di campo che i mappatori leggono davvero.
 *
 * Scandisce le chiamate ai lettori (`str`, `num`, `pick`, …) bilanciando le parentesi:
 * un'espressione regolare non regge gli argomenti annidati e distribuiti su più righe, e
 * infatti ne trovava una frazione — dando l'impressione rassicurante e falsa che il
 * prodotto leggesse pochissimo.
 *
 * Serve a due cose che devono restare coerenti: generare l'elenco dei campi noti per la
 * sorveglianza a runtime, e verificarne l'allineamento in un collaudo. Per questo è un
 * modulo con una funzione esportata e non uno script: due estrattori diversi
 * divergerebbero, e il collaudo passerebbe misurando qualcos'altro.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** I lettori del livello provider: ricevono l'oggetto grezzo e i nomi di campo da cercare. */
const LETTORI = [
  'str',
  'num',
  'money',
  'moneyOrZero',
  'bool',
  'date',
  'pick',
  'asArray',
  'percent',
  'atecoOf',
  'partitaIvaOf',
];

/** I file che descrivono la sorveglianza stessa non sono mappatori: escluderli. */
function daEscludere(percorso) {
  return percorso.includes('sorveglianza-campi') || percorso.includes('campi-noti');
}

function sorgenti(dir, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) sorgenti(p, acc);
    else if (p.endsWith('.ts') && !daEscludere(p)) acc.push(p);
  }
  return acc;
}

/** Gli argomenti di una chiamata, delimitati bilanciando le parentesi. */
function argomentiDellaChiamata(codice, inizio, lunghezzaNome) {
  let livello = 0;
  for (let j = inizio + lunghezzaNome; j < codice.length; j += 1) {
    if (codice[j] === '(') livello += 1;
    else if (codice[j] === ')') {
      livello -= 1;
      if (livello === 0) return codice.slice(inizio + lunghezzaNome + 1, j);
    }
  }
  return '';
}

export function estraiCampi(dir) {
  const nomi = new Set();

  for (const file of sorgenti(dir)) {
    const codice = readFileSync(file, 'utf8');

    for (const lettore of LETTORI) {
      let da = 0;
      for (;;) {
        const i = codice.indexOf(`${lettore}(`, da);
        if (i === -1) break;
        da = i + 1;

        // Dev'essere una chiamata, non la coda di un identificatore più lungo:
        // `moneyOrZero(` contiene `money(` solo per chi non guarda il carattere prima.
        const precedente = i === 0 ? ' ' : codice[i - 1];
        if (/[A-Za-z0-9_$.]/.test(precedente)) continue;

        const argomenti = argomentiDellaChiamata(codice, i, lettore.length);
        // Lo spazio finale è ammesso: il fornitore ha davvero una chiave che lo contiene.
        for (const s of argomenti.matchAll(/'([A-Za-z][A-Za-z0-9_]* ?)'/g)) nomi.add(s[1]);
      }
    }
  }

  return [...nomi].sort();
}

const INTESTAZIONE = `/**
 * I nomi di campo che i mappatori leggono.
 *
 * **Generato**, non scritto a mano: è l'estrazione degli argomenti passati ai lettori
 * (\`str\`, \`num\`, \`pick\`, …) in tutto il livello provider. Serve alla sorveglianza a
 * runtime, che confronta ogni risposta del fornitore con questo elenco e segnala ciò che
 * non vi compare.
 *
 * Un collaudo lo rigenera e lo confronta: se qualcuno aggiunge una lettura senza
 * aggiornare questo file, il collaudo fallisce. Senza quel presidio l'elenco
 * invecchierebbe in silenzio, e la sorveglianza smetterebbe di sorvegliare proprio i campi
 * nuovi — cioè l'unica cosa per cui esiste.
 *
 * Si rigenera con:
 *
 *   npm run campi-noti
 */

export const CAMPI_NOTI: readonly string[] = [
`;

export function scriviCampiNoti(nomi, destinazione) {
  const corpo = nomi.map((n) => `  '${n}',`).join('\n');
  writeFileSync(destinazione, `${INTESTAZIONE}${corpo}\n];\n`, 'utf8');
}

// Uso da riga di comando: estrai-campi.mjs <cartella sorgenti> <file da scrivere>
if (process.argv[1]?.endsWith('estrai-campi.mjs') === true && process.argv[3] !== undefined) {
  const nomi = estraiCampi(process.argv[2]);
  scriviCampiNoti(nomi, process.argv[3]);
  console.log('campi noti generati:', nomi.length);
}
