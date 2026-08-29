import { describe, expect, it } from 'vitest';
import { Money, classifySize } from '@aegis/core';
import { mappaAnagrafica, mappaAssetti, mappaBilanciSintetici } from '../src/openapi/mapper.js';
import { OpenApiProvider } from '../src/openapi/provider.js';
import { MemoryCostLedger } from '../src/http.js';
import { mappaNegativita } from '../src/openapi/negativita.js';

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

/**
 * L'indirizzo, che si legge sul documento consegnato al cliente.
 *
 * `streetName` arriva **già composto** con toponimo e civico. Usarlo come nome della via
 * e affiancargli `streetNumber` stampa il civico due volte su ogni indirizzo reale:
 * «VIALE FILIPPO TOMMASO MARINETTI 221 221». Non è un errore di calcolo, è un errore che
 * si vede — e finisce sul fascicolo di adeguatezza.
 */
describe('Indirizzo dalla risposta reale', () => {
  const anagrafica = mappaAnagrafica(RISPOSTA_REALE.data[0], 'IT-advanced', OSSERVATO);

  it('separa il nome della via dal civico', () => {
    expect(anagrafica.value.sedeLegale?.via).toBe('VIALE FILIPPO TOMMASO MARINETTI');
    expect(anagrafica.value.sedeLegale?.civico).toBe('221');
  });

  it('non ripete il civico dentro il nome della via', () => {
    const via = anagrafica.value.sedeLegale?.via ?? '';
    const civico = anagrafica.value.sedeLegale?.civico ?? '';
    expect(via.endsWith(civico)).toBe(false);
  });

  it('conserva le coordinate, che servono a misurare la contiguità fra le sedi', () => {
    expect(anagrafica.value.sedeLegale?.latitudine).toBeCloseTo(41.8071, 3);
    expect(anagrafica.value.sedeLegale?.longitudine).toBeCloseTo(12.47843, 3);
  });
});

/**
 * Ricerca di prospect: contare non deve costare.
 *
 * Il servizio `/IT-search` espone una modalità `dryRun` che il fornitore dichiara
 * gratuita e che restituisce solo **quante** aziende corrispondono e quanto costerebbe
 * l'elenco. È il meccanismo su cui poggia l'intera funzione: senza, comporre una ricerca
 * per tentativi costerebbe un centesimo a tentativo — poco, ma abbastanza da far
 * smettere di provare.
 *
 * La risposta qui sotto è quella reale osservata su `province=BS`.
 */
const CONTEGGIO_REALE = { data: [], count: 3488, cost: 0.01, success: true, message: '', error: null };

describe('Prospezione: il conteggio è gratuito', () => {
  function provider(risposta: unknown, chiamate: string[]) {
    const fetchImpl = ((url: string): Promise<Response> => {
      chiamate.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify(risposta), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const ledger = new MemoryCostLedger();
    return { provider: new OpenApiProvider({ token: 't', fetchImpl, ledger }), ledger };
  }

  it('in sola conta non addebita nulla', async () => {
    const chiamate: string[] = [];
    const { provider: p, ledger } = provider(CONTEGGIO_REALE, chiamate);

    const esito = await p.cercaProspect({ provincia: 'BS', addettiMin: 20 }, { soloConteggio: true });

    expect(esito.totale).toBe(3488);
    expect(esito.aziende).toEqual([]);
    // Zero, non «poco»: è la promessa fatta all'utente nella pagina.
    expect(ledger.totaleCentesimi()).toBe(0);
    expect(chiamate[0]).toContain('dryRun=1');
  });

  it('riporta il prezzo dichiarato dal fornitore, non quello scritto nel listino', async () => {
    const chiamate: string[] = [];
    const { provider: p } = provider({ ...CONTEGGIO_REALE, cost: 0.05 }, chiamate);

    const esito = await p.cercaProspect({ provincia: 'BS' }, { soloConteggio: true });

    // Fidarsi del listino nel codice significherebbe accorgersi di un aumento di prezzo
    // solo a fine mese, leggendo il residuo del credito.
    expect(esito.costoElencoCentesimi).toBe(5);
  });

  it('l’elenco vero non chiede il dryRun e arricchisce i risultati', async () => {
    const chiamate: string[] = [];
    const { provider: p } = provider(RICERCA_REALE, chiamate);

    const esito = await p.cercaProspect({ provincia: 'RM' });

    expect(esito.soloConteggio).toBe(false);
    expect(esito.aziende).toHaveLength(1);
    expect(chiamate[0]).not.toContain('dryRun');
    // Senza arricchimento il servizio restituisce **solo gli identificativi interni**:
    // un elenco di stringhe opache, che si paga e non si può mostrare.
    expect(chiamate[0]).toContain('dataEnrichment=start');
  });

  it('addebita ciò che il fornitore dichiara, non il lotto richiesto', async () => {
    const chiamate: string[] = [];
    // Si chiedono venticinque aziende, il fornitore ne restituisce una e dichiara di
    // aver fatto pagare cinque centesimi.
    const { provider: p, ledger } = provider({ ...RICERCA_REALE, cost: 0.05 }, chiamate);

    await p.cercaProspect({ provincia: 'RM', limite: 25 });

    // Registrare la stima farebbe comparire nel registro 1,25 € mai addebitati: il
    // consuntivo di spesa smetterebbe di corrispondere all'estratto conto del fornitore.
    expect(ledger.totaleCentesimi()).toBe(5);
  });

  it('in assenza di prezzo dichiarato resta la stima prudenziale', async () => {
    const chiamate: string[] = [];
    const senzaCosto = { data: RICERCA_REALE.data, success: true, message: '', error: null };
    const { provider: p, ledger } = provider(senzaCosto, chiamate);

    await p.cercaProspect({ provincia: 'RM', limite: 10 });

    // Dieci record a cinque centesimi: meglio sovrastimare che tacere una spesa.
    expect(ledger.totaleCentesimi()).toBe(50);
  });

  it('toglie i punti dal codice ATECO, che il fornitore confronta senza', async () => {
    const chiamate: string[] = [];
    const { provider: p } = provider(CONTEGGIO_REALE, chiamate);

    await p.cercaProspect({ provincia: 'BS', ateco: '25.62.00' }, { soloConteggio: true });

    // Verificato sul servizio reale: «25.62.00» restituisce zero aziende, «256200» pure,
    // «2562» ne restituisce sessantuno. Inviare il codice punteggiato è un filtro che
    // non trova mai nulla — e sembra un'assenza di aziende, non un errore di formato.
    expect(chiamate[0]).toContain('atecoCode=256200');
    expect(chiamate[0]).not.toContain('25.62.00');
  });

  it('non spedisce i filtri lasciati in bianco', async () => {
    const chiamate: string[] = [];
    const { provider: p } = provider(CONTEGGIO_REALE, chiamate);

    await p.cercaProspect({ provincia: 'BS' }, { soloConteggio: true });

    expect(chiamate[0]).not.toContain('minEmployees');
    expect(chiamate[0]).not.toContain('companyName');
  });
});

/**
 * Eventi negativi, sulla risposta reale.
 *
 * Il servizio è asincrono e si paga all'apertura della pratica: quarantacinque centesimi
 * per accertare protesti, pregiudizievoli e procedure concorsuali. È il fattore che pesa
 * il **20% dello score di credito**, e finché non era collegato quel venti per cento
 * restava «non valutabile» su ogni azienda analizzata.
 *
 * La risposta qui sotto è quella vera osservata su OPENAPI S.p.A.: nessun evento negativo.
 * La forma è quella che conta — gli elenchi arrivano `null`, non come array vuoti.
 */
const NEGATIVITA_REALE = {
  data: {
    presenzaPregiudizievoli: false,
    pregiudizievoli: null,
    presenzaProcedure: false,
    procedure: null,
    presenzaProtesti: false,
    protesti: null,
  },
  success: true,
  message: '',
  error: null,
};

describe('Eventi negativi sulla risposta reale', () => {
  const OSSERVATO_ORA = new Date('2026-08-19T00:00:00Z');

  it('legge «nessun evento» senza scambiarlo per «non verificato»', () => {
    const eventi = mappaNegativita(NEGATIVITA_REALE, OSSERVATO_ORA);

    /*
      La distinzione è tutta qui. «Nessun protesto» è un'informazione **positiva** che alza
      lo score; «non ho potuto controllare» lo lascia indeterminato. Confonderle significa
      premiare un'azienda mai verificata come se fosse risultata pulita.
    */
    expect(eventi.value.protesti).toEqual([]);
    expect(eventi.value.pregiudizievoli).toEqual([]);
    expect(eventi.value.procedure).toEqual([]);
  });

  it('regge gli elenchi nulli, che è come il fornitore dichiara l’assenza', () => {
    // Il servizio non manda array vuoti: manda `null`. Un mapper che si aspetta un array
    // solleverebbe qui, e l'analisi perderebbe il fattore che ha appena pagato.
    expect(() => mappaNegativita(NEGATIVITA_REALE, OSSERVATO_ORA)).not.toThrow();
  });

  it('conserva la provenienza e il momento dell’accertamento', () => {
    const eventi = mappaNegativita(NEGATIVITA_REALE, OSSERVATO_ORA);

    // Un accertamento senza data non vale nulla in un fascicolo: i protesti di oggi non
    // sono quelli di sei mesi fa.
    expect(eventi.observedAt).toEqual(OSSERVATO_ORA);
    expect(eventi.source.kind).toBe('provider');
  });
});

/*
  Una risposta reale con procedure **davvero presenti**.

  Acciaierie d'Italia S.p.A., 20 agosto 2026, quarantacinque centesimi. Il campione
  precedente aveva tutti gli elenchi vuoti: confermava che «nessun evento» venisse letto
  bene, e non poteva dire nulla su come vengono letti gli eventi che ci sono. Bastava,
  finché non è arrivata questa — e questa ha fatto emergere tre difetti in una volta.

  Le persone coinvolte e gli indirizzi di residenza, che la risposta vera riporta, sono
  stati tolti: sono dati personali di persone fisiche e non hanno motivo di stare in un
  archivio di codice. Il mappatore non li legge, quindi il valore del collaudo non cambia.
*/
const NEGATIVITA_CON_PROCEDURE = {
  data: {
    presenzaPregiudizievoli: false,
    pregiudizievoli: null,
    presenzaProcedure: true,
    procedure: [
      {
        identificativo_procedura: '3828317',
        cciaa: 'MI',
        numero_rea: '2525101',
        progressivo_procedura: 4,
        domanda_ammissione_concordato: false,
        accordo_ristrutturazione_debiti: false,
        codice_procedura: 'SI',
        descrizione_procedura: 'STATO DI INSOLVENZA',
        codice_natura_giuridica: 'SP',
        natura_giuridica: "SOCIETA' PER AZIONI",
        data_provvedimento: '2024-02-29',
        data_chiusura: null,
        data_revoca: null,
        data_esecuzione: null,
        data_omologa: null,
        data_caricamento: '2024-02-29',
        denominazione: "ACCIAIERIE D'ITALIA S.P.A.",
        codice_fiscale: '10354890963',
        codice_comune_tribunale: null,
        tribunale: '',
        provincia_tribunale: null,
        riferimento_sentenza: '',
        commento: '',
      },
      {
        identificativo_procedura: '3821336',
        cciaa: 'MI',
        numero_rea: '2525101',
        progressivo_procedura: 3,
        domanda_ammissione_concordato: false,
        accordo_ristrutturazione_debiti: false,
        codice_procedura: 'AM',
        descrizione_procedura: 'AMMINISTRAZIONE STRAORDINARIA GRANDI IMPRESE',
        codice_natura_giuridica: 'SP',
        natura_giuridica: "SOCIETA' PER AZIONI",
        data_provvedimento: '2024-02-20',
        data_chiusura: null,
        data_revoca: null,
        data_esecuzione: null,
        data_omologa: null,
        data_caricamento: '2024-02-22',
        denominazione: "ACCIAIERIE D'ITALIA S.P.A.",
        codice_fiscale: '10354890963',
        codice_comune_tribunale: null,
        tribunale: '',
        provincia_tribunale: null,
        riferimento_sentenza: '',
        commento: '',
      },
      {
        identificativo_procedura: '3817499',
        cciaa: 'MI',
        numero_rea: '2525101',
        progressivo_procedura: 1,
        domanda_ammissione_concordato: false,
        accordo_ristrutturazione_debiti: false,
        codice_procedura: 'PU',
        descrizione_procedura: 'PROCEDIMENTO UNITARIO',
        codice_natura_giuridica: 'SP',
        natura_giuridica: "SOCIETA' PER AZIONI",
        data_provvedimento: '2024-02-17',
        data_chiusura: '2024-02-29',
        data_revoca: null,
        data_esecuzione: null,
        data_omologa: null,
        data_caricamento: '2024-02-19',
        denominazione: "ACCIAIERIE D'ITALIA S.P.A.",
        codice_fiscale: '10354890963',
        codice_comune_tribunale: null,
        tribunale: null,
        provincia_tribunale: '',
        riferimento_sentenza: '',
        commento: null,
      },
      {
        identificativo_procedura: '3817502',
        cciaa: 'MI',
        numero_rea: '2525101',
        progressivo_procedura: 2,
        domanda_ammissione_concordato: false,
        accordo_ristrutturazione_debiti: false,
        codice_procedura: 'WZ',
        descrizione_procedura: 'MISURE CAUTELARI E PROTETTIVE',
        codice_natura_giuridica: 'SP',
        natura_giuridica: "SOCIETA' PER AZIONI",
        data_provvedimento: '2024-02-17',
        data_chiusura: null,
        data_revoca: '2024-02-29',
        data_esecuzione: null,
        data_omologa: null,
        data_caricamento: '2024-02-19',
        denominazione: "ACCIAIERIE D'ITALIA S.P.A.",
        codice_fiscale: '10354890963',
        codice_comune_tribunale: null,
        tribunale: null,
        provincia_tribunale: '',
        riferimento_sentenza: '',
        commento: null,
      },
    ],
    presenzaProtesti: false,
    protesti: null,
  },
  success: true,
  message: '',
  error: null,
};

describe('Procedure concorsuali su una risposta reale che ne contiene', () => {
  const OSSERVATO_ORA = new Date('2026-08-20T00:00:00Z');
  const eventi = () => mappaNegativita(NEGATIVITA_CON_PROCEDURE, OSSERVATO_ORA).value;

  it('legge tutte e quattro le procedure invece di scartarle', () => {
    /*
      Il primo difetto, e il più grave: i nomi dei campi erano **ipotizzati**.

      La funzione cercava `dataApertura` e `openingDate`; il registro scrive
      `data_provvedimento`. Nessuna corrispondenza, ogni voce scartata per data mancante,
      elenco vuoto. E poiché l'indicatore `presenzaProcedure` diceva di sì, il prodotto
      dichiarava «procedure presenti, dettaglio non fornito» **avendo il dettaglio in mano**.

      Su un'impresa in amministrazione straordinaria è la differenza fra un documento che
      dice «risulta qualcosa, da verificare» e uno che dice cosa e da quando.
    */
    expect(eventi().procedure).toHaveLength(4);
    expect(eventi().presenzaDichiarataSenzaDettaglio).toEqual([]);
  });

  it('chiama lo stato di insolvenza col suo nome, non «altro»', () => {
    /*
      Il secondo difetto. Lo stato di insolvenza è il presupposto della liquidazione
      giudiziale: su un prodotto che valuta il merito di credito, finire nel secchio
      generico è la classificazione peggiore che si possa sbagliare.
    */
    const tipi = eventi().procedure.map((p) => p.tipo);
    expect(tipi).toContain('stato-insolvenza');
    expect(tipi).toContain('amministrazione-straordinaria');
    expect(tipi).toContain('misure-protettive');
  });

  it('non considera aperta una procedura che è stata revocata', () => {
    /*
      Il terzo difetto, e il più insidioso: le misure cautelari hanno `data_chiusura`
      vuota e `data_revoca` al 29 febbraio 2024. Guardando la sola chiusura risultavano
      aperte, e `aperta` **azzera il punteggio di credito**.

      Qui l'impresa era comunque insolvente, quindi l'esito non cambiava. Su un'impresa il
      cui unico provvedimento fosse stato revocato, avremmo negato il fido a un'azienda
      risanata — e nessun collaudo avrebbe potuto accorgersene.
    */
    const revocata = eventi().procedure.find((p) => p.dataRevoca !== null);
    expect(revocata, 'la procedura revocata deve essere riconosciuta come tale').toBeDefined();
    expect(revocata?.aperta).toBe(false);

    // Le due che sono davvero in corso restano aperte: la correzione non le ha spente.
    expect(eventi().procedure.filter((p) => p.aperta)).toHaveLength(2);
  });

  it('conserva la dicitura del registro, parola per parola', () => {
    // È la formulazione che si cita in un fascicolo: «STATO DI INSOLVENZA» detto dal
    // registro regge una contestazione, la nostra etichetta no.
    const insolvenza = eventi().procedure.find((p) => p.tipo === 'stato-insolvenza');
    expect(insolvenza?.descrizione).toBe('STATO DI INSOLVENZA');
    expect(insolvenza?.dataApertura).toEqual(new Date('2024-02-29'));
  });

  it('dichiara il tribunale mancante invece di inventarlo', () => {
    // Il registro manda `tribunale: ""`. Una stringa vuota stampata in un documento è
    // peggio di un'assenza dichiarata: sembra un dato, e non lo è.
    expect(eventi().procedure.every((p) => p.tribunale === null)).toBe(true);
  });
});

describe('Persona fisica o società: lo dice il codice fiscale', () => {
  /*
    Il fornitore scrive i nomi delle persone nel campo della ragione sociale.

    Osservato su una risposta reale il 21/08/2026: MARELLA ROBERTO, socio all'88% di una
    S.r.l. bresciana, arrivava come `companyName` con codice fiscale MRLRRT50R05G264N —
    sedici caratteri, cioè una persona. La regola precedente guardava quale campo fosse
    valorizzato e lo classificava persona giuridica.

    Non è un'etichetta sbagliata e basta. Il titolare effettivo si determina risalendo la
    catena fino a una persona fisica (art. 20 D.Lgs. 231/2007): con la persona scambiata
    per società la catena non si chiude, il prodotto dichiara il titolare «non
    determinabile» e propone la visura da 1,10 € per un dato che ha già.
  */
  const socioDa = async (payload: unknown) => {
    const { mappaAssetti } = await import('../src/openapi/mapper.js');
    return mappaAssetti(payload, new Date('2026-08-21T00:00:00Z')).value.soci[0];
  };

  it('un nome di persona nel campo ragione sociale resta una persona fisica', async () => {
    const socio = await socioDa({
      shareHolders: [
        {
          companyName: 'MARELLA ROBERTO',
          name: null,
          surname: null,
          taxCode: 'MRLRRT50R05G264N',
          percentShare: 88,
        },
      ],
    });

    expect(socio?.tipo, 'sedici caratteri alfanumerici sono una persona fisica').toBe('persona-fisica');
    expect(socio?.codiceFiscale).toBe('MRLRRT50R05G264N');
  });

  it('undici cifre restano una società, anche senza nome e cognome', async () => {
    const socio = await socioDa({
      shareHolders: [
        {
          companyName: "ACCIAIERIE D'ITALIA HOLDING S.P.A.",
          name: null,
          surname: null,
          taxCode: '09520030967',
          percentShare: 100,
        },
      ],
    });

    expect(socio?.tipo).toBe('persona-giuridica');
  });
});
