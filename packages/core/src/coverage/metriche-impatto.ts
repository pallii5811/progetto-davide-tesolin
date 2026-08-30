/**
 * Quale impatto economico è in grado di mettere in crisi l'impresa.
 *
 * È la domanda che precede ogni scelta assicurativa consapevole, e la capacità di
 * ritenzione — un numero solo — non la risponde: dice quanto l'impresa **regge**, non a
 * che punto comincia a soffrire, né a che punto smette di esistere. Fra i due estremi ci
 * sono due gradini che cambiano la conversazione con il cliente.
 *
 * Qui l'impatto è una **scala di quattro fasce**, ognuna ancorata a una grandezza diversa
 * del bilancio, e ognuna tradotta in **giorni di fermo attività equivalenti** — che è il
 * modo in cui un imprenditore capisce davvero un numero. «Duecentomila euro» è astratto;
 * «ventitré giorni fermo» no.
 *
 * Serve anche a due doveri cogenti degli amministratori, che vanno citati perché sono la
 * ragione per cui il documento ha valore oltre la vendita:
 *
 *  - la diligenza richiesta dalla natura dell'incarico (artt. 2392 e 2476 c.c.);
 *  - l'obbligo di assetti organizzativi adeguati alla continuità aziendale — il
 *    *going concern* dell'art. 2086 c.c., come riformato dal Codice della crisi
 *    (D.Lgs. 14/2019) e dal D.Lgs. 83/2022, che chiede di verificare le prospettive di
 *    continuità **almeno per i dodici mesi successivi**.
 *
 * Le soglie non sono inventate: ciascuna ha un ancoraggio dichiarato, e la più grave ha un
 * ancoraggio **di legge**.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import type { BilancioRiclassificato } from '../company/financials.js';

export type LivelloDiImpatto = 'trascurabile' | 'gestibile' | 'grave' | 'critico';

export interface FasciaDiImpatto {
  readonly livello: LivelloDiImpatto;
  readonly etichetta: string;
  readonly descrizione: string;
  readonly importo: Euro;
  /**
   * A quanti giorni di fermo totale corrisponde quell'importo.
   *
   * `null` quando il margine di contribuzione non è ricavabile: senza, il rapporto sarebbe
   * una divisione per un numero inventato.
   */
  readonly giorniDiFermoEquivalenti: number | null;
  /** Su quale grandezza di bilancio è ancorata la soglia. */
  readonly ancoraggio: string;
}

export interface MetricheDiImpatto {
  readonly fasce: readonly FasciaDiImpatto[];
  /**
   * Capacità di far fronte alle passività correnti con liquidità e crediti a breve.
   * Negativo significa che l'impresa dipende dalle rimanenze per pagare i debiti a breve.
   */
  readonly margineDiTesoreria: Euro;
  /** Attivo corrente su passivo corrente. Ottimo sopra 1,2; critico sotto 0,5. */
  readonly indiceDiDisponibilita: number | null;
  /**
   * Quanto l'impresa perde per ogni giorno di fermo totale.
   *
   * È il margine di contribuzione annuo diviso i giorni di operatività: il denaro che
   * l'imprenditore continua a versare in azienda senza produrre nulla. È il numero che
   * rende concreta la garanzia danni indiretti, e quasi nessuno lo mostra.
   */
  readonly margineDiContribuzioneGiornaliero: Euro | null;
}

/**
 * Giorni di operatività in un anno.
 *
 * Duecentoventi: le giornate lavorative effettive di un'impresa italiana, al netto di
 * festività e chiusure. Usare 365 diluirebbe il margine giornaliero di un terzo e
 * sottostimerebbe la perdita di ogni giorno di fermo.
 */
const GIORNI_OPERATIVI = 220;

/**
 * Le quattro soglie.
 *
 * Ognuna guarda una grandezza diversa, perché un impatto colpisce l'impresa in punti
 * diversi a seconda di quanto è grande:
 *
 *  - la **cassa** decide cosa si paga domani senza chiedere niente a nessuno;
 *  - il **risultato operativo** decide cosa si riassorbe entro l'esercizio;
 *  - il **patrimonio** decide cosa intacca il capitale;
 *  - il **capitale sociale** decide, per legge, quando l'assemblea va convocata.
 */
const QUOTA_LIQUIDITA_TRASCURABILE = 0.2;
const QUOTA_EBITDA_GESTIBILE = 0.5;
const QUOTA_PATRIMONIO_GRAVE = 0.2;

export function calcolaMetricheDiImpatto(
  bilancio: BilancioRiclassificato,
  /** Dal bilancio non riclassificato: la riclassificazione non conserva il capitale sociale. */
  capitaleSociale: Euro = Money.ZERO,
): Explained<MetricheDiImpatto> {
  const { sp, ce } = bilancio;

  const margineDiTesoreria = Money.subtract(
    Money.add(sp.liquiditaImmediate, sp.liquiditaDifferite),
    sp.passivoCorrente,
  );

  const indiceDiDisponibilita =
    Money.toEuro(sp.passivoCorrente) === 0
      ? null
      : Money.toEuro(sp.attivoCorrente) / Money.toEuro(sp.passivoCorrente);

  const margineAnnuo = ce.margineDiContribuzione;
  const margineGiornaliero =
    Money.toEuro(margineAnnuo) === 0 ? null : Money.euro(Money.toEuro(margineAnnuo) / GIORNI_OPERATIVI);

  const giorni = (importo: Euro): number | null =>
    margineGiornaliero === null || Money.toEuro(margineGiornaliero) === 0
      ? null
      : Math.round(Money.toEuro(importo) / Money.toEuro(margineGiornaliero));

  const grezze: readonly Omit<FasciaDiImpatto, 'giorniDiFermoEquivalenti'>[] = [
    {
      livello: 'trascurabile',
      etichetta: 'Trascurabile',
      descrizione:
        'Impatto che l’impresa gestisce con la propria liquidità senza particolari problemi. ' +
        'È il valore da cui partire per ragionare su una franchigia frontale coerente.',
      importo: Money.multiply(sp.liquiditaImmediate, QUOTA_LIQUIDITA_TRASCURABILE),
      ancoraggio: `${Math.round(QUOTA_LIQUIDITA_TRASCURABILE * 100)}% delle disponibilità liquide`,
    },
    {
      livello: 'gestibile',
      etichetta: 'Gestibile',
      descrizione:
        'Impatto di rilievo che non pregiudica l’equilibrio economico: si riassorbe con il ' +
        'risultato di un esercizio, comprimendo margine e investimenti.',
      importo: Money.multiply(Money.max(Money.ZERO, ce.ebitda), QUOTA_EBITDA_GESTIBILE),
      ancoraggio: `${Math.round(QUOTA_EBITDA_GESTIBILE * 100)}% dell’EBITDA`,
    },
    {
      livello: 'grave',
      etichetta: 'Grave',
      descrizione:
        'Impatto che intacca il capitale e mette in crisi la liquidità: una minaccia ' +
        'concreta all’equilibrio finanziario e alla continuità operativa.',
      importo: Money.multiply(Money.max(Money.ZERO, sp.patrimonioNetto), QUOTA_PATRIMONIO_GRAVE),
      ancoraggio: `${Math.round(QUOTA_PATRIMONIO_GRAVE * 100)}% del patrimonio netto`,
    },
    {
      livello: 'critico',
      /*
        L'unica soglia con un ancoraggio **di legge** — e la sostanza è la stessa per tutte
        le società di capitali, mentre gli articoli no.

        La perdita che riduce il capitale di oltre un terzo obbliga a convocare l'assemblea,
        e la discesa sotto il minimo legale impone la ricapitalizzazione o la trasformazione.
        Ma la norma che lo dispone è l'art. 2446 per la S.p.A. e l'art. 2482-bis per la
        S.r.l.; l'art. 2447 e l'art. 2482-ter reggono la seconda ipotesi. Il prodotto citava
        solo la prima coppia, a chiunque: cioè le norme della S.p.A. alla forma giuridica
        della quasi totalità del portafoglio di un intermediario italiano.

        Qui la frase nomina il fatto — l'obbligo di riduzione del capitale per perdite — e
        gli articoli stanno fra i riferimenti, entrambe le coppie, ciascuna con la sua forma.
        È la stessa scelta già fatta due righe più in basso per «artt. 2392 e 2476 c.c.».

        Quando il capitale sociale non è noto si ripiega sul patrimonio netto: lì di
        obblighi societari non si parla affatto, perché la soglia non è più quella di legge.
      */
      etichetta: 'Critico',
      descrizione:
        Money.toEuro(capitaleSociale) > 0
          ? 'Impatto non gestibile in autonomia: erode il patrimonio fino a far scattare gli ' +
            'obblighi di riduzione del capitale per perdite previsti dal codice civile per la ' +
            'forma giuridica dell’impresa. I rischi di questa magnitudo vanno trasferiti in via ' +
            'prioritaria.'
          : 'Impatto non gestibile in autonomia: erode il patrimonio in misura tale da ' +
            'comprometterne l’equilibrio e la continuità operativa. I rischi di questa magnitudo ' +
            'vanno trasferiti in via prioritaria.',
      importo: sogliaCritica(capitaleSociale, sp.patrimonioNetto),
      ancoraggio:
        Money.toEuro(capitaleSociale) > 0
          ? 'perdita che porta il patrimonio sotto i due terzi del capitale sociale'
          : '50% del patrimonio netto (capitale sociale non disponibile)',
    },
  ];

  /*
    La scala dev'essere crescente, e su bilanci reali non lo è sempre.

    Un'impresa con molta cassa e poco patrimonio può avere una soglia «trascurabile» più
    alta della «grave». Presentare una scala che non sale è peggio che non presentarla:
    chi legge conclude che il calcolo è sbagliato, e ha ragione.

    Si impone quindi la monotonia verso l'alto, conservando l'ancoraggio di ciascuna: la
    fascia dice comunque su cosa è calcolata, e chi vuole verificarla può farlo.
  */
  let precedente = 0;
  const fasce: FasciaDiImpatto[] = grezze.map((f) => {
    const valore = Math.max(Money.toEuro(f.importo), precedente * 1.5);
    precedente = valore;
    const importo = Money.euro(Math.round(valore));
    return { ...f, importo, giorniDiFermoEquivalenti: giorni(importo) };
  });

  const metriche: MetricheDiImpatto = {
    fasce,
    margineDiTesoreria,
    indiceDiDisponibilita,
    margineDiContribuzioneGiornaliero: margineGiornaliero,
  };

  return explain('Metriche di impatto economico')
    .formula(
      'Quattro soglie ancorate a liquidità, EBITDA, patrimonio netto e capitale sociale, ' +
        'convertite in giorni di fermo attività al margine di contribuzione giornaliero',
    )
    .input('Disponibilità liquide', Money.format(sp.liquiditaImmediate))
    .input('EBITDA', Money.format(ce.ebitda))
    .input('Patrimonio netto', Money.format(sp.patrimonioNetto))
    .input('Capitale sociale', Money.format(capitaleSociale))
    .input('Margine di contribuzione annuo', Money.format(margineAnnuo))
    .input(
      'Margine di contribuzione giornaliero',
      margineGiornaliero === null ? 'non ricavabile' : Money.format(margineGiornaliero),
    )
    .input('Margine di tesoreria', Money.format(margineDiTesoreria))
    .input(
      'Indice di disponibilità',
      indiceDiDisponibilita === null ? 'da rilevare in intervista' : indiceDiDisponibilita.toFixed(2),
    )
    .note(
      `I giorni di fermo si ricavano dividendo l’impatto per il margine di contribuzione ` +
        `giornaliero, calcolato su ${GIORNI_OPERATIVI} giorni operativi l’anno: è il denaro ` +
        'che l’impresa continua a versare mentre non produce.',
    )
    .note(
      'Esprimono un intervallo entro cui l’impresa può ragionevolmente sostenersi dopo un ' +
        'fermo produttivo totale. Non tengono conto di effetti di medio periodo come la ' +
        'perdita definitiva di clienti chiave o le conseguenze reputazionali.',
    )
    .noteIf(
      Money.toEuro(capitaleSociale) > 0,
      'La soglia critica è l’unica ancorata a una norma: oltre, non si tratta più di un ' +
        'danno grande ma di un procedimento societario che gli amministratori hanno il ' +
        'dovere di prevenire. Gli articoli applicabili dipendono dalla forma giuridica: ' +
        'artt. 2446 e 2447 c.c. per la società per azioni, artt. 2482-bis e 2482-ter c.c. ' +
        'per la società a responsabilità limitata.',
    )
    .noteIf(
      Money.toEuro(capitaleSociale) <= 0,
      'Capitale sociale non disponibile: la soglia critica ripiega sul patrimonio netto ed è ' +
        'quindi indicativa, non ancorata alla norma sulla riduzione del capitale per perdite.',
    )
    .noteIf(
      Money.toEuro(margineDiTesoreria) < 0,
      'Margine di tesoreria negativo: senza smobilizzare le rimanenze l’impresa non copre i ' +
        'debiti a breve. Un sinistro che blocchi il magazzino colpisce due volte.',
    )
    .reference(
      'Riduzione del capitale per perdite: artt. 2446 e 2447 c.c. (società per azioni) · ' +
        'artt. 2482-bis e 2482-ter c.c. (società a responsabilità limitata)',
    )
    .reference('Art. 2086 c.c. — assetti adeguati e continuità aziendale')
    .reference('Artt. 2392 e 2476 c.c. — diligenza degli amministratori')
    .reference('D.Lgs. 14/2019 e D.Lgs. 83/2022 — Codice della crisi d’impresa')
    .value(metriche);
}

/**
 * La soglia oltre cui scattano gli obblighi societari.
 *
 * Il patrimonio netto sceso sotto i due terzi del capitale sociale è la condizione
 * dell'art. 2446 c.c.: la perdita che ci arriva è quindi la differenza fra il patrimonio
 * attuale e quella soglia.
 */
function sogliaCritica(capitaleSociale: Euro, patrimonioNetto: Euro): Euro {
  const capitale = Money.toEuro(capitaleSociale);
  const patrimonio = Money.toEuro(patrimonioNetto);

  if (capitale <= 0 || patrimonio <= 0) {
    return Money.euro(Math.max(0, patrimonio * 0.5));
  }

  const soglia = (capitale * 2) / 3;
  // Un patrimonio già sotto la soglia significa che l'impresa è **già** nella condizione
  // dell'art. 2446: qualunque perdita ulteriore è critica, e la si dichiara tale.
  return Money.euro(Math.max(0, Math.round(patrimonio - soglia)));
}
