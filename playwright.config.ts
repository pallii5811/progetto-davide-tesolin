import { defineConfig, devices } from '@playwright/test';
import { CARTELLA_DATI, INDIRIZZO_API, INDIRIZZO_WEB, PORTA_API, PORTA_WEB } from './collaudo/ambiente.js';

/**
 * Collaudo su browser reale.
 *
 * Esiste per una ragione precisa e documentata: due guasti che rompevano funzioni
 * centrali — il salvataggio dell'intervista e la pagina dei cataloghi — sono rimasti
 * invisibili per giorni. Nessun test li vedeva, perché la suite gira senza autenticazione
 * e senza browser, mentre entrambi i guasti nascevano proprio lì.
 *
 * Qui il software viene usato come lo userebbe un broker: con un browser, con una
 * sessione vera, cliccando.
 */
export default defineConfig({
  testDir: './collaudo',
  testMatch: '**/*.spec.ts',

  // I collaudi condividono un solo archivio: eseguirli in parallelo li farebbe
  // interferire fra loro, e un fallimento intermittente è peggio di nessun collaudo.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,

  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: INDIRIZZO_WEB,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    // Traccia e schermata solo quando qualcosa fallisce: servono a capire perché,
    // non ad accumulare cartelle.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'preparazione', testMatch: /preparazione\.setup\.ts/ },
    {
      name: 'scrivania',
      dependencies: ['preparazione'],
      // Le schermate non asseriscono nulla: si catturano a richiesta, non a ogni giro.
      grepInvert: /@visuale/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'schermate',
      dependencies: ['preparazione'],
      grep: /@visuale/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npx tsx apps/api/src/main.ts',
      url: `${INDIRIZZO_API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(PORTA_API),
        HOST: '127.0.0.1',
        AEGIS_DATA_DIR: CARTELLA_DATI,
        AEGIS_TENANT: 'Studio di collaudo',
        // Nessun token: si lavora sui dati dimostrativi, e il collaudo non costa nulla.
        OPENAPI_TOKEN: '',
      },
    },
    {
      command: 'npm run dev --workspace @aegis/web',
      url: INDIRIZZO_WEB,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(PORTA_WEB),
        AEGIS_API_URL: INDIRIZZO_API,
      },
    },
  ],
});
