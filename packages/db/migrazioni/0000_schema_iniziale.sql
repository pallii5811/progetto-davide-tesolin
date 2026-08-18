CREATE TYPE "public"."livello_acquisizione" AS ENUM('base', 'esteso', 'completo');--> statement-breakpoint
CREATE TYPE "public"."ruolo_utente" AS ENUM('amministratore', 'broker', 'assistente', 'sola-lettura');--> statement-breakpoint
CREATE TYPE "public"."stato_cat_nat" AS ENUM('non-soggetta', 'in-scadenza', 'inadempiente', 'adempiente');--> statement-breakpoint
CREATE TYPE "public"."stato_gap" AS ENUM('assente', 'sottoassicurata', 'massimale-insufficiente', 'in-scadenza', 'adeguata', 'da-quantificare');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_monitoraggio" AS ENUM('anagrafica-variata', 'nuova-sede', 'ateco-variato', 'salto-dimensionale', 'bilancio-depositato', 'evento-negativo', 'procedura-aperta', 'score-variato', 'polizza-in-scadenza', 'obbligo-normativo');--> statement-breakpoint
CREATE TABLE "analisi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"eseguita_da" uuid,
	"as_of" timestamp with time zone NOT NULL,
	"score_credito" smallint,
	"classe_credito" text,
	"fido_consigliato_centesimi" bigint,
	"patrimonio_esposto_centesimi" bigint,
	"esposizione_non_assicurata_centesimi" bigint,
	"rischi_critici" smallint,
	"copertura_assente" smallint,
	"stato_cat_nat" "stato_cat_nat",
	"risultato" jsonb NOT NULL,
	"versione_core" text NOT NULL,
	"versione_catalogo_rischi" text NOT NULL,
	"versione_regole" text NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"utente_id" uuid,
	"azione" text NOT NULL,
	"entita" text NOT NULL,
	"entita_id" uuid,
	"dettagli" jsonb,
	"indirizzo_ip" text,
	"avvenuto_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aziende" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partita_iva" text,
	"codice_fiscale" text,
	"denominazione" text NOT NULL,
	"provider_id" text,
	"provincia" text,
	"ateco_primario" text,
	"is_cliente" boolean DEFAULT false NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compagnie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"denominazione" text NOT NULL,
	"gruppo" text,
	"codice_ivass" text,
	"partita_iva" text
);
--> statement-breakpoint
CREATE TABLE "dossier" (
	"azienda_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dati_dichiarati" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completezza" numeric(5, 4),
	"aggiornato_da" uuid,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dossier_azienda_id_pk" PRIMARY KEY("azienda_id")
);
--> statement-breakpoint
CREATE TABLE "eventi_monitoraggio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" "tipo_evento_monitoraggio" NOT NULL,
	"titolo" text NOT NULL,
	"descrizione" text NOT NULL,
	"rilevanza" smallint DEFAULT 3 NOT NULL,
	"valore_precedente" jsonb,
	"valore_nuovo" jsonb,
	"azione_suggerita" text,
	"rilevato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"letto_il" timestamp with time zone,
	"gestito_il" timestamp with time zone,
	"gestito_da" uuid
);
--> statement-breakpoint
CREATE TABLE "gap_coperture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analisi_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"azienda_id" uuid NOT NULL,
	"copertura" text NOT NULL,
	"stato" "stato_gap" NOT NULL,
	"priorita" smallint NOT NULL,
	"obbligo_di_legge" boolean DEFAULT false NOT NULL,
	"capitale_raccomandato_centesimi" bigint,
	"capitale_in_essere_centesimi" bigint,
	"azione" text NOT NULL,
	"motivazione_adeguatezza" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polizze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"copertura" text NOT NULL,
	"compagnia" text NOT NULL,
	"compagnia_id" uuid,
	"numero_polizza" text,
	"somma_assicurata_centesimi" bigint,
	"massimale_centesimi" bigint,
	"franchigia_centesimi" bigint,
	"scoperto" numeric(5, 4),
	"premio_annuo_centesimi" bigint,
	"forma_garanzia" text,
	"data_effetto" date NOT NULL,
	"data_scadenza" date NOT NULL,
	"documento_url" text,
	"note" text,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registro_costi_dati" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"azienda_id" uuid,
	"provider" text NOT NULL,
	"servizio" text NOT NULL,
	"costo_centesimi" bigint NOT NULL,
	"servito_da_cache" boolean DEFAULT false NOT NULL,
	"avvenuto_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessioni" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utente_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"impronta_token" text NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"scade_il" timestamp with time zone NOT NULL,
	"ultimo_utilizzo" timestamp with time zone DEFAULT now() NOT NULL,
	"indirizzo_ip" text,
	"user_agent" text,
	"revocata_il" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "snapshot_azienda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"livello" "livello_acquisizione" NOT NULL,
	"profilo" jsonb NOT NULL,
	"risposta_grezza" jsonb,
	"osservato_il" timestamp with time zone NOT NULL,
	"acquisito_il" timestamp with time zone DEFAULT now() NOT NULL,
	"costo_centesimi" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solidita_compagnia" (
	"compagnia_id" uuid NOT NULL,
	"anno" smallint NOT NULL,
	"solvency_ratio" numeric(6, 4),
	"quota_tier1_unrestricted" numeric(5, 4),
	"fondi_propri_centesimi" bigint,
	"scr_centesimi" bigint,
	"premi_lordi_centesimi" bigint,
	"reclami_anno" integer,
	"rating_agenzia" text,
	"rating_valore" text,
	"carrier_strength_score" smallint,
	"fonte" text NOT NULL,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solidita_compagnia_compagnia_id_anno_pk" PRIMARY KEY("compagnia_id","anno")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"denominazione" text NOT NULL,
	"numero_rui" text,
	"partita_iva" text,
	"budget_dati_mensile_centesimi" bigint,
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utenti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"password_hash" text,
	"ruolo" "ruolo_utente" DEFAULT 'broker' NOT NULL,
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_accesso" timestamp with time zone,
	"tentativi_falliti" integer DEFAULT 0 NOT NULL,
	"bloccato_fino_a" timestamp with time zone,
	"attivo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analisi" ADD CONSTRAINT "analisi_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisi" ADD CONSTRAINT "analisi_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisi" ADD CONSTRAINT "analisi_snapshot_id_snapshot_azienda_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot_azienda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisi" ADD CONSTRAINT "analisi_eseguita_da_utenti_id_fk" FOREIGN KEY ("eseguita_da") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aziende" ADD CONSTRAINT "aziende_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_aggiornato_da_utenti_id_fk" FOREIGN KEY ("aggiornato_da") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventi_monitoraggio" ADD CONSTRAINT "eventi_monitoraggio_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventi_monitoraggio" ADD CONSTRAINT "eventi_monitoraggio_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventi_monitoraggio" ADD CONSTRAINT "eventi_monitoraggio_gestito_da_utenti_id_fk" FOREIGN KEY ("gestito_da") REFERENCES "public"."utenti"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_coperture" ADD CONSTRAINT "gap_coperture_analisi_id_analisi_id_fk" FOREIGN KEY ("analisi_id") REFERENCES "public"."analisi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_coperture" ADD CONSTRAINT "gap_coperture_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_coperture" ADD CONSTRAINT "gap_coperture_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polizze" ADD CONSTRAINT "polizze_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polizze" ADD CONSTRAINT "polizze_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polizze" ADD CONSTRAINT "polizze_compagnia_id_compagnie_id_fk" FOREIGN KEY ("compagnia_id") REFERENCES "public"."compagnie"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_costi_dati" ADD CONSTRAINT "registro_costi_dati_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_costi_dati" ADD CONSTRAINT "registro_costi_dati_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessioni" ADD CONSTRAINT "sessioni_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessioni" ADD CONSTRAINT "sessioni_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_azienda" ADD CONSTRAINT "snapshot_azienda_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_azienda" ADD CONSTRAINT "snapshot_azienda_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solidita_compagnia" ADD CONSTRAINT "solidita_compagnia_compagnia_id_compagnie_id_fk" FOREIGN KEY ("compagnia_id") REFERENCES "public"."compagnie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utenti" ADD CONSTRAINT "utenti_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analisi_per_azienda" ON "analisi" USING btree ("azienda_id","as_of");--> statement-breakpoint
CREATE INDEX "analisi_per_catnat" ON "analisi" USING btree ("tenant_id","stato_cat_nat");--> statement-breakpoint
CREATE INDEX "analisi_per_score" ON "analisi" USING btree ("tenant_id","score_credito");--> statement-breakpoint
CREATE INDEX "audit_per_entita" ON "audit_log" USING btree ("entita","entita_id");--> statement-breakpoint
CREATE INDEX "audit_per_tenant" ON "audit_log" USING btree ("tenant_id","avvenuto_il");--> statement-breakpoint
CREATE UNIQUE INDEX "aziende_piva_per_tenant" ON "aziende" USING btree ("tenant_id","partita_iva");--> statement-breakpoint
CREATE INDEX "aziende_per_denominazione" ON "aziende" USING btree ("tenant_id","denominazione");--> statement-breakpoint
CREATE UNIQUE INDEX "compagnie_denominazione_unica" ON "compagnie" USING btree ("denominazione");--> statement-breakpoint
CREATE INDEX "eventi_da_gestire" ON "eventi_monitoraggio" USING btree ("tenant_id","gestito_il","rilevanza");--> statement-breakpoint
CREATE INDEX "gap_lista_lavoro" ON "gap_coperture" USING btree ("tenant_id","stato","priorita");--> statement-breakpoint
CREATE INDEX "polizze_per_azienda" ON "polizze" USING btree ("azienda_id");--> statement-breakpoint
CREATE INDEX "polizze_per_scadenza" ON "polizze" USING btree ("tenant_id","data_scadenza");--> statement-breakpoint
CREATE INDEX "costi_per_tenant" ON "registro_costi_dati" USING btree ("tenant_id","avvenuto_il");--> statement-breakpoint
CREATE UNIQUE INDEX "sessioni_impronta_unica" ON "sessioni" USING btree ("impronta_token");--> statement-breakpoint
CREATE INDEX "sessioni_per_utente" ON "sessioni" USING btree ("utente_id");--> statement-breakpoint
CREATE INDEX "snapshot_per_azienda" ON "snapshot_azienda" USING btree ("azienda_id","osservato_il");--> statement-breakpoint
CREATE UNIQUE INDEX "utenti_email_unica" ON "utenti" USING btree ("email");--> statement-breakpoint
CREATE INDEX "utenti_per_tenant" ON "utenti" USING btree ("tenant_id");