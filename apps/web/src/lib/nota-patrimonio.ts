import { UBICAZIONI_CON_SUPERFICIE } from '@aegis/core';
import type { ExplanationDto } from '@/lib/api';

/**
 * Su quante ubicazioni poggia il capitale fabbricati, quando non sono tutte.
 *
 * La somma parziale era dichiarata nella nota della voce, in fondo alla pagina. In testata
 * RED GROUP S.R.L. mostrava «Patrimonio esposto 7.900.000 € — Solo fabbricati a valore di
 * ricostruzione»: la didascalia diceva quali beni c'erano e taceva che erano quelli di una
 * sola sede su due. È il numero che l'intermediario legge per primo e riporta al cliente.
 *
 * Il conteggio si legge dall'input che il motore scrive apposta, con l'etichetta che il
 * motore esporta: nessuna frase da interpretare.
 */
export function ubicazioniDeiFabbricati(
  voce: { spiegazione: ExplanationDto } | null | undefined,
): string | null {
  const valore = voce?.spiegazione.input.find((i) => i.etichetta === UBICAZIONI_CON_SUPERFICIE)?.valore;
  if (valore === undefined) return null;
  const conteggio = /^(\d+) su (\d+)$/.exec(valore);
  if (conteggio === null) return null;
  const [, coperte = '', totali = ''] = conteggio;
  return `${coperte} ${coperte === '1' ? 'ubicazione' : 'ubicazioni'} su ${totali}`;
}
