/**
 * Diagnostica delle autorizzazioni del token.
 *
 *   npx tsx --env-file=.env scripts/diagnostica.ts
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

import { OPENAPI_DEFAULT_CONFIG } from '@aegis/providers';
import type { ServiceConfig } from '@aegis/providers';

/** P.IVA formalmente valida ma non attribuita: nessuna lavorazione, nessun addebito. */
const IDENTIFICATIVO_INESISTENTE = '00000000000';

interface Esito {
  readonly chiave: string;
  readonly servizio: ServiceConfig;
  readonly stato: 'autorizzato' | 'non-autorizzato' | 'non-raggiungibile';
  readonly dettaglio: string;
}

async function verifica(
  chiave: string,
  servizio: ServiceConfig,
  baseUrl: string,
  token: string,
): Promise<Esito> {
  const url = `${baseUrl}${servizio.path.replace('{id}', IDENTIFICATIVO_INESISTENTE)}`;

  try {
    const risposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (risposta.status === 401 || risposta.status === 403) {
      return {
        chiave,
        servizio,
        stato: 'non-autorizzato',
        dettaglio: `HTTP ${risposta.status} — il token non ha lo scope «${servizio.scope}»`,
      };
    }

    // Qualunque altra risposta (200, 404, 400) implica che l'autorizzazione c'è:
    // il rifiuto per scope arriva prima di ogni altra valutazione.
    return {
      chiave,
      servizio,
      stato: 'autorizzato',
      dettaglio: `HTTP ${risposta.status} — scope «${servizio.scope}» attivo`,
    };
  } catch (errore) {
    return {
      chiave,
      servizio,
      stato: 'non-raggiungibile',
      dettaglio: errore instanceof Error ? errore.message : 'errore di rete',
    };
  }
}

async function main(): Promise<void> {
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

  const daVerificare: [string, ServiceConfig, string][] = [
    ['anagraficaBase', config.services.anagraficaBase, config.baseUrlCompany],
    ['anagraficaEstesa', config.services.anagraficaEstesa, config.baseUrlCompany],
    ['profiloCompleto', config.services.profiloCompleto, config.baseUrlCompany],
    ['eventiNegativi', config.services.eventiNegativi, config.baseUrlRisk],
  ];

  const esiti = await Promise.all(
    daVerificare.map(([chiave, servizio, baseUrl]) => verifica(chiave, servizio, baseUrl, token)),
  );

  for (const esito of esiti) {
    const simbolo = esito.stato === 'autorizzato' ? '✔' : esito.stato === 'non-autorizzato' ? '✖' : '?';
    console.log(`${simbolo} ${esito.chiave.padEnd(20, ' ')} ${esito.dettaglio}`);
    console.log(
      `  ${' '.repeat(20)} ${esito.servizio.descrizione} · ${(esito.servizio.costoCentesimi / 100).toFixed(2)} €`,
    );
    console.log('');
  }

  const mancanti = esiti.filter((e) => e.stato === 'non-autorizzato');
  console.log('─'.repeat(78));

  if (mancanti.length === 0) {
    console.log('Tutti i servizi configurati sono autorizzati.');
  } else {
    console.log('Autorizzazioni da aggiungere dalla console OpenAPI.com:');
    for (const esito of mancanti) {
      console.log(`  · ${esito.servizio.scope}  →  ${esito.servizio.descrizione}`);
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
