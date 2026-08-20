/**
 * Verifica eventi negativi — protesti, pregiudizievoli, procedure concorsuali.
 *
 * È il fattore che pesa il **20% dello score di credito** e l'unico in grado di rilevare
 * una procedura concorsuale aperta, che azzera il fido concedibile. Senza, ogni valutazione
 * del merito creditizio resta dichiaratamente provvisoria.
 *
 * Servizio **asincrono**: il POST apre una pratica (45 centesimi), lo stato si legge dopo
 * senza costo. La struttura della risposta è ricostruita dalla documentazione del prodotto
 * e letta in modo difensivo su più alias, come per il resto dell'integrazione: sarà
 * confermata alla prima chiamata reale, quando il token avrà lo scope `risk`.
 */

import { REGISTRO_PROTESTI, fromProvider } from '@aegis/core';
import type { EventiNegativi, Pregiudizievole, ProceduraConcorsuale, Protesto, Sourced } from '@aegis/core';
import { asArray, bool, date, money, moneyOrZero, pick, str } from './parse.js';

const PROVIDER = 'OpenAPI.com';

/**
 * Esito della verifica.
 *
 * `nonDisponibile` non è un errore da nascondere: distingue «nessun evento negativo»
 * da «non ho potuto controllare», e sullo score le due cose valgono in modo opposto.
 */
export type EsitoNegativita =
  | { readonly disponibile: true; readonly eventi: Sourced<EventiNegativi> }
  | { readonly disponibile: false; readonly motivo: string; readonly richiestaId: string | null };

export function mappaNegativita(raw: unknown, osservatoIl: Date): Sourced<EventiNegativi> {
  const contenuto: unknown = pick(raw, 'data', 'result') ?? raw;
  const radice: unknown = Array.isArray(contenuto) ? (contenuto[0] ?? {}) : contenuto;

  const protesti = mappaProtesti(radice);
  const pregiudizievoli = mappaPregiudizievoli(radice);
  const procedure = mappaProcedure(radice);

  /*
    Gli indicatori di presenza, accanto agli elenchi.

    Il servizio reale risponde con `presenzaProtesti`, `presenzaPregiudizievoli` e
    `presenzaProcedure`, e gli elenchi arrivano `null` quando non c'è nulla. Ma possono
    arrivare `null` **anche quando l'indicatore dice di sì**: dettaglio non compreso nel
    servizio, o pratica ancora in lavorazione.

    Leggere i soli elenchi significherebbe rispondere «nessun protesto» su un'impresa
    protestata — un certificato di buona salute falso, sul fattore che pesa il venti per
    cento dello score. Qui la discordanza viene conservata invece che appianata.
  */
  const dichiarati: ('protesti' | 'pregiudizievoli' | 'procedure')[] = [];
  if (bool(radice, 'presenzaProtesti') === true && protesti.length === 0) {
    dichiarati.push('protesti');
  }
  if (bool(radice, 'presenzaPregiudizievoli') === true && pregiudizievoli.length === 0) {
    dichiarati.push('pregiudizievoli');
  }
  if (bool(radice, 'presenzaProcedure') === true && procedure.length === 0) {
    dichiarati.push('procedure');
  }

  return fromProvider(
    { protesti, pregiudizievoli, procedure, presenzaDichiarataSenzaDettaglio: dichiarati },
    PROVIDER,
    'IT-negativita',
    REGISTRO_PROTESTI,
    osservatoIl,
  );
}

function mappaProtesti(radice: unknown): readonly Protesto[] {
  const elenco = asArray(
    pick(radice, 'protesti', 'protests', 'elencoProtesti') ??
      pick(pick(radice, 'dettaglio', 'detail'), 'protesti', 'protests'),
  );

  return elenco
    .map((p): Protesto | null => {
      const data = date(p, 'data', 'date', 'dataProtesto', 'dataLevata', 'registrationDate');
      if (data === null) return null;
      return {
        data,
        importo: money(p, 'importo', 'amount') ?? moneyOrZero(p, 'importo'),
        tipo: str(p, 'tipo', 'type', 'titolo', 'tipoTitolo') ?? 'Non specificato',
        luogo: str(p, 'luogo', 'place', 'comune', 'piazza'),
        // Un protesto «levato» (cancellato) pesa molto meno: va distinto.
        levato: bool(p, 'levato', 'settled', 'cancellato', 'riabilitato') ?? false,
      };
    })
    .filter((p): p is Protesto => p !== null);
}

function mappaPregiudizievoli(radice: unknown): readonly Pregiudizievole[] {
  const elenco = asArray(
    pick(radice, 'pregiudizievoli', 'prejudicials', 'atti', 'adverseRecords') ??
      pick(pick(radice, 'dettaglio', 'detail'), 'pregiudizievoli', 'prejudicials'),
  );

  return elenco
    .map((p): Pregiudizievole | null => {
      const data = date(p, 'data', 'date', 'dataIscrizione', 'registrationDate');
      if (data === null) return null;
      const descrizione = str(p, 'descrizione', 'description', 'tipo', 'type') ?? 'Non specificata';
      return {
        data,
        tipo: classificaPregiudizievole(descrizione),
        importo: money(p, 'importo', 'amount', 'importoIscritto', 'securedAmount'),
        descrizione,
      };
    })
    .filter((p): p is Pregiudizievole => p !== null);
}

function mappaProcedure(radice: unknown): readonly ProceduraConcorsuale[] {
  const elenco = asArray(
    pick(radice, 'procedure', 'procedures', 'concorsuali', 'bankruptcyProcedures') ??
      pick(pick(radice, 'dettaglio', 'detail'), 'procedure', 'procedures'),
  );

  return elenco
    .map((p): ProceduraConcorsuale | null => {
      /*
        I nomi veri vengono per primi, e sono in **snake_case**.

        Osservati il 20/08/2026 su una risposta reale — Acciaierie d'Italia S.p.A., quattro
        procedure fra cui uno stato di insolvenza del 29/02/2024. Prima di allora questa
        funzione cercava `dataApertura` e `openingDate`: nomi plausibili e mai verificati.
        Nessuno corrispondeva, ogni voce veniva scartata per data mancante, e il prodotto
        dichiarava «procedure presenti senza dettaglio» **avendo il dettaglio in mano**.

        Su un'impresa in insolvenza è la differenza fra un documento che dice «risulta una
        procedura, da verificare» e uno che dice «stato di insolvenza, 29 febbraio 2024».
      */
      const dataApertura = date(
        p,
        'data_provvedimento',
        'dataApertura',
        'openingDate',
        'data',
        'date',
      );
      if (dataApertura === null) return null;

      const dataChiusura = date(p, 'data_chiusura', 'dataChiusura', 'closingDate');
      /*
        La revoca chiude una procedura quanto la chiusura, ma su un campo diverso.

        Osservato sulla stessa risposta reale: misure cautelari e protettive con
        `data_chiusura` vuota e `data_revoca` al 29/02/2024. Guardando la sola chiusura
        risultavano **aperte**, ed `aperta` è il flag che azzera il punteggio di credito.
        Qui l'impresa era comunque in insolvenza, quindi non cambiava l'esito; su un'impresa
        il cui unico provvedimento fosse stato revocato, avremmo negato il fido a un'azienda
        risanata — senza che nessun collaudo potesse accorgersene.
      */
      const dataRevoca = date(p, 'data_revoca', 'dataRevoca', 'revocationDate');
      const dataOmologa = date(p, 'data_omologa', 'dataOmologa', 'approvalDate');
      const descrizione = str(
        p,
        'descrizione_procedura',
        'tipo',
        'type',
        'descrizione',
        'description',
      );
      return {
        tipo: classificaProcedura(descrizione),
        // La dicitura del registro viene conservata testuale accanto alla classificazione:
        // «STATO DI INSOLVENZA» vale più di qualunque etichetta nostra, e in una
        // contestazione è quella che si mostra.
        descrizione,
        dataApertura,
        dataChiusura,
        dataRevoca,
        dataOmologa,
        // Il campo `tribunale` esiste ma può arrivare **vuoto**, come sulla risposta
        // osservata: `str` restituisce `null` e la sezione lo dichiara, invece di
        // stampare un tribunale inesistente.
        tribunale: str(p, 'tribunale', 'court', 'sede'),
        // Aperta solo se non è né chiusa né revocata: forza lo score a ≤ 10.
        aperta: dataChiusura === null && dataRevoca === null,
      };
    })
    .filter((p): p is ProceduraConcorsuale => p !== null);
}

/**
 * Alcune risposte riportano solo indicatori booleani, senza il dettaglio.
 * In quel caso l'assenza di negatività è un'informazione piena; la presenza, invece,
 * richiede la lettura del dettaglio per essere pesata correttamente.
 */
export function soloIndicatori(raw: unknown): { presenti: boolean; quali: readonly string[] } | null {
  const contenuto: unknown = pick(raw, 'data', 'result') ?? raw;
  const radice: unknown = Array.isArray(contenuto) ? (contenuto[0] ?? {}) : contenuto;

  /*
    I nomi veri vengono per primi.

    Questa funzione cercava `protesti`, `hasProtests`, `protests` — nomi plausibili e mai
    verificati. Il servizio reale usa `presenzaProtesti`, e quelle chiavi contengono gli
    **elenchi**, non i booleani: `bool` non trovava mai nulla, la funzione restituiva
    sempre `null`, e il presidio che avrebbe dovuto riconoscere «indicatori senza
    dettaglio» non è mai entrato in funzione una sola volta.

    Le grafie ipotizzate restano dopo, come ripieghi: costano nulla e coprono eventuali
    varianti. Ma quella giusta è la prima, ed è quella osservata sulla risposta vera.
  */
  const indicatori: [string, boolean | null][] = [
    ['protesti', bool(radice, 'presenzaProtesti', 'hasProtests', 'protests')],
    [
      'pregiudizievoli',
      bool(radice, 'presenzaPregiudizievoli', 'hasPrejudicials', 'prejudicials'),
    ],
    ['procedure concorsuali', bool(radice, 'presenzaProcedure', 'hasProcedures', 'procedures')],
  ];

  const noti = indicatori.filter(([, valore]) => valore !== null);
  if (noti.length === 0) return null;

  const presenti = noti.filter(([, valore]) => valore === true).map(([nome]) => nome);
  return { presenti: presenti.length > 0, quali: presenti };
}

function classificaPregiudizievole(descrizione: string): Pregiudizievole['tipo'] {
  const testo = descrizione.toLowerCase();
  if (testo.includes('ipoteca')) return 'ipoteca-giudiziale';
  if (testo.includes('pignoramento')) return 'pignoramento';
  if (testo.includes('sequestro')) return 'sequestro';
  if (testo.includes('domanda giudiziale')) return 'domanda-giudiziale';
  if (testo.includes('ingiuntivo')) return 'decreto-ingiuntivo';
  return 'altro';
}

/**
 * La dicitura del registro tradotta in categoria.
 *
 * Esportata perché esisteva **due volte**, qui e in `mapper.ts`, riga per riga identica.
 * Due copie della stessa regola sono due regole: la correzione dello stato di insolvenza
 * sarebbe valsa da una porta sola, e l'altra avrebbe continuato a chiamarlo «altro».
 */
export function classificaProcedura(valore: string | null): ProceduraConcorsuale['tipo'] {
  if (valore === null) return 'altro';
  const testo = valore.toLowerCase();
  if (testo.includes('liquidazione giudiziale')) return 'liquidazione-giudiziale';
  if (testo.includes('fallim')) return 'fallimento';
  if (testo.includes('concordato')) return 'concordato-preventivo';
  if (testo.includes('composizione negoziata')) return 'composizione-negoziata';
  if (testo.includes('coatta')) return 'liquidazione-coatta';
  if (testo.includes('straordinaria')) return 'amministrazione-straordinaria';
  if (testo.includes('ristrutturazione')) return 'accordo-ristrutturazione';
  if (testo.includes('scioglimento')) return 'scioglimento';
  // Le due voci che seguono sono state osservate su una risposta reale il 20/08/2026 e
  // finivano entrambe in «altro». Lo stato di insolvenza in particolare è il presupposto
  // della liquidazione giudiziale: confonderlo col secchio generico su un prodotto che
  // valuta il merito di credito è l'errore di classificazione più grave possibile.
  if (testo.includes('insolvenza')) return 'stato-insolvenza';
  if (testo.includes('cautelar') || testo.includes('protettiv')) return 'misure-protettive';
  return 'altro';
}

/** Il numero di elementi mappati, utile alla diagnostica. */
export function contaEventi(eventi: EventiNegativi): number {
  return eventi.protesti.length + eventi.pregiudizievoli.length + eventi.procedure.length;
}
