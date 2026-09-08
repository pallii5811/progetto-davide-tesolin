/**
 * Il registro delle operazioni, reso dimostrabilmente inalterabile.
 *
 * ── PERCHÉ ────────────────────────────────────────────────────────────────────
 *
 * L'intestazione di `audit_log` prometteva, dal primo giorno, «nessun UPDATE, nessun
 * DELETE: da imporre con permessi di database». Era un proposito, non una misura: niente
 * lo imponeva, e chiunque sapesse scrivere sul database poteva togliere la riga scomoda.
 *
 * Per l'intermediario non è igiene, è la differenza fra **avere** un registro e **poterlo
 * esibire**. Il Reg. IVASS 40/2018 chiede che l'operato sia tracciato e conservato; il
 * D.Lgs. 231/2007 lo chiede per l'adeguata verifica. In ispezione, un registro che il
 * controllato può riscrivere non prova niente, perché la prima domanda è «chi mi dice che
 * non l'ha ritoccato ieri?».
 *
 * Qui la risposta diventa un numero. Ogni riga porta l'impronta SHA-256 del proprio
 * contenuto **incatenata** a quella della riga precedente: togliere o riscrivere una riga
 * qualsiasi spezza la catena da lì in avanti, e `verifica_catena_audit()` dice in quale
 * punto e per quale dei tre guasti.
 *
 * Non impedisce a un amministratore di database di riscrivere tutto: nulla lo impedisce, e
 * promettere il contrario sarebbe la bugia più grave di tutte. Rende impossibile farlo
 * **senza che si veda**, che è l'unica cosa che una prova possa dare.
 *
 * ── PERCHÉ STA NEL CODICE E NON SOLO NELLA MIGRAZIONE ────────────────────────
 *
 * Stessa ragione delle policy di isolamento in `rls.ts`: lo schema di questo prodotto vive
 * in due posti — i file di migrazione, che girano in produzione, e il DDL in `client.ts`,
 * che gira in sviluppo e nei collaudi. Una prova che esiste in un posto solo è una prova
 * che un giorno diverge in silenzio. Le istruzioni si scrivono qui una volta,
 * `scripts/genera-migrazione-registro.ts` ne ricava la migrazione, e un collaudo verifica
 * che il file e il generatore dicano la stessa cosa.
 */

/**
 * Il contenuto che entra nell'impronta, scritto per esteso e nell'ordine.
 *
 * Se un giorno cambiasse, le impronte già scritte non tornerebbero più e la verifica lo
 * direbbe subito, invece di restare verde su una regola diversa da quella di ieri.
 *
 * `coalesce` su ogni campo che può mancare: NULL si propaga, e un'impronta NULL sarebbe
 * assenza di prova senza che nulla fallisca — lo stesso difetto della regola «l'assenza
 * resta assenza», nel punto in cui costa di più.
 */
const FUNZIONE_CONTENUTO = `CREATE OR REPLACE FUNCTION audit_log_contenuto_firmato(
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
$$ LANGUAGE sql IMMUTABLE`;

/**
 * Il divieto. `TG_OP` distingue i due casi perché i rimedi sono diversi: una correzione si
 * scrive come riga nuova, una cancellazione per obbligo di legge passa da una procedura
 * che va decisa e scritta, non improvvisata alle due di notte.
 */
const FUNZIONE_DIVIETO = `CREATE OR REPLACE FUNCTION audit_log_solo_aggiunta() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Il registro delle operazioni non si corregge: si aggiunge una riga che rettifica (audit_log, riga %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION 'Il registro delle operazioni non si cancella: e la prova che l''intermediario esibisce in ispezione (audit_log, riga %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql`;

/**
 * L'incatenamento, all'inserimento.
 *
 * La riga di `catena_audit` si blocca con FOR UPDATE: due transazioni concorrenti che
 * leggessero insieme l'ultima impronta produrrebbero due righe legate alla stessa
 * precedente, e la catena avrebbe una biforcazione che la verifica non saprebbe leggere.
 * Il blocco le mette in fila. Il registro è a bassa frequenza — accessi, analisi,
 * salvataggi — e la serializzazione non si sente.
 */
const FUNZIONE_CATENA = `CREATE OR REPLACE FUNCTION audit_log_incatena() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql`;

/**
 * La verifica, che è il motivo per cui tutto il resto esiste.
 *
 * Restituisce una riga per ogni rottura; nessuna riga significa che il registro è integro
 * dalla prima operazione all'ultima. È la risposta da dare in ispezione, e la si ottiene
 * con `SELECT * FROM verifica_catena_audit()` — eseguita da chi controlla, non
 * dall'applicazione, che è scritta dalla stessa parte che dovrebbe essere controllata.
 *
 * Tre guasti distinti, perché indicano cose diverse: un'impronta che non torna dice che il
 * contenuto è stato riscritto, un anello che non aggancia dice che una riga è stata tolta
 * di mezzo, un buco nella numerazione dice quante ne mancano.
 */
const FUNZIONE_VERIFICA = `CREATE OR REPLACE FUNCTION verifica_catena_audit()
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
$$ LANGUAGE plpgsql`;

/**
 * Le righe già scritte entrano in catena nell'ordine in cui sono avvenute.
 *
 * Da qui in avanti la catena prova che nessuna è cambiata. Su ciò che è successo prima non
 * pretende di provare niente, ed è giusto così: una prova che si autoattribuisse anche il
 * passato sarebbe la prima cosa che un ispettore non crederebbe.
 */
const INCATENA_ESISTENTI = `DO $$
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
$$`;

/**
 * Tutte le istruzioni, nell'ordine in cui vanno eseguite.
 *
 * Ciò che protegge viene **prima** di ciò che scrive: il divieto di UPDATE e DELETE è
 * installato prima del trigger che incatena, perché un file lungo può fermarsi a metà e la
 * parte che non arriva è sempre l'ultima.
 *
 * Idempotenti: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`. La stessa
 * sequenza gira sulla migrazione in produzione e sul database di collaudo.
 */
export function sqlRegistroInalterabile(): readonly string[] {
  return [
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impronta text`,
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impronta_precedente text`,
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS numero_progressivo bigint`,
    `CREATE TABLE IF NOT EXISTS catena_audit (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  impronta_testa text,
  numero_progressivo bigint NOT NULL DEFAULT 0,
  aggiornata_il timestamptz NOT NULL DEFAULT now()
)`,
    `INSERT INTO catena_audit (id) VALUES (true) ON CONFLICT (id) DO NOTHING`,
    FUNZIONE_DIVIETO,
    `DROP TRIGGER IF EXISTS audit_log_niente_modifiche ON audit_log`,
    `CREATE TRIGGER audit_log_niente_modifiche
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_solo_aggiunta()`,
    FUNZIONE_CONTENUTO,
    FUNZIONE_CATENA,
    `DROP TRIGGER IF EXISTS audit_log_catena ON audit_log`,
    `CREATE TRIGGER audit_log_catena
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_incatena()`,
    INCATENA_ESISTENTI,
    FUNZIONE_VERIFICA,
  ];
}

/** Il guasto che `verifica_catena_audit()` restituisce, una riga per rottura. */
export interface GuastoDelRegistro {
  readonly numero_progressivo: number;
  readonly riga: string;
  readonly avvenuto_il: string;
  readonly guasto: string;
}
