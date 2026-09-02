/**
 * @aegis/core — dominio puro della piattaforma.
 *
 * Nessuna dipendenza runtime, nessuna I/O: tutto ciò che è qui dentro è una funzione
 * dei suoi input. È la parte del sistema che non deve cambiare quando cambia il provider
 * di dati, il framework web o il database.
 */

// ── Primitive condivise ──────────────────────────────────────────────────────
export * from './shared/money.js';
export * from './shared/identifiers.js';
export * from './shared/provenance.js';
export * from './shared/explain.js';
export * from './shared/math.js';
export * from './shared/testo.js';
export * from './shared/traduzioni-archivio.js';

// ── Azienda ──────────────────────────────────────────────────────────────────
export * from './company/profile.js';
export * from './company/financials.js';
export * from './company/schema-margine.js';
export * from './company/indicators.js';
export * from './company/indicatori-fornitore.js';
export * from './company/size.js';
export * from './company/facts.js';
export * from './company/completeness.js';
export * from './company/contesto-territoriale.js';
export * from './company/ubicazioni.js';

// ── Credito ──────────────────────────────────────────────────────────────────
export * from './credit/altman.js';
export * from './credit/score.js';
export * from './credit/credit-limit.js';

// ── Rischi ───────────────────────────────────────────────────────────────────
export * from './risk/assessment.js';
export * from './risk/taxonomy.js';
export * from './risk/geo.js';
export * from './risk/rules.js';
export * from './risk/engine.js';
export * from './risk/ritenzione.js';
export * from './governance/assetto.js';
export * from './governance/norme.js';
export * from './governance/titolare-effettivo.js';
export * from './risk/prevenzione.js';

// ── Coperture ────────────────────────────────────────────────────────────────
export * from './coverage/taxonomy.js';
export * from './coverage/policy.js';
export * from './coverage/sums-insured.js';
export * from './coverage/underinsurance.js';
export * from './coverage/danno-massimo.js';
export * from './coverage/metriche-impatto.js';

// ── Portafoglio ──────────────────────────────────────────────────────────────
export * from './portfolio/import.js';
export * from './portfolio/export.js';

// ── Monitoraggio ─────────────────────────────────────────────────────────────
export * from './monitoring/events.js';
export * from './monitoring/state.js';
export * from './monitoring/detect.js';
export * from './coverage/catnat.js';
export * from './coverage/motivazione.js';
export * from './coverage/gap.js';

// ── Compagnie ────────────────────────────────────────────────────────────────
export * from './carrier/solidity.js';

// ── Orchestrazione ───────────────────────────────────────────────────────────
export * from './assessment/analyze.js';

// ── Dati dimostrativi (usati da test, seed e demo dell'API) ──────────────────
export * from './fixtures/demo.js';

/** Versione del motore di dominio: cambia quando cambiano formule o cataloghi. */
export const CORE_VERSION = '0.1.0';
