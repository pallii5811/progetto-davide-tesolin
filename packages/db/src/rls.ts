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
 */

const TABELLE_CON_TENANT: readonly string[] = [
  'utenti',
  'aziende',
  'snapshot_azienda',
  'dossier',
  'polizze',
  'analisi',
  'gap_coperture',
  'eventi_monitoraggio',
  'registro_costi_dati',
];

/**
 * SQL di attivazione delle policy. Va eseguito come migrazione successiva alla
 * creazione delle tabelle, con un ruolo proprietario.
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
