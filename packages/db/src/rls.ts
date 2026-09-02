/**
 * Isolamento fra intermediari — Row Level Security.
 *
 * L'isolamento multi-tenant applicativo (un `where tenantId = ...` in ogni query) è
 * corretto finché qualcuno non dimentica un `where`. In un sistema che custodisce i
 * portafogli clienti di broker concorrenti, quella dimenticanza è un incidente da
 * denuncia al Garante. Qui l'isolamento è imposto dal database: se il codice sbaglia,
 * PostgreSQL restituisce zero righe invece dei dati di un altro.
 *
 * Uso: all'apertura di ogni transazione applicativa,
 *   `SET LOCAL app.tenant_id = '<uuid>';`
 * `SET LOCAL` è essenziale: il valore muore con la transazione e non può restare
 * appiccicato a una connessione riutilizzata dal pool.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Le policy sono ATTIVE dalla migrazione 0010_isolamento_rls.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fino al 02/09/2026 erano scritte e inerti, e la ragione era il **chiamante**: diciannove
 * punti del servizio interrogavano la connessione grezza senza dichiarare per conto di
 * quale studio, e con le policy attive `current_setting` avrebbe restituito vuoto e
 * **ogni riga sarebbe sparita** — a cominciare da `utenti`, letta per indirizzo email
 * prima di sapere di quale studio si tratti: l'accesso, per chiunque, senza un errore
 * che lo spieghi. L'elenco di quei punti lo misurava `isolamento-rls.test.ts`; oggi è
 * vuoto, e lo stesso collaudo lo tiene vuoto.
 *
 * DUE AMBITI, NON DUE RUOLI. Le operazioni che attraversano gli studi per disegno —
 * l'accesso, il controllo che un indirizzo non sia già registrato, l'elenco degli studi,
 * la spesa complessiva della piattaforma, il primo amministratore di uno studio nuovo —
 * dichiarano `SET LOCAL app.ambito = 'piattaforma'` e la policy le lascia passare. Era
 * previsto un secondo ruolo PostgreSQL per questo; l'ambito dichiarato nella transazione
 * fa la stessa cosa senza un secondo pool di connessioni, senza `CREATEROLE` sul server e
 * senza un passo di installazione in più — e resta un'informazione che solo
 * l'applicazione può mettere, esattamente come `app.tenant_id`. Ciò che la Row Level
 * Security aggiunge è invariato: una query che non dichiara **niente** non vede niente.
 *
 * FAIL-CLOSED, ed è il punto. Un `where` dimenticato, con le policy attive, restituisce
 * zero righe invece delle righe di un altro studio. È la proprietà che il primo strato —
 * i filtri applicativi — non può dare, perché il primo strato è proprio ciò che si
 * dimentica.
 *
 * `FORCE ROW LEVEL SECURITY` vale anche per il proprietario delle tabelle, che è il ruolo
 * con cui il servizio si collega: senza `FORCE` le policy non morderebbero affatto.
 * Su PGlite, in sviluppo, l'utente è superuser e le policy restano inerti per costruzione
 * di PostgreSQL — perciò la prova di isolamento si fa su un PostgreSQL vero, e sta in
 * `packages/db/test/isolamento-due-studi.test.ts`.
 */

/**
 * Tabelle che custodiscono dati di un singolo intermediario e vanno isolate.
 *
 * Il collaudo verifica che questo elenco copra **tutte** le tabelle con una colonna
 * `tenant_id`, salvo le esclusioni qui sotto: una tabella nuova non può sfuggire in
 * silenzio.
 */
const TABELLE_CON_TENANT: readonly string[] = [
  'utenti',
  'aziende',
  'snapshot_azienda',
  'dossier',
  'immagini_ubicazione',
  'polizze',
  'partecipazioni',
  'analisi',
  'gap_coperture',
  'eventi_monitoraggio',
  'registro_costi_dati',
];

/**
 * Tabelle che hanno `tenant_id` e restano deliberatamente fuori dalle policy, con il
 * motivo. Senza motivo scritto un'esclusione è indistinguibile da una dimenticanza — ed è
 * così che nascono i buchi di isolamento.
 */
export const ESCLUSIONI_MOTIVATE: Readonly<Record<string, string>> = {
  sessioni:
    'la riga va risolta PRIMA di sapere per conto di chi si lavora: è il token stesso a ' +
    'dirlo. Una policy su app.tenant_id la renderebbe invisibile proprio quando serve.',
  inviti_questionario:
    'stessa ragione di `sessioni`: il collegamento che il cliente riceve si risolve senza ' +
    'autenticazione, e il tenant si scopre dalla riga.',
  audit_log:
    'registro append-only con `tenant_id` facoltativo — le azioni di piattaforma non ' +
    'appartengono a nessuno studio. È protetto da REVOKE UPDATE/DELETE, non da una policy ' +
    'che nasconderebbe proprio le righe senza tenant.',
};

/**
 * SQL di attivazione delle policy. Va eseguito come migrazione successiva alla
 * creazione delle tabelle, con un ruolo proprietario — e **solo** quando il collaudo
 * sull'isolamento dichiara vuoto l'elenco dei punti scoperti.
 */
/**
 * La condizione che ogni riga deve soddisfare, in lettura e in scrittura.
 *
 * Due modi di passare, e nessun terzo: la riga appartiene allo studio dichiarato dalla
 * transazione, oppure la transazione ha dichiarato di operare per la piattaforma. Il
 * secondo `current_setting` ha `true` come secondo argomento — «manca» vale come vuoto e
 * non come errore — altrimenti una transazione senza ambito non tornerebbe zero righe,
 * ma un errore SQL su ogni query.
 */
const CONDIZIONE_ACCESSO =
  "tenant_id = current_setting('app.tenant_id', true)::uuid " +
  "OR current_setting('app.ambito', true) = 'piattaforma'";

/**
 * SQL di attivazione delle policy. È il corpo della migrazione `0010_isolamento_rls`:
 * generato da qui e ricopiato là, con un collaudo che verifica che i due coincidano.
 *
 * `ENABLE` senza `FORCE` non farebbe niente: il servizio si collega come proprietario
 * delle tabelle, e il proprietario è esente dalle policy finché non le si forza. Le
 * REVOKE sull'immutabilità di audit, snapshot e analisi non stanno qui: con un solo ruolo,
 * che è anche proprietario, una REVOKE su sé stesso non regge, e fingere il contrario
 * sarebbe una sicurezza dichiarata e non vera.
 */
export function sqlAbilitaRls(): string {
  const blocchi = TABELLE_CON_TENANT.map(
    (tabella) => `
ALTER TABLE ${tabella} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${tabella} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ${tabella}_isolamento_tenant ON ${tabella};
CREATE POLICY ${tabella}_isolamento_tenant ON ${tabella}
  USING (${CONDIZIONE_ACCESSO})
  WITH CHECK (${CONDIZIONE_ACCESSO});`,
  );

  return blocchi.join('\n').trim();
}

/** Comando da eseguire all'inizio di ogni transazione applicativa. */
export function sqlImpostaTenant(tenantId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TypeError(`Identificativo tenant non valido: ${tenantId}`);
  }
  return `SET LOCAL app.tenant_id = '${tenantId}'`;
}

/**
 * Comando da eseguire all'inizio di una transazione che attraversa gli studi per disegno.
 *
 * Il valore è una costante e non un parametro: non esiste un secondo ambito, e un
 * argomento libero sarebbe un invito a inventarne uno.
 */
export function sqlImpostaAmbitoPiattaforma(): string {
  return "SET LOCAL app.ambito = 'piattaforma'";
}

export const TABELLE_MULTI_TENANT = TABELLE_CON_TENANT;
