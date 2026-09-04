/**
 * Repository.
 *
 * Traducono fra il dominio e le tabelle. Due regole sopra tutte:
 *
 *  - **gli snapshot non si aggiornano mai**: ogni acquisizione dal provider è una riga
 *    nuova. Un'analisi fatta a marzo deve restare riproducibile a dicembre, con i dati
 *    di marzo — non con quelli corretti nel frattempo. È un requisito legale, non un vezzo;
 *  - **le analisi si congelano** insieme alle versioni di catalogo e regole che le hanno
 *    prodotte. Ricalcolarle con il motore di domani darebbe un altro numero, e un numero
 *    non riproducibile è indifendibile davanti a una contestazione.
 */

import { and, desc, eq, gte, ilike, isNull, sql } from 'drizzle-orm';
import { righeDi } from './client.js';
import type { Database } from './client.js';
import * as schema from './schema.js';
import { inizioDellaGiornata } from '@aegis/core/tempo';

// ─────────────────────────────────────────────────────────────────────────────
// Tenant e aziende
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recupera o crea l'intermediario predefinito.
 * Passaggio provvisorio finché non c'è autenticazione: il multi-tenant è già nello schema
 * e negli indici, manca solo chi popola l'identità dell'utente.
 */
export async function assicuraTenantPredefinito(db: Database, denominazione: string): Promise<string> {
  const esistenti = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .orderBy(schema.tenants.creatoIl)
    .limit(1);
  const esistente = esistenti[0];
  if (esistente !== undefined) {
    /*
      Archivio nato prima che esistesse la distinzione fra gestore e clienti.

      Senza questa riparazione nessuno risulterebbe gestore: le pagine della fornitura
      dati diventerebbero irraggiungibili per tutti, compreso chi ha installato la
      piattaforma, e non ci sarebbe modo di rimediare dall'interfaccia.

      La migrazione versionata fa lo stesso su PostgreSQL. Qui serve lo stesso perché il
      percorso di sviluppo crea lo schema con `CREATE TABLE IF NOT EXISTS`, che su una
      tabella già presente non aggiunge le colonne nuove e non ripara nulla.
    */
    const gestori = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.gestorePiattaforma, true))
      .limit(1);

    if (gestori[0] === undefined) {
      await db
        .update(schema.tenants)
        .set({ gestorePiattaforma: true })
        .where(eq(schema.tenants.id, esistente.id));
    }

    return esistente.id;
  }

  // Il primo studio che esiste su un archivio vuoto è quello di chi ha installato la
  // piattaforma: è lui a possedere il contratto con gli archivi dati. Gli studi creati
  // dopo sono clienti, e restano tali salvo intervento esplicito.
  const creati = await db
    .insert(schema.tenants)
    .values({ denominazione, gestorePiattaforma: true })
    .returning({ id: schema.tenants.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione del tenant non riuscita');
  return creato.id;
}

export interface DatiAzienda {
  readonly partitaIva: string | null;
  readonly codiceFiscale: string | null;
  readonly denominazione: string;
  readonly providerId: string | null;
  readonly provincia: string | null;
  readonly atecoPrimario: string | null;
}

/**
 * Crea l'azienda se non esiste, altrimenti ne aggiorna i dati anagrafici.
 * L'identità è la coppia (tenant, partita IVA): la stessa azienda seguita da due broker
 * diversi è due righe distinte, ed è corretto — i portafogli non si mescolano.
 */
export async function assicuraAzienda(db: Database, tenantId: string, dati: DatiAzienda): Promise<string> {
  const chiave = dati.partitaIva ?? dati.providerId ?? dati.denominazione;

  const esistenti = await db
    .select({ id: schema.aziende.id })
    .from(schema.aziende)
    .where(and(eq(schema.aziende.tenantId, tenantId), eq(schema.aziende.partitaIva, chiave)))
    .limit(1);

  const esistente = esistenti[0];
  if (esistente !== undefined) {
    /*
      Non si sovrascrive ciò che si sa con ciò che non si sa.

      Questa funzione la chiamano anche operazioni che dell'azienda conoscono solo la
      partita IVA — salvare i dati di intervista, allegare una fotografia — e che passavano
      quella come denominazione, per non lasciarla vuota. L'aggiornamento la scriveva sopra
      al nome vero arrivato dall'analisi, e da quel momento l'impresa si chiamava
      «02072030980»: nel portafoglio, nel monitoraggio, e nel questionario che il cliente
      riceve. Una perdita di dato provocata da un gesto ordinario.

      Da qui in avanti un campo si aggiorna solo se porta un valore, e la denominazione
      solo se è un nome — non la chiave con cui l'azienda è archiviata.
    */
    const aggiornamento: Record<string, unknown> = { aggiornataIl: new Date() };
    if (dati.denominazione !== '' && dati.denominazione !== chiave) {
      aggiornamento['denominazione'] = dati.denominazione;
    }
    if (dati.providerId !== null) aggiornamento['providerId'] = dati.providerId;
    if (dati.provincia !== null) aggiornamento['provincia'] = dati.provincia;
    if (dati.atecoPrimario !== null) aggiornamento['atecoPrimario'] = dati.atecoPrimario;

    await db.update(schema.aziende).set(aggiornamento).where(eq(schema.aziende.id, esistente.id));
    return esistente.id;
  }

  const creati = await db
    .insert(schema.aziende)
    .values({
      tenantId,
      partitaIva: chiave,
      codiceFiscale: dati.codiceFiscale,
      denominazione: dati.denominazione,
      providerId: dati.providerId,
      provincia: dati.provincia,
      atecoPrimario: dati.atecoPrimario,
    })
    .returning({ id: schema.aziende.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione dell’azienda non riuscita');
  return creato.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot immutabili
// ─────────────────────────────────────────────────────────────────────────────

export interface DatiSnapshot {
  readonly aziendaId: string;
  readonly tenantId: string;
  readonly provider: string;
  readonly livello: 'base' | 'esteso' | 'completo';
  readonly profilo: unknown;
  readonly osservatoIl: Date;
  readonly costoCentesimi: number;
}

/** Solo INSERT. Non esiste, e non deve esistere, un `aggiornaSnapshot`. */
export async function salvaSnapshot(db: Database, dati: DatiSnapshot): Promise<string> {
  const creati = await db
    .insert(schema.snapshotAzienda)
    .values({
      aziendaId: dati.aziendaId,
      tenantId: dati.tenantId,
      provider: dati.provider,
      livello: dati.livello,
      profilo: dati.profilo,
      osservatoIl: dati.osservatoIl,
      costoCentesimi: dati.costoCentesimi,
    })
    .returning({ id: schema.snapshotAzienda.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Salvataggio dello snapshot non riuscito');
  return creato.id;
}

export async function ultimoSnapshot(
  db: Database,
  aziendaId: string,
): Promise<{ id: string; profilo: unknown; osservatoIl: Date } | null> {
  const righe = await db
    .select({
      id: schema.snapshotAzienda.id,
      profilo: schema.snapshotAzienda.profilo,
      osservatoIl: schema.snapshotAzienda.osservatoIl,
    })
    .from(schema.snapshotAzienda)
    .where(eq(schema.snapshotAzienda.aziendaId, aziendaId))
    .orderBy(desc(schema.snapshotAzienda.acquisitoIl))
    .limit(1);

  return righe[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier: i dati raccolti dall'intermediario
// ─────────────────────────────────────────────────────────────────────────────

export async function leggiDatiDichiarati(
  db: Database,
  aziendaId: string,
): Promise<{ dati: Record<string, unknown>; aggiornatoIl: Date } | null> {
  const righe = await db
    .select({ dati: schema.dossier.datiDichiarati, aggiornatoIl: schema.dossier.aggiornatoIl })
    .from(schema.dossier)
    .where(eq(schema.dossier.aziendaId, aziendaId))
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;
  return { dati: (riga.dati ?? {}) as Record<string, unknown>, aggiornatoIl: riga.aggiornatoIl };
}

/**
 * @param aggiornatoDa chi ha raccolto questi dati. `null` quando li ha inseriti il
 * cliente dalla porta pubblica del questionario: la colonna referenzia gli utenti della
 * piattaforma, e il cliente non lo è. Quel caso resta distinguibile dall'audit trail, che
 * lo registra con un'azione propria.
 */
export async function salvaDatiDichiarati(
  db: Database,
  tenantId: string,
  aziendaId: string,
  dati: Record<string, unknown>,
  completezza: number | null,
  aggiornatoDa: string | null = null,
): Promise<void> {
  await db
    .insert(schema.dossier)
    .values({
      aziendaId,
      tenantId,
      datiDichiarati: dati,
      completezza: completezza === null ? null : completezza.toFixed(4),
      aggiornatoDa,
      aggiornatoIl: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.dossier.aziendaId,
      set: {
        datiDichiarati: dati,
        completezza: completezza === null ? null : completezza.toFixed(4),
        aggiornatoDa,
        aggiornatoIl: new Date(),
      },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Polizze
// ─────────────────────────────────────────────────────────────────────────────

export interface RigaPolizza {
  readonly copertura: string;
  readonly compagnia: string;
  readonly numeroPolizza: string | null;
  readonly sommaAssicurataCentesimi: number | null;
  readonly massimaleCentesimi: number | null;
  readonly franchigiaCentesimi: number | null;
  readonly scoperto: number | null;
  readonly premioAnnuoCentesimi: number | null;
  readonly formaGaranzia: string | null;
  readonly dataEffetto: string;
  readonly dataScadenza: string;
  readonly note: string | null;
}

/**
 * Sostituisce l'intero portafoglio polizze dell'azienda.
 *
 * La UI invia sempre l'elenco completo: una sincronizzazione incrementale richiederebbe
 * identificativi stabili lato client e produrrebbe duplicati al primo salvataggio parziale.
 * La sostituzione in transazione è più semplice e non lascia stati intermedi.
 */
export async function sostituisciPolizze(
  db: Database,
  tenantId: string,
  aziendaId: string,
  polizze: readonly RigaPolizza[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.polizze).where(eq(schema.polizze.aziendaId, aziendaId));
    if (polizze.length === 0) return;

    await tx.insert(schema.polizze).values(
      polizze.map((p) => ({
        aziendaId,
        tenantId,
        copertura: p.copertura,
        compagnia: p.compagnia,
        numeroPolizza: p.numeroPolizza,
        sommaAssicurataCentesimi: p.sommaAssicurataCentesimi,
        massimaleCentesimi: p.massimaleCentesimi,
        franchigiaCentesimi: p.franchigiaCentesimi,
        scoperto: p.scoperto === null ? null : p.scoperto.toFixed(4),
        premioAnnuoCentesimi: p.premioAnnuoCentesimi,
        formaGaranzia: p.formaGaranzia,
        dataEffetto: p.dataEffetto,
        dataScadenza: p.dataScadenza,
        note: p.note,
      })),
    );
  });
}

export async function leggiPolizze(db: Database, aziendaId: string): Promise<readonly RigaPolizza[]> {
  const righe = await db
    .select()
    .from(schema.polizze)
    .where(eq(schema.polizze.aziendaId, aziendaId))
    .orderBy(schema.polizze.dataScadenza);

  return righe.map((r) => ({
    copertura: r.copertura,
    compagnia: r.compagnia,
    numeroPolizza: r.numeroPolizza,
    sommaAssicurataCentesimi: r.sommaAssicurataCentesimi,
    massimaleCentesimi: r.massimaleCentesimi,
    franchigiaCentesimi: r.franchigiaCentesimi,
    scoperto: r.scoperto === null ? null : Number.parseFloat(r.scoperto),
    premioAnnuoCentesimi: r.premioAnnuoCentesimi,
    formaGaranzia: r.formaGaranzia,
    dataEffetto: r.dataEffetto,
    dataScadenza: r.dataScadenza,
    note: r.note,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ricerca fra le aziende già in archivio
// ─────────────────────────────────────────────────────────────────────────────

export interface AziendaInArchivio {
  readonly identificativo: string;
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly provincia: string | null;
  readonly atecoPrimario: string | null;
  readonly aggiornataIl: Date;
}

/**
 * Cerca fra le aziende che questo intermediario ha già in archivio.
 *
 * **Non costa nulla e non tocca il fornitore.** È la risposta al difetto più fastidioso del
 * nostro modello rispetto a Creditsafe: da loro cercare è gratis e illimitato, da noi ogni
 * ricerca compra un'anagrafica. Un broker che digita tre volte il nome sbagliato prima di
 * trovare il cliente giusto ha speso trenta centesimi per arrivare a un'azienda che aveva
 * già in casa.
 *
 * ## Perché è limitata al proprio archivio
 *
 * Le risposte comprate sono condivise fra gli studi — sono dati pubblici pagati con un
 * contratto unico — ma **l'elenco di chi si segue no**. Sapere quali aziende un altro studio
 * ha analizzato significa sapere chi sono i suoi clienti e chi sta cercando di acquisire.
 * Il risparmio non vale quel prezzo, e la separazione è la stessa che vale per dossier e
 * portafoglio.
 */
export async function cercaAziendeInArchivio(
  db: Database,
  tenantId: string,
  criteri: { readonly denominazione?: string | undefined; readonly partitaIva?: string | undefined },
  limite = 20,
): Promise<readonly AziendaInArchivio[]> {
  /*
    Una riga che si chiama come la propria chiave non è un'impresa trovata: è un segnaposto.

    La creano le operazioni che dell'azienda conoscono solo la partita IVA — un invito al
    questionario, una fotografia — passando la chiave come denominazione, perché la colonna
    non ammette il vuoto. La ricerca la restituiva come «Trovata nel suo archivio — nessun
    costo», con la partita IVA al posto del nome, senza comune né stato. Chi la vedeva
    concludeva che il prodotto non sapeva chi fosse l'impresa. Un segnaposto non si
    restituisce: si passa al fornitore, che è ciò che l'utente ha chiesto.
  */
  const condizioni = [
    eq(schema.aziende.tenantId, tenantId),
    sql`${schema.aziende.denominazione} <> coalesce(${schema.aziende.partitaIva}, ${schema.aziende.providerId}, '')`,
  ];

  if (criteri.partitaIva !== undefined && criteri.partitaIva !== '') {
    condizioni.push(eq(schema.aziende.partitaIva, criteri.partitaIva));
  } else if (criteri.denominazione !== undefined && criteri.denominazione.trim() !== '') {
    /*
      Ricerca per sottostringa, senza distinzione fra maiuscole e minuscole.

      `ilike` e non `like`: le denominazioni camerali sono tutte in maiuscolo e nessuno le
      digita così. Cercare «meccanica» e non trovare «MECCANICA BRESCIANA S.R.L.» farebbe
      concludere che l'azienda non c'è, e si pagherebbe una ricerca per riscoprirlo.
    */
    condizioni.push(ilike(schema.aziende.denominazione, `%${criteri.denominazione.trim()}%`));
  } else {
    return [];
  }

  const righe = await db
    .select({
      partitaIva: schema.aziende.partitaIva,
      providerId: schema.aziende.providerId,
      denominazione: schema.aziende.denominazione,
      provincia: schema.aziende.provincia,
      atecoPrimario: schema.aziende.atecoPrimario,
      aggiornataIl: schema.aziende.aggiornataIl,
    })
    .from(schema.aziende)
    .where(and(...condizioni))
    .orderBy(desc(schema.aziende.aggiornataIl))
    .limit(limite);

  return righe.flatMap((r) => {
    const identificativo = r.partitaIva ?? r.providerId;
    if (identificativo === null) return [];
    return [
      {
        identificativo,
        denominazione: r.denominazione,
        partitaIva: r.partitaIva,
        provincia: r.provincia,
        atecoPrimario: r.atecoPrimario,
        aggiornataIl: r.aggiornataIl,
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache delle risposte dei fornitori
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legge una risposta già comprata, se non è scaduta.
 *
 * La riga scaduta viene **cancellata alla lettura** invece che da un lavoro periodico: è
 * il momento in cui si sa con certezza che non serve più, e non richiede un altro processo
 * che qualcuno dovrà ricordarsi di far girare.
 */
export async function leggiCache(
  db: Database,
  chiave: string,
  adesso = new Date(),
): Promise<{ valore: unknown; scadeIl: Date } | null> {
  const righe = await db
    .select({ valore: schema.cacheRisposte.valore, scadeIl: schema.cacheRisposte.scadeIl })
    .from(schema.cacheRisposte)
    .where(eq(schema.cacheRisposte.chiave, chiave))
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;

  if (riga.scadeIl.getTime() <= adesso.getTime()) {
    await db.delete(schema.cacheRisposte).where(eq(schema.cacheRisposte.chiave, chiave));
    return null;
  }

  return { valore: riga.valore, scadeIl: riga.scadeIl };
}

/**
 * Conserva una risposta comprata.
 *
 * `onConflictDoUpdate` e non un inserimento semplice: due analisi della stessa azienda
 * lanciate insieme scriverebbero la stessa chiave, e un vincolo violato farebbe fallire
 * l'analisi **dopo** aver già pagato il dato.
 */
export async function scriviCache(
  db: Database,
  chiave: string,
  valore: unknown,
  scadeIl: Date,
): Promise<void> {
  await db
    .insert(schema.cacheRisposte)
    .values({ chiave, valore, scadeIl })
    .onConflictDoUpdate({
      target: schema.cacheRisposte.chiave,
      set: { valore, scadeIl, scrittaIl: new Date() },
    });
}

export async function dimenticaCache(db: Database, chiave: string): Promise<void> {
  await db.delete(schema.cacheRisposte).where(eq(schema.cacheRisposte.chiave, chiave));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inviti a compilare il questionario
// ─────────────────────────────────────────────────────────────────────────────

export interface InvitoQuestionario {
  readonly id: string;
  readonly aziendaId: string;
  readonly tenantId: string;
  readonly creatoIl: Date;
  readonly scadeIl: Date;
  readonly compilatoIl: Date | null;
  readonly revocatoIl: Date | null;
}

/**
 * Crea l'invito, **revocando quelli precedenti** per la stessa azienda.
 *
 * Un collegamento per volta: se l'intermediario ne genera un altro è perché il primo non
 * va bene — indirizzo sbagliato, referente cambiato, sospetto che sia finito altrove. In
 * quel caso lasciarlo valido sarebbe esattamente il contrario di ciò che si sta facendo.
 */
export async function creaInvito(
  db: Database,
  dati: {
    readonly aziendaId: string;
    readonly tenantId: string;
    readonly impronta: string;
    readonly scadeIl: Date;
    readonly creatoDa: string | null;
  },
): Promise<InvitoQuestionario> {
  await db
    .update(schema.invitiQuestionario)
    .set({ revocatoIl: new Date() })
    .where(
      and(
        eq(schema.invitiQuestionario.aziendaId, dati.aziendaId),
        isNull(schema.invitiQuestionario.revocatoIl),
      ),
    );

  const [riga] = await db
    .insert(schema.invitiQuestionario)
    .values({
      aziendaId: dati.aziendaId,
      tenantId: dati.tenantId,
      impronta: dati.impronta,
      scadeIl: dati.scadeIl,
      creatoDa: dati.creatoDa,
    })
    .returning();

  if (riga === undefined) throw new Error('Creazione dell’invito non riuscita');
  return daRigaInvito(riga);
}

/**
 * Risolve un invito dalla sua impronta.
 *
 * **Senza contesto di intermediario**, perché è il token stesso a dire di chi è: è la
 * ragione per cui questa tabella non ha una policy di isolamento. Restituisce `null` se
 * l'invito non esiste, è scaduto o è stato revocato — tre casi che a chi bussa devono
 * apparire identici, altrimenti si può capire se un collegamento è esistito.
 */
export async function risolviInvito(
  db: Database,
  impronta: string,
  adesso = new Date(),
): Promise<InvitoQuestionario | null> {
  const righe = await db
    .select()
    .from(schema.invitiQuestionario)
    .where(eq(schema.invitiQuestionario.impronta, impronta))
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;
  if (riga.revocatoIl !== null) return null;
  if (riga.scadeIl.getTime() <= adesso.getTime()) return null;

  return daRigaInvito(riga);
}

/** L'invito attivo di un'azienda, per dire all'intermediario se c'è e a che punto è. */
export async function invitoAttivo(
  db: Database,
  aziendaId: string,
  adesso = new Date(),
): Promise<InvitoQuestionario | null> {
  const righe = await db
    .select()
    .from(schema.invitiQuestionario)
    .where(
      and(eq(schema.invitiQuestionario.aziendaId, aziendaId), isNull(schema.invitiQuestionario.revocatoIl)),
    )
    .orderBy(desc(schema.invitiQuestionario.creatoIl))
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;
  if (riga.scadeIl.getTime() <= adesso.getTime()) return null;
  return daRigaInvito(riga);
}

export async function revocaInviti(db: Database, tenantId: string, aziendaId: string): Promise<number> {
  const righe = await db
    .update(schema.invitiQuestionario)
    .set({ revocatoIl: new Date() })
    .where(
      and(
        eq(schema.invitiQuestionario.aziendaId, aziendaId),
        eq(schema.invitiQuestionario.tenantId, tenantId),
        isNull(schema.invitiQuestionario.revocatoIl),
      ),
    )
    .returning({ id: schema.invitiQuestionario.id });

  return righe.length;
}

export async function segnaInvitoCompilato(db: Database, invitoId: string): Promise<void> {
  await db
    .update(schema.invitiQuestionario)
    .set({ compilatoIl: new Date() })
    .where(eq(schema.invitiQuestionario.id, invitoId));
}

/** L'identificativo di riga di un'azienda, dentro un intermediario. `null` se non c'è. */
export async function trovaAziendaPerChiave(
  db: Database,
  tenantId: string,
  chiave: string,
): Promise<string | null> {
  const righe = await db
    .select({ id: schema.aziende.id })
    .from(schema.aziende)
    .where(and(eq(schema.aziende.tenantId, tenantId), eq(schema.aziende.partitaIva, chiave)))
    .limit(1);

  return righe[0]?.id ?? null;
}

/**
 * Denominazione e chiave di un'azienda dal suo identificativo di riga.
 *
 * Serve al percorso pubblico del questionario: il token porta a un `aziendaId`, ma il
 * dossier si indirizza con la partita IVA. Restituisce **solo** questi due campi, perché
 * è tutto ciò che una pagina senza autenticazione ha diritto di sapere.
 */
export async function chiaveAzienda(
  db: Database,
  aziendaId: string,
): Promise<{ readonly chiave: string; readonly denominazione: string } | null> {
  const righe = await db
    .select({
      partitaIva: schema.aziende.partitaIva,
      providerId: schema.aziende.providerId,
      denominazione: schema.aziende.denominazione,
    })
    .from(schema.aziende)
    .where(eq(schema.aziende.id, aziendaId))
    .limit(1);

  const riga = righe[0];
  if (riga === undefined) return null;

  const chiave = riga.partitaIva ?? riga.providerId;
  if (chiave === null) return null;

  return { chiave, denominazione: riga.denominazione };
}

function daRigaInvito(riga: typeof schema.invitiQuestionario.$inferSelect): InvitoQuestionario {
  return {
    id: riga.id,
    aziendaId: riga.aziendaId,
    tenantId: riga.tenantId,
    creatoIl: riga.creatoIl,
    scadeIl: riga.scadeIl,
    compilatoIl: riga.compilatoIl,
    revocatoIl: riga.revocatoIl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Immagini delle ubicazioni
// ─────────────────────────────────────────────────────────────────────────────

export interface RigaImmagine {
  readonly id: string;
  readonly ubicazioneId: string;
  readonly didascalia: string | null;
  readonly tipoMime: string;
  readonly dati: string;
  readonly dimensioneByte: number;
  readonly caricataIl: Date;
}

/**
 * Le immagini di un'azienda, in ordine di caricamento.
 *
 * Si legge **solo quando si compone il documento**: sono l'unica cosa in archivio che pesa
 * megabyte, e trascinarle dietro a ogni analisi sarebbe uno spreco per un dato che non
 * entra in nessun calcolo.
 */
export async function leggiImmagini(db: Database, aziendaId: string): Promise<readonly RigaImmagine[]> {
  const righe = await db
    .select()
    .from(schema.immaginiUbicazione)
    .where(eq(schema.immaginiUbicazione.aziendaId, aziendaId))
    .orderBy(schema.immaginiUbicazione.caricataIl);

  return righe.map((r) => ({
    id: r.id,
    ubicazioneId: r.ubicazioneId,
    didascalia: r.didascalia,
    tipoMime: r.tipoMime,
    dati: r.dati,
    dimensioneByte: r.dimensioneByte,
    caricataIl: r.caricataIl,
  }));
}

/** Quante immagini ha già una singola ubicazione: serve a far rispettare il tetto. */
export async function contaImmagini(
  db: Database,
  aziendaId: string,
  ubicazioneId: string,
): Promise<number> {
  const righe = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.immaginiUbicazione)
    .where(
      and(
        eq(schema.immaginiUbicazione.aziendaId, aziendaId),
        eq(schema.immaginiUbicazione.ubicazioneId, ubicazioneId),
      ),
    );

  return righe[0]?.n ?? 0;
}

export async function salvaImmagine(
  db: Database,
  tenantId: string,
  aziendaId: string,
  immagine: {
    readonly ubicazioneId: string;
    readonly didascalia: string | null;
    readonly tipoMime: string;
    readonly dati: string;
    readonly dimensioneByte: number;
    readonly caricataDa: string | null;
  },
): Promise<RigaImmagine> {
  const [riga] = await db
    .insert(schema.immaginiUbicazione)
    .values({
      aziendaId,
      tenantId,
      ubicazioneId: immagine.ubicazioneId,
      didascalia: immagine.didascalia,
      tipoMime: immagine.tipoMime,
      dati: immagine.dati,
      dimensioneByte: immagine.dimensioneByte,
      caricataDa: immagine.caricataDa,
    })
    .returning();

  if (riga === undefined) throw new Error('Inserimento immagine non riuscito');

  return {
    id: riga.id,
    ubicazioneId: riga.ubicazioneId,
    didascalia: riga.didascalia,
    tipoMime: riga.tipoMime,
    dati: riga.dati,
    dimensioneByte: riga.dimensioneByte,
    caricataIl: riga.caricataIl,
  };
}

/**
 * Cancella un'immagine, **vincolata all'azienda e all'intermediario**.
 *
 * L'identificativo da solo non basta: arriva dall'esterno, e senza il vincolo un
 * intermediario potrebbe cancellare la fotografia nel fascicolo di un concorrente
 * indovinando un UUID. Restituisce `false` quando non c'è nulla da cancellare — che è
 * anche la risposta giusta da dare a chi ci sta provando.
 */
export async function cancellaImmagine(
  db: Database,
  tenantId: string,
  aziendaId: string,
  immagineId: string,
): Promise<boolean> {
  const righe = await db
    .delete(schema.immaginiUbicazione)
    .where(
      and(
        eq(schema.immaginiUbicazione.id, immagineId),
        eq(schema.immaginiUbicazione.aziendaId, aziendaId),
        eq(schema.immaginiUbicazione.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.immaginiUbicazione.id });

  return righe.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analisi congelate
// ─────────────────────────────────────────────────────────────────────────────

export interface DatiAnalisi {
  readonly aziendaId: string;
  readonly tenantId: string;
  readonly snapshotId: string;
  /**
   * Chi ha eseguito l'analisi. La colonna esisteva e non la scriveva nessuno: davanti a
   * una contestazione, un'analisi senza autore è un documento che nessuno ha firmato.
   */
  readonly eseguitaDa?: string | null | undefined;
  readonly asOf: Date;
  readonly scoreCredito: number | null;
  readonly classeCredito: string | null;
  readonly fidoConsigliatoCentesimi: number | null;
  readonly patrimonioEspostoCentesimi: number | null;
  readonly esposizioneNonAssicurataCentesimi: number | null;
  readonly rischiCritici: number;
  readonly coperturaAssente: number;
  readonly statoCatNat: 'non-soggetta' | 'in-scadenza' | 'inadempiente' | 'adempiente';
  readonly risultato: unknown;
  /** Fotografia dei fatti sorvegliati: alimenta il monitoraggio. */
  readonly statoSorvegliato?: unknown;
  readonly versioneCore: string;
  readonly versioneCatalogoRischi: string;
  readonly versioneRegole: string;
  readonly gap: readonly RigaGap[];
}

export interface RigaGap {
  readonly copertura: string;
  readonly stato:
    | 'assente'
    | 'sottoassicurata'
    | 'massimale-insufficiente'
    | 'in-scadenza'
    | 'adeguata'
    | 'da-quantificare';
  readonly priorita: number;
  readonly obbligoDiLegge: boolean;
  readonly capitaleRaccomandatoCentesimi: number | null;
  readonly capitaleInEssereCentesimi: number | null;
  readonly azione: string;
  readonly motivazioneAdeguatezza: string;
}

export async function salvaAnalisi(db: Database, dati: DatiAnalisi): Promise<string> {
  return db.transaction(async (tx) => {
    const creati = await tx
      .insert(schema.analisi)
      .values({
        aziendaId: dati.aziendaId,
        tenantId: dati.tenantId,
        snapshotId: dati.snapshotId,
        eseguitaDa: dati.eseguitaDa ?? null,
        asOf: dati.asOf,
        scoreCredito: dati.scoreCredito,
        classeCredito: dati.classeCredito,
        fidoConsigliatoCentesimi: dati.fidoConsigliatoCentesimi,
        patrimonioEspostoCentesimi: dati.patrimonioEspostoCentesimi,
        esposizioneNonAssicurataCentesimi: dati.esposizioneNonAssicurataCentesimi,
        rischiCritici: dati.rischiCritici,
        coperturaAssente: dati.coperturaAssente,
        statoCatNat: dati.statoCatNat,
        risultato: dati.risultato,
        statoSorvegliato: dati.statoSorvegliato ?? null,
        versioneCore: dati.versioneCore,
        versioneCatalogoRischi: dati.versioneCatalogoRischi,
        versioneRegole: dati.versioneRegole,
      })
      .returning({ id: schema.analisi.id });

    const creato = creati[0];
    if (creato === undefined) throw new Error('Salvataggio dell’analisi non riuscito');

    if (dati.gap.length > 0) {
      // Le righe di gap sono estratte dal JSON perché la lista di lavoro del broker
      // — «tutte le posizioni non conformi, per priorità» — deve essere una query, non
      // una scansione di documenti.
      await tx.insert(schema.gapCoperture).values(
        dati.gap.map((g) => ({
          analisiId: creato.id,
          tenantId: dati.tenantId,
          aziendaId: dati.aziendaId,
          copertura: g.copertura,
          stato: g.stato,
          priorita: g.priorita,
          obbligoDiLegge: g.obbligoDiLegge,
          capitaleRaccomandatoCentesimi: g.capitaleRaccomandatoCentesimi,
          capitaleInEssereCentesimi: g.capitaleInEssereCentesimi,
          azione: g.azione,
          motivazioneAdeguatezza: g.motivazioneAdeguatezza,
        })),
      );
    }

    return creato.id;
  });
}

export interface VocePortafoglio {
  readonly identificativo: string;
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly provincia: string | null;
  readonly atecoPrimario: string | null;
  readonly scoreCredito: number | null;
  readonly classeCredito: string | null;
  readonly statoCatNat: string | null;
  readonly coperturaAssente: number | null;
  /** Coperture prive di capitale determinabile: distinguono «zero euro» da «non lo sappiamo». */
  readonly coperturaDaQuantificare: number | null;
  readonly rischiCritici: number | null;
  readonly esposizioneNonAssicurataCentesimi: number | null;
  /** Prima delle azioni prioritarie dell'analisi: è la colonna che rende il portafoglio una lista di lavoro. */
  readonly azionePrioritaria: string | null;
  /** Completamento del questionario, da 0 a 1. `null` se l'intervista non è mai stata aperta. */
  readonly completezza: number | null;
  readonly analizzataIl: Date;
}

/**
 * Un importo in centesimi letto da una query grezza.
 *
 * Le colonne di denaro sono `bigint`, e un `bigint` **non entra sempre** in un numero
 * JavaScript: per questo il driver di produzione lo restituisce come stringa. Chi legge
 * con `db.execute` non passa dalla mappatura di Drizzle e riceve quel testo così com'è.
 *
 * **L'assenza resta assenza.** Un importo non calcolato non è zero euro: zero verrebbe
 * sommato, ordinato e mostrato come un dato, e nessuno saprebbe più distinguerlo da
 * un'esposizione davvero nulla.
 */
function importo(valore: string | number | null): number | null {
  if (valore === null) return null;
  const numero = typeof valore === 'number' ? valore : Number(valore);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Portafoglio: l'ultima analisi per ciascuna azienda.
 *
 * `DISTINCT ON` è specifico di PostgreSQL ed è il modo più diretto per dire «la riga più
 * recente per gruppo» senza sottoquery correlate. Funziona identico su PGlite, che è
 * PostgreSQL.
 */
export async function elencoPortafoglio(
  db: Database,
  tenantId: string,
): Promise<readonly VocePortafoglio[]> {
  interface RigaGrezza {
    partita_iva: string | null;
    denominazione: string;
    provincia: string | null;
    ateco_primario: string | null;
    score_credito: number | null;
    classe_credito: string | null;
    stato_cat_nat: string | null;
    copertura_assente: number | null;
    copertura_da_quantificare: string | number | null;
    rischi_critici: number | null;
    /*
      `bigint`, quindi **stringa** su postgres.js.

      La dichiarava `number | null`, ed era falso su PostgreSQL vero: `execute` non passa
      dalla mappatura di Drizzle, quindi il tipo della colonna non viene applicato e
      decide il driver. `postgres.js` non ha un convertitore per l'OID 20 e restituisce il
      testo; PGlite lo converte, ed è la ragione per cui in sviluppo non si vedeva nulla.
    */
    esposizione_non_assicurata_centesimi: string | number | null;
    azione_prioritaria: string | null;
    completezza: string | number | null;
    creata_il: string;
  }

  // `execute` restituisce forme diverse a seconda del driver: postgres.js dà un array,
  // PGlite un oggetto con `rows`. Si normalizzano entrambe invece di legarsi a uno dei due.
  // L'azione prioritaria si legge dal risultato congelato dell'analisi, non si ricalcola:
  // il portafoglio deve dire ciò che l'analisi ha concluso quel giorno, non ciò che il
  // motore concluderebbe oggi. La completezza viene dal dossier, che è dove si compila.
  const risultato: unknown = await db.execute(sql`
    SELECT DISTINCT ON (a.id)
      a.partita_iva, a.denominazione, a.provincia, a.ateco_primario,
      n.score_credito, n.classe_credito, n.stato_cat_nat,
      n.copertura_assente, n.rischi_critici,
      n.esposizione_non_assicurata_centesimi, n.creata_il,
      n.risultato -> 'azioniPrioritarie' ->> 0 AS azione_prioritaria,
      n.risultato ->> 'coperturaDaQuantificare' AS copertura_da_quantificare,
      d.completezza
    FROM aziende a
    JOIN analisi n ON n.azienda_id = a.id
    LEFT JOIN dossier d ON d.azienda_id = a.id
    WHERE a.tenant_id = ${tenantId}
    ORDER BY a.id, n.creata_il DESC
  `);

  const righe = righeDi<RigaGrezza>(risultato);

  return righe.map((r) => ({
    identificativo: r.partita_iva ?? r.denominazione,
    denominazione: r.denominazione,
    partitaIva: r.partita_iva,
    provincia: r.provincia,
    atecoPrimario: r.ateco_primario,
    scoreCredito: r.score_credito,
    classeCredito: r.classe_credito,
    statoCatNat: r.stato_cat_nat,
    coperturaAssente: r.copertura_assente,
    // Letto dal risultato congelato: non ha una colonna propria perché serve solo a
    // qualificare l'esposizione, e una colonna in più è una migrazione in più.
    coperturaDaQuantificare:
      r.copertura_da_quantificare === null ? null : Number(r.copertura_da_quantificare),
    rischiCritici: r.rischi_critici,
    /*
      Convertito al confine del database, dove si sa cos'è.

      Senza, l'«esposizione complessiva» del portafoglio non era una somma ma una
      concatenazione: `0 + '150000' + '230000'` dà `'0150000230000'`, che diviso cento
      diventa 1.500.002.300 € a schermo. Nessun errore, nessun `NaN`: un numero enorme e
      plausibile in una schermata che il broker mostra al cliente.
    */
    esposizioneNonAssicurataCentesimi: importo(r.esposizione_non_assicurata_centesimi),
    azionePrioritaria: r.azione_prioritaria,
    // `numeric` torna come stringa dal driver: convertito qui, dove si sa cos'è.
    completezza: r.completezza === null ? null : Number(r.completezza),
    analizzataIl: new Date(r.creata_il),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit e costi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only. Il permesso di UPDATE e DELETE va revocato a livello di database.
 *
 * `utenteId` è **la ragione per cui questo registro esiste**. La colonna c'era, la firma
 * no: ogni riga usciva con l'autore a `NULL`, e il registro rispondeva «qualcuno, in
 * questo studio, ha fatto questa cosa» — cioè non rispondeva alla sola domanda che
 * un'ispezione pone.
 *
 * Resta facoltativo, e non per comodità: le azioni che arrivano dalla porta pubblica del
 * questionario le compie **il cliente**, che un utente della piattaforma non è.
 * Attribuirgliene una a un collaboratore sarebbe peggio che lasciare il campo vuoto.
 */
export async function registraAudit(
  db: Database,
  dati: {
    tenantId: string;
    utenteId?: string | null | undefined;
    azione: string;
    entita: string;
    entitaId?: string | undefined;
    dettagli?: unknown;
  },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    tenantId: dati.tenantId,
    utenteId: dati.utenteId ?? null,
    azione: dati.azione,
    entita: dati.entita,
    entitaId: dati.entitaId ?? null,
    dettagli: dati.dettagli ?? null,
  });
}

export async function registraCosto(
  db: Database,
  dati: {
    tenantId: string;
    aziendaId?: string | undefined;
    provider: string;
    servizio: string;
    costoCentesimi: number;
    servitoDaCache: boolean;
  },
): Promise<void> {
  await db.insert(schema.registroCostiDati).values({
    tenantId: dati.tenantId,
    aziendaId: dati.aziendaId ?? null,
    provider: dati.provider,
    servizio: dati.servizio,
    costoCentesimi: dati.costoCentesimi,
    servitoDaCache: dati.servitoDaCache,
  });
}

export interface RiepilogoCosti {
  readonly totaleCentesimi: number;
  readonly risparmioCentesimi: number;
  readonly chiamate: number;
  readonly perServizio: readonly { servizio: string; chiamate: number; costoCentesimi: number }[];
}

/**
 * Normalizza un importo che arriva dal driver.
 *
 * Le colonne di denaro sono `bigint`: PostgreSQL può restituirle come **stringa**, perché
 * un intero a 64 bit non entra sempre in un numero JavaScript. Sommare stringhe dà
 * `NaN`, e un `NaN` nel registro costi non si nota subito — si nota quando qualcuno
 * chiede quanto ha speso e legge «NaN €».
 *
 * La conversione è sicura: gli importi assicurativi restano dieci ordini di grandezza
 * sotto il limite di precisione dei numeri JavaScript.
 */
function centesimi(valore: number | string | null): number {
  if (valore === null) return 0;
  const numero = typeof valore === 'number' ? valore : Number(valore);
  return Number.isFinite(numero) ? numero : 0;
}

export async function riepilogoCosti(db: Database, tenantId: string): Promise<RiepilogoCosti> {
  const righe = await db
    .select()
    .from(schema.registroCostiDati)
    .where(eq(schema.registroCostiDati.tenantId, tenantId));

  const perServizio = new Map<string, { chiamate: number; costoCentesimi: number }>();
  let totale = 0;
  let risparmio = 0;

  for (const r of righe) {
    const costo = centesimi(r.costoCentesimi);

    if (r.servitoDaCache) {
      risparmio += costo;
    } else {
      totale += costo;
    }
    const chiave = `${r.provider}/${r.servizio}`;
    const corrente = perServizio.get(chiave) ?? { chiamate: 0, costoCentesimi: 0 };
    perServizio.set(chiave, {
      chiamate: corrente.chiamate + 1,
      costoCentesimi: corrente.costoCentesimi + (r.servitoDaCache ? 0 : costo),
    });
  }

  return {
    totaleCentesimi: totale,
    risparmioCentesimi: risparmio,
    chiamate: righe.length,
    perServizio: [...perServizio.entries()].map(([servizio, dati]) => ({ servizio, ...dati })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Partecipazioni e collegamenti societari
// ─────────────────────────────────────────────────────────────────────────────

export interface PartecipazioneDaSalvare {
  readonly socioDenominazione: string;
  readonly socioCodiceFiscale: string | null;
  readonly socioTipo: 'persona-fisica' | 'persona-giuridica';
  readonly quotaPercentuale: number | null;
  readonly diControllo: boolean;
}

/**
 * Sostituisce la compagine nota di un'azienda.
 *
 * Si cancella e si riscrive invece di accumulare: le quote cambiano, e una tabella che
 * conserva tutte le versioni risponderebbe «questa azienda ha nove soci» a chi ne ha tre.
 * Lo storico di chi possedeva cosa resta nell'analisi congelata, che è il posto giusto.
 */
export async function salvaPartecipazioni(
  db: Database,
  tenantId: string,
  aziendaId: string,
  soci: readonly PartecipazioneDaSalvare[],
): Promise<void> {
  await db.delete(schema.partecipazioni).where(eq(schema.partecipazioni.aziendaId, aziendaId));
  if (soci.length === 0) return;

  await db.insert(schema.partecipazioni).values(
    soci.map((s) => ({
      tenantId,
      aziendaId,
      socioDenominazione: s.socioDenominazione,
      socioCodiceFiscale: s.socioCodiceFiscale,
      socioTipo: s.socioTipo,
      // `numeric` si scrive come stringa: passarlo come numero perde precisione sul driver.
      quotaPercentuale: s.quotaPercentuale === null ? null : String(s.quotaPercentuale),
      diControllo: s.diControllo,
    })),
  );
}

export interface CollegamentoSocietario {
  readonly socioDenominazione: string;
  readonly socioCodiceFiscale: string;
  /** Le aziende del portafoglio che quel socio possiede, oltre a quella di partenza. */
  readonly aziende: readonly {
    readonly identificativo: string;
    readonly denominazione: string;
    readonly quotaPercentuale: number | null;
    readonly diControllo: boolean;
  }[];
}

/**
 * Le altre aziende del portafoglio che condividono un socio con quella indicata.
 *
 * Vale solo dentro il proprio portafoglio — non è un'anagrafe nazionale delle
 * partecipazioni — ma è esattamente ciò che serve a un intermediario: sapere che tre
 * clienti sono la stessa mano prima di proporre a ciascuno un massimale calcolato da solo.
 *
 * Il confronto è sul **codice fiscale**: «MARIO ROSSI» e «Rossi Mario» sono la stessa
 * persona per un lettore umano e due persone diverse per un database.
 */
export async function collegamentiSocietari(
  db: Database,
  tenantId: string,
  aziendaId: string,
): Promise<readonly CollegamentoSocietario[]> {
  interface Riga {
    socio_denominazione: string;
    socio_codice_fiscale: string;
    identificativo: string | null;
    denominazione: string;
    quota_percentuale: string | number | null;
    di_controllo: boolean;
  }

  const risultato: unknown = await db.execute(sql`
    SELECT
      mia.socio_denominazione,
      mia.socio_codice_fiscale,
      a.partita_iva AS identificativo,
      a.denominazione,
      altra.quota_percentuale,
      altra.di_controllo
    FROM partecipazioni mia
    JOIN partecipazioni altra
      ON altra.socio_codice_fiscale = mia.socio_codice_fiscale
     AND altra.tenant_id = mia.tenant_id
     AND altra.azienda_id <> mia.azienda_id
    JOIN aziende a ON a.id = altra.azienda_id
    WHERE mia.tenant_id = ${tenantId}
      AND mia.azienda_id = ${aziendaId}
      AND mia.socio_codice_fiscale IS NOT NULL
    ORDER BY mia.socio_denominazione, a.denominazione
  `);

  const righe = righeDi<Riga>(risultato);

  const perSocio = new Map<string, CollegamentoSocietario>();
  for (const r of righe) {
    const esistente = perSocio.get(r.socio_codice_fiscale);
    const azienda = {
      identificativo: r.identificativo ?? r.denominazione,
      denominazione: r.denominazione,
      quotaPercentuale: r.quota_percentuale === null ? null : Number(r.quota_percentuale),
      diControllo: r.di_controllo,
    };

    if (esistente === undefined) {
      perSocio.set(r.socio_codice_fiscale, {
        socioDenominazione: r.socio_denominazione,
        socioCodiceFiscale: r.socio_codice_fiscale,
        aziende: [azienda],
      });
    } else {
      perSocio.set(r.socio_codice_fiscale, {
        ...esistente,
        aziende: [...esistente.aziende, azienda],
      });
    }
  }

  return [...perSocio.values()];
}

/**
 * Quanto ha speso oggi questo intermediario.
 *
 * Serve al tetto di spesa, che è l'unica difesa contro l'errore più caro possibile su un
 * servizio prepagato: un'importazione massiva lanciata due volte, un filtro sbagliato, una
 * dimenticanza. Il credito non si esaurisce con un avviso, si esaurisce e basta — e il
 * lunedì mattina l'intermediario scopre che nessuna analisi funziona più.
 *
 * Le chiamate servite dalla cache non contano: non sono state pagate.
 */
export async function spesaOdierna(db: Database, tenantId: string, adesso = new Date()): Promise<number> {
  const inizioGiornata = inizioDellaGiornata(adesso);

  const righe = await db
    .select({ totale: sql<string>`COALESCE(SUM(${schema.registroCostiDati.costoCentesimi}), 0)` })
    .from(schema.registroCostiDati)
    .where(
      and(
        eq(schema.registroCostiDati.tenantId, tenantId),
        eq(schema.registroCostiDati.servitoDaCache, false),
        gte(schema.registroCostiDati.avvenutoIl, inizioGiornata),
      ),
    );

  return centesimi(righe[0]?.totale ?? 0);
}

/**
 * Quanto hanno speso oggi **tutti** gli studi insieme.
 *
 * Il tetto per studio non basta quando il contratto con gli archivi è uno solo e il
 * credito è condiviso: dieci studi ciascuno sotto il proprio tetto lo esauriscono lo
 * stesso, e si fermano tutti nello stesso istante — compresi i nove che non hanno
 * sbagliato nulla. Questo è il numero su cui si difende la fornitura.
 *
 * Volutamente senza `tenantId`: è l'unica lettura del registro costi che attraversa gli
 * studi, ed è riservata a chi gestisce la piattaforma.
 */
export async function spesaOdiernaComplessiva(db: Database, adesso = new Date()): Promise<number> {
  const inizioGiornata = inizioDellaGiornata(adesso);

  const righe = await db
    .select({ totale: sql<string>`COALESCE(SUM(${schema.registroCostiDati.costoCentesimi}), 0)` })
    .from(schema.registroCostiDati)
    .where(
      and(
        eq(schema.registroCostiDati.servitoDaCache, false),
        gte(schema.registroCostiDati.avvenutoIl, inizioGiornata),
      ),
    );

  return centesimi(righe[0]?.totale ?? 0);
}

/**
 * Quanto è stato speso in tutto, da sempre, su tutti gli studi.
 *
 * Sottratto al credito caricato dà il residuo. Il fornitore non è la fonte di questo
 * numero: lo è il nostro registro, che segna ogni centesimo al momento della risposta e
 * non conta ciò che è stato servito dalla cache.
 */
export async function spesaComplessiva(db: Database): Promise<number> {
  const righe = await db
    .select({ totale: sql<string>`COALESCE(SUM(${schema.registroCostiDati.costoCentesimi}), 0)` })
    .from(schema.registroCostiDati)
    .where(eq(schema.registroCostiDati.servitoDaCache, false));

  return centesimi(righe[0]?.totale ?? 0);
}
