/**
 * Esposizione territoriale ai rischi naturali.
 *
 * **Sismica.** La classificazione ufficiale (OPCM 3519/2003 e aggiornamenti regionali) è
 * **comunale**. `territorialExposureDi` la legge dal dataset Protezione Civile (maggio
 * 2025). `territorialExposure(provincia)` resta la tabella provinciale indicativa — usata
 * solo come ripiego quando il comune non è risolvibile — e non inventa la zona 4.
 *
 * **Idraulica.** La pericolosità ufficiale è cartografica (ISPRA/PAI). La tabella
 * provinciale segnala le sole province ad alta esposizione storica; il livello puntuale
 * arriva da fuori (provider ISPRA) e si applica con `conIdraulicaPuntuale`.
 */

import { sismicaComunale } from './data/sismica-comunale.js';
import { idrogeoComunale } from './data/idrogeo-comunale.js';
import { livelloFrana, livelloIdraulico } from './idrogeo.js';
import type { IndicatoriIdrogeo } from './idrogeo.js';

export type ExposureLevel = 'bassa' | 'media' | 'alta';

/** Sigle provinciali con sismicità prevalente elevata (zone 1 e 2). */
const SISMICA_ALTA: ReadonlySet<string> = new Set([
  // Friuli
  'UD',
  'PN',
  'GO',
  // Appennino centrale
  'PG',
  'TR',
  'MC',
  'AP',
  'FM',
  'AQ',
  'TE',
  'PE',
  'CH',
  'RI',
  'IS',
  'CB',
  // Campania e Basilicata interne
  'AV',
  'BN',
  'SA',
  'PZ',
  'MT',
  // Calabria
  'CS',
  'CZ',
  'KR',
  'VV',
  'RC',
  // Sicilia orientale
  'ME',
  'CT',
  'SR',
  'RG',
  // Appennino tosco-emiliano e Garfagnana
  'MS',
  'LU',
  'PT',
  'FC',
  'RN',
]);

/** Sigle provinciali con sismicità prevalente medio-bassa (zona 3). */
const SISMICA_MEDIA: ReadonlySet<string> = new Set([
  'BO',
  'MO',
  'RE',
  'PR',
  'RA',
  'FE',
  'AR',
  'SI',
  'FI',
  'PO',
  'PI',
  'GR',
  'LI',
  'AN',
  'PU',
  'VT',
  'RM',
  'FR',
  'LT',
  'NA',
  'CE',
  'FG',
  'BA',
  'BT',
  'BR',
  'TA',
  'LE',
  'PA',
  'TP',
  'AG',
  'CL',
  'EN',
  'VR',
  'VI',
  'TV',
  'BL',
  'TN',
  'BZ',
  'BS',
  'BG',
]);

/** Sigle provinciali con maggiore esposizione al rischio idraulico e di esondazione. */
const IDRAULICA_ALTA: ReadonlySet<string> = new Set([
  // Pianura padana e delta
  'FE',
  'RA',
  'RO',
  'VE',
  'PD',
  'MN',
  'CR',
  'PV',
  'AL',
  'LO',
  'PC',
  'RE',
  'MO',
  'BO',
  // Aree costiere e vallive a forte pressione idraulica
  'PI',
  'LI',
  'GR',
  'PT',
  'PO',
  'FI',
  'FC',
  'RN',
  'PU',
  'GE',
  'SP',
  'SV',
  'NA',
  'SA',
  'CE',
  'ME',
  'CT',
  'SR',
  'AG',
]);

/** Etichetta da mostrare quando la tabella non ha misurato. */
export const IDRAULICA_NON_DETERMINATA = 'non determinata';

/** Etichetta da mostrare dove la tabella sismica non ha classificato la provincia. */
export const SISMICA_NON_DETERMINATA = 'non determinata';

/** Fonte del dataset comunale, pronta da stampare in scheda. */
export const FONTE_SISMICA_COMUNALE = sismicaComunale.fonte;
export const FONTE_IDROGEO_COMUNALE = idrogeoComunale.fonte;

const INDICATORI_COMUNALI = idrogeoComunale.livelli as Readonly<Record<string, IndicatoriIdrogeo>>;

/**
 * Gli indicatori idraulici e da frana di un comune, se ce ne sono.
 *
 * La chiave e' la stessa della sismica — «SIGLA|nome normalizzato» — e i due archivi
 * differiscono per nove comuni su settemilanovecento: fusioni recenti e varianti di grafia
 * come Jonadi/Ionadi. Sono differenze vere fra due edizioni, non un difetto di chiave: ogni
 * ricerca risponde `null` per conto suo, e il prodotto dice «non determinata» dove non sa.
 */
export function indicatoriIdrogeoDelComune(comune: string, provincia: string): IndicatoriIdrogeo | null {
  const sigla = provincia.trim().toUpperCase();
  return INDICATORI_COMUNALI[`${sigla}|${normalizzaComune(comune)}`] ?? null;
}

const LIVELLI_COMUNALI = sismicaComunale.livelli as Readonly<Record<string, ExposureLevel>>;

export interface TerritorialExposure {
  readonly provincia: string;
  /**
   * Sismica: `null` dove non è stata classificata.
   *
   * Sul percorso provinciale (`territorialExposure`) le trentatré province fuori tabella
   * restano `null`: non sono zona 4 accertata, sono omesse. Sul percorso comunale
   * (`territorialExposureDi`) la zona 4 ufficiale diventa `bassa` misurata.
   */
  readonly sismica: ExposureLevel | null;
  /** L'etichetta pronta da stampare: il livello misurato, oppure `non determinata`. */
  readonly sismicaEtichetta: string;
  /**
   * Idraulica: `null` dove non è stata misurata.
   *
   * La tabella provinciale conosce solo le province alte. Media e bassa arrivano solo
   * dalla misura puntuale ISPRA (`conIdraulicaPuntuale`).
   */
  readonly idraulica: ExposureLevel | null;
  /** L'etichetta pronta da stampare. */
  readonly idraulicaEtichetta: string;
  /** True se la sismica viene dal dataset comunale PC, non dalla tabella provinciale. */
  readonly sismicaComunale?: boolean | undefined;

  /**
   * Pericolosità da frana del comune, dagli indicatori ISPRA.
   *
   * Non c'era affatto, e sui capannoni di collina è il rischio che si materializza per
   * primo. `null` dove il comune non è stato risolto: assenza di lettura, non assenza di
   * frane.
   */
  readonly frane?: ExposureLevel | null | undefined;
  readonly franeEtichetta?: string | undefined;

  /**
   * I numeri sotto le tre parole, per chi vuole vederli.
   *
   * Le parole — alta, media, bassa — sono una convenzione di questo prodotto; le
   * percentuali sono il dato di ISPRA. Chi non condivide la soglia deve poter guardare la
   * misura, e per farlo deve arrivargli.
   */
  readonly indicatoriIdrogeo?: IndicatoriIdrogeo | undefined;
  /** `true` quando idraulica e frane vengono dal comune e non dal ripiego provinciale. */
  readonly idrogeoComunale?: boolean | undefined;
}

export interface LuogoPerEsposizione {
  readonly provincia: string;
  readonly comune?: string | undefined;
}

/**
 * Normalizza il nome del comune per il lookup (accenti, apostrofi, maiuscole).
 * Esportata perché lo script di generazione deve usare la stessa funzione.
 */
export function normalizzaComune(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function etichettaIdraulica(livello: ExposureLevel | null): string {
  return livello ?? IDRAULICA_NON_DETERMINATA;
}

function etichettaSismica(livello: ExposureLevel | null): string {
  return livello ?? SISMICA_NON_DETERMINATA;
}

/**
 * L'etichetta delle frane, che ha la sua e non prende in prestito quella sismica.
 *
 * Le due assenze significano cose diverse: la sismica non determinata e' una provincia
 * fuori tabella, le frane non determinate sono un comune che non sta nell'archivio ISPRA.
 * Una costante condivisa le farebbe sembrare la stessa cosa il giorno che una delle due
 * cambia parole.
 */
function etichettaFrane(livello: ExposureLevel | null): string {
  return livello ?? 'non determinata';
}

function sismicaProvinciale(sigla: string): ExposureLevel | null {
  if (SISMICA_ALTA.has(sigla)) return 'alta';
  if (SISMICA_MEDIA.has(sigla)) return 'media';
  return null;
}

function idraulicaProvinciale(sigla: string): ExposureLevel | null {
  return IDRAULICA_ALTA.has(sigla) ? 'alta' : null;
}

/**
 * Lookup sismico comunale. `null` se il comune non è nel dataset (nome illegibile,
 * comune estero, frazione passata al posto del comune).
 */
export function sismicaDelComune(comune: string, provincia: string): ExposureLevel | null {
  const sigla = provincia.trim().toUpperCase();
  const chiave = `${sigla}|${normalizzaComune(comune)}`;
  return LIVELLI_COMUNALI[chiave] ?? null;
}

/**
 * Esposizione indicativa per sola sigla provinciale.
 *
 * Invariata rispetto al comportamento storico: non inventa zona 4, non inventa idraulica
 * media/bassa. Usare `territorialExposureDi` quando si ha il comune.
 */
export function territorialExposure(provincia: string): TerritorialExposure {
  const sigla = provincia.trim().toUpperCase();
  const idraulica = idraulicaProvinciale(sigla);
  const sismica = sismicaProvinciale(sigla);
  return {
    provincia: sigla,
    sismica,
    sismicaEtichetta: etichettaSismica(sismica),
    idraulica,
    idraulicaEtichetta: etichettaIdraulica(idraulica),
  };
}

/**
 * Esposizione per ubicazione: comunale dove il comune si risolve, provinciale altrove.
 *
 * Tre fonti, tutte a maglia comunale e tutte locali — nessuna chiamata di rete mentre
 * l'intermediario guarda la scheda:
 *
 *   sismica    classificazione ufficiale (Protezione Civile, OPCM 3519/2003)
 *   idraulica  quota di imprese in area a pericolosita' elevata o media (ISPRA IdroGEO)
 *   frane      quota di imprese in area a pericolosita' elevata o molto elevata (idem)
 *
 * L'idraulica arrivava dalla sola tabella provinciale, che conosce le province ad alta
 * esposizione storica e per tutte le altre tace: due terzi d'Italia uscivano «non
 * determinata». Adesso tace solo dove il comune non si risolve.
 *
 * Le frane non c'erano affatto, e su un capannone di collina sono il rischio che si
 * materializza per primo.
 *
 * Resta il limite, e va ripetuto dove qualcuno potrebbe non leggerlo: e' il dato del
 * COMUNE. Dice quante imprese del territorio sono esposte, non se lo e' questa.
 */
export function territorialExposureDi(luogo: LuogoPerEsposizione): TerritorialExposure {
  const base = territorialExposure(luogo.provincia);
  const comune = luogo.comune?.trim() ?? '';
  if (comune === '') return base;

  const sismicaComune = sismicaDelComune(comune, base.provincia);
  const idrogeo = indicatoriIdrogeoDelComune(comune, base.provincia);

  const conSismica: TerritorialExposure =
    sismicaComune === null
      ? base
      : {
          ...base,
          sismica: sismicaComune,
          sismicaEtichetta: etichettaSismica(sismicaComune),
          sismicaComunale: true,
        };

  if (idrogeo === null) return conSismica;

  const idraulica = livelloIdraulico(idrogeo);
  const frane = livelloFrana(idrogeo);

  return {
    ...conSismica,
    idraulica,
    idraulicaEtichetta: etichettaIdraulica(idraulica),
    frane,
    franeEtichetta: etichettaFrane(frane),
    indicatoriIdrogeo: idrogeo,
    idrogeoComunale: true,
  };
}

/**
 * Sovrascrive l'idraulica con la misura puntuale ISPRA. `null` lascia intatto il ripiego
 * provinciale (o l'assenza di misura): non inventa un livello dal silenzio della rete.
 */
export function conIdraulicaPuntuale(
  esposizione: TerritorialExposure,
  idraulica: ExposureLevel | null,
): TerritorialExposure {
  if (idraulica === null) return esposizione;
  return {
    ...esposizione,
    idraulica,
    idraulicaEtichetta: etichettaIdraulica(idraulica),
  };
}

function rank(level: ExposureLevel | null): number {
  return level === 'alta' ? 3 : level === 'media' ? 2 : level === 'bassa' ? 1 : 0;
}

/**
 * Esposizione peggiore fra più esposizioni già risolte (per ubicazione).
 */
export function worstOfExposures(esposizioni: readonly TerritorialExposure[]): TerritorialExposure | null {
  if (esposizioni.length === 0) return null;

  let worst = esposizioni[0]!;
  for (let i = 1; i < esposizioni.length; i++) {
    const current = esposizioni[i]!;
    const idraulica = rank(current.idraulica) > rank(worst.idraulica) ? current.idraulica : worst.idraulica;
    const sismica = rank(current.sismica) > rank(worst.sismica) ? current.sismica : worst.sismica;
    worst = {
      provincia:
        rank(current.sismica) + rank(current.idraulica) > rank(worst.sismica) + rank(worst.idraulica)
          ? current.provincia
          : worst.provincia,
      sismica,
      sismicaEtichetta: etichettaSismica(sismica),
      idraulica,
      idraulicaEtichetta: etichettaIdraulica(idraulica),
      ...(sismica !== null && esposizioni.some((e) => e.sismica === sismica && e.sismicaComunale)
        ? { sismicaComunale: true }
        : {}),
    };
  }
  return worst;
}

/**
 * Esposizione peggiore fra tutte le province in cui l'azienda opera.
 *
 * L'assenza di misura vale zero nella graduatoria. ⚠ Per la sismica una provincia
 * assente potrebbe essere di qualunque livello: chi deve rispondere «è in zona alta?»
 * non usi questo aggregato sulle sole sigle — usi le esposizioni per ubicazione.
 */
export function worstExposure(province: readonly string[]): TerritorialExposure | null {
  if (province.length === 0) return null;
  return worstOfExposures(province.map((p) => territorialExposure(p)));
}
