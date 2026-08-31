/**
 * Quali garanzie restano «da quantificare», e su quale base si dimensionano.
 *
 *   npx tsx scripts/quali-da-quantificare.ts
 *
 * Sulla scheda di un'impresa reale comparivano nove schede che dicevano tutte la stessa
 * frase: «Rilevare i dati necessari a dimensionare X». Nove volte la stessa istruzione
 * cambiando solo il nome della garanzia, cioe nessuna istruzione: chi legge deve sapere
 * QUALE dato andare a chiedere al cliente, ed e l'unica cosa che quella riga non dice.
 *
 * Il catalogo pero la sa gia: ogni garanzia dichiara la propria `base` di calcolo. Prima
 * di riscrivere la frase serve sapere se quella base DISTINGUE le nove schede o se sono
 * tutte sulla stessa: nel secondo caso riscriverla cambierebbe le parole e non
 * l'informazione, che e il modo piu economico di sembrare di aver corretto qualcosa.
 */

import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile, demoPolizze } from '../packages/core/src/index.js';

const scenari = [
  { nome: 'dimostrativa, con polizze', polizze: demoPolizze() },
  { nome: 'prima visita, nessuna polizza', polizze: [] },
] as const;

for (const scenario of scenari) {
  const analisi = analyzeCompany(demoCompanyProfile(), scenario.polizze, DEMO_AS_OF);
  const tutte = analisi.gap.gaps;
  const daQuantificare = tutte.filter((g) => g.status === 'da-quantificare');

  process.stdout.write(`\n  ${scenario.nome}\n`);
  process.stdout.write(`  ${'─'.repeat(72)}\n`);
  process.stdout.write(`  garanzie totali ${tutte.length} · da quantificare ${daQuantificare.length}\n\n`);

  const perBase = new Map<string, string[]>();
  for (const g of daQuantificare) {
    const { base, label } = g.definition;
    perBase.set(base, [...(perBase.get(base) ?? []), label]);
  }

  for (const [base, etichette] of [...perBase.entries()].sort((a, b) => b[1].length - a[1].length)) {
    process.stdout.write(`    ${base}  (${etichette.length})\n`);
    for (const e of etichette) process.stdout.write(`        ${e}\n`);
  }

  /*
    Il numero che decide se vale la pena riscrivere la frase.

    Se le basi distinte sono una sola, le schede resterebbero indistinguibili anche dopo:
    la correzione andrebbe cercata altrove. Se sono parecchie, oggi il prodotto sta
    buttando via un'informazione che possiede gia.
  */
  process.stdout.write(`\n    basi distinte fra queste garanzie: ${perBase.size}\n`);
}

process.stdout.write('\n');
