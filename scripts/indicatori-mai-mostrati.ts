/**
 * Degli indici e delle qualifiche comprate, quali non arrivano allo schermo?
 *
 *   npx tsx scripts/indicatori-mai-mostrati.ts
 *
 * `IndicatoriFornitore` è il blocco che l'archivio camerale restituisce già elaborato:
 * arriva compreso nel prezzo del profilo, e in questa sessione è già emerso due volte che
 * pezzi di quel blocco venivano trasportati fino a un passo dalla schermata e lì buttati.
 *
 * Qui si contano. Per ogni campo del tipo di dominio si guarda se una qualunque schermata
 * lo nomina: se nessuna lo fa, quel dato è stato pagato, mappato, serializzato e mai visto.
 *
 * LIMITE DICHIARATO: la ricerca è testuale. Un campo reso da un ciclo su `Object.entries`
 * risulta non mostrato pur essendolo — e in questo file succede davvero, perché la tabella
 * degli indici è costruita così. L'uscita è una lista di sospetti, e la si apre a mano.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const RADICE = process.cwd();
const TIPO = join(RADICE, 'packages', 'core', 'src', 'company', 'indicatori-fornitore.ts');

function tuttiIFile(cartella: string): string[] {
  const fuori: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) fuori.push(...tuttiIFile(percorso));
    else if (['.ts', '.tsx'].includes(extname(voce))) fuori.push(percorso);
  }
  return fuori;
}

const schermate = tuttiIFile(join(RADICE, 'apps', 'web', 'src'))
  .filter((f) => !f.endsWith(join('lib', 'api.ts')))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const sorgente = readFileSync(TIPO, 'utf8');

/*
  I campi con il blocco a cui appartengono. Il tipo è fatto di interfacce annidate —
  redditivita, solidita, liquidita, qualifiche… — e sapere da quale arriva un campo dice
  a chi legge dove andrebbe mostrato.
*/
let blocco = '(radice)';
const campi: { blocco: string; nome: string }[] = [];
for (const riga of sorgente.split(/\r?\n/)) {
  const apre = /^export interface ([A-Za-z]+)/.exec(riga.trim());
  if (apre?.[1] !== undefined) blocco = apre[1];
  const campo = /^readonly ([a-zA-Z0-9]+)\??:/.exec(riga.trim());
  if (campo?.[1] !== undefined) campi.push({ blocco, nome: campo[1] });
}

const mostrati: typeof campi = [];
const mai: typeof campi = [];
for (const c of campi) {
  (new RegExp(`\\b${c.nome}\\b`).test(schermate) ? mostrati : mai).push(c);
}

process.stdout.write(`\n  campi del blocco indicatori   ${campi.length}\n`);
process.stdout.write(`  nominati da una schermata     ${mostrati.length}\n`);
process.stdout.write(`  MAI nominati                  ${mai.length}\n`);

if (mai.length > 0) {
  process.stdout.write('\n  Pagati, mappati, serializzati e mai visti:\n\n');
  let corrente = '';
  for (const c of mai) {
    if (c.blocco !== corrente) {
      corrente = c.blocco;
      process.stdout.write(`    ${corrente}\n`);
    }
    process.stdout.write(`      ${c.nome}\n`);
  }
}

process.stdout.write('\n');
