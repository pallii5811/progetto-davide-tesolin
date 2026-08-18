CREATE TABLE "partecipazioni" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"azienda_id" uuid NOT NULL,
	"socio_denominazione" text NOT NULL,
	"socio_codice_fiscale" text,
	"socio_tipo" text NOT NULL,
	"quota_percentuale" numeric(6, 3),
	"di_controllo" boolean DEFAULT false NOT NULL,
	"rilevata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partecipazioni" ADD CONSTRAINT "partecipazioni_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partecipazioni" ADD CONSTRAINT "partecipazioni_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partecipazioni_per_socio" ON "partecipazioni" USING btree ("tenant_id","socio_codice_fiscale");--> statement-breakpoint
CREATE INDEX "partecipazioni_per_azienda" ON "partecipazioni" USING btree ("azienda_id");