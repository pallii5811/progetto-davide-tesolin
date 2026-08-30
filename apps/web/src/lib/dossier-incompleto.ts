/**
 * Quali righe del questionario non si possono salvare, e cosa manca a ciascuna.
 *
 * Al cliente si prometteva «**Nessun campo è obbligatorio**», e poi il salvataggio
 * scartava in silenzio le polizze senza compagnia o senza date e gli immobili senza
 * descrizione, rispondendo «Risposte inviate. Grazie». La polizza non arrivava mai
 * all'intermediario, e a valle il piano proponeva di **attivare** una garanzia che il
 * cliente ha già — cioè di comprare due volte la stessa copertura.
 *
 * Il difetto non era il filtro: era che il filtro non lo diceva. Un dato che non si può
 * salvare va nominato a chi l'ha scritto, che è l'unico in grado di completarlo. Qui si
 * elencano le righe e le loro mancanze; la decisione su cosa farne sta a chi chiama.
 *
 * Sta in un modulo suo perché **il questionario ha due porte** — quella dell'intermediario
 * e quella del cliente — e perché è la sola parte che si può mettere alla prova senza un
 * browser.
 */

/** Una riga che non si può salvare, e perché. */
export interface RigaIncompleta {
  /** Come nominarla a chi l'ha scritta: «Polizza 2 (incendio)», «Immobile 1». */
  readonly cosa: string;
  /** I campi che mancano, con il nome che il modulo usa. */
  readonly mancano: readonly string[];
}

/**
 * I campi senza i quali una riga non ha senso, e non un campo qualunque.
 *
 * Una polizza senza somma assicurata resta utile: dice che la garanzia c'è, e il capitale
 * si rileva dopo. Una polizza senza compagnia e senza date non è una polizza: non si può
 * dire se è in vigore, e il confronto con le coperture da attivare non la riconosce.
 */
export function righeIncomplete(
  immobili: readonly { readonly descrizione: string }[],
  polizze: readonly {
    readonly coverage: string;
    readonly compagnia: string;
    readonly dataEffetto: string;
    readonly dataScadenza: string;
  }[],
): RigaIncompleta[] {
  const rilievi: RigaIncompleta[] = [];

  immobili.forEach((immobile, indice) => {
    if (immobile.descrizione.trim() !== '') return;
    rilievi.push({ cosa: `Immobile ${indice + 1}`, mancano: ['descrizione'] });
  });

  polizze.forEach((polizza, indice) => {
    const mancano: string[] = [];
    if (polizza.compagnia.trim() === '') mancano.push('compagnia');
    if (polizza.dataEffetto === '') mancano.push('data di effetto');
    if (polizza.dataScadenza === '') mancano.push('data di scadenza');
    if (mancano.length === 0) return;
    rilievi.push({ cosa: `Polizza ${indice + 1} (${polizza.coverage})`, mancano });
  });

  return rilievi;
}

/**
 * Il rilievo, detto a chi ha compilato.
 *
 * Si compone dai valori — quali righe, quali campi — e non da un modello linguistico:
 * un elenco generico («alcune righe non sono complete») non permette a nessuno di
 * rimediare, ed è esattamente ciò che rendeva invisibile lo scarto.
 */
export function messaggioRigheIncomplete(righe: readonly RigaIncompleta[]): string {
  const elenco = righe.map((r) => `${r.cosa}: manca ${r.mancano.join(', ')}`).join(' · ');
  return righe.length === 1
    ? `Una riga non si può ancora salvare — ${elenco}. Completala oppure toglila: il resto è già pronto.`
    : `${righe.length} righe non si possono ancora salvare — ${elenco}. Completale oppure toglile: il resto è già pronto.`;
}
