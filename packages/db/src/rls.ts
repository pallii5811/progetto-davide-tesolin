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
 * ⚠  QUESTO SQL NON È ANCORA APPLICABILE IN PRODUZIONE. Leggere prima.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Le policy sono corrette; ciò che non è pronto è il **chiamante**. Una parte delle rotte
 * del servizio interroga ancora la connessione grezza invece di passare da `conTenant`, e
 * su quelle `app.tenant_id` non è impostato. Con le policy attive `current_setting`
 * restituisce vuoto e **ogni riga sparisce**: il caso peggiore è `utenti`, letta per
 * indirizzo email *prima* di sapere di quale studio si tratti — con la policy attiva
 * l'accesso diventa impossibile per chiunque, e senza alcun messaggio che lo spieghi.
 *
 * L'elenco esatto dei punti scoperti è misurato — non stimato — dal collaudo
 * `packages/db/test/isolamento-rls.test.ts`, che fallisce se se ne aggiunge uno nuovo.
 * Quando quell'elenco sarà vuoto, questo SQL potrà diventare una migrazione.
 *
 * Restano da decidere, prima di allora, le operazioni che attraversano gli studi **per
 * disegno** — l'elenco degli studi, la spesa complessiva della piattaforma, la creazione
 * del primo amministratore di un nuovo studio. Con `FORCE ROW LEVEL SECURITY` nemmeno il
 * proprietario delle tabelle le vede: servirà un ruolo distinto per quelle, non una
 * deroga sparsa.
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
export function sqlAbilitaRls(ruoloApplicativo = 'aegis_app'): string {
  const blocchi = TABELLE_CON_TENANT.map(
    (tabella) => `
ALTER TABLE ${tabella} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${tabella} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ${tabella}_isolamento_tenant ON ${tabella};
CREATE POLICY ${tabella}_isolamento_tenant ON ${tabella}
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);`,
  );

  return `
-- Il ruolo applicativo non deve poter aggirare le policy: niente BYPASSRLS, niente superuser.
-- CREATE ROLE ${ruoloApplicativo} NOLOGIN NOBYPASSRLS;
${blocchi.join('\n')}

-- Audit trail: sola scrittura. Nessun UPDATE, nessun DELETE, nemmeno per l'applicazione.
REVOKE UPDATE, DELETE ON audit_log FROM ${ruoloApplicativo};

-- Snapshot immutabili: si inserisce, non si corregge. Un dato di provider corretto a
-- posteriori distruggerebbe la riproducibilità di ogni analisi che vi si fonda.
REVOKE UPDATE, DELETE ON snapshot_azienda FROM ${ruoloApplicativo};

-- Analisi congelate: stessa ragione. Una nuova valutazione è una nuova riga.
REVOKE UPDATE, DELETE ON analisi FROM ${ruoloApplicativo};
`.trim();
}

/** Comando da eseguire all'inizio di ogni transazione applicativa. */
export function sqlImpostaTenant(tenantId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TypeError(`Identificativo tenant non valido: ${tenantId}`);
  }
  return `SET LOCAL app.tenant_id = '${tenantId}'`;
}

export const TABELLE_MULTI_TENANT = TABELLE_CON_TENANT;
