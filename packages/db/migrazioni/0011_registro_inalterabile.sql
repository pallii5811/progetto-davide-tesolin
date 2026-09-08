-- Il registro delle operazioni diventa dimostrabilmente inalterabile.
--
-- GENERATA da sqlRegistroInalterabile() in packages/db/src/registro.ts con
-- scripts/genera-migrazione-registro.ts: non modificare a mano. Un collaudo verifica che
-- i due coincidano, perché una prova corretta nel codice e diversa qui sarebbe una prova
-- che esiste in un posto solo.
--
-- L'intestazione di audit_log prometteva «nessun UPDATE, nessun DELETE» da prima che
-- esistesse qualcosa che lo imponesse. Per l'intermediario è la differenza fra avere un
-- registro e poterlo esibire: in ispezione, un registro che il controllato puo riscrivere
-- non prova niente.
--
-- Ogni riga porta l'impronta SHA-256 del proprio contenuto incatenata a quella della riga
-- precedente. Togliere o riscrivere una riga qualsiasi spezza la catena da li in avanti, e
-- verifica_catena_audit() dice in quale punto e per quale dei tre guasti. Non impedisce a
-- un amministratore di database di riscrivere tutto: rende impossibile farlo senza che si
-- veda, che e l'unica cosa che una prova possa dare.
--
-- Cio che protegge viene prima di cio che scrive: il divieto e installato prima del
-- trigger che incatena, perche un file lungo puo fermarsi a meta e la parte che non
-- arriva e sempre l'ultima.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impronta text;
--> statement-breakpoint
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impronta_precedente text;
--> statement-breakpoint
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS numero_progressivo bigint;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catena_audit (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  impronta_testa text,
  numero_progressivo bigint NOT NULL DEFAULT 0,
  aggiornata_il timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO catena_audit (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_solo_aggiunta() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Il registro delle operazioni non si corregge: si aggiunge una riga che rettifica (audit_log, riga %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION 'Il registro delle operazioni non si cancella: e la prova che l''intermediario esibisce in ispezione (audit_log, riga %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_niente_modifiche ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_niente_modifiche
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_solo_aggiunta();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_contenuto_firmato(
  p_id uuid, p_tenant uuid, p_utente uuid, p_azione text, p_entita text,
  p_entita_id uuid, p_dettagli jsonb, p_avvenuto timestamptz, p_precedente text,
  p_numero bigint
) RETURNS text AS $$
  SELECT encode(
    sha256(
      convert_to(
        coalesce(p_precedente, '') || '|' ||
        p_numero::text || '|' ||
        p_id::text || '|' ||
        coalesce(p_tenant::text, '') || '|' ||
        coalesce(p_utente::text, '') || '|' ||
        p_azione || '|' ||
        p_entita || '|' ||
        coalesce(p_entita_id::text, '') || '|' ||
        coalesce(p_dettagli::text, '') || '|' ||
        to_char(p_avvenuto AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        'UTF8'
      )
    ),
    'hex'
  );
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_incatena() RETURNS trigger AS $$
DECLARE
  testa text;
  numero bigint;
BEGIN
  SELECT impronta_testa, numero_progressivo INTO testa, numero
    FROM catena_audit WHERE id = true FOR UPDATE;

  NEW.avvenuto_il := coalesce(NEW.avvenuto_il, now());
  NEW.numero_progressivo := numero + 1;
  NEW.impronta_precedente := testa;
  NEW.impronta := audit_log_contenuto_firmato(
    NEW.id, NEW.tenant_id, NEW.utente_id, NEW.azione, NEW.entita,
    NEW.entita_id, NEW.dettagli, NEW.avvenuto_il, testa, NEW.numero_progressivo
  );

  UPDATE catena_audit
     SET impronta_testa = NEW.impronta,
         numero_progressivo = NEW.numero_progressivo,
         aggiornata_il = now()
   WHERE id = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_catena ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_catena
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_incatena();
--> statement-breakpoint
DO $$
DECLARE
  r record;
  testa text := NULL;
  numero bigint := 0;
BEGIN
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_niente_modifiche;
  FOR r IN SELECT * FROM audit_log WHERE impronta IS NULL ORDER BY avvenuto_il, id LOOP
    numero := numero + 1;
    UPDATE audit_log
       SET numero_progressivo = numero,
           impronta_precedente = testa,
           impronta = audit_log_contenuto_firmato(
             r.id, r.tenant_id, r.utente_id, r.azione, r.entita,
             r.entita_id, r.dettagli, r.avvenuto_il, testa, numero
           )
     WHERE id = r.id;
    SELECT impronta INTO testa FROM audit_log WHERE id = r.id;
  END LOOP;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_niente_modifiche;

  UPDATE catena_audit SET impronta_testa = testa, numero_progressivo = numero WHERE id = true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION verifica_catena_audit()
RETURNS TABLE (numero_progressivo bigint, riga uuid, avvenuto_il timestamptz, guasto text) AS $$
DECLARE
  r record;
  atteso_precedente text := NULL;
  atteso_numero bigint := 0;
  ricalcolata text;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY numero_progressivo LOOP
    atteso_numero := atteso_numero + 1;

    IF r.numero_progressivo IS DISTINCT FROM atteso_numero THEN
      numero_progressivo := r.numero_progressivo; riga := r.id; avvenuto_il := r.avvenuto_il;
      guasto := format('numerazione interrotta: attesa %s, trovata %s', atteso_numero, r.numero_progressivo);
      RETURN NEXT;
      atteso_numero := r.numero_progressivo;
    END IF;

    IF r.impronta_precedente IS DISTINCT FROM atteso_precedente THEN
      numero_progressivo := r.numero_progressivo; riga := r.id; avvenuto_il := r.avvenuto_il;
      guasto := 'anello spezzato: questa riga non aggancia la precedente';
      RETURN NEXT;
    END IF;

    ricalcolata := audit_log_contenuto_firmato(
      r.id, r.tenant_id, r.utente_id, r.azione, r.entita,
      r.entita_id, r.dettagli, r.avvenuto_il, r.impronta_precedente, r.numero_progressivo
    );
    IF r.impronta IS DISTINCT FROM ricalcolata THEN
      numero_progressivo := r.numero_progressivo; riga := r.id; avvenuto_il := r.avvenuto_il;
      guasto := 'contenuto riscritto: l''impronta non corrisponde alla riga';
      RETURN NEXT;
    END IF;

    atteso_precedente := r.impronta;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql;
