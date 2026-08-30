/**
 * Esposizione territoriale ai rischi naturali.
 *
 * ⚠ Approssimazione dichiarata: la classificazione sismica ufficiale (OPCM 3519/2003)
 * è **comunale**, non provinciale, e la pericolosità idraulica è definita dai PAI di
 * distretto su base cartografica. Questa tabella fornisce un primo livello indicativo,
 * sufficiente a modulare la valutazione del rischio e a far scattare le verifiche;
 * non sostituisce l'accertamento puntuale sul sito.
 *
 * Sostituzione prevista (F2): incrocio delle coordinate della sede con le mappe ISTAT
 * di classificazione sismica comunale e con le aree a pericolosità idraulica ISPRA.
 */

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

export interface TerritorialExposure {
  readonly provincia: string;
  /**
   * Sismica: una misura vera a tre livelli. Le due tabelle coprono le zone 1-2 e la 3;
   * ciò che non vi compare è zona 4, cioè esposizione bassa **accertata**.
   */
  readonly sismica: ExposureLevel;
  /**
   * Idraulica: `null` dove non è stata misurata.
   *
   * Di pericolosità idraulica esiste un insieme solo, quello delle province alte. Per le
   * altre — circa due terzi — il codice restituiva «media», e il badge la mostrava
   * accanto a una sismica misurata come se fosse dello stesso tipo. Non lo era: era il
   * ripiego di un `else`, e chi legge non aveva modo di distinguerlo.
   *
   * Un livello mancante non è un livello intermedio. Ciò che si sa è che la provincia
   * non è nell'elenco delle alte; ciò che non si sa — se sia media o bassa — resta `null`
   * finché non arrivano le aree di pericolosità ISPRA.
   */
  readonly idraulica: ExposureLevel | null;
  /**
   * L'etichetta pronta da stampare: `alta` oppure `non determinata`.
   *
   * Sta qui e non nello strato di presentazione perché la frase mostrata all'utente non
   * si ricicla e non si reinventa a valle: si compone dove il dato ha ancora il suo
   * significato.
   */
  readonly idraulicaEtichetta: string;
}

export function territorialExposure(provincia: string): TerritorialExposure {
  const sigla = provincia.trim().toUpperCase();
  const idraulica: ExposureLevel | null = IDRAULICA_ALTA.has(sigla) ? 'alta' : null;
  return {
    provincia: sigla,
    sismica: SISMICA_ALTA.has(sigla) ? 'alta' : SISMICA_MEDIA.has(sigla) ? 'media' : 'bassa',
    idraulica,
    idraulicaEtichetta: idraulica ?? IDRAULICA_NON_DETERMINATA,
  };
}

/**
 * Esposizione peggiore fra tutte le province in cui l'azienda opera.
 *
 * L'assenza di misura vale zero nella graduatoria, e non è una scelta prudenziale
 * mascherata: la tabella idraulica conosce **solo** le province alte, quindi una
 * provincia non misurata è per costruzione una provincia non alta. Trattarla come «media»
 * dava lo stesso ordinamento e in più affermava un livello.
 */
export function worstExposure(province: readonly string[]): TerritorialExposure | null {
  if (province.length === 0) return null;
  const rank = (level: ExposureLevel | null): number => (level === 'alta' ? 2 : level === 'media' ? 1 : 0);

  let worst: TerritorialExposure | null = null;
  for (const p of province) {
    const current = territorialExposure(p);
    if (worst === null) {
      worst = current;
      continue;
    }
    // Annotato per forza: `worst` si riassegna nel ciclo, e senza il tipo esplicito
    // l'inferenza gira su sé stessa.
    const idraulica: ExposureLevel | null =
      rank(current.idraulica) > rank(worst.idraulica) ? current.idraulica : worst.idraulica;
    worst = {
      provincia:
        rank(current.sismica) + rank(current.idraulica) > rank(worst.sismica) + rank(worst.idraulica)
          ? current.provincia
          : worst.provincia,
      sismica: rank(current.sismica) > rank(worst.sismica) ? current.sismica : worst.sismica,
      idraulica,
      idraulicaEtichetta: idraulica ?? IDRAULICA_NON_DETERMINATA,
    };
  }
  return worst;
}
