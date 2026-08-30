/**
 * La richiesta è partita, oppure no?
 *
 * Su un'azione che **spende** la differenza è tutta qui. `eseguiImportazione` prendeva
 * ogni eccezione della `fetch` e rispondeva «Servizio non raggiungibile», cioè dichiarava
 * che non era successo niente. Ma una connessione che cade a metà — il servizio riavviato
 * durante un'importazione da duecento aziende, un proxy che chiude la presa — arriva allo
 * stesso `catch` dopo che la richiesta è stata inviata e le aziende sono state acquisite e
 * pagate. Chi legge «non raggiungibile» rilancia l'importazione, e paga due volte.
 *
 * È la stessa distinzione che il resto del progetto fa già fra un errore della fonte e un
 * fallimento del lavoro: si dichiara **soltanto** ciò che si sa.
 *
 * Un solo caso prova che nulla è partito: il servizio ha rifiutato la connessione, o il
 * nome non si è risolto. In entrambi non esiste una presa aperta su cui qualcosa possa
 * essere passato. Tutto il resto — presa chiusa a metà, attesa scaduta, errore senza
 * causa — è ambiguo, e l'ambiguo si dice ambiguo.
 */
const MAI_PARTITA: readonly string[] = [
  // Il servizio non ascolta su quell'indirizzo: nessun byte è uscito.
  'ECONNREFUSED',
  // Il nome non si risolve: non c'è nemmeno un indirizzo a cui bussare.
  'ENOTFOUND',
  'EAI_AGAIN',
];

export function nullaEPartito(errore: unknown): boolean {
  const codice = codiceDi(errore);
  return codice !== null && MAI_PARTITA.includes(codice);
}

/**
 * Il codice di sistema, che su `fetch` sta nella **causa**, non nell'errore.
 *
 * `fetch` solleva un `TypeError: fetch failed` generico e appende il vero motivo in
 * `cause`: leggere solo il primo livello troverebbe sempre e soltanto quel messaggio.
 */
function codiceDi(errore: unknown): string | null {
  for (let corrente: unknown = errore, passi = 0; corrente !== null && passi < 5; passi += 1) {
    if (typeof corrente !== 'object') return null;
    const con = corrente as { code?: unknown; cause?: unknown };
    if (typeof con.code === 'string') return con.code;
    if (con.cause === undefined) return null;
    corrente = con.cause;
  }
  return null;
}
