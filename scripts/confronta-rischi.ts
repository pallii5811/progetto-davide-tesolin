/**
 * Confronta due istantanee del motore RISCHIO PER RISCHIO, non posizione per posizione.
 *
 *   npx tsx scripts/confronta-rischi.ts prima.json dopo.json
 *
 * `confronta-istantanee.ts` confronta due alberi JSON campo per campo, ed è la cosa giusta
 * finché la forma non cambia. Ma l'elenco dei rischi è ORDINATO PER PUNTEGGIO: basta che una
 * modulazione ne sposti uno perché tutti gli indici scorrano, e il confronto riporti
 * centinaia di differenze in cui `risks[7].definition.label` «cambia» soltanto perché al
 * settimo posto adesso c'è un altro rischio.
 *
 * Quel rumore nasconde esattamente ciò che si deve guardare: quale rischio si è mosso, di
 * quanto, e su quale asse. Qui i rischi si appaiano per identificativo, e si stampa la sola
 * differenza di punteggio — con il segno, perché un rischio che SCENDE senza una ragione è
 * la cosa che va vista per prima.
 */

import { readFileSync } from 'node:fs';

interface Rischio {
  readonly definition: { readonly id: string; readonly label: string };
  readonly residualScore: number;
  readonly residualLikelihood: number;
  readonly residualImpact: number;
}

interface Scenario {
  readonly nome?: string;
  readonly json?: { readonly rischi?: { readonly risks?: readonly Rischio[] } };
  readonly rischi?: { readonly risks?: readonly Rischio[] };
}

const [, , fPrima, fDopo] = process.argv;
if (fPrima === undefined || fDopo === undefined) {
  process.stdout.write('Uso: npx tsx scripts/confronta-rischi.ts <prima.json> <dopo.json>\n');
  process.exit(1);
}

/**
 * Gli scenari stanno sotto la chiave `scenari`, e il registro dei rischi a volte sotto
 * `json` e a volte no: la prima versione di questo confronto leggeva la radice e rispondeva
 * «nessuna differenza» su due istantanee che ne avevano centinaia. Un confronto che non
 * trova niente perché sta guardando nel posto sbagliato è indistinguibile da un confronto
 * che non trova niente perché non c'è niente — e per questo, in coda, si stampa quanti
 * rischi sono stati effettivamente appaiati.
 */
function scenari(percorso: string): Map<string, readonly Rischio[]> {
  const dati = JSON.parse(readFileSync(percorso, 'utf8')) as { scenari?: Record<string, Scenario> };
  const mappa = new Map<string, readonly Rischio[]>();
  for (const [nome, corpo] of Object.entries(dati.scenari ?? {})) {
    mappa.set(nome, corpo.json?.rischi?.risks ?? corpo.rischi?.risks ?? []);
  }
  return mappa;
}

const prima = scenari(fPrima);
const dopo = scenari(fDopo);

let saliti = 0;
let scesi = 0;
let nuovi = 0;
let spariti = 0;

for (const [nome, rischiPrima] of prima) {
  const rischiDopo = dopo.get(nome) ?? [];
  const indicePrima = new Map(rischiPrima.map((r) => [r.definition.id, r]));
  const indiceDopo = new Map(rischiDopo.map((r) => [r.definition.id, r]));

  const righe: string[] = [];
  for (const [id, a] of indicePrima) {
    const b = indiceDopo.get(id);
    if (b === undefined) {
      righe.push(`  SPARITO  ${a.definition.label} (era ${a.residualScore})`);
      spariti += 1;
      continue;
    }
    if (a.residualScore !== b.residualScore) {
      const segno = b.residualScore > a.residualScore ? '+' : '';
      righe.push(
        `  ${b.residualScore > a.residualScore ? 'SALE ' : 'SCENDE'}  ${a.definition.label.padEnd(46)} ` +
          `${a.residualScore} -> ${b.residualScore}  (${segno}${b.residualScore - a.residualScore})  ` +
          `P ${a.residualLikelihood}->${b.residualLikelihood}  I ${a.residualImpact}->${b.residualImpact}`,
      );
      if (b.residualScore > a.residualScore) saliti += 1;
      else scesi += 1;
    }
  }
  for (const [id, b] of indiceDopo) {
    if (!indicePrima.has(id)) {
      righe.push(`  NUOVO    ${b.definition.label} (${b.residualScore})`);
      nuovi += 1;
    }
  }

  if (righe.length > 0) {
    process.stdout.write(`\n${nome}\n${righe.join('\n')}\n`);
  }
}

process.stdout.write(
  `\n────────────────────────────────────────────────────────────\n` +
    `saliti ${saliti} · scesi ${scesi} · nuovi ${nuovi} · spariti ${spariti}\n`,
);
if (scesi > 0 || spariti > 0) {
  process.stdout.write(
    'Un rischio che scende o sparisce va spiegato uno per uno: e’ la forma che prende una\n' +
      'regressione quando si aggiunge grana a un modello.\n',
  );
}
