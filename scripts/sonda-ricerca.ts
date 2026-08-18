/**
 * Sonda del servizio di ricerca `/IT-search`, in modalità `dryRun` (gratuita).
 *
 * Restituisce quante aziende corrispondono ai filtri e quanto costerebbe ottenerle.
 * Serve a calibrare i filtri prima di scriverci sopra un'interfaccia: un campo che
 * l'utente compila come si aspetta ma che il fornitore interpreta diversamente produce
 * zero risultati, e nessuno capisce perché.
 *
 *   npx tsx scripts/sonda-ricerca.ts
 */

import { caricaEnv } from '../apps/api/src/ambiente.js';

caricaEnv();

const token = process.env['OPENAPI_TOKEN'] ?? '';
if (token.trim() === '') {
  console.error('Nessun token in .env: la sonda non parte.');
  process.exit(1);
}

const PROVE: readonly (readonly [string, Record<string, string>])[] = [
  ['start, limite 10', { province: 'BS', atecoCode: '2562', dataEnrichment: 'start', limit: '10' }],
  ['start, limite 25', { province: 'BS', atecoCode: '2562', dataEnrichment: 'start', limit: '25' }],
  ['start, senza limite', { province: 'BS', atecoCode: '2562', dataEnrichment: 'start' }],
  ['start, limite 10, altra prov.', { province: 'TV', minEmployees: '50', dataEnrichment: 'start', limit: '10' }],
];

for (const [nome, filtri] of PROVE) {
  const parametri = new URLSearchParams({ ...filtri, activityStatus: 'ATTIVA', dryRun: '1' });
  const risposta = await fetch(`https://company.openapi.com/IT-search?${parametri.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const corpo = (await risposta.json()) as { count?: number; cost?: number; message?: string };
  console.log(
    `${nome.padEnd(30)} HTTP ${risposta.status}  count=${corpo.count ?? '—'}  cost=${corpo.cost ?? '—'} €`,
  );
}
