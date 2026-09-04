/**
 * I rilevatori di testo, condivisi fra l'auditor della scheda e il collaudo del report.
 *
 * Sono nati dentro `scripts/audit-testo-schermo.ts`, che misura il DTO consegnato alla
 * pagina. Ma il report per il cliente ha prosa scritta direttamente nei componenti — non
 * passa dal DTO — e quella prosa non era mai stata letta da nessun rilevatore: il documento
 * che il cliente consegna ai propri clienti era l'unica superficie non misurata.
 *
 * Qui stanno le funzioni pure. Niente stato, niente processo, niente `process.exit`: è ciò
 * che permette di importarle da una prova Playwright senza che parta l'auditor intero.
 *
 * Ogni rilevatore ha il suo caso storico nell'autoprova di `audit-testo-schermo.ts`, e
 * cambiare una soglia qui senza far girare quell'autoprova è il modo di renderlo cieco
 * senza accorgersene.
 */

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
 * norme — riconosciuti dal contesto della frase **o dalla loro forma**.
 *
 * La forma serve perché il contesto non basta: sulla testata della scheda il codice
 * ATECO sta da solo, «52.10.10 Magazzini di custodia e deposito», senza la parola ATECO
 * nella riga, e il rilevatore lo segnalava. Un codice ATECO è due, quattro o sei cifre a
 * coppie — `NN.NN` o `NN.NN.NN` — e a differenza di un decimale è seguito da una
 * descrizione con la maiuscola, o da niente. «94.48 gg» resta un decimale: dopo c'è una
 * minuscola. «39.93%» pure: dopo c'è un simbolo.
 */
export const CONTESTI_CON_PUNTO = /ATECO|NACE|SIC|D\.Lgs|D\.P\.R|art\.|artt\.|c\.c\.|CCII|ISO|http|@|v\d/;

/** `52.10.10 Magazzini…`, `28.99.99`, `25.72 Fabbricazione…`: la forma di un codice ATECO. */
function haLaFormaDiUnAteco(numero: string, dopo: string): boolean {
  const gruppi = numero.split('.');
  if (!gruppi.every((g) => g.length === 2)) return false;
  if (gruppi.length === 3) return true;
  return gruppi.length === 2 && /^\s*(?:[A-ZÀÈÉÌÒÙ]|$)/.test(dopo);
}

export function decimaliInglesi(testo: string): string[] {
  if (CONTESTI_CON_PUNTO.test(testo)) return [];
  const trovati: string[] = [];
  for (const m of testo.matchAll(/\d+(?:\.\d+)+/g)) {
    const gruppi = m[0].split('.');
    const migliaiaItaliane = gruppi.slice(1).every((g) => g.length === 3);
    if (migliaiaItaliane) continue;
    const fine = m.index + m[0].length;
    const dopo = testo.slice(fine, fine + 3);
    if (haLaFormaDiUnAteco(m[0], dopo)) continue;
    trovati.push(m[0]);
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
export const NOMI_CONTATI =
  'ubicazioni|imprese|aziende|anni|esercizi|giorni|veicoli|soci|amministratori|bilanci|rischi|coperture|polizze|sedi|comuni|complessi|province|dipendenti|addetti|fabbricati|immobili|certificazioni|cariche|segnalazioni|fattori|indici|voci|schede|righe|campi';

export function accordiSbagliati(testo: string): string[] {
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
  Lo stesso riconoscitore della prova unitaria sulle motivazioni, portato sull'intera
  scheda: parole di contenuto troncate alla radice, sequenze di tre. Là guardava una
  copertura per volta; qui guarda ogni testo lungo che la pagina stampa, perché la
  ripetizione più fastidiosa è quella fra due sezioni diverse.
*/
export const PAROLE_DI_SERVIZIO = new Set(
  (
    'il lo la i gli le un uno una l di a ad da in con su per tra fra del dello della dei degli delle ' +
    'dell al allo alla ai agli alle all dal dallo dalla dai dagli dalle dall nel nello nella nei negli ' +
    'nelle nell sul sullo sulla sui sugli sulle sull e o ed od ma che chi cui non ne si se come anche ' +
    'è sono ha hanno essere stato stata resta restano più meno quando dove ciò questo questa quello ' +
    'quella entrambi casi caso sua suo sue suoi loro ogni tutti tutte solo soltanto stessa stesso'
  ).split(' '),
);

export function parole(testo: string): string[] {
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
export function senzaElencoDeiRischi(testo: string): string {
  const inizio = testo.indexOf('L’analisi ha rilevato i seguenti rischi residui');
  const inizioApostrofoDritto = testo.indexOf("L'analisi ha rilevato i seguenti rischi residui");
  const taglio = inizio >= 0 ? inizio : inizioApostrofoDritto;
  return taglio >= 0 ? testo.slice(0, taglio) : testo;
}

export function affermazioniRipetute(testo: string): string[] {
  const p = parole(senzaElencoDeiRischi(testo));
  const viste = new Map<string, number>();
  for (let i = 0; i + 2 < p.length; i += 1) {
    const tris = `${p[i]} ${p[i + 1]} ${p[i + 2]}`;
    viste.set(tris, (viste.get(tris) ?? 0) + 1);
  }
  return [...viste.entries()].filter(([, n]) => n > 1).map(([tris]) => tris);
}

/**
 * I tre rilevatori di testo puro applicati a un blocco di prosa, con il motivo.
 *
 * È la forma che serve al collaudo del report: riceve il testo così come lo legge chi
 * apre la pagina, e restituisce un elenco vuoto o un elenco di righe da guardare. La
 * ripetizione si cerca solo nei blocchi lunghi: sotto le venti parole di contenuto una
 * sequenza che torna è quasi sempre una coincidenza di lingua, non un difetto.
 */
/**
 * Inglese residuo dell'archivio.
 *
 * Il fornitore descrive cariche, sedi e classi dimensionali in inglese; la tabella di
 * traduzione le copre, ma solo dove viene chiamata. «ha la rappresentanza legale (chairman
 * of board of directors)» è uscito sulla scheda perché il motore stampava il ruolo grezzo.
 * Si cercano le parole che il fornitore usa davvero — non l'inglese in generale, che in una
 * scheda assicurativa compare a ragione: business interruption, cyber, key man.
 */
export const INGLESE_DELL_ARCHIVIO =
  /\b(?:chairman of board of (?:directors|auditors)|board of (?:directors|auditors)|chairman|managing director|permanent auditor|temporary auditor|auditing company|special representative|registered office|local units?|administrative headquarter|operational headquarter|(?:micro|small|medium|large) enterprise)\b/gi;

export function ingleseResiduo(testo: string): string[] {
  return [...testo.matchAll(INGLESE_DELL_ARCHIVIO)].map((m) => m[0]);
}

/**
 * Separatori doppi: «102,, AGNOSINE», «( )», «..».
 *
 * Nascono dove un pezzo dell'indirizzo manca, o arriva già con la sua virgola e chi compone
 * aggiunge la propria. Nessuno li scrive apposta: ogni occorrenza è un difetto di composizione.
 */
export function separatoriDoppi(testo: string): string[] {
  return [...testo.matchAll(/,,|, ,| ,(?=\s)|\(\s*\)|(?<!\.)\.\.(?!\.)|—\s*—/g)].map((m) => m[0]);
}

/**
 * Due due-punti nella stessa frase: «ROI: l’archivio lo pubblica ma non ne documenta il
 * denominatore: resta fra i suoi indicatori». Nasce quando un motivo scritto per stare da
 * solo viene appeso a un'etichetta che porta già il suo. Si escludono gli orari (10:30) e
 * i due-punti dentro le virgolette.
 */
export function dueDuePunti(testo: string): string[] {
  const senzaCitazioni = testo.replace(/«[^»]*»/g, '«»');
  // Fra i due due-punti non deve chiudersi una frase: «Formula: X. Riferimento: Y» è lecito.
  // Il punto mediano separa coppie etichetta-valore («Probabilità: Possibile · Impatto: Grave»).
  const m = /: [^:.;!?·]{6,}: /.exec(senzaCitazioni);
  return m === null ? [] : [m[0].trim()];
}

/**
 * Acronimi spenti: «certificazione soa», «gruppo iva», «pmi innovativa».
 *
 * Nascono da un toLowerCase applicato a un'etichetta intera per abbassarne l'iniziale.
 * L'elenco è quello del lessico di questa scheda; gli indirizzi (apogeopec.it) non
 * combaciano perché l'acronimo lì è preceduto da una lettera. Il punto DOPO è lecito:
 * «gruppo iva.» chiude una frase, e va visto.
 */
export function acronimiMinuscoli(testo: string): string[] {
  // E la forma «Ebitda», «Pfn»: l'acronimo trattato come una parola con l'iniziale maiuscola.
  const titolati = [
    ...testo.matchAll(
      /(?<![\w@.])(Ebitda|Ebit|Pfn|Iva|Ateco|Pec|Rct|Rco|Soa|Pmi|Inail|Inps|Gdpr)(?![\w@])/g,
    ),
  ].map((m) => m[0]);
  return [
    ...titolati,
    ...testo.matchAll(
      /(?<![\w@.])(soa|pmi|iva|ateco|rea|pec|inail|inps|gdpr|ebitda|ebit|pfn|roi|roe|ros|rct|rco|cat nat|iso|lei|sdi|nace|sic)(?![\w@])/g,
    ),
  ].map((m) => m[0]);
}

export function rilieviSulTesto(testo: string): string[] {
  const rilievi: string[] = [];
  for (const d of decimaliInglesi(testo)) rilievi.push(`separatore inglese «${d}»`);
  for (const a of accordiSbagliati(testo)) rilievi.push(`accordo «${a}»`);
  for (const i of ingleseResiduo(testo)) rilievi.push(`inglese dell’archivio «${i}»`);
  for (const s of separatoriDoppi(testo)) rilievi.push(`separatore doppio «${s}»`);
  for (const d of dueDuePunti(testo)) rilievi.push(`due due-punti «${d}»`);
  for (const a of acronimiMinuscoli(testo)) rilievi.push(`acronimo minuscolo «${a}»`);
  if (parole(testo).length >= 20) {
    for (const r of affermazioniRipetute(testo)) rilievi.push(`ripetuto «${r}»`);
  }
  return rilievi;
}
