/**
 * Genera il lookup sismica comunale dal CSV ufficiale Protezione Civile.
 *
 * Fonte: https://rischi.protezionecivile.gov.it/ — classificazione aggiornata maggio 2025.
 * Non si edita a mano: si riesegue lo script quando esce un aggiornamento.
 *
 * Uso:
 *   npx tsx scripts/genera-sismica-comunale.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizzaComune } from '../packages/core/src/risk/geo.js';

const qui = dirname(fileURLToPath(import.meta.url));
const radice = join(qui, '..');
const csvPath = join(radice, 'packages/core/src/risk/data/classificazione-sismica-maggio-2025.csv');
const outPath = join(radice, 'packages/core/src/risk/data/sismica-comunale.ts');

/**
 * Livello assicurativo dalla zona PC (può essere composta: «2A-3A-3B»).
 * Si prende la cifra più bassa = pericolosità più alta.
 */
export function livelloDaZona(zonaGrezza: string): 'alta' | 'media' | 'bassa' | null {
  const pezzi = zonaGrezza.trim().split(/[-/]/);
  let peggiore: number | null = null;
  for (const pezzo of pezzi) {
    const m = /^(\d)/.exec(pezzo.trim());
    if (m === null) continue;
    const n = Number(m[1]);
    if (peggiore === null || n < peggiore) peggiore = n;
  }
  if (peggiore === null) return null;
  if (peggiore <= 2) return 'alta';
  if (peggiore === 3) return 'media';
  if (peggiore === 4) return 'bassa';
  return null;
}

const grezzo = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const righe = grezzo.split(/\r?\n/).filter((r) => r.length > 0);
const header = righe[0]?.split(';') ?? [];
const iSigla = header.indexOf('SIGLA_PROV');
const iComune = header.indexOf('COMUNE');
const iZona = header.indexOf('ZONA_SISMICA');
if (iSigla < 0 || iComune < 0 || iZona < 0) {
  throw new Error(`Intestazione CSV inattesa: ${header.join('|')}`);
}

/** Chiave `sigla|comuneNormalizzato` → livello. */
const mappa: Record<string, 'alta' | 'media' | 'bassa'> = {};
let saltate = 0;

for (let i = 1; i < righe.length; i++) {
  const celle = righe[i]!.split(';');
  const sigla = (celle[iSigla] ?? '').trim().toUpperCase();
  const comune = (celle[iComune] ?? '').trim();
  const zona = (celle[iZona] ?? '').trim();
  if (sigla === '' || comune === '') {
    saltate += 1;
    continue;
  }
  const livello = livelloDaZona(zona);
  if (livello === null) {
    saltate += 1;
    continue;
  }
  const chiave = `${sigla}|${normalizzaComune(comune)}`;
  const precedente = mappa[chiave];
  // A parità di chiave si tiene il peggiore (poco frequente; fusioni/sottozone).
  if (
    precedente === undefined ||
    (livello === 'alta' && precedente !== 'alta') ||
    (livello === 'media' && precedente === 'bassa')
  ) {
    mappa[chiave] = livello;
  }
}

mkdirSync(dirname(outPath), { recursive: true });
const payload = {
  fonte: 'Dipartimento della Protezione Civile — classificazione sismica aggiornata maggio 2025',
  generatoIl: new Date().toISOString().slice(0, 10),
  comuni: Object.keys(mappa).length,
  livelli: mappa,
};

const corpo =
  `/**\n` +
  ` * Generato da scripts/genera-sismica-comunale.ts — non editare a mano.\n` +
  ` * Fonte: ${payload.fonte}\n` +
  ` * Generato il: ${payload.generatoIl} · ${payload.comuni} comuni\n` +
  ` */\n\n` +
  `export const sismicaComunale = ${JSON.stringify(payload)} as const;\n`;

writeFileSync(outPath, corpo, 'utf8');

console.log(`Scritti ${payload.comuni} comuni → ${outPath} (saltate ${saltate})`);
console.log(`Esempio Milano: ${mappa['MI|milano'] ?? '—'}`);
console.log(`Esempio L'Aquila: ${mappa['AQ|laquila'] ?? '—'}`);
console.log(`Esempio Abbiategrasso: ${mappa['MI|abbiategrasso'] ?? '—'}`);
