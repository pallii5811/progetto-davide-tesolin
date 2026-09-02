/**
 * Calibrazione della curva score → PD sugli esiti osservati — quando gli esiti bastano.
 *
 *   DATABASE_URL=… npx tsx scripts/calibra-curva-pd.ts
 *   DATABASE_URL=… npx tsx scripts/calibra-curva-pd.ts --orizzonte-mesi 12 --minimo-per-classe 30
 *
 * **Non scrive niente.** Legge l'archivio, costruisce l'insieme degli esiti, e stampa la
 * frequenza di default osservata per classe con il suo intervallo di confidenza. Non tocca
 * la curva in `credit/score.ts`: la curva si cambia a mano, leggendo questo rapporto, con
 * un commit che dica su quanti esiti poggia.
 *
 * ── PERCHÉ ESISTE ─────────────────────────────────────────────────────────────
 *
 * La curva di otto punti è dichiarata per quello che è: esperienza di settore, non default
 * osservati. Calibrarla vuol dire una cosa precisa — prendere ogni impresa analizzata a
 * una data T con score S, guardare cosa le è successo nei dodici mesi dopo, e confrontare
 * la frequenza di default per classe con la PD che la curva prometteva. Senza esiti non
 * c'è calibrazione, c'è invenzione: e una curva inventata è esattamente il «dato
 * inaccurato» che questo prodotto non deve produrre.
 *
 * Quindi questo script fa la sola cosa onesta possibile oggi: definisce l'esito, conta
 * quanti esiti osservabili esistono, e **si rifiuta di produrre una curva finché non
 * bastano** — dicendo quanti mancano e da quando cominceranno a esserci.
 *
 * ── COS'È UN ESITO ────────────────────────────────────────────────────────────
 *
 *   previsione   una riga di `analisi` con `score_credito` non nullo, alla data `as_of`
 *   orizzonte    dodici mesi da `as_of` (parametro)
 *   default      entro l'orizzonte l'impresa risulta con procedura concorsuale aperta o
 *                non più attiva, in una `analisi` successiva (`stato_sorvegliato`) oppure
 *                in un evento di monitoraggio `procedura-aperta`
 *   osservabile  l'orizzonte è già trascorso E esiste almeno un'osservazione successiva
 *                dell'impresa entro l'orizzonte — altrimenti «non è fallita» non è un
 *                dato, è assenza di sguardo
 *   censurata    orizzonte non ancora trascorso, o nessuna osservazione dopo la previsione
 *
 * I protesti (`evento-negativo`) NON contano come default: sono un segnale, e la curva
 * stima la probabilità di insolvenza, non di un protesto. Vengono contati a parte.
 *
 * Una stessa impresa analizzata dieci volte in un mese non vale dieci esiti: si tiene una
 * previsione per impresa per trimestre — la prima — altrimenti la classe di chi viene
 * riguardato spesso peserebbe più delle altre.
 */

import { sql } from 'drizzle-orm';
import { classifica, probabilitaDefault } from '@aegis/core';
import { connetti } from '@aegis/db';

const argomento = (nome: string, predefinito: number): number => {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? v : predefinito;
};

const ORIZZONTE_MESI = argomento('orizzonte-mesi', 12);
/**
 * Sotto questa numerosità per classe l'intervallo di confidenza è più largo della PD
 * stessa: un rapporto con tre esiti su una classe direbbe «fra lo 0% e il 70%», che non è
 * una calibrazione. Trenta è il minimo perché il verso — la curva sovrastima o
 * sottostima? — sia leggibile; per spostare un punto della curva ne servono di più.
 */
const MINIMO_PER_CLASSE = argomento('minimo-per-classe', 30);

const url = process.env['DATABASE_URL']?.trim();
if (url === undefined || url === '') {
  process.stderr.write('\n  DATABASE_URL non impostata: questo script legge l’archivio di produzione.\n\n');
  process.exit(1);
}

interface Previsione {
  readonly aziendaId: string;
  readonly asOf: Date;
  readonly score: number;
  readonly classe: string;
}

interface Osservazione {
  readonly aziendaId: string;
  readonly quando: Date;
  readonly default_: boolean;
}

const connessione = await connetti({ url });
try {
  /*
    Si legge per la piattaforma: le analisi sono di tutti gli studi, e la calibrazione è
    una proprietà del modello, non di uno studio. È una lettura, e lo dichiara.
  */
  const previsioni = await connessione.db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET LOCAL app.ambito = 'piattaforma'"));
    const righe = await tx.execute(sql`
      SELECT azienda_id, as_of, score_credito, classe_credito
      FROM analisi
      WHERE score_credito IS NOT NULL
      ORDER BY azienda_id, as_of
    `);
    return righeDi<{ azienda_id: string; as_of: string; score_credito: number; classe_credito: string }>(
      righe,
    );
  });

  const osservazioni = await connessione.db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET LOCAL app.ambito = 'piattaforma'"));
    const daAnalisi = righeDi<{
      azienda_id: string;
      quando: string;
      procedura: string | null;
      attiva: string | null;
    }>(
      await tx.execute(sql`
        SELECT azienda_id, as_of AS quando,
               stato_sorvegliato ->> 'proceduraConcorsualeAperta' AS procedura,
               stato_sorvegliato ->> 'attiva' AS attiva
        FROM analisi
        WHERE stato_sorvegliato IS NOT NULL
      `),
    );
    const daEventi = righeDi<{ azienda_id: string; quando: string }>(
      await tx.execute(sql`
        SELECT azienda_id, rilevato_il AS quando FROM eventi_monitoraggio WHERE tipo = 'procedura-aperta'
      `),
    );
    const tutte: Osservazione[] = daAnalisi.map((r) => ({
      aziendaId: r.azienda_id,
      quando: new Date(r.quando),
      default_: r.procedura === 'true' || r.attiva === 'false',
    }));
    for (const e of daEventi)
      tutte.push({ aziendaId: e.azienda_id, quando: new Date(e.quando), default_: true });
    return tutte;
  });

  // Una previsione per impresa per trimestre: la prima.
  const scelte: Previsione[] = [];
  const viste = new Set<string>();
  for (const r of previsioni) {
    const asOf = new Date(r.as_of);
    const trimestre = `${r.azienda_id}·${asOf.getUTCFullYear()}-T${Math.floor(asOf.getUTCMonth() / 3) + 1}`;
    if (viste.has(trimestre)) continue;
    viste.add(trimestre);
    scelte.push({ aziendaId: r.azienda_id, asOf, score: r.score_credito, classe: r.classe_credito });
  }

  const adesso = new Date();
  const piuMesi = (d: Date, mesi: number): Date => {
    const x = new Date(d);
    x.setUTCMonth(x.getUTCMonth() + mesi);
    return x;
  };

  interface Esito {
    readonly previsione: Previsione;
    readonly stato: 'default' | 'sopravvissuta' | 'censurata';
  }

  const esiti: Esito[] = scelte.map((p) => {
    const fine = piuMesi(p.asOf, ORIZZONTE_MESI);
    const dopo = osservazioni.filter(
      (o) => o.aziendaId === p.aziendaId && o.quando > p.asOf && o.quando <= fine,
    );
    if (dopo.some((o) => o.default_)) return { previsione: p, stato: 'default' };
    if (fine > adesso || dopo.length === 0) return { previsione: p, stato: 'censurata' };
    return { previsione: p, stato: 'sopravvissuta' };
  });

  const osservabili = esiti.filter((e) => e.stato !== 'censurata');
  const censurate = esiti.filter((e) => e.stato === 'censurata');
  const primaOsservabile = [...censurate]
    .map((e) => piuMesi(e.previsione.asOf, ORIZZONTE_MESI))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  process.stdout.write(`\n  Calibrazione score → PD · orizzonte ${ORIZZONTE_MESI} mesi\n`);
  process.stdout.write(`  ${'─'.repeat(70)}\n`);
  process.stdout.write(`  previsioni (una per impresa per trimestre)   ${scelte.length}\n`);
  process.stdout.write(
    `  imprese distinte                            ${new Set(scelte.map((p) => p.aziendaId)).size}\n`,
  );
  process.stdout.write(`  esiti osservabili                           ${osservabili.length}\n`);
  process.stdout.write(
    `  di cui default                              ${osservabili.filter((e) => e.stato === 'default').length}\n`,
  );
  process.stdout.write(`  censurate (orizzonte non trascorso o mai riviste)  ${censurate.length}\n`);
  if (primaOsservabile !== undefined) {
    process.stdout.write(
      `  la prima censurata diventa osservabile il   ${primaOsservabile.toISOString().slice(0, 10)}\n`,
    );
  }

  // Per classe: osservato contro promesso.
  const classi = ['A', 'B', 'C', 'D', 'E'] as const;
  process.stdout.write(
    `\n  classe   n    default   osservato   promesso dalla curva (al centro della classe)\n`,
  );
  let calibrabile = true;
  for (const c of classi) {
    const inClasse = osservabili.filter((e) => e.previsione.classe === c);
    const n = inClasse.length;
    const k = inClasse.filter((e) => e.stato === 'default').length;
    const centro = { A: 90, B: 72, C: 57, D: 42, E: 18 }[c];
    const promessa = probabilitaDefault(centro);
    const [basso, alto] = wilson(k, n);
    const osservato =
      n === 0
        ? '—'
        : `${((100 * k) / n).toFixed(1)}% [${(100 * basso).toFixed(1)}–${(100 * alto).toFixed(1)}]`;
    process.stdout.write(
      `  ${c}      ${String(n).padStart(4)}  ${String(k).padStart(7)}   ${osservato.padEnd(24)} ${(100 * promessa).toFixed(2)}%\n`,
    );
    if (n < MINIMO_PER_CLASSE) calibrabile = false;
  }

  process.stdout.write('\n');
  if (!calibrabile) {
    process.stdout.write(
      `  NON CALIBRABILE: servono almeno ${MINIMO_PER_CLASSE} esiti osservabili per classe.\n` +
        '  La curva resta quella dichiarata — esperienza di settore — e la scheda continua a dirlo.\n' +
        '  Nessun numero è stato prodotto né proposto: una curva su questi esiti sarebbe inventata.\n\n',
    );
    process.exit(1);
  }
  process.stdout.write(
    '  Esiti sufficienti. Il confronto osservato/promesso qui sopra è la base per correggere i\n' +
      '  punti della curva in credit/score.ts, a mano, con un commit che citi questi numeri.\n\n',
  );
} finally {
  await connessione.chiudi();
}

/** Intervallo di Wilson al 95 %: regge anche con pochi eventi, dove quello normale mente. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const denominatore = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / denominatore;
  const ampiezza = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominatore;
  return [Math.max(0, centro - ampiezza), Math.min(1, centro + ampiezza)];
}

/** `postgres-js` restituisce l'array delle righe; PGlite un oggetto con `rows`. */
function righeDi<T>(esito: unknown): T[] {
  if (Array.isArray(esito)) return esito as T[];
  const conRows = esito as { rows?: T[] };
  return conRows.rows ?? [];
}

// Il tipo `classifica` è importato per un solo motivo: se un giorno le classi cambiassero,
// il compilatore deve far cadere questo script insieme alla curva.
void classifica;
