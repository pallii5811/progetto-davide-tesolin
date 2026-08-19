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

  return fromProvider(
    {
      protesti: mappaProtesti(radice),
      pregiudizievoli: mappaPregiudizievoli(radice),
      procedure: mappaProcedure(radice),
    },
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
      const dataApertura = date(p, 'dataApertura', 'openingDate', 'data', 'date');
      if (dataApertura === null) return null;
      const dataChiusura = date(p, 'dataChiusura', 'closingDate');
      return {
        tipo: classificaProcedura(str(p, 'tipo', 'type', 'descrizione', 'description')),
        dataApertura,
        dataChiusura,
        tribunale: str(p, 'tribunale', 'court', 'sede'),
        // Nessuna data di chiusura significa procedura ancora aperta: forza lo score a ≤ 10.
        aperta: dataChiusura === null,
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

  const indicatori: [string, boolean | null][] = [
    ['protesti', bool(radice, 'protesti', 'hasProtests', 'protests')],
    ['pregiudizievoli', bool(radice, 'pregiudizievoli', 'hasPrejudicials', 'prejudicials')],
    ['procedure concorsuali', bool(radice, 'procedure', 'hasProcedures', 'procedures')],
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

function classificaProcedura(valore: string | null): ProceduraConcorsuale['tipo'] {
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
  return 'altro';
}

/** Il numero di elementi mappati, utile alla diagnostica. */
export function contaEventi(eventi: EventiNegativi): number {
  return eventi.protesti.length + eventi.pregiudizievoli.length + eventi.procedure.length;
}
