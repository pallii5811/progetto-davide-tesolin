/**
 * Quali misure territoriali arrivano allo schermo senza arrivare al motore.
 *
 *   npx tsx scripts/misurato-e-non-usato.ts
 *
 * PERCHÉ ESISTE. Il 09/09/2026 gli indicatori comunali ISPRA hanno portato la pericolosità
 * da frana fino alla tabella delle ubicazioni: una parola, una percentuale, una fonte
 * citata. Il motore dei rischi, però, continuava a modulare «alluvione, inondazione, frana»
 * sulla sola acqua. Per un giorno la scheda ha mostrato una pericolosità che il registro dei
 * rischi ignorava — e sul capannone di collina, dove l'acqua non arriva mai, il punteggio
 * restava quello di un capannone in pianura.
 *
 * È il difetto più insidioso di questo prodotto, perché non lascia tracce: nessun errore,
 * nessun campo vuoto, nessun numero storto. Anzi, il contrario — la scheda sembra più
 * completa di prima. Un dato misurato e non usato è peggio di un dato assente: costa
 * lavoro, occupa spazio a schermo, e induce chi legge a credere che il motore ne abbia
 * tenuto conto.
 *
 * LA PROPRIETÀ CONTROLLATA. `TerritorialExposure` esiste per una ragione sola: dire quanto
 * è pericoloso il posto dove l'impresa sta. Ogni suo campo che raggiunge una schermata deve
 * raggiungere anche il motore, o la scheda mostra un pericolo che il registro non pesa.
 *
 * LIMITE DICHIARATO, perché un controllo che non dice cosa non guarda è peggio di nessun
 * controllo: la ricerca è testuale sui nomi dei campi. Un campo letto per destrutturazione
 * con rinomina, o raggiunto da un `Object.entries`, risulta non letto pur essendolo. Le
 * etichette già pronte da stampare (`…Etichetta`) sono escluse per costruzione: sono la
 * forma testuale di un livello, e il motore legge il livello.
 *
 * PROVA CHE FALLISCE. Sul commit precedente ad `aaf0c65` — cioè prima che la regola
 * `alluvione/zona-frana-alta` esistesse — questo controllo segnala `frane`. Un controllo
 * che non ha mai fallito non è un controllo:
 *
 *   git stash && git checkout aaf0c65~1 -- packages/core/src/risk/rules.ts
 *   npx tsx scripts/misurato-e-non-usato.ts     # → 1 rilievo: frane
 *   git checkout aaf0c65 -- packages/core/src/risk/rules.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const RADICE = process.cwd();

/** Il file che dichiara il tipo: qui i nomi compaiono per forza, e non contano. */
const DICHIARAZIONE = join(RADICE, 'packages', 'core', 'src', 'risk', 'geo.ts');

/**
 * Il motore: dove i fatti diventano voci del registro dei rischi.
 *
 * `geo.ts` e `idrogeo.ts` stanno nella stessa cartella ma sono la MISURA, non l'uso: se
 * contassero, ogni campo risulterebbe usato dal solo fatto di essere stato calcolato.
 */
const MOTORE = [
  join(RADICE, 'packages', 'core', 'src', 'risk', 'rules.ts'),
  join(RADICE, 'packages', 'core', 'src', 'risk', 'engine.ts'),
  join(RADICE, 'packages', 'core', 'src', 'risk', 'assessment.ts'),
  join(RADICE, 'packages', 'core', 'src', 'risk', 'prevenzione.ts'),
  join(RADICE, 'packages', 'core', 'src', 'risk', 'ritenzione.ts'),
];

/** Le schermate e i documenti: tutto ciò che un intermediario può vedere o stampare. */
const SCHERMO = [
  join(RADICE, 'apps', 'web', 'src'),
  join(RADICE, 'packages', 'core', 'src', 'presentazione'),
];

const ESTENSIONI = new Set(['.ts', '.tsx']);

function fileSotto(percorso: string): string[] {
  let stato;
  try {
    stato = statSync(percorso);
  } catch {
    return [];
  }
  if (stato.isFile()) return ESTENSIONI.has(extname(percorso)) ? [percorso] : [];
  return readdirSync(percorso).flatMap((voce) =>
    voce === 'node_modules' || voce === 'dist' ? [] : fileSotto(join(percorso, voce)),
  );
}

/** I campi dichiarati da un'interfaccia, letti dal sorgente senza compilarlo. */
function campiDi(sorgente: string, nome: string): string[] {
  const apertura = sorgente.indexOf(`export interface ${nome} {`);
  if (apertura < 0) throw new Error(`interfaccia ${nome} non trovata`);
  const chiusura = sorgente.indexOf('\n}', apertura);
  const corpo = sorgente.slice(apertura, chiusura);
  const campi = corpo.matchAll(/^\s*readonly ([A-Za-z][A-Za-z0-9_]*)\??:/gm);
  return [...campi].map((m) => m[1] as string);
}

/**
 * Quante volte un nome compare come parola intera.
 *
 * I confini si scrivono a mano, con classi di caratteri esplicite: le sequenze di escape
 * scritte da uno strumento che passa per una shell si trasformano in caratteri di controllo
 * e la ricerca smette di agganciare, in silenzio.
 */
function occorrenze(testo: string, nome: string): number {
  const espressione = new RegExp(`(^|[^A-Za-z0-9_$])${nome}([^A-Za-z0-9_$]|$)`, 'g');
  return [...testo.matchAll(espressione)].length;
}

/**
 * Le eccezioni, con la ragione scritta accanto.
 *
 * Un elenco di esclusioni senza motivazione diventa il posto dove si nasconde il difetto
 * successivo: basta aggiungerci una riga e il controllo torna verde. Qui ogni voce dice
 * PERCHÉ quel campo non deve comparire nel motore, e la ragione è sempre la stessa forma —
 * il valore ci arriva lo stesso, per un'altra strada.
 */
const ECCEZIONI: Readonly<Record<string, string>> = {
  indicatoriIdrogeo:
    'le percentuali grezze arrivano al motore attraverso livelloIdraulico e livelloFrana, ' +
    'che le traducono nelle tre parole: a schermo ci sono perché chi non condivide la ' +
    'soglia possa guardare la misura',
};

const sorgenteGeo = readFileSync(DICHIARAZIONE, 'utf8');
const campi = campiDi(sorgenteGeo, 'TerritorialExposure').filter(
  // Le etichette sono la forma testuale di un livello: si stampano, non si valutano.
  (c) => !c.endsWith('Etichetta') && c !== 'provincia',
);

const testoMotore = MOTORE.map((f) => readFileSync(f, 'utf8')).join('\n');
const fileSchermo = SCHERMO.flatMap(fileSotto);
const testoSchermo = fileSchermo.map((f) => readFileSync(f, 'utf8')).join('\n');

const larghezza = Math.max(...campi.map((c) => c.length)) + 2;
process.stdout.write('\n  Misure territoriali: chi le mostra, chi le usa\n\n');
process.stdout.write(`  ${'campo'.padEnd(larghezza)}${'a schermo'.padEnd(12)}${'nel motore'}\n`);

const rilievi: string[] = [];
for (const campo of campi) {
  const aSchermo = occorrenze(testoSchermo, campo);
  const nelMotore = occorrenze(testoMotore, campo);
  const scoperto = aSchermo > 0 && nelMotore === 0;
  const scusa = ECCEZIONI[campo];
  const segno = !scoperto
    ? ''
    : scusa === undefined
      ? '  ← mostrato e mai pesato'
      : '  · eccezione dichiarata';
  if (scoperto && scusa === undefined) rilievi.push(campo);
  process.stdout.write(
    `  ${campo.padEnd(larghezza)}${String(aSchermo).padEnd(12)}${String(nelMotore)}${segno}\n`,
  );
  if (scoperto && scusa !== undefined) process.stdout.write(`  ${' '.repeat(larghezza)}${scusa}\n`);
}

process.stdout.write(`\n  ${fileSchermo.length} file di schermata, ${MOTORE.length} del motore\n`);

if (rilievi.length === 0) {
  process.stdout.write('\n  Nessuna misura territoriale resta fuori dal registro dei rischi.\n\n');
  process.exit(0);
}

process.stdout.write(
  `\n  ${rilievi.length} misura/e arriva/no allo schermo e non al motore: ${rilievi.join(', ')}.\n` +
    '  La scheda mostrerebbe un pericolo che il registro dei rischi non pesa.\n\n',
);
process.exit(1);
