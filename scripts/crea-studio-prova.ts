/**
 * Crea un account di prova: uno studio nuovo, con un tetto di spesa complessivo per i dati, e il
 * suo primo utente amministratore con una password concordata.
 *
 *   DATABASE_URL=… npx tsx scripts/crea-studio-prova.ts <studio> <email> <nome> <password> <tetto in euro>
 *
 *   npx tsx scripts/crea-studio-prova.ts "Davide Tesolin (prova)" davide@demo.example "Davide Tesolin" '…' 5
 *
 * ── PERCHÉ ESISTE ─────────────────────────────────────────────────────────────
 *
 * Richiesta di Simone del 19/09/2026: un cliente che prova il prodotto e «in totale può usare
 * massimo 5 euro da OpenAPI». Uno studio suo, e non un utente nello studio del gestore: il tetto
 * è dello studio, e soprattutto il portafoglio di chi prova non deve vedere quello degli altri.
 *
 * Lo studio nasce con gli acquisti abilitati — è il gestore a crearlo, non serve attivarlo — e
 * con il tetto già scritto: non c'è un istante in cui esiste senza. Studio e utente nascono nella
 * stessa transazione, come dalla registrazione pubblica: o tutti e due, o nessuno.
 *
 * La password passa dagli stessi requisiti dell'applicazione (`verificaRequisitiPassword`) e
 * dalla stessa derivazione scrypt, come in `crea-utente.ts`. Il tetto si cambia o si toglie poi
 * da Impostazioni › Studi, colonna «Spesa dati».
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conPiattaforma,
  conTenant,
  connetti,
  creaStudio,
  creaUtente,
  trovaUtentePerEmail,
} from '@aegis/db';
import { derivaPassword, verificaRequisitiPassword } from '../apps/api/src/auth.js';

const USO = 'Uso: npx tsx scripts/crea-studio-prova.ts <studio> <email> <nome> <password> <tetto in euro>';

function cartellaPredefinita(): string {
  const radice = fileURLToPath(new URL('..', import.meta.url));
  return process.env['AEGIS_DATA_DIR'] ?? resolve(radice, '.dati');
}

/** «5», «5,00», «5.5» → centesimi. Zero è ammesso (nessun acquisto); il resto no. */
function centesimiDa(testo: string): number | undefined {
  const pulito = testo.trim().replace(/\s|€/g, '');
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(pulito)) return undefined;
  return Math.round(Number(pulito.replace(',', '.')) * 100);
}

async function main(): Promise<void> {
  const [studio, email, nome, password, tettoArg] = process.argv.slice(2);
  if (
    studio === undefined ||
    email === undefined ||
    nome === undefined ||
    password === undefined ||
    tettoArg === undefined
  ) {
    console.error(USO);
    process.exit(1);
  }

  if (studio.trim() === '' || nome.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('  Studio, nome ed email non possono essere vuoti, e l’email deve avere una @.');
    process.exit(1);
  }

  const requisiti = verificaRequisitiPassword(password);
  if (!requisiti.valida) {
    console.error(`  Password non accettabile: ${requisiti.problemi.join(' ')}`);
    console.error('  Sono gli stessi requisiti dell’applicazione: qui non si aggirano.');
    process.exit(1);
  }

  const tetto = centesimiDa(tettoArg);
  if (tetto === undefined) {
    console.error(`  Tetto non valido: «${tettoArg}». Un importo in euro, per esempio 5 o 5,00.`);
    process.exit(1);
  }

  const url = process.env['DATABASE_URL'];
  const connessione = await connetti({
    url,
    cartellaDati: url === undefined ? cartellaPredefinita() : undefined,
  });
  const db = connessione.db;
  console.log(`  Database: ${connessione.descrizione}`);

  try {
    // Gli indirizzi sono unici su tutta la piattaforma: il controllo attraversa gli studi.
    const gia = await conPiattaforma(db, (tx) => trovaUtentePerEmail(tx, email));
    if (gia !== null) {
      console.error(`  Esiste già un utente con l’indirizzo ${email}: nessuno studio creato.`);
      process.exit(1);
    }

    const tenantId = randomUUID();
    const passwordHash = await derivaPassword(password);
    const utenteId = await conTenant(db, tenantId, async (tx) => {
      await creaStudio(tx, studio.trim(), { id: tenantId, tettoSpesaTotaleCentesimi: tetto });
      return creaUtente(tx, {
        tenantId,
        email,
        nome: nome.trim(),
        passwordHash,
        ruolo: 'amministratore',
      });
    });

    console.log('');
    console.log(`  Studio creato:  ${studio.trim()}`);
    console.log(`  Tetto dati:     ${(tetto / 100).toFixed(2).replace('.', ',')} € in totale`);
    console.log(`  Utente:         ${email} (${nome.trim()}, amministratore)`);
    console.log(`  Id studio:      ${tenantId}`);
    console.log(`  Id utente:      ${utenteId}`);
    console.log('');
  } finally {
    await connessione.chiudi();
  }
}

await main();
