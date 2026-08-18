import { defineConfig } from 'drizzle-kit';

/**
 * Configurazione delle migrazioni versionate.
 *
 * In sviluppo lo schema si crea all'avvio su PGlite, idempotente e senza cerimonie.
 * In produzione no: creare tabelle a runtime su un database con dati reali è una pratica
 * che prima o poi si paga, e non lascia traccia di cosa è cambiato e quando. Da qui in
 * avanti ogni modifica allo schema diventa un file SQL numerato, revisionabile in una code
 * review e applicabile in ordine su qualunque installazione.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrazioni',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/aegis',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
