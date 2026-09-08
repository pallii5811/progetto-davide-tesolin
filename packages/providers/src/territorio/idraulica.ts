/**
 * Pericolosità idraulica puntuale (ISPRA / Direttiva Alluvioni).
 *
 * Tre scenari sulla mosaicatura nazionale: P3 (frequente) → alta, P2 → media, P1 → bassa.
 * Fuori da ogni poligono, o se la rete non risponde: `null` — non si inventa un livello.
 *
 * Stesso contratto del meteo e di Overpass: non solleva mai; un fallimento costa una
 * misura, non il documento.
 */

import type { Cache } from '../http.js';
import type { ExposureLevel } from '@aegis/core';

const ISPRA_WFS_PREDEFINITO = 'https://sdi.isprambiente.it/geoserver/nz1/wfs';

/** Ordine di prova: dal più grave. Al primo hit si ferma. */
const SCENARI: readonly { readonly layer: string; readonly livello: ExposureLevel }[] = [
  { layer: 'nz1:aree_peric_idraulica_p3', livello: 'alta' },
  { layer: 'nz1:aree_peric_idraulica_p2', livello: 'media' },
  { layer: 'nz1:aree_peric_idraulica_p1', livello: 'bassa' },
];

const TTL_SECONDI = 30 * 24 * 60 * 60;

export const FONTE_IDRAULICA_ISPRA =
  'ISPRA · mosaicatura aree a pericolosità idraulica (v. 5.0, CC-BY-SA 4.0)';

export interface IdraulicaOptions {
  readonly baseUrl?: string | undefined;
  readonly cache?: Cache | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

interface RispostaGeoJson {
  readonly features?: readonly unknown[] | undefined;
  readonly numberMatched?: number | undefined;
  readonly totalFeatures?: number | undefined;
}

/**
 * Livello di pericolosità idraulica sul punto, oppure `null` se non misurabile.
 */
export async function leggiPericolositaIdraulica(
  latitudine: number,
  longitudine: number,
  options: IdraulicaOptions = {},
): Promise<ExposureLevel | null> {
  const richiesta = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? ISPRA_WFS_PREDEFINITO;

  const chiave = `idro:${latitudine.toFixed(4)}:${longitudine.toFixed(4)}`;
  const memorizzato = await options.cache?.get(chiave);
  if (memorizzato !== undefined && memorizzato.expiresAt > Date.now()) {
    return memorizzato.value as ExposureLevel | null;
  }

  /*
    I tre scenari si chiedono INSIEME, non in fila.

    In fila l'attesa era la somma dei tre timeout: un punto fuori da ogni classe — il caso
    più comune — pagava tre volte prima di rispondere «non determinata», e chi guardava la
    scheda vedeva una pagina ferma per il triplo del tempo. Misurato sul servizio vero:
    ogni strato risponde fra 1,3 e 45 secondi, perché i poligoni sono enormi (quello di
    Ravenna ha 18.102 vertici e copre la piana romagnola). Insieme, l'attesa è quella di
    uno solo.

    Vince il più grave che ha risposto in tempo: P3 batte P2 batte P1. Uno scenario andato
    in timeout non abbassa il verdetto degli altri, ma nemmeno lo alza: se P3 non risponde
    e P2 sì, esce «media», che è ciò che si è misurato — e la lentezza di P3 non diventa
    una rassicurazione.
  */
  const esiti = await Promise.all(
    SCENARI.map(async (scenario) => {
      try {
        const risposta = await richiesta(urlGetFeature(base, scenario.layer, longitudine, latitudine), {
          signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
          headers: { Accept: 'application/json' },
        });
        if (!risposta.ok) return null;
        const dati = (await risposta.json()) as RispostaGeoJson;
        return haFeature(dati) ? scenario.livello : null;
      } catch {
        return null;
      }
    }),
  );

  // `SCENARI` è ordinato dal più grave al meno grave: il primo che ha risposto vince.
  const livello = esiti.find((e) => e !== null) ?? null;

  /*
    Nessun poligono: misurato come fuori area a rischio mappato — non è «bassa» inventata
    dalla tabella provinciale, è assenza di P1/P2/P3 sul punto. Si conserva `null` e il
    ripiego provinciale decide a valle (alta storica o non determinata).

    Anche il timeout produce `null`, ed è il limite di questa fonte: «non ho potuto
    guardare» e «ho guardato e non c'era» arrivano qui uguali. Per questo la sorgente è
    spenta finché non risponde in tempi da pagina web, e la nota in scheda dice «non
    determinata» invece di «nessuna pericolosità».
  */
  await options.cache?.set(chiave, {
    value: livello,
    expiresAt: Date.now() + TTL_SECONDI * 1000,
  });
  return livello;
}

/**
 * L'URL della domanda, esportata perché l'ordine degli assi si possa provare senza rete.
 *
 * **Il bbox va con la longitudine per prima.** La prima versione lo scriveva `lat,lon` —
 * l'ordine che la norma WFS 2.0 prescrive per EPSG:4326 — e il servizio rispondeva
 * `HTTP 200`, `numberMatched 0`, su ogni punto d'Italia: delta del Po compreso, che è in
 * classe P3 su qualunque carta. Nessun errore, nessuna eccezione, solo «nessun poligono»,
 * che il codice traduce in `null` e la scheda stampa come «non determinata». La funzione
 * era spenta e sembrava accesa, e le prove a risposte finte restavano verdi.
 *
 * Non è dedotto dalla norma, è misurato contro il servizio vero: si prende una coordinata
 * **da dentro un poligono dello strato** e le si chiede se lo ritrova.
 *
 *   bbox lat,lon → numberMatched 0
 *   bbox lon,lat → numberMatched 1
 *
 * Lo strato è in EPSG:4258 (ETRS89), che in Italia coincide con WGS84 entro il metro: la
 * differenza non conta su un quadrato di undici metri, l'ordine sì. `srsName` è caduto
 * perché riguarda le coordinate della RISPOSTA, non quelle del filtro, e qui la risposta
 * non viene letta: si conta soltanto.
 */
export function urlGetFeature(base: string, layer: string, lon: number, lat: number): string {
  /*
    Bbox minimo intorno al punto (≈ 11 m a latitudine italiana): INTERSECTS su POINT
    dipende dal nome della geometria nel layer; il bbox è lo stesso meccanismo usato
    dagli client WFS e non richiede di conoscere l'attributo geom.
  */
  const d = 0.0001;
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layer,
    outputFormat: 'application/json',
    count: '1',
    bbox: `${lon - d},${lat - d},${lon + d},${lat + d},EPSG:4326`,
  });
  return `${base}?${params.toString()}`;
}

function haFeature(dati: RispostaGeoJson): boolean {
  if (typeof dati.numberMatched === 'number' && dati.numberMatched > 0) return true;
  if (typeof dati.totalFeatures === 'number' && dati.totalFeatures > 0) return true;
  return Array.isArray(dati.features) && dati.features.length > 0;
}
