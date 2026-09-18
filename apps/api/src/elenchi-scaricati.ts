import type { CriteriProspezione } from '@aegis/providers';

/**
 * Gli elenchi già comprati, e le aziende da non far uscire di nuovo (18/09/2026).
 *
 * Richiesta di Simone: le aziende di un elenco comprato finiscono nel CRM, e «alla prossima
 * ricerca se cerco gli stessi filtri quelle aziende già nel CRM non devono uscire». Il
 * fornitore fa pagare ogni azienda che restituisce e non accetta un elenco di partite IVA da
 * escludere: nasconderle dopo l'acquisto vorrebbe dire pagarle senza vederle. Accetta però di
 * saltare le prime N, e con gli stessi filtri il prossimo elenco chiede le successive.
 */

/**
 * La combinazione di filtri che identifica un elenco.
 *
 * Fuori ciò che non cambia QUALI aziende escono: quante scaricarne, il livello di dettaglio, la
 * posizione da cui partire. Dentro, i filtri come il fornitore li riceve — l'ATECO senza punti,
 * la provincia in maiuscolo — perché due scritture della stessa richiesta sono la stessa
 * richiesta. Per il resto si tiene la differenza così com'è scritta: due chiavi dove ne bastava
 * una fanno ricomprare qualche azienda; una chiave dove ne servivano due farebbe saltare aziende
 * mai viste, che è il danno peggiore.
 */
export function chiaveElenco(criteri: CriteriProspezione): string {
  const testo = (valore: string | undefined): string | null => {
    const pulito = valore?.trim() ?? '';
    return pulito === '' ? null : pulito;
  };
  const ateco = testo(criteri.ateco)?.replace(/[^0-9]/g, '') ?? '';

  return JSON.stringify({
    comune: testo(criteri.comune)?.toUpperCase() ?? null,
    provincia: testo(criteri.provincia)?.toUpperCase() ?? null,
    ateco: ateco === '' ? null : ateco,
    denominazione: testo(criteri.denominazione),
    addettiMin: criteri.addettiMin ?? null,
    addettiMax: criteri.addettiMax ?? null,
    fatturatoMinEuro: criteri.fatturatoMinEuro ?? null,
    fatturatoMaxEuro: criteri.fatturatoMaxEuro ?? null,
    formaGiuridicaCodice: testo(criteri.formaGiuridicaCodice),
    socioCodiceFiscale: testo(criteri.socioCodiceFiscale),
    soloAttive: criteri.soloAttive !== false,
  });
}

/** Solo le cifre: la stessa partita IVA scritta con uno spazio resta la stessa azienda. */
export function cifrePartitaIva(partitaIva: string): string {
  return partitaIva.replace(/\D/g, '');
}

/**
 * Le aziende di un elenco appena comprato da mostrare, e quante restano fuori.
 *
 * Fuori quelle già nel CRM prima di questo acquisto — analizzate, o arrivate da un altro elenco —
 * tranne quelle arrivate proprio da questa combinazione di filtri. Quelle si rivedono solo
 * ripetendo lo stesso acquisto dalla stessa posizione, cioè ricaricando la pagina dell'elenco:
 * la richiesta è identica, la memoria la serve senza pagare, e nasconderle farebbe sparire
 * un elenco appena comprato. Senza partita IVA non si può dire se un'azienda sia già nota: si
 * mostra.
 */
export function aziendeDaMostrare<T extends { readonly partitaIva: string | null }>(
  aziende: readonly T[],
  nelCrm: ReadonlySet<string>,
  diQuestiFiltri: ReadonlySet<string>,
): { readonly visibili: readonly T[]; readonly nascoste: number } {
  const visibili = aziende.filter((azienda) => {
    if (azienda.partitaIva === null) return true;
    const cifre = cifrePartitaIva(azienda.partitaIva);
    return !nelCrm.has(cifre) || diQuestiFiltri.has(cifre);
  });
  return { visibili, nascoste: aziende.length - visibili.length };
}
