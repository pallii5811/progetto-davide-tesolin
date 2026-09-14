import type { ExposureLevel } from './geo.js';

/**
 * Pericolosità idraulica e da frana del comune, dagli indicatori ISPRA.
 *
 * ── COSA MISURA DAVVERO ──────────────────────────────────────────────────────
 *
 * IdroGEO pubblica, per ciascuno dei 7.899 comuni italiani, quanta parte del territorio e
 * **quante imprese** ricadono in ciascuna classe di pericolosità. Qui si usano le imprese,
 * non il territorio, e la ragione è che le imprese non stanno sparse a caso: stanno nei
 * fondovalle e nelle pianure, cioè dove l'acqua arriva. Un comune con il 2 % del territorio
 * in pericolosità elevata può avere il 30 % delle imprese dentro quel 2 %, e rispondere
 * «due per cento» sarebbe vero e fuorviante.
 *
 * ── CHE COSA È MISURA E CHE COSA È CONVENZIONE ───────────────────────────────
 *
 * La **percentuale è il dato**: viene da ISPRA, è verificabile, e la scheda la stampa. Le
 * tre parole — alta, media, bassa — sono una **convenzione di questo prodotto**, scelta per
 * poter mettere l'esposizione idraulica accanto a quella sismica in una tabella leggibile.
 * Non esiste una soglia di legge che dica «oltre il quindici per cento è alta»: le soglie
 * qui sotto sono dichiarate, non derivate, e chi le cambia cambia una convenzione nostra,
 * non un fatto.
 *
 * Per questo ogni frase composta qui porta il numero accanto alla parola. Un lettore che
 * non condivide la soglia vede comunque la misura e si fa la propria idea.
 *
 * ── IL LIMITE, DETTO E NON AGGIRATO ──────────────────────────────────────────
 *
 * È un dato **comunale**. Dice quanto del comune è esposto, non se quel capannone lo è. La
 * verifica sull'indirizzo resta necessaria dove la decisione pesa, e la scheda lo dichiara
 * accanto al numero invece di lasciar credere che l'abbia già fatta.
 */

/**
 * I sei numeri per comune, tutti percentuali, come li dà IdroGEO.
 *
 * `null` dove IdroGEO non pubblica il dato: lo segnala con −1, e al 14/09/2026 manca la quota di
 * imprese in pericolosità idraulica elevata in 311 comuni su 7.899.
 *
 * LA QUOTA MEDIA COMPRENDE L'ELEVATA. Le aree a pericolosità media sono lo scenario meno frequente
 * e più esteso, e contengono quelle a pericolosità elevata: la quota «media» conta anche le imprese
 * in area elevata. Misurato sull'archivio il 14/09/2026: in nessun comune l'elevata supera la
 * media, né per il territorio né per le imprese, e in 180 comuni la somma delle due supera il 100 %.
 */
export interface IndicatoriIdrogeo {
  /** Territorio in pericolosità idraulica elevata (P3) e media o elevata (P2). */
  readonly idrA: number | null;
  readonly idrM: number | null;
  /** Imprese in pericolosità idraulica elevata, e media o elevata. */
  readonly impIdrA: number | null;
  readonly impIdrM: number | null;
  /** Territorio e imprese in pericolosità da frana elevata e molto elevata (P3+P4). */
  readonly frnA: number | null;
  readonly impFrnA: number | null;
}

/**
 * Le soglie, dichiarate.
 *
 * Alta: più di un'impresa su sette in area a pericolosità elevata, oppure più di due su
 * cinque contando anche la media. Media: una su trenta in elevata, oppure una su sette
 * contando la media. Sotto: bassa, che qui significa «misurata bassa», non «non guardata».
 *
 * Sono numeri scelti, non trovati. La ragione della forma a due condizioni è che un comune
 * può essere esposto in due modi diversi — una piccola area molto pericolosa dove però
 * stanno le fabbriche, oppure una grande area mediamente pericolosa — e una soglia sola ne
 * vedrebbe uno e mancherebbe l'altro.
 */
const SOGLIE = {
  altaElevata: 15,
  altaCumulata: 40,
  mediaElevata: 3,
  mediaCumulata: 15,
} as const;

export function livelloIdraulico(ind: IndicatoriIdrogeo): ExposureLevel | null {
  /*
    La quota «cumulata» è la quota media, NON la somma delle due.

    Qui c'era impIdrA + impIdrM, cioè le imprese in area elevata contate due volte, perché la quota
    media le comprende già. Su 7.899 comuni la somma spingeva 46 comuni da media ad alta e 6 da
    bassa a media: a Ozegna il 12,5 % in elevata e il 29,9 % in media davano 42,4 %, «alta».

    E un dato mancante non è un numero. Con la quota elevata non pubblicata il livello si decide
    solo quando è certo: sopra il 40 % di media è alta comunque, sotto il 3 % di media anche
    l'elevata — che vi è compresa — sta sotto il 3 %, ed è bassa. Negli altri casi non si sa, e
    il livello è null.
  */
  const elevata = ind.impIdrA;
  const mediaOElevata = ind.impIdrM;
  if (elevata !== null && mediaOElevata !== null) {
    if (elevata >= SOGLIE.altaElevata || mediaOElevata >= SOGLIE.altaCumulata) return 'alta';
    if (elevata >= SOGLIE.mediaElevata || mediaOElevata >= SOGLIE.mediaCumulata) return 'media';
    return 'bassa';
  }
  if (mediaOElevata !== null) {
    if (mediaOElevata >= SOGLIE.altaCumulata) return 'alta';
    if (mediaOElevata < SOGLIE.mediaElevata) return 'bassa';
    return null;
  }
  if (elevata !== null && elevata >= SOGLIE.altaElevata) return 'alta';
  return null;
}

/**
 * Le frane hanno una sola classe aggregata, e va trattata con la sua soglia.
 *
 * IdroGEO somma P3 e P4 — elevata e molto elevata — in un unico indicatore. Non c'è la
 * media da cumulare, quindi la soglia doppia non si applica e le soglie sono più basse: in
 * una frana non ci si entra per caso, e una impresa su venti in area a pericolosità elevata
 * è già una popolazione a rischio, non un caso limite.
 */
export function livelloFrana(ind: IndicatoriIdrogeo): ExposureLevel | null {
  // Una quota non pubblicata non è «bassa»: non si sa.
  if (ind.impFrnA === null) return null;
  if (ind.impFrnA >= 10) return 'alta';
  if (ind.impFrnA >= 2) return 'media';
  return 'bassa';
}

/**
 * Una percentuale come la legge un italiano: un decimale, e nessuno quando e' inutile.
 *
 * Il decimale resta anche sopra il dieci per cento. Toglierlo la' — «18 %» invece di
 * «18,4 %» — sembrava una semplificazione innocua, ma questo numero e' IL dato, e la parola
 * accanto e' solo una convenzione: chi non condivide la soglia si fa l'idea sul numero, e
 * il numero deve arrivargli come ISPRA lo pubblica.
 */
function percento(valore: number): string {
  const arrotondato = Math.round(valore * 10) / 10;
  return `${String(arrotondato).replace('.', ',')} %`;
}

/**
 * Le frasi per la scheda, composte dai valori.
 *
 * Ognuna porta la percentuale accanto alla parola, perché la parola è una convenzione e la
 * percentuale è il dato. Quando la quota è zero la frase lo dice come misura — «nessuna
 * impresa del comune» — e non come assenza di informazione: sono due cose diverse, e qui è
 * il primo caso.
 */
export function frasiIdrogeo(ind: IndicatoriIdrogeo, comune: string): readonly string[] {
  const frasi: string[] = [];

  /*
    La quota media comprende l'elevata: si dice «media o elevata», perché è quello che conta. E
    se la media è zero lo è anche l'elevata, pubblicata o no: in 132 comuni ISPRA non pubblica
    l'elevata e la media è 0 %, e lì «ISPRA non pubblica la quota della sola elevata» sarebbe
    un'avvertenza su un numero che si conosce già.
  */
  const nessunaIdraulica = ind.impIdrM === 0 && (ind.impIdrA === 0 || ind.impIdrA === null);
  frasi.push(
    nessunaIdraulica
      ? `Alluvioni: nessuna impresa di ${comune} risulta in area a pericolosità idraulica mappata.`
      : ind.impIdrM === null
        ? ind.impIdrA === null
          ? `Alluvioni: ISPRA non pubblica la quota di imprese di ${comune} in area a pericolosità idraulica.`
          : `Alluvioni: ${percento(ind.impIdrA)} delle imprese di ${comune} è in area a pericolosità ` +
            'elevata; ISPRA non pubblica la quota in area media o elevata.'
        : ind.impIdrA === null
          ? `Alluvioni: ${percento(ind.impIdrM)} delle imprese di ${comune} è in area a pericolosità ` +
            'media o elevata; ISPRA non pubblica la quota della sola elevata.'
          : `Alluvioni: ${percento(ind.impIdrA)} delle imprese di ${comune} è in area a pericolosità ` +
            `elevata, ${percento(ind.impIdrM)} in area a pericolosità media o elevata.`,
  );

  frasi.push(
    ind.impFrnA === 0
      ? `Frane: nessuna impresa di ${comune} risulta in area a pericolosità da frana elevata.`
      : ind.impFrnA === null
        ? `Frane: ISPRA non pubblica la quota di imprese di ${comune} in area a pericolosità da frana.`
        : `Frane: ${percento(ind.impFrnA)} delle imprese di ${comune} è in area a pericolosità da ` +
          `frana elevata o molto elevata.`,
  );

  /*
    Il limite si ripete qui e non solo in fondo alla sezione.

    Chi legge una riga sola — perché sta cercando quel numero, non l'intera pagina — deve
    trovarci accanto ciò che quel numero non dice. Una nota in fondo alla pagina la legge
    chi ha già finito di farsi l'idea sbagliata.
  */
  frasi.push(
    'È il dato del comune, non della sede: dice quante imprese del territorio sono esposte, ' +
      'non se lo è questa. Dove la decisione pesa, la verifica sull’indirizzo resta necessaria.',
  );

  return frasi;
}
