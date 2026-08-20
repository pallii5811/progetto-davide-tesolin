-- Il collegamento con cui il cliente compila da sé la propria intervista.
--
-- Apre una porta senza autenticazione, quindi ha le stesse difese di una sessione: in
-- tabella c'è l'impronta del token e mai il token, il collegamento scade, e si revoca.
--
-- Non entra fra le tabelle con Row Level Security per intermediario, ed è deliberato:
-- come per `sessioni`, la riga va risolta *prima* di sapere per conto di chi si lavora —
-- è il token stesso a dirlo. Una policy su `app.tenant_id` la renderebbe invisibile
-- proprio nel momento in cui serve.
CREATE TABLE IF NOT EXISTS "inviti_questionario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL REFERENCES "public"."aziende"("id") ON DELETE cascade,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"impronta" text NOT NULL,
	"creato_da" uuid REFERENCES "public"."utenti"("id"),
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"scade_il" timestamp with time zone NOT NULL,
	"compilato_il" timestamp with time zone,
	"revocato_il" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inviti_per_impronta" ON "inviti_questionario" USING btree ("impronta");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inviti_per_azienda" ON "inviti_questionario" USING btree ("azienda_id");
