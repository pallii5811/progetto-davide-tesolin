import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Regole di lint.
 *
 * Il criterio di selezione: entrano solo le regole che intercettano un errore che il
 * compilatore non vede già. Una configurazione che segnala trecento problemi di stile
 * viene disattivata dopo una settimana, e con essa se ne vanno anche i controlli utili.
 *
 * Le tre regole che qui contano davvero — `no-floating-promises`, `no-misused-promises`
 * e `switch-exhaustiveness-check` — riguardano codice che compila ma sbaglia: una promise
 * non attesa su una chiamata a pagamento, o un ramo dimenticato dopo l'aggiunta di una
 * copertura al catalogo.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/*.config.mjs',
      '**/*.config.ts',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Elenco esplicito dei progetti. `tsconfig.lint.json` copre test e script, che
        // sono esclusi dai tsconfig di build per non finire in `dist` ma devono comunque
        // essere analizzati con le informazioni di tipo: senza, i tipi importati dai
        // pacchetti di dominio degradano ad `any` e il lint diventa rumore.
        project: [
          './packages/core/tsconfig.json',
          './packages/providers/tsconfig.json',
          './packages/db/tsconfig.json',
          './apps/api/tsconfig.json',
          './apps/web/tsconfig.json',
          './tsconfig.lint.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Una promise non attesa su una chiamata a pagamento significa dati mai arrivati
      // e costo comunque sostenuto, senza alcun errore visibile.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Aggiungere una copertura al catalogo senza gestirla nel calcolo dei capitali
      // produrrebbe un `undefined` silenzioso: qui diventa un errore di compilazione.
      // Un `default` esplicito conta come gestione: dove il comportamento di ripiego è
      // corretto per definizione (una copertura nuova non ha ancora una base economica),
      // costringere a elencare 23 casi produrrebbe solo codice che nessuno rilegge.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],

      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // Il dominio non deve mai stampare: gli effetti collaterali stanno ai bordi.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // I gestori di rotta Fastify hanno firma asincrona imposta dal framework: molti
  // rispondono senza attendere nulla, ed è corretto così.
  {
    files: ['apps/api/src/server.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  // I test possono permettersi asserzioni non tipizzate sulle risposte JSON.
  {
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // I doppi di `fetch` restituiscono una promessa già risolta: `async` senza `await`
      // è la forma più leggibile per scriverli.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Gli script di dimostrazione e la predisposizione al primo avvio stampano a terminale:
  // è il loro scopo, ed è l'unico modo di consegnare una password iniziale senza scriverla
  // su disco.
  {
    files: ['scripts/**/*.ts', 'apps/api/src/avvio.ts'],
    rules: { 'no-console': 'off' },
  },

  /*
    Gli strumenti in `strumenti/` sono JavaScript puro, fuori da ogni tsconfig.
    L'analisi con le informazioni di tipo non può quindi essere applicata — il parser
    fallisce con «file not found in any of the provided projects», e quel fallimento
    contava come errore: bastava a tenere rosso `npm run verifica` per tutti.
    Si continuano a controllare le regole che non richiedono i tipi, e stampano
    a terminale perché è il loro scopo.
  */
  {
    files: ['strumenti/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      // Le opzioni del parser vanno **conservate**, non sostituite: è lì dentro che
      // `disableTypeChecked` spegne il progetto TypeScript. Rimpiazzare l'intero blocco
      // riporterebbe l'errore di analisi che si stava togliendo.
      ...tseslint.configs.disableTypeChecked.languageOptions,
      // Senza i tipi si perdono anche i globali di Node: dichiarati a mano, i due che
      // servono davvero, per non dipendere da un pacchetto che nessuno ha richiesto.
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-console': 'off' },
  },

  prettier,
);
