/**
 * @aegis/db — schema e politiche di accesso ai dati.
 *
 * Il pacchetto espone lo schema, non una connessione: chi lo usa decide il driver
 * (`postgres` in produzione, PGlite in sviluppo) e passa il client a Drizzle.
 */

export * as schema from './schema.js';
export * from './rls.js';
export * from './client.js';
export * from './repositories.js';
export * from './utenti.js';
export * from './monitoraggio.js';
export * from './compagnie.js';
