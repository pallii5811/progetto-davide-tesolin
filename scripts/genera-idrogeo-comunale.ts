/**
 * Scarica da IdroGEO (ISPRA) gli indicatori comunali di pericolosità idraulica e da frana.
 *
 *   npx tsx scripts/genera-idrogeo-comunale.ts
 *   npx tsx scripts/genera-idrogeo-comunale.ts --parallele 8
 *
 * ── PERCHÉ UNO SCARICO E NON UNA CHIAMATA A RICHIESTA ────────────────────────
 *
 * La mappa puntuale ISPRA — il servizio WFS che risponde «questo punto sta dentro un
 * poligono P3?» — è la fonte più precisa che esista, ed è inutilizzabile in una pagina
 * web: misurata l'08/09/2026 su punti veri, da 1,3 a 45 secondi per interrogazione, con
 * casi oltre i 90. I poligoni sono enormi (quello che copre Ravenna ha 18.102 vertici).
 * Resta spenta, e `scripts/prova-ispra-vera.ts` dice quando cambierà.
 *
 * IdroGEO risponde alla stessa domanda a maglia **comunale**, e a maglia comunale la
 * risposta si può tenere in casa: 7.899 comuni, un file, nessuna chiamata mentre
 * l'intermediario guarda la scheda. È la stessa scelta già fatta per la classificazione
 * sismica, ed è la stessa maglia — il che rende le due righe della scheda confrontabili
 * invece che una fine e una grossolana.
 *
 * ── COSA SI TIENE, E PERCHÉ PROPRIO QUESTO ───────────────────────────────────
 *
 * Il dettaglio di un comune porta 134 indicatori. Sei bastano, e sono scelti per una
 * ragione precisa: due dicono quanto **territorio** è a rischio, quattro quante **imprese**
 * ci stanno dentro. Per un assicuratore contano le seconde. Le imprese non si distribuiscono
 * a caso sul territorio: stanno nei fondovalle e nelle pianure, cioè dove l'acqua arriva. Un
 * comune con il 2 % del territorio in pericolosità elevata può avere il 30 % delle imprese
 * dentro quel 2 %, e dire «due per cento» sarebbe vero e fuorviante.
 *
 * ── IL LIMITE, CHE VA DETTO E NON AGGIRATO ───────────────────────────────────
 *
 * È un dato **comunale**: dice quanto del comune è esposto, non se quel capannone lo è.
 * Non sostituisce la verifica sull'indirizzo, e la scheda lo dichiara accanto al numero.
 * Chiamarlo «pericolosità della sede» sarebbe la stessa bugia della sismica provinciale
 * spacciata per comunale.
 *
 * ── LICENZA ──────────────────────────────────────────────────────────────────
 *
 * CC BY 4.0: riuso libero, anche commerciale, con citazione della fonte. È la differenza
 * fra questa e le altre due fonti territoriali del prodotto — Overpass è ODbL e Open-Meteo
 * è gratuito solo per uso non commerciale — ed è la ragione per cui questa può restare
 * accesa su un prodotto venduto.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://idrogeo.isprambiente.it/api';
const FONTE = 'ISPRA — Piattaforma IdroGEO, indicatori di rischio per frane e alluvioni (CC BY 4.0)';

const qui = dirname(fileURLToPath(import.meta.url));
const radice = join(qui, '..');
const CARTELLA = join(radice, 'packages/core/src/risk/data');
const PARZIALE = join(CARTELLA, 'idrogeo-parziale.json');
const USCITA = join(CARTELLA, 'idrogeo-comunale.ts');

const argomento = (nome: string, predefinito: number): number => {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? v : predefinito;
};

/*
  Otto richieste insieme, non ottanta.

  Il servizio è pubblico, gratuito e di un ente che non ci guadagna nulla: la cortesia non è
  un vezzo, è la condizione perché resti aperto. Otto porta le tre ore e mezza di uno
  scarico sequenziale a poco più di mezz'ora, che per un'operazione da fare tre volte
  l'anno basta e avanza.
*/
const PARALLELE = argomento('parallele', 8);

interface ComuneIndice {
  readonly uid: number;
  readonly nome: string;
  readonly pro_com: number;
  readonly breadcrumb?: readonly { readonly name: string; readonly t: string }[];
}

/** I sei numeri che si tengono, per comune. Tutti percentuali, tutti da IdroGEO. */
interface IndicatoriComune {
  /** Territorio in pericolosità idraulica elevata (P3) e media (P2). */
  readonly idrA: number;
  readonly idrM: number;
  /** Imprese in pericolosità idraulica elevata e media: il numero che conta qui. */
  readonly impIdrA: number;
  readonly impIdrM: number;
  /** Territorio e imprese in pericolosità da frana elevata e molto elevata (P3+P4). */
  readonly frnA: number;
  readonly impFrnA: number;
}

async function chiedi(percorso: string): Promise<unknown> {
  const risposta = await fetch(`${BASE}${percorso}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/json',
      // Chi sta chiamando e perché: un ente pubblico ha diritto di saperlo.
      'User-Agent': 'AEGIS/1.0 (piattaforma assicurativa; scarico indicatori comunali)',
    },
  });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} su ${percorso}`);
  return risposta.json();
}

function numero(valore: unknown): number {
  return typeof valore === 'number' && Number.isFinite(valore) ? valore : 0;
}

function siglaProvincia(c: ComuneIndice): string {
  // Nel breadcrumb la provincia è la voce con tipo «p», e il suo nome è già la sigla.
  return (c.breadcrumb ?? []).find((b) => b.t === 'p')?.name ?? '';
}

async function main(): Promise<void> {
  mkdirSync(CARTELLA, { recursive: true });

  process.stdout.write('\n  Indice dei comuni…\n');
  const indice = (await chiedi('/pir/comuni/')) as ComuneIndice[];
  process.stdout.write(`  ${indice.length} comuni.\n`);

  /*
    Lo scarico riprende da dove si era fermato.

    Mezz'ora di rete è abbastanza perché qualcosa vada storto: una disconnessione, un
    riavvio, un servizio che si prende una pausa. Ricominciare da capo ogni volta
    trasformerebbe un fastidio in un impedimento, e chi deve aggiornare il dato fra tre
    mesi rinuncerebbe.
  */
  const raccolti: Record<string, IndicatoriComune> = existsSync(PARZIALE)
    ? (JSON.parse(readFileSync(PARZIALE, 'utf8')) as Record<string, IndicatoriComune>)
    : {};
  const gia = Object.keys(raccolti).length;
  if (gia > 0) process.stdout.write(`  Ripresa: ${gia} comuni già scaricati.\n`);

  const daFare = indice.filter((c) => raccolti[String(c.uid)] === undefined);
  let fatti = 0;
  let falliti = 0;

  const lavoratore = async (): Promise<void> => {
    for (;;) {
      const c = daFare.pop();
      if (c === undefined) return;
      try {
        const d = (await chiedi(`/pir/comuni/${c.uid}`)) as Record<string, unknown>;
        raccolti[String(c.uid)] = {
          idrA: numero(d['aridp3_p']),
          idrM: numero(d['aridp2_p']),
          impIdrA: numero(d['imidp3_p']),
          impIdrM: numero(d['imidp2_p']),
          frnA: numero(d['ar_frp3p4p']),
          impFrnA: numero(d['imfrp3p4p']),
        };
      } catch {
        // Un comune che non risponde non ferma gli altri: si riprova al giro successivo.
        falliti += 1;
      }
      fatti += 1;
      if (fatti % 200 === 0) {
        writeFileSync(PARZIALE, JSON.stringify(raccolti));
        process.stdout.write(`  ${gia + fatti} / ${indice.length}…\n`);
      }
    }
  };

  await Promise.all(Array.from({ length: PARALLELE }, lavoratore));
  writeFileSync(PARZIALE, JSON.stringify(raccolti));

  const completi = Object.keys(raccolti).length;
  process.stdout.write(`\n  Scaricati ${completi} comuni su ${indice.length}`);
  process.stdout.write(
    falliti > 0 ? ` (${falliti} non hanno risposto: rilanciare per riprenderli)\n` : '\n',
  );

  if (completi < indice.length) {
    process.stdout.write('  Scarico incompleto: il file non viene scritto. Rilanciare.\n\n');
    process.exit(1);
  }

  /*
    La chiave è «SIGLA|nome normalizzato», identica a quella della sismica comunale.

    Due archivi che rispondono alla stessa domanda — «di che comune si tratta?» — con due
    chiavi diverse divergono al primo comune con l'apostrofo, e a divergere sarebbe proprio
    il caso raro che nessuno prova.
  */
  const normalizza = (nome: string): string =>
    nome
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/['’`´]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const livelli: Record<string, IndicatoriComune> = {};
  for (const c of indice) {
    const dati = raccolti[String(c.uid)];
    if (dati === undefined) continue;
    const sigla = siglaProvincia(c).toUpperCase();
    if (sigla === '') continue;
    livelli[`${sigla}|${normalizza(c.nome)}`] = dati;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const contenuto =
    `/**\n` +
    ` * Generato da scripts/genera-idrogeo-comunale.ts — non editare a mano.\n` +
    ` * Fonte: ${FONTE}\n` +
    ` * Generato il: ${oggi} · ${Object.keys(livelli).length} comuni\n` +
    ` *\n` +
    ` * Percentuali per comune: territorio e imprese in pericolosità idraulica elevata (P3)\n` +
    ` * e media (P2), territorio e imprese in pericolosità da frana elevata e molto elevata\n` +
    ` * (P3+P4). È un dato COMUNALE: dice quanto del comune è esposto, non se una singola\n` +
    ` * sede lo è.\n` +
    ` */\n\n` +
    /*
      Il tipo si dichiara, non si fa inferire.

      Con `as const` su settemilanovecento comuni il compilatore si ferma: «the inferred
      type of this node exceeds the maximum length the compiler will serialize». Non e' un
      limite da aggirare con un'asserzione: e' il segno che il tipo va scritto.
    */
    `export const idrogeoComunale: {\n` +
    `  readonly fonte: string;\n` +
    `  readonly generatoIl: string;\n` +
    `  readonly comuni: number;\n` +
    `  readonly livelli: Readonly<Record<string, IndicatoriComune>>;\n` +
    `} = ${JSON.stringify({ fonte: FONTE, generatoIl: oggi, comuni: Object.keys(livelli).length, livelli })};\n`;

  writeFileSync(USCITA, contenuto);
  process.stdout.write(`  Scritto ${USCITA}\n`);
  process.stdout.write(`  ${Object.keys(livelli).length} comuni con chiave provincia|nome.\n\n`);
}

await main();
