/**
 * Le descrizioni che l'archivio manda in inglese, dette in italiano.
 *
 * Il servizio IT-full risponde in inglese su cose su cui IT-advanced risponde in italiano:
 * nella stessa pagina convivevano «Attività di programmazione informatica» e «Small
 * enterprise», e nel report consegnato al cliente si leggeva «MARELLA ROBERTO FRANCESCO,
 * chairman of board of directors». È il documento dell'art. 58 del Reg. IVASS 40/2018, e
 * l'intermediario ci mette la faccia.
 *
 * **Elenco fisso, e ciò che non c'è resta grezzo.** Una traduzione inventata su una carica
 * sociale è peggio dell'inglese: l'inglese si vede, una carica sbagliata no — e in un
 * fascicolo di adeguatezza la carica è il perimetro nominativo della D&O.
 *
 * Si traduce sulla **descrizione** e non sul codice, che sarebbe la chiave giusta: il
 * `code` esiste nella risposta del fornitore (`AUN`, `PCA`, `SMALL`, `SSL`) ma si ferma
 * dentro `packages/providers` — il mappatore prende `role.description` e butta il resto,
 * e a `apps/web` arriva la sola stringa inglese. Portare il codice fin qui è una modifica
 * di quel pacchetto e dell'API, non di questo strato: finché non c'è, si traduce ciò che
 * arriva, e dove la descrizione è ambigua **si degrada** invece di scegliere.
 */

/**
 * Le voci previste, dalla descrizione inglese normalizzata alla dicitura italiana.
 *
 * Tutte in minuscolo: la resa maiuscola è una scelta di chi mostra, non di chi traduce, e
 * il prodotto usa entrambe — «Presidente del consiglio…» in testata, «, presidente del
 * consiglio…» in coda a un nome.
 */
const VOCI: Readonly<Record<string, string | undefined>> = {
  // ── Cariche sociali ──────────────────────────────────────────────────────
  'chairman of board of directors': 'presidente del consiglio di amministrazione',
  'vice chairman board of directors': 'vice presidente del consiglio di amministrazione',
  'vice chairman of board of directors': 'vice presidente del consiglio di amministrazione',
  /*
    «amministratore», non «amministratore delegato».

    Il registro usa la stessa descrizione inglese per due codici diversi: `AUN` è
    l'amministratore **unico**, `COD` il **delegato** — misurato sui due campioni
    registrati in `.sonda`, uno per ciascuno. Senza il codice le due cariche non si
    distinguono, e sceglierne una vorrebbe dire scrivere nel fascicolo il ruolo di
    qualcun altro. «Amministratore» è vero di entrambi: è la degradazione, non l'ipotesi.
  */
  'managing director': 'amministratore',
  'chairman of board of auditors': 'presidente del collegio sindacale',
  'permanent auditor': 'sindaco effettivo',
  'temporary auditor': 'sindaco supplente',
  'auditing company': 'società di revisione',
  'special representative/agent': 'procuratore speciale',
  liquidator: 'liquidatore',

  // ── Classe dimensionale, la stessa delle soglie UE ───────────────────────
  'micro enterprise': 'microimpresa',
  'small enterprise': 'piccola impresa',
  'medium enterprise': 'media impresa',
  'large enterprise': 'grande impresa',

  // ── Tipo di sede ─────────────────────────────────────────────────────────
  'administrative headquarter and registered office': 'sede amministrativa e sede legale',
  'administrative headquarter': 'sede amministrativa',
  'operational headquarter': 'sede operativa',
  'registered office': 'sede legale',
  /*
    Al singolare: il campo descrive **una** sede per volta, e il fornitore lo scrive al
    plurale perché è l'etichetta della sua categoria, non di questa riga.
  */
  'local units': 'unità locale',
  'local unit': 'unità locale',
};

/**
 * La dicitura italiana, o il valore così com'è arrivato.
 *
 * `null` resta `null`: l'assenza di una descrizione non è una descrizione vuota, e non va
 * riempita con un ripiego plausibile.
 */
export function traduciDescrizioneArchivio(valore: string | null): string | null {
  if (valore === null) return null;
  const chiave = valore.trim().toLowerCase();
  return VOCI[chiave] ?? valore;
}

/**
 * Come sopra, con l'iniziale maiuscola: per le righe che cominciano con questa parola.
 *
 * Non si riusa `toLowerCase().charAt(0).toUpperCase()` su una frase già composta altrove —
 * su un valore tutto maiuscolo darebbe una parola storpiata. Qui la sorgente è la nostra
 * tabella, tutta in minuscolo, e la sola cosa da alzare è la prima lettera.
 */
export function traduciDescrizioneArchivioMaiuscola(valore: string | null): string | null {
  const tradotta = traduciDescrizioneArchivio(valore);
  if (tradotta === null || tradotta === '') return tradotta;
  // Solo se la traduzione è nostra: un valore grezzo si mostra com'è, maiuscole comprese.
  const chiave = (valore ?? '').trim().toLowerCase();
  if (VOCI[chiave] === undefined) return tradotta;
  return tradotta.charAt(0).toUpperCase() + tradotta.slice(1);
}
