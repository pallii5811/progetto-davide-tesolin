/**
 * I prezzi effettivi non sono una costante del software.
 *
 * Dipendono dal contratto: lo stesso servizio costa 0,30 € a chiamata singola e scende
 * sotto i 9 centesimi in abbonamento a volume — una differenza di oltre tre volte, che su
 * un prodotto rivenduto a più intermediari cambia il modello di business, non un dettaglio
 * di visualizzazione.
 *
 * Tenerli scritti nel codice ha già prodotto due errori: un servizio pagato il doppio di
 * quanto dichiarato, e uno stimato al rialzo senza verifica. Un prezzo sbagliato non è
 * cosmetico — governa il tetto di spesa, il credito residuo e il preventivo mostrato prima
 * di acquistare, cioè tutte le difese contro la spesa involontaria.
 *
 * Qui i valori del listino pubblico restano il predefinito, e chi conosce le proprie
 * condizioni le dichiara senza toccare il codice.
 */

import type { OpenApiConfig, ServiceConfig } from './config.js';

/**
 * Formato: `servizio=centesimi`, separati da virgola.
 *
 * Esempio: `AEGIS_PREZZI_CENTESIMI=profiloCompleto=9,anagraficaEstesa=3,eventiNegativi=6`
 *
 * I nomi sono quelli dei servizi nella configurazione, non i percorsi HTTP: sono stabili
 * anche quando il fornitore rinomina un endpoint.
 */
export function prezziDaConfigurazione(valore: string | undefined): ReadonlyMap<string, number> {
  const mappa = new Map<string, number>();
  if (valore === undefined || valore.trim() === '') return mappa;

  for (const voce of valore.split(',')) {
    const [nome, centesimi] = voce.split('=').map((p) => p.trim());
    if (nome === undefined || centesimi === undefined) continue;

    const importo = Number.parseInt(centesimi, 10);
    // Un prezzo negativo o non numerico si ignora: meglio il predefinito del listino che
    // un tetto di spesa calcolato su un numero senza senso.
    if (!Number.isInteger(importo) || importo < 0) continue;

    mappa.set(nome, importo);
  }

  return mappa;
}

/**
 * Applica i prezzi dichiarati alla configurazione, lasciando intatto tutto il resto.
 *
 * Non tocca percorsi, scope né tempi di cache: cambia solo quanto si dichiara di pagare.
 */
export function conPrezzi(config: OpenApiConfig, prezzi: ReadonlyMap<string, number>): OpenApiConfig {
  if (prezzi.size === 0) return config;

  const servizi = Object.fromEntries(
    Object.entries(config.services).map(([nome, servizio]) => {
      const dichiarato = prezzi.get(nome);
      return [
        nome,
        dichiarato === undefined
          ? servizio
          : ({ ...servizio, costoCentesimi: dichiarato } satisfies ServiceConfig),
      ];
    }),
  ) as OpenApiConfig['services'];

  return { ...config, services: servizi };
}
