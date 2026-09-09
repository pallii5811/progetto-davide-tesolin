import { and, desc, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * L'archivio dell'adeguata verifica: cosa è stato cercato, cosa è tornato, cosa si è deciso.
 *
 * Tre operazioni e nessuna in più. Non c'è un aggiornamento dell'esito, e non è una
 * dimenticanza: un esito è la fotografia di quel giorno su quelle liste, e riscriverlo
 * cancellerebbe la sola cosa che un'ispezione può controllare. Una verifica nuova è una
 * riga nuova, e le vecchie restano a raccontare la storia del rapporto.
 *
 * L'unica cosa che cambia dopo è la **decisione**, perché la ricerca la fa la macchina e la
 * valutazione la fa una persona, quasi mai nello stesso minuto.
 */

export interface NuovaVerifica {
  readonly tenantId: string;
  readonly aziendaId: string | null;
  readonly nome: string;
  readonly ruolo: string;
  readonly annoNascita: number | null;
  readonly stato: string;
  readonly conclusione: string;
  readonly candidati: unknown;
  readonly costoCentesimi: number;
  readonly verificataIl: Date | null;
}

export interface VerificaRegistrata extends NuovaVerifica {
  readonly id: string;
  readonly decisioni: Readonly<Record<string, string>>;
  readonly nota: string | null;
  readonly decisaDa: string | null;
  readonly decisaIl: Date | null;
  readonly creataIl: Date;
}

export async function salvaVerifica(db: Database, dati: NuovaVerifica): Promise<string> {
  const creati = await db
    .insert(schema.verificheAntiriciclaggio)
    .values({
      tenantId: dati.tenantId,
      aziendaId: dati.aziendaId,
      nome: dati.nome,
      ruolo: dati.ruolo,
      annoNascita: dati.annoNascita,
      stato: dati.stato,
      conclusione: dati.conclusione,
      candidati: dati.candidati,
      costoCentesimi: dati.costoCentesimi,
      verificataIl: dati.verificataIl,
    })
    .returning({ id: schema.verificheAntiriciclaggio.id });

  const id = creati[0]?.id;
  if (id === undefined) throw new Error('Verifica non salvata');
  return id;
}

/**
 * Le verifiche di un'impresa, dalla più recente.
 *
 * Si restituiscono **tutte**, non solo l'ultima per persona: l'obbligo è di controllo nel
 * continuo, e la domanda «da quanto non la guardiamo?» si risponde solo vedendo la serie.
 */
export async function verifichePerAzienda(
  db: Database,
  tenantId: string,
  aziendaId: string,
): Promise<readonly VerificaRegistrata[]> {
  const righe = await db
    .select()
    .from(schema.verificheAntiriciclaggio)
    .where(
      and(
        eq(schema.verificheAntiriciclaggio.tenantId, tenantId),
        eq(schema.verificheAntiriciclaggio.aziendaId, aziendaId),
      ),
    )
    .orderBy(desc(schema.verificheAntiriciclaggio.creataIl));

  return righe.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    aziendaId: r.aziendaId,
    nome: r.nome,
    ruolo: r.ruolo,
    annoNascita: r.annoNascita,
    stato: r.stato,
    conclusione: r.conclusione,
    candidati: r.candidati,
    decisioni: (r.decisioni ?? {}) as Readonly<Record<string, string>>,
    nota: r.nota,
    costoCentesimi: r.costoCentesimi,
    verificataIl: r.verificataIl,
    decisaDa: r.decisaDa,
    decisaIl: r.decisaIl,
    creataIl: r.creataIl,
  }));
}

/**
 * La decisione dell'intermediario su ogni candidato.
 *
 * È l'unico aggiornamento previsto su questa tabella, e riguarda solo `decisioni`, `nota`
 * e chi ha deciso. L'esito no: quello è la fotografia del giorno, e va lasciato dov'è.
 *
 * Chi decide viene registrato per nome, perché in ispezione la domanda non è «cosa dice il
 * sistema» ma «chi l'ha valutato».
 */
export async function registraDecisione(
  db: Database,
  dati: {
    readonly id: string;
    readonly tenantId: string;
    readonly decisioni: Readonly<Record<string, string>>;
    readonly nota: string | null;
    readonly utenteId: string;
    readonly quando: Date;
  },
): Promise<boolean> {
  const aggiornate = await db
    .update(schema.verificheAntiriciclaggio)
    .set({
      decisioni: dati.decisioni,
      nota: dati.nota,
      decisaDa: dati.utenteId,
      decisaIl: dati.quando,
    })
    .where(
      and(
        eq(schema.verificheAntiriciclaggio.id, dati.id),
        eq(schema.verificheAntiriciclaggio.tenantId, dati.tenantId),
      ),
    )
    .returning({ id: schema.verificheAntiriciclaggio.id });

  return aggiornate.length > 0;
}
