/**
 * Reimpostazione di una password dalla riga di comando.
 *
 *   npx tsx scripts/reimposta-password.ts <email> [password]
 *
 * Esiste per un caso preciso e inevitabile: l'unico amministratore perde la propria
 * password. Dall'interfaccia non c'è rimedio — chi potrebbe aiutarlo è lui stesso — e
 * senza questo strumento l'unica via sarebbe modificare il database a mano.
 *
 * Va eseguito **a servizio fermo**: il cluster di sviluppo su file ammette un solo
 * scrittore per volta, e in produzione l'accesso diretto al database deve restare
 * un'operazione consapevole, non qualcosa che si fa mentre l'applicazione lavora.
 *
 * Se la password non viene indicata, ne genera una robusta e la stampa una volta sola.
 * Tutte le sessioni aperte dell'utente vengono chiuse: se la password è stata cambiata
 * perché si sospetta un accesso altrui, lasciare aperte le sessioni vanificherebbe tutto.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conPiattaforma,
  conTenant,
  connetti,
  impostaPassword,
  revocaSessioniUtente,
  schema,
  trovaUtentePerEmail,
} from '@aegis/db';
import { derivaPassword, generaPasswordIniziale, verificaRequisitiPassword } from '../apps/api/src/auth.js';

/** La stessa cartella del servizio, ancorata alla radice del repository come in `main.ts`. */
function cartellaPredefinita(): string {
  const radice = fileURLToPath(new URL('..', import.meta.url));
  return process.env['AEGIS_DATA_DIR'] ?? resolve(radice, '.dati');
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (email === undefined) {
    console.error('Uso: npx tsx scripts/reimposta-password.ts <email> [password]');
    process.exit(1);
  }

  const fornita = process.argv[3];
  if (fornita !== undefined) {
    const requisiti = verificaRequisitiPassword(fornita);
    if (!requisiti.valida) {
      console.error(`Password non accettabile: ${requisiti.problemi.join(' ')}`);
      process.exit(1);
    }
  }

  const password = fornita ?? generaPasswordIniziale();

  // Le stesse variabili d'ambiente del servizio: puntare per sbaglio a un database
  // diverso da quello in uso reimposterebbe la password di un'installazione fantasma,
  // lasciando l'amministratore convinto di avere una credenziale che non funziona.
  const url = process.env['DATABASE_URL'];
  // Non si destruttura `chiudi`: staccata dall'oggetto perderebbe il proprio contesto.
  const connessione = await connetti({
    url,
    cartellaDati: url === undefined ? cartellaPredefinita() : undefined,
  });
  const db = connessione.db;
  console.log(`  Database: ${connessione.descrizione}`);

  try {
    /*
      L'indirizzo è tutto ciò che si sa: lo studio lo dice la riga trovata. Con le policy
      attive una lettura senza ambito risponderebbe «nessun utente» a chiunque — e lo
      strumento che serve a rientrare sarebbe il primo a chiudere fuori.
    */
    const utente = await conPiattaforma(db, (tx) => trovaUtentePerEmail(tx, email));
    if (utente === null) {
      console.error(`\n  Nessun utente registrato con l'indirizzo ${email}.`);

      // Chi arriva a questo strumento è già in difficoltà: costringerlo a indovinare
      // l'indirizzo esatto, o a interrogare il database a mano, è gratuitamente ostile.
      const registrati = await conPiattaforma(db, (tx) =>
        tx
          .select({ email: schema.utenti.email, nome: schema.utenti.nome, ruolo: schema.utenti.ruolo })
          .from(schema.utenti)
          .orderBy(schema.utenti.creatoIl),
      );

      if (registrati.length > 0) {
        console.error('\n  Indirizzi registrati:');
        for (const r of registrati) console.error(`    ${r.email}  (${r.nome} · ${r.ruolo})`);
      }
      console.error('');
      process.exit(1);
    }

    const passwordHash = await derivaPassword(password);
    await conTenant(db, utente.tenantId, async (tx) => {
      await impostaPassword(tx, utente.id, passwordHash);
      await revocaSessioniUtente(tx, utente.id);
    });

    console.log(`\n  Password reimpostata per ${utente.nome} <${utente.email}>.`);
    console.log(`  Ruolo: ${utente.ruolo}${utente.attivo ? '' : '  ⚠ utenza sospesa: non potrà accedere'}`);
    if (fornita === undefined) {
      console.log(`\n  Password: ${password}\n`);
      console.log('  Annotarla adesso: non è salvata da nessuna parte e non verrà mostrata di nuovo.');
    }
    console.log('  Le sessioni aperte sono state chiuse.\n');
  } finally {
    await connessione.chiudi();
  }
}

main().catch((errore: unknown) => {
  console.error(errore);
  process.exit(1);
});
