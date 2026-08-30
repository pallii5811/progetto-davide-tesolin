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

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile, demoPolizze } from '@aegis/core';
import type { CompanyProfile } from '@aegis/core';

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
      // Le risposte registrate hanno forme diverse fra loro; qui interessa solo poterle
      // dare in pasto al motore. Quelle che non si lasciano mappare si saltano dichiarando.
      const primo: unknown = Array.isArray(dati) ? dati[0] : dati;
      if (primo === null || typeof primo !== 'object') continue;
      fuori.push({ nome: file, profilo: primo as unknown as CompanyProfile });
    } catch {
      // Un file illeggibile non ferma l'istantanea: viene dichiarato nel riepilogo.
      fuori.push({ nome: file + ' ‹illeggibile›', profilo: null });
    }
  }
  return fuori;
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
