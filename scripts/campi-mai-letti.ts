/**
 * Quali campi dell'analisi arrivano allo schermo e non vengono mai letti.
 *
 *   npx tsx scripts/campi-mai-letti.ts
 *
 * Tre volte in una notte è emerso lo stesso difetto: un'informazione comprata dal
 * fornitore, mappata, serializzata, portata fino a un passo dalla schermata — e lì buttata.
 * Le scale della matrice di rischio, la base di calcolo delle garanzie, ventuno indici
 * dell'archivio camerale. Ogni volta il codice sembrava a posto perché il dato c'era: solo
 * nessuno lo guardava.
 *
 * Questo controllo non indovina: prende i nomi dei campi dichiarati nel contratto HTTP del
 * client e conta quante volte compaiono altrove nelle schermate. Zero significa che il
 * campo attraversa la rete per niente.
 *
 * LIMITE DICHIARATO, perché un controllo che non dice cosa non guarda è peggio di nessun
 * controllo: è una ricerca testuale. Un campo letto per destrutturazione con rinomina, o
 * raggiunto da un `Object.entries`, risulta non letto pur essendolo. L'uscita è quindi una
 * LISTA DI SOSPETTI da guardare a mano, non un verdetto — e il conteggio va confrontato con
 * l'ultima esecuzione, non preso per assoluto.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const RADICE = process.cwd();
const CONTRATTO = join(RADICE, 'apps', 'web', 'src', 'lib', 'api.ts');
const SCHERMATE = join(RADICE, 'apps', 'web', 'src');

/** I nomi troppo comuni per dire qualcosa: comparirebbero ovunque per caso. */
const TROPPO_COMUNI = new Set([
  'id',
  'value',
  'valore',
  'nome',
  'tipo',
  'stato',
  'data',
  'testo',
  'note',
  'euro',
  'centesimi',
  'formattato',
  'etichetta',
  'titolo',
  'descrizione',
  'chiave',
  'punteggio',
  'livello',
  'classe',
  'anno',
]);

function tuttiIFile(cartella: string): string[] {
  const fuori: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      fuori.push(...tuttiIFile(percorso));
    } else if (['.ts', '.tsx'].includes(extname(voce))) {
      fuori.push(percorso);
    }
  }
  return fuori;
}

const contratto = readFileSync(CONTRATTO, 'utf8');

/*
  I campi dichiarati nel contratto: `nome: tipo;` a inizio riga, dentro le interfacce.
  Si escludono le righe di commento, che contengono due punti a bizzeffe.
*/
const dichiarati = new Set<string>();
for (const riga of contratto.split(/\r?\n/)) {
  const pulita = riga.trim();
  if (pulita.startsWith('*') || pulita.startsWith('//')) continue;
  const trovato = /^([a-zA-Z][a-zA-Z0-9]*)\??:\s/.exec(pulita);
  if (trovato?.[1] !== undefined && !TROPPO_COMUNI.has(trovato[1])) dichiarati.add(trovato[1]);
}

const sorgenti = tuttiIFile(SCHERMATE).filter((f) => f !== CONTRATTO);
const testo = sorgenti.map((f) => readFileSync(f, 'utf8')).join('\n');

const maiLetti: string[] = [];
for (const campo of [...dichiarati].sort()) {
  // Confine di parola su entrambi i lati: `fido` non deve contare dentro `fidoConsigliato`.
  const quante = testo.match(new RegExp(`\\b${campo}\\b`, 'g'))?.length ?? 0;
  if (quante === 0) maiLetti.push(campo);
}

process.stdout.write(`\n  campi dichiarati nel contratto  ${dichiarati.size}\n`);
process.stdout.write(`  file di schermata esaminati     ${sorgenti.length}\n`);
process.stdout.write(`  ${'─'.repeat(66)}\n`);

if (maiLetti.length === 0) {
  process.stdout.write('  Nessun campo sospetto: tutti compaiono almeno una volta.\n\n');
} else {
  process.stdout.write(`  SOSPETTI — mai nominati fuori dal contratto (${maiLetti.length}):\n\n`);
  for (const campo of maiLetti) process.stdout.write(`    ${campo}\n`);
  process.stdout.write('\n  Da guardare a mano: la ricerca è testuale e può sbagliare.\n\n');
}
