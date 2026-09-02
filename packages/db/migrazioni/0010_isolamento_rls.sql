-- Isolamento fra studi: Row Level Security su 11 tabelle.
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
ALTER TABLE utenti ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE utenti FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS utenti_isolamento_tenant ON utenti;--> statement-breakpoint
CREATE POLICY utenti_isolamento_tenant ON utenti
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE aziende ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE aziende FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS aziende_isolamento_tenant ON aziende;--> statement-breakpoint
CREATE POLICY aziende_isolamento_tenant ON aziende
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE snapshot_azienda ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE snapshot_azienda FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS snapshot_azienda_isolamento_tenant ON snapshot_azienda;--> statement-breakpoint
CREATE POLICY snapshot_azienda_isolamento_tenant ON snapshot_azienda
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE dossier ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dossier FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS dossier_isolamento_tenant ON dossier;--> statement-breakpoint
CREATE POLICY dossier_isolamento_tenant ON dossier
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE immagini_ubicazione ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE immagini_ubicazione FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS immagini_ubicazione_isolamento_tenant ON immagini_ubicazione;--> statement-breakpoint
CREATE POLICY immagini_ubicazione_isolamento_tenant ON immagini_ubicazione
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE polizze ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE polizze FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS polizze_isolamento_tenant ON polizze;--> statement-breakpoint
CREATE POLICY polizze_isolamento_tenant ON polizze
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE partecipazioni ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE partecipazioni FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS partecipazioni_isolamento_tenant ON partecipazioni;--> statement-breakpoint
CREATE POLICY partecipazioni_isolamento_tenant ON partecipazioni
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE analisi ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE analisi FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS analisi_isolamento_tenant ON analisi;--> statement-breakpoint
CREATE POLICY analisi_isolamento_tenant ON analisi
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE gap_coperture ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE gap_coperture FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS gap_coperture_isolamento_tenant ON gap_coperture;--> statement-breakpoint
CREATE POLICY gap_coperture_isolamento_tenant ON gap_coperture
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE eventi_monitoraggio ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE eventi_monitoraggio FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS eventi_monitoraggio_isolamento_tenant ON eventi_monitoraggio;--> statement-breakpoint
CREATE POLICY eventi_monitoraggio_isolamento_tenant ON eventi_monitoraggio
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');--> statement-breakpoint
ALTER TABLE registro_costi_dati ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE registro_costi_dati FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS registro_costi_dati_isolamento_tenant ON registro_costi_dati;--> statement-breakpoint
CREATE POLICY registro_costi_dati_isolamento_tenant ON registro_costi_dati
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');
