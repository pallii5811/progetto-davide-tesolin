/**
 * Diagnostica delle autorizzazioni del token.
 *
 *   npm run diagnostica
 *
 * I token OpenAPI.com sono **per scope**, non per account: avere credito non basta, il
 * token va autorizzato al singolo servizio dalla console. Un `401 Wrong Token` su un
 * servizio e un `200` su un altro, con lo stesso token, è la norma — non un guasto.
 *
 * Questo strumento verifica ogni servizio configurato e dice *quale* autorizzazione manca.
 * Costo: **zero**. Sonda i servizi con un identificativo deliberatamente inesistente:
 * un `401` arriva prima della lavorazione, e un `404` non viene fatturato. Se un servizio
 * risponde `200` la sonda si ferma prima di aprire pratiche a pagamento.
 */

import { caricaEnv } from '../apps/api/src/ambiente.js';
import { OPENAPI_DEFAULT_CONFIG, verificaAutorizzazioni } from '@aegis/providers';

async function main(): Promise<void> {
  // Legge `.env` come fa il servizio: chiedere all'utente di ricordarsi `--env-file`
  // significa vedersi rispondere «token non impostato» con il token impostato.
  caricaEnv();
  const token = process.env['OPENAPI_TOKEN']?.trim() ?? '';
  if (token === '') {
    console.error('OPENAPI_TOKEN non impostato. Creare .env partendo da .env.example.');
    process.exit(1);
  }

  const config = OPENAPI_DEFAULT_CONFIG;
  console.log('');
  console.log(`Token ${token.slice(0, 4)}…${token.slice(-4)} — verifica delle autorizzazioni`);
  console.log('─'.repeat(78));
  console.log('');

  // La verifica vive nel pacchetto, non qui: la stessa logica alimenta la pagina
  // «Servizi dati» dell'interfaccia, e due copie darebbero due risposte diverse.
  const esiti = await verificaAutorizzazioni({ token, config });

  for (const esito of esiti) {
    const simbolo = esito.stato === 'autorizzato' ? '✔' : esito.stato === 'non-autorizzato' ? '✖' : '?';
    console.log(`${simbolo} ${esito.chiave.padEnd(20, ' ')} ${esito.dettaglio}`);
    console.log(`  ${' '.repeat(20)} ${esito.descrizione} · ${(esito.costoCentesimi / 100).toFixed(2)} €`);
    console.log('');
  }

  const mancanti = esiti.filter((e) => e.stato === 'non-autorizzato');
  console.log('─'.repeat(78));

  if (mancanti.length === 0) {
    console.log('Tutti i servizi configurati sono autorizzati.');
  } else {
    console.log('Autorizzazioni da aggiungere dalla console OpenAPI.com:');
    for (const esito of mancanti) {
      console.log(`  · ${esito.scope}  →  ${esito.descrizione}`);
    }
    console.log('');
    console.log('  Console → API Keys → modifica il token → aggiungi lo scope → salva.');
    console.log('  Non serve acquistare nulla: è una modifica di autorizzazione, non di credito.');
  }
  console.log('');
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : errore);
  process.exit(1);
});
