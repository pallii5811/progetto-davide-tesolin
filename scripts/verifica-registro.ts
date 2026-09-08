/**
 * La prova che il registro delle operazioni non è stato toccato.
 *
 *   DATABASE_URL=… npx tsx scripts/verifica-registro.ts
 *
 * È il documento da produrre in ispezione, e la ragione per cui la migrazione 0011 esiste.
 * Non legge una dichiarazione dell'applicazione: ricalcola l'impronta di **ogni riga** dal
 * suo contenuto e la confronta con quella scritta, poi verifica che ogni riga agganci la
 * precedente e che la numerazione non abbia buchi.
 *
 * Il calcolo lo fa il database con `verifica_catena_audit()`, non questo script: chi
 * controlla deve poterlo eseguire da sé, con un client qualunque, senza fidarsi del
 * programma scritto dalla parte controllata.
 *
 *   SELECT * FROM verifica_catena_audit();
 *
 * Zero righe significa integro. Ogni riga restituita è una rottura, con il numero
 * progressivo, la riga e quale dei tre guasti: contenuto riscritto, anello spezzato,
 * numerazione interrotta.
 *
 * Esce con codice 1 se trova qualcosa, così può stare in un controllo periodico.
 */

import { sql } from 'drizzle-orm';
import { connetti, righeDi } from '@aegis/db';
import type { GuastoDelRegistro } from '@aegis/db';

const url = process.env['DATABASE_URL']?.trim();
if (url === undefined || url === '') {
  process.stderr.write('\n  DATABASE_URL non impostata: questo strumento legge l’archivio vero.\n\n');
  process.exit(1);
}

const connessione = await connetti({ url });
try {
  const riepilogo = righeDi<{ righe: string; prima: string | null; ultima: string | null }>(
    await connessione.db.execute(
      sql`SELECT count(*)::text AS righe,
                 min(avvenuto_il)::text AS prima,
                 max(avvenuto_il)::text AS ultima
            FROM audit_log`,
    ),
  )[0];

  const testa = righeDi<{ impronta_testa: string | null; numero_progressivo: string }>(
    await connessione.db.execute(sql`SELECT impronta_testa, numero_progressivo::text FROM catena_audit`),
  )[0];

  const guasti = righeDi<GuastoDelRegistro>(
    await connessione.db.execute(sql`SELECT * FROM verifica_catena_audit()`),
  );

  const giorno = (v: string | null): string => (v === null ? '—' : v.slice(0, 10));

  process.stdout.write('\n  REGISTRO DELLE OPERAZIONI · verifica di integrità\n');
  process.stdout.write(`  ${'─'.repeat(70)}\n`);
  process.stdout.write(`  operazioni registrate      ${riepilogo?.righe ?? '0'}\n`);
  process.stdout.write(
    `  dalla prima all'ultima     ${giorno(riepilogo?.prima ?? null)} → ${giorno(riepilogo?.ultima ?? null)}\n`,
  );
  process.stdout.write(`  ultimo numero in catena    ${testa?.numero_progressivo ?? '0'}\n`);
  process.stdout.write(`  impronta della catena      ${testa?.impronta_testa ?? '(catena vuota)'}\n`);

  if (guasti.length === 0) {
    process.stdout.write(
      '\n  INTEGRO. Nessuna riga risulta aggiunta, tolta o riscritta dopo la registrazione.\n' +
        '  L’impronta qui sopra riassume l’intera catena: annotata oggi, prova domani che\n' +
        '  nulla di ciò che c’è adesso è cambiato nel frattempo.\n\n',
    );
  } else {
    process.stdout.write(`\n  ${guasti.length} ROTTURE\n\n`);
    for (const g of guasti) {
      process.stdout.write(`  n. ${g.numero_progressivo} · ${giorno(g.avvenuto_il)} · ${g.riga}\n`);
      process.stdout.write(`     ${g.guasto}\n`);
    }
    process.stdout.write(
      '\n  Il registro non è più una prova dalla prima rottura in avanti. Le righe precedenti\n' +
        '  restano verificabili: la catena dice esattamente dove smette di valere.\n\n',
    );
    process.exit(1);
  }
} finally {
  await connessione.chiudi();
}
