/**
 * Il segnale che dice alla radice e al layout di mostrare la vetrina (app/_vetrina).
 *
 * Lo scrive SOLO il middleware, e solo per «/» senza sessione. Da fuori non può entrare: ogni
 * richiesta lo perde nel middleware, prima di qualunque rendering, qualunque cosa abbia mandato
 * il client. Chi lo falsificasse otterrebbe comunque solo la pagina pubblica — ma una pagina che
 * cambia aspetto per un'intestazione scelta dal visitatore è una porta che non serve lasciare.
 */
export const INTESTAZIONE_VETRINA = 'x-aegis-vetrina';

/**
 * Il percorso richiesto, scritto dal middleware (che sovrascrive quello mandato dal client):
 * serve al layout, che in Next non conosce la pagina che sta avvolgendo.
 */
export const INTESTAZIONE_PERCORSO = 'x-aegis-percorso';
