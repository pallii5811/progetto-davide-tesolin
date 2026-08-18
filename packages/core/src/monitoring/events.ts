/**
 * Eventi di monitoraggio.
 *
 * La differenza fra un avviso e una vendita è una riga di testo: non «l'azienda ha
 * cambiato ATECO», ma «l'attività dichiarata in polizza non è più quella esercitata, e in
 * caso di sinistro la compagnia può eccepire l'inoperatività della garanzia».
 *
 * Per questo ogni evento porta con sé tre cose distinte: il **fatto** rilevato, la sua
 * **conseguenza assicurativa** e l'**azione** da proporre. Un cruscotto che mostra solo il
 * primo scarica sull'intermediario tutto il lavoro che conta.
 */

export type TipoEvento =
  | 'anagrafica-variata'
  | 'nuova-sede'
  | 'ateco-variato'
  | 'salto-dimensionale'
  | 'bilancio-depositato'
  | 'evento-negativo'
  | 'procedura-aperta'
  | 'score-variato'
  | 'polizza-in-scadenza'
  | 'obbligo-normativo';

/**
 * Rilevanza assicurativa, 1–5. Ordina la coda di lavoro dell'intermediario.
 *
 * Non misura quanto il fatto è vistoso, ma quanto costa **non** agire: al livello 5 stanno
 * le situazioni in cui una garanzia già pagata potrebbe non indennizzare.
 */
export type Rilevanza = 1 | 2 | 3 | 4 | 5;

export interface EventoMonitoraggio {
  readonly tipo: TipoEvento;
  readonly titolo: string;
  /** Il fatto, in una frase. Quello che è cambiato. */
  readonly descrizione: string;
  /** La conseguenza sulla copertura. È la parte che l'intermediario riferisce al cliente. */
  readonly conseguenza: string;
  /** Cosa fare, in forma di azione compiuta. */
  readonly azioneSuggerita: string;
  readonly rilevanza: Rilevanza;
  readonly valorePrecedente: string | null;
  readonly valoreNuovo: string | null;
  /** Riferimenti normativi o contrattuali che sostengono la conseguenza dichiarata. */
  readonly riferimenti: readonly string[];
}

/** Ordinamento della coda: prima la rilevanza, poi il tipo, per un esito stabile. */
export function perRilevanza(a: EventoMonitoraggio, b: EventoMonitoraggio): number {
  if (a.rilevanza !== b.rilevanza) return b.rilevanza - a.rilevanza;
  return a.tipo.localeCompare(b.tipo);
}
