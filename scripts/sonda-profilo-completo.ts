/**
 * Sonda del servizio `IT-full`.
 *
 * **Una sola chiamata a pagamento** (48 centesimi), su un'azienda della quale abbiamo già
 * la risposta `IT-advanced` registrata: il confronto dice esattamente cosa si compra in
 * più con i trentotto centesimi di differenza.
 *
 * Esiste perché la lezione più cara di questo progetto è che le risposte vere non
 * somigliano a quelle che si immaginano: prima di scrivere un mapper si guarda il dato.
 * La risposta grezza finisce in `.sonda/`, escluso dal controllo di versione perché
 * contiene i dati di un'impresa reale.
 *
 *   npx tsx scripts/sonda-profilo-completo.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { caricaEnv } from '../apps/api/src/ambiente.js';

caricaEnv();

const token = process.env['OPENAPI_TOKEN']?.trim() ?? '';
if (token === '') {
  console.error('OPENAPI_TOKEN non impostato.');
  process.exit(1);
}

const PIVA = '12485671007';

console.log(`GET company.openapi.com/IT-full/${PIVA}`);
console.log(`token: ${token.slice(0, 4)}…${token.slice(-4)} · costo a listino: 0,48 €\n`);

const risposta = await fetch(`https://company.openapi.com/IT-full/${PIVA}`, {
  headers: { Authorization: `Bearer ${token}` },
});

const testo = await risposta.text();
mkdirSync('.sonda', { recursive: true });
writeFileSync(`.sonda/prod-IT-full-${PIVA}.json`, testo, 'utf8');

console.log(`HTTP ${risposta.status}`);
if (!risposta.ok) {
  console.log(testo.slice(0, 400));
  process.exit(1);
}

const corpo = JSON.parse(testo) as { data?: unknown };
const dati = (Array.isArray(corpo.data) ? corpo.data[0] : corpo.data) as Record<string, unknown>;

console.log(`campi: ${Object.keys(dati).length}\n`);

/** Quanti elementi porta una sezione, o `—` se non è un elenco. */
function misura(valore: unknown): string {
  if (Array.isArray(valore)) return `${valore.length} elementi`;
  if (valore === null || valore === undefined) return 'assente';
  if (typeof valore === 'object') return `${Object.keys(valore).length} campi`;
  if (typeof valore === 'number' || typeof valore === 'boolean') return String(valore);
  return typeof valore === 'string' ? valore.slice(0, 40) : typeof valore;
}

// Le sezioni che colmerebbero le lacune dichiarate nel prodotto.
const ATTESE = [
  'managers',
  'branches',
  'shareholders',
  'corporateGroups',
  'subsidiaries',
  'affiliateCompanies',
  'employees',
  'contacts',
  'financialStatementKpi',
  'liquidityRatios',
  'profitability',
  'leverageRatios',
  'productionValue',
  'netWorth',
  'debts',
] as const;

console.log('sezioni che interessano al prodotto:');
for (const chiave of ATTESE) {
  console.log(`  ${chiave.padEnd(24)} ${misura(dati[chiave])}`);
}

console.log('\ntutti i campi ricevuti:');
console.log(Object.keys(dati).join(', '));
