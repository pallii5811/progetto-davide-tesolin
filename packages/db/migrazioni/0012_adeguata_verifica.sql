-- Adeguata verifica della clientela: l'esito, e la decisione di chi l'ha letto.
--
-- L'obbligo del D.Lgs. 231/2007 non si chiude con la ricerca: si chiude con la DECISIONE
-- dell'intermediario su ogni riscontro, e con la prova che quella decisione è stata presa
-- in quel giorno e non ricostruita dopo. La ricerca costa sette centesimi; la decisione
-- non costa niente ed è l'unica cosa che un'ispezione guarda davvero.
--
-- Perché una tabella e non solo il registro: il registro delle operazioni dice che una
-- cosa è successa, e non si interroga per sapere «chi resta da verificare oggi». Servono
-- entrambi, e fanno due lavori diversi — qui lo stato, là la prova.
--
-- I candidati si conservano per intero come sono tornati, pesati dal dominio. Non si
-- conserva un verdetto: un verdetto lo dà l'intermediario, e sta in `decisioni`.
CREATE TABLE IF NOT EXISTS verifiche_antiriciclaggio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  azienda_id uuid REFERENCES aziende(id) ON DELETE CASCADE,

  -- Chi è stato verificato, e perché lo si doveva verificare.
  nome text NOT NULL,
  ruolo text NOT NULL,
  anno_nascita integer,

  -- nessun-riscontro | da-esaminare | non-eseguita
  stato text NOT NULL,
  conclusione text NOT NULL,

  -- L'esito pesato, per intero: nomi, anni, liste, autorità che elencano il soggetto.
  candidati jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- La decisione dell'intermediario su ogni candidato: { "<id>": "confermato" | "escluso" }.
  -- Vuoto finché non l'ha guardato: è la differenza fra «trovato» e «valutato».
  decisioni jsonb NOT NULL DEFAULT '{}'::jsonb,
  nota text,

  costo_centesimi bigint NOT NULL DEFAULT 0,
  verificata_il timestamptz,
  decisa_da uuid REFERENCES utenti(id),
  decisa_il timestamptz,
  creata_il timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- La domanda che l'interfaccia fa a ogni apertura di scheda: «cosa resta da valutare?»
CREATE INDEX IF NOT EXISTS verifiche_da_valutare
  ON verifiche_antiriciclaggio (tenant_id, azienda_id, decisa_il);
--> statement-breakpoint

-- Le policy di isolamento, generate da sqlAbilitaRls(['verifiche_antiriciclaggio']) in
-- packages/db/src/rls.ts: la 0010 è già applicata e non si riscrive, quindi le tabelle
-- nuove entrano con la propria migrazione. Un collaudo verifica che ogni tabella con
-- tenant_id abbia la sua policy in QUALCHE migrazione, comunque sia entrata.
ALTER TABLE verifiche_antiriciclaggio ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE verifiche_antiriciclaggio FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS verifiche_antiriciclaggio_isolamento_tenant ON verifiche_antiriciclaggio;
--> statement-breakpoint
CREATE POLICY verifiche_antiriciclaggio_isolamento_tenant ON verifiche_antiriciclaggio
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR current_setting('app.ambito', true) = 'piattaforma');
