/**
 * Coda degli eventi di monitoraggio.
 *
 * Un evento non è una notifica da far scorrere: è una voce di lavoro che resta finché
 * qualcuno non la gestisce. Per questo la tabella conserva chi l'ha gestita e quando —
 * davanti a una contestazione, «l'avevamo segnalato» vale solo se è dimostrabile.
 */

import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

export type TipoEventoDb = (typeof schema.tipoEventoMonitoraggio.enumValues)[number];

export interface NuovoEvento {
  readonly aziendaId: string;
  readonly tenantId: string;
  readonly tipo: TipoEventoDb;
  readonly titolo: string;
  readonly descrizione: string;
  readonly rilevanza: number;
  readonly azioneSuggerita: string | null;
  readonly valorePrecedente: unknown;
  readonly valoreNuovo: unknown;
}

export interface EventoInCoda {
  readonly id: string;
  readonly aziendaId: string;
  readonly identificativoAzienda: string;
  readonly denominazioneAzienda: string;
  readonly tipo: TipoEventoDb;
  readonly titolo: string;
  readonly descrizione: string;
  readonly rilevanza: number;
  readonly azioneSuggerita: string | null;
  readonly valorePrecedente: unknown;
  readonly valoreNuovo: unknown;
  readonly rilevatoIl: Date;
  readonly gestitoIl: Date | null;
}

/** Silenzio concesso a un evento dopo che è stato gestito, in giorni. */
const GIORNI_DI_SILENZIO = 30;

/**
 * Inserisce gli eventi non ancora presenti, e restituisce quanti ne ha aggiunti.
 *
 * Il rilevatore dice i fatti a ogni esecuzione, compresi quelli che persistono: è qui che
 * si decide cosa l'intermediario ha già davanti. La deduplica guarda azienda, tipo e
 * titolo, e considera «già noto» un evento che è ancora aperto **oppure** che è stato
 * gestito da meno di trenta giorni.
 *
 * La finestra di silenzio serve a un caso concreto: l'obbligo CAT NAT resta non adempiuto
 * finché il cliente non firma. Segnarlo gestito significa «ho presentato la quotazione,
 * aspetto risposta» — riproporlo il giorno dopo sarebbe rumore, non riproporlo mai più
 * sarebbe perdere di vista un obbligo di legge ancora aperto.
 */
export async function accodaEventi(db: Database, eventi: readonly NuovoEvento[]): Promise<number> {
  if (eventi.length === 0) return 0;

  const soglia = new Date(Date.now() - GIORNI_DI_SILENZIO * 86_400_000);

  const noti = await db
    .select({
      aziendaId: schema.eventiMonitoraggio.aziendaId,
      tipo: schema.eventiMonitoraggio.tipo,
      titolo: schema.eventiMonitoraggio.titolo,
    })
    .from(schema.eventiMonitoraggio)
    .where(
      or(isNull(schema.eventiMonitoraggio.gestitoIl), gt(schema.eventiMonitoraggio.gestitoIl, soglia)),
    );

  const giaInCoda = new Set(noti.map((e) => `${e.aziendaId}|${e.tipo}|${e.titolo}`));
  const daInserire = eventi.filter((e) => !giaInCoda.has(`${e.aziendaId}|${e.tipo}|${e.titolo}`));

  if (daInserire.length === 0) return 0;

  await db.insert(schema.eventiMonitoraggio).values(
    daInserire.map((e) => ({
      aziendaId: e.aziendaId,
      tenantId: e.tenantId,
      tipo: e.tipo,
      titolo: e.titolo,
      descrizione: e.descrizione,
      rilevanza: e.rilevanza,
      azioneSuggerita: e.azioneSuggerita,
      valorePrecedente: e.valorePrecedente ?? null,
      valoreNuovo: e.valoreNuovo ?? null,
    })),
  );

  return daInserire.length;
}

/** La coda di lavoro dell'intermediario: prima ciò che costa di più non fare. */
export async function elencoEventi(
  db: Database,
  tenantId: string,
  opzioni: { soloDaGestire?: boolean; limite?: number } = {},
): Promise<readonly EventoInCoda[]> {
  const condizioni = [eq(schema.eventiMonitoraggio.tenantId, tenantId)];
  if (opzioni.soloDaGestire === true) condizioni.push(isNull(schema.eventiMonitoraggio.gestitoIl));

  const righe = await db
    .select({
      id: schema.eventiMonitoraggio.id,
      aziendaId: schema.eventiMonitoraggio.aziendaId,
      partitaIva: schema.aziende.partitaIva,
      denominazione: schema.aziende.denominazione,
      tipo: schema.eventiMonitoraggio.tipo,
      titolo: schema.eventiMonitoraggio.titolo,
      descrizione: schema.eventiMonitoraggio.descrizione,
      rilevanza: schema.eventiMonitoraggio.rilevanza,
      azioneSuggerita: schema.eventiMonitoraggio.azioneSuggerita,
      valorePrecedente: schema.eventiMonitoraggio.valorePrecedente,
      valoreNuovo: schema.eventiMonitoraggio.valoreNuovo,
      rilevatoIl: schema.eventiMonitoraggio.rilevatoIl,
      gestitoIl: schema.eventiMonitoraggio.gestitoIl,
    })
    .from(schema.eventiMonitoraggio)
    .innerJoin(schema.aziende, eq(schema.aziende.id, schema.eventiMonitoraggio.aziendaId))
    .where(and(...condizioni))
    .orderBy(desc(schema.eventiMonitoraggio.rilevanza), desc(schema.eventiMonitoraggio.rilevatoIl))
    .limit(opzioni.limite ?? 200);

  return righe.map((r) => ({
    id: r.id,
    aziendaId: r.aziendaId,
    identificativoAzienda: r.partitaIva ?? r.denominazione,
    denominazioneAzienda: r.denominazione,
    tipo: r.tipo,
    titolo: r.titolo,
    descrizione: r.descrizione,
    rilevanza: r.rilevanza,
    azioneSuggerita: r.azioneSuggerita,
    valorePrecedente: r.valorePrecedente,
    valoreNuovo: r.valoreNuovo,
    rilevatoIl: r.rilevatoIl,
    gestitoIl: r.gestitoIl,
  }));
}

/** Marca un evento come gestito. Il vincolo sul tenant è nella `where`. */
export async function segnaGestito(
  db: Database,
  tenantId: string,
  eventoId: string,
  utenteId: string | null,
): Promise<boolean> {
  const righe = await db
    .update(schema.eventiMonitoraggio)
    .set({ gestitoIl: new Date(), gestitoDa: utenteId })
    .where(
      and(eq(schema.eventiMonitoraggio.id, eventoId), eq(schema.eventiMonitoraggio.tenantId, tenantId)),
    )
    .returning({ id: schema.eventiMonitoraggio.id });

  return righe.length > 0;
}

export async function contaEventiDaGestire(db: Database, tenantId: string): Promise<number> {
  const righe = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.eventiMonitoraggio)
    .where(
      and(eq(schema.eventiMonitoraggio.tenantId, tenantId), isNull(schema.eventiMonitoraggio.gestitoIl)),
    );
  return righe[0]?.n ?? 0;
}

/**
 * Le due fotografie più recenti di ogni azienda del portafoglio.
 *
 * Il monitoraggio confronta l'ultima con la penultima. Le analisi senza fotografia —
 * eseguite prima che il monitoraggio esistesse — vengono semplicemente ignorate.
 */
export async function statiDaConfrontare(
  db: Database,
  tenantId: string,
): Promise<readonly { aziendaId: string; corrente: unknown; precedente: unknown }[]> {
  interface Riga {
    azienda_id: string;
    corrente: unknown;
    precedente: unknown;
  }

  // Auto-join sulla numerazione, non un raggruppamento: `jsonb` non ha operatore di
  // ordinamento, quindi nessuna funzione di aggregazione può sceglierne una fra due.
  const risultato: unknown = await db.execute(sql`
    WITH ordinate AS (
      SELECT
        n.azienda_id,
        n.stato_sorvegliato,
        row_number() OVER (PARTITION BY n.azienda_id ORDER BY n.creata_il DESC) AS posizione
      FROM analisi n
      WHERE n.tenant_id = ${tenantId} AND n.stato_sorvegliato IS NOT NULL
    )
    SELECT
      ultima.azienda_id,
      ultima.stato_sorvegliato AS corrente,
      penultima.stato_sorvegliato AS precedente
    FROM ordinate ultima
    LEFT JOIN ordinate penultima
      ON penultima.azienda_id = ultima.azienda_id AND penultima.posizione = 2
    WHERE ultima.posizione = 1
  `);

  const righe: Riga[] = Array.isArray(risultato)
    ? (risultato as Riga[])
    : ((risultato as { rows?: Riga[] }).rows ?? []);

  return righe.map((r) => ({
    aziendaId: r.azienda_id,
    corrente: r.corrente,
    precedente: r.precedente ?? null,
  }));
}
