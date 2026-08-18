import { describe, expect, it } from 'vitest';
import { Money, classifySize } from '@aegis/core';
import { mappaAnagrafica, mappaAssetti, mappaBilanciSintetici } from '../src/openapi/mapper.js';
import { OpenApiProvider } from '../src/openapi/provider.js';

/**
 * Risposta reale di `GET company.openapi.com/IT-advanced/{piva}`, agosto 2026.
 *
 * L'azienda è **OpenAPI S.p.A. stessa**: dati pubblici del Registro delle Imprese, nessun
 * problema di riservatezza, e il fornitore non ha di che lamentarsi se lo si usa come
 * banco di prova del proprio servizio.
 *
 * Questo test è il presidio contro le regressioni sul confine più fragile del sistema.
 * Ogni asserzione qui sotto corrisponde a un errore che avrei potuto commettere — e a uno
 * che avevo effettivamente commesso prima di vedere la risposta vera.
 */
const RISPOSTA_REALE = {
  data: [
    {
      taxCode: '12485671007',
      vatCode: '12485671007',
      companyName: 'OPENAPI S.P.A.',
      address: {
        registeredOffice: {
          toponym: 'VIALE',
          street: 'FILIPPO TOMMASO MARINETTI',
          streetNumber: '221',
          streetName: 'VIALE FILIPPO TOMMASO MARINETTI 221',
          town: 'ROMA',
          hamlet: null,
          province: 'RM',
          zipCode: '00143',
          gps: { coordinates: [12.47843, 41.8071] },
          region: { code: '12', description: 'LAZIO' },
          townCode: 'H501',
        },
      },
      activityStatus: 'ATTIVA',
      reaCode: '1378273',
      cciaa: 'RM',
      atecoClassification: {
        ateco: { code: '621', description: "Attivita' di programmazione informatica" },
        ateco2007: { code: '6201', description: 'Produzione di software non connesso all’edizione' },
        ateco2022: { code: '6201', description: 'Produzione di software non connesso all’edizione' },
      },
      detailedLegalForm: { code: 'SP', description: "SOCIETA' PER AZIONI" },
      startDate: '2013-10-20',
      registrationDate: '2013-07-19',
      endDate: null,
      pec: 'openapi@legalmail.it',
      balanceSheets: {
        last: {
          year: 2025,
          balanceSheetDate: '2025-12-31',
          turnover: 5_696_858,
          netWorth: 1_037_925,
          employees: 19,
          shareCapital: 50_000,
          totalStaffCost: 892_478,
          totalAssets: 2_400_717,
          avgGrossSalary: 46_972,
        },
        all: [
          // L'anno in corso arriva con tutti gli aggregati a null: va scartato.
          {
            year: 2026,
            balanceSheetDate: null,
            turnover: null,
            netWorth: null,
            employees: 20,
            shareCapital: 50_000,
            totalStaffCost: null,
            totalAssets: null,
          },
          {
            year: 2025,
            balanceSheetDate: '2025-12-31',
            turnover: 5_696_858,
            netWorth: 1_037_925,
            employees: 19,
            shareCapital: 50_000,
            totalStaffCost: 892_478,
            totalAssets: 2_400_717,
            avgGrossSalary: 46_972,
          },
          {
            year: 2024,
            balanceSheetDate: '2024-12-31',
            turnover: 3_671_995,
            netWorth: 338_315,
            employees: 15,
            shareCapital: 50_000,
            totalStaffCost: 617_428,
            totalAssets: 1_118_403,
            avgGrossSalary: 41_161,
          },
        ],
      },
      shareHolders: [
        {
          companyName: 'OPEN HOLDING S.R.L.',
          name: null,
          surname: null,
          taxCode: '16935371001',
          percentShare: 100,
        },
      ],
      id: '60d1bfc731177b0a092cdfc1',
    },
  ],
  success: true,
  message: '',
  error: null,
};

/** Riproduce lo scarto dell'involucro fatto dal provider: `data` è un array. */
function contenuto(): unknown {
  return RISPOSTA_REALE.data[0];
}

const OSSERVATO = new Date('2026-08-17T00:00:00Z');

describe('Risposta reale IT-advanced', () => {
  const anagrafica = mappaAnagrafica(contenuto(), 'IT-advanced', OSSERVATO).value;

  it('riconosce la forma giuridica dal campo annidato detailedLegalForm', () => {
    expect(anagrafica.formaGiuridica).toBe('spa');
    expect(anagrafica.formaGiuridicaDescrizione).toBe("SOCIETA' PER AZIONI");
  });

  it('sceglie il codice ATECO più specifico fra le versioni disponibili', () => {
    // Sono presenti sia `621` sia `6201`: la divisione a tre cifre non distinguerebbe
    // la produzione di software dalla consulenza, e le regole di rischio ne risentirebbero.
    expect(anagrafica.atecoPrimario).toBe('62.01');
    expect(anagrafica.atecoPrimarioDescrizione).toContain('software');
  });

  it('legge l’indirizzo annidato sotto address.registeredOffice', () => {
    expect(anagrafica.sedeLegale?.comune).toBe('ROMA');
    expect(anagrafica.sedeLegale?.provincia).toBe('RM');
    expect(anagrafica.sedeLegale?.cap).toBe('00143');
    expect(anagrafica.sedeLegale?.regione).toBe('LAZIO');
    expect(anagrafica.sedeLegale?.via).toContain('MARINETTI');
  });

  it('non inverte le coordinate GeoJSON', () => {
    // `gps.coordinates` è [longitudine, latitudine]. Invertirle sposterebbe un'azienda
    // romana in mezzo alla Somalia, e con essa la valutazione del rischio territoriale.
    expect(anagrafica.sedeLegale?.latitudine).toBeCloseTo(41.8071, 3);
    expect(anagrafica.sedeLegale?.longitudine).toBeCloseTo(12.47843, 3);
  });

  it('usa registrationDate come data di costituzione', () => {
    expect(anagrafica.dataCostituzione?.getUTCFullYear()).toBe(2013);
    expect(anagrafica.dataInizioAttivita?.getUTCMonth()).toBe(9); // ottobre
  });

  it('recupera capitale, addetti e fatturato dai bilanci sintetici', () => {
    // Non sono campi anagrafici: senza questo ripiego resterebbero vuoti.
    expect(Money.toEuro(anagrafica.capitaleSocialeDeliberato!)).toBe(50_000);
    expect(anagrafica.numeroAddetti).toBe(19);
    expect(Money.toEuro(anagrafica.fatturatoDichiarato!)).toBe(5_696_858);
  });

  it('legge la PEC e il codice REA', () => {
    expect(anagrafica.pec).toBe('openapi@legalmail.it');
    expect(anagrafica.numeroREA).toBe('1378273');
    expect(anagrafica.cciaa).toBe('RM');
  });
});

describe('Bilanci sintetici da risposta reale', () => {
  const bilanci = mappaBilanciSintetici(contenuto());

  it('scarta l’esercizio in corso privo di aggregati', () => {
    expect(bilanci.map((b) => b.anno)).toEqual([2025, 2024]);
  });

  it('mappa gli aggregati in centesimi senza perdita', () => {
    const ultimo = bilanci[0]!;
    expect(Money.toEuro(ultimo.fatturato!)).toBe(5_696_858);
    expect(Money.toEuro(ultimo.patrimonioNetto!)).toBe(1_037_925);
    expect(Money.toEuro(ultimo.totaleAttivo!)).toBe(2_400_717);
    expect(Money.toEuro(ultimo.costoDelPersonale!)).toBe(892_478);
    expect(ultimo.dipendenti).toBe(19);
  });

  it('consente la classificazione dimensionale UE senza il bilancio dettagliato', () => {
    const ultimo = bilanci[0]!;
    const dimensione = classifySize({
      addetti: ultimo.dipendenti,
      fatturato: ultimo.fatturato,
      totaleAttivo: ultimo.totaleAttivo,
    });
    // 19 addetti, 5,7 M€ di fatturato, 2,4 M€ di attivo → piccola impresa.
    // È il dato che determina la scadenza dell'obbligo CAT NAT.
    expect(dimensione.value).toBe('piccola');
    expect(dimensione.confidence).toBe('alta');
  });
});

describe('Soci da risposta reale', () => {
  const assetti = mappaAssetti(contenuto(), 'IT-advanced', OSSERVATO).value;

  it('legge il socio unico persona giuridica dal campo shareHolders', () => {
    expect(assetti.soci).toHaveLength(1);
    expect(assetti.soci[0]?.denominazione).toBe('OPEN HOLDING S.R.L.');
    expect(assetti.soci[0]?.tipo).toBe('persona-giuridica');
  });

  it('converte percentShare da punti percentuali a quota', () => {
    expect(assetti.soci[0]?.quotaPercentuale).toBeCloseTo(1, 6);
  });
});

/**
 * Risposta reale di `GET company.openapi.com/IT-start/{piva}`, agosto 2026.
 *
 * È la risposta che serve la **ricerca**, ed è più povera di IT-advanced: niente ATECO,
 * niente bilanci. Ma la sede sta nello stesso posto — annidata due livelli sotto — e
 * l'`id` è l'identificativo interno del fornitore, non la partita IVA.
 */
const RICERCA_REALE = {
  data: [
    {
      taxCode: '12485671007',
      vatCode: '12485671007',
      companyName: 'OPENAPI S.P.A.',
      address: {
        registeredOffice: {
          toponym: 'VIALE',
          street: 'FILIPPO TOMMASO MARINETTI',
          streetNumber: '221',
          streetName: 'VIALE FILIPPO TOMMASO MARINETTI 221',
          town: 'ROMA',
          hamlet: null,
          province: 'RM',
          zipCode: '00143',
          gps: { coordinates: [12.47843, 41.8071] },
          region: { code: '12', description: 'LAZIO' },
          townCode: 'H501',
        },
      },
      activityStatus: 'ATTIVA',
      registrationDate: '2013-07-19',
      sdiCode: 'USAL8PV',
      id: '60d1bfc731177b0a092cdfc1',
    },
  ],
  success: true,
  message: '',
  error: null,
};

/**
 * La ricerca, provata sulla risposta vera.
 *
 * Questi test nascono da un guasto visto dall'utente e non dai collaudi: cercando una
 * partita IVA reale, la tabella mostrava «—» sotto *Sede*. In modalità dimostrativa non
 * poteva emergere, perché il fornitore finto costruisce il risultato di ricerca già
 * pronto e non attraversa mai il mapper.
 *
 * La lezione è nel punto di attacco: si prova il **provider**, con la risposta del
 * fornitore, non l'oggetto che il finto restituisce a se stesso.
 */
describe('Ricerca sulla risposta reale IT-start', () => {
  function provider(): OpenApiProvider {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(RICERCA_REALE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as unknown as typeof fetch;

    return new OpenApiProvider({ token: 'token-di-prova', fetchImpl });
  }

  it('legge la sede annidata in address.registeredOffice', async () => {
    const [trovata] = await provider().search({ partitaIva: '12485671007' });

    // Il guasto: `address` e `registeredOffice` cercati come alternative invece che
    // come livelli. La ricerca si fermava su `address`, che esiste ma è un contenitore.
    expect(trovata?.comune).toBe('ROMA');
    expect(trovata?.provincia).toBe('RM');
  });

  it('usa la partita IVA come identificativo, non l\u2019id interno del fornitore', async () => {
    const [trovata] = await provider().search({ partitaIva: '12485671007' });

    // `providerId` finisce nel collegamento «Analizza» e nella chiave d'archivio: con
    // l'id interno l'azienda non verrebbe riconosciuta e si ricomprerebbe ogni volta.
    expect(trovata?.providerId).toBe('12485671007');
    expect(trovata?.providerId).not.toBe('60d1bfc731177b0a092cdfc1');
  });

  it('riporta denominazione e stato di attività dichiarati', async () => {
    const [trovata] = await provider().search({ partitaIva: '12485671007' });

    expect(trovata?.denominazione).toBe('OPENAPI S.P.A.');
    // `activityStatus` è una stringa, non un booleano: letta come booleano ricadeva
    // sempre su «attiva», anche per un'impresa cessata.
    expect(trovata?.statoAttivita).toBe('attiva');
    expect(trovata?.attiva).toBe(true);
  });

  it('non inventa l\u2019ATECO che IT-start non contiene', async () => {
    const [trovata] = await provider().search({ partitaIva: '12485671007' });

    // Dichiararlo assente è corretto: arriva con l'anagrafica estesa, che si paga.
    expect(trovata?.ateco).toBeNull();
  });

  it('riconosce come non attiva un\u2019impresa cessata', async () => {
    const cessata = {
      ...RICERCA_REALE,
      data: [{ ...RICERCA_REALE.data[0], activityStatus: 'CESSATA' }],
    };
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(cessata), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as unknown as typeof fetch;

    const [trovata] = await new OpenApiProvider({ token: 't', fetchImpl }).search({
      partitaIva: '12485671007',
    });

    expect(trovata?.statoAttivita).toBe('cessata');
    expect(trovata?.attiva).toBe(false);
  });
});

/**
 * Cercare e poi analizzare deve costare una volta sola.
 *
 * `IT-start` e `IT-advanced` costano entrambi dieci centesimi, ma il secondo contiene il
 * primo. Comprare l'anagrafica minima per la ricerca e poi quella estesa per l'analisi
 * significa pagare venti centesimi per dieci centesimi di dato — su un portafoglio da
 * cinquecento aziende sono cinquanta euro buttati.
 *
 * La cache è indicizzata sull'URL: se la ricerca compra già `IT-advanced`, l'analisi che
 * segue trova la risposta e non chiama nessuno.
 */
describe('Costo di una ricerca seguita da analisi', () => {
  it('la ricerca per partita IVA acquista l’anagrafica estesa, non quella minima', async () => {
    const chiamate: string[] = [];
    const fetchImpl = ((url: string): Promise<Response> => {
      chiamate.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify(RISPOSTA_REALE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    await new OpenApiProvider({ token: 't', fetchImpl }).search({ partitaIva: '12485671007' });

    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]).toContain('/IT-advanced/');
    expect(chiamate[0]).not.toContain('/IT-start/');
  });

  it('l’analisi successiva non ricompra ciò che la ricerca ha già pagato', async () => {
    const { MemoryCache, MemoryCostLedger } = await import('../src/http.js');
    const cache = new MemoryCache();
    const ledger = new MemoryCostLedger();

    let richieste = 0;
    const fetchImpl = ((): Promise<Response> => {
      richieste++;
      return Promise.resolve(
        new Response(JSON.stringify(RISPOSTA_REALE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const provider = new OpenApiProvider({ token: 't', fetchImpl, cache, ledger });
    await provider.search({ partitaIva: '12485671007' });
    await provider.fetchProfile('12485671007', 'esteso');

    // Una sola chiamata in rete per due operazioni: è la differenza fra dieci e venti
    // centesimi, ed è il motivo per cui la ricerca compra il servizio più ricco.
    expect(richieste).toBe(1);
    expect(ledger.totaleCentesimi()).toBe(10);
  });
});
