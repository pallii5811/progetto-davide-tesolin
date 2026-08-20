-- Le risposte già comprate, conservate perché non si paghino due volte.
--
-- Finché la cache viveva in memoria, ogni riavvio del servizio buttava via tutto ciò che
-- era stato acquistato: rianalizzare la stessa azienda il giorno dopo costava di nuovo
-- cinquantacinque centesimi per dati identici.
--
-- È l'unica tabella senza `tenant_id`, ed è deliberato: qui non ci sono dati di un cliente
-- ma dati pubblici del registro imprese, comprati con un contratto unico intestato al
-- gestore della piattaforma. Se due studi analizzano la stessa azienda, la seconda analisi
-- non deve ricomprarla. Dossier, analisi, portafoglio e polizze restano isolati come prima.
CREATE TABLE IF NOT EXISTS "cache_risposte" (
	"chiave" text PRIMARY KEY NOT NULL,
	"valore" jsonb NOT NULL,
	"scade_il" timestamp with time zone NOT NULL,
	"scritta_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_per_scadenza" ON "cache_risposte" USING btree ("scade_il");
