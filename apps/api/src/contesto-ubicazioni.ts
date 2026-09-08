/**
 * Raccolta del contesto fisico delle ubicazioni, prima dell'analisi.
 *
 * Il motore di analisi è puro e non fa rete: il contesto va quindi raccolto qui e passato
 * dentro. La procedura è in due tempi — si derivano le ubicazioni (calcolo, gratuito), si
 * legge il contesto di quelle che hanno coordinate, si analizza con la mappa in mano.
 *
 * ## Perché ci sono dei limiti, e perché sono qui
 *
 * La fonte cartografica è **Overpass**, un servizio donato con una politica d'uso equo.
 * Un'impresa con quaranta unità locali produrrebbe quaranta interrogazioni per ogni
 * analisi, e ripetute a ogni riesecuzione: è il modo in cui un servizio gratuito viene
 * chiuso a tutti. Da qui tre vincoli deliberati:
 *
 *  - **un tetto al numero di ubicazioni** interrogate per analisi;
 *  - **letture in sequenza**, mai in parallelo;
 *  - **un tempo massimo complessivo**, oltre il quale si rinuncia al resto.
 *
 * Nessuno dei tre falsifica il risultato: le ubicazioni non osservate restano `null`, e
 * l'analisi dichiara quante sono. La distinzione fra «guardato e non c'è niente» e «non
 * guardato» è preservata fino al report.
 *
 * In esercizio l'indirizzo va spostato su un'istanza propria — `OVERPASS_URL` — e con essa
 * questi tetti si possono alzare: sono prudenza verso l'infrastruttura di qualcun altro,
 * non un limite del prodotto.
 */

import { analizzaUbicazioni } from '@aegis/core';
import type { CompanyProfile, ContestoTerritoriale, ExposureLevel } from '@aegis/core';
import { leggiEsitoContesto, leggiPericolositaIdraulica, leggiStoricoMeteo } from '@aegis/providers';
import type { Cache } from '@aegis/providers';

/** Quante ubicazioni interrogare al massimo per una singola analisi. */
const MAX_UBICAZIONI = 4;

/** Tempo complessivo concesso alla raccolta. Oltre, l'analisi parte con quello che ha. */
const BUDGET_TOTALE_MS = 12_000;

/** Tempo concesso alla singola lettura. */
const TIMEOUT_SINGOLA_MS = 6_000;

export interface OpzioniContesto {
  readonly cache?: Cache | undefined;
  readonly baseUrl?: string | undefined;
  readonly userAgent?: string | undefined;
  /** Iniettabile per i collaudi: evita di dipendere da un servizio esterno in prova. */
  readonly leggi?: typeof leggiEsitoContesto | undefined;
  /**
   * Se raccogliere anche lo storico meteo.
   *
   * Spento di default: la fonte è gratuita per uso non commerciale e a pagamento per un
   * prodotto venduto. È una decisione con un costo, non un'impostazione tecnica.
   */
  readonly meteoAttivo?: boolean | undefined;
  readonly cacheMeteo?: Cache | undefined;
  readonly baseUrlMeteo?: string | undefined;
  readonly leggiMeteo?: typeof leggiStoricoMeteo | undefined;
  /**
   * Pericolosità idraulica ISPRA sul punto. Default attivo quando c'è il contesto
   * territoriale; spegnibile con `IDRAULICA_ISPRA=spento` o `idraulicaAttiva: false`.
   */
  readonly idraulicaAttiva?: boolean | undefined;
  readonly cacheIdraulica?: Cache | undefined;
  readonly baseUrlIdraulica?: string | undefined;
  readonly leggiIdraulica?: typeof leggiPericolositaIdraulica | undefined;
  readonly maxUbicazioni?: number | undefined;
  readonly budgetMs?: number | undefined;
  /** Orologio iniettabile: i collaudi non devono attendere davvero. */
  readonly adesso?: (() => number) | undefined;
}

export interface EsitoRaccoltaContesto {
  readonly contesti: ReadonlyMap<string, ContestoTerritoriale>;
  /** Livello ISPRA per chiave ubicazione; assente = non interrogata / non misurata. */
  readonly idraulichePuntuali: ReadonlyMap<string, ExposureLevel | null>;
  readonly occupate: number;
  readonly nonRaggiunte: number;
}

/**
 * Legge il contesto delle ubicazioni del profilo e lo restituisce indicizzato per chiave.
 *
 * Non solleva mai: una fonte irraggiungibile produce una mappa più piccola, non un'analisi
 * mancata. Il documento che l'intermediario deve consegnare non può dipendere dalla salute
 * di un servizio gratuito.
 */
export async function raccogliContesti(
  profilo: CompanyProfile,
  opzioni: OpzioniContesto = {},
): Promise<ReadonlyMap<string, ContestoTerritoriale>> {
  return (await raccogliConEsito(profilo, opzioni)).contesti;
}

/**
 * Come {@link raccogliContesti}, ma dichiara anche **quante letture sono fallite e
 * perché**, e le misure idrauliche puntuali ISPRA.
 */
export async function raccogliConEsito(
  profilo: CompanyProfile,
  opzioni: OpzioniContesto = {},
): Promise<EsitoRaccoltaContesto> {
  const contesti = new Map<string, ContestoTerritoriale>();
  const idraulichePuntuali = new Map<string, ExposureLevel | null>();
  let occupate = 0;
  let nonRaggiunte = 0;
  const leggi = opzioni.leggi ?? leggiEsitoContesto;
  const adesso = opzioni.adesso ?? Date.now;
  const budget = opzioni.budgetMs ?? BUDGET_TOTALE_MS;
  const tetto = opzioni.maxUbicazioni ?? MAX_UBICAZIONI;
  const idraulicaAttiva = opzioni.idraulicaAttiva ?? true;

  const { ubicazioni } = analizzaUbicazioni({
    sedeLegale: profilo.anagrafica.value.sedeLegale,
    unitaLocali: profilo.unitaLocali?.value ?? [],
    immobili: profilo.datiDichiarati.immobili,
  });

  const daInterrogare = ubicazioni
    .filter((u) => u.indirizzo.latitudine !== null && u.indirizzo.longitudine !== null)
    .slice(0, tetto);

  const scadenza = adesso() + budget;

  for (const u of daInterrogare) {
    if (adesso() >= scadenza) break;
    const { latitudine, longitudine } = u.indirizzo;
    if (latitudine === null || longitudine === null) continue;

    const esito = await leggi(latitudine, longitudine, {
      cache: opzioni.cache,
      baseUrl: opzioni.baseUrl,
      userAgent: opzioni.userAgent,
      timeoutMs: TIMEOUT_SINGOLA_MS,
    });

    if (esito.esito === 'osservato') {
      const meteo = opzioni.meteoAttivo
        ? await (opzioni.leggiMeteo ?? leggiStoricoMeteo)(latitudine, longitudine, {
            cache: opzioni.cacheMeteo,
            baseUrl: opzioni.baseUrlMeteo,
            timeoutMs: TIMEOUT_SINGOLA_MS,
          })
        : null;

      contesti.set(u.id, meteo === null ? esito.contesto : { ...esito.contesto, meteo });
    } else if (esito.esito === 'occupato') occupate += 1;
    else nonRaggiunte += 1;

    /*
      ISPRA è indipendente da Overpass: coordinate note bastano. Se la rete cade resta
      `null` e a valle vince il ripiego provinciale — mai un livello inventato.
    */
    if (idraulicaAttiva && adesso() < scadenza) {
      const livello = await (opzioni.leggiIdraulica ?? leggiPericolositaIdraulica)(
        latitudine,
        longitudine,
        {
          cache: opzioni.cacheIdraulica,
          baseUrl: opzioni.baseUrlIdraulica,
          timeoutMs: TIMEOUT_SINGOLA_MS,
        },
      );
      idraulichePuntuali.set(u.id, livello);
    }

    if (esito.esito === 'occupato') {
      occupate += daInterrogare.length - daInterrogare.indexOf(u) - 1;
      break;
    }
  }

  return { contesti, idraulichePuntuali, occupate, nonRaggiunte };
}
