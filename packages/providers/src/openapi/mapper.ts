/**
 * Mappatura dalle risposte OpenAPI.com al modello canonico.
 *
 * È il punto in cui il disordine del mondo esterno viene tradotto in un dominio pulito.
 * Regola: nulla entra senza provenienza, e ciò che non c'è resta `null` — mai un valore
 * di comodo. Un fatturato «0» perché il campo era assente falserebbe lo score.
 */

import { NESSUN_EVENTO_NEGATIVO, fromProvider, isBilancioSinteticoUtile } from '@aegis/core';
import type {
  Anagrafica,
  Assetti,
  AtecoCode,
  Bilancio,
  BilancioSintetico,
  Carica,
  EventiNegativi,
  FormaGiuridica,
  Indirizzo,
  Pregiudizievole,
  Protesto,
  Socio,
  Sourced,
  StatoAttivita,
  TipoProcedura,
  TipoUnitaLocale,
  UnitaLocale,
} from '@aegis/core';
import { asArray, atecoOf, bool, date, money, moneyOrZero, num, percent, pick, str } from './parse.js';

const PROVIDER = 'OpenAPI.com';

// ─────────────────────────────────────────────────────────────────────────────
// Normalizzazioni
// ─────────────────────────────────────────────────────────────────────────────

const FORME: readonly (readonly [RegExp, FormaGiuridica])[] = [
  [/societa'? per azioni|^s\.?p\.?a\.?$/i, 'spa'],
  [/semplificata|s\.?r\.?l\.?s/i, 'srls'],
  [/responsabilita'? limitata|^s\.?r\.?l\.?$/i, 'srl'],
  [/accomandita per azioni|s\.?a\.?p\.?a/i, 'sapa'],
  [/nome collettivo|^s\.?n\.?c\.?$/i, 'snc'],
  [/accomandita semplice|^s\.?a\.?s\.?$/i, 'sas'],
  [/impresa individuale|ditta individuale|imprenditore individuale/i, 'ditta-individuale'],
  [/cooperativa|^soc\.? coop/i, 'cooperativa'],
  [/consorzio/i, 'consorzio'],
  [/associazione/i, 'associazione'],
  [/fondazione/i, 'fondazione'],
  [/ente pubblico|comune|provincia|regione/i, 'ente-pubblico'],
];

export function normalizzaFormaGiuridica(descrizione: string | null): FormaGiuridica {
  if (descrizione === null) return 'altro';
  for (const [pattern, forma] of FORME) {
    if (pattern.test(descrizione)) return forma;
  }
  return 'altro';
}

export function normalizzaStatoAttivita(valore: string | null): StatoAttivita {
  if (valore === null) return 'attiva';
  const testo = valore.toLowerCase();
  if (testo.includes('fallit')) return 'fallita';
  if (testo.includes('liquidazione')) return 'in-liquidazione';
  if (testo.includes('cessat') || testo.includes('cancellat')) return 'cessata';
  if (testo.includes('sospes')) return 'sospesa';
  if (testo.includes('inattiv')) return 'inattiva';
  return 'attiva';
}

function normalizzaTipoUnitaLocale(valore: string | null): TipoUnitaLocale {
  if (valore === null) return 'altro';
  const testo = valore.toLowerCase();
  if (testo.includes('legale')) return 'sede-legale';
  if (testo.includes('stabilimento') || testo.includes('produzion')) return 'stabilimento';
  if (testo.includes('magazzin') || testo.includes('deposit')) return 'magazzino';
  if (testo.includes('vendita') || testo.includes('negozio')) return 'punto-vendita';
  if (testo.includes('ufficio')) return 'ufficio';
  if (testo.includes('operativ')) return 'sede-operativa';
  return 'altro';
}

function normalizzaProcedura(valore: string | null): TipoProcedura {
  if (valore === null) return 'altro';
  const testo = valore.toLowerCase();
  if (testo.includes('liquidazione giudiziale')) return 'liquidazione-giudiziale';
  if (testo.includes('fallim')) return 'fallimento';
  if (testo.includes('concordato')) return 'concordato-preventivo';
  if (testo.includes('composizione negoziata')) return 'composizione-negoziata';
  if (testo.includes('coatta')) return 'liquidazione-coatta';
  if (testo.includes('straordinaria')) return 'amministrazione-straordinaria';
  if (testo.includes('ristrutturazione')) return 'accordo-ristrutturazione';
  if (testo.includes('scioglimento')) return 'scioglimento';
  return 'altro';
}

function mappaIndirizzo(source: unknown): Indirizzo | null {
  /*
    `streetName` è la via **già composta** con toponimo e civico: «VIALE FILIPPO TOMMASO
    MARINETTI 221». Usarla come nome della via e poi affiancarle `streetNumber` stampa il
    civico due volte — «MARINETTI 221 221» — su ogni indirizzo reale.

    Si compone quindi dai pezzi, che il fornitore restituisce separati, e si ricade sul
    campo già composto solo quando i pezzi mancano.
  */
  const via =
    componiVia(str(source, 'toponym', 'toponimo'), str(source, 'street', 'via', 'indirizzo')) ??
    str(source, 'streetName');
  const comune = str(source, 'town', 'comune', 'city');
  const provincia = str(source, 'province', 'provincia', 'siglaProvincia', 'sigla');
  if (via === null && comune === null) return null;

  // La regione arriva come oggetto `{ code, description }`, non come stringa.
  const regione = str(source, 'regione') ?? str(pick(source, 'region'), 'description', 'descrizione');

  const coordinate = coordinateDi(source);

  return {
    via: via ?? '',
    civico: str(source, 'streetNumber', 'civico', 'numero'),
    cap: str(source, 'zipCode', 'cap', 'postalCode') ?? '',
    comune: comune ?? '',
    provincia: (provincia ?? '').toUpperCase().slice(0, 2),
    regione,
    latitudine: coordinate.latitudine,
    longitudine: coordinate.longitudine,
  };
}

function componiVia(toponimo: string | null, nome: string | null): string | null {
  if (nome === null) return toponimo;
  return toponimo === null ? nome : `${toponimo} ${nome}`;
}

/**
 * Coordinate geografiche.
 *
 * ⚠ Il provider le restituisce in `gps.coordinates` nell'ordine **GeoJSON**, cioè
 * `[longitudine, latitudine]` — l'inverso di come si scrivono di solito. Invertirle
 * sposterebbe un'azienda romana in mezzo alla Somalia, e con essa la valutazione del
 * rischio sismico e idraulico che si appoggia alla posizione.
 */
function coordinateDi(source: unknown): { latitudine: number | null; longitudine: number | null } {
  const gps = pick(source, 'gps');
  const coordinate = asArray(pick(gps, 'coordinates'));

  if (coordinate.length >= 2) {
    const longitudine = typeof coordinate[0] === 'number' ? coordinate[0] : null;
    const latitudine = typeof coordinate[1] === 'number' ? coordinate[1] : null;
    return { latitudine, longitudine };
  }

  return {
    latitudine: num(source, 'lat', 'latitudine', 'latitude'),
    longitudine: num(source, 'lng', 'lon', 'longitudine', 'longitude'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sezioni del profilo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sede legale, ovunque il fornitore la annidi.
 *
 * La forma reale di `IT-start` e `IT-advanced` è **a due livelli**:
 *
 *     { "address": { "registeredOffice": { "town": "ROMA", "province": "RM" } } }
 *
 * `address` e `registeredOffice` non sono alias della stessa chiave: sono uno dentro
 * l'altro. Cercarli come alternative trova `address` e si ferma lì, un livello sopra
 * il dato — restituendo un oggetto che *esiste* ma non contiene né comune né provincia.
 *
 * Questa funzione esiste come punto unico perché l'errore è già accaduto: una seconda
 * copia semplificata, nel mapper dei risultati di ricerca, mostrava «—» al posto della
 * sede su ogni azienda reale. Due lettori dello stesso dato divergono; uno solo no.
 */
export function sedeDi(raw: unknown): unknown {
  return (
    pick(pick(raw, 'address'), 'registeredOffice', 'sedeLegale') ??
    pick(raw, 'registeredOffice', 'sedeLegale', 'address', 'indirizzo')
  );
}

/** ATECO come lo legge l'anagrafica: classificazione annidata, con ricaduta sulle forme piatte. */
export function atecoDi(raw: unknown): AtecoCode | null {
  return mappaAteco(raw).codice;
}

export function mappaAnagrafica(raw: unknown, service: string, osservatoIl: Date): Sourced<Anagrafica> {
  const descrizioneForma =
    str(pick(raw, 'detailedLegalForm'), 'description', 'descrizione') ??
    str(raw, 'legalForm', 'formaGiuridica', 'naturaGiuridica', 'legalFormDescription');

  const sede = sedeDi(raw);
  const ateco = mappaAteco(raw);
  const ultimoSintetico = mappaBilanciSintetici(raw)[0] ?? null;

  const anagrafica: Anagrafica = {
    formaGiuridica: normalizzaFormaGiuridica(descrizioneForma),
    formaGiuridicaDescrizione: descrizioneForma ?? 'Non specificata',
    statoAttivita: normalizzaStatoAttivita(str(raw, 'activityStatus', 'statoAttivita', 'status')),
    dataCostituzione: date(raw, 'registrationDate', 'creationDate', 'dataCostituzione', 'dataIscrizione'),
    dataInizioAttivita: date(raw, 'startDate', 'dataInizioAttivita', 'activityStartDate'),
    numeroREA: str(raw, 'reaCode', 'rea', 'numeroRea'),
    cciaa: str(raw, 'cciaa', 'chamberOfCommerce'),
    atecoPrimario: ateco.codice,
    atecoPrimarioDescrizione: ateco.descrizione,
    atecoSecondari: ateco.secondari,
    sedeLegale: mappaIndirizzo(sede ?? raw),
    // Il capitale sociale compare nei bilanci sintetici, non fra i campi anagrafici.
    capitaleSocialeDeliberato:
      money(raw, 'shareCapital', 'capitaleSociale', 'capitaleDeliberato') ??
      ultimoSintetico?.capitaleSociale ??
      null,
    capitaleSocialeVersato: money(raw, 'paidUpCapital', 'capitaleVersato'),
    pec: str(raw, 'pec', 'pecEmail', 'certifiedEmail'),
    sitoWeb: str(raw, 'website', 'sitoWeb', 'web'),
    telefono: str(raw, 'phone', 'telefono', 'tel'),
    numeroAddetti:
      num(raw, 'employees', 'numeroDipendenti', 'addetti', 'employeesNumber') ??
      ultimoSintetico?.dipendenti ??
      null,
    fatturatoDichiarato:
      money(raw, 'turnover', 'fatturato', 'revenue') ?? ultimoSintetico?.fatturato ?? null,
  };

  return fromProvider(anagrafica, PROVIDER, service, osservatoIl);
}

/**
 * Classificazione ATECO.
 *
 * Il provider restituisce fino a tre versioni della classificazione (`ateco`, `ateco2007`,
 * `ateco2022`) con codici privi di punti e di lunghezza diversa: `621` accanto a `6201`.
 * Si sceglie il **più specifico**, perché è quello che le regole di rischio sanno leggere:
 * una divisione a tre cifre non distingue la produzione di software dalla consulenza.
 */
function mappaAteco(raw: unknown): {
  codice: AtecoCode | null;
  descrizione: string | null;
  secondari: readonly AtecoCode[];
} {
  const classificazione = pick(raw, 'atecoClassification');

  const candidati = ['ateco2022', 'ateco2025', 'ateco2007', 'ateco']
    .map((chiave) => pick(classificazione, chiave))
    .filter((v) => v !== undefined)
    .map((v) => ({
      codice: atecoOf(v, 'code', 'codice'),
      descrizione: str(v, 'description', 'descrizione'),
    }))
    .filter((v): v is { codice: AtecoCode; descrizione: string | null } => v.codice !== null);

  const migliore = candidati.reduce<{ codice: AtecoCode; descrizione: string | null } | null>(
    (scelto, corrente) =>
      scelto === null || corrente.codice.length > scelto.codice.length ? corrente : scelto,
    null,
  );

  if (migliore !== null) {
    const altri = candidati.map((c) => c.codice).filter((c) => c !== migliore.codice);
    return { codice: migliore.codice, descrizione: migliore.descrizione, secondari: [...new Set(altri)] };
  }

  // Forme piatte, usate da altri servizi dello stesso fornitore.
  return {
    codice: atecoOf(raw, 'atecoCode', 'ateco', 'codiceAteco'),
    descrizione: str(raw, 'atecoDescription', 'descrizioneAteco', 'atecoDesc'),
    secondari: [],
  };
}

/**
 * Bilanci sintetici.
 *
 * Arrivano con l'anagrafica estesa, senza costo aggiuntivo, e coprono fino a dieci
 * esercizi. Il primo elemento è tipicamente l'anno in corso, con tutti gli aggregati
 * a `null`: viene scartato, perché contarlo falserebbe il fattore di continuità dello score.
 */
export function mappaBilanciSintetici(raw: unknown): readonly BilancioSintetico[] {
  const contenitore = pick(raw, 'balanceSheets', 'bilanci');
  const elenco = asArray(pick(contenitore, 'all') ?? contenitore);

  return elenco
    .map((b): BilancioSintetico | null => {
      const anno = num(b, 'year', 'anno');
      if (anno === null) return null;
      return {
        anno,
        dataChiusura: date(b, 'balanceSheetDate', 'dataChiusura'),
        fatturato: money(b, 'turnover', 'fatturato'),
        patrimonioNetto: money(b, 'netWorth', 'patrimonioNetto'),
        totaleAttivo: money(b, 'totalAssets', 'totaleAttivo'),
        costoDelPersonale: money(b, 'totalStaffCost', 'costoPersonale'),
        capitaleSociale: money(b, 'shareCapital', 'capitaleSociale'),
        dipendenti: num(b, 'employees', 'dipendenti'),
        retribuzioneMediaLorda: money(b, 'avgGrossSalary'),
      };
    })
    .filter((b): b is BilancioSintetico => b !== null && isBilancioSinteticoUtile(b))
    .sort((a, b) => b.anno - a.anno);
}

export function mappaAssetti(raw: unknown, service: string, osservatoIl: Date): Sourced<Assetti> {
  const soci: Socio[] = asArray(pick(raw, 'shareHolders', 'shareholders', 'soci', 'members')).map((s) => {
    // Le persone fisiche arrivano con `name` e `surname` valorizzati e `companyName` nullo;
    // le persone giuridiche con il solo `companyName`. È la distinzione più affidabile:
    // il campo `type`, dove esiste, non è compilato in modo uniforme.
    const ragioneSociale = str(s, 'companyName', 'denominazione', 'ragioneSociale');
    const nome = str(s, 'name', 'nome');
    const cognome = str(s, 'surname', 'cognome');
    const nominativo = [cognome, nome].filter((p): p is string => p !== null).join(' ');

    // Se il campo `type` è valorizzato lo si rispetta; altrimenti si deduce dalla forma
    // dei dati. Servizi diversi dello stesso fornitore usano l'una o l'altra convenzione.
    const tipoDichiarato = str(s, 'type', 'tipo');
    const tipo =
      tipoDichiarato !== null
        ? tipoDichiarato.toLowerCase().includes('giurid')
          ? ('persona-giuridica' as const)
          : ('persona-fisica' as const)
        : ragioneSociale === null && nominativo !== ''
          ? ('persona-fisica' as const)
          : ('persona-giuridica' as const);

    return {
      denominazione:
        ragioneSociale ?? (nominativo === '' ? (str(s, 'fullName') ?? 'Non specificato') : nominativo),
      codiceFiscale: str(s, 'taxCode', 'codiceFiscale', 'cf'),
      tipo,
      quotaPercentuale: percent(s, 'percentShare', 'sharePercentage', 'quotaPercentuale', 'quota'),
      quotaValore: money(s, 'shareValue', 'valoreQuota', 'quotaValore'),
    };
  });

  const cariche: Carica[] = asArray(pick(raw, 'managers', 'cariche', 'officers', 'directors')).map((c) => {
    const ruolo = str(c, 'role', 'carica', 'ruolo', 'position') ?? 'Non specificata';
    return {
      nominativo: str(c, 'name', 'nominativo', 'fullName') ?? 'Non specificato',
      codiceFiscale: str(c, 'taxCode', 'codiceFiscale', 'cf'),
      ruolo,
      dataNomina: date(c, 'appointmentDate', 'dataNomina'),
      isRappresentanteLegale:
        /legale rappresentante|amministratore unico|presidente|legal representative/i.test(ruolo),
    };
  });

  const controllanteNome = str(pick(raw, 'parentCompany', 'controllante'), 'name', 'denominazione');

  const assetti: Assetti = {
    soci,
    cariche,
    controllante:
      controllanteNome === null
        ? null
        : { partitaIva: null, codiceFiscale: null, denominazione: controllanteNome },
    controllate: asArray(pick(raw, 'subsidiaries', 'controllate')).map((c) => ({
      partitaIva: null,
      codiceFiscale: null,
      denominazione: str(c, 'name', 'denominazione') ?? 'Non specificata',
    })),
  };

  return fromProvider(assetti, PROVIDER, service, osservatoIl);
}

export function mappaUnitaLocali(
  raw: unknown,
  service: string,
  osservatoIl: Date,
): Sourced<readonly UnitaLocale[]> {
  const unita: UnitaLocale[] = asArray(pick(raw, 'localUnits', 'unitaLocali', 'units'))
    .map((u): UnitaLocale | null => {
      const indirizzo = mappaIndirizzo(pick(u, 'address', 'indirizzo') ?? u);
      if (indirizzo === null) return null;
      return {
        tipo: normalizzaTipoUnitaLocale(str(u, 'type', 'tipo', 'unitType')),
        indirizzo,
        attivita: str(u, 'activity', 'attivita', 'description'),
        addetti: num(u, 'employees', 'addetti'),
      };
    })
    .filter((u): u is UnitaLocale => u !== null);

  return fromProvider(unita, PROVIDER, service, osservatoIl);
}

/**
 * Mappatura del bilancio.
 *
 * Il provider può restituire lo schema CEE con nomi diversi a seconda del formato
 * (ordinario, abbreviato, micro). Ogni voce prova più alias; ciò che manca vale zero,
 * ed è corretto: in un bilancio l'assenza di una voce significa che quella voce è a zero.
 */
export function mappaBilancio(raw: unknown): Bilancio | null {
  const anno = num(raw, 'year', 'anno', 'esercizio', 'fiscalYear');
  if (anno === null) return null;

  const attivo = pick(raw, 'assets', 'attivo', 'statoPatrimonialeAttivo') ?? raw;
  const passivo = pick(raw, 'liabilities', 'passivo', 'statoPatrimonialePassivo') ?? raw;
  const ce = pick(raw, 'incomeStatement', 'contoEconomico', 'ce') ?? raw;

  return {
    anno,
    dataChiusura: date(raw, 'closingDate', 'dataChiusura') ?? new Date(Date.UTC(anno, 11, 31)),
    mesiEsercizio: num(raw, 'months', 'mesiEsercizio') ?? 12,
    numeroDipendenti: num(raw, 'employees', 'numeroDipendenti', 'dipendenti') ?? undefined,
    attivo: {
      creditiVersoSoci: moneyOrZero(attivo, 'creditiVersoSoci', 'shareholdersReceivables'),
      immobilizzazioniImmateriali: moneyOrZero(attivo, 'immobilizzazioniImmateriali', 'intangibleAssets'),
      terreniEFabbricati: moneyOrZero(attivo, 'terreniEFabbricati', 'landAndBuildings'),
      impiantiEMacchinario: moneyOrZero(attivo, 'impiantiEMacchinario', 'plantAndMachinery'),
      attrezzature: moneyOrZero(attivo, 'attrezzature', 'industrialEquipment', 'equipment'),
      altreImmobilizzazioniMateriali: moneyOrZero(attivo, 'altriBeni', 'otherTangibleAssets'),
      immobilizzazioniFinanziarie: moneyOrZero(attivo, 'immobilizzazioniFinanziarie', 'financialAssets'),
      rimanenze: moneyOrZero(attivo, 'rimanenze', 'inventory', 'inventories'),
      creditiVersoClienti: moneyOrZero(attivo, 'creditiVersoClienti', 'tradeReceivables'),
      altriCrediti: moneyOrZero(attivo, 'altriCrediti', 'otherReceivables'),
      attivitaFinanziarieNonImmobilizzate: moneyOrZero(
        attivo,
        'attivitaFinanziarie',
        'currentFinancialAssets',
      ),
      disponibilitaLiquide: moneyOrZero(attivo, 'disponibilitaLiquide', 'cash', 'cashAndEquivalents'),
      rateiRiscontiAttivi: moneyOrZero(attivo, 'rateiRiscontiAttivi', 'accruedIncome'),
      costoStoricoImmobilizzazioniMateriali:
        money(attivo, 'costoStoricoMateriali', 'grossTangibleAssets') ?? undefined,
    },
    passivo: {
      capitaleSociale: moneyOrZero(passivo, 'capitaleSociale', 'shareCapital'),
      riserve: moneyOrZero(passivo, 'riserve', 'reserves'),
      utiliPortatiANuovo: moneyOrZero(passivo, 'utiliPortatiANuovo', 'retainedEarnings'),
      utileEsercizio: moneyOrZero(passivo, 'utileEsercizio', 'netProfit', 'profitForTheYear'),
      fondiRischiOneri: moneyOrZero(passivo, 'fondiRischiOneri', 'provisions'),
      tfr: moneyOrZero(passivo, 'tfr', 'severanceIndemnity'),
      debitiVersoBancheBreve: moneyOrZero(passivo, 'debitiBancheBreve', 'shortTermBankDebt'),
      debitiVersoBancheOltre: moneyOrZero(passivo, 'debitiBancheOltre', 'longTermBankDebt'),
      debitiVersoFornitori: moneyOrZero(passivo, 'debitiVersoFornitori', 'tradePayables'),
      debitiTributari: moneyOrZero(passivo, 'debitiTributari', 'taxPayables'),
      altriDebitiBreve: moneyOrZero(passivo, 'altriDebitiBreve', 'otherShortTermPayables'),
      altriDebitiOltre: moneyOrZero(passivo, 'altriDebitiOltre', 'otherLongTermPayables'),
      rateiRiscontiPassivi: moneyOrZero(passivo, 'rateiRiscontiPassivi', 'accruedLiabilities'),
    },
    contoEconomico: {
      ricaviVendite: moneyOrZero(ce, 'ricaviVendite', 'revenues', 'netSales'),
      variazioneRimanenzeProdotti: moneyOrZero(ce, 'variazioneRimanenzeProdotti', 'changeInFinishedGoods'),
      altriRicavi: moneyOrZero(ce, 'altriRicavi', 'otherRevenues'),
      costiMateriePrime: moneyOrZero(ce, 'costiMateriePrime', 'rawMaterials'),
      variazioneRimanenzeMateriePrime: moneyOrZero(
        ce,
        'variazioneRimanenzeMateriePrime',
        'changeInRawMaterials',
      ),
      costiServizi: moneyOrZero(ce, 'costiServizi', 'services'),
      costiGodimentoBeniTerzi: moneyOrZero(ce, 'costiGodimentoBeniTerzi', 'leases'),
      salariStipendi: moneyOrZero(ce, 'salariStipendi', 'wages'),
      oneriSocialiEAltri: moneyOrZero(ce, 'oneriSociali', 'socialSecurityCharges'),
      ammortamentiSvalutazioni: moneyOrZero(ce, 'ammortamenti', 'depreciationAndAmortization'),
      accantonamenti: moneyOrZero(ce, 'accantonamenti', 'provisionsExpense'),
      oneriDiversiGestione: moneyOrZero(ce, 'oneriDiversiGestione', 'otherOperatingCosts'),
      proventiFinanziari: moneyOrZero(ce, 'proventiFinanziari', 'financialIncome'),
      oneriFinanziari: moneyOrZero(ce, 'oneriFinanziari', 'financialCharges', 'interestExpense'),
      rettificheAttivitaFinanziarie: moneyOrZero(ce, 'rettificheFinanziarie', 'financialAdjustments'),
      imposte: moneyOrZero(ce, 'imposte', 'taxes', 'incomeTaxes'),
    },
  };
}

export function mappaEventiNegativi(
  rawProtesti: unknown,
  rawPregiudizievoli: unknown,
  service: string,
  osservatoIl: Date,
): Sourced<EventiNegativi> {
  const protesti: Protesto[] = asArray(pick(rawProtesti, 'protests', 'protesti', 'items'))
    .map((p): Protesto | null => {
      const data = date(p, 'date', 'data', 'dataProtesto');
      if (data === null) return null;
      return {
        data,
        importo: money(p, 'amount', 'importo') ?? moneyOrZero(p, 'amount'),
        tipo: str(p, 'type', 'tipo', 'titolo') ?? 'Non specificato',
        luogo: str(p, 'place', 'luogo', 'comune'),
        levato: bool(p, 'settled', 'levato', 'cancellato') ?? false,
      };
    })
    .filter((p): p is Protesto => p !== null);

  const pregiudizievoli: Pregiudizievole[] = asArray(
    pick(rawPregiudizievoli, 'prejudicials', 'pregiudizievoli', 'items'),
  )
    .map((p): Pregiudizievole | null => {
      const data = date(p, 'date', 'data');
      if (data === null) return null;
      const descrizione = str(p, 'description', 'descrizione', 'tipo') ?? 'Non specificata';
      return {
        data,
        tipo: classificaPregiudizievole(descrizione),
        importo: money(p, 'amount', 'importo'),
        descrizione,
      };
    })
    .filter((p): p is Pregiudizievole => p !== null);

  const procedure = asArray(pick(rawPregiudizievoli, 'procedures', 'procedure', 'insolvencyProcedures'))
    .map((p) => {
      const dataApertura = date(p, 'openingDate', 'dataApertura', 'data');
      if (dataApertura === null) return null;
      const dataChiusura = date(p, 'closingDate', 'dataChiusura');
      return {
        tipo: normalizzaProcedura(str(p, 'type', 'tipo', 'descrizione')),
        dataApertura,
        dataChiusura,
        tribunale: str(p, 'court', 'tribunale'),
        aperta: dataChiusura === null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return fromProvider({ protesti, pregiudizievoli, procedure }, PROVIDER, service, osservatoIl);
}

function classificaPregiudizievole(descrizione: string): Pregiudizievole['tipo'] {
  const testo = descrizione.toLowerCase();
  if (testo.includes('ipoteca')) return 'ipoteca-giudiziale';
  if (testo.includes('pignoramento')) return 'pignoramento';
  if (testo.includes('sequestro')) return 'sequestro';
  if (testo.includes('domanda giudiziale')) return 'domanda-giudiziale';
  if (testo.includes('ingiuntivo')) return 'decreto-ingiuntivo';
  return 'altro';
}

export const EVENTI_NEGATIVI_ASSENTI = NESSUN_EVENTO_NEGATIVO;
