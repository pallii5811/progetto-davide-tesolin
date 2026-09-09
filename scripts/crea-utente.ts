/**
 * Crea un utente dal server, con una password scelta o generata.
 *
 *   DATABASE_URL=… npx tsx scripts/crea-utente.ts <email> <nome> [ruolo] [password]
 *
 *   ruolo: amministratore | broker | assistente | sola-lettura   (predefinito: broker)
 *
 * ── PERCHÉ ESISTE ─────────────────────────────────────────────────────────────
 *
 * Dall'interfaccia un utente si crea già, ma la password la **genera il sistema** e la
 * mostra una volta sola: è la scelta giusta per l'uso normale, perché una password decisa
 * da chi la consegna finisce quasi sempre per essere quella di sempre.
 *
 * Serve però la strada da riga di comando per due casi che l'interfaccia non copre: il
 * primo utente di uno studio quando nessuno è ancora entrato, e la consegna a un cliente
 * che deve provare il prodotto con una credenziale concordata a voce.
 *
 * La password passa dagli **stessi requisiti** dell'applicazione — `verificaRequisitiPassword`
 * — e dalla stessa derivazione scrypt. Scrivere un'impronta a mano per aggirare un
 * controllo lo renderebbe finto anche dove serve davvero.
 *
 * Gli indirizzi sono unici su tutta la piattaforma: il controllo attraversa gli studi per
 * disegno, e lo dichiara con `conPiattaforma`.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conPiattaforma, conTenant, connetti, creaUtente, schema, trovaUtentePerEmail } from '@aegis/db';
import { derivaPassword, generaPasswordIniziale, verificaRequisitiPassword } from '../apps/api/src/auth.js';

const RUOLI = ['amministratore', 'broker', 'assistente', 'sola-lettura'] as const;
type Ruolo = (typeof RUOLI)[number];

function cartellaPredefinita(): string {
  const radice = fileURLToPath(new URL('..', import.meta.url));
  return process.env['AEGIS_DATA_DIR'] ?? resolve(radice, '.dati');
}

async function main(): Promise<void> {
  const email = process.argv[2];
  const nome = process.argv[3];
  if (email === undefined || nome === undefined) {
    console.error('Uso: npx tsx scripts/crea-utente.ts <email> <nome> [ruolo] [password]');
    console.error(`Ruoli: ${RUOLI.join(' | ')} (predefinito: broker)`);
    process.exit(1);
  }

  const ruoloArg = process.argv[4];
  const ruolo: Ruolo = (RUOLI as readonly string[]).includes(ruoloArg ?? '')
    ? (ruoloArg as Ruolo)
    : 'broker';
  // Se il quarto argomento non è un ruolo, è la password: si accettano entrambe le forme.
  const fornita = (RUOLI as readonly string[]).includes(ruoloArg ?? '') ? process.argv[5] : ruoloArg;

  if (fornita !== undefined) {
    const requisiti = verificaRequisitiPassword(fornita);
    if (!requisiti.valida) {
      console.error(`  Password non accettabile: ${requisiti.problemi.join(' ')}`);
      console.error('  Sono gli stessi requisiti dell’applicazione: qui non si aggirano.');
      process.exit(1);
    }
  }
  const password = fornita ?? generaPasswordIniziale();

  const url = process.env['DATABASE_URL'];
  const connessione = await connetti({
    url,
    cartellaDati: url === undefined ? cartellaPredefinita() : undefined,
  });
  const db = connessione.db;
  console.log(`  Database: ${connessione.descrizione}`);

  try {
    const gia = await conPiattaforma(db, (tx) => trovaUtentePerEmail(tx, email));
    if (gia !== null) {
      console.error(`  Esiste già un utente con l’indirizzo ${email}.`);
      console.error(
        '  Per cambiargli la password: npx tsx scripts/reimposta-password.ts <email> [password]',
      );
      process.exit(1);
    }

    /*
      Lo studio: se ce n'è uno solo si prende quello, altrimenti si chiede di dirlo. Un
      utente creato nello studio sbagliato vede il portafoglio di qualcun altro, ed è
      esattamente ciò che le policy di isolamento esistono per impedire.
    */
    const studi = await conPiattaforma(db, (tx) =>
      tx
        .select({ id: schema.tenants.id, denominazione: schema.tenants.denominazione })
        .from(schema.tenants),
    );
    const scelto =
      process.env['AEGIS_TENANT_ID'] === undefined
        ? studi.length === 1
          ? studi[0]
          : undefined
        : studi.find((s) => s.id === process.env['AEGIS_TENANT_ID']);

    if (scelto === undefined) {
      console.error(`  Studi presenti: ${studi.length}. Indicare quale con AEGIS_TENANT_ID.`);
      for (const s of studi) console.error(`    ${s.id}  ${s.denominazione}`);
      process.exit(1);
    }

    const passwordHash = await derivaPassword(password);
    const id = await conTenant(db, scelto.id, (tx) =>
      creaUtente(tx, { tenantId: scelto.id, email, nome, passwordHash, ruolo }),
    );

    console.log('');
    console.log(`  Utente creato: ${email}`);
    console.log(`  Nome:     ${nome}`);
    console.log(`  Ruolo:    ${ruolo}`);
    console.log(`  Studio:   ${scelto.denominazione}`);
    console.log(`  Id:       ${id}`);
    if (fornita === undefined) {
      console.log('');
      console.log(`  Password generata: ${password}`);
      console.log('  Mostrata una volta sola: non è salvata in chiaro da nessuna parte.');
    }
    console.log('');
  } finally {
    await connessione.chiudi();
  }
}

await main();
