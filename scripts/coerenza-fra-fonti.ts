/**
 * Due fonti della stessa grandezza sono d'accordo?
 *
 *   npx tsx scripts/coerenza-fra-fonti.ts
 *
 * L'anagrafica estesa porta la stessa informazione due volte, per strade diverse: gli
 * aggregati sintetici del bilancio depositato — patrimonio netto, totale attivo — e gli
 * indici che il Registro Imprese ha già elaborato su quello stesso bilancio, fra cui il
 * grado di capitalizzazione, che è patrimonio netto su totale attivo.
 *
 * Sono lo stesso numero per due vie. Se divergono, una delle due letture prende il campo
 * sbagliato — e non c'è modo di accorgersene guardandone una sola, perché entrambe
 * sembrano numeri plausibili.
 *
 * IL CASO CHE HA FATTO NASCERE QUESTO CONTROLLO. Sulla scheda di un'impresa reale il fido
 * dichiarava «Patrimonio netto 8.485 €» mentre il grado di capitalizzazione della stessa
 * pagina valeva 0,14. Se fossero veri entrambi, il totale attivo sarebbe 60.607 € su
 * un'impresa con 3,96 milioni di ricavi e 344.000 € di EBITDA: impossibile. E il
 * patrimonio netto è il primo dei tre vincoli del fido commerciale, cioè decide quanto
 * credito l'intermediario consiglia di concedere.
 *
 * Il controllo gira sulle risposte registrate in `.sonda`, che non sono in git perché
 * contengono dati d'impresa comprati. Dove mancano, lo dichiara e non finge di aver
 * verificato.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mappaBilanciSintetici } from '@aegis/providers';
// Percorso diretto: `indicatori.js` non è fra i moduli riesportati dall'indice del
// pacchetto, pur essendo usato dal provider. Non lo si aggiunge alla superficie pubblica
// per comodità di uno script di diagnosi.
import { mappaIndicatoriFornitore } from '../packages/providers/src/openapi/indicatori.js';

/** Scarto oltre il quale due letture della stessa grandezza non sono più la stessa cosa. */
const TOLLERANZA = 0.02;

const SONDA = join(process.cwd(), '.sonda');
if (!existsSync(SONDA)) {
  process.stdout.write('\n  .sonda assente: nessuna risposta registrata da misurare.\n');
  process.stdout.write('  Il controllo non ha girato — e questo NON è un esito verde.\n\n');
  process.exit(0);
}

const eur = (c: number | null): string =>
  c === null ? 'assente' : `${new Intl.NumberFormat('it-IT').format(Math.round(c / 100))} €`;

let esaminate = 0;
let divergenti = 0;

for (const file of readdirSync(SONDA).sort()) {
  if (!file.endsWith('.json')) continue;
  if (!file.includes('advanced') && !file.includes('full')) continue;

  let grezzo: unknown;
  try {
    grezzo = JSON.parse(readFileSync(join(SONDA, file), 'utf8'));
  } catch {
    process.stdout.write(`\n  ${file}\n    illeggibile\n`);
    continue;
  }
  const dati = (grezzo as { data?: unknown }).data;
  const contenuto: unknown = Array.isArray(dati) ? dati[0] : dati;
  if (contenuto === undefined || contenuto === null) continue;

  const ultimo = mappaBilanciSintetici(contenuto)[0];
  const grado = mappaIndicatoriFornitore(contenuto).indebitamento?.gradoDiCapitalizzazione ?? null;

  process.stdout.write(`\n  ${file}\n`);
  if (ultimo === undefined) {
    process.stdout.write('    nessun bilancio sintetico nella risposta\n');
    continue;
  }

  process.stdout.write(`    esercizio                 ${ultimo.anno}\n`);
  process.stdout.write(`    fatturato                 ${eur(ultimo.fatturato)}\n`);
  process.stdout.write(`    patrimonio netto          ${eur(ultimo.patrimonioNetto)}\n`);
  process.stdout.write(`    totale attivo             ${eur(ultimo.totaleAttivo)}\n`);
  process.stdout.write(
    `    grado di capitalizzazione ${grado === null ? 'assente' : grado.toFixed(4)}\n`,
  );

  const pn = ultimo.patrimonioNetto;
  const attivo = ultimo.totaleAttivo;
  if (pn === null || attivo === null || attivo === 0 || grado === null) {
    process.stdout.write('    confronto non possibile: manca un termine\n');
    continue;
  }

  esaminate += 1;
  const calcolato = pn / attivo;
  const scarto = Math.abs(calcolato - grado);
  process.stdout.write(`    PN / attivo calcolato     ${calcolato.toFixed(4)}\n`);
  if (scarto < TOLLERANZA) {
    process.stdout.write('    COINCIDONO\n');
  } else {
    divergenti += 1;
    process.stdout.write(`    DIVERGONO di ${scarto.toFixed(4)} — una delle due letture sbaglia campo\n`);
  }
}

process.stdout.write(`\n  ${'─'.repeat(70)}\n`);
process.stdout.write(`  confrontate ${esaminate} imprese · divergenti ${divergenti}\n\n`);
if (divergenti > 0) process.exit(1);
