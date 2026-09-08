/**
 * Genera la migrazione del registro inalterabile da `packages/db/src/registro.ts`.
 *
 *   npx tsx scripts/genera-migrazione-registro.ts
 *
 * Stessa ragione del generatore delle policy: lo schema di questo prodotto vive in due
 * posti — le migrazioni, che girano in produzione, e il DDL in `client.ts`, che gira nei
 * collaudi. Un registro inalterabile che vale in un posto solo è un registro che un giorno
 * diverge in silenzio, e la divergenza si scopre in ispezione.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sqlRegistroInalterabile } from '../packages/db/src/registro.js';

const DESTINAZIONE = fileURLToPath(
  new URL('../packages/db/migrazioni/0011_registro_inalterabile.sql', import.meta.url),
);

const INTESTAZIONE = `-- Il registro delle operazioni diventa dimostrabilmente inalterabile.
--
-- GENERATA da sqlRegistroInalterabile() in packages/db/src/registro.ts con
-- scripts/genera-migrazione-registro.ts: non modificare a mano. Un collaudo verifica che
-- i due coincidano, perché una prova corretta nel codice e diversa qui sarebbe una prova
-- che esiste in un posto solo.
--
-- L'intestazione di audit_log prometteva «nessun UPDATE, nessun DELETE» da prima che
-- esistesse qualcosa che lo imponesse. Per l'intermediario è la differenza fra avere un
-- registro e poterlo esibire: in ispezione, un registro che il controllato puo riscrivere
-- non prova niente.
--
-- Ogni riga porta l'impronta SHA-256 del proprio contenuto incatenata a quella della riga
-- precedente. Togliere o riscrivere una riga qualsiasi spezza la catena da li in avanti, e
-- verifica_catena_audit() dice in quale punto e per quale dei tre guasti. Non impedisce a
-- un amministratore di database di riscrivere tutto: rende impossibile farlo senza che si
-- veda, che e l'unica cosa che una prova possa dare.
--
-- Cio che protegge viene prima di cio che scrive: il divieto e installato prima del
-- trigger che incatena, perche un file lungo puo fermarsi a meta e la parte che non
-- arriva e sempre l'ultima.
`;

const corpo = sqlRegistroInalterabile()
  .map((s) => `${s};`)
  .join('\n--> statement-breakpoint\n');

writeFileSync(DESTINAZIONE, `${INTESTAZIONE}${corpo}\n`, 'utf8');
process.stdout.write(`  scritta ${DESTINAZIONE}\n`);
process.stdout.write(`  ${sqlRegistroInalterabile().length} istruzioni\n`);
