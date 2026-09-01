/**
 * Cosa è cambiato nel motore, voce per voce.
 *
 *   npx tsx scripts/confronta-istantanee.ts prima.json dopo.json
 *
 * Il compagno di `istantanea-motore.ts`. Da solo un dump non serve: serve la differenza,
 * e serve in una forma su cui si possa lavorare invece che un verdetto «diverso».
 *
 * COME SI LEGGE. Ogni riga è un valore che il motore calcolava in un modo e ora calcola in
 * un altro. Per ciascuna ci si pone una domanda sola, e la risposta ha solo due forme:
 *
 *   «è cambiato perché ho corretto il difetto N»  → è una correzione, va bene
 *   «non so perché è cambiato»                    → è una REGRESSIONE, e va capita
 *
 * Non c'è una terza risposta. «Sarà un effetto collaterale innocuo» è il modo in cui una
 * regressione entra in produzione con l'approvazione di chi la sta guardando.
 *
 * Esce con codice 1 se qualcosa è cambiato: così può fare da cancello in uno script, e chi
 * lo usa deve guardare l'elenco invece di scorrere oltre.
 */

import { readFileSync } from 'node:fs';

const [, , fileA, fileB] = process.argv;
if (fileA === undefined || fileB === undefined) {
  process.stderr.write('Uso: npx tsx scripts/confronta-istantanee.ts <prima.json> <dopo.json>\n');
  process.exit(1);
}

const prima: unknown = JSON.parse(readFileSync(fileA, 'utf8'));
const dopo: unknown = JSON.parse(readFileSync(fileB, 'utf8'));

interface Differenza {
  readonly percorso: string;
  readonly prima: unknown;
  readonly dopo: unknown;
  readonly genere: 'valore' | 'comparso' | 'sparito';
}

const differenze: Differenza[] = [];

/** Rappresentazione breve di un valore, per stare su una riga. */
function breve(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string')
    return v.length > 60 ? JSON.stringify(v.slice(0, 57) + '…') : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.length} elementi]`;
  if (typeof v === 'object') return `{${Object.keys(v).length} campi}`;
  // I primitivi si nominano uno per uno: String() su un simbolo solleva, e su una
  // funzione stampa il sorgente. Nessuno dei due appartiene a un'istantanea del motore,
  // ma se ci finissero è meglio vederli dichiarati che vedere il programma fermarsi.
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'undefined') return 'undefined';
  return `‹${typeof v}›`;
}

function confronta(a: unknown, b: unknown, percorso: string): void {
  if (a === b) return;

  const aOgg = typeof a === 'object' && a !== null;
  const bOgg = typeof b === 'object' && b !== null;

  if (!aOgg || !bOgg) {
    differenze.push({ percorso, prima: a, dopo: b, genere: 'valore' });
    return;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    differenze.push({ percorso, prima: a, dopo: b, genere: 'valore' });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    /*
      Gli elenchi si confrontano per posizione.

      Sarebbe più raffinato appaiarli per identità, ma per lo scopo qui è meglio così: un
      elemento inserito in mezzo sposta tutti quelli dopo e produce molte righe. È rumore
      apparente, e invece è l'informazione giusta — significa che l'ORDINE è cambiato, e
      in un piano d'azione ordinato per priorità l'ordine è il prodotto.
    */
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length)
        differenze.push({
          percorso: `${percorso}[${i}]`,
          prima: undefined,
          dopo: b[i],
          genere: 'comparso',
        });
      else if (i >= b.length)
        differenze.push({ percorso: `${percorso}[${i}]`, prima: a[i], dopo: undefined, genere: 'sparito' });
      else confronta(a[i], b[i], `${percorso}[${i}]`);
    }
    return;
  }

  const chiavi = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of chiavi) {
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    const inA = Object.prototype.hasOwnProperty.call(a, k);
    const inB = Object.prototype.hasOwnProperty.call(b, k);
    const p = percorso === '' ? k : `${percorso}.${k}`;
    if (!inA) differenze.push({ percorso: p, prima: undefined, dopo: vb, genere: 'comparso' });
    else if (!inB) differenze.push({ percorso: p, prima: va, dopo: undefined, genere: 'sparito' });
    else confronta(va, vb, p);
  }
}

confronta(prima, dopo, '');

// ── Il verdetto per TIPO, prima dell'elenco ──────────────────────────────────

/*
  L'elenco per scenario si ferma a sessanta righe, e sessanta righe di testo cambiato
  nascondono benissimo il numero cambiato alla sessantunesima. È successo: il confronto
  fra ieri e oggi contava 599 differenze, e la domanda «qualche NUMERO è cambiato?» non
  aveva risposta leggendo — l'ha avuta solo riclassificando le differenze per tipo di
  valore, con uno script scritto sul momento.

  Quella classificazione sta qui, prima di tutto il resto, e non si tronca mai:

    testo cambiato        una frase riscritta — va nominata, ma non muove un capitale
    campo comparso        additivo — nessuno lo leggeva prima
    campo SPARITO         qualcuno lo leggeva: regressione finché non è spiegato
    valore NON testuale   un numero, un booleano, un livello — è la riga da guardare

  Le ultime due si stampano per intero, sempre. Zero in entrambe è la sola forma in cui
  «nessuna regressione» è una misura invece di un'opinione.
*/
const comparsi = new Map<string, number>();
const testoPerPercorso = new Map<string, number>();
const spariti: Differenza[] = [];
const nonTestuali: Differenza[] = [];
let testoCambiato = 0;

const nomeCampo = (p: string): string => (p.split('.').pop() ?? p).replace(/\[\d+\]/g, '');
// Il nome di uno scenario reale contiene un punto — «reale:prod-IT-full-….json» — e
// tagliare al primo punto lasciava «json.gap…» in testa a ogni percorso.
const senzaIndici = (p: string): string =>
  p.replace(/^scenari\.(?:[^.]+\.json|[^.]+)\./, '').replace(/\[\d+\]/g, '[]');

for (const d of differenze) {
  if (d.genere === 'comparso') {
    comparsi.set(nomeCampo(d.percorso), (comparsi.get(nomeCampo(d.percorso)) ?? 0) + 1);
  } else if (d.genere === 'sparito') {
    spariti.push(d);
  } else if (typeof d.prima === 'string' && typeof d.dopo === 'string') {
    testoCambiato += 1;
    const chiave = senzaIndici(d.percorso);
    testoPerPercorso.set(chiave, (testoPerPercorso.get(chiave) ?? 0) + 1);
  } else {
    nonTestuali.push(d);
  }
}

if (differenze.length > 0) {
  const totaleComparsi = [...comparsi.values()].reduce((s, n) => s + n, 0);
  process.stdout.write(`\n  VERDETTO PER TIPO\n  ${'─'.repeat(76)}\n`);
  process.stdout.write(`  testo cambiato          ${testoCambiato}\n`);
  for (const [p, n] of [...testoPerPercorso.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
    process.stdout.write(`      ~ ${p}  ×${n}\n`);
  }
  process.stdout.write(`  campi comparsi          ${totaleComparsi}\n`);
  for (const [nome, n] of [...comparsi.entries()].sort((x, y) => y[1] - x[1])) {
    process.stdout.write(`      + ${nome}  ×${n}\n`);
  }
  const avvisoSpariti = spariti.length > 0 ? '   ← regressione finché non è spiegato' : '';
  process.stdout.write(`  campi SPARITI           ${spariti.length}${avvisoSpariti}\n`);
  for (const d of spariti) process.stdout.write(`      − ${d.percorso}\n`);
  const avvisoValori = nonTestuali.length > 0 ? '   ← QUI si guarda' : '';
  process.stdout.write(`  valori NON testuali     ${nonTestuali.length}${avvisoValori}\n`);
  for (const d of nonTestuali) {
    process.stdout.write(`      ! ${d.percorso}\n`);
    process.stdout.write(`          prima: ${breve(d.prima)}\n          dopo : ${breve(d.dopo)}\n`);
  }
}

// ── Il rapporto ──────────────────────────────────────────────────────────────

const perScenario = new Map<string, Differenza[]>();
for (const d of differenze) {
  const scenario = /^scenari\.([^.[]+)/.exec(d.percorso)?.[1] ?? '‹fuori dagli scenari›';
  const elenco = perScenario.get(scenario) ?? [];
  elenco.push(d);
  perScenario.set(scenario, elenco);
}

process.stdout.write(`\n  ${fileA}  →  ${fileB}\n`);
process.stdout.write(`  ${'─'.repeat(76)}\n`);

if (differenze.length === 0) {
  process.stdout.write('\n  NESSUNA DIFFERENZA. Il motore calcola esattamente gli stessi valori.\n\n');
  process.exit(0);
}

for (const [scenario, elenco] of [...perScenario.entries()].sort()) {
  process.stdout.write(`\n  ${scenario}  —  ${elenco.length} differenze\n\n`);
  for (const d of elenco.slice(0, 60)) {
    const corto = d.percorso.replace(/^scenari\.[^.]+\./, '');
    const segno = d.genere === 'comparso' ? '  +' : d.genere === 'sparito' ? '  −' : '  ~';
    process.stdout.write(`${segno} ${corto}\n`);
    if (d.genere === 'valore') {
      process.stdout.write(`      prima: ${breve(d.prima)}\n`);
      process.stdout.write(`      dopo : ${breve(d.dopo)}\n`);
    } else {
      process.stdout.write(`      ${d.genere === 'comparso' ? breve(d.dopo) : breve(d.prima)}\n`);
    }
  }
  if (elenco.length > 60) {
    process.stdout.write(`\n      … e altre ${elenco.length - 60} in questo scenario, non stampate.\n`);
  }
}

process.stdout.write(`\n  ${'─'.repeat(76)}\n`);
process.stdout.write(`  TOTALE: ${differenze.length} valori cambiati in ${perScenario.size} scenari.\n\n`);
process.stdout.write('  Per ciascuno la domanda è una sola, e le risposte ammesse sono due:\n');
process.stdout.write('    «è cambiato perché ho corretto il difetto N»  → correzione\n');
process.stdout.write('    «non so perché è cambiato»                    → REGRESSIONE\n\n');
process.exit(1);
