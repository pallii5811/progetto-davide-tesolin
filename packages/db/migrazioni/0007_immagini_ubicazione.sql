-- Fotografie allegate a una singola ubicazione.
--
-- Tabella a sé e non una colonna del dossier: il dossier si legge a ogni analisi, e
-- trascinarsi dietro qualche megabyte di immagini per calcolare uno score è uno spreco
-- che si paga a ogni esecuzione. Fuori anche dall'analisi congelata, che si riscrive
-- intera a ogni riesecuzione e duplicherebbe le stesse immagini in archivio.
--
-- `ubicazione_id` è la chiave stabile derivata dall'indirizzo normalizzato, non una
-- riferimento a riga: le ubicazioni sono calcolate dal profilo, non righe di tabella.
--
-- Scritta a mano e idempotente: lo strumento di generazione riemetteva anche gli
-- adeguamenti già applicati dalle migrazioni 0004, 0005 e 0006, che su un archivio
-- esistente fallirebbero con «already exists».
CREATE TABLE IF NOT EXISTS "immagini_ubicazione" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL REFERENCES "public"."aziende"("id") ON DELETE cascade,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"ubicazione_id" text NOT NULL,
	"didascalia" text,
	"tipo_mime" text NOT NULL,
	"dati" text NOT NULL,
	"dimensione_byte" integer NOT NULL,
	"caricata_da" uuid REFERENCES "public"."utenti"("id"),
	"caricata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "immagini_per_ubicazione" ON "immagini_ubicazione" USING btree ("azienda_id","ubicazione_id");
