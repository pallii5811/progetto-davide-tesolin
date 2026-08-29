/**
 * Il fuso in cui il prodotto legge il tempo, in un punto solo.
 *
 * Lo stesso istante reso da un processo Node in UTC e dal browser di un broker italiano
 * esce con due ore, e a volte due giorni, di differenza. In un componente client React se
 * ne accorge e la CI diventa rossa: e' successo una volta. In un componente server non se
 * ne accorge nessuno — il server stampa un giorno, il browser non lo ricontrolla mai, e
 * il broker legge una data sbagliata senza che arrivi un avviso. Il caso rumoroso era
 * uno; quelli muti, misurati sul repo, sono venti.
 *
 * ## Perche' non basta configurare la macchina
 *
 * Oggi la difesa e' una riga di provisioning: deploy/01-macchina.sh esegue
 * timedatectl set-timezone Europe/Rome, e nessuna unita' systemd dichiara TZ. Il prodotto
 * e' quindi corretto finche' quella riga viene eseguita. Una macchina ricostruita a mano,
 * un contenitore, un secondo nodo, o la CI — che quello script non lo esegue — riportano
 * il difetto per intero. E' la regola 6b vista da un altro lato: qualcosa di essenziale
 * che vive in un posto solo, e quel posto non e' il codice.
 *
 * Qui il fuso e' dichiarato, non dedotto. Europe/Rome perche' il prodotto e' per
 * intermediari italiani e le date che mostra — termini di legge, scadenze di polizza,
 * giorni di un fascicolo di adeguatezza — sono date italiane. Non si ripiega sul fuso di
 * sistema: sarebbe di nuovo la macchina a decidere, ed e' esattamente cio' da cui si esce.
 *
 * ## Cosa questo modulo NON fa
 *
 * Non sposta nessuna data. Sotto Europe/Rome ogni funzione restituisce la stessa identica
 * stringa, e lo stesso identico istante, del codice che sostituisce: verificato su un
 * anno di istanti a passo orario — 8760 confronti, zero divergenze — cambi d'ora
 * compresi. Rende deterministico cio' che era corretto per fortuna, e nient'altro.
 *
 * Le date ancorate all'ora sbagliata restano come sono. I termini CAT NAT sono scritti
 * T23:59:59Z, che a Roma e' l'01:59:59 del giorno dopo: da oggi quel giorno esce sempre
 * lo stesso invece di dipendere dalla macchina, ma resta il giorno dopo. Spostarlo cambia
 * cio' che il cliente legge su un obbligo di legge, e va deciso a parte.
 *
 * ## Perche' toLocale e non Intl.DateTimeFormat
 *
 * Intl.DateTimeFormat.format LANCIA RangeError su una data non valida; toLocaleDateString
 * restituisce «Invalid Date». Meta' dei punti sostituiti usava la seconda forma: passare
 * alla prima trasformerebbe una stringa brutta ma innocua nel crollo di una pagina di
 * report. Si tiene il comportamento piu' mite.
 */

export const FUSO_ORARIO = 'Europe/Rome';

/** Le componenti di calendario di un istante, lette a Roma. Mese da 1 a 12. */
export interface ComponentiDelGiorno {
  readonly anno: number;
  readonly mese: number;
  readonly giorno: number;
}

interface ComponentiComplete extends ComponentiDelGiorno {
  readonly ora: number;
  readonly minuto: number;
  readonly secondo: number;
}

/*
  en-CA e' scelto per la forma, non per la lingua: e' il locale che formatToParts
  restituisce con anno, mese e giorno gia' a cifre fisse e senza rimescolarne l'ordine.
  Di questo formattatore non arriva niente a schermo: se ne usano solo i numeri.
*/
const PARTI = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_ORARIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const NON_UNA_DATA: ComponentiComplete = {
  anno: NaN,
  mese: NaN,
  giorno: NaN,
  ora: NaN,
  minuto: NaN,
  secondo: NaN,
};

function leggi(quando: Date): ComponentiComplete {
  if (Number.isNaN(quando.getTime())) return NON_UNA_DATA;

  const trovate = new Map<string, string>();
  for (const parte of PARTI.formatToParts(quando)) trovate.set(parte.type, parte.value);

  return {
    anno: Number(trovate.get('year')),
    mese: Number(trovate.get('month')),
    giorno: Number(trovate.get('day')),
    ora: Number(trovate.get('hour')),
    minuto: Number(trovate.get('minute')),
    secondo: Number(trovate.get('second')),
  };
}

/**
 * Anno, mese e giorno di un istante, come li vedrebbe un orologio italiano.
 *
 * Sostituisce getFullYear, getMonth e getDate, che leggono l'orologio del processo.
 * Attenzione al mese: qui va da 1 a 12, mentre getMonth partiva da 0. I confronti fra due
 * risultati di questa funzione restano identici, perche' la convenzione e' la stessa su
 * entrambi i lati.
 *
 * Su una data non valida ogni componente e' NaN — esattamente cio' che i getter locali
 * restituivano: chi stampava NaN/NaN/NaN continua a stamparlo. Non e' la forma giusta
 * (un buco dichiarato varrebbe di piu' di un NaN), ma cambiarla cambierebbe cio' che si
 * vede, e questa correzione non deve cambiare niente. Se un giorno si decide di
 * dichiarare l'assenza, lo si fa qui, in un punto solo.
 */
export function componentiDelGiorno(quando: Date): ComponentiDelGiorno {
  const p = leggi(quando);
  return { anno: p.anno, mese: p.mese, giorno: p.giorno };
}

/**
 * L'istante in cui e' cominciata, a Roma, la giornata che contiene questo istante.
 *
 * Sostituisce setHours(0, 0, 0, 0), che azzera sul fuso del processo. Su un server in UTC
 * quella riga faceva cominciare la giornata alle 02:00 italiane: cio' che si spende fra
 * mezzanotte e le due finiva sul plafond del giorno prima, gia' consumato.
 */
export function inizioDellaGiornata(quando: Date): Date {
  if (Number.isNaN(quando.getTime())) return new Date(NaN);

  const p = leggi(quando);
  const mezzanotteComeSeUniversale = Date.UTC(p.anno, p.mese - 1, p.giorno);

  /*
    Due passaggi, e servono entrambi. Il primo usa lo scarto dell'istante che ci e' stato
    dato; ma nel giorno del cambio d'ora lo scarto a mezzanotte e' diverso da quello di
    adesso, e con un passaggio solo il risultato cadrebbe un'ora fuori. Il secondo lo
    ricalcola sullo scarto valido a quella mezzanotte.

    Verificato su un anno intero a passo orario: coincide sempre, tutte e 8760 le volte,
    con setHours(0, 0, 0, 0) eseguito da un processo che sta a Roma.
  */
  const primoTentativo = new Date(mezzanotteComeSeUniversale - scartoDalTempoUniversale(quando));
  return new Date(mezzanotteComeSeUniversale - scartoDalTempoUniversale(primoTentativo));
}

/** Di quanti millisecondi Roma e' avanti al tempo universale, in questo istante. */
function scartoDalTempoUniversale(quando: Date): number {
  const p = leggi(quando);
  const comeSeUniversale = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ora, p.minuto, p.secondo);
  return comeSeUniversale - (quando.getTime() - quando.getUTCMilliseconds());
}

function aData(quando: Date | string): Date {
  return quando instanceof Date ? quando : new Date(quando);
}

/**
 * 29/08/2026 — la forma breve, quella delle tabelle e delle note.
 *
 * Le opzioni sono scritte per esteso anche se il locale it-IT le applicherebbe da solo:
 * misurato, toLocaleDateString('it-IT') nudo produce gia' 05/08/2026 e non 5/8/2026, ma
 * dipende dai dati del locale di chi rende. Scritte, non dipendono da nessuno.
 */
export function formattaGiorno(quando: Date | string): string {
  return aData(quando).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: FUSO_ORARIO,
  });
}

/** 29 agosto 2026 — la forma distesa, quella che si legge dentro una frase. */
export function formattaGiornoEsteso(quando: Date | string): string {
  return aData(quando).toLocaleDateString('it-IT', {
    dateStyle: 'long',
    timeZone: FUSO_ORARIO,
  });
}

/**
 * 29 agosto 2026 alle ore 16:18.
 *
 * L'ora si stampa in un punto solo di tutto il prodotto — l'ultima compilazione del
 * questionario — ed e' l'unico posto dove lo scarto puo' valere due ore intere invece di
 * un giorno. E' il difetto che la CI ha visto.
 */
export function formattaGiornoEOra(quando: Date | string): string {
  return aData(quando).toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: FUSO_ORARIO,
  });
}
