/**
 * Scrive la migrazione delle policy di isolamento a partire dal generatore.
 *
 *   npx tsx scripts/genera-migrazione-rls.ts
 *
 * `sqlAbilitaRls()` in `packages/db/src/rls.ts` è la fonte: le policy stanno scritte una
 * volta sola, e questo script le ricopia nel file di migrazione che drizzle applica in
 * produzione. Un collaudo verifica che i due coincidano — una policy corretta nel codice e
 * diversa nel file sarebbe una sicurezza che esiste in un posto solo, e cioè in nessuno.
 *
 * Si rilancia ogni volta che cambia l'elenco delle tabelle protette o la condizione di
 * accesso. Il file prodotto va committato: è la migrazione, non un artefatto.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sqlAbilitaRls, TABELLE_MULTI_TENANT } from '../packages/db/src/rls.js';

const DESTINAZIONE = fileURLToPath(
  new URL('../packages/db/migrazioni/0010_isolamento_rls.sql', import.meta.url),
);

const INTESTAZIONE = `-- Isolamento fra studi: Row Level Security su ${TABELLE_MULTI_TENANT.length} tabelle.
--
-- GENERATA da sqlAbilitaRls() in packages/db/src/rls.ts con scripts/genera-migrazione-rls.ts:
-- non modificare a mano. Un collaudo verifica che i due coincidano, perché una policy
-- corretta nel codice e diversa qui sarebbe una sicurezza che esiste in un posto solo.
--
-- Ogni riga passa se appartiene allo studio dichiarato dalla transazione
-- (SET LOCAL app.tenant_id) oppure se la transazione ha dichiarato di operare per la
-- piattaforma (SET LOCAL app.ambito = 'piattaforma'). Senza dichiarazione: zero righe.
-- È la proprietà che i filtri applicativi non possono dare, perché sono proprio ciò che
-- si dimentica.
--
-- FORCE vale anche per il proprietario delle tabelle, che è il ruolo con cui il servizio
-- si collega: senza FORCE le policy non morderebbero affatto.
`;

// drizzle esegue un'istruzione per volta, separate dal suo marcatore.
const corpo = sqlAbilitaRls()
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => `${s};`)
  .join('--> statement-breakpoint\n');

writeFileSync(DESTINAZIONE, `${INTESTAZIONE}${corpo}\n`, 'utf8');
process.stdout.write(`  scritta ${DESTINAZIONE}\n`);
