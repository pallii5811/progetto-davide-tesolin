/**
 * Utenti e sessioni.
 *
 * Le funzioni qui dentro non conoscono la crittografia: ricevono e restituiscono impronte
 * già calcolate. La derivazione delle password vive nel livello applicativo, dove può
 * essere irrobustita senza toccare il database, e il database non vede mai una password.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

export interface UtenteRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly nome: string;
  readonly passwordHash: string | null;
  readonly ruolo: 'amministratore' | 'broker' | 'assistente' | 'sola-lettura';
  readonly attivo: boolean;
  readonly tentativiFalliti: number;
  readonly bloccatoFinoA: Date | null;
}

export async function trovaUtentePerEmail(db: Database, email: string): Promise<UtenteRecord | null> {
  const righe = await db
    .select()
    .from(schema.utenti)
    .where(eq(schema.utenti.email, email.trim().toLowerCase()))
    .limit(1);

  return righe[0] ?? null;
}

export async function trovaUtentePerId(db: Database, id: string): Promise<UtenteRecord | null> {
  const righe = await db.select().from(schema.utenti).where(eq(schema.utenti.id, id)).limit(1);
  return righe[0] ?? null;
}

export async function creaUtente(
  db: Database,
  dati: {
    tenantId: string;
    email: string;
    nome: string;
    passwordHash: string;
    ruolo?: UtenteRecord['ruolo'];
  },
): Promise<string> {
  const creati = await db
    .insert(schema.utenti)
    .values({
      tenantId: dati.tenantId,
      email: dati.email.trim().toLowerCase(),
      nome: dati.nome,
      passwordHash: dati.passwordHash,
      ruolo: dati.ruolo ?? 'broker',
    })
    .returning({ id: schema.utenti.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione dell’utente non riuscita');
  return creato.id;
}

export async function contaUtenti(db: Database): Promise<number> {
  const righe = await db.select({ n: sql<number>`count(*)::int` }).from(schema.utenti);
  return righe[0]?.n ?? 0;
}

/**
 * Registra l'esito di un tentativo di accesso.
 *
 * Il blocco temporaneo dopo ripetuti fallimenti è l'unica difesa efficace contro
 * l'indovinamento sistematico delle password: senza, una password debole cade in poche ore.
 */
export async function registraTentativoAccesso(
  db: Database,
  utenteId: string,
  riuscito: boolean,
  sogliaBlocco: number,
  durataBloccoMs: number,
): Promise<void> {
  if (riuscito) {
    await db
      .update(schema.utenti)
      .set({ tentativiFalliti: 0, bloccatoFinoA: null, ultimoAccesso: new Date() })
      .where(eq(schema.utenti.id, utenteId));
    return;
  }

  const utente = await trovaUtentePerId(db, utenteId);
  const tentativi = (utente?.tentativiFalliti ?? 0) + 1;

  await db
    .update(schema.utenti)
    .set({
      tentativiFalliti: tentativi,
      bloccatoFinoA: tentativi >= sogliaBlocco ? new Date(Date.now() + durataBloccoMs) : null,
    })
    .where(eq(schema.utenti.id, utenteId));
}

export interface UtenteElenco {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly ruolo: UtenteRecord['ruolo'];
  readonly attivo: boolean;
  readonly ultimoAccesso: Date | null;
  readonly creatoIl: Date;
  readonly bloccato: boolean;
}

/** Utenti dell'intermediario. Mai gli altri: l'elenco è già filtrato per tenant. */
export async function elencoUtenti(db: Database, tenantId: string): Promise<readonly UtenteElenco[]> {
  const righe = await db
    .select({
      id: schema.utenti.id,
      email: schema.utenti.email,
      nome: schema.utenti.nome,
      ruolo: schema.utenti.ruolo,
      attivo: schema.utenti.attivo,
      ultimoAccesso: schema.utenti.ultimoAccesso,
      creatoIl: schema.utenti.creatoIl,
      bloccatoFinoA: schema.utenti.bloccatoFinoA,
    })
    .from(schema.utenti)
    .where(eq(schema.utenti.tenantId, tenantId))
    .orderBy(schema.utenti.creatoIl);

  const adesso = Date.now();
  return righe.map((r) => ({
    id: r.id,
    email: r.email,
    nome: r.nome,
    ruolo: r.ruolo,
    attivo: r.attivo,
    ultimoAccesso: r.ultimoAccesso,
    creatoIl: r.creatoIl,
    bloccato: r.bloccatoFinoA !== null && r.bloccatoFinoA.getTime() > adesso,
  }));
}

/** Quanti amministratori attivi restano: serve a impedire di rimanere senza. */
export async function contaAmministratoriAttivi(db: Database, tenantId: string): Promise<number> {
  const righe = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.utenti)
    .where(
      and(
        eq(schema.utenti.tenantId, tenantId),
        eq(schema.utenti.ruolo, 'amministratore'),
        eq(schema.utenti.attivo, true),
      ),
    );
  return righe[0]?.n ?? 0;
}

export async function aggiornaUtente(
  db: Database,
  tenantId: string,
  utenteId: string,
  modifiche: {
    nome?: string | undefined;
    ruolo?: UtenteRecord['ruolo'] | undefined;
    attivo?: boolean | undefined;
  },
): Promise<boolean> {
  const righe = await db
    .update(schema.utenti)
    .set({
      ...(modifiche.nome === undefined ? {} : { nome: modifiche.nome }),
      ...(modifiche.ruolo === undefined ? {} : { ruolo: modifiche.ruolo }),
      ...(modifiche.attivo === undefined
        ? {}
        : // Riattivando un utente si azzerano anche i contatori di blocco: altrimenti
          // resterebbe fuori per un blocco maturato prima della sospensione.
          { attivo: modifiche.attivo, tentativiFalliti: 0, bloccatoFinoA: null }),
    })
    // Il vincolo sul tenant è nella `where`, non nel codice chiamante: un identificativo
    // indovinato di un altro studio non deve poter essere modificato.
    .where(and(eq(schema.utenti.id, utenteId), eq(schema.utenti.tenantId, tenantId)))
    .returning({ id: schema.utenti.id });

  return righe.length > 0;
}

export async function impostaPassword(db: Database, utenteId: string, passwordHash: string): Promise<void> {
  await db
    .update(schema.utenti)
    .set({ passwordHash, tentativiFalliti: 0, bloccatoFinoA: null })
    .where(eq(schema.utenti.id, utenteId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessioni
// ─────────────────────────────────────────────────────────────────────────────

export interface SessioneRecord {
  readonly id: string;
  readonly utenteId: string;
  readonly tenantId: string;
  readonly scadeIl: Date;
}

export async function creaSessione(
  db: Database,
  dati: {
    utenteId: string;
    tenantId: string;
    improntaToken: string;
    scadeIl: Date;
    indirizzoIp?: string | undefined;
    userAgent?: string | undefined;
  },
): Promise<string> {
  const creati = await db
    .insert(schema.sessioni)
    .values({
      utenteId: dati.utenteId,
      tenantId: dati.tenantId,
      improntaToken: dati.improntaToken,
      scadeIl: dati.scadeIl,
      indirizzoIp: dati.indirizzoIp ?? null,
      userAgent: dati.userAgent ?? null,
    })
    .returning({ id: schema.sessioni.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione della sessione non riuscita');
  return creato.id;
}

/** Sessione valida: esistente, non revocata, non scaduta. */
export async function trovaSessioneValida(
  db: Database,
  improntaToken: string,
  adesso: Date,
): Promise<SessioneRecord | null> {
  const righe = await db
    .select({
      id: schema.sessioni.id,
      utenteId: schema.sessioni.utenteId,
      tenantId: schema.sessioni.tenantId,
      scadeIl: schema.sessioni.scadeIl,
    })
    .from(schema.sessioni)
    .where(
      and(
        eq(schema.sessioni.improntaToken, improntaToken),
        isNull(schema.sessioni.revocataIl),
        sql`${schema.sessioni.scadeIl} > ${adesso}`,
      ),
    )
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;

  await db.update(schema.sessioni).set({ ultimoUtilizzo: adesso }).where(eq(schema.sessioni.id, riga.id));

  return riga;
}

export async function revocaSessione(db: Database, improntaToken: string): Promise<void> {
  await db
    .update(schema.sessioni)
    .set({ revocataIl: new Date() })
    .where(eq(schema.sessioni.improntaToken, improntaToken));
}

/** Revoca tutte le sessioni di un utente: cambio password, sospetto, cessazione. */
export async function revocaSessioniUtente(db: Database, utenteId: string): Promise<void> {
  await db
    .update(schema.sessioni)
    .set({ revocataIl: new Date() })
    .where(and(eq(schema.sessioni.utenteId, utenteId), isNull(schema.sessioni.revocataIl)));
}

/** Rimozione delle sessioni scadute: manutenzione periodica, non critica. */
export async function purgaSessioniScadute(db: Database, adesso: Date): Promise<void> {
  await db.delete(schema.sessioni).where(lt(schema.sessioni.scadeIl, adesso));
}

// ─────────────────────────────────────────────────────────────────────────────
// Anagrafica dello studio
// ─────────────────────────────────────────────────────────────────────────────

export interface DatiStudio {
  readonly denominazione: string;
  readonly numeroRui: string | null;
  readonly partitaIva: string | null;
  readonly indirizzo: string | null;
  readonly email: string | null;
  readonly telefono: string | null;
}

/**
 * Chi ha redatto il documento.
 *
 * Serve al report consegnato al contraente: il Reg. IVASS 40/2018 vuole che l'analisi
 * dichiari l'intermediario che l'ha prodotta, con il suo numero di iscrizione al RUI.
 * È insieme un requisito e ciò che rende il documento **dello studio** e non dell'attrezzo
 * con cui è stato scritto.
 */
export async function leggiStudio(db: Database, tenantId: string): Promise<DatiStudio | null> {
  const righe = await db
    .select({
      denominazione: schema.tenants.denominazione,
      numeroRui: schema.tenants.numeroRui,
      partitaIva: schema.tenants.partitaIva,
      indirizzo: schema.tenants.indirizzo,
      email: schema.tenants.email,
      telefono: schema.tenants.telefono,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  return righe[0] ?? null;
}

/**
 * Aggiornamento parziale dell'anagrafica.
 *
 * I campi sono dichiarati esplicitamente opzionali **e** ammessi a `undefined`: con
 * `exactOptionalPropertyTypes` le due cose sono diverse, e un campo semplicemente non
 * inviato dal modulo deve poter arrivare fin qui senza forzature di tipo.
 */
export interface ModificheStudio {
  readonly denominazione?: string | undefined;
  readonly numeroRui?: string | null | undefined;
  readonly partitaIva?: string | null | undefined;
  readonly indirizzo?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly telefono?: string | null | undefined;
}

export async function aggiornaStudio(
  db: Database,
  tenantId: string,
  dati: ModificheStudio,
): Promise<void> {
  // Solo i campi effettivamente inviati: un aggiornamento parziale non deve cancellare
  // i recapiti che il modulo non ha toccato.
  const modifiche: Record<string, string | null> = {};
  if (dati.denominazione !== undefined && dati.denominazione.trim() !== '') {
    modifiche['denominazione'] = dati.denominazione.trim();
  }
  for (const chiave of ['numeroRui', 'partitaIva', 'indirizzo', 'email', 'telefono'] as const) {
    const valore = dati[chiave];
    if (valore === undefined) continue;
    modifiche[chiave] = valore === null || valore.trim() === '' ? null : valore.trim();
  }

  if (Object.keys(modifiche).length === 0) return;
  await db.update(schema.tenants).set(modifiche).where(eq(schema.tenants.id, tenantId));
}
