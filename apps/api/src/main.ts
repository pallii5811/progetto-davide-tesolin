/** Punto di ingresso del servizio API. */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caricaEnv } from './ambiente.js';
import { demoPolizze } from '@aegis/core';
import { predisponiPrimoAccesso, stampaCredenzialiIniziali } from './avvio.js';
import { creaPersistenza } from './persistenza.js';
import { buildServer } from './server.js';

// Prima di leggere qualunque variabile: chi mette il token in `.env` si aspetta che il
// servizio lo usi, e le variabili già presenti nell'ambiente restano prevalenti.
const env = caricaEnv();

const PORT = Number.parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '127.0.0.1';
const MODALITA_DEMO = (process.env['OPENAPI_TOKEN'] ?? '').trim() === '';

/**
 * Cartella di persistenza.
 *
 * Senza `DATABASE_URL` si usa PGlite su disco: PostgreSQL vero, compilato in WebAssembly,
 * che gira nel processo Node. Nessun Docker, nessun servizio da avviare — **e i dati
 * sopravvivono al riavvio**, che è ciò che distingue uno strumento di lavoro da una demo.
 *
 * Il percorso è ancorato alla posizione di questo file, non alla cartella di lavoro:
 * `npm run dev:api` dalla radice e `npm run dev` dentro `apps/api` hanno cartelle correnti
 * diverse, e un percorso relativo farebbe nascere **due database distinti** per lo stesso
 * servizio. Il sintomo — un archivio che appare vuoto — sembrerebbe una perdita di dati.
 */
const RADICE_REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const CARTELLA_DATI = process.env['AEGIS_DATA_DIR'] ?? resolve(RADICE_REPOSITORY, '.dati');

const persistenza = await creaPersistenza({
  url: process.env['DATABASE_URL'],
  cartellaDati: process.env['DATABASE_URL'] === undefined ? CARTELLA_DATI : undefined,
  denominazioneTenant: process.env['AEGIS_TENANT'] ?? 'Intermediario predefinito',
});

// In modalità dimostrativa una delle tre aziende parte con polizze già in portafoglio,
// così la gap analysis mostra sia il caso «cliente da lavorare» sia quello «cliente
// già assistito, ma con capitali fermi al 2019».
if (MODALITA_DEMO) {
  const contesto = persistenza.perTenant(persistenza.tenantPredefinito);
  const esistente = await contesto.dossier.get('03158460174');
  if (esistente === null || esistente.polizze.length === 0) {
    await contesto.dossier.upsert('03158460174', { polizze: demoPolizze() });
  }
}

// Primo avvio: se non esiste alcun utente se ne crea uno amministratore, con password
// generata e mostrata una volta sola. Nessun `admin/admin` predefinito.
const predisposizione = await predisponiPrimoAccesso(
  persistenza,
  process.env['AEGIS_ADMIN_EMAIL'] ?? 'admin@aegis.local',
);
if (predisposizione.creato && predisposizione.email !== null && predisposizione.password !== null) {
  stampaCredenzialiIniziali(predisposizione.email, predisposizione.password);
}

const app = buildServer({ logger: true, persistenza });

/** Chiusura ordinata: le connessioni al database vanno rilasciate, non abbandonate. */
for (const segnale of ['SIGINT', 'SIGTERM'] as const) {
  process.on(segnale, () => {
    void (async (): Promise<void> => {
      app.log.info('Arresto in corso…');
      await app.close();
      await persistenza.chiudi();
      process.exit(0);
    })();
  });
}

try {
  await app.listen({ port: PORT, host: HOST });
  if (env.da !== null) app.log.info(`Configurazione letta da ${env.da} (${env.caricate} variabili)`);
  app.log.info(
    MODALITA_DEMO
      ? 'Provider dati: demo. Impostare OPENAPI_TOKEN per usare i dati reali.'
      : 'Provider dati: OpenAPI.com — DATI REALI: ogni analisi consuma credito.',
  );
  app.log.info(`Persistenza: ${persistenza.descrizione}`);
} catch (error) {
  app.log.error(error);
  await persistenza.chiudi();
  process.exit(1);
}
