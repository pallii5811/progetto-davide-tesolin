/**
 * Lo schema di calcolo del margine di contribuzione, voce per voce.
 *
 * Il margine di contribuzione è la base della somma assicuranda per i danni indiretti: è
 * quanto l'imprenditore continua a dover versare in azienda quando l'attività si ferma, e
 * quindi quanto una polizza *business interruption* deve poter restituire.
 *
 * Il numero da solo non basta. Chi lo riceve — l'imprenditore, il suo commercialista, un
 * assuntore — deve poter vedere **da quali voci di bilancio nasce** e soprattutto **quale
 * quota di ciascuna è stata considerata variabile**, perché è lì che sta il giudizio: i
 * costi per servizi non sono variabili al cento per cento, e la percentuale scelta sposta
 * il capitale da assicurare di decine di migliaia di euro.
 *
 * Uno schema che mostra solo il risultato chiede di fidarsi. Uno che mostra le righe si
 * lascia discutere — ed è l'unico che regge davanti a un commercialista che chiede conto.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { BilancioRiclassificato } from './financials.js';

export interface RigaSchemaMargine {
  readonly voce: string;
  /** L'importo a bilancio, prima di qualunque quota. */
  readonly importoDiBilancio: Euro;
  /**
   * Quota considerata **variabile**, cioè che si azzera con l'attività.
   *
   * `null` per le voci che entrano per intero, in positivo o in negativo: dichiararla
   * come «100%» o «0%» suggerirebbe una scelta dove non ce n'è stata nessuna.
   */
  readonly quotaVariabile: number | null;
  /** Quanto quella riga sposta il margine. Negativo per i costi. */
  readonly effetto: Euro;
  readonly motivazione: string;
}

export interface SchemaMargineDiContribuzione {
  readonly righe: readonly RigaSchemaMargine[];
  readonly margineDiContribuzione: Euro;
  /** Il margine sui ricavi: dice quanto dell'incasso resta per coprire i costi fissi. */
  readonly incidenzaSuRicavi: number | null;
}

/**
 * Compone lo schema a partire dal bilancio riclassificato.
 *
 * Le quote sono quelle effettivamente usate nel calcolo, non valori d'esempio: si leggono
 * dal bilancio riclassificato, che le ha già applicate. Mostrare una quota diversa da
 * quella impiegata sarebbe peggio che non mostrarla.
 */
export function componiSchemaMargine(bilancio: BilancioRiclassificato): SchemaMargineDiContribuzione {
  const { ce, origine } = bilancio;
  const c = origine.contoEconomico;

  /*
    I consumi si ottengono **sommando** la variazione delle rimanenze di materie prime,
    non sottraendola: la variazione è già espressa con il segno contabile — negativa
    quando il magazzino cresce, perché quella parte è stata acquistata e non consumata.
    Invertire il segno gonfiava i consumi e sballava lo schema di settantamila euro.
  */
  const consumi = Money.add(c.costiMateriePrime, c.variazioneRimanenzeMateriePrime);

  /*
    La quota variabile dei servizi si **ricava dal risultato**, non si riapplica.

    Riimplementare la formula qui significava che bastava passare una quota diversa da
    quella usata nella riclassificazione perché lo schema smettesse di quadrare, senza che
    nulla lo segnalasse. Uno schema di calcolo che non torna con il proprio totale è
    peggio di nessuno schema: chi lo verifica trova una differenza e smette di fidarsi di
    tutto il documento.

    Derivandola per differenza, lo schema quadra **per costruzione** con qualunque
    parametrizzazione, presente o futura.
  */
  const valoreDellaProduzione = Money.add(c.ricaviVendite, c.variazioneRimanenzeProdotti, c.altriRicavi);
  const serviziVariabili = Money.max(
    Money.ZERO,
    Money.subtract(Money.subtract(valoreDellaProduzione, consumi), ce.margineDiContribuzione),
  );
  const quotaServiziVariabile =
    Money.toEuro(c.costiServizi) === 0 ? 0 : Money.toEuro(serviziVariabili) / Money.toEuro(c.costiServizi);

  const righe: readonly RigaSchemaMargine[] = [
    {
      voce: 'Ricavi delle vendite e delle prestazioni',
      importoDiBilancio: c.ricaviVendite,
      quotaVariabile: null,
      effetto: c.ricaviVendite,
      motivazione: 'Voce A1 del conto economico: è ciò che l’attività genera.',
    },
    {
      voce: 'Variazione delle rimanenze di prodotti',
      importoDiBilancio: c.variazioneRimanenzeProdotti,
      quotaVariabile: null,
      effetto: c.variazioneRimanenzeProdotti,
      motivazione:
        'Produzione realizzata e non ancora venduta: fa parte del valore prodotto nell’esercizio.',
    },
    {
      voce: 'Altri ricavi e proventi',
      importoDiBilancio: c.altriRicavi,
      quotaVariabile: null,
      effetto: c.altriRicavi,
      motivazione: 'Voce A5: concorre al valore della produzione.',
    },
    {
      voce: 'Materie prime, sussidiarie e di consumo',
      importoDiBilancio: consumi,
      quotaVariabile: 1,
      effetto: Money.multiply(consumi, -1),
      motivazione:
        'Interamente variabili: al fermo dell’attività cessano. Comprensivi della variazione ' +
        'delle rimanenze di materie prime, che distingue l’acquistato dal consumato.',
    },
    {
      voce: 'Costi per servizi',
      importoDiBilancio: c.costiServizi,
      quotaVariabile: quotaServiziVariabile,
      effetto: Money.multiply(serviziVariabili, -1),
      motivazione:
        `Variabili per il ${Math.round(quotaServiziVariabile * 100)}%: la quota restante ` +
        '— utenze di base, canoni, consulenze continuative — resta dovuta anche a stabilimento fermo.',
    },
    {
      voce: 'Costo del personale',
      importoDiBilancio: Money.add(c.salariStipendi, c.oneriSocialiEAltri),
      quotaVariabile: 0,
      effetto: Money.ZERO,
      motivazione:
        'Considerato interamente fisso: in un fermo il personale va retribuito, ed è proprio ' +
        'il costo che la garanzia danni indiretti deve coprire.',
    },
    {
      voce: 'Godimento di beni di terzi',
      importoDiBilancio: c.costiGodimentoBeniTerzi,
      quotaVariabile: 0,
      effetto: Money.ZERO,
      motivazione: 'Canoni di locazione e leasing: dovuti indipendentemente dall’operatività.',
    },
  ];

  const ricavi = Money.toEuro(ce.ricavi);

  return {
    righe,
    margineDiContribuzione: ce.margineDiContribuzione,
    incidenzaSuRicavi: ricavi === 0 ? null : Money.toEuro(ce.margineDiContribuzione) / ricavi,
  };
}
