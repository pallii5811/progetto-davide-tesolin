/**
 * Di tutto quello che paghiamo, quanto arriva davvero sullo schermo?
 *
 *   npx tsx scripts/quanto-del-comprato-si-vede.ts
 *
 * La domanda l'ha posta il proprietario del prodotto più di una volta, e finora ha avuto
 * risposte a impressione. Questa la conta.
 *
 * Prende le risposte REGISTRATE dei servizi a pagamento — quelle in `.sonda`, comprate
 * davvero — ne estrae ogni campo foglia, e per ciascuno guarda due cose distinte:
 *
 *   1. il MAPPATORE lo legge? (cioè entra nel modello di dominio)
 *   2. qualche SCHERMATA lo nomina? (cioè arriva sotto gli occhi dell'intermediario)
 *
 * Un campo che passa la prima e non la seconda è denaro speso e mai visto: è il difetto che
 * in questa sessione è già uscito tre volte — le scale della matrice, la base di calcolo
 * delle garanzie, ventuno indici dell'archivio.
 *
 * LIMITE DICHIARATO, perché un controllo che non dice cosa non guarda è peggio di niente.
 * La ricerca è testuale sul nome del campo: un campo letto per destrutturazione con
 * rinomina, o raggiunto da un `Object.entries`, risulta non letto pur essendolo. L'uscita è
 * una LISTA DI SOSPETTI da aprire a mano, non un verdetto. E i nomi troppo corti o troppo
 * comuni sono esclusi, perché comparirebbero ovunque per caso.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const RADICE = process.cwd();
const SONDA = join(RADICE, '.sonda');

if (!existsSync(SONDA)) {
  process.stdout.write('\n  .sonda assente: non ci sono risposte comprate da misurare.\n');
  process.stdout.write('  Il controllo non ha girato — e questo NON è un esito verde.\n\n');
  process.exit(0);
}

/** Nomi che comparirebbero per caso in qualunque file. */
const TROPPO_COMUNI = new Set([
  'id',
  'name',
  'type',
  'value',
  'date',
  'code',
  'status',
  'address',
  'city',
  'country',
  'state',
  'year',
  'total',
  'data',
  'description',
  'title',
  'number',
  'count',
]);

function foglie(nodo: unknown, dentro = ''): Map<string, unknown> {
  const fuori = new Map<string, unknown>();
  if (Array.isArray(nodo)) {
    // Di un elenco basta il primo elemento: i campi sono gli stessi.
    if (nodo.length > 0) for (const [k, v] of foglie(nodo[0], dentro)) fuori.set(k, v);
    return fuori;
  }
  if (nodo !== null && typeof nodo === 'object') {
    for (const [chiave, valore] of Object.entries(nodo as Record<string, unknown>)) {
      if (valore !== null && typeof valore === 'object') {
        for (const [k, v] of foglie(valore, `${dentro}${chiave}.`)) fuori.set(k, v);
      } else {
        fuori.set(`${dentro}${chiave}`, valore);
      }
    }
  }
  return fuori;
}

function tuttiIFile(cartella: string, estensioni: readonly string[]): string[] {
  const fuori: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) fuori.push(...tuttiIFile(percorso, estensioni));
    else if (estensioni.includes(extname(voce))) fuori.push(percorso);
  }
  return fuori;
}

const testoDi = (cartelle: readonly string[]): string =>
  cartelle
    .filter((c) => existsSync(c))
    .flatMap((c) => tuttiIFile(c, ['.ts', '.tsx']))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

/*
  ESCLUSI DUE FILE, e la ragione è un difetto che questo script ha già commesso.

  `campi-noti.ts` è il CATALOGO dei nomi che il fornitore può mandare: li elenca tutti,
  compresi quelli che nessuno legge. Contarlo fra i mappatori faceva risultare «letto»
  qualunque campo — e la prima esecuzione ha risposto «zero campi non letti», che era una
  rassicurazione falsa costruita da me. `sorveglianza-campi.ts` è il suo guardiano e ha lo
  stesso effetto.

  Un campo è letto quando qualcuno lo TRASFORMA in un dato di dominio, non quando qualcuno
  sa che esiste.
*/
const ESCLUSI = ['campi-noti.ts', 'sorveglianza-campi.ts'];

const mappatori = tuttiIFile(join(RADICE, 'packages', 'providers', 'src'), ['.ts'])
  .filter((f) => !ESCLUSI.some((e) => f.endsWith(e)))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const schermate = testoDi([join(RADICE, 'apps', 'web', 'src')]);

const compare = (dove: string, campo: string): boolean =>
  new RegExp(`['"\`]${campo}['"\`]|\\b${campo}\\b`).test(dove);

for (const file of readdirSync(SONDA).sort()) {
  if (!file.endsWith('.json')) continue;
  if (!file.includes('advanced') && !file.includes('full')) continue;

  let grezzo: unknown;
  try {
    grezzo = JSON.parse(readFileSync(join(SONDA, file), 'utf8'));
  } catch {
    continue;
  }
  const dati = (grezzo as { data?: unknown }).data;
  const contenuto: unknown = Array.isArray(dati) ? dati[0] : dati;
  if (contenuto === null || typeof contenuto !== 'object') continue;

  const campi = foglie(contenuto);
  const interessanti = [...campi.keys()].filter((c) => {
    const ultimo = c.split('.').pop() ?? c;
    return ultimo.length > 3 && !TROPPO_COMUNI.has(ultimo);
  });

  const nonMappati: string[] = [];
  const mappatiMaiMostrati: string[] = [];

  for (const campo of interessanti) {
    const ultimo = campo.split('.').pop() ?? campo;
    const letto = compare(mappatori, ultimo);
    const mostrato = compare(schermate, ultimo);
    if (!letto) nonMappati.push(campo);
    else if (!mostrato) mappatiMaiMostrati.push(campo);
  }

  const valorizzati = interessanti.filter((c) => {
    const v = campi.get(c);
    return v !== null && v !== '' && v !== undefined;
  });

  process.stdout.write(`\n  ${file}\n  ${'─'.repeat(74)}\n`);
  process.stdout.write(`    campi nella risposta          ${interessanti.length}\n`);
  process.stdout.write(`    di cui VALORIZZATI            ${valorizzati.length}\n`);
  process.stdout.write(`    mai letti dal mappatore       ${nonMappati.length}\n`);
  process.stdout.write(`    letti ma mai mostrati         ${mappatiMaiMostrati.length}\n`);

  const valorizzatiENonLetti = nonMappati.filter((c) => valorizzati.includes(c));
  if (valorizzatiENonLetti.length > 0) {
    process.stdout.write(`\n    CAMPI CON UN VALORE, MAI LETTI (${valorizzatiENonLetti.length}):\n`);
    for (const c of valorizzatiENonLetti) {
      const v = String(campi.get(c)).slice(0, 44);
      process.stdout.write(`      ${c.padEnd(42)} = ${v}\n`);
    }
  }
}

process.stdout.write('\n  I sospetti si aprono a mano: la ricerca è testuale e sbaglia.\n\n');
