import type { LivelloRischio } from '@/lib/api';

/**
 * L'esposizione territoriale sulla scala dei livelli di rischio, e `null` quando non c'è.
 *
 * Le due scale sono distinte nel dominio — «alta/media/bassa» descrive un territorio,
 * «critico/alto/…» descrive un rischio valutato — e la conversione avviene qui, al
 * momento di disegnarle, invece di confonderle nel motore.
 *
 * La funzione riconosceva tre valori e chiudeva con un ternario: tutto ciò che non era
 * `alta` né `media` diventava `bassa`, e prendeva il verde. Il server però manda anche
 * `'non determinata'` — per le trentatré province che la tabella sismica non classifica,
 * fra cui il Piemonte intero, la Liguria, Milano, Venezia — e a schermo il testo diceva
 * «non determinata» mentre il colore diceva «va bene». Vince il colore: è ciò che si legge
 * per primo, e su una tabella di ubicazioni è spesso l'unica cosa che si legge.
 *
 * `null` è l'assenza, e resta assenza. Non è un quarto livello e non ha una gravità: chi
 * disegna decide come mostrarla, e deve mostrarla in modo che non assomigli a un
 * accertamento tranquillizzante.
 *
 * Vive in un modulo suo, e non dentro la pagina, per una ragione sola: `page.tsx` è un
 * componente server di Next e in prova non si monta. Un controllo che ne leggesse il
 * sorgente non è un controllo, è una lettura.
 */
export function livelloTerritoriale(livello: string): LivelloRischio | null {
  switch (livello) {
    case 'alta':
      return 'alto';
    case 'media':
      return 'moderato';
    case 'bassa':
      return 'basso';
    default:
      return null;
  }
}
