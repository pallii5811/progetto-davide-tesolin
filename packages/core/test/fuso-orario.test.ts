/**
 * Il fuso si decide in un punto solo, e nessuno legge il tempo senza dirlo.
 *
 * Il difetto che ha bocciato la CI era uno; la stessa causa, nella sua forma muta, era in
 * altri venti punti. La differenza fra i due casi non e' la gravita' ma chi se ne accorge:
 * dove il componente idrata, React grida e la suite diventa rossa; dove non idrata, il
 * server stampa un giorno, il browser non lo ricontrolla mai, e il broker legge una data
 * plausibile e sbagliata senza che nessuno riceva un avviso. Una data plausibile non
 * insospettisce nessuno, ed e' per questo che i venti muti erano sopravvissuti alla
 * correzione dell'unico rumoroso.
 *
 * Questa prova legge i SORGENTI, come fa apps/api/test/intervista-completa.test.ts, e per
 * la stessa ragione: e' l'unico modo di accorgersi che qualcuno ha scritto una
 * formattazione nuova. Un collaudo puo' provare le schermate che esistono oggi; solo una
 * lettura dei sorgenti prende la riga aggiunta domani in una schermata che nessun collaudo
 * visita.
 *
 * ## Cosa e' un segnale e cosa no
 *
 * Si cercano le API che leggono l'orologio del PROCESSO: Intl.DateTimeFormat senza
 * timeZone, toLocaleDateString e sorelle, i getter e i setter locali del calendario, il
 * giorno ritagliato da toISOString, e il nome del fuso scritto a mano. Non si cercano
 * getTime, Date.now, i getter getUTC ne' le differenze fra due istanti: sono assoluti,
 * danno lo stesso numero in ogni fuso, e metterli qui dentro riempirebbe l'elenco di
 * righe innocenti finche' qualcuno non smette di leggerlo.
 *
 * ## Le tolleranze portano un numero, non solo un nome
 *
 * Un file tollerato dichiara QUANTE occorrenze ha. Se ne compare una in piu' la prova
 * diventa rossa anche in un file gia' scusato, e se ne sparisce una pure — perche' allora
 * la ragione scritta non corrisponde piu' a niente. E' la stessa regola dei rapporti che
 * devono tornare: un elenco che si accorcia in silenzio fa credere risolto cio' che e'
 * stato solo tolto dalla vista.
 *
 * ## Perimetro
 *
 * Solo cio' che viene consegnato: apps e packages. scripts/ e collaudo/ restano fuori di
 * proposito — nessun broker legge quello che stampano, e includerli renderebbe rossa la
 * prova al primo script di diagnostica. Se un giorno da scripts/ nascera' un documento per
 * un cliente, il perimetro va allargato prima, non dopo.
 *
 * Nota sulla scrittura: le espressioni regolari qui sotto sono LETTERALI. Scriverle
 * generando il file da uno heredoc trasformerebbe ogni \b in un byte BACKSPACE e ogni \s
 * in una s, e la prova passerebbe sempre, in silenzio — che e' esattamente il difetto che
 * esiste per impedire.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));

/** L'unico file autorizzato a nominare il fuso e a chiamare le API che lo leggono. */
const CASA = 'packages/core/src/shared/tempo.ts';

const PERIMETRO: readonly string[] = [
  'apps/api/src',
  'apps/web/src',
  'packages/core/src',
  'packages/db/src',
  'packages/providers/src',
];

interface Segnale {
  readonly nome: string;
  readonly trova: RegExp;
}

const SEGNALI: readonly Segnale[] = [
  { nome: 'new Intl.DateTimeFormat', trova: /new Intl\.DateTimeFormat\(/ },
  { nome: 'toLocaleDateString', trova: /\.toLocaleDateString\(/ },
  { nome: 'toLocaleTimeString', trova: /\.toLocaleTimeString\(/ },
  {
    /*
      toLocaleString formatta anche i numeri, e il prodotto lo usa per i metri quadri e
      per i conteggi. Si prende solo quando fra le parentesi compare un'opzione che
      esiste unicamente per le date: cosi' le sei formattazioni numeriche del repo non
      finiscono nell'elenco, e una data mascherata da numero non sfugge.
    */
    nome: 'toLocaleString con opzioni di data',
    trova:
      /\.toLocaleString\([^)]*(dateStyle|timeStyle|weekday|dayPeriod|hour|minute|second|year|month|day)/,
  },
  {
    nome: 'lettura locale del calendario',
    trova: /\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getMilliseconds)\(/,
  },
  {
    nome: 'scrittura locale del calendario',
    trova: /\.(setFullYear|setMonth|setDate|setHours|setMinutes|setSeconds)\(/,
  },
  { nome: 'giorno ritagliato da toISOString', trova: /toISOString\(\)\s*\.\s*(slice|substring|split)\(/ },
  { nome: 'nome del fuso scritto a mano', trova: /Europe\/Rome|Europe%2FRome/ },
];

/**
 * I file che contengono un segnale e vanno bene lo stesso, con quante occorrenze e perche'.
 *
 * Senza una ragione scritta un'esclusione e' indistinguibile da una dimenticanza — ed e'
 * esattamente cosi' che venti punti sono rimasti fuori per mesi.
 */
const TOLLERATI: Readonly<Record<string, { readonly quante: number; readonly ragione: string }>> = {
  'apps/web/src/lib/api.ts': {
    quante: 1,
    ragione:
      'citazione dentro un commento, non una chiamata: la riga 578 spiega perche’ un campo del DTO non va trattato come Date. Non si toglie senza rendere incomprensibile il commento.',
  },
  'apps/web/src/app/azienda/[id]/dati/EditorDossier.tsx': {
    quante: 4,
    ragione:
      'le due date precompilate di una polizza nuova (righe 638 e 653) e il piu’ un anno che le lega (riga 640). Girano dentro un gestore di evento, quindi solo nel browser: nessuna idratazione, e il fuso e’ gia’ quello del broker. Correggerle sposta di un giorno il valore proposto fra mezzanotte e le due di Roma, cioe’ cambia un dato che finisce in archivio: e’ un cambiamento di comportamento, non una messa in sicurezza, e va deciso a parte.',
  },
  'apps/api/src/persistenza.ts': {
    quante: 2,
    ragione:
      'andata e ritorno delle date di polizza: la riga 562 scrive aaaa-mm-gg nella colonna date, la 579 rilegge con T00:00:00Z. toISOString e’ assoluto e tutto entra a mezzanotte universale, quindi il giro e’ esatto — per invariante, non per costruzione. Il giorno in cui una di quelle date arrivera’ con un orario, queste righe perderanno un giorno senza dare errore.',
  },
  'packages/core/src/monitoring/state.ts': {
    quante: 1,
    ragione:
      'stessa invariante della voce precedente, vista dall’altro capo del giro: la scadenza in ingresso e’ sempre mezzanotte universale.',
  },
  'packages/providers/src/territorio/meteo.ts': {
    quante: 1,
    ragione:
      'gli estremi della finestra chiesta all’archivio meteo, ritagliati sul giorno universale (riga 188). Lo scarto e’ assorbito dal margine di cinque giorni dichiarato nel commento delle righe 96-98, e cambiarlo muoverebbe le chiavi di cache senza correggere niente di visibile.',
  },
};

function* sorgenti(cartella: string): Generator<string> {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) yield* sorgenti(percorso);
    else if (voce.endsWith('.ts') || voce.endsWith('.tsx')) yield percorso;
  }
}

/** Percorso relativo alla radice, con le barre in avanti anche su Windows. */
function relativo(percorso: string): string {
  return relative(RADICE, percorso).split('\\').join('/');
}

/** file -> quante occorrenze di segnali contiene. Si conta riga per riga, non sul file. */
function conta(): Map<string, number> {
  const totali = new Map<string, number>();

  for (const parte of PERIMETRO) {
    for (const percorso of sorgenti(join(RADICE, parte))) {
      let quante = 0;
      for (const riga of readFileSync(percorso, 'utf8').split('\n')) {
        for (const segnale of SEGNALI) {
          quante += [...riga.matchAll(new RegExp(segnale.trova.source, 'g'))].length;
        }
      }
      if (quante > 0) totali.set(relativo(percorso), quante);
    }
  }

  return totali;
}

describe('Il fuso orario si decide in un punto solo', () => {
  const trovate = conta();

  /*
    Prima di tutto: la lettura funziona.

    Un controllo che estrae zero occorrenze passa sempre, e passa in silenzio. E’ il modo
    in cui un presidio smette di presidiare senza che nessuno se ne accorga — la stessa
    forma del difetto che questa prova esiste per impedire.
  */
  it('la lettura trova davvero qualcosa, altrimenti non sta controllando nulla', () => {
    expect(trovate.size).toBeGreaterThan(3);
    expect(trovate.get(CASA) ?? 0).toBeGreaterThanOrEqual(4);

    const casa = readFileSync(join(RADICE, CASA), 'utf8');
    expect(casa).toContain("export const FUSO_ORARIO = 'Europe/Rome'");
  });

  it('nessuno legge il tempo fuori da tempo.ts senza dichiararlo', () => {
    const scoperti = [...trovate.entries()]
      .filter(([file]) => file !== CASA)
      .filter(([file, quante]) => TOLLERATI[file]?.quante !== quante)
      .map(([file, quante]) => `${file}: ${quante} occorrenze, dichiarate ${TOLLERATI[file]?.quante ?? 0}`);

    expect(
      scoperti,
      'Queste righe leggono il tempo senza dire in quale fuso:\n' +
        `${scoperti.join('\n')}\n` +
        `Usare le funzioni di ${CASA}, oppure aggiungere il file a TOLLERATI con il numero ` +
        'esatto di occorrenze e la ragione per cui vanno bene cosi’.',
    ).toEqual([]);
  });

  it('il nome del fuso e’ scritto in un posto solo', () => {
    const chiLoNomina = [...trovate.keys()].filter((file) =>
      /Europe\/Rome|Europe%2FRome/.test(readFileSync(join(RADICE, file), 'utf8')),
    );

    expect(
      chiLoNomina,
      `Il fuso e’ scritto a mano anche qui: ${chiLoNomina.join(', ')}. ` +
        `Importarlo da ${CASA}: due copie divergono, e chi ne corregge una lascia l’altra rotta.`,
    ).toEqual([CASA]);
  });

  it('nessuna tolleranza sopravvive alla ragione che la spiegava', () => {
    const fantasmi = Object.keys(TOLLERATI).filter((file) => (trovate.get(file) ?? 0) === 0);
    expect(
      fantasmi,
      `tolleranze su file che non hanno piu’ niente da tollerare: ${fantasmi.join(', ')}`,
    ).toEqual([]);
  });
});
