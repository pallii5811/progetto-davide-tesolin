/**
 * Il titolare effettivo, ricavato da ciò che si è già comprato.
 *
 * L'obbligo è dell'art. 20 del D.Lgs. 231/2007: un intermediario assicurativo deve
 * identificare la persona fisica che in ultima istanza possiede o controlla il cliente.
 * OpenAPI vende una visura apposta — `IT-ubo`, **1,10 € a chiamata** — e la tentazione è
 * chiamarla sempre.
 *
 * ## Perché quasi sempre non serve
 *
 * L'anagrafica estesa che ogni analisi acquista già (**0,10 €**) contiene i soci con nome,
 * cognome, codice fiscale e quota. Quando i soci sono **persone fisiche**, il titolare
 * effettivo è già lì: comprarlo una seconda volta a undici volte il prezzo è buttare
 * denaro.
 *
 * Serve davvero in un caso solo, ed è il caso in cui i soci sono **società**: lì l'elenco
 * dei soci dà la holding, non la persona. Anche allora, però, prima di spendere 1,10 € si
 * può risalire la catena con un'altra anagrafica estesa a 0,10 €.
 *
 * ## Cosa questo modulo fa, e cosa non può fare
 *
 * Applica i criteri dell'art. 20 nell'ordine che la norma stessa impone:
 *
 *  1. **assetto proprietario**: partecipazione superiore al 25%;
 *  2. **controllo con altri mezzi**, quando il primo criterio non individua nessuno;
 *  3. **criterio residuale**: chi ha poteri di rappresentanza o amministrazione.
 *
 * **Non sostituisce la visura sul registro dei titolari effettivi.** Il registro è la fonte
 * a cui la norma dà valore, e per il fascicolo antiriciclaggio può servire quella. Questo
 * modulo dice chi è, con quale criterio e con quanta certezza — e dichiara apertamente
 * quando la catena non si chiude e la visura va comprata. La differenza fra «ricavato dai
 * soci» e «risultante dal registro» è scritta nel risultato, perché davanti a un'ispezione
 * è tutto.
 */

import type { Confidence } from '../shared/provenance.js';
import type { AssettoProprietario, SocioDiRilievo } from './assetto.js';

/** Soglia dell'art. 20 c. 2: partecipazione superiore al 25% del capitale. */
export const SOGLIA_PARTECIPAZIONE = 25;

export type CriterioTitolarita =
  'partecipazione' | 'controllo' | 'residuale-amministratore' | 'non-determinato';

export interface TitolareEffettivo {
  readonly nominativo: string;
  readonly codiceFiscale: string | null;
  readonly quotaPercentuale: number | null;
  readonly criterio: CriterioTitolarita;
  /** Perché è stato individuato, in chiaro: va stampato accanto al nome. */
  readonly motivazione: string;
}

export interface AnalisiTitolareEffettivo {
  readonly titolari: readonly TitolareEffettivo[];
  /**
   * `true` quando la catena si chiude su persone fisiche con i dati già disponibili.
   *
   * Quando è `false` la visura sul registro serve davvero, e il prodotto lo dice invece di
   * lasciare che qualcuno la compri per sicurezza — o peggio, che non la compri affatto.
   */
  readonly catenaChiusa: boolean;
  /** Le società che interrompono la catena: vanno risalite o si compra la visura. */
  readonly daRisalire: readonly SocioDiRilievo[];
  readonly confidenza: Confidence;
  /** Cosa fare adesso, in una riga. È la parte che evita la spesa inutile. */
  readonly azione: string;
  readonly note: readonly string[];
}

/**
 * Ricava il titolare effettivo dall'assetto già analizzato.
 *
 * Non fa rete e non spende: lavora sui soci che l'anagrafica estesa ha già portato.
 */
export function analizzaTitolareEffettivo(assetto: AssettoProprietario): AnalisiTitolareEffettivo {
  const note: string[] = [];

  if (assetto.soci.length === 0) {
    return {
      titolari: [],
      catenaChiusa: false,
      daRisalire: [],
      confidenza: 'bassa',
      azione:
        'Compagine sociale non disponibile: il titolare effettivo non è determinabile dai dati ' +
        'acquistati. Serve la visura sul registro dei titolari effettivi.',
      note: ['Nessun socio risulta dall’anagrafica: la catena non può nemmeno iniziare.'],
    };
  }

  /*
    Una compagine incompleta è un caso a sé.

    Se le quote note coprono meno del 99% del capitale, la persona sopra soglia potrebbe
    essere proprio quella che manca. Dichiararlo è l'unico modo di non far concludere a chi
    legge che i titolari siano solo quelli elencati.
  */
  if (!assetto.compagineCompleta) {
    note.push(
      'Le quote note non coprono l’intero capitale: un socio non elencato potrebbe superare ' +
        `il ${SOGLIA_PARTECIPAZIONE}% e non comparire qui.`,
    );
  }

  const fisiciSopraSoglia = assetto.soci.filter(
    (s) => s.tipo === 'persona-fisica' && (s.quotaPercentuale ?? 0) > SOGLIA_PARTECIPAZIONE,
  );

  const societaSopraSoglia = assetto.soci.filter(
    (s) => s.tipo === 'persona-giuridica' && (s.quotaPercentuale ?? 0) > SOGLIA_PARTECIPAZIONE,
  );

  // ── Primo criterio: partecipazione ────────────────────────────────────────
  if (fisiciSopraSoglia.length > 0 && societaSopraSoglia.length === 0) {
    return {
      titolari: fisiciSopraSoglia.map((s) => ({
        nominativo: s.denominazione,
        codiceFiscale: s.codiceFiscale,
        quotaPercentuale: s.quotaPercentuale,
        criterio: 'partecipazione' as const,
        motivazione:
          `Partecipazione del ${s.quotaPercentuale ?? 0}%, superiore alla soglia del ` +
          `${SOGLIA_PARTECIPAZIONE}% (art. 20 c. 2 D.Lgs. 231/2007).`,
      })),
      catenaChiusa: true,
      daRisalire: [],
      confidenza: assetto.compagineCompleta ? 'alta' : 'media',
      azione:
        'Titolare effettivo determinato dai soci già acquistati: la visura sul registro non è ' +
        'necessaria per identificarlo. Resta opportuna solo se il fascicolo antiriciclaggio ' +
        'richiede il documento del registro.',
      note,
    };
  }

  // ── La catena si interrompe su una società ────────────────────────────────
  if (societaSopraSoglia.length > 0) {
    const nomi = societaSopraSoglia.map((s) => s.denominazione).join(', ');
    const risalibili = societaSopraSoglia.filter((s) => s.codiceFiscale !== null);

    note.push(
      `La catena si interrompe su ${societaSopraSoglia.length === 1 ? 'una società' : 'più società'}: ` +
        'l’elenco dei soci restituisce la partecipante, non la persona fisica che vi sta sopra.',
    );

    return {
      titolari: fisiciSopraSoglia.map((s) => ({
        nominativo: s.denominazione,
        codiceFiscale: s.codiceFiscale,
        quotaPercentuale: s.quotaPercentuale,
        criterio: 'partecipazione' as const,
        motivazione: `Partecipazione diretta del ${s.quotaPercentuale ?? 0}%, sopra soglia.`,
      })),
      catenaChiusa: false,
      daRisalire: societaSopraSoglia,
      confidenza: 'media',
      /*
        L'azione consigliata mette il prezzo accanto all'alternativa, ed è deliberato:
        risalire la catena costa un'anagrafica estesa per gradino, cioè un decimo della
        visura. Su una catena di due società si spende ancora meno della metà.
      */
      azione:
        risalibili.length > 0
          ? `Risalire la catena analizzando ${nomi} (0,10 € per società, contro 1,10 € della ` +
            'visura sul registro). Se la catena resta aperta dopo due passaggi, o se il fascicolo ' +
            'richiede il documento del registro, allora la visura è giustificata.'
          : `Le società partecipanti (${nomi}) non hanno un codice fiscale utilizzabile: la catena ` +
            'non è risalibile dai dati acquistati e serve la visura sul registro.',
      note,
    };
  }

  // ── Secondo criterio: controllo con altri mezzi ───────────────────────────
  if (assetto.capogruppo !== null) {
    note.push(
      'Nessun socio supera la soglia di partecipazione: si applica il criterio del controllo ' +
        '(art. 20 c. 3), che i soli dati camerali non permettono di accertare.',
    );
  }

  // ── Criterio residuale ────────────────────────────────────────────────────
  /*
    Il criterio residuale è l'ultima spiaggia della norma, e va dichiarato come tale.

    Indicare l'amministratore come titolare effettivo quando la proprietà è frammentata è
    ciò che la legge prevede — ma è anche l'esito che un'ispezione guarda con più
    attenzione, perché è quello che si produce anche quando semplicemente non si è
    cercato abbastanza. Scriverlo esplicitamente protegge chi ha fatto il lavoro.
  */
  const amministratori = assetto.personeChiave;
  if (amministratori.length > 0) {
    return {
      titolari: amministratori.map((p) => ({
        nominativo: p.denominazione,
        codiceFiscale: p.codiceFiscale,
        quotaPercentuale: p.quotaPercentuale,
        criterio: 'residuale-amministratore' as const,
        motivazione:
          'Nessun socio supera la soglia di partecipazione e non risulta un controllo di fatto: ' +
          'si applica il criterio residuale dei poteri di amministrazione (art. 20 c. 5).',
      })),
      catenaChiusa: false,
      daRisalire: [],
      confidenza: 'bassa',
      azione:
        'Individuazione per criterio residuale: è l’esito più esposto a contestazione. La visura ' +
        'sul registro dei titolari effettivi (1,10 €) è qui giustificata, perché è l’unica che ' +
        'dà un riscontro documentale.',
      note,
    };
  }

  return {
    titolari: [],
    confidenza: 'bassa',
    catenaChiusa: false,
    daRisalire: societaSopraSoglia,
    azione:
      'Titolare effettivo non determinabile dai dati acquistati: serve la visura sul registro ' +
      'dei titolari effettivi.',
    note,
  };
}
