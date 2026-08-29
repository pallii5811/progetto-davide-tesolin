/**
 * Sonda della verifica eventi negativi (`IT-negativita`).
 *
 * **Una sola pratica a pagamento** (45 centesimi). Il servizio è asincrono: il POST apre
 * la pratica, lo stato si legge su un percorso, il risultato su un altro — e le due
 * letture sono gratuite.
 *
 * Serve a confermare tre cose che finora erano dedotte dalla documentazione e mai viste:
 * il percorso dello stato sul dominio del rischio, quello del risultato, e la forma della
 * risposta su cui è scritto il mapper. La risposta grezza finisce in `.sonda/`, escluso
 * dal controllo di versione.
 *
 *   npx tsx scripts/sonda-negativita.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { caricaEnv } from '../apps/api/src/ambiente.js';
import { OPENAPI_DEFAULT_CONFIG } from '@aegis/providers';

caricaEnv();

const token = process.env['OPENAPI_TOKEN']?.trim() ?? '';
if (token === '') {
  console.error('OPENAPI_TOKEN non impostato.');
  process.exit(1);
}

const PIVA = '12485671007';
const config = OPENAPI_DEFAULT_CONFIG;
const intestazioni = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const attesa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

console.log(`token: ${token.slice(0, 4)}…${token.slice(-4)} · pratica: 0,45 €\n`);

// ── 1. Apertura della pratica ────────────────────────────────────────────────
console.log(`POST ${config.baseUrlRisk}${config.services.eventiNegativi.path}`);
const avvio = await fetch(`${config.baseUrlRisk}${config.services.eventiNegativi.path}`, {
  method: 'POST',
  headers: intestazioni,
  body: JSON.stringify({ cf_piva: PIVA }),
});

/** Il corpo dichiarato con i tipi che servono: leggere `unknown` e stringificarlo mente. */
const corpoAvvio = (await avvio.json()) as {
  data?: { id?: string; status?: string; state?: string };
  message?: string;
};
console.log(`HTTP ${avvio.status}`);
if (!avvio.ok) {
  console.log(JSON.stringify(corpoAvvio).slice(0, 400));
  process.exit(1);
}

const dati = corpoAvvio.data ?? {};
const richiestaId = String(dati['id'] ?? '');
console.log(
  `  pratica ${richiestaId} · stato iniziale: ${String(dati['status'] ?? dati['state'] ?? '?')}\n`,
);

if (richiestaId === '') {
  console.log('Nessun identificativo nella risposta:', JSON.stringify(corpoAvvio).slice(0, 300));
  process.exit(1);
}

// ── 2. Attesa dell'esito (letture gratuite) ──────────────────────────────────
const percorsoStato = config.percorsoStatoRichiestaRischio.replace('{id}', richiestaId);
let stato = '';

for (const pausa of [1000, 2000, 3000, 5000, 8000, 12_000]) {
  await attesa(pausa);
  const risposta = await fetch(`${config.baseUrlRisk}${percorsoStato}`, { headers: intestazioni });
  const corpo = (await risposta.json()) as { data?: { status?: string; state?: string } };
  stato = corpo.data?.status ?? corpo.data?.state ?? '';
  console.log(`  GET ${percorsoStato} → HTTP ${risposta.status} · stato «${stato}»`);
  if (/DONE|COMPLET|OK|SUCCESS/i.test(stato)) break;
  if (/ERROR|FAIL|KO|REJECT/i.test(stato)) break;
}

// ── 3. Lettura del risultato ─────────────────────────────────────────────────
const percorsoRisultato = config.percorsoRisultatoNegativita.replace('{id}', richiestaId);
console.log(`\nGET ${percorsoRisultato}`);

const dettaglio = await fetch(`${config.baseUrlRisk}${percorsoRisultato}`, { headers: intestazioni });
const testo = await dettaglio.text();

mkdirSync('.sonda', { recursive: true });
writeFileSync(`.sonda/prod-IT-negativita-${PIVA}.json`, testo, 'utf8');

console.log(`HTTP ${dettaglio.status}`);
if (!dettaglio.ok) {
  console.log(testo.slice(0, 400));
  process.exit(1);
}

const corpo = JSON.parse(testo) as { data?: Record<string, unknown> };
const risultato = corpo.data ?? {};

console.log(`campi: ${Object.keys(risultato).join(', ')}`);
for (const [chiave, valore] of Object.entries(risultato)) {
  const misura = Array.isArray(valore) ? `${valore.length} elementi` : JSON.stringify(valore);
  console.log(`  ${chiave.padEnd(24)} ${String(misura).slice(0, 60)}`);
}
