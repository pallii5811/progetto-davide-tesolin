/**
 * Imputazione dei costi alla richiesta che li ha generati.
 *
 * Il registro dei costi è un oggetto solo, condiviso da tutto il servizio, e i suoi eventi
 * non portano scritto chi li ha causati. Finché lavora un intermediario per volta il
 * problema non si vede; con due richieste in volo insieme — due studi diversi, o
 * un'importazione massiva mentre qualcuno analizza un'azienda — le spese dell'uno finiscono
 * addebitate all'altro. Su un servizio che si paga a consumo, è un guasto che si scopre
 * leggendo un consuntivo sbagliato, cioè troppo tardi.
 *
 * `AsyncLocalStorage` risolve il problema alla radice: ogni richiesta apre un proprio
 * contenitore, e il registro condiviso vi deposita gli eventi mentre continua ad alimentare
 * anche le statistiche complessive. Il contesto attraversa le funzioni asincrone senza
 * doverlo passare di mano in mano attraverso il provider, che non deve sapere nulla né di
 * richieste né di intermediari.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { CostEvent, CostLedger } from '@aegis/providers';

const contesto = new AsyncLocalStorage<CostEvent[]>();

/**
 * Registro che duplica ogni evento nel contenitore della richiesta in corso.
 *
 * Avvolge il registro globale invece di sostituirlo: le statistiche complessive del
 * servizio continuano a funzionare come prima, e in più ogni richiesta sa esattamente
 * cosa ha speso lei.
 */
export class RegistroPerRichiesta implements CostLedger {
  constructor(private readonly globale: CostLedger) {}

  record(evento: CostEvent): void {
    this.globale.record(evento);
    contesto.getStore()?.push(evento);
  }
}

/**
 * Esegue un'operazione raccogliendo i costi che produce.
 *
 * Restituisce il risultato e gli eventi generati **da questa sola** operazione, pronti per
 * essere imputati all'intermediario giusto.
 */
export async function conCostiDellaRichiesta<T>(
  operazione: () => Promise<T>,
): Promise<{ risultato: T; eventi: readonly CostEvent[] }> {
  const eventi: CostEvent[] = [];
  const risultato = await contesto.run(eventi, operazione);
  return { risultato, eventi };
}

/** Somma degli eventi a pagamento: le risposte servite dalla cache non si addebitano. */
export function costoDegliEventi(eventi: readonly CostEvent[]): number {
  return eventi.reduce((somma, e) => somma + (e.cacheHit ? 0 : e.costoStimatoCentesimi), 0);
}
