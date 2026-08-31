/**
 * Un'istantanea completa di tutto ciò che il motore calcola.
 *
 *   npx tsx scripts/istantanea-motore.ts prima.json
 *   …si correggono i difetti…
 *   npx tsx scripts/istantanea-motore.ts dopo.json
 *   npx tsx scripts/confronta-istantanee.ts prima.json dopo.json
 *
 * ESISTE PER UNA RAGIONE SOLA: distinguere una correzione da una regressione.
 *
 * Il progetto ha 834 test verdi e una CI verde, e in due giorni ha lasciato passare tre
 * regressioni bloccanti — il socio unico mostrato come «10000,00%», un tipo dichiarato non
 * nullabile che copriva uno schianto, un capitale che andava a capo e cacciava sotto la
 * piega la lista di lavoro. Nessuna delle tre era coperta da un test, perché un test
 * copre ciò che qualcuno ha pensato di scrivere, e una regressione per definizione arriva
 * da dove nessuno guardava.
 *
 * Un'istantanea non ha quel limite: non sa cosa cercare, e proprio per questo vede tutto.
 * Ogni valore che cambia fra prima e dopo deve avere un nome — il difetto che l'ha
 * cambiato. Un valore che cambia e che nessuno rivendica È una regressione, e si vede
 * senza doverla immaginare in anticipo.
 *
 * Tre scenari, scelti perché coprono i percorsi che il prodotto percorre davvero:
 *
 *  1. l'azienda dimostrativa CON il bilancio in schema CEE — è ciò che vede il cliente
 *     nella demo, ed è l'unico percorso che i test esercitano;
 *  2. la stessa SENZA lo schema CEE — è l'unico percorso che gira in produzione, perché
 *     il bilancio dettagliato non viene mai comprato. Quattro fattori di credito su sette,
 *     l'Altman e i ventun indici vivono solo nel primo scenario e non nel secondo;
 *  3. le imprese vere registrate in .sonda/, se ci sono: forme giuridiche, settori e buchi
 *     di dato che nessuna fixture riproduce.
 *
 * La serializzazione è GENERICA di proposito. Elencare i campi a mano significherebbe
 * dimenticarne qualcuno oggi e non accorgersene mai più; camminando l'oggetto intero,
 * anche un campo aggiunto domani entra nell'istantanea senza che nessuno se ne ricordi.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATI_DICHIARATI_VUOTI,
  DEMO_AS_OF,
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  sourced,
} from '@aegis/core';
import type { CompanyProfile } from '@aegis/core';
import { mappaAnagrafica, mappaAssetti, mappaBilanciSintetici } from '@aegis/providers';
// Percorso diretto: `indicatori.js` non è fra i moduli riesportati dall'indice del
// pacchetto, pur essendo usato dal provider. Non si allarga la superficie pubblica di una
// libreria per comodità di uno script di diagnosi.
import { mappaIndicatoriFornitore } from '../packages/providers/src/openapi/indicatori.js';

/**
 * L'istantanea gira sul COMPILATO, e il compilato può essere vecchio.
 *
 * La riga di import qui sopra dice `@aegis/core`, cioè `packages/core/dist`. Chi confronta
 * un «prima» e un «dopo» mettendo da parte i sorgenti fra le due esecuzioni non cambia
 * nulla se in mezzo non ricompila: entrambe le istantanee escono dallo stesso `dist`, e il
 * confronto risponde «NESSUNA DIFFERENZA» perché ha guardato due volte lo stesso codice.
 *
 * È successo davvero, con questo script, su una correzione che cambiava sette frasi. Il
 * verdetto verde non era una prova di non-regressione: era l'assenza di una misura, e le
 * due cose si scrivono uguali sullo schermo.
 *
 * Quindi qui si rifiuta di partire quando un sorgente è più recente del compilato. Non è
 * un avviso: un avviso in cima a un output lungo non lo legge nessuno, e questo strumento
 * esiste per essere creduto.
 */
function esigiCompilatoFresco(): void {
  const radice = process.cwd();
  const sorgenti = join(radice, 'packages', 'core', 'src');
  const compilato = join(radice, 'packages', 'core', 'dist');

  if (!existsSync(compilato)) {
    process.stderr.write('\n  packages/core/dist non esiste: eseguire `npm run build` prima.\n\n');
    process.exit(2);
  }

  const piuRecente = (cartella: string): number => {
    let massimo = 0;
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      massimo = Math.max(massimo, voce.isDirectory() ? piuRecente(percorso) : statSync(percorso).mtimeMs);
    }
    return massimo;
  };

  if (piuRecente(sorgenti) > piuRecente(compilato)) {
    process.stderr.write(
      '\n  I sorgenti sono più recenti del compilato: questa istantanea uscirebbe dal codice\n' +
        '  VECCHIO e il confronto direbbe «nessuna differenza» senza averne guardata una.\n' +
        '  Eseguire `npm run build` e ripetere.\n\n',
    );
    process.exit(2);
  }
}

esigiCompilatoFresco();

/** Data fissa: un'istantanea che dipende dall'orologio non si può confrontare con niente. */
const QUANDO = DEMO_AS_OF;

/**
 * Riduce qualunque valore a una forma stabile e confrontabile.
 *
 * Le chiavi si ordinano perché l'ordine di inserzione di un oggetto non è un fatto del
 * dominio: due esecuzioni che producono gli stessi valori in ordine diverso non hanno
 * nessuna differenza da segnalare, e segnalarla comunque farebbe annegare quelle vere.
 *
 * `undefined` e `null` restano DISTINTI. È la regola 2d del progetto vista dal lato del
 * confronto: se una correzione trasforma un buco dichiarato in uno zero, o viceversa,
 * quella è esattamente la cosa che si vuole vedere.
 */
function stabile(valore: unknown, profondita = 0): unknown {
  if (profondita > 40) return '[troppo profondo]';
  if (valore === undefined) return '‹undefined›';
  if (valore === null) return null;
  if (valore instanceof Date)
    return Number.isNaN(valore.getTime()) ? '‹data non valida›' : valore.toISOString();
  if (typeof valore === 'bigint') return valore.toString();
  if (typeof valore === 'function') return '‹funzione›';
  if (typeof valore === 'number') {
    // NaN e ±Infinity si serializzano come null in JSON, cioè si confondono con l'assenza:
    // e un NaN comparso dopo una correzione è precisamente ciò che si sta cercando.
    if (Number.isNaN(valore)) return '‹NaN›';
    if (!Number.isFinite(valore)) return valore > 0 ? '‹+Infinity›' : '‹-Infinity›';
    return valore;
  }
  if (Array.isArray(valore)) return valore.map((v) => stabile(v, profondita + 1));
  if (typeof valore === 'object') {
    const fonte = valore as Record<string, unknown>;
    const uscita: Record<string, unknown> = {};
    for (const chiave of Object.keys(fonte).sort()) uscita[chiave] = stabile(fonte[chiave], profondita + 1);
    return uscita;
  }
  return valore;
}

/** Il profilo dimostrativo senza schema CEE: il percorso che gira in produzione. */
function senzaBilancioDettagliato(): CompanyProfile {
  return { ...demoCompanyProfile(), bilanci: [] };
}

/**
 * I profili ricavati dalle risposte reali registrate.
 *
 * Assenti sulle macchine che non hanno .sonda/ — le risposte contengono dati d'impresa
 * comprati e non stanno in git. In quel caso l'istantanea copre i due scenari
 * dimostrativi, e lo DICHIARA: un confronto fatto su meno scenari di un altro non è
 * confrontabile, e tacerlo produrrebbe un verde che non vale niente.
 */
function scenariReali(): { nome: string; profilo: CompanyProfile | null }[] {
  const cartella = join(process.cwd(), '.sonda');
  if (!existsSync(cartella)) return [];

  // `| null` e non un profilo finto: un file illeggibile è un'assenza, e il tipo deve
  // dirlo. Dichiararlo `CompanyProfile` e infilarci dentro un null è precisamente il
  // difetto che in questo progetto ha nascosto un TypeError al typecheck.
  const fuori: { nome: string; profilo: CompanyProfile | null }[] = [];
  for (const file of readdirSync(cartella).sort()) {
    if (!file.endsWith('.json')) continue;
    try {
      const contenuto: unknown = JSON.parse(readFileSync(join(cartella, file), 'utf8'));
      const dati = (contenuto as { data?: unknown }).data;
      if (dati === undefined) continue;
      const primo: unknown = Array.isArray(dati) ? dati[0] : dati;
      if (primo === null || typeof primo !== 'object') continue;
      fuori.push({ nome: file, profilo: profiloDaRisposta(primo, file) });
    } catch {
      // Un file illeggibile non ferma l'istantanea: viene dichiarato nel riepilogo.
      fuori.push({ nome: file + ' ‹illeggibile›', profilo: null });
    }
  }
  return fuori;
}

/**
 * Da risposta grezza a profilo di dominio, con i mappatori veri.
 *
 * QUI C'ERA UN CAST, e costava otto scenari su dieci. La riga diceva
 * `primo as unknown as CompanyProfile`: prendeva il JSON del fornitore e lo dichiarava un
 * profilo. TypeScript non può contraddire un doppio cast, quindi il typecheck restava
 * verde; il motore invece andava a cercare `anagrafica.value.formaGiuridica` su un oggetto
 * che ha `legalForm`, e sollevava un'eccezione. Tutte e otto le imprese reali finivano nel
 * ramo «eccezione» dell'istantanea.
 *
 * L'effetto pratico è che il rilevatore di regressioni si reggeva su DUE scenari, entrambi
 * dimostrativi, mentre il riepilogo annunciava «10 scenari (2 dimostrativi + 8 reali)». Un
 * numero vero accanto a una copertura che non c'era.
 *
 * Ora il profilo si compone con gli stessi mappatori che usa `fetchProfile`. Due limiti
 * dichiarati, perché un limite taciuto vale come un difetto:
 *
 *   1. È una RICOSTRUZIONE del livello `esteso`, non la chiamata di produzione: niente
 *      bilanci in schema CEE, niente eventi negativi, niente unità locali — esattamente
 *      come quando quei servizi non sono stati comprati.
 *   2. Se un domani `fetchProfile` cambia il modo di comporre il profilo, questa funzione
 *      non se ne accorge. Resta comunque il motore esercitato su dati veri, che è ciò per
 *      cui l'istantanea esiste.
 */
function profiloDaRisposta(grezzo: unknown, file: string): CompanyProfile {
  // `mappaAnagrafica` non restituisce mai `null`: su una risposta che non riconosce
  // compila i campi che trova e lascia assenti gli altri. La guardia che stava qui non
  // poteva scattare, e una guardia che non può scattare è una riga che rassicura.
  const anagrafica = mappaAnagrafica(grezzo, 'IT-advanced', QUANDO);

  const campo = (nome: string): string | null => {
    const valore = (grezzo as Record<string, unknown>)[nome];
    // Identificatori: restano STRINGHE. `Number('01528120981')` aggancia un'altra impresa,
    // ed è la regola 2b del progetto — quella che costa di più a violare.
    return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null;
  };

  return {
    identity: {
      partitaIva: campo('vatCode') ?? campo('partitaIva'),
      codiceFiscale: campo('taxCode') ?? campo('codiceFiscale') ?? campo('fiscalCode'),
      denominazione: campo('companyName') ?? campo('denominazione') ?? file,
    },
    anagrafica,
    assetti: mappaAssetti(grezzo, 'IT-advanced', QUANDO),
    bilanci: [],
    /*
      `sourced()` e non un oggetto scritto a mano.

      Il primo tentativo componeva `{ value, source }` e basta. Mancavano `observedAt` e
      `confidence`, e il motore moriva con «Cannot read properties of undefined (reading
      'getTime')» sui due scenari IT-advanced — cioè proprio quelli che portano i bilanci,
      gli unici per cui valeva la pena aggiungerli.

      Il costruttore del dominio non permette di dimenticarsene: è la ragione per cui
      esiste, ed è più forte di ricordarsi i quattro campi.
    */
    bilanciSintetici: mappaBilanciSintetici(grezzo).map((b) =>
      sourced(
        b,
        { kind: 'provider', provider: 'openapi', service: 'IT-advanced' },
        QUANDO,
      ),
    ),
    eventiNegativi: null,
    unitaLocali: null,
    gruppo: null,
    indicatoriFornitore: mappaIndicatoriFornitore(grezzo),
    datiDichiarati: DATI_DICHIARATI_VUOTI,
  };
}

function analizzaOTrattieni(profilo: CompanyProfile): unknown {
  try {
    return stabile(analyzeCompany(profilo, demoPolizze(), QUANDO));
  } catch (errore) {
    /*
      Un'eccezione è un dato dell'istantanea, non un motivo per fermarla.

      Se una correzione fa esplodere il motore su un profilo che prima reggeva, quello è
      il difetto più grave possibile — e va confrontato, non fatto sparire.
    */
    return { '‹eccezione›': errore instanceof Error ? errore.message : String(errore) };
  }
}

const destinazione = process.argv[2];
if (destinazione === undefined) {
  process.stderr.write('Uso: npx tsx scripts/istantanea-motore.ts <file-di-uscita.json>\n');
  process.exit(1);
}

const reali = scenariReali();
const istantanea = {
  quando: QUANDO.toISOString(),
  scenari: {
    'dimostrativa-con-bilancio-cee': analizzaOTrattieni(demoCompanyProfile()),
    'dimostrativa-senza-bilancio-cee-percorso-di-produzione':
      analizzaOTrattieni(senzaBilancioDettagliato()),
    ...Object.fromEntries(
      reali.map((s) => [
        'reale:' + s.nome,
        s.profilo === null ? { '‹illeggibile›': true } : analizzaOTrattieni(s.profilo),
      ]),
    ),
  },
};

writeFileSync(destinazione, JSON.stringify(istantanea, null, 1), 'utf8');

const quanti = Object.keys(istantanea.scenari).length;
process.stdout.write(`  istantanea scritta in ${destinazione}\n`);
process.stdout.write(`  scenari: ${quanti} (2 dimostrativi + ${reali.length} reali)\n`);
if (reali.length === 0) {
  process.stdout.write('  ATTENZIONE: .sonda/ assente — nessuna impresa reale in questa istantanea.\n');
  process.stdout.write('  Un confronto fra istantanee con scenari diversi non prova niente.\n');
}
