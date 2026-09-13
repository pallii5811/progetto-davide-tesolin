/**
 * Da dove vengono le somme assicurande, detto per QUESTA analisi.
 *
 * Il sottotitolo era fisso: «Calcolate dal bilancio depositato e dai dati rilevati in
 * intervista». Su RED GROUP S.R.L. il bilancio in schema CEE non era stato comprato e
 * l'intervista era allo 0 %: il fabbricato veniva dalla cartografia, il monte salari dagli
 * aggregati del registro. Una riga che nomina due fonti assenti fa credere misurati i numeri
 * che stanno sotto, ed è proprio la fiducia che una stima non deve ricevere.
 */
export function sottotitoloSomme(
  livello: 'assente' | 'sintetico' | 'completo',
  percentualeIntervista: number,
): string {
  const fonti: string[] = [];
  if (livello === 'completo') fonti.push('dal bilancio depositato');
  if (livello === 'sintetico') fonti.push('dagli aggregati di bilancio del Registro Imprese');
  if (percentualeIntervista > 0) fonti.push('dai dati rilevati in intervista');

  if (fonti.length === 0) {
    return 'Senza dati di bilancio né di intervista: ogni voce è una stima, e lo dichiara';
  }
  const senzaIntervista = percentualeIntervista > 0 ? '' : ', senza dati di intervista';
  return `Calcolate ${fonti.join(' e ')}${senzaIntervista}: dove una voce è stimata, lo dichiara`;
}
