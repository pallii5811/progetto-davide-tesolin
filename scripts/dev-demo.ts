/**
 * Avvio in modalità dimostrativa, con il token configurato.
 *
 *   npm run dev:api:demo
 *
 * Serve a provare la piattaforma senza consumare credito anche quando `.env` contiene un
 * token valido: azzera la variabile **nell'ambiente**, che ha la precedenza sul file.
 *
 * Esiste come script e non come istruzione da ricordare perché la differenza fra i due
 * comandi è denaro: affidarla alla memoria significa, prima o poi, spendere per sbaglio.
 */

process.env['OPENAPI_TOKEN'] = '';

// Importato dopo l'azzeramento: il servizio legge la configurazione all'avvio.
await import('../apps/api/src/main.js');
