/**
 * Utenti e sessioni.
 *
 * Le funzioni qui dentro non conoscono la crittografia: ricevono e restituiscono impronte
 * già calcolate. La derivazione delle password vive nel livello applicativo, dove può
 * essere irrobustita senza toccare il database, e il database non vede mai una password.
 */

import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
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
  /** Quando ha confermato l'indirizzo aprendo il collegamento ricevuto; `null` = non ancora. */
  readonly emailVerificataIl: Date | null;
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
    /**
     * `true` solo per chi si registra da solo: dovrà confermare l'indirizzo. Chi viene creato
     * da un amministratore conta come confermato da subito — lo ha aperto qualcuno che lo
     * conosce, com'è sempre stato e come la migrazione 0015 ha fatto per chi esisteva già.
     */
    emailDaConfermare?: boolean;
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
      emailVerificataIl: dati.emailDaConfermare === true ? null : new Date(),
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
        /*
          `gt` e non un frammento `sql` grezzo.

          Con `sql`${schema.sessioni.scadeIl} > ${adesso}`` il servizio andava in errore 500
          su ogni richiesta autenticata in produzione: si entrava con la password giusta e si
          tornava alla schermata di accesso, senza un messaggio che spiegasse perché.

          Dentro un template grezzo drizzle non conosce il tipo della colonna e consegna al
          driver l’oggetto `Date` così com’è; `postgres-js` non sa serializzarlo e solleva
          «Received an instance of Date». Il confronto tipizzato invece sa che la colonna è un
          timestamp e codifica il valore come si deve.

          Su PGlite — l’archivio dello sviluppo — la stessa riga funziona: il suo codificatore
          accetta le date. È il motivo per cui cinquecento collaudi verdi non l’hanno vista.
        */
        gt(schema.sessioni.scadeIl, adesso),
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
  /** Logo come data URI: il report è il documento su cui l'intermediario mette la faccia. */
  readonly logo: string | null;
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
      logo: schema.tenants.logo,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  return righe[0] ?? null;
}

export interface StudioElenco {
  readonly id: string;
  readonly denominazione: string;
  readonly numeroRui: string | null;
  readonly gestorePiattaforma: boolean;
  readonly attivo: boolean;
  readonly acquistiAbilitati: boolean;
  readonly autoRegistrato: boolean;
  readonly creatoIl: Date;
  readonly utenti: number;
  /**
   * Chi ha aperto lo studio (il primo utente creato), con lo stato della sua email: è ciò
   * che il gestore guarda prima di attivare gli acquisti di uno studio registrato da solo.
   * `null` se lo studio non ha utenti.
   */
  readonly referente: { readonly email: string; readonly emailConfermata: boolean } | null;
}

/**
 * Gli studi presenti sulla piattaforma.
 *
 * L'unica lettura che attraversa gli studi, e per questo riservata a chi gestisce la
 * piattaforma: restituisce quanti collaboratori ha ciascuno, non cosa ci sia dentro.
 * Il gestore amministra le utenze, non i portafogli dei propri clienti.
 */
export async function elencoStudi(db: Database): Promise<readonly StudioElenco[]> {
  /*
    Il conteggio si fa con una giunzione, non con una sottoquery correlata scritta a mano.

    Interpolando le colonne in `sql` grezzo, Drizzle emette i nomi **non qualificati**:
    `WHERE "tenant_id" = "id"` — e dentro la sottoquery `"id"` è la colonna di `utenti`,
    che ce l'ha anche lei. Il confronto diventa «l'utente con sé stesso», è sempre falso,
    e il risultato è uno zero perfettamente plausibile che non solleva nulla.

    Con la giunzione il costruttore conosce entrambe le tabelle e qualifica da sé. Il
    raggruppamento per sola chiave primaria basta: le altre colonne ne dipendono
    funzionalmente, e PostgreSQL lo sa.
  */
  const righe = await db
    .select({
      id: schema.tenants.id,
      denominazione: schema.tenants.denominazione,
      numeroRui: schema.tenants.numeroRui,
      gestorePiattaforma: schema.tenants.gestorePiattaforma,
      attivo: schema.tenants.attivo,
      acquistiAbilitati: schema.tenants.acquistiAbilitati,
      autoRegistrato: schema.tenants.autoRegistrato,
      creatoIl: schema.tenants.creatoIl,
      utenti: sql<string>`COUNT(${schema.utenti.id})`,
    })
    .from(schema.tenants)
    .leftJoin(schema.utenti, eq(schema.utenti.tenantId, schema.tenants.id))
    .groupBy(schema.tenants.id)
    .orderBy(desc(schema.tenants.gestorePiattaforma), schema.tenants.denominazione);

  /*
    I referenti con una seconda lettura, non dentro la giunzione: un `array_agg` scritto in
    `sql` grezzo emetterebbe `"email"` non qualificato, e `email` esiste sia in `utenti` sia
    in `tenants` — la stessa trappola descritta sopra, con un errore di ambiguità al posto
    dello zero.

    Il referente è il PRIMO UTENTE creato, qualunque ruolo abbia oggi: è chi ha aperto lo
    studio. Era «il primo amministratore attuale», e la revisione di sicurezza del 18/09/2026
    ha mostrato perché non va: chi si registra con i dati di un broker vero poteva creare un
    secondo amministratore, declassare il primo, e far comparire al gestore un altro
    indirizzo come referente — proprio sulla riga che il gestore guarda prima di attivare.
  */
  const utentiInOrdine = await db
    .select({
      tenantId: schema.utenti.tenantId,
      email: schema.utenti.email,
      emailVerificataIl: schema.utenti.emailVerificataIl,
    })
    .from(schema.utenti)
    .orderBy(schema.utenti.creatoIl, schema.utenti.id);

  const referenti = new Map<string, { email: string; emailConfermata: boolean }>();
  for (const a of utentiInOrdine) {
    if (!referenti.has(a.tenantId)) {
      referenti.set(a.tenantId, { email: a.email, emailConfermata: a.emailVerificataIl !== null });
    }
  }

  return righe.map((r) => ({ ...r, utenti: Number(r.utenti), referente: referenti.get(r.id) ?? null }));
}

/**
 * Apre un nuovo studio cliente.
 *
 * Nasce sempre **non gestore**: l'infrastruttura resta di chi l'ha installata, e un
 * cliente creato per errore con quel flag vedrebbe la fornitura dati di tutti gli altri.
 */
export async function creaStudio(
  db: Database,
  denominazione: string,
  opzioni: {
    /** Identificativo scelto da chi chiama: serve a creare studio e primo utente nella stessa transazione. */
    readonly id?: string;
    readonly numeroRui?: string | null;
    /** Registrato dal modulo pubblico: nasce senza acquisti, finché il gestore non lo attiva. */
    readonly autoRegistrato?: boolean;
  } = {},
): Promise<string> {
  const autoRegistrato = opzioni.autoRegistrato === true;
  const creati = await db
    .insert(schema.tenants)
    .values({
      ...(opzioni.id === undefined ? {} : { id: opzioni.id }),
      denominazione,
      numeroRui: opzioni.numeroRui ?? null,
      gestorePiattaforma: false,
      autoRegistrato,
      acquistiAbilitati: !autoRegistrato,
    })
    .returning({ id: schema.tenants.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione dello studio non riuscita');
  return creato.id;
}

/**
 * Sospende o riattiva uno studio.
 *
 * Sospendere non cancella: i dati restano, gli accessi no. È la leva per il mancato
 * pagamento di un abbonamento, dove distruggere il portafoglio di un cliente sarebbe
 * sproporzionato e probabilmente illecito.
 */
export async function impostaAttivitaStudio(
  db: Database,
  tenantId: string,
  attivo: boolean,
): Promise<void> {
  await db.update(schema.tenants).set({ attivo }).where(eq(schema.tenants.id, tenantId));
}

/**
 * Attiva o blocca gli acquisti di dati di uno studio.
 *
 * È la leva della registrazione pubblica: uno studio registrato da solo entra e lavora, ma
 * compra solo dopo che il gestore lo ha guardato e attivato. Non tocca gli accessi.
 */
export async function impostaAcquistiStudio(
  db: Database,
  tenantId: string,
  abilitati: boolean,
): Promise<void> {
  await db
    .update(schema.tenants)
    .set({ acquistiAbilitati: abilitati })
    .where(eq(schema.tenants.id, tenantId));
}

/**
 * Chi è lo studio di chi sta lavorando: se gestisce la piattaforma e se è ancora attivo.
 *
 * Le due cose si leggono insieme perché servono insieme, a ogni richiesta, e sarebbero
 * due interrogazioni sulla stessa riga.
 *
 * `gestorePiattaforma` è la sola porta d'accesso a ciò che riguarda la fornitura dei dati
 * — servizi autorizzati, credito residuo, spesa complessiva. Uno studio cliente non deve
 * poterlo scoprire nemmeno per errore, e non basta nasconderne le voci di menù.
 *
 * `attivo` è la sospensione: uno studio sospeso non entra e non resta dentro. Verificarla
 * solo all'accesso lascerebbe lavorare per giorni chi ha già un cookie in tasca.
 */
export interface StatoStudio {
  readonly gestorePiattaforma: boolean;
  readonly attivo: boolean;
  /** Se lo studio può comprare dati: falso per chi si è registrato e non è ancora stato attivato. */
  readonly acquistiAbilitati: boolean;
}

export async function statoStudio(db: Database, tenantId: string): Promise<StatoStudio> {
  const righe = await db
    .select({
      gestorePiattaforma: schema.tenants.gestorePiattaforma,
      attivo: schema.tenants.attivo,
      acquistiAbilitati: schema.tenants.acquistiAbilitati,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  // Uno studio che non esiste non è né gestore né attivo: negare è l'unico esito sicuro.
  return righe[0] ?? { gestorePiattaforma: false, attivo: false, acquistiAbilitati: false };
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
  readonly logo?: string | null | undefined;
}

export async function aggiornaStudio(db: Database, tenantId: string, dati: ModificheStudio): Promise<void> {
  // Solo i campi effettivamente inviati: un aggiornamento parziale non deve cancellare
  // i recapiti che il modulo non ha toccato.
  const modifiche: Record<string, string | null> = {};
  if (dati.denominazione !== undefined && dati.denominazione.trim() !== '') {
    modifiche['denominazione'] = dati.denominazione.trim();
  }
  for (const chiave of ['numeroRui', 'partitaIva', 'indirizzo', 'email', 'telefono', 'logo'] as const) {
    const valore = dati[chiave];
    if (valore === undefined) continue;
    modifiche[chiave] = valore === null || valore.trim() === '' ? null : valore.trim();
  }

  if (Object.keys(modifiche).length === 0) return;
  await db.update(schema.tenants).set(modifiche).where(eq(schema.tenants.id, tenantId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Codici mandati per email
// ─────────────────────────────────────────────────────────────────────────────

export type ScopoCodiceEmail = 'conferma-email' | 'nuova-password';

/**
 * Registra un codice appena mandato per email. Riceve l'impronta, mai il codice: il codice
 * esiste solo nell'email e nell'indirizzo del collegamento.
 */
export async function creaCodiceEmail(
  db: Database,
  dati: {
    readonly utenteId: string;
    readonly tenantId: string;
    readonly scopo: ScopoCodiceEmail;
    readonly impronta: string;
    readonly scadeIl: Date;
  },
): Promise<void> {
  await db.insert(schema.codiciEmail).values({
    utenteId: dati.utenteId,
    tenantId: dati.tenantId,
    scopo: dati.scopo,
    impronta: dati.impronta,
    scadeIl: dati.scadeIl,
  });
}

/**
 * Consuma un codice: lo segna usato e dice di chi è — oppure `null` se non esiste, è di un
 * altro scopo, è scaduto o è già stato usato.
 *
 * Una sola istruzione, controllo e consumo insieme: con una lettura seguita da una scrittura,
 * due richieste arrivate nello stesso istante con lo stesso codice passerebbero entrambe il
 * controllo, e il codice «monouso» varrebbe due volte.
 */
export async function consumaCodiceEmail(
  db: Database,
  dati: { readonly impronta: string; readonly scopo: ScopoCodiceEmail; readonly adesso: Date },
): Promise<{ readonly utenteId: string; readonly tenantId: string } | null> {
  const righe = await db
    .update(schema.codiciEmail)
    .set({ usatoIl: dati.adesso })
    .where(
      and(
        eq(schema.codiciEmail.impronta, dati.impronta),
        eq(schema.codiciEmail.scopo, dati.scopo),
        isNull(schema.codiciEmail.usatoIl),
        gt(schema.codiciEmail.scadeIl, dati.adesso),
      ),
    )
    .returning({ utenteId: schema.codiciEmail.utenteId, tenantId: schema.codiciEmail.tenantId });

  return righe[0] ?? null;
}

/**
 * Annulla i codici ancora validi di un utente per uno scopo: dopo una nuova password, i
 * collegamenti precedenti per cambiarla non devono funzionare più.
 */
export async function annullaCodiciEmail(
  db: Database,
  utenteId: string,
  scopo: ScopoCodiceEmail,
  adesso: Date,
): Promise<void> {
  await db
    .update(schema.codiciEmail)
    .set({ usatoIl: adesso })
    .where(
      and(
        eq(schema.codiciEmail.utenteId, utenteId),
        eq(schema.codiciEmail.scopo, scopo),
        isNull(schema.codiciEmail.usatoIl),
      ),
    );
}

/** Quanti codici di uno scopo sono stati mandati a un utente da una certa ora: frena gli invii ripetuti. */
export async function contaCodiciEmailDal(
  db: Database,
  utenteId: string,
  scopo: ScopoCodiceEmail,
  dal: Date,
): Promise<number> {
  const righe = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.codiciEmail)
    .where(
      and(
        eq(schema.codiciEmail.utenteId, utenteId),
        eq(schema.codiciEmail.scopo, scopo),
        gt(schema.codiciEmail.creatoIl, dal),
      ),
    );
  return Number(righe[0]?.n ?? 0);
}

/**
 * Un codice non scaduto, **anche se già usato**. Solo per la conferma dell'indirizzo, che si
 * può ripetere senza danni: i filtri antivirus di molte caselle aprono i collegamenti prima
 * della persona, e bruciare il codice al loro passaggio lascerebbe il titolare davanti a
 * «collegamento non valido» al primo clic. Per la nuova password vale solo `consumaCodiceEmail`.
 */
export async function trovaCodiceEmailValido(
  db: Database,
  dati: { readonly impronta: string; readonly scopo: 'conferma-email'; readonly adesso: Date },
): Promise<{ readonly utenteId: string; readonly tenantId: string } | null> {
  const righe = await db
    .select({ utenteId: schema.codiciEmail.utenteId, tenantId: schema.codiciEmail.tenantId })
    .from(schema.codiciEmail)
    .where(
      and(
        eq(schema.codiciEmail.impronta, dati.impronta),
        eq(schema.codiciEmail.scopo, dati.scopo),
        gt(schema.codiciEmail.scadeIl, dati.adesso),
      ),
    )
    .limit(1);
  return righe[0] ?? null;
}

/** L'utente ha aperto il collegamento: l'indirizzo è suo. La prima conferma resta, le successive non la spostano. */
export async function segnaEmailVerificata(db: Database, utenteId: string, quando: Date): Promise<void> {
  await db
    .update(schema.utenti)
    .set({ emailVerificataIl: quando })
    .where(and(eq(schema.utenti.id, utenteId), isNull(schema.utenti.emailVerificataIl)));
}

/**
 * Chi ha aperto lo studio — il primo utente creato — e se ha confermato l'indirizzo.
 *
 * È la condizione per attivare gli acquisti di uno studio registrato da solo, quando la posta
 * funziona: prima di spendere il credito della piattaforma, chi si è registrato deve aver
 * dimostrato di leggere la casella che ha dichiarato. Va chiamata dentro `conTenant`.
 */
export async function referenteDelloStudio(
  db: Database,
  tenantId: string,
): Promise<{ readonly email: string; readonly emailConfermata: boolean } | null> {
  const righe = await db
    .select({ email: schema.utenti.email, emailVerificataIl: schema.utenti.emailVerificataIl })
    .from(schema.utenti)
    .where(eq(schema.utenti.tenantId, tenantId))
    .orderBy(schema.utenti.creatoIl, schema.utenti.id)
    .limit(1);
  const riga = righe[0];
  return riga === undefined
    ? null
    : { email: riga.email, emailConfermata: riga.emailVerificataIl !== null };
}

/**
 * Apre una sessione solo se la password è ancora quella verificata.
 *
 * L'accesso legge l'impronta, la verifica (un decimo di secondo di scrypt) e poi apre la
 * sessione. Se nel frattempo la password cambia — nuova password dal collegamento, cambio
 * dalle impostazioni — la revoca delle sessioni avviene fra la lettura e l'apertura, e la
 * sessione nuova nasce dopo la revoca: valida dodici ore con la password vecchia. È la corsa
 * che la revisione di sicurezza del 18/09/2026 ha trovato.
 *
 * Il blocco della riga dell'utente (`FOR UPDATE`) mette in fila le due cose: se il cambio
 * password è arrivato prima, qui si legge l'impronta nuova e non si apre niente; se arriva
 * dopo, aspetta che questa sessione esista, e la revoca la trova. Va chiamata dentro
 * `conTenant`, cioè dentro una transazione.
 */
export async function creaSessioneSePasswordInvariata(
  db: Database,
  dati: {
    utenteId: string;
    tenantId: string;
    improntaToken: string;
    scadeIl: Date;
    indirizzoIp?: string | undefined;
    userAgent?: string | undefined;
    passwordHashAtteso: string;
  },
): Promise<string | null> {
  const righe = await db
    .select({ passwordHash: schema.utenti.passwordHash })
    .from(schema.utenti)
    .where(eq(schema.utenti.id, dati.utenteId))
    .for('update')
    .limit(1);
  if (righe[0]?.passwordHash !== dati.passwordHashAtteso) return null;
  const { passwordHashAtteso: _atteso, ...sessione } = dati;
  return creaSessione(db, sessione);
}
