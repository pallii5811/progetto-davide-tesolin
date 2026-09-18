-- Gli elenchi già scaricati: per ogni studio e combinazione di filtri, da dove riparte il prossimo.
--
-- Richiesta di Simone del 18/09/2026: le aziende di un elenco comprato finiscono nel CRM, e
-- «alla prossima ricerca se cerco gli stessi filtri quelle aziende già nel CRM non devono
-- uscire». Il fornitore fa pagare ogni azienda che restituisce e non accetta un elenco di
-- partite IVA da escludere: nasconderle dopo l'acquisto vorrebbe dire pagarle senza vederle.
-- Accetta però di saltare le prime N, e con gli stessi filtri l'ordine è lo stesso: il prossimo
-- elenco chiede le successive a quelle già comprate.
--
-- `scaricate` è quante posizioni di quella combinazione sono già state comprate; `partite_iva`
-- quali aziende sono arrivate da lì — serve a riconoscere un acquisto ripetuto (una pagina
-- ricaricata, servita dalla memoria senza pagare), le cui aziende vanno rimostrate e non
-- nascoste come «già nel CRM».
CREATE TABLE IF NOT EXISTS elenchi_scaricati (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chiave text NOT NULL,
  scaricate integer NOT NULL DEFAULT 0,
  partite_iva text[] NOT NULL DEFAULT '{}',
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, chiave)
);
--> statement-breakpoint

-- Le policy di isolamento, generate da sqlAbilitaRls(['elenchi_scaricati']) in
-- packages/db/src/rls.ts, come per la 0012: la 0010 è già applicata e non si riscrive.
ALTER TABLE elenchi_scaricati ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE elenchi_scaricati FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS elenchi_scaricati_isolamento_tenant ON elenchi_scaricati;
--> statement-breakpoint
CREATE POLICY elenchi_scaricati_isolamento_tenant ON elenchi_scaricati
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');
