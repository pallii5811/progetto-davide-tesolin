/**
 * Ogni parola che la scheda stampa, controllata a macchina.
 *
 *   npx tsx scripts/audit-testo-schermo.ts [partita-iva ...]
 *   npx tsx scripts/audit-testo-schermo.ts --da-database <partita-iva ...>
 *
 * **Non spende niente**: le risposte arrivano dalla cache già pagata, come in
 * `verifica-scheda-reale.ts`, e il token è volutamente non valido.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────
 *
 * Il proprietario del prodotto, dopo l'ennesimo ricaricamento: «OGNI VOLTA CHE RICARICO
 * LA PAGINA TROVIAMO ERRORI, COM'È POSSIBILE CHE NON RIESCI A RENDERE PERFETTO QUESTO
 * SOFTWARE?»
 *
 * La risposta è nel metodo, non nel software. Ogni difetto di testo corretto fin qui era
 * stato trovato da un paio d'occhi che leggevano la pagina — e gli occhi trovano
 * un'istanza per volta. Le due volte in cui invece si è misurato, il conto è stato un
 * altro:
 *
 *   frasi ripetute            trovate 3 leggendo → il controllo ne cerca su ogni copertura
 *                             e ogni combinazione di fatti
 *   affermazioni sull'ignoto  trovate 3 leggendo → misurate **32 su 68 regole**
 *
 * Le altre ventinove nessuno le aveva ancora incontrate: sarebbero uscite una alla volta,
 * a un ricaricamento di distanza l'una dall'altra. È esattamente ciò che stava succedendo.
 *
 * Questo strumento chiude il metodo: monta la scheda vera di un'impresa vera, percorre
 * **ogni stringa** che il presentatore consegna alla pagina, e applica i controlli
 * meccanici tutti insieme. Quello che trova è un elenco, non un aneddoto.
 *
 * ── COSA CONTROLLA ──────────────────────────────────────────────────────────────
 *
 *   1  separatore decimale inglese         «0.30×» in una pagina che scrive «1,37»
 *   2  accordo con il numero uno            «Sulle restanti 1 il contesto…»
 *   3  affermazioni ripetute                la stessa cosa detta due volte, riformulata
 *   4  «da rilevare» di ciò che si ha già   la voce chiesta mentre l'archivio l'ha data
 *   5  un indice pubblicato in due unità    «39,93» senza unità sotto un moltiplicatore
 *   6  numeri che devono tornare fra loro   conteggi, prodotti, somme, il 20 % del netto
 *
 * Prima di misurare fa fallire i propri rilevatori sui difetti storici: uno strumento cieco
 * scrive «nessun rilievo» esattamente come uno pulito, e la differenza va provata ogni volta.
 *
 * Esce con codice 1 se trova qualcosa: è pensato per essere lanciato prima di consegnare.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeCompany } from '@aegis/core';
import { presentAnalysis } from '../apps/api/src/presenter.js';
import { OpenApiProvider } from '../packages/providers/src/openapi/provider.js';
import { OPENAPI_DEFAULT_CONFIG } from '../packages/providers/src/openapi/config.js';
import type { Cache, CacheEntry } from '../packages/providers/src/http.js';

const DA_DATABASE = process.argv.includes('--da-database');
/** Stampa la frase per intero invece del suo inizio: serve a decidere se il rilievo è vero. */
const INTERO = process.argv.includes('--intero');
const PIVE = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SONDA = join(process.cwd(), '.sonda');

/**
 * Si rifiuta di partire sul compilato vecchio.
 *
 * Non è una precauzione teorica: è successo mezz'ora fa. Corretta la frase che generava le
 * ripetizioni, questo strumento ne segnalava ancora venti — perché `@aegis/core` risolve a
 * `dist`, e il sorgente cambiato non era ancora stato compilato. Ricompilando, i venti sono
 * diventati cinque.
 *
 * Un numero misurato sul codice sbagliato è peggio di nessun numero: convince, perché è
 * vero — di un altro programma. Meglio fermarsi.
 */
function esigiCompilatoFresco(): void {
  const sorgenti = join(process.cwd(), 'packages', 'core', 'src');
  const compilato = join(process.cwd(), 'packages', 'core', 'dist');

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
      '\n  I sorgenti sono più recenti del compilato: questa misura uscirebbe dal codice\n' +
        '  VECCHIO. Eseguire `npm run build` e ripetere.\n\n',
    );
    process.exit(2);
  }
}

esigiCompilatoFresco();

// ─────────────────────────────────────────────────────────────────────────────
// Il rilievo: ogni stringa che la pagina riceve, con il punto in cui sta
// ─────────────────────────────────────────────────────────────────────────────

interface Frase {
  readonly dove: string;
  readonly testo: string;
}

/**
 * Percorre il DTO e raccoglie le stringhe destinate a un lettore.
 *
 * Si scartano quelle che non sono prosa: identificatori, codici, chiavi di enumerazione.
 * Il criterio è che contengano almeno uno spazio **o** una cifra con separatore, perché
 * `'rc-prodotti'` e `'alta'` non sono frasi e sporcherebbero ogni controllo.
 */
function raccogliFrasi(valore: unknown, dove: string, out: Frase[]): void {
  if (typeof valore === 'string') {
    if (valore.trim().length > 0) out.push({ dove, testo: valore });
    return;
  }
  if (Array.isArray(valore)) {
    valore.forEach((v, i) => raccogliFrasi(v, `${dove}[${i}]`, out));
    return;
  }
  if (valore !== null && typeof valore === 'object') {
    for (const [k, v] of Object.entries(valore)) raccogliFrasi(v, `${dove}.${k}`, out);
  }
}

/**
 * Le chiavi che non contengono prosa ma identificatori: si escludono per nome.
 *
 * `versioneCatalogo` sta qui per un motivo preciso: vale `2026.1`, e il controllo sul
 * separatore decimale la segnalava. Una versione non è un numero da leggere, è un'etichetta
 * — e un rilievo falso costa più di uno mancato, perché insegna a ignorare l'elenco.
 */
const CHIAVI_TECNICHE =
  /\.(id|ruleId|chiave|categoria|livello|livelloInerente|livelloResiduo|trattamento|forma|stato|urgenza|titolare|classe|confidenza|confidence|tono|piano\.urgenza|coperture\[\d+\]|codice|ateco|atecoSecondari\[\d+\]|partitaIva|codiceFiscale|versione\w*)$/;

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Separatore decimale inglese
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un numero decimale scritto col punto, in un documento italiano.
 *
 * La difficoltà non è trovarlo, è non prendere per errore ciò che il punto ce l'ha per
 * ragioni sue. In italiano il punto separa le **migliaia** — `11.500.000` — e i gruppi
 * dopo il primo hanno sempre esattamente tre cifre. Un decimale inglese no: `0.30`, `2.60`,
 * `39.93`. La distinzione è meccanica e non richiede di indovinare.
 *
 * Restano fuori i codici che il punto lo usano come struttura — ATECO `25.72`, NACE, le
 * norme — riconosciuti dal contesto della frase.
 */
const CONTESTI_CON_PUNTO = /ATECO|NACE|SIC|D\.Lgs|D\.P\.R|art\.|artt\.|c\.c\.|CCII|ISO|http|@|v\d/;

function decimaliInglesi(testo: string): string[] {
  if (CONTESTI_CON_PUNTO.test(testo)) return [];
  const trovati: string[] = [];
  for (const m of testo.matchAll(/\d+(?:\.\d+)+/g)) {
    const gruppi = m[0].split('.');
    const migliaiaItaliane = gruppi.slice(1).every((g) => g.length === 3);
    if (!migliaiaItaliane) trovati.push(m[0]);
  }
  return trovati;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Accordo con il numero uno
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Sulle restanti 1 il contesto non è stato osservato.»
 *
 * Esce ogni volta che le ubicazioni sono due e una sola è stata guardata — cioè quasi
 * sempre, non in un caso limite. Il difetto nasce sempre allo stesso modo: un conteggio
 * interpolato dentro una frase scritta al plurale.
 *
 * Il vocabolario è quello dei nomi che questo prodotto conta davvero. Non si generalizza a
 * «ogni parola che finisce in -i»: prenderebbe «1 gennaio» e cento altre cose giuste.
 */
const NOMI_CONTATI =
  'ubicazioni|imprese|aziende|anni|esercizi|giorni|veicoli|soci|amministratori|bilanci|rischi|coperture|polizze|sedi|comuni|complessi|province|dipendenti|addetti|fabbricati|immobili|certificazioni|cariche|segnalazioni|fattori|indici|voci|schede|righe|campi';

/** L'inizio della frase, o la frase intera con `--intero`: serve a giudicare il rilievo. */
function estratto(testo: string): string {
  return INTERO ? testo : testo.slice(0, 110);
}

function accordiSbagliati(testo: string): string[] {
  const trovati: string[] = [];
  for (const m of testo.matchAll(new RegExp(`\\b1\\s+(${NOMI_CONTATI})\\b`, 'gi'))) {
    trovati.push(m[0]);
  }
  // La forma opposta: l'aggettivo plurale prima del numero.
  for (const m of testo.matchAll(/\b(restanti|rimanenti|altre|altri)\s+1\b/gi)) trovati.push(m[0]);
  return trovati;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Affermazioni ripetute
// ─────────────────────────────────────────────────────────────────────────────

/*
  Lo stesso riconoscitore della prova unitaria sulle motivazioni, portato qui sull'intera
  scheda: parole di contenuto troncate alla radice, sequenze di tre. Là guardava una
  copertura per volta; qui guarda ogni testo lungo che la pagina stampa, perché la
  ripetizione più fastidiosa è quella fra due sezioni diverse.
*/
const PAROLE_DI_SERVIZIO = new Set(
  (
    'il lo la i gli le un uno una l di a ad da in con su per tra fra del dello della dei degli delle ' +
    'dell al allo alla ai agli alle all dal dallo dalla dai dagli dalle dall nel nello nella nei negli ' +
    'nelle nell sul sullo sulla sui sugli sulle sull e o ed od ma che chi cui non ne si se come anche ' +
    'è sono ha hanno essere stato stata resta restano più meno quando dove ciò questo questa quello ' +
    'quella entrambi casi caso sua suo sue suoi loro ogni tutti tutte solo soltanto stessa stesso'
  ).split(' '),
);

function parole(testo: string): string[] {
  return testo
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-zàèéìòù0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 1 && !PAROLE_DI_SERVIZIO.has(p))
    .map((p) => p.slice(0, 6));
}

/**
 * Toglie l'enumerazione finale dei rischi serviti, che è una lista di NOMI.
 *
 * La motivazione di adeguatezza chiude elencando i rischi che quella copertura serve, con
 * il loro livello. Su una copertura cyber quell'elenco contiene «violazione di dati
 * personali» — che è anche il soggetto della frase iniziale, perché è di quello che la
 * copertura parla.
 *
 * Il rilevatore lo segnalava come ripetizione, ed è un falso positivo: la prima è
 * un'affermazione, la seconda è il nome di un rischio dentro una lista, e porta con sé un
 * dato nuovo — il livello residuo. Cercare affermazioni ripetute dentro un elenco di nomi
 * è cercare la cosa sbagliata nel posto sbagliato.
 *
 * Le tre segnalazioni che restavano dopo la correzione delle ripetizioni vere erano tutte
 * di questa forma. Ma la parte in prosa continua a essere guardata: si toglie l'elenco, non
 * la frase.
 */
function senzaElencoDeiRischi(testo: string): string {
  const inizio = testo.indexOf('L’analisi ha rilevato i seguenti rischi residui');
  const inizioApostrofoDritto = testo.indexOf("L'analisi ha rilevato i seguenti rischi residui");
  const taglio = inizio >= 0 ? inizio : inizioApostrofoDritto;
  return taglio >= 0 ? testo.slice(0, taglio) : testo;
}

function affermazioniRipetute(testo: string): string[] {
  const p = parole(senzaElencoDeiRischi(testo));
  const viste = new Map<string, number>();
  for (let i = 0; i + 2 < p.length; i += 1) {
    const tris = `${p[i]} ${p[i + 1]} ${p[i + 2]}`;
    viste.set(tris, (viste.get(tris) ?? 0) + 1);
  }
  return [...viste.entries()].filter(([, n]) => n > 1).map(([tris]) => tris);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · «Da rilevare» di ciò che la pagina stampa già
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La voce che chiede un dato che la stessa pagina mostra da un'altra parte.
 *
 * È il difetto che il proprietario del prodotto ha contestato più volte, e ha sempre la
 * stessa forma: «Export: da rilevare in intervista» stampato a due sezioni di distanza da
 * «Paesi di esportazione: Unione Europea, Altri Paesi». Il dato era comprato, era a
 * schermo, e il motore dichiarava di non averlo.
 *
 * Il controllo confronta l'etichetta della voce vuota con le etichette valorizzate del
 * resto della scheda, sulla radice delle parole: se una combacia, la richiesta è sospetta e
 * va guardata a mano. Non è una condanna — «ROI» dell'archivio ha un denominatore che
 * l'archivio non documenta, e restare fuori dal punteggio è corretto — ma è la lista di
 * ciò che merita una spiegazione scritta.
 */
/**
 * I sinonimi di mestiere, perché un controllo che confronta i nomi è cieco ai sinonimi.
 *
 * L'archivio chiama `variazioneMol` ciò che il punteggio chiama «Crescita EBITDA»: MOL ed
 * EBITDA sono la stessa grandezza in due lingue di mestiere, e fra le due etichette non c'è
 * **nessuna** parola in comune. Il rilievo non nasceva, e la scheda continuava a mandare
 * l'intermediario a chiedere all'impresa un dato che era stato comprato e stampato.
 *
 * Le radici sono già troncate a sei lettere quando arrivano qui.
 */
const SINONIMI: Readonly<Record<string, string>> = {
  mol: 'ebitda',
  variaz: 'cresci',
  onerif: 'oneri',
};

/** Le parole di contenuto di un'etichetta, come insieme di radici. */
function radici(etichetta: string): Set<string> {
  return new Set(
    parole(etichetta)
      .filter((p) => !['sul', 'sui', 'suo', 'della'].includes(p))
      .map((p) => SINONIMI[p] ?? p),
  );
}

/** `pfnSuEbitda` → «pfn su ebitda»: il nome del campo diventa confrontabile con un'etichetta. */
function daCamelCase(nome: string): string {
  return nome.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Ogni campo valorizzato degli indicatori dell'archivio, col suo nome in chiaro. */
function campiValorizzatiArchivio(indicatori: unknown, prefisso = ''): Map<string, unknown> {
  const trovati = new Map<string, unknown>();
  if (indicatori === null || typeof indicatori !== 'object') return trovati;
  for (const [chiave, valore] of Object.entries(indicatori)) {
    if (valore === null || valore === undefined) continue;
    if (typeof valore === 'object' && !Array.isArray(valore)) {
      for (const [k, v] of campiValorizzatiArchivio(valore, prefisso)) trovati.set(k, v);
    } else {
      trovati.set(daCamelCase(chiave), valore);
    }
  }
  return trovati;
}

/**
 * La voce che chiede un dato che l'archivio ha già dato — e che la pagina stampa.
 *
 * È il difetto contestato più volte, e ha sempre la stessa forma: «Export: da rilevare in
 * intervista» a due sezioni di distanza da «Paesi di esportazione: Unione Europea, Altri
 * Paesi»; «PFN / EBITDA: da rilevare in intervista» venti centimetri sotto «PFN su EBITDA
 * 9,53». Il dato era comprato, era a schermo, e il motore dichiarava di non averlo.
 *
 * Il confronto NON è fra etichette della stessa pagina — sarebbe un controllo che non può
 * accendersi, perché una voce vuota e una piena non portano quasi mai lo stesso nome. È fra
 * l'etichetta vuota e i **campi valorizzati degli indicatori del fornitore**, che sono la
 * roba pagata: due parole di contenuto in comune bastano per chiedere una spiegazione.
 *
 * Non ogni segnalazione è un difetto. Il ROI dell'archivio resta fuori dal punteggio perché
 * il suo denominatore non è documentato, e la crescita dell'EBITDA perché è calcolata su due
 * esercizi contro una soglia annua: sono decisioni scritte nel codice. Ma devono essere
 * **scritte**, ed è questo elenco a pretenderlo.
 */
function chiedeCiòCheHaGià(frasi: readonly Frase[], indicatoriFornitore: unknown): string[] {
  const perPercorso = new Map<string, Frase>();
  for (const f of frasi) perPercorso.set(f.dove, f);

  const archivio = campiValorizzatiArchivio(indicatoriFornitore);
  const sospette: string[] = [];

  for (const f of frasi) {
    if (!f.dove.endsWith('.label')) continue;
    const valore = perPercorso.get(f.dove.replace(/\.label$/, '.value'));
    if (valore === undefined) continue;
    if (!/da rilevare|non determinabil|non calcolabil|non disponibil/i.test(valore.testo)) continue;

    const chieste = radici(f.testo);
    if (chieste.size === 0) continue;

    for (const [nome, valoreArchivio] of archivio) {
      const offerte = radici(nome);
      let comuni = 0;
      for (const r of chieste) if (offerte.has(r)) comuni += 1;
      /*
        Due radici in comune: «pfn ebitda» contro «pfn su ebitda» combacia, «ciclo
        circolante» contro «ciclo finanziario» no — ed è giusto, sono grandezze diverse.

        Ma un'etichetta di una parola sola non può averne due, e con la sola soglia a due
        «ROI» non scattava mai: era chiesta in intervista mentre l'archivio la stampava
        dodici righe più su. Quando la parola è una, dev'essere quella.
      */
      if (comuni >= 2 || (chieste.size === 1 && comuni === 1)) {
        sospette.push(`«${f.testo}» chiesta, ma l’archivio dà «${nome}» = ${String(valoreArchivio)}`);
        break;
      }
    }
  }
  return [...new Set(sospette)];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Lo stesso indice pubblicato due volte, in due unità
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Due campi dell'archivio che sono la stessa grandezza, uno in rapporto e uno in punti.
 *
 * Non è un'ipotesi teorica. Sulla scheda si leggeva, in due riquadri diversi:
 *
 *   Oneri finanziari su EBITDA   0,4        (Marginalità)
 *   Indice di onerosità          39,93      (Liquidità e copertura degli oneri)
 *
 * `39,93 / 100 = 0,3993`, che stampato con un decimale fa esattamente `0,4`. È la stessa
 * cosa detta due volte, e la seconda **senza unità di misura**: chi legge non ha modo di
 * sapere che quel 39,93 è una percentuale, e la scheda che lo stampa accanto a «EBIT su
 * interessi lordi 1,36» invita a leggerlo come un moltiplicatore.
 *
 * Il rapporto costante di 100 fra due campi si misura, non si suppone: qui si cercano su
 * ogni impresa, e si segnalano solo le coppie che tengono **su tutte** quelle guardate. Una
 * coincidenza su una impresa è una coincidenza; su tre è una definizione.
 */
interface CoppiaSospetta {
  readonly a: string;
  readonly b: string;
  readonly imprese: number;
}

/**
 * Le coppie già esaminate, con la ragione per cui restano.
 *
 * L'archivio pubblica davvero la stessa grandezza due volte, e non smetterà: la coppia
 * continuerebbe a comparire fra i rilievi anche dopo essere stata sistemata. Un rilievo che
 * non si può chiudere è peggio di nessun rilievo, perché insegna a scorrere l'elenco.
 *
 * Non è un silenzio: le coppie qui dentro vengono comunque stampate, sotto «già esaminate»,
 * e per entrare devono portare scritto **cosa è stato fatto**. Una riga senza motivo qui è
 * una regressione, non una scorciatoia.
 */
const COPPIE_DICHIARATE: Readonly<Record<string, string>> = {
  'indice di onerosita|oneri finanziari su ebitda':
    'stessa grandezza in due unità; la scheda ora la nomina «Indice di onerosità — oneri ' +
    'finanziari su EBITDA» e la stampa con il segno di percentuale',
};

function coppieInDueUnita(archivi: readonly Map<string, unknown>[]): CoppiaSospetta[] {
  /** Quante volte la coppia è comparsa con entrambi i valori, e quante ha tenuto il 1:100. */
  const insieme = new Map<string, number>();
  const conRapporto = new Map<string, number>();

  for (const archivio of archivi) {
    const numerici = [...archivio.entries()].filter(
      (voce): voce is [string, number] => typeof voce[1] === 'number' && voce[1] !== 0,
    );
    for (const [nomeA, valoreA] of numerici) {
      for (const [nomeB, valoreB] of numerici) {
        if (nomeA >= nomeB) continue;
        const chiave = `${nomeA}|${nomeB}`;
        insieme.set(chiave, (insieme.get(chiave) ?? 0) + 1);

        /*
          Il rapporto si guarda grande su piccolo, non nell'ordine alfabetico dei nomi.

          Con la divisione in una sola direzione la coppia vera usciva `0,01` invece di
          `100` e passava liscia: `indice di onerosità` viene prima di `oneri finanziari su
          ebitda`, e il grande stava al denominatore. Il difetto l'ho reintrodotto io in
          questo controllo, ed è esattamente il motivo per cui l'autoprova esiste.
        */
        const grande = Math.max(Math.abs(valoreA), Math.abs(valoreB));
        const piccolo = Math.min(Math.abs(valoreA), Math.abs(valoreB));
        const rapporto = grande / piccolo;
        // Tolleranza stretta: `39,93 / 0,3993` fa 100 esatto, e due grandezze diverse che
        // ci passano vicino per caso sono rare quanto serve.
        if (rapporto > 99.5 && rapporto < 100.5) {
          conRapporto.set(chiave, (conRapporto.get(chiave) ?? 0) + 1);
        }
      }
    }
  }

  /*
    Si pretende che la coppia tenga su OGNI impresa in cui entrambi i campi ci sono, e su
    almeno due. Pretendere che ci sia su tutte era troppo: un'impresa senza profilo
    completo non ha quei campi, e la coppia vera veniva scartata per assenza.
  */
  return [...conRapporto.entries()]
    .filter(([chiave, n]) => n >= 2 && n === insieme.get(chiave))
    .map(([chiave, n]) => {
      const [a = '', b = ''] = chiave.split('|');
      return { a, b, imprese: n };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · I numeri della scheda devono tornare fra loro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le identità interne della scheda, ricalcolate e confrontate.
 *
 * È l'unico controllo che il lettore può fare da solo: «29 rischi identificati · 22 da
 * trasferire» si verifica contando le righe, «60% di 11.500.000» si verifica con una
 * moltiplicazione, «limite patrimoniale 143.954 €» con il 20 % del patrimonio netto
 * stampato tre righe sopra. Se una di queste non torna, il difetto è nella scheda, non nel
 * lettore — e il lettore lo trova, perché è la prima cosa che un intermediario prova a
 * fare davanti a un numero.
 *
 * Nel progetto è già costato: «escluse per età: 10» mentre le schede passavano da 23 a 21.
 * Erano due, e il conteggio contava le righe di un join. Qui si conta sul DTO che la
 * pagina riceve, cioè su ciò che il lettore vede — non su ciò che il motore pensa di
 * aver detto.
 *
 * Le tolleranze sono di un euro dove c'è un arrotondamento commerciale, e zero altrove.
 */
interface SchedaDaRiconciliare {
  readonly rischi?: readonly {
    readonly probabilita: number;
    readonly impatto: number;
    readonly punteggioResiduo: number;
    readonly trattamento: string;
    readonly daVerificare: boolean;
  }[];
  readonly rischiMeta?: {
    readonly totale: number;
    readonly daTrasferire: number;
    readonly daVerificare: number;
  };
  readonly sintesi?: {
    readonly rischiIdentificati: number;
    readonly rischiDaTrasferire: number;
    readonly patrimonioEsposto: { readonly euro: number } | null;
    readonly esposizioneNonAssicurata: { readonly euro: number };
  };
  readonly dannoMassimo?: {
    readonly disponibile: boolean;
    readonly possibile?: { readonly euro: number };
    readonly probabile?: { readonly euro: number };
    readonly quota?: number;
  };
  readonly credito?: {
    readonly fido: {
      readonly importo: { readonly euro: number } | null;
      readonly limitePatrimoniale: { readonly euro: number } | null;
      readonly limiteDimensionale: { readonly euro: number } | null;
      readonly limiteFlusso: { readonly euro: number } | null;
    };
  };
  readonly sommeAssicurande?: Record<string, { readonly valore: { readonly euro: number } | null }>;
  readonly indicatoriArchivio?: {
    readonly aggregati?: { readonly patrimonioNetto: number | null } | null;
  } | null;
}

function numeriCheNonTornano(dtoGrezzo: unknown): string[] {
  const dto = dtoGrezzo as SchedaDaRiconciliare;
  const rilievi: string[] = [];
  const nonTorna = (cosa: string, atteso: number, trovato: number): void => {
    rilievi.push(`${cosa}: atteso ${atteso}, stampato ${trovato}`);
  };

  const rischi = dto.rischi ?? [];
  if (dto.rischiMeta !== undefined) {
    const trasferire = rischi.filter((r) => r.trattamento === 'trasferire').length;
    const verificare = rischi.filter((r) => r.daVerificare).length;
    if (dto.rischiMeta.totale !== rischi.length)
      nonTorna('rischi identificati', rischi.length, dto.rischiMeta.totale);
    if (dto.rischiMeta.daTrasferire !== trasferire)
      nonTorna('rischi da trasferire', trasferire, dto.rischiMeta.daTrasferire);
    if (dto.rischiMeta.daVerificare !== verificare)
      nonTorna('rischi da confermare', verificare, dto.rischiMeta.daVerificare);
  }
  if (dto.sintesi !== undefined) {
    if (dto.sintesi.rischiIdentificati !== rischi.length)
      nonTorna('sintesi · rischi identificati', rischi.length, dto.sintesi.rischiIdentificati);
    const trasferire = rischi.filter((r) => r.trattamento === 'trasferire').length;
    if (dto.sintesi.rischiDaTrasferire !== trasferire)
      nonTorna('sintesi · rischi da trasferire', trasferire, dto.sintesi.rischiDaTrasferire);
  }
  for (const r of rischi) {
    if (r.punteggioResiduo !== r.probabilita * r.impatto) {
      nonTorna(
        `punteggio residuo = probabilità × impatto (${r.probabilita}×${r.impatto})`,
        r.probabilita * r.impatto,
        r.punteggioResiduo,
      );
    }
  }

  const dm = dto.dannoMassimo;
  if (
    dm?.disponibile === true &&
    dm.possibile !== undefined &&
    dm.probabile !== undefined &&
    dm.quota !== undefined
  ) {
    // Il probabile è possibile × quota arrotondato PER ECCESSO a cifra commerciale: mai
    // sotto il prodotto, mai sopra il valore intero.
    const atteso = dm.possibile.euro * dm.quota;
    if (dm.probabile.euro < atteso - 1)
      nonTorna('danno probabile ≥ possibile × quota', Math.round(atteso), dm.probabile.euro);
    if (dm.probabile.euro > dm.possibile.euro + 1)
      nonTorna('danno probabile ≤ danno possibile', dm.possibile.euro, dm.probabile.euro);
    if (dm.quota < 0.35 || dm.quota > 1)
      rilievi.push(`quota di danno probabile fuori da [0,35; 1]: ${dm.quota}`);
  }

  const fido = dto.credito?.fido;
  if (fido !== undefined && fido.importo !== null) {
    const limiti = [fido.limitePatrimoniale, fido.limiteDimensionale, fido.limiteFlusso]
      .filter((l): l is { euro: number } => l !== null)
      .map((l) => l.euro);
    if (limiti.length > 0 && fido.importo.euro > Math.min(...limiti) + 1) {
      nonTorna('fido ≤ vincolo più stringente', Math.min(...limiti), fido.importo.euro);
    }
    // Il limite patrimoniale è il 20 % del patrimonio netto che il motore usa: in
    // produzione è quello dell'archivio, ed è stampato sulla stessa scheda.
    const pn = dto.indicatoriArchivio?.aggregati?.patrimonioNetto ?? null;
    if (
      pn !== null &&
      fido.limitePatrimoniale !== null &&
      Math.abs(fido.limitePatrimoniale.euro - pn * 0.2) > 1
    ) {
      nonTorna(
        'limite patrimoniale = 20 % del patrimonio netto',
        Math.round(pn * 0.2),
        fido.limitePatrimoniale.euro,
      );
    }
  }

  const somme = dto.sommeAssicurande;
  if (somme !== undefined) {
    const componenti = ['fabbricati', 'contenuto', 'scorte']
      .map((k) => somme[k]?.valore?.euro ?? null)
      .filter((v): v is number => v !== null);
    const esposto = somme['patrimonioEsposto']?.valore?.euro ?? null;
    if (componenti.length > 0 && esposto !== null) {
      const attesa = componenti.reduce((s, v) => s + v, 0);
      if (Math.abs(attesa - esposto) > 1)
        nonTorna('patrimonio esposto = fabbricati + contenuto + scorte', attesa, esposto);
    }
    if (
      dto.sintesi?.patrimonioEsposto != null &&
      esposto !== null &&
      dto.sintesi.patrimonioEsposto.euro !== esposto
    ) {
      nonTorna('sintesi · patrimonio esposto', esposto, dto.sintesi.patrimonioEsposto.euro);
    }
    if (
      dto.sintesi?.patrimonioEsposto != null &&
      dto.sintesi.esposizioneNonAssicurata.euro > dto.sintesi.patrimonioEsposto.euro + 1
    ) {
      nonTorna(
        'esposizione non assicurata ≤ patrimonio esposto',
        dto.sintesi.patrimonioEsposto.euro,
        dto.sintesi.esposizioneNonAssicurata.euro,
      );
    }
  }

  return rilievi;
}

// ─────────────────────────────────────────────────────────────────────────────
// La cache che non spende
// ─────────────────────────────────────────────────────────────────────────────

class CacheDaSonda implements Cache {
  constructor(private readonly piva: string) {}
  readonly mancanti: string[] = [];

  get(key: string): CacheEntry | undefined {
    const servizio = /\/([A-Za-z0-9-]+)\/\d+/.exec(key)?.[1] ?? null;
    if (servizio === null) return undefined;
    const file = join(SONDA, `prod-${servizio}-${this.piva}.json`);
    if (!existsSync(file)) {
      this.mancanti.push(servizio);
      return undefined;
    }
    return {
      value: JSON.parse(readFileSync(file, 'utf8')) as unknown,
      expiresAt: Date.now() + 3_600_000,
    };
  }
  set(): void {}
  delete(): void {}
}

async function creaCache(piva: string): Promise<Cache> {
  if (!DA_DATABASE) return new CacheDaSonda(piva);
  const { creaPersistenza } = await import('../apps/api/src/persistenza.js');
  const { CachePersistente } = await import('../apps/api/src/cache-persistente.js');
  const persistenza = await creaPersistenza({ url: process.env['DATABASE_URL'] });
  return new CachePersistente(persistenza.db);
}

/** Le imprese su cui misurare, quando non ne è stata indicata nessuna. */
function piveDaSonda(): string[] {
  if (!existsSync(SONDA)) return [];
  const trovate = new Set<string>();
  for (const f of readdirSync(SONDA)) {
    const m = /^prod-IT-(?:advanced|full)-(\d+)\.json$/.exec(f);
    if (m?.[1] !== undefined) trovate.add(m[1]);
  }
  return [...trovate];
}

// ─────────────────────────────────────────────────────────────────────────────
// L'autoprova: i rilevatori si fanno fallire prima di essere creduti
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ogni rilevatore, messo davanti al difetto vero e a un caso legittimo.
 *
 * Gira **sempre**, prima della misura, e non su richiesta: questo strumento ha già
 * restituito «nessun rilievo» tre volte in mezz'ora per tre ragioni diverse — misurava il
 * compilato vecchio, contava una versione come un decimale, cercava affermazioni ripetute
 * dentro un elenco di nomi. Ogni volta lo zero sembrava identico a quello buono.
 *
 * Le stringhe sono quelle vere, prese dalle schede in cui i difetti sono stati trovati.
 * Se un giorno un rilevatore smette di vederle, questo esce con codice 2 invece di
 * dichiarare la scheda pulita.
 */
function autoprovaRilevatori(): void {
  const guasti: string[] = [];

  const deve = (condizione: boolean, cosa: string): void => {
    if (!condizione) guasti.push(cosa);
  };

  // 1 · separatore decimale
  deve(
    decimaliInglesi('Fattore di score 0.30× (score 44/100)').includes('0.30'),
    'il separatore inglese «0.30» non viene più visto',
  );
  deve(
    decimaliInglesi('Patrimonio esposto 11.500.000 €').length === 0,
    'le migliaia italiane «11.500.000» vengono scambiate per un decimale inglese',
  );

  // 2 · accordo con il numero uno
  deve(
    accordiSbagliati('Sulle restanti 1 il contesto non è stato osservato.').length > 0,
    'l’accordo sbagliato «restanti 1» non viene più visto',
  );
  deve(
    accordiSbagliati('Su 2 ubicazioni il contesto non è stato osservato.').length === 0,
    'un plurale corretto viene segnalato come accordo sbagliato',
  );

  // 3 · affermazioni ripetute
  const rcoComeUsciva =
    'L’indennizzo INAIL non esaurisce il danno risarcibile: restano a carico del datore di ' +
    'lavoro il danno differenziale e le voci che l’istituto non indennizza. Il datore di lavoro ' +
    'è tenuto ad adottare le misure necessarie a tutelare l’integrità fisica dei prestatori di ' +
    'lavoro, e ne risponde civilmente. L’indennizzo INAIL non esaurisce il danno risarcibile: ' +
    'restano a carico il differenziale e le voci non indennizzate.';
  deve(
    affermazioniRipetute(rcoComeUsciva).includes('indenn inail esauri'),
    'la ripetizione «indennizzo INAIL esaurisce» non viene più vista',
  );
  deve(
    affermazioniRipetute(
      'Protegge il capitale produttivo dell’impresa da eventi che possono comprometterne la ' +
        'continuità aziendale e la capacità di produrre reddito nel tempo.',
    ).length === 0,
    'una frase senza ripetizioni viene segnalata',
  );
  // E l'elenco dei rischi serviti non deve rientrare dalla finestra: è una lista di nomi.
  deve(
    affermazioniRipetute(
      'La violazione di dati personali espone a sanzioni GDPR e ad azioni risarcitorie degli ' +
        'interessati. L’analisi ha rilevato i seguenti rischi residui a carico dell’impresa: ' +
        'violazione di dati personali (rilevante); frode informatica (rilevante).',
    ).length === 0,
    'il nome di un rischio dentro l’elenco viene contato come affermazione ripetuta',
  );

  // 4 · «da rilevare» di ciò che l'archivio ha già dato
  const frasiFinte: Frase[] = [
    { dove: '.credito.fattori[3].dettagli[0].label', testo: 'PFN / EBITDA' },
    { dove: '.credito.fattori[3].dettagli[0].value', testo: 'da rilevare in intervista' },
  ];
  deve(
    chiedeCiòCheHaGià(frasiFinte, { leveFinanziarie: { pfnSuEbitda: 9.53 } }).length > 0,
    'la voce chiesta mentre l’archivio la fornisce non viene più vista',
  );
  deve(
    chiedeCiòCheHaGià(frasiFinte, { cicloFinanziario: { durataScorte: 264 } }).length === 0,
    'una grandezza diversa viene scambiata per la stessa',
  );

  /*
    Le due che questo controllo aveva mancato, con le etichette e i campi veri.

    «Crescita EBITDA» contro `variazioneMol`: nessuna parola in comune, e senza la tabella
    dei sinonimi il rilievo non nasceva. «ROI» contro `roi`: una parola sola, e con la sola
    soglia a due radici non scattava. Erano entrambe sulla scheda, con l'archivio che il
    dato ce l'aveva stampato dodici righe piu su.
  */
  const chiesta = (etichetta: string): Frase[] => [
    { dove: '.credito.fattori[1].dettagli[0].label', testo: etichetta },
    { dove: '.credito.fattori[1].dettagli[0].value', testo: 'da rilevare in intervista' },
  ];
  deve(
    chiedeCiòCheHaGià(chiesta('Crescita EBITDA'), { kpi: { variazioneMol: -4.67 } }).length > 0,
    'il sinonimo MOL/EBITDA non viene riconosciuto',
  );
  deve(
    chiedeCiòCheHaGià(chiesta('ROI'), { redditivita: { roi: 4.68 } }).length > 0,
    'un’etichetta di una parola sola non viene mai agganciata',
  );
  deve(
    chiedeCiòCheHaGià(chiesta('ROI'), { cicloFinanziario: { durataScorte: 264 } }).length === 0,
    'un’etichetta di una parola sola aggancia qualunque campo',
  );

  /*
    5 · la coppia in due unità, con i valori veri delle due imprese su cui è stata provata.

    Il nome che viene prima in ordine alfabetico porta il valore PICCOLO: è la disposizione
    su cui la prima versione di questo controllo falliva in silenzio, dividendo nel verso
    sbagliato e ottenendo 0,01 invece di 100.
  */
  const conCoppia = (onerosita: number, suEbitda: number): Map<string, unknown> =>
    new Map<string, unknown>([
      ['indice di onerosita', onerosita],
      ['oneri finanziari su ebitda', suEbitda],
    ]);
  deve(
    coppieInDueUnita([conCoppia(39.93, 0.3993), conCoppia(0.02, 0.0002)]).length === 1,
    'la coppia «indice di onerosità» / «oneri finanziari su EBITDA» non viene più vista',
  );
  deve(
    coppieInDueUnita([conCoppia(39.93, 0.3993), conCoppia(0.02, 0.5)]).length === 0,
    'una coppia che NON tiene su tutte le imprese viene segnalata lo stesso',
  );
  deve(
    coppieInDueUnita([conCoppia(39.93, 0.3993)]).length === 0,
    'una sola impresa basta a dichiarare una coppia: è una coincidenza, non una definizione',
  );
  // E l'elenco delle coppie già esaminate non deve diventare il posto in cui le cose
  // spariscono: ogni riga porta il motivo, e senza motivo non entra.
  deve(
    Object.values(COPPIE_DICHIARATE).every((motivo) => motivo.trim().length > 20),
    'una coppia è stata dichiarata senza scrivere cosa è stato fatto',
  );

  /*
    6 · i numeri che devono tornare, su una scheda finta coerente e su tre guaste.

    La coerente deve restare muta: una riconciliazione che grida su una scheda giusta
    insegna a ignorarla esattamente come una che tace su una sbagliata.
  */
  const rischio = (p: number, i: number, trattamento = 'trasferire') => ({
    probabilita: p,
    impatto: i,
    punteggioResiduo: p * i,
    trattamento,
    daVerificare: false,
  });
  const coerente = {
    rischi: [rischio(3, 5), rischio(2, 4, 'ridurre')],
    rischiMeta: { totale: 2, daTrasferire: 1, daVerificare: 0 },
    sintesi: {
      rischiIdentificati: 2,
      rischiDaTrasferire: 1,
      patrimonioEsposto: { euro: 11_500_000 },
      esposizioneNonAssicurata: { euro: 11_500_000 },
    },
    dannoMassimo: {
      disponibile: true,
      possibile: { euro: 11_500_000 },
      probabile: { euro: 6_900_000 },
      quota: 0.6,
    },
    credito: {
      fido: {
        importo: { euro: 43_000 },
        limitePatrimoniale: { euro: 143_954 },
        limiteDimensionale: { euro: 395_937 },
        limiteFlusso: null,
      },
    },
    sommeAssicurande: {
      fabbricati: { valore: { euro: 11_500_000 } },
      contenuto: { valore: null },
      scorte: { valore: null },
      patrimonioEsposto: { valore: { euro: 11_500_000 } },
    },
    indicatoriArchivio: { aggregati: { patrimonioNetto: 719_768 } },
  };
  deve(numeriCheNonTornano(coerente).length === 0, 'una scheda coerente viene segnalata');
  deve(
    numeriCheNonTornano({ ...coerente, rischiMeta: { ...coerente.rischiMeta, totale: 3 } }).length === 1,
    'un conteggio dei rischi che non torna non viene visto',
  );
  deve(
    numeriCheNonTornano({
      ...coerente,
      rischi: [rischio(3, 5), { ...rischio(2, 4, 'ridurre'), punteggioResiduo: 9 }],
    }).length === 1,
    'un punteggio residuo diverso da probabilità × impatto non viene visto',
  );
  deve(
    numeriCheNonTornano({
      ...coerente,
      credito: { fido: { ...coerente.credito.fido, limitePatrimoniale: { euro: 1_697 } } },
    }).length === 2,
    'il limite patrimoniale che non è il 20 % del patrimonio netto non viene visto',
  );

  if (guasti.length > 0) {
    process.stderr.write('\n  I RILEVATORI SONO CIECHI — la misura non vale:\n');
    for (const g of guasti) process.stderr.write(`    ✗ ${g}\n`);
    process.stderr.write('\n');
    process.exit(2);
  }
}

autoprovaRilevatori();

// ─────────────────────────────────────────────────────────────────────────────

const bersagli = PIVE.length > 0 ? PIVE : piveDaSonda();
if (bersagli.length === 0) {
  process.stdout.write('\n  Nessuna risposta registrata in .sonda/: niente da misurare.\n\n');
  process.exit(1);
}

let totale = 0;
/* Gli indici dell'archivio impresa per impresa: le coppie si giudicano su tutte insieme. */
const archiviVisti: Map<string, unknown>[] = [];

for (const piva of bersagli) {
  const cache = await creaCache(piva);
  const provider = new OpenApiProvider({
    token: 'nessun-token-audit-offline',
    ambiente: 'produzione',
    config: OPENAPI_DEFAULT_CONFIG,
    cache,
    ledger: { record: () => {} },
  });

  let dto: unknown;
  let indicatoriFornitore: unknown = null;
  let nome = piva;
  try {
    const profilo = await provider.fetchProfile(piva, 'profondito');
    nome = `${profilo.identity.denominazione} · ${piva}`;
    indicatoriFornitore = profilo.indicatoriFornitore;
    dto = presentAnalysis(analyzeCompany(profilo, [], new Date()));
  } catch (errore) {
    // Il token è finto apposta: un 401 significa che la risposta non è fra quelle già
    // pagate, non che il prodotto sia rotto. Si dice, e si passa alla successiva.
    const messaggio = /HTTP 401/.test(String(errore))
      ? 'risposta non registrata in .sonda/ — questo strumento non chiama e non spende'
      : String(errore);
    process.stdout.write(`\n  ${piva}: saltata (${messaggio})\n`);
    continue;
  }

  const frasi: Frase[] = [];
  raccogliFrasi(dto, '', frasi);
  const prosa = frasi.filter((f) => !CHIAVI_TECNICHE.test(f.dove));

  process.stdout.write(`\n  ${nome}\n  ${'─'.repeat(70)}\n`);
  process.stdout.write(`  stringhe consegnate alla pagina: ${frasi.length}\n`);

  const rilievi: string[] = [];

  for (const f of prosa) {
    for (const d of decimaliInglesi(f.testo)) {
      rilievi.push(`separatore inglese «${d}» — ${f.dove}\n      ${estratto(f.testo)}`);
    }
    for (const a of accordiSbagliati(f.testo)) {
      rilievi.push(`accordo «${a}» — ${f.dove}\n      ${estratto(f.testo)}`);
    }
    // La ripetizione si cerca solo nei testi lunghi: sotto le venti parole di contenuto
    // una sequenza che torna è quasi sempre una coincidenza di lingua, non un difetto.
    if (parole(f.testo).length >= 20) {
      for (const r of affermazioniRipetute(f.testo)) {
        rilievi.push(`ripetuto «${r}» — ${f.dove}\n      ${estratto(f.testo)}`);
      }
    }
  }

  for (const s of chiedeCiòCheHaGià(prosa, indicatoriFornitore)) {
    rilievi.push(`già disponibile: ${s}`);
  }
  for (const s of numeriCheNonTornano(dto)) rilievi.push(`non torna: ${s}`);

  if (rilievi.length === 0) {
    process.stdout.write('  nessun rilievo\n');
  } else {
    for (const r of rilievi) process.stdout.write(`  ✗ ${r}\n`);
  }
  process.stdout.write(`  rilievi: ${rilievi.length}\n`);
  totale += rilievi.length;
  archiviVisti.push(campiValorizzatiArchivio(indicatoriFornitore));
}

/*
  Le coppie in due unità si giudicano alla fine: servono più imprese, perché su una sola un
  rapporto di 100 fra due grandezze diverse è una coincidenza plausibile.
*/
const coppie = coppieInDueUnita(archiviVisti);
if (coppie.length > 0) {
  process.stdout.write(`\n  Indici dell’archivio in rapporto 1:100\n`);
  process.stdout.write(`  ${'─'.repeat(70)}\n`);
  for (const c of coppie) {
    const dichiarata = COPPIE_DICHIARATE[`${c.a}|${c.b}`];
    const dove = `su ${c.imprese} imprese su ${archiviVisti.length}`;
    if (dichiarata === undefined) {
      process.stdout.write(`  ✗ «${c.a}» e «${c.b}» — ${dove}\n`);
      totale += 1;
    } else {
      process.stdout.write(`  · già esaminata: «${c.a}» e «${c.b}» — ${dichiarata}\n`);
    }
  }
}

process.stdout.write(`\n  TOTALE RILIEVI: ${totale}\n\n`);
process.exit(totale === 0 ? 0 : 1);
