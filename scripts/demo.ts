/**
 * Dimostrazione del verticale completo, da riga di comando.
 *
 *   npm run demo
 *
 * Serve a due cose: mostrare al cliente il risultato senza dover avviare nulla,
 * e a noi da controllo qualitativo sull'output dei motori — i test verificano che
 * i numeri siano giusti, questo verifica che siano *leggibili*.
 */

import {
  COMPANY_SIZE_LABEL,
  DEMO_AS_OF,
  GAP_STATUS_LABEL,
  IMPACT_LABEL,
  INDICATOR_META,
  LIKELIHOOD_LABEL,
  Money,
  RISK_CATEGORY_LABEL,
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  formatIndicator,
  incidenzaGapSuPatrimonio,
  renderExplanation,
  risksByCategory,
} from '@aegis/core';
import type { FinancialIndicators } from '@aegis/core';

const analisi = analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF);

const line = (char = '─'): string => char.repeat(78);
const print = (text = ''): void => {
  process.stdout.write(`${text}\n`);
};

// ─────────────────────────────────────────────────────────────────────────────
print();
print(line('═'));
print(`  AEGIS · ANALISI INTEGRATA CREDITO E RISCHI`);
print(`  ${analisi.profile.identity.denominazione}`);
print(
  `  P.IVA ${analisi.profile.identity.partitaIva ?? 'n.d.'} · ` +
    `${analisi.profile.anagrafica.value.atecoPrimario} ${analisi.profile.anagrafica.value.atecoPrimarioDescrizione}`,
);
print(`  Analisi al ${formatDate(analisi.asOf)}`);
print(line('═'));

// ── Sintesi ──────────────────────────────────────────────────────────────────
print();
print('SINTESI');
print(line());
const s = analisi.sintesi;
print(`  Dimensione impresa .............. ${COMPANY_SIZE_LABEL[analisi.dimensione.value]}`);
print(`  Score di credito ................ ${s.scoreCredito}/100 (classe ${s.classeCredito})`);
print(
  `  Probabilità di default 12 mesi .. ${(analisi.creditScore.value.probabilitaDefault * 100).toFixed(2)}%`,
);
print(`  Fido commerciale consigliato .... ${Money.formatCompact(s.fidoConsigliato)}`);
print(`  Rischi identificati ............. ${s.rischiIdentificati} (${s.rischiCritici} alti o critici)`);
print(`  Coperture da attivare ........... ${s.coperturaAssente}`);
print(`  Patrimonio esposto .............. ${Money.formatCompact(s.patrimonioEsposto)}`);
print(`  Esposizione NON assicurata ...... ${Money.formatCompact(s.esposizioneNonAssicurata)}`);
const incidenza = incidenzaGapSuPatrimonio(analisi);
if (incidenza !== null) {
  print(`     ↳ pari al ${(incidenza * 100).toFixed(0)}% del patrimonio netto`);
}
print(
  `  Conformità CAT NAT .............. ${s.catNatConforme ? 'SÌ' : 'NO — obbligo di legge non adempiuto'}`,
);
print(`  Dati da completare in intervista  ${s.datiDaCompletare} rischi`);

// ── Bilancio ─────────────────────────────────────────────────────────────────
if (analisi.bilancio !== null && analisi.indicatori !== null) {
  print();
  print(`BILANCIO RICLASSIFICATO ${analisi.bilancio.anno}`);
  print(line());
  const { sp, ce } = analisi.bilancio;
  print(`  Ricavi .......................... ${Money.formatCompact(ce.ricavi)}`);
  print(`  Valore aggiunto ................. ${Money.formatCompact(ce.valoreAggiunto)}`);
  print(`  EBITDA .......................... ${Money.formatCompact(ce.ebitda)}`);
  print(`  EBIT ............................ ${Money.formatCompact(ce.ebit)}`);
  print(`  Utile netto ..................... ${Money.formatCompact(ce.utileNetto)}`);
  print(`  Margine di contribuzione ........ ${Money.formatCompact(ce.margineDiContribuzione)}`);
  print(`  Patrimonio netto ................ ${Money.formatCompact(sp.patrimonioNetto)}`);
  print(`  Posizione finanziaria netta ..... ${Money.formatCompact(sp.posizioneFinanziariaNetta)}`);
  print();
  print('  Indici principali');
  const chiavi: readonly (keyof FinancialIndicators)[] = [
    'roi',
    'ebitdaMargin',
    'currentRatio',
    'quickRatio',
    'equityRatio',
    'indiceIndebitamento',
    'pfnSuEbitda',
    'coperturaOneriFinanziari',
    'cicloCircolante',
    'crescitaRicavi',
  ];
  for (const chiave of chiavi) {
    const meta = INDICATOR_META[chiave];
    print(`    ${meta.label.padEnd(32, '.')} ${formatIndicator(chiave, analisi.indicatori[chiave])}`);
  }
}

// ── Score ────────────────────────────────────────────────────────────────────
print();
print('COMPOSIZIONE DELLO SCORE DI CREDITO');
print(line());
for (const fattore of analisi.creditScore.value.factors) {
  const punteggio =
    fattore.score === null ? ' n.d.' : `${Math.round(fattore.score).toString().padStart(3)}/100`;
  print(
    `  ${fattore.label.padEnd(30, ' ')} peso ${(fattore.weight * 100).toFixed(0).padStart(3)}%   ${punteggio}`,
  );
  print(`      ${fattore.rationale}`);
}
if (analisi.altman?.value != null) {
  print();
  print(`  Altman Z'' = ${analisi.altman.value.z.toFixed(2)} → ${analisi.altman.value.zone}`);
}

print();
print('  Fido consigliato — dettaglio del calcolo');
print(indent(renderExplanation(analisi.creditLimit.explanation), 2));

// ── Rischi ───────────────────────────────────────────────────────────────────
print();
print(`REGISTRO DEI RISCHI — ISO 31000:2018  (${analisi.rischi.risks.length} rischi)`);
print(line());
for (const [categoria, rischi] of risksByCategory(analisi.rischi)) {
  print();
  print(`  ${RISK_CATEGORY_LABEL[categoria].toUpperCase()}`);
  for (const rischio of rischi) {
    const marchio = rischio.daVerificare ? ' ⚠ da verificare' : '';
    print(
      `    ${rischio.definition.label.padEnd(46, ' ')} ` +
        `inerente ${String(rischio.inherentScore).padStart(2)} → residuo ${String(rischio.residualScore).padStart(2)} ` +
        `[${rischio.residualLevel}] · ${rischio.treatment}${marchio}`,
    );
    print(
      `        P: ${LIKELIHOOD_LABEL[rischio.residualLikelihood]} · I: ${IMPACT_LABEL[rischio.residualImpact]}`,
    );
    for (const regola of rischio.identificationRules) {
      print(`        · ${regola.rationale}`);
    }
    for (const regola of [...rischio.modulationRules, ...rischio.controlRules]) {
      const delta = `${segno(regola.likelihoodDelta)}P ${segno(regola.impactDelta)}I`;
      print(`        · [${delta}] ${regola.rationale}`);
    }
  }
}

// ── Somme assicurande ────────────────────────────────────────────────────────
print();
print('SOMME ASSICURANDE CALCOLATE DAL BILANCIO');
print(line());
const somme = analisi.sommeAssicurande;
const voci = [
  ['Fabbricati', somme.fabbricati],
  ['Macchinari e attrezzature', somme.contenuto],
  ['Merci e scorte', somme.scorte],
  ['Danni indiretti (BI)', somme.danniIndiretti],
  ['Massimale RCT', somme.massimaleRct],
  ['Massimale RCO per persona', somme.massimaleRcoPerPersona],
  ['Massimale Cyber', somme.massimaleCyber],
] as const;
for (const [label, voce] of voci) {
  print(
    `  ${label.padEnd(32, '.')} ${Money.formatCompact(voce.value).padStart(14)}   [confidenza ${voce.confidence}]`,
  );
}
print();
print(indent(renderExplanation(somme.danniIndiretti.explanation), 2));

// ── CAT NAT ──────────────────────────────────────────────────────────────────
print();
print('OBBLIGO ASSICURATIVO CATASTROFALE (CAT NAT)');
print(line());
print(indent(renderExplanation(analisi.catNat.explanation), 2));

// ── Gap analysis ─────────────────────────────────────────────────────────────
print();
print('GAP ANALYSIS — PIANO D’AZIONE');
print(line());
for (const gap of analisi.gap.gaps) {
  const capitale =
    gap.capitaleRaccomandato.value === null
      ? 'da definire'
      : Money.formatCompact(gap.capitaleRaccomandato.value);
  const inEssere = gap.capitaleInEssere === null ? '—' : Money.formatCompact(gap.capitaleInEssere);
  print();
  print(
    `  [${String(gap.priorita).padStart(3)}] ${gap.definition.label}  ` +
      `→ ${GAP_STATUS_LABEL[gap.status].toUpperCase()}${gap.obbligoDiLegge ? '  ⚖ OBBLIGO DI LEGGE' : ''}`,
  );
  print(`        Consigliato: ${capitale}   ·   In essere: ${inEssere}`);
  print(`        Azione: ${gap.azione}`);
  if (gap.sottoassicurazione?.value?.sottoassicurata === true) {
    const u = gap.sottoassicurazione.value;
    print(
      `        ⚠ Su un danno di ${Money.formatCompact(u.simulazione.danno)} l’indennizzo sarebbe ` +
        `${Money.formatCompact(u.simulazione.indennizzo)}: ` +
        `${Money.formatCompact(u.simulazione.aCaricoAssicurato)} a carico dell’impresa (art. 1907 c.c.).`,
    );
  }
  print(`        Adeguatezza: ${gap.motivazioneAdeguatezza}`);
}

print();
print(line('═'));
print(
  `  Coperture assenti: ${analisi.gap.coperturaAssente} · ` +
    `inadeguate: ${analisi.gap.coperturaInadeguata} · ` +
    `adeguate: ${analisi.gap.coperturaAdeguata}`,
);
print(
  `  Premio annuo in essere: ${analisi.gap.premioInEssere === null ? 'n.d.' : Money.formatCompact(analisi.gap.premioInEssere)}`,
);
print(line('═'));
print();

// ─────────────────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date,
  );
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

function segno(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? String(value) : ' 0';
}
