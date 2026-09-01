/**
 * La scheda di un'impresa vera, ricostruita dalle risposte già pagate.
 *
 *   npx tsx scripts/verifica-scheda-reale.ts [partita-iva]
 *   npx tsx scripts/verifica-scheda-reale.ts <partita-iva> --da-database
 *
 * **Non spende niente.** Il provider è quello di produzione, con il suo `fetchProfile` e i
 * suoi mapper, ma la cache che gli si passa risponde dalle risposte già comprate — i file
 * di `.sonda/` in locale, la tabella `cache_risposte` con `--da-database` — e il client
 * HTTP non parte mai. Se una risposta manca, lo script si ferma e lo dice: non chiama, non
 * ripaga, non finge.
 *
 * Con `--da-database`, lanciato sul server, dice cosa mostra **oggi** la scheda di
 * un'impresa che l'intermediario ha già in archivio, senza doverla riaprire dal browser e
 * senza toccare il credito.
 *
 * PERCHÉ ESISTE. Il difetto più caro trovato su questo prodotto non si vedeva in nessun
 * numero preso da solo: il patrimonio netto era plausibile, il fido era plausibile, la
 * classe di merito era plausibile. Si vedeva mettendo la pagina intera davanti agli occhi
 * — e la pagina intera, prima, si poteva guardare solo comprandola.
 *
 * Le prove unitarie coprono la regola; questo copre l'esito, sull'impresa vera, con la
 * catena intera montata. Sono due cose diverse e servono entrambe.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeCompany } from '@aegis/core';
import { Money } from '@aegis/core';
import { OpenApiProvider } from '../packages/providers/src/openapi/provider.js';
import { OPENAPI_DEFAULT_CONFIG } from '../packages/providers/src/openapi/config.js';
import type { Cache, CacheEntry } from '../packages/providers/src/http.js';

const DA_DATABASE = process.argv.includes('--da-database');
const PIVA = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '01528120981';
const SONDA = join(process.cwd(), '.sonda');

/**
 * La cache che risponde dai file, e che non lascia partire nessuna chiamata.
 *
 * La chiave del client è `GET <url>`: da lì si ricava il servizio, che è l'ultimo segmento
 * prima della partita IVA. Una chiave senza file corrispondente restituisce `undefined`, e
 * a quel punto il client proverebbe a chiamare: per questo il token è finto, così una
 * chiamata non autorizzata fallisce forte invece di spendere.
 */
class CacheDaSonda implements Cache {
  readonly serviti: string[] = [];
  readonly mancanti: string[] = [];

  get(key: string): CacheEntry | undefined {
    const servizio = /\/([A-Za-z0-9-]+)\/\d+/.exec(key)?.[1] ?? null;
    if (servizio === null) return undefined;

    const file = join(SONDA, `prod-${servizio}-${PIVA}.json`);
    if (!existsSync(file)) {
      this.mancanti.push(servizio);
      return undefined;
    }

    this.serviti.push(servizio);
    return {
      value: JSON.parse(readFileSync(file, 'utf8')) as unknown,
      // Lontano nel tempo: qui la scadenza non è la cosa in prova.
      expiresAt: Date.now() + 3_600_000,
    };
  }

  set(): void {
    /* Le risposte arrivano dai file: non c'è niente da scrivere. */
  }

  delete(): void {
    /* Idem. */
  }
}

/*
  Il profilo approfondito monta due risposte: l'anagrafica estesa e il profilo completo.
  Con una sola registrata il client proverebbe a chiamare l'altra — e con il token finto
  finirebbe in un 401 che non spiega niente. Meglio dirlo prima, e dire quale manca.
*/
if (!DA_DATABASE) {
  for (const servizio of ['IT-advanced', 'IT-full']) {
    const file = join(SONDA, `prod-${servizio}-${PIVA}.json`);
    if (!existsSync(file)) {
      process.stdout.write(`\n  Manca ${file}\n`);
      process.stdout.write('  Serve la risposta registrata: questo script non chiama e non spende.\n\n');
      process.exit(1);
    }
  }
}

const cacheSonda = new CacheDaSonda();
const cache: Cache = DA_DATABASE
  ? await (async () => {
      const { creaPersistenza } = await import('../apps/api/src/persistenza.js');
      const { CachePersistente } = await import('../apps/api/src/cache-persistente.js');
      const persistenza = await creaPersistenza({ url: process.env['DATABASE_URL'] });
      return new CachePersistente(persistenza.db);
    })()
  : cacheSonda;
const provider = new OpenApiProvider({
  // Volutamente non valido: se la cache non copre una richiesta, la chiamata deve fallire
  // invece di partire davvero. Un token vero qui farebbe spendere per una verifica.
  token: 'nessun-token-verifica-offline',
  ambiente: 'produzione',
  config: OPENAPI_DEFAULT_CONFIG,
  cache,
  ledger: { record: () => {} },
});

const profilo = await provider.fetchProfile(PIVA, 'profondito');
const analisi = analyzeCompany(profilo, [], new Date());

const euro = (m: ReturnType<typeof Money.euro> | null | undefined): string =>
  m === null || m === undefined ? '—' : Money.format(m);
const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

const riga = (etichetta: string, valore: string): void => {
  process.stdout.write(`  ${etichetta.padEnd(38)} ${valore}\n`);
};

process.stdout.write(`\n  ${profilo.identity.denominazione} · P.IVA ${PIVA}\n`);
process.stdout.write(
  DA_DATABASE
    ? '  risposte lette da cache_risposte (già comprate, nessuna spesa)\n'
    : `  risposte lette da .sonda: ${cacheSonda.serviti.join(', ') || 'nessuna'}\n`,
);
if (!DA_DATABASE && cacheSonda.mancanti.length > 0) {
  process.stdout.write(`  ⚠ non registrate: ${[...new Set(cacheSonda.mancanti)].join(', ')}\n`);
}

process.stdout.write('\n  ── Patrimonio ───────────────────────────────────────\n');
riga('Patrimonio netto (fatti)', euro(analisi.facts.patrimonioNetto));
const pnArchivio = profilo.indicatoriFornitore.aggregati?.patrimonioNetto ?? null;
riga(
  'Patrimonio netto dichiarato dall’archivio',
  pnArchivio === null ? '—' : `${pnArchivio.toLocaleString('it-IT')} €`,
);
riga('Grado di capitalizzazione (archivio)', pct(analisi.indicatori?.equityRatio ?? null));

process.stdout.write('\n  ── Credito ──────────────────────────────────────────\n');
riga(
  'Punteggio di merito',
  analisi.creditScore.value.value === null
    ? 'ND'
    : `${analisi.creditScore.value.value}/100 · classe ${analisi.creditScore.value.classe}`,
);
riga('Limite patrimoniale', euro(analisi.creditLimit.value.limitePatrimoniale));
riga(
  'Fido consigliato',
  `${euro(analisi.creditLimit.value.importo)} · vincolo ${analisi.creditLimit.value.vincoloAttivo}`,
);

process.stdout.write('\n  ── Esportazione ─────────────────────────────────────\n');
riga('Mercati dichiarati dall’archivio', analisi.facts.paesiExportArchivio ?? '—');
riga(
  'Esportatore',
  analisi.facts.esportatore === null ? 'non rilevato' : analisi.facts.esportatore ? 'sì' : 'no',
);
riga(
  'Voce «Export» del dimensionamento RC Prodotti',
  analisi.sommeAssicurande.massimaleRcProdotti.explanation.inputs.find((i) => i.label === 'Export')
    ?.value ?? '—',
);

process.stdout.write('\n  ── Danno massimo ────────────────────────────────────\n');
riga(
  'Protezioni accertate',
  analisi.dannoMassimo.value === null
    ? '—'
    : analisi.dannoMassimo.value.protezioniAccertate.length === 0
      ? 'nessuna'
      : analisi.dannoMassimo.value.protezioniAccertate.join(', '),
);

process.stdout.write('\n');
