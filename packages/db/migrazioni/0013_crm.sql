-- Il CRM: stato commerciale, nota, e le aziende arrivate da un elenco comprato.
--
-- Richiesta di Simone del 17/09/2026 («AEGIS - cambi.pptx»): il Portafoglio diventa un CRM, non
-- un tracker assicurativo, e le aziende di un elenco comprato ci restano «per sempre non per
-- 24 ore». Lo stato e la nota sono il lavoro dell'intermediario: stanno sull'azienda, che è già
-- isolata per studio dalle sue policy (0010), quindi nessuna tabella e nessuna policy nuova.
--
-- Solo colonne aggiunte, nessun dato riscritto: le aziende già in archivio partono «da
-- contattare», senza nota, e restano nel CRM perché analizzate.
ALTER TABLE aziende ADD COLUMN IF NOT EXISTS comune text;
--> statement-breakpoint
ALTER TABLE aziende ADD COLUMN IF NOT EXISTS stato_crm text NOT NULL DEFAULT 'da-contattare';
--> statement-breakpoint
ALTER TABLE aziende ADD COLUMN IF NOT EXISTS nota_crm text;
--> statement-breakpoint
ALTER TABLE aziende ADD COLUMN IF NOT EXISTS crm_aggiornato_il timestamptz;
--> statement-breakpoint
ALTER TABLE aziende ADD COLUMN IF NOT EXISTS da_elenco_il timestamptz;
--> statement-breakpoint

-- Gli stati possibili, gli stessi di STATI_CRM in packages/core/src/portfolio/crm.ts.
ALTER TABLE aziende DROP CONSTRAINT IF EXISTS aziende_stato_crm_valido;
--> statement-breakpoint
ALTER TABLE aziende ADD CONSTRAINT aziende_stato_crm_valido
  CHECK (stato_crm IN ('da-contattare', 'contattata', 'in-trattativa', 'cliente', 'non-interessata'));
