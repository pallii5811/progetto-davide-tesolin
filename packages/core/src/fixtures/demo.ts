/**
 * Azienda dimostrativa.
 *
 * PMI manifatturiera bresciana, 35 addetti, 6,5 M€ di ricavi: il profilo statisticamente
 * più rappresentativo del portafoglio di un intermediario italiano. I numeri sono coerenti
 * fra loro (lo stato patrimoniale quadra) perché la fixture serve anche da banco di prova
 * per i motori di calcolo, non solo da riempimento della UI.
 */

import { euro } from '../shared/money.js';
import { ateco, partitaIva } from '../shared/identifiers.js';
import {
  BILANCIO_DEPOSITATO,
  REGISTRO_IMPRESE,
  REGISTRO_PROTESTI,
  fromProvider,
} from '../shared/provenance.js';
import { reclassify } from '../company/financials.js';
import type { Bilancio, BilancioSintetico } from '../company/financials.js';
import type { CompanyProfile, Indirizzo } from '../company/profile.js';
import type { PolizzaInEssere } from '../coverage/policy.js';

const PROVIDER = 'OpenAPI.com';

const SEDE: Indirizzo = {
  via: 'Via dell’Industria',
  civico: '42',
  cap: '25030',
  comune: 'Adro',
  provincia: 'BS',
  regione: 'Lombardia',
  latitudine: 45.622,
  longitudine: 9.96,
};

function bilancio2025(): Bilancio {
  return {
    anno: 2025,
    dataChiusura: new Date('2025-12-31T00:00:00Z'),
    mesiEsercizio: 12,
    numeroDipendenti: 35,
    attivo: {
      creditiVersoSoci: euro(0),
      immobilizzazioniImmateriali: euro(120_000),
      terreniEFabbricati: euro(1_450_000),
      impiantiEMacchinario: euro(980_000),
      attrezzature: euro(210_000),
      altreImmobilizzazioniMateriali: euro(95_000),
      immobilizzazioniFinanziarie: euro(45_000),
      rimanenze: euro(890_000),
      creditiVersoClienti: euro(1_640_000),
      altriCrediti: euro(210_000),
      attivitaFinanziarieNonImmobilizzate: euro(0),
      disponibilitaLiquide: euro(380_000),
      rateiRiscontiAttivi: euro(35_000),
      costoStoricoImmobilizzazioniMateriali: undefined,
    },
    passivo: {
      capitaleSociale: euro(500_000),
      riserve: euro(780_000),
      utiliPortatiANuovo: euro(310_000),
      utileEsercizio: euro(240_000),
      fondiRischiOneri: euro(60_000),
      tfr: euro(340_000),
      debitiVersoBancheBreve: euro(620_000),
      debitiVersoBancheOltre: euro(1_150_000),
      debitiVersoFornitori: euro(1_420_000),
      debitiTributari: euro(185_000),
      altriDebitiBreve: euro(318_000),
      altriDebitiOltre: euro(40_000),
      rateiRiscontiPassivi: euro(92_000),
    },
    contoEconomico: {
      ricaviVendite: euro(6_480_000),
      variazioneRimanenzeProdotti: euro(45_000),
      altriRicavi: euro(78_000),
      costiMateriePrime: euro(2_850_000),
      variazioneRimanenzeMateriePrime: euro(-35_000),
      costiServizi: euro(1_180_000),
      costiGodimentoBeniTerzi: euro(96_000),
      salariStipendi: euro(1_180_000),
      oneriSocialiEAltri: euro(420_000),
      ammortamentiSvalutazioni: euro(385_000),
      accantonamenti: euro(25_000),
      oneriDiversiGestione: euro(68_000),
      proventiFinanziari: euro(4_000),
      oneriFinanziari: euro(92_000),
      rettificheAttivitaFinanziarie: euro(0),
      imposte: euro(106_000),
    },
  };
}

function bilancio2024(): Bilancio {
  const base = bilancio2025();
  return {
    ...base,
    anno: 2024,
    dataChiusura: new Date('2024-12-31T00:00:00Z'),
    numeroDipendenti: 32,
    contoEconomico: {
      ...base.contoEconomico,
      ricaviVendite: euro(5_940_000),
      variazioneRimanenzeProdotti: euro(12_000),
      altriRicavi: euro(61_000),
      costiMateriePrime: euro(2_680_000),
      variazioneRimanenzeMateriePrime: euro(-8_000),
      costiServizi: euro(1_090_000),
      salariStipendi: euro(1_075_000),
      oneriSocialiEAltri: euro(388_000),
      imposte: euro(84_000),
    },
    passivo: {
      ...base.passivo,
      utiliPortatiANuovo: euro(120_000),
      utileEsercizio: euro(190_000),
    },
  };
}

/**
 * Deriva la vista sintetica dal bilancio dettagliato.
 * Riproduce esattamente ciò che l'anagrafica estesa restituirebbe per lo stesso esercizio:
 * serve a verificare che le due strade portino alla stessa classificazione dimensionale.
 */
function sinteticoDa(b: Bilancio): BilancioSintetico {
  const r = reclassify(b);
  return {
    anno: b.anno,
    dataChiusura: b.dataChiusura,
    fatturato: r.ce.ricavi,
    patrimonioNetto: r.sp.patrimonioNetto,
    totaleAttivo: r.sp.totaleAttivo,
    costoDelPersonale: r.ce.costoDelPersonale,
    capitaleSociale: b.passivo.capitaleSociale,
    dipendenti: b.numeroDipendenti ?? null,
    retribuzioneMediaLorda: null,
  };
}

export function demoCompanyProfile(): CompanyProfile {
  const osservato = new Date('2026-07-15T00:00:00Z');
  const osservatoBilancio = new Date('2026-05-20T00:00:00Z');

  return {
    identity: {
      partitaIva: partitaIva('03158460174'),
      codiceFiscale: null,
      denominazione: 'MECCANICA BRESCIANA S.R.L.',
    },
    anagrafica: fromProvider(
      {
        formaGiuridica: 'srl',
        formaGiuridicaDescrizione: 'Società a responsabilità limitata',
        statoAttivita: 'attiva',
        dataCostituzione: new Date('2004-03-18T00:00:00Z'),
        dataInizioAttivita: new Date('2004-05-04T00:00:00Z'),
        numeroREA: 'BS-412987',
        cciaa: 'Brescia',
        atecoPrimario: ateco('25.62.00'),
        atecoPrimarioDescrizione: 'Lavori di meccanica generale',
        atecoSecondari: [ateco('28.99.99')],
        sedeLegale: SEDE,
        capitaleSocialeDeliberato: euro(500_000),
        capitaleSocialeVersato: euro(500_000),
        pec: 'meccanicabresciana@pec.it',
        sitoWeb: 'https://www.meccanicabresciana.it',
        telefono: '+39 030 1234567',
        numeroAddetti: 35,
        fatturatoDichiarato: euro(6_480_000),
      },
      PROVIDER,
      'IT-company-advanced',
      REGISTRO_IMPRESE,
      osservato,
    ),
    assetti: fromProvider(
      {
        soci: [
          {
            denominazione: 'ROSSI GIOVANNI',
            // Codice fiscale di fantasia, ma presente: è la chiave con cui il portafoglio
            // riconosce che due aziende diverse fanno capo alla stessa persona, e senza
            // di essa la modalità dimostrativa non mostrerebbe affatto quella funzione.
            codiceFiscale: 'RSSGNN70A01A944X',
            tipo: 'persona-fisica',
            quotaPercentuale: 0.6,
            quotaValore: euro(300_000),
          },
          {
            denominazione: 'ROSSI MARTA',
            codiceFiscale: 'RSSMRT75E41A944R',
            tipo: 'persona-fisica',
            quotaPercentuale: 0.4,
            quotaValore: euro(200_000),
          },
        ],
        cariche: [
          {
            nominativo: 'ROSSI GIOVANNI',
            codiceFiscale: null,
            ruolo: 'Amministratore unico',
            dataNomina: new Date('2019-04-29T00:00:00Z'),
            isRappresentanteLegale: true,
          },
        ],
        controllante: null,
        controllate: [],
      },
      PROVIDER,
      'IT-shareholders',
      REGISTRO_IMPRESE,
      osservato,
    ),
    bilanci: [
      fromProvider(bilancio2025(), PROVIDER, 'IT-balance-sheet', BILANCIO_DEPOSITATO, osservatoBilancio),
      fromProvider(bilancio2024(), PROVIDER, 'IT-balance-sheet', BILANCIO_DEPOSITATO, osservatoBilancio),
    ],
    bilanciSintetici: [sinteticoDa(bilancio2025()), sinteticoDa(bilancio2024())].map((s) =>
      fromProvider(s, PROVIDER, 'IT-advanced', BILANCIO_DEPOSITATO, osservatoBilancio),
    ),
    eventiNegativi: fromProvider(
      {
        protesti: [
          {
            data: new Date('2021-09-14T00:00:00Z'),
            importo: euro(12_400),
            tipo: 'Cambiale',
            luogo: 'Brescia',
            levato: true,
          },
        ],
        pregiudizievoli: [],
        procedure: [],
      },
      PROVIDER,
      'IT-protests',
      REGISTRO_PROTESTI,
      osservato,
    ),
    unitaLocali: fromProvider(
      [
        { tipo: 'sede-legale', indirizzo: SEDE, attivita: 'Uffici e stabilimento', addetti: 30 },
        {
          tipo: 'magazzino',
          indirizzo: { ...SEDE, via: 'Via Artigiani', civico: '7', comune: 'Erbusco' },
          attivita: 'Deposito prodotti finiti',
          addetti: 5,
        },
      ],
      PROVIDER,
      'IT-local-units',
      REGISTRO_IMPRESE,
      osservato,
    ),
    datiDichiarati: {
      immobili: [
        {
          descrizione: 'Capannone produttivo con palazzina uffici — Adro (BS)',
          indirizzo: SEDE,
          superficieMq: 2_400,
          titolo: 'proprieta',
          tipologiaCostruttiva: 'prefabbricato',
          annoCostruzione: 2006,
          presenzaImpiantoAntincendio: true,
          presenzaAllarme: true,
          compartimentazioneRei: true,
          impiantoSprinkler: true,
        },
        {
          descrizione: 'Magazzino prodotti finiti — Erbusco (BS)',
          indirizzo: { ...SEDE, via: 'Via Artigiani', civico: '7', comune: 'Erbusco' },
          superficieMq: 800,
          titolo: 'locazione',
          tipologiaCostruttiva: 'prefabbricato',
          annoCostruzione: 2012,
          compartimentazioneRei: false,
          impiantoSprinkler: false,
          presenzaImpiantoAntincendio: false,
          presenzaAllarme: true,
        },
      ],
      numeroVeicoli: 6,
      numeroDipendenti: 35,
      quotaExportPercentuale: 0.42,
      esportaVersoUsaCanada: true,
      trattaDatiPersonali: true,
      trattaDatiParticolari: false,
      haSitoEcommerce: false,
      haModello231: false,
      certificazioni: ['ISO 9001:2015'],
      numeroClientiPrincipaliSuFatturato: 5,
      concentrazionePrimoCliente: 0.31,
      lavoraInCantiere: false,
      produceBeniFinali: true,
      trasportaMerciProprie: true,
      periodoIndennizzoMesi: 12,
      propensioneAlRischio: 'equilibrata',
    },
  };
}

/**
 * Portafoglio polizze in essere, volutamente lacunoso e sottodimensionato:
 * riproduce la situazione tipica che l'analisi deve saper smascherare.
 */
export function demoPolizze(): readonly PolizzaInEssere[] {
  return [
    {
      id: 'pol-incendio',
      coverage: 'incendio',
      compagnia: 'Compagnia Alfa Assicurazioni S.p.A.',
      numeroPolizza: '2024/117/884512',
      // Capitale fermo al valore contabile: è la sottoassicurazione classica.
      sommaAssicurata: euro(2_000_000),
      massimale: null,
      franchigia: euro(2_500),
      scoperto: null,
      dataEffetto: new Date('2024-06-30T00:00:00Z'),
      dataScadenza: new Date('2026-06-30T00:00:00Z'),
      premioAnnuo: euro(4_800),
      formaGaranzia: 'valore-a-nuovo',
      note: 'Somma assicurata non aggiornata dal 2019.',
    },
    {
      id: 'pol-rct',
      coverage: 'rct',
      compagnia: 'Compagnia Alfa Assicurazioni S.p.A.',
      numeroPolizza: '2024/117/884513',
      sommaAssicurata: null,
      massimale: euro(1_000_000),
      franchigia: euro(500),
      scoperto: null,
      dataEffetto: new Date('2024-06-30T00:00:00Z'),
      dataScadenza: new Date('2026-06-30T00:00:00Z'),
      premioAnnuo: euro(3_200),
      formaGaranzia: null,
      note: null,
    },
    {
      id: 'pol-rca',
      coverage: 'rca-flotta',
      compagnia: 'Compagnia Beta S.p.A.',
      numeroPolizza: 'LM-2025-4471',
      sommaAssicurata: null,
      massimale: euro(25_000_000),
      franchigia: null,
      scoperto: null,
      dataEffetto: new Date('2025-01-01T00:00:00Z'),
      dataScadenza: new Date('2026-12-31T00:00:00Z'),
      premioAnnuo: euro(9_400),
      formaGaranzia: null,
      note: 'Libro matricola, 6 veicoli.',
    },
  ];
}

/** Data di riferimento delle analisi dimostrative. */
export const DEMO_AS_OF = new Date('2026-08-17T00:00:00Z');
