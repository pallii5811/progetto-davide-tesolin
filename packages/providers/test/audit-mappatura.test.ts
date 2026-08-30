/**
 * Corsia 3 dell'audit: la mappatura di OpenAPI.com.
 *
 * Ogni blocco qui sotto corrisponde a un difetto numerato del rapporto, e ognuno è stato
 * visto **rosso** sul codice non corretto prima di essere reso verde. Le risposte usate
 * sono quelle registrate in `.sonda`, cioè quelle vere: nessuna chiamata a pagamento è
 * stata fatta per scriverli.
 *
 * Le asserzioni sono formulate sul dato che l'intermediario legge a schermo, non sulla
 * forma interna: è quello che il committente paga, ed è quello che, sbagliato, gli fa
 * quotare un capannone che non esiste più.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INDICATORI_FORNITORE_VUOTI } from '@aegis/core';
import {
  mappaAnagrafica,
  mappaAssetti,
  mappaProfiloCompleto,
  normalizzaStatoAttivita,
} from '../src/openapi/mapper.js';
import { fondiIndicatori, mappaIndicatoriFornitore } from '../src/openapi/indicatori.js';
import { mappaNegativita } from '../src/openapi/negativita.js';
import { OpenApiProvider } from '../src/openapi/provider.js';

const OSSERVATO = new Date('2026-08-29T00:00:00Z');
const SONDA = join(process.cwd(), '.sonda');
const conSonda = existsSync(SONDA);

function sonda(file: string): unknown {
  return JSON.parse(readFileSync(join(SONDA, file), 'utf8'));
}

/** Scarta l'involucro `{ success, data }`, come fa il provider. */
function contenuto(risposta: unknown, indice = 0): unknown {
  const dati = (risposta as { data: unknown }).data;
  return Array.isArray(dati) ? dati[indice] : dati;
}

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 2 — la quota del socio
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 2 · quota del socio', () => {
  function quote(soci: readonly unknown[]): readonly (number | null)[] {
    return mappaAssetti({ shareHolders: soci }, 'IT-advanced', OSSERVATO).value.soci.map(
      (s) => s.quotaPercentuale,
    );
  }

  it('legge in punti percentuali la compagine che somma a cento', () => {
    // Il caso del rapporto: 99 % diventava «0,99 %» e con lui cadevano il controllo
    // societario, l'art. 2497 e il titolare effettivo.
    expect(
      quote([
        { companyName: 'ALFA HOLDING SPA', taxCode: '12485671007', percentShare: 99 },
        { name: 'MARIO', surname: 'ROSSI', taxCode: 'RSSMRA80A01H501U', percentShare: 1 },
      ]),
    ).toEqual([99, 1]);
  });

  it('la compagine letta somma a cento, come quella comprata', () => {
    // È il controllo che il lettore può fare: prima sommava a 1,99 — cioè né cento né uno.
    const somma = quote([
      { companyName: 'ALFA HOLDING SPA', taxCode: '12485671007', percentShare: 99 },
      { name: 'MARIO', surname: 'ROSSI', taxCode: 'RSSMRA80A01H501U', percentShare: 1 },
    ]).reduce<number>((t, q) => t + (q ?? 0), 0);
    expect(somma).toBeCloseTo(100, 6);
  });

  it('conserva il socio unico al cento per cento', () => {
    expect(
      quote([{ companyName: 'OPEN HOLDING S.R.L.', taxCode: '16935371001', percentShare: 100 }]),
    ).toEqual([100]);
  });

  it('riconosce una compagine espressa in frazioni e la riporta a punti', () => {
    // Se un domani il fornitore rispondesse in frazioni, la decisione si prende
    // sull'intera compagine — mai sul singolo valore.
    expect(
      quote([
        { name: 'MARIO', surname: 'ROSSI', taxCode: 'RSSMRA80A01H501U', sharePercentage: 0.6 },
        { companyName: 'HOLDING SRL', taxCode: '12485671007', sharePercentage: 0.4 },
      ]),
    ).toEqual([60, 40]);
  });

  it('lascia null la quota non dichiarata', () => {
    expect(quote([{ companyName: 'HOLDING SRL', taxCode: '12485671007' }])).toEqual([null]);
  });

  it.runIf(conSonda)('sulla compagine reale 88/6/6 restituisce punti percentuali', () => {
    const assetti = mappaAssetti(contenuto(sonda('prod-IT-full-01528120981.json')), 'IT-full', OSSERVATO);
    expect(assetti.value.soci.map((s) => s.quotaPercentuale)).toEqual([88, 6, 6]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 61 — lo stato di attività risponde in inglese
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 61 · stato di attività', () => {
  it('riconosce le diciture inglesi che IT-full restituisce davvero', () => {
    expect(normalizzaStatoAttivita('Enable')).toBe('attiva');
    expect(normalizzaStatoAttivita('Out of business (in a positive way)')).toBe('cessata');
  });

  it('riconosce le altre diciture inglesi del registro', () => {
    expect(normalizzaStatoAttivita('Bankruptcy')).toBe('fallita');
    expect(normalizzaStatoAttivita('In liquidation')).toBe('in-liquidazione');
    expect(normalizzaStatoAttivita('Suspended')).toBe('sospesa');
    expect(normalizzaStatoAttivita('Inactive')).toBe('inattiva');
    expect(normalizzaStatoAttivita('Ceased')).toBe('cessata');
  });

  it('continua a riconoscere le diciture italiane', () => {
    expect(normalizzaStatoAttivita('ATTIVA')).toBe('attiva');
    expect(normalizzaStatoAttivita('CESSATA')).toBe('cessata');
    expect(normalizzaStatoAttivita('IN LIQUIDAZIONE')).toBe('in-liquidazione');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 15 — l'unità locale cessata
// ─────────────────────────────────────────────────────────────────────────────

describe.runIf(conSonda)('Difetto 15 · unità locali cessate', () => {
  const profilo = mappaProfiloCompleto(contenuto(sonda('prod-IT-full-01528120981.json')));

  it('non mostra come ubicazione operativa una sede cessata', () => {
    /*
      La risposta porta quattro sedi nello stesso comune o vicino: la legale in VIA ENRICO
      FERMI, due unità attive, e una in VIA ENRICO BERLINGUER dichiarata «Out of business».
      È quella su cui un intermediario quoterebbe incendio e sisma senza saperlo.
    */
    const vie = profilo.unitaLocali.map((u) => u.indirizzo.via);
    expect(vie).not.toContain('VIA ENRICO BERLINGUER');
    expect(vie).toContain('VIA ENRICO FERMI');
  });

  it('il numero di ubicazioni torna con quello dichiarato dal fornitore', () => {
    // `branches.numberOfBranches` vale 2: due unità locali più la sede legale.
    expect(profilo.unitaLocali).toHaveLength(3);
    expect(profilo.unitaLocali.filter((u) => u.tipo !== 'sede-legale')).toHaveLength(2);
  });

  it('una sede senza stato dichiarato resta: l’assenza non è una cessazione', () => {
    const senzaStato = mappaProfiloCompleto({
      allOffices: [{ address: { town: 'BRESCIA', streetName: 'VIA ROMA, 1', zipCode: '25100' } }],
    });
    expect(senzaStato.unitaLocali).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetti 42 e 43 — l'attività e gli addetti della sede
// ─────────────────────────────────────────────────────────────────────────────

describe.runIf(conSonda)('Difetti 42-43 · campi della sede', () => {
  const profilo = mappaProfiloCompleto(contenuto(sonda('prod-IT-full-01528120981.json')));

  it('non spaccia per «attività» la descrizione inglese del tipo di sede', () => {
    // Era «Local units»: il tipo di sede, in inglese, messo dove va l'attività svolta.
    for (const u of profilo.unitaLocali) {
      expect(u.attivita).not.toBe('Local units');
      expect(u.attivita).not.toBe('Administrative headquarter and registered office');
    }
  });

  it('gli addetti per sede restano null, e la risposta conferma che non ci sono', () => {
    /*
      La chiave che il codice leggeva non esiste in nessuna voce di `allOffices`: il campo
      fingeva di essere letto. Qui si verificano tutt'e due le metà — che il valore resti
      `null` e che il fornitore davvero non lo mandi. Se un domani lo mandasse, la seconda
      asserzione diventa rossa e qualcuno lo mappa, invece di continuare a leggere il nulla.
    */
    const sedi = (contenuto(sonda('prod-IT-full-01528120981.json')) as { allOffices: unknown[] })
      .allOffices;
    for (const sede of sedi) {
      expect(Object.keys(sede as object)).not.toContain('employees');
    }
    for (const u of profilo.unitaLocali) expect(u.addetti).toBeNull();
  });

  it('la sede legale resta riconosciuta dal codice SSL', () => {
    expect(profilo.unitaLocali.some((u) => u.tipo === 'sede-legale')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 16 — gli addetti dell'ultimo esercizio
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 16 · numero di addetti', () => {
  it('usa l’esercizio più recente che dichiara gli addetti, non quello con gli aggregati', () => {
    const anagrafica = mappaAnagrafica(
      {
        balanceSheets: {
          all: [
            { year: 2026, employees: 9762, turnover: null, netWorth: null, totalAssets: null },
            { year: 2022, employees: 10133, turnover: 5_426_929_109, totalAssets: 5_363_442_929 },
          ],
        },
      },
      'IT-advanced',
      OSSERVATO,
    );
    expect(anagrafica.value.numeroAddetti).toBe(9762);
  });

  it('resta null quando nessun esercizio dichiara gli addetti', () => {
    const anagrafica = mappaAnagrafica(
      { balanceSheets: { all: [{ year: 2025, turnover: 1000, employees: null }] } },
      'IT-advanced',
      OSSERVATO,
    );
    expect(anagrafica.value.numeroAddetti).toBeNull();
  });

  it('il campo anagrafico, quando c’è, ha la precedenza sul bilancio', () => {
    const anagrafica = mappaAnagrafica(
      { employees: 41, balanceSheets: { all: [{ year: 2025, turnover: 1000, employees: 19 }] } },
      'IT-advanced',
      OSSERVATO,
    );
    expect(anagrafica.value.numeroAddetti).toBe(41);
  });

  it.runIf(conSonda)('sulla risposta reale mostra i 9.762 del 2026, non i 10.133 del 2022', () => {
    const anagrafica = mappaAnagrafica(
      contenuto(sonda('prod-IT-advanced-10354890963.json')),
      'IT-advanced',
      OSSERVATO,
    );
    expect(anagrafica.value.numeroAddetti).toBe(9762);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 21 — la data di costituzione
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 21 · data di costituzione', () => {
  it('preferisce la costituzione all’iscrizione al registro', () => {
    const anagrafica = mappaAnagrafica(
      {
        companyDates: { incorporationDate: '1989-04-18T22:00:00', registrationDate: '1996-02-18T23:00:00' },
      },
      'IT-full',
      OSSERVATO,
    );
    expect(anagrafica.value.dataCostituzione?.getUTCFullYear()).toBe(1989);
  });

  it('ricade sull’iscrizione quando la costituzione non è dichiarata', () => {
    const anagrafica = mappaAnagrafica({ registrationDate: '2013-07-19' }, 'IT-advanced', OSSERVATO);
    expect(anagrafica.value.dataCostituzione?.getUTCFullYear()).toBe(2013);
  });

  it.runIf(conSonda)('sulla risposta reale mostra il 1989, non il 1996', () => {
    const anagrafica = mappaAnagrafica(
      contenuto(sonda('prod-IT-full-01528120981.json')),
      'IT-full',
      OSSERVATO,
    );
    expect(anagrafica.value.dataCostituzione?.getUTCFullYear()).toBe(1989);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 38 — i quindici campi del profilo completo mai letti
// ─────────────────────────────────────────────────────────────────────────────

describe.runIf(conSonda)('Difetto 38 · campi del profilo completo', () => {
  const indicatori = mappaIndicatoriFornitore(contenuto(sonda('prod-IT-full-01528120981.json')));

  it('legge la quota di operai, che pesa su RC lavoratori', () => {
    expect(indicatori.statisticheAddetti?.operai).toBe(67);
  });

  it('legge i paesi di export', () => {
    expect(indicatori.qualifiche?.paesiExport).toBe('UNIONE EUROPEA, ALTRI PAESI');
  });

  it('legge i profili social', () => {
    expect(indicatori.qualifiche?.profiliSocial).toEqual([
      'https://www.facebook.com/marelladesignhandles',
      'https://www.instagram.com/marelladesignhandles/',
      'https://www.linkedin.com/company/robertomarellaspa',
      'https://it.pinterest.com/marelladesignhandles/',
      'https://www.youtube.com/@marelladesign7249',
    ]);
  });

  it('legge il codice LEI e il numero di iscrizione all’albo artigiani', () => {
    expect(indicatori.qualifiche?.codiceLei).toBe('8156001D251A6E776B70');
    expect(indicatori.qualifiche?.numeroAlboArtigiani).toBe('108261');
  });

  it('legge i cinque indici che restavano fuori', () => {
    // Valori esatti della risposta registrata: `not.toBeNull()` passerebbe anche su un
    // campo inesistente, perché `?.` su una chiave assente vale `undefined`.
    expect(indicatori.coperturaOneri?.ffoSuInteressiNetti).toBe(-0.3652);
    expect(indicatori.efficienza?.rotazioneMagazzino).toBe(2.2421);
    expect(indicatori.leveFinanziarie?.ffoLevaNetta).toBe(-41.3689);
    expect(indicatori.liquidita?.fcfSuDebitiFinanziariBreve).toBe(-0.4589);
    expect(indicatori.strutturaFinanziaria?.debitoNettoSuFontiTotali).toBe(0.6572);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 20 — l'approfondimento sostituiva invece di fondere
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 20 · fusione degli indicatori', () => {
  it('conserva ciò che solo l’anagrafica estesa porta', () => {
    const daEstesa = mappaIndicatoriFornitore({
      vatGroup: { vatGroupParticipation: false, isVatGroupLeader: false },
      sdiCode: 'USAL8PV',
    });
    const daCompleto = mappaIndicatoriFornitore({ profitability: { roe: 12.5 } });

    const fuso = fondiIndicatori(daEstesa, daCompleto);

    expect(fuso.qualifiche?.codiceSdi).toBe('USAL8PV');
    expect(fuso.qualifiche?.appartieneAGruppoIva).toBe(false);
    expect(fuso.redditivita?.roe).toBe(12.5);
  });

  it('il profilo completo vince campo per campo, dove ha un valore', () => {
    const daEstesa = mappaIndicatoriFornitore({ sdiCode: 'VECCHIO' });
    const daCompleto = mappaIndicatoriFornitore({ sdiCode: 'NUOVO', profitability: { roe: 1 } });
    expect(fondiIndicatori(daEstesa, daCompleto).qualifiche?.codiceSdi).toBe('NUOVO');
  });

  it('fondere con un blocco vuoto non cancella nulla', () => {
    const daEstesa = mappaIndicatoriFornitore({ sdiCode: 'USAL8PV' });
    expect(fondiIndicatori(daEstesa, INDICATORI_FORNITORE_VUOTI).qualifiche?.codiceSdi).toBe('USAL8PV');
  });

  it.runIf(conSonda)('pagando l’approfondimento non si perde la bandiera del gruppo IVA', async () => {
    const advanced = sonda('prod-IT-advanced-12485671007.json');
    const full = sonda('prod-IT-full-12485671007.json');

    const fetchImpl = ((url: string): Promise<Response> => {
      const corpo = String(url).includes('/IT-full/') ? full : advanced;
      return Promise.resolve(
        new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const provider = new OpenApiProvider({ token: 't', fetchImpl });
    const profilo = await provider.fetchProfile('12485671007', 'profondito');

    // Il gruppo IVA e il codice SDI li porta solo IT-advanced.
    expect(profilo.indicatoriFornitore.qualifiche?.codiceSdi).toBe('USAL8PV');
    expect(profilo.indicatoriFornitore.qualifiche?.appartieneAGruppoIva).toBe(false);
    // Gli indici li porta solo IT-full: la fusione non deve perderli.
    expect(profilo.indicatoriFornitore.redditivita).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 40 — il codice fiscale cablato a null
// ─────────────────────────────────────────────────────────────────────────────

describe.runIf(conSonda)('Difetto 40 · codice fiscale', () => {
  it('legge il codice fiscale che la risposta porta, invece di dichiararlo assente', async () => {
    const advanced = sonda('prod-IT-advanced-12485671007.json');
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(advanced), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as unknown as typeof fetch;

    const provider = new OpenApiProvider({ token: 't', fetchImpl });
    const profilo = await provider.fetchProfile('12485671007', 'esteso');

    expect(profilo.identity.codiceFiscale).toBe('12485671007');
  });

  it('non converte in numero un codice fiscale che comincia per zero', async () => {
    const risposta = {
      data: [{ vatCode: '01528120981', taxCode: '01528120981', companyName: 'MARELLA ITALIA SRL' }],
      success: true,
    };
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(risposta), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as unknown as typeof fetch;

    const provider = new OpenApiProvider({ token: 't', fetchImpl });
    const profilo = await provider.fetchProfile('01528120981', 'esteso');

    expect(profilo.identity.codiceFiscale).toBe('01528120981');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 60 — protesti e pregiudizievoli in snake_case
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 60 · nomi dei campi di protesti e pregiudizievoli', () => {
  it('legge un protesto scritto come il servizio scrive le procedure', () => {
    // Il servizio risponde in snake_case: è provato sulle procedure concorsuali, dove
    // i nomi camelCase avevano fatto scartare in silenzio quattro provvedimenti.
    const eventi = mappaNegativita(
      {
        data: {
          presenzaProtesti: true,
          protesti: [
            {
              data_protesto: '2024-03-11',
              importo_protesto: 12_500,
              tipo_titolo: 'CAMBIALE',
              comune_protesto: 'MILANO',
            },
          ],
        },
      },
      OSSERVATO,
    ).value;

    expect(eventi.protesti).toHaveLength(1);
    expect(eventi.protesti[0]?.tipo).toBe('CAMBIALE');
    expect(eventi.protesti[0]?.luogo).toBe('MILANO');
  });

  it('legge una pregiudizievole scritta in snake_case', () => {
    const eventi = mappaNegativita(
      {
        data: {
          presenzaPregiudizievoli: true,
          pregiudizievoli: [
            {
              data_iscrizione: '2023-06-01',
              descrizione_atto: 'IPOTECA GIUDIZIALE',
              importo_iscritto: 80_000,
            },
          ],
        },
      },
      OSSERVATO,
    ).value;

    expect(eventi.pregiudizievoli).toHaveLength(1);
    expect(eventi.pregiudizievoli[0]?.tipo).toBe('ipoteca-giudiziale');
    expect(eventi.pregiudizievoli[0]?.descrizione).toBe('IPOTECA GIUDIZIALE');
  });

  it('un elenco non letto resta una discordanza dichiarata, non un «nessun evento»', () => {
    const eventi = mappaNegativita(
      { data: { presenzaProtesti: true, protesti: [{ chiave_ignota: 1 }] } },
      OSSERVATO,
    ).value;
    expect(eventi.presenzaDichiarataSenzaDettaglio).toContain('protesti');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 62 — il preventivo a zero davanti al pulsante che spende
// ─────────────────────────────────────────────────────────────────────────────

describe('Difetto 62 · preventivo del lotto prospect', () => {
  function provider(risposta: unknown) {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(risposta), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as unknown as typeof fetch;
    return new OpenApiProvider({ token: 't', fetchImpl });
  }

  it('non annuncia «0,00 €» quando il fornitore non dichiara il costo', async () => {
    const senzaCosto = { data: [], count: 3488, success: true, message: '', error: null };
    const esito = await provider(senzaCosto).cercaProspect(
      { provincia: 'BS', limite: 25 },
      { soloConteggio: true },
    );

    // Il listino verificato è di cinque centesimi a record: venticinque record, 1,25 €.
    expect(esito.costoElencoCentesimi).toBe(125);
  });

  it('quando il fornitore dichiara il costo, vince il suo', async () => {
    const conCosto = { data: [], count: 3488, cost: 0.05, success: true, message: '', error: null };
    const esito = await provider(conCosto).cercaProspect(
      { provincia: 'BS', limite: 25 },
      { soloConteggio: true },
    );
    expect(esito.costoElencoCentesimi).toBe(5);
  });

  it('il lotto non supera il totale disponibile, e nemmeno il preventivo', async () => {
    const senzaCosto = { data: [], count: 3, success: true, message: '', error: null };
    const esito = await provider(senzaCosto).cercaProspect(
      { provincia: 'BS', limite: 25 },
      { soloConteggio: true },
    );
    expect(esito.lotto).toBe(3);
    expect(esito.costoElencoCentesimi).toBe(15);
  });
});
