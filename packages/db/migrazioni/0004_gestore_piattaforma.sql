ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "gestore_piattaforma" boolean NOT NULL DEFAULT false;--> statement-breakpoint
-- Su un archivio già in esercizio il gestore è lo studio creato per primo: è quello di chi
-- ha installato la piattaforma. Senza questa riga nessuno vedrebbe più i servizi dati.
UPDATE "tenants" SET "gestore_piattaforma" = true
WHERE "id" = (SELECT "id" FROM "tenants" ORDER BY "creato_il" ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "tenants" WHERE "gestore_piattaforma" = true);
