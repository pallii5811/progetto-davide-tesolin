/**
 * Applica le migrazioni versionate a PostgreSQL.
 *
 *   DATABASE_URL=postgresql://… npm run migra
 *
 * È il percorso di produzione. In sviluppo lo schema nasce da solo su PGlite, ma su un
 * database con dati reali le tabelle non si creano a runtime: si applicano file SQL
 * numerati, in ordine, e drizzle tiene traccia di quali sono già passati. Rieseguire il
 * comando non ripete nulla.
 *
 * Non si connette mai a PGlite: se `DATABASE_URL` manca, si ferma. Un comando di
 * migrazione che «riesce» su un database sbagliato è peggio di uno che fallisce.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env['DATABASE_URL']?.trim();

async function main(): Promise<void> {
  if (url === undefined || url === '') {
    console.error(
      '\n  DATABASE_URL non impostata.\n\n' +
        '  In sviluppo non serve: lo schema si crea da solo sul cluster PGlite in `.dati`.\n' +
        '  Questo comando riguarda solo PostgreSQL in produzione.\n',
    );
    process.exit(1);
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  // Una sola connessione: le migrazioni sono sequenziali e un pool non aiuta.
  const client = postgres(url, { max: 1, onnotice: () => undefined });

  try {
    const cartella = resolve(fileURLToPath(new URL('..', import.meta.url)), 'packages/db/migrazioni');
    console.log(`  Migrazioni da: ${cartella}`);
    console.log(`  Database:      ${url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}\n`);

    await migrate(drizzle(client), { migrationsFolder: cartella });
    console.log('  Schema allineato.\n');
  } finally {
    await client.end();
  }
}

main().catch((errore: unknown) => {
  console.error(errore);
  process.exit(1);
});
