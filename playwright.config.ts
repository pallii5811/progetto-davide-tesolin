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
  /*
    Tempi tarati sul caso peggiore, non su quello medio.

    Questi collaudi girano contro il **server di sviluppo** di Next, che compila le rotte
    alla prima richiesta e ricompila a ogni modifica: la durata di un'attesa dipende da
    quanto è carica la macchina, non da quanto è corretto il software. Con quindici secondi
    la stessa suite passava in sei minuti e falliva in dieci, sempre su collaudi diversi —
    un rosso intermittente che insegna a non fidarsi della suite, che è il danno peggiore
    che un collaudo possa fare.

    Alzarli non nasconde nulla: un'asserzione che passa, passa nello stesso tempo di prima.
    Cambia solo quanto si attende prima di dichiarare un fallimento.
  */
  timeout: 90_000,
  expect: { timeout: 30_000 },

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
