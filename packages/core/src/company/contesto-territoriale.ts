/**
 * Il contesto fisico attorno a un'ubicazione.
 *
 * Qui stanno i **tipi di dominio**; la lettura dalla fonte esterna sta in
 * `@aegis/providers`. La separazione non è formale: il motore di analisi è puro e non fa
 * rete, quindi il contesto entra come un dato già raccolto — allo stesso modo di un
 * bilancio. Chi congela un'analisi congela anche questo, ed è ciò che rende il documento
 * ricostruibile fra tre anni.
 *
 * Due domande che un assuntore incendio si pone sempre, e a cui nessun bilancio risponde:
 *
 *  1. **In quanto arrivano i pompieri?** Il tempo di soccorso separa un principio
 *     d'incendio da una perdita totale.
 *  2. **Cosa c'è intorno?** Una carrozzeria o una falegnameria a duecento metri cambiano
 *     la probabilità di propagazione, e i questionari incendio lo chiedono.
 */

/** Un'attività confinante, con il perché conta ai fini incendio. */
export interface PuntoDiInteresse {
  readonly nome: string;
  /** Categoria in chiaro: «carrozzeria», «falegnameria», «distributore di carburante». */
  readonly categoria: string;
  readonly distanzaMetri: number;
  /**
   * Se l'attività è di quelle che aggravano il rischio incendio del vicinato.
   *
   * Non è un giudizio sull'esercente: è la ragione per cui i questionari incendio
   * chiedono cosa c'è di fianco.
   */
  readonly aggravaIlRischio: boolean;
}

export interface CasermaVigiliDelFuoco {
  readonly nome: string;
  readonly distanzaKm: number;
  /** Stima del tempo di arrivo, in minuti. È un ordine di grandezza, non una promessa. */
  readonly minutiStimati: number;
}

/**
 * L'impronta a terra dei fabbricati attorno all'ubicazione.
 *
 * Serve a una domanda sola: **quanto costerebbe ricostruire**. La superficie coperta,
 * moltiplicata per un costo unitario, dà un ordine di grandezza del valore a nuovo del
 * fabbricato — l'unico modo di accorgersi che una somma assicurata ferma da anni è
 * diventata metà del necessario.
 *
 * `null` significa **nessun fabbricato mappato**, che non è «nessun fabbricato»: la
 * copertura della cartografia collaborativa non è uniforme, e su un capannone recente
 * spesso non c'è ancora nulla.
 */
export interface ImprontaFabbricati {
  readonly quanti: number;
  /** Somma delle aree coperte, in metri quadri. */
  readonly superficieCopertaMq: number;
  /** L'edificio più grande: su un lotto industriale è quasi sempre il capannone. */
  readonly maggioreMq: number;
}

/**
 * Quante volte, in dieci anni, il tempo ha superato una soglia su quel punto.
 *
 * Serve a togliere una discussione dal terreno delle impressioni. «Qui non è mai
 * successo niente» è la frase con cui si rinuncia a una garanzia allagamento, e spesso è
 * vera solo perché nessuno ha guardato: sette anni su dieci con almeno un giorno oltre i
 * cinquanta millimetri sono un fatto, e cambiano la conversazione.
 */
export interface SogliaSuperata {
  /** Cosa si è misurato: «pioggia oltre 50 mm in un giorno». */
  readonly descrizione: string;
  /** Quanti giorni, nell'intero periodo, hanno superato la soglia. */
  readonly giorni: number;
  /** In quanti anni distinti è successo almeno una volta. */
  readonly anniConEvento: number;
  /** Il valore peggiore registrato, con la sua unità. */
  readonly massimo: string;
}

export interface StoricoMeteo {
  readonly anni: number;
  readonly dal: string;
  readonly al: string;
  readonly soglie: readonly SogliaSuperata[];
  readonly fonte: string;
  /**
   * I fenomeni che questa fonte **non** copre.
   *
   * Va stampato accanto ai dati, sempre. Un capitolo intitolato «storico degli eventi
   * atmosferici» che tace di non contenere grandine e fulmini fa concludere a chi legge
   * che su quel punto non ne siano mai caduti — che è esattamente l'opposto di ciò che i
   * dati dicono, cioè nulla.
   */
  readonly fenomeniNonCoperti: readonly string[];
}

export interface ContestoTerritoriale {
  readonly vigiliDelFuoco: readonly CasermaVigiliDelFuoco[];
  readonly attivitaVicine: readonly PuntoDiInteresse[];
  /** Impronta a terra dei fabbricati entro pochi metri dalla coordinata. */
  readonly fabbricati: ImprontaFabbricati | null;
  /** Serie storica degli eventi atmosferici sul punto. `null` se non raccolta. */
  readonly meteo: StoricoMeteo | null;
  /** Quante fra le vicine aggravano il rischio: è il numero che va in prima pagina. */
  readonly attivitaCheAggravano: number;
  readonly raggioAnalizzatoMetri: number;
  /**
   * Da dove viene il dato, in chiaro.
   *
   * Non è cortesia: la fonte oggi è OpenStreetMap, rilasciata con licenza **ODbL**, che
   * obbliga chi la mostra ad attribuirla. Il campo viaggia con il dato proprio perché
   * l'attribuzione non possa essere dimenticata da chi costruisce la pagina.
   */
  readonly fonte: string;
}

/**
 * La copertura della fonte **non è uniforme**: una caserma non mappata non significa che
 * non esista. Per questo il contesto non viene mai usato per *escludere* un rischio —
 * solo per segnalarlo — e ogni sezione che lo mostra accompagna il dato con questa
 * avvertenza.
 */
export const AVVERTENZA_CONTESTO =
  'Dati collaborativi: la copertura non è uniforme e un’attività non mappata può comunque esistere. ' +
  'L’assenza di segnalazioni non equivale a un’assenza di rischio.';
