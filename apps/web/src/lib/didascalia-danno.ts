/**
 * Da cosa dipende la quota di danno probabile, detto per intero.
 *
 * Su TRANSPECIAL S.R.L. la scheda stampava «81% del valore, per la sola classe di rischio del
 * settore»: la classe dava il 70 %, e il resto era il 15 % in più per i valori concentrati in un
 * unico complesso. Una didascalia che nomina una causa sola fa credere che l'altra non ci sia.
 */
export function didascaliaDannoProbabile(protezioni: readonly string[], concentrazione: boolean): string {
  const concentrati = concentrazione ? ' e della concentrazione dei valori in un unico complesso' : '';
  if (protezioni.length > 0) return `, tenuto conto di: ${protezioni.join(', ')}${concentrati}`;
  return concentrazione
    ? ', per la classe di rischio del settore aumentata del 15% per i valori concentrati in un unico complesso: nessuna protezione è stata accertata'
    : ', per la sola classe di rischio del settore: nessuna protezione è stata accertata';
}
