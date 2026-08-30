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

/** Etichetta da mostrare dove la tabella sismica non ha classificato la provincia. */
export const SISMICA_NON_DETERMINATA = 'non determinata';

export interface TerritorialExposure {
  readonly provincia: string;
  /**
   * Sismica: `null` dove la tabella non ha classificato.
   *
   * Qui c'era «una misura vera a tre livelli: ciò che non compare nelle due tabelle è
   * zona 4, cioè esposizione bassa **accertata**». Non era vero. Le due tabelle contano
   * settantaquattro province su centosette: le trentatré che restano — tutto il Piemonte,
   * la Liguria, Milano, Mantova, Venezia, Padova, Piacenza — non sono state classificate
   * zona 4, sono state **omesse**. La prova che si tratta di omissione e non di misura è
   * nel file stesso: dodici di esse compaiono in `IDRAULICA_ALTA`, quindi la tabella le
   * conosce e non le ha classificate.
   *
   * Il danno non era il livello sbagliato, era il tipo: `false` invece di `'ignoto'`. In
   * `engine.ts` una regola con verdetto falso non entra affatto nel registro, e la
   * modulazione sismica spariva senza lasciare traccia per un terzo delle province
   * italiane. Un buco dichiarato si vede; una zona 4 inventata no.
   *
   * Le trentatré non vengono classificate qui: la zonazione di legge è **comunale** e non
   * si deduce. `null` finché non arriva la classificazione ISTAT per comune.
   */
  readonly sismica: ExposureLevel | null;
  /**
   * L'etichetta pronta da stampare: il livello misurato, oppure `non determinata`.
   *
   * Sta accanto al livello per la stessa ragione di `idraulicaEtichetta`: la frase
   * mostrata all'utente si compone dove il dato ha ancora il suo significato, non a valle
   * con un ripiego.
   */
  readonly sismicaEtichetta: string;
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
  const sismica: ExposureLevel | null = SISMICA_ALTA.has(sigla)
    ? 'alta'
    : SISMICA_MEDIA.has(sigla)
      ? 'media'
      : null;
  return {
    provincia: sigla,
    sismica,
    sismicaEtichetta: sismica ?? SISMICA_NON_DETERMINATA,
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
 *
 * ⚠ Per la sismica il ragionamento **non** si trasferisce, e va dichiarato: lì le tabelle
 * conoscono le alte e le medie, quindi una provincia assente potrebbe essere di qualunque
 * livello. La graduatoria continua a restituire il livello più alto fra quelli noti, e su
 * un'impresa con una provincia classificata «media» e una non classificata la peggiore
 * esce «media» — che è un pavimento, non un tetto. Chi deve rispondere «è in zona alta?»
 * non usi questo aggregato: `sismicaAlta` in `rules.ts` guarda le province una per una,
 * perché deve poter dire «non lo so» quando una di esse non è classificata.
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
    const sismica: ExposureLevel | null =
      rank(current.sismica) > rank(worst.sismica) ? current.sismica : worst.sismica;
    worst = {
      provincia:
        rank(current.sismica) + rank(current.idraulica) > rank(worst.sismica) + rank(worst.idraulica)
          ? current.provincia
          : worst.provincia,
      sismica,
      sismicaEtichetta: sismica ?? SISMICA_NON_DETERMINATA,
      idraulica,
      idraulicaEtichetta: idraulica ?? IDRAULICA_NON_DETERMINATA,
    };
  }
  return worst;
}
