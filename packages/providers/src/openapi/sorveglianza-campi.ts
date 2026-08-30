/**
 * Sorveglianza sui campi che il fornitore restituisce e il prodotto non legge.
 *
 * Nasce da un limite che nessun collaudo può superare: la copertura si misura sulle
 * risposte **registrate**, cioè su poche aziende. Un campo che l'archivio restituisce solo
 * per una società in liquidazione, per una con controllante estera o per una con protesti
 * non compare in quel campione — e non comparirebbe in nessun campione ragionevole, perché
 * le combinazioni sono troppe.
 *
 * Aggiungiamo poi che il fornitore cambia: aggiunge campi senza preavviso, e nessuno
 * manda una comunicazione quando lo fa.
 *
 * Il presidio non è quindi «li abbiamo verificati tutti» — è una promessa che nessuno può
 * mantenere. È: **il sistema se ne accorge da solo**. Una risposta viene confrontata con
 * l'elenco dei campi noti, e ciò che non vi compare viene segnalato a chi gestisce la
 * piattaforma. Un dato nuovo smette di essere un dato perso in silenzio e diventa una
 * riga da leggere.
 *
 * Costa una passeggiata sull'oggetto già in memoria: nessuna chiamata, nessun ritardo
 * percepibile.
 *
 * ⚠ **NON È ANCORA COLLEGATA IN PRODUZIONE.** Fino al 29/08/2026 questo file diceva «ogni
 * risposta viene confrontata», al presente, e due commenti altrove nel repo davano il
 * presidio per attivo — mentre la classe non era mai stata istanziata in nessun punto del
 * repo, test compresi. È il presidio che avrebbe dovuto segnalare le quattro procedure
 * concorsuali perse il 20 agosto, e non poteva segnalare niente.
 *
 * Oggi gira sulle risposte registrate, in `test/presidi-vivi.test.ts`. Per accenderlo in
 * produzione manca **una sola cucitura**, nel punto in cui le risposte grezze arrivano —
 * `OpenApiProvider` in `provider.ts`: costruirne una istanza con `CAMPI_NOTI` e chiamare
 * `esamina(servizio, raw)` dentro `#get`, `#fetchProfiloCompleto` e `#leggiNegativita`,
 * con `onNuovo` collegato al registro della piattaforma. Quel file è fuori dalla corsia di
 * chi scrive questa nota: la cucitura è una decisione del committente, non una svista da
 * correggere di nascosto.
 *
 * Finché quella riga non c'è, questo commento dice il vero e il presidio è **spento**. Un
 * presidio morto è peggio di nessun presidio, perché rassicura: se la decisione fosse di
 * non collegarlo, si cancelli il file invece di lasciarlo a fare da garanzia.
 */

/** Percorso di un campo mai letto, con il servizio da cui è arrivato. */
export interface CampoIgnoto {
  readonly servizio: string;
  readonly percorso: string;
  /** Il valore osservato, troncato: serve a capire se merita di essere mappato. */
  readonly esempio: string;
  readonly vistoIl: Date;
}

/**
 * Campi deliberatamente non letti, con il motivo.
 *
 * Ognuno va giustificato: è l'unico modo di distinguere «scartato con cognizione» da
 * «dimenticato». Senza motivazioni, l'elenco torna a essere una lista di sviste.
 */
export const SCARTATI_A_RAGION_VEDUTA: Readonly<Record<string, string>> = {
  id: 'identificativo interno del fornitore: opaco, e usarlo come chiave farebbe riacquistare le aziende',
  openapiNumber: 'idem, sulle sedi e sui soci',
  creationTimestamp: 'quando il fornitore ha creato il proprio record: non è un fatto dell’impresa',
  lastUpdateTimestamp: 'sostituito dalla data di aggiornamento leggibile, già letta',
  sdiCodeTimestamp: 'marcatempo di un campo tecnico',
  taxCodeCeasedTimestamp: 'marcatempo: la cessazione del codice fiscale è letta come fatto',
  registryOk: 'spunta di coerenza interna del registro IVA del fornitore',
  success: 'involucro della risposta',
  message: 'involucro della risposta',
  error: 'involucro della risposta',
  data: 'involucro della risposta',
};

/**
 * Registro delle segnalazioni.
 *
 * Tiene **una sola voce per percorso**: un campo ignoto su mille analisi è una notizia
 * sola, e ripeterla mille volte la seppellisce insieme a tutto il resto del registro.
 */
export class SorveglianzaCampi {
  readonly #visti = new Map<string, CampoIgnoto>();
  readonly #conosciuti: ReadonlySet<string>;
  readonly #onNuovo: ((campo: CampoIgnoto) => void) | undefined;

  constructor(conosciuti: Iterable<string>, onNuovo?: (campo: CampoIgnoto) => void) {
    this.#conosciuti = new Set(conosciuti);
    this.#onNuovo = onNuovo;
  }

  /** Esamina una risposta e registra i campi che nessun lettore conosce. */
  esamina(servizio: string, raw: unknown, adesso = new Date()): readonly CampoIgnoto[] {
    const nuovi: CampoIgnoto[] = [];

    for (const [percorso, valore] of foglie(raw)) {
      const nome = percorso.split('.').at(-1) ?? percorso;
      /*
        `Object.hasOwn`, non l'operatore `in`.

        `in` percorre la **catena dei prototipi**: `'constructor' in { … }` risponde `true`
        su qualunque oggetto letterale, e così `toString`, `valueOf`, `hasOwnProperty`,
        `__proto__`. Un campo che il fornitore chiamasse in uno di quei modi veniva quindi
        trattato come «scartato a ragion veduta» — cioè taciuto, con la motivazione di un
        altro campo.

        È il modo peggiore in cui un presidio può sbagliare: non protesta, tace. E questo
        presidio esiste soltanto per non tacere.
      */
      if (this.#conosciuti.has(nome) || Object.hasOwn(SCARTATI_A_RAGION_VEDUTA, nome)) continue;

      const chiave = `${servizio}:${percorso}`;
      if (this.#visti.has(chiave)) continue;

      const campo: CampoIgnoto = {
        servizio,
        percorso,
        esempio: String(valore).slice(0, 60),
        vistoIl: adesso,
      };
      this.#visti.set(chiave, campo);
      nuovi.push(campo);
      this.#onNuovo?.(campo);
    }

    return nuovi;
  }

  /** Tutto ciò che è stato visto e mai letto, dal più recente. */
  elenco(): readonly CampoIgnoto[] {
    return [...this.#visti.values()].sort((a, b) => b.vistoIl.getTime() - a.vistoIl.getTime());
  }
}

/**
 * Ogni foglia dell'oggetto, con il suo percorso.
 *
 * Degli array si esamina **ogni** elemento, non solo il primo: due protesti possono avere
 * campi diversi — uno levato e uno no — e fermarsi al primo è esattamente il modo di non
 * accorgersi del secondo.
 */
function* foglie(valore: unknown, percorso = ''): Generator<readonly [string, unknown]> {
  if (valore === null || typeof valore !== 'object') {
    if (percorso !== '') yield [percorso, valore];
    return;
  }

  if (Array.isArray(valore)) {
    for (const elemento of valore) yield* foglie(elemento, percorso);
    return;
  }

  for (const [chiave, v] of Object.entries(valore)) {
    yield* foglie(v, percorso === '' ? chiave : `${percorso}.${chiave}`);
  }
}
