/**
 * Il contesto fisico attorno a un'ubicazione.
 *
 * Due domande che un assuntore incendio si pone sempre, e a cui nessun bilancio risponde:
 *
 *  1. **In quanto arrivano i pompieri?** Il tempo di soccorso è il fattore che separa un
 *     principio d'incendio da una perdita totale. Un capannone a quaranta minuti dalla
 *     caserma più vicina è un rischio diverso da uno che ne dista cinque, a parità di
 *     tutto il resto — e questa differenza non compare in nessun questionario.
 *
 *  2. **Cosa c'è intorno?** Il rischio di contiguità è reale: una carrozzeria, una
 *     falegnameria o un deposito di infiammabili a duecento metri cambiano la probabilità
 *     di propagazione. Le compagnie lo chiedono nei questionari incendio, e l'intermediario
 *     risponde a memoria o va di persona.
 *
 * ## La fonte
 *
 * **OpenStreetMap**, interrogata via Overpass. È l'unica base dati geografica libera con
 * copertura capillare delle caserme e delle attività economiche italiane.
 *
 * Tre cose vanno dette perché sono vincoli, non dettagli:
 *
 *  - i dati sono rilasciati con licenza **ODbL**: chi li mostra deve attribuire
 *    «© contributori OpenStreetMap», e l'attribuzione compare nel report;
 *  - Overpass pubblico è un servizio **volontario**, con una politica d'uso equo: per un
 *    prodotto venduto va sostituito da un'istanza propria o a pagamento. Il codice legge
 *    l'indirizzo dalla configurazione proprio per rendere il passaggio indolore;
 *  - la copertura **non è uniforme**. Una caserma non mappata non significa che non
 *    esista. Per questo il risultato dichiara sempre che si tratta di dati collaborativi,
 *    e non viene mai usato per **escludere** un rischio — solo per segnalarlo.
 *
 * La distanza è in linea d'aria, non stradale: dirla stradale richiederebbe un servizio di
 * instradamento e la sua incertezza, mentre in linea d'aria è esatta e va dichiarata tale.
 * Per un ordine di grandezza sul soccorso è sufficiente, e non promette una precisione che
 * non ha.
 */

import type { Cache } from '../http.js';

/*
  I tipi vivono in `@aegis/core`, non qui.

  Il contesto è un fatto di dominio — entra in un'analisi e viene congelato con essa —
  mentre questo file è solo il modo in cui oggi lo si legge. Tenerne la forma nel motore
  significa che sostituire Overpass con un'altra fonte non tocca né l'analisi né il report.
*/
import type {
  CasermaVigiliDelFuoco,
  ContestoTerritoriale,
  PuntoDiInteresse,
} from '@aegis/core';

/** Raggio dell'analisi delle vicinanze: è la distanza entro cui un incendio si propaga. */
const RAGGIO_VICINANZE_METRI = 300;

/** Raggio entro cui cercare le caserme. Oltre, il soccorso non è più «vicino». */
const RAGGIO_CASERME_METRI = 25_000;

/**
 * Minuti per chilometro di percorrenza dei mezzi di soccorso.
 *
 * Tre minuti al chilometro — venti km/h medi — tiene conto di uscita dalla caserma,
 * viabilità urbana e traffico. È volutamente prudente: sottostimare il tempo di arrivo su
 * una valutazione di rischio incendio è l'errore che costa di più.
 */
const MINUTI_PER_KM = 3;

/**
 * Le attività che aggravano il rischio del vicinato.
 *
 * Non è un elenco morale: sono le lavorazioni con inneschi, solventi o depositi di
 * combustibile che i questionari incendio chiedono espressamente. Le chiavi sono quelle
 * di OpenStreetMap.
 */
const AGGRAVANTI: Readonly<Record<string, string>> = {
  fuel: 'distributore di carburante',
  car_repair: 'autofficina',
  'shop=car_repair': 'autofficina',
  paint: 'verniciatura',
  carpenter: 'falegnameria',
  sawmill: 'segheria',
  foundry: 'fonderia',
  chemical: 'chimico',
  gas: 'deposito gas',
  waste_transfer_station: 'trattamento rifiuti',
  scrap_yard: 'deposito rottami',
  recycling: 'centro di raccolta',
  bakery: 'panificio (forni)',
  restaurant: 'ristorazione (cucine)',
  laundry: 'lavanderia',
};

export interface ContestoOptions {
  readonly baseUrl?: string | undefined;
  readonly cache?: Cache | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  /** Oltre questo tempo si rinuncia: il contesto è un arricchimento, non un requisito. */
  readonly timeoutMs?: number | undefined;
  /**
   * Quanto si è disposti ad attendere che si liberi uno slot, dopo un rifiuto per limite
   * d'uso. Oltre, si rinuncia e lo si dichiara.
   */
  readonly attesaMassimaMs?: number | undefined;
  /** Identificazione verso il servizio: la politica d'uso di Overpass la richiede. */
  readonly userAgent?: string | undefined;
}

const OVERPASS_PREDEFINITO = 'https://overpass-api.de/api/interpreter';

/**
 * Chi sta chiamando.
 *
 * Da personalizzare con il proprio recapito quando il prodotto va in esercizio: chi
 * gestisce Overpass deve poter contattare chi ne fa un uso eccessivo, invece di doverlo
 * semplicemente bloccare.
 */
const USER_AGENT_PREDEFINITO =
  'AegisRiskPlatform/0.1 (piattaforma di analisi rischi assicurativi; contatto via configurazione)';
const TTL_SECONDI = 90 * 24 * 60 * 60;

/**
 * Perché una lettura non ha prodotto un contesto.
 *
 * Un `null` solo non bastava, e la differenza l'ha mostrata l'esercizio: Overpass pubblico
 * concede **due slot per indirizzo IP** e rifiuta con 429 quando sono occupati. Una
 * piattaforma che analizza aziende una dopo l'altra ci finisce dentro di continuo — è la
 * condizione normale, non l'eccezione.
 *
 * Con un `null` indistinto il capitolo spariva dal report senza dire niente, e chi legge
 * non poteva sapere se attorno all'ubicazione non ci fosse nulla o se nessuno avesse
 * guardato. Su una valutazione incendio le due cose portano a decisioni opposte.
 *
 *  - `occupato`: la fonte ha rifiutato per limite d'uso. **Riprovare più tardi funziona.**
 *  - `non-raggiunto`: rete assente, timeout, risposta incomprensibile. Da indagare.
 */
export type EsitoContesto =
  | { readonly esito: 'osservato'; readonly contesto: ContestoTerritoriale }
  | { readonly esito: 'occupato' }
  | { readonly esito: 'non-raggiunto' };

/**
 * Interroga il contesto attorno a una coordinata.
 *
 * **Non solleva mai**: il contesto arricchisce l'analisi, non la determina, e un servizio
 * esterno lento non deve impedire di produrre il documento che l'intermediario consegna.
 * Restituisce `null` quando non c'è un contesto da mostrare; per sapere *perché* — e in
 * particolare per distinguere «fonte occupata» da «fonte muta» — usare
 * {@link leggiEsitoContesto}.
 */
export async function leggiContestoTerritoriale(
  latitudine: number,
  longitudine: number,
  options: ContestoOptions = {},
): Promise<ContestoTerritoriale | null> {
  const esito = await leggiEsitoContesto(latitudine, longitudine, options);
  return esito.esito === 'osservato' ? esito.contesto : null;
}

/**
 * Come {@link leggiContestoTerritoriale}, ma dichiara l'esito.
 *
 * Su 429 attende il tempo che Overpass stesso annuncia — la sua politica d'uso chiede
 * esattamente questo, invece di ritentare a raffica — e riprova **una volta sola**. Oltre,
 * si arrende e lo dice: un'analisi che aspetta all'infinito una fonte accessoria è peggio
 * di un'analisi senza quella fonte.
 */
export async function leggiEsitoContesto(
  latitudine: number,
  longitudine: number,
  options: ContestoOptions = {},
): Promise<EsitoContesto> {
  const url = options.baseUrl ?? OVERPASS_PREDEFINITO;
  const richiesta = options.fetchImpl ?? fetch;
  const chiave = `overpass:${latitudine.toFixed(5)}:${longitudine.toFixed(5)}`;

  /*
    La cache è la difesa vera verso un servizio donato: il contesto di un'ubicazione non
    cambia in novanta giorni, e rileggerlo a ogni analisi significherebbe pesare su
    un'infrastruttura volontaria per un dato che si sapeva già.
  */
  const memorizzato = options.cache?.get(chiave);
  if (memorizzato !== undefined && memorizzato.expiresAt > Date.now()) {
    return { esito: 'osservato', contesto: memorizzato.value as ContestoTerritoriale };
  }

  const query = componiQuery(latitudine, longitudine);

  const interroga = async (): Promise<EsitoContesto> => {
    const risposta = await richiesta(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        /*
          Overpass **rifiuta con 406** le richieste che non si identificano.

          Non è un capriccio: è un servizio donato, e la sua politica d'uso chiede di
          dichiarare chi sta chiamando per poter contattare chi ne abusa. Il client HTTP di
          Node non manda alcuna identificazione, e il rifiuto arriva come una pagina HTML —
          che al tentativo di leggerla come JSON diventa un'eccezione oscura, lontanissima
          dalla causa vera.
        */
        'User-Agent': options.userAgent ?? USER_AGENT_PREDEFINITO,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });

    // 429: gli slot dell'indirizzo IP sono occupati. Non è un guasto e non è un vuoto —
    // è una coda, e va detto così a chi legge il report.
    if (risposta.status === 429) return { esito: 'occupato' };
    if (!risposta.ok) return { esito: 'non-raggiunto' };

    const dati: unknown = await risposta.json();

    /*
      Una risposta valida come JSON ma di forma inattesa non è «nessun risultato».

      Restituire un contesto vuoto direbbe «ho guardato e non c'è niente attorno», che è
      un'affermazione: su una valutazione incendio significherebbe dichiarare un vicinato
      pulito senza averlo visto. Qui si dichiara di non aver capito, e la sezione non
      compare — la stessa distinzione fra zero e ignoto che vale in tutto il prodotto.
    */
    const contesto = interpreta(dati, latitudine, longitudine);
    if (contesto === null) return { esito: 'non-raggiunto' };
    options.cache?.set(chiave, { value: contesto, expiresAt: Date.now() + TTL_SECONDI * 1000 });
    return { esito: 'osservato', contesto };
  };

  try {
    const primo = await interroga();
    if (primo.esito !== 'occupato') return primo;

    /*
      Una sola ripetizione, dopo aver atteso il tempo che il servizio stesso annuncia.

      Overpass pubblica su `/api/status` il momento in cui il prossimo slot si libera:
      chiederglielo e aspettare è ciò che la sua politica d'uso domanda, ed è anche
      l'unico modo di ottenere il dato senza peggiorare la coda per tutti. Ritentare
      subito, invece, è esattamente il comportamento che fa bloccare un indirizzo IP.
    */
    const attesaMs = await attesaAnnunciata(url, richiesta, options.attesaMassimaMs ?? 8_000);
    if (attesaMs === null) return { esito: 'occupato' };
    await new Promise((r) => setTimeout(r, attesaMs));
    return await interroga();
  } catch {
    // Rete assente, timeout, risposta illeggibile: l'analisi prosegue senza contesto e lo
    // dichiara. Un arricchimento che fa cadere il documento non è un arricchimento.
    return { esito: 'non-raggiunto' };
  }
}

/**
 * Quanto attendere prima di riprovare, chiedendolo al servizio.
 *
 * `/api/status` dichiara gli slot liberi e, se non ce ne sono, fra quanti secondi lo
 * saranno. Restituisce `null` se l'attesa supera il massimo concesso o se lo stato non è
 * leggibile: in quel caso si rinuncia, perché il contesto è un accessorio e non vale far
 * aspettare chi sta producendo un documento.
 */
async function attesaAnnunciata(
  urlInterprete: string,
  richiesta: typeof fetch,
  massimoMs: number,
): Promise<number | null> {
  try {
    const urlStato = urlInterprete.replace(/\/interpreter\/?$/, '/status');
    if (urlStato === urlInterprete) return null;

    const risposta = await richiesta(urlStato, { signal: AbortSignal.timeout(5_000) });
    if (!risposta.ok) return null;

    const testo = await risposta.text();
    if (/([1-9]\d*) slots? available now/.test(testo)) return 250;

    const fra = /in (\d+) seconds/.exec(testo);
    if (fra === null) return null;

    // Un margine breve: allo scadere esatto lo slot può non essere ancora libero.
    const ms = (Number(fra[1]) + 1) * 1000;
    return ms <= massimoMs ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Una sola interrogazione per entrambe le domande.
 *
 * Overpass è un servizio volontario con una politica d'uso equo: due chiamate dove ne
 * basta una raddoppiano il carico su un'infrastruttura donata.
 */
function componiQuery(lat: number, lon: number): string {
  return `[out:json][timeout:20];
(
  node["amenity"="fire_station"](around:${RAGGIO_CASERME_METRI},${lat},${lon});
  way["amenity"="fire_station"](around:${RAGGIO_CASERME_METRI},${lat},${lon});
  node["shop"](around:${RAGGIO_VICINANZE_METRI},${lat},${lon});
  node["craft"](around:${RAGGIO_VICINANZE_METRI},${lat},${lon});
  node["industrial"](around:${RAGGIO_VICINANZE_METRI},${lat},${lon});
  node["amenity"~"^(fuel|restaurant|waste_transfer_station)$"](around:${RAGGIO_VICINANZE_METRI},${lat},${lon});
  way["landuse"="industrial"](around:${RAGGIO_VICINANZE_METRI},${lat},${lon});
);
out center tags;`;
}

interface ElementoOverpass {
  readonly tags?: Record<string, string> | undefined;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly center?: { readonly lat: number; readonly lon: number } | undefined;
}

function interpreta(dati: unknown, lat: number, lon: number): ContestoTerritoriale | null {
  const elementi = estraiElementi(dati);
  if (elementi === null) return null;

  const caserme: CasermaVigiliDelFuoco[] = [];
  const vicine: PuntoDiInteresse[] = [];

  for (const elemento of elementi) {
    const coordinate = elemento.center ?? { lat: elemento.lat, lon: elemento.lon };
    if (typeof coordinate.lat !== 'number' || typeof coordinate.lon !== 'number') continue;

    const metri = distanzaMetri(lat, lon, coordinate.lat, coordinate.lon);
    const tags = elemento.tags ?? {};
    const nome = tags['name'] ?? tags['operator'] ?? 'Senza denominazione';

    if (tags['amenity'] === 'fire_station') {
      const km = metri / 1000;
      caserme.push({
        nome,
        distanzaKm: Math.round(km * 10) / 10,
        minutiStimati: Math.max(1, Math.round(km * MINUTI_PER_KM)),
      });
      continue;
    }

    if (metri > RAGGIO_VICINANZE_METRI) continue;

    const categoria = categoriaDi(tags);
    if (categoria === null) continue;

    vicine.push({
      nome,
      categoria: categoria.etichetta,
      distanzaMetri: Math.round(metri),
      aggravaIlRischio: categoria.aggrava,
    });
  }

  caserme.sort((a, b) => a.distanzaKm - b.distanzaKm);
  vicine.sort((a, b) => a.distanzaMetri - b.distanzaMetri);

  return {
    // Tre caserme bastano: oltre, l'informazione è la stessa e la pagina si allunga.
    vigiliDelFuoco: caserme.slice(0, 3),
    // Le venticinque più vicine: un elenco più lungo non si legge e non aggiunge nulla.
    attivitaVicine: vicine.slice(0, 25),
    attivitaCheAggravano: vicine.filter((v) => v.aggravaIlRischio).length,
    raggioAnalizzatoMetri: RAGGIO_VICINANZE_METRI,
    fonte: '© contributori OpenStreetMap (ODbL)',
  };
}

/** `null` quando la risposta non ha la forma attesa: è diverso da «nessun elemento». */
function estraiElementi(dati: unknown): readonly ElementoOverpass[] | null {
  if (dati === null || typeof dati !== 'object') return null;
  const elementi = (dati as { elements?: unknown }).elements;
  return Array.isArray(elementi) ? (elementi as ElementoOverpass[]) : null;
}

/** Traduce le etichette OpenStreetMap in una categoria leggibile, e dice se aggrava. */
function categoriaDi(tags: Record<string, string>): { etichetta: string; aggrava: boolean } | null {
  for (const chiave of ['shop', 'craft', 'industrial', 'amenity', 'landuse'] as const) {
    const valore = tags[chiave];
    if (valore === undefined) continue;

    const aggravante = AGGRAVANTI[valore];
    if (aggravante !== undefined) return { etichetta: aggravante, aggrava: true };

    // Le altre attività si mostrano comunque: la mappa del vicinato serve anche a
    // riconoscere un contesto residenziale, che è un'informazione a sua volta.
    return { etichetta: valore.replace(/_/g, ' '), aggrava: false };
  }
  return null;
}

/**
 * Distanza in metri fra due coordinate.
 *
 * Formula dell'emisenoverso: esatta su distanze urbane, e senza dipendenze.
 */
function distanzaMetri(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const RAGGIO_TERRESTRE_M = 6_371_000;
  const rad = (g: number): number => (g * Math.PI) / 180;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * RAGGIO_TERRESTRE_M * Math.asin(Math.sqrt(a));
}
