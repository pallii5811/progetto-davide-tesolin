-- La registrazione pubblica: studi che si aprono da soli, email confermate, codici per email.
--
-- Decisioni di Simone del 18/09/2026: chi si registra entra subito, ma compra dati solo dopo
-- che il gestore ha attivato lo studio (il credito è uno, intestato al gestore); l'indirizzo si
-- conferma con un collegamento via email, e dallo stesso canale passa la password dimenticata.
--
-- Solo aggiunte. Gli studi già aperti restano abilitati agli acquisti (DEFAULT true): li ha
-- aperti il gestore. Gli utenti già esistenti contano come confermati dal giorno della loro
-- creazione: li ha creati un amministratore che li conosceva, e chiedere a chi lavora da
-- settimane di confermare un indirizzo sarebbe solo un avviso in più da ignorare.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS acquisti_abilitati boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_registrato boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE utenti ADD COLUMN IF NOT EXISTS email_verificata_il timestamptz;
--> statement-breakpoint
-- `utenti` ha la Row Level Security FORZATA (0010): un UPDATE che non dichiara per conto di chi
-- lavora non vede nessuna riga e ne aggiorna zero, senza errore. L'ambito di piattaforma si
-- dichiara dentro lo stesso blocco, così vale per l'UPDATE comunque il migratore raggruppi le
-- istruzioni. La verifica è a parte, dopo: nessun utente deve restare con la colonna vuota.
DO $$
BEGIN
  PERFORM set_config('app.ambito', 'piattaforma', true);
  UPDATE utenti SET email_verificata_il = creato_il WHERE email_verificata_il IS NULL;
END
$$;
--> statement-breakpoint

-- I codici mandati per email. Solo l'impronta (SHA-256), mai il codice: chi legge il database
-- non ne usa nessuno. Fuori dalle policy di isolamento come `sessioni`, per la stessa ragione
-- (ESCLUSIONI_MOTIVATE in packages/db/src/rls.ts): il collegamento si apre senza sessione.
CREATE TABLE IF NOT EXISTS codici_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utente_id uuid NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scopo text NOT NULL CHECK (scopo IN ('conferma-email', 'nuova-password')),
  impronta text NOT NULL,
  creato_il timestamptz NOT NULL DEFAULT now(),
  scade_il timestamptz NOT NULL,
  usato_il timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS codici_email_impronta_unica ON codici_email (impronta);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS codici_email_per_utente ON codici_email (utente_id);
