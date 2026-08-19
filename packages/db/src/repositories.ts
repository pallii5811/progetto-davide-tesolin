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

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tenant e aziende
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recupera o crea l'intermediario predefinito.
 * Passaggio provvisorio finché non c'è autenticazione: il multi-tenant è già nello schema
 * e negli indici, manca solo chi popola l'identità dell'utente.
 */
export async function assicuraTenantPredefinito(db: Database, denominazione: string): Promise<string> {
  const esistenti = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
  const esistente = esistenti[0];
  if (esistente !== undefined) return esistente.id;

  const creati = await db
    .insert(schema.tenants)
    .values({ denominazione })
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
    await db
      .update(schema.aziende)
      .set({
        denominazione: dati.denominazione,
        providerId: dati.providerId,
        provincia: dati.provincia,
        atecoPrimario: dati.atecoPrimario,
        aggiornataIl: new Date(),
      })
      .where(eq(schema.aziende.id, esistente.id));
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

export async function salvaDatiDichiarati(
  db: Database,
  tenantId: string,
  aziendaId: string,
  dati: Record<string, unknown>,
  completezza: number | null,
): Promise<void> {
  await db
    .insert(schema.dossier)
    .values({
      aziendaId,
      tenantId,
      datiDichiarati: dati,
      completezza: completezza === null ? null : completezza.toFixed(4),
      aggiornatoIl: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.dossier.aziendaId,
      set: {
        datiDichiarati: dati,
        completezza: completezza === null ? null : completezza.toFixed(4),
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
// Analisi congelate
// ─────────────────────────────────────────────────────────────────────────────

export interface DatiAnalisi {
  readonly aziendaId: string;
  readonly tenantId: string;
  readonly snapshotId: string;
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
    esposizione_non_assicurata_centesimi: number | null;
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

  const righe: RigaGrezza[] = Array.isArray(risultato)
    ? (risultato as RigaGrezza[])
    : ((risultato as { rows?: RigaGrezza[] }).rows ?? []);

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
    esposizioneNonAssicurataCentesimi: r.esposizione_non_assicurata_centesimi,
    azionePrioritaria: r.azione_prioritaria,
    // `numeric` torna come stringa dal driver: convertito qui, dove si sa cos'è.
    completezza: r.completezza === null ? null : Number(r.completezza),
    analizzataIl: new Date(r.creata_il),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit e costi
// ─────────────────────────────────────────────────────────────────────────────

/** Append-only. Il permesso di UPDATE e DELETE va revocato a livello di database. */
export async function registraAudit(
  db: Database,
  dati: {
    tenantId: string;
    azione: string;
    entita: string;
    entitaId?: string | undefined;
    dettagli?: unknown;
  },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    tenantId: dati.tenantId,
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

  const righe: Riga[] = Array.isArray(risultato)
    ? (risultato as Riga[])
    : ((risultato as { rows?: Riga[] }).rows ?? []);

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
  const inizioGiornata = new Date(adesso);
  inizioGiornata.setHours(0, 0, 0, 0);

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
