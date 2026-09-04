/**
 * Cosa dire dei campi che l'archivio non ha restituito.
 *
 * Il riquadro chiudeva sempre con «Si acquistano con l'**analisi approfondita**» — anche a
 * chi l'analisi approfondita l'aveva appena pagata, cosa che accade su entrambi i campioni
 * reali di IT-full. Il componente non sapeva a quale livello si fosse acquistato: chiedere
 * altri trenta centesimi per qualcosa di già comprato è la peggiore delle proposte, perché
 * chi la accetta scopre di aver pagato due volte lo stesso nulla.
 *
 * Quando l'approfondimento c'è già, l'assenza è dell'archivio e va detta così: non è una
 * cosa da comprare, è una cosa che il registro non contiene per questa impresa.
 */
import { inizialeMinuscola } from '@aegis/core';

export function notaCampiMancanti(mancanti: readonly string[], approfondita: boolean): string | null {
  if (mancanti.length === 0) return null;

  // Solo l'iniziale: «codice lei» era un acronimo spento, e il collaudo lo ha visto.
  const elenco = mancanti.map(inizialeMinuscola).join(', ');

  return approfondita
    ? `Non compresi in questa analisi: ${elenco}. Il registro non li ha restituiti per questa impresa: l’approfondimento è già stato acquisito e non contiene queste voci.`
    : `Non compresi in questa analisi: ${elenco}. Si acquistano con l’analisi approfondita.`;
}
