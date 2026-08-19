import { describe, expect, it, vi } from 'vitest';
import { Money, describeSource } from '@aegis/core';
import { HttpProviderClient, MemoryCostLedger } from '../src/http.js';
import { contaEventi, mappaNegativita, soloIndicatori } from '../src/openapi/negativita.js';

const OSSERVATO = new Date('2026-08-17T00:00:00Z');

/**
 * Il servizio eventi negativi è il presidio più delicato dell'intero motore di credito:
 * pesa il 20% dello score ed è l'unico in grado di rilevare una procedura concorsuale
 * aperta. Ogni caso qui sotto corrisponde a un modo in cui la sua lettura può sbagliare.
 */
describe('Mappatura eventi negativi', () => {
  it('mappa protesti, pregiudizievoli e procedure dalla risposta completa', () => {
    const risposta = {
      data: {
        protesti: [
          { data: '14/09/2021', importo: 12_400, tipo: 'Cambiale', luogo: 'Brescia', levato: 'SI' },
          { data: '2023-02-10', importo: 3_500, tipo: 'Assegno', levato: false },
        ],
        pregiudizievoli: [
          { data: '2024-03-01', descrizione: 'Ipoteca giudiziale su immobile', importo: 250_000 },
          { data: '2024-11-20', descrizione: 'Pignoramento presso terzi' },
        ],
        procedure: [{ tipo: 'Concordato preventivo', dataApertura: '2025-06-01' }],
      },
    };

    const eventi = mappaNegativita(risposta, OSSERVATO).value;

    expect(eventi.protesti).toHaveLength(2);
    expect(eventi.protesti[0]?.levato).toBe(true);
    expect(Money.toEuro(eventi.protesti[0]!.importo)).toBe(12_400);
    expect(eventi.protesti[0]?.data.getUTCMonth()).toBe(8); // settembre, non 14 come mese

    expect(eventi.pregiudizievoli.map((p) => p.tipo)).toEqual(['ipoteca-giudiziale', 'pignoramento']);

    expect(eventi.procedure[0]?.tipo).toBe('concordato-preventivo');
    // Nessuna data di chiusura significa procedura aperta: forza lo score a ≤ 10.
    expect(eventi.procedure[0]?.aperta).toBe(true);
  });

  it('legge anche la forma con dettaglio annidato', () => {
    const risposta = {
      data: { dettaglio: { protests: [{ date: '2022-05-05', amount: 900, type: 'Tratta' }] } },
    };
    expect(mappaNegativita(risposta, OSSERVATO).value.protesti).toHaveLength(1);
  });

  it('su risposta priva di eventi restituisce liste vuote, non errori', () => {
    const eventi = mappaNegativita({ data: {} }, OSSERVATO).value;
    expect(contaEventi(eventi)).toBe(0);
  });

  it('scarta le voci prive di data invece di inventarne una', () => {
    const risposta = { data: { protesti: [{ importo: 5_000 }, { data: '2024-01-01', importo: 100 }] } };
    expect(mappaNegativita(risposta, OSSERVATO).value.protesti).toHaveLength(1);
  });

  it('legge gli indicatori di presenza con i nomi che il servizio usa davvero', () => {
    /*
      La funzione cercava `protesti`, `hasProtests`, `protests`: nomi plausibili e mai
      verificati. Il servizio reale usa `presenzaProtesti`, e quelle chiavi contengono gli
      **elenchi**, non i booleani. Risultato: la lettura restituiva sempre `null`, e il
      presidio che doveva riconoscere «indicatori senza dettaglio» non è mai entrato in
      funzione nemmeno una volta.
    */
    const reale = {
      data: {
        presenzaProtesti: false,
        protesti: null,
        presenzaPregiudizievoli: false,
        pregiudizievoli: null,
        presenzaProcedure: false,
        procedure: null,
      },
    };

    expect(soloIndicatori(reale)).toEqual({ presenti: false, quali: [] });
  });

  it('non dichiara pulita un’azienda i cui protesti il registro afferma senza dettagliare', () => {
    /*
      Il caso più insidioso, e il motivo per cui questo presidio esiste: gli elenchi
      arrivano vuoti mentre gli indicatori dicono di sì — dettaglio non compreso nel
      servizio, o pratica ancora in lavorazione.

      Letti i soli elenchi, la risposta sarebbe «nessun evento negativo»: un certificato di
      buona salute su un'impresa protestata, sul fattore che pesa il venti per cento dello
      score di credito.
    */
    const conBuco = {
      data: {
        presenzaProtesti: true,
        protesti: null,
        presenzaPregiudizievoli: true,
        pregiudizievoli: null,
        presenzaProcedure: false,
        procedure: null,
      },
    };

    const esito = mappaNegativita(conBuco, OSSERVATO).value;

    expect(esito.protesti).toEqual([]);
    expect(esito.presenzaDichiarataSenzaDettaglio).toEqual(['protesti', 'pregiudizievoli']);
    expect(soloIndicatori(conBuco)).toEqual({
      presenti: true,
      quali: ['protesti', 'pregiudizievoli'],
    });
  });

  it('quando il dettaglio c’è, non segnala alcuna discordanza', () => {
    // La discordanza va segnalata solo quando esiste: dichiararla sempre la renderebbe
    // rumore, e chi legge smetterebbe di guardarla proprio quando conta.
    const completo = {
      data: {
        presenzaProtesti: true,
        protesti: [{ data: '2024-03-15', importo: 12_400, tipo: 'Cambiale', luogo: 'Brescia' }],
        presenzaPregiudizievoli: false,
        pregiudizievoli: null,
        presenzaProcedure: false,
        procedure: null,
      },
    };

    const esito = mappaNegativita(completo, OSSERVATO).value;
    expect(esito.protesti.length).toBe(1);
    expect(esito.presenzaDichiarataSenzaDettaglio).toEqual([]);
  });

  it('conserva la provenienza', () => {
    const sourced = mappaNegativita({ data: {} }, OSSERVATO);
    expect(sourced.source).toEqual({
      kind: 'provider',
      provider: 'OpenAPI.com',
      service: 'IT-negativita',
      registro: 'Registro protesti e procedure concorsuali',
    });
    // Ciò che il cliente legge è il registro pubblico, mai il distributore.
    expect(describeSource(sourced.source)).toBe('Registro protesti e procedure concorsuali');
  });
});

/**
 * Gli indicatori sintetici.
 *
 * Questi collaudi verificavano i nomi di campo che erano stati **indovinati**, non
 * osservati: `protesti`, `pregiudizievoli`, `procedure` usati come booleani. Passavano
 * mentre il prodotto era rotto, perché ripetevano l'ipotesi sbagliata del codice invece di
 * confrontarla con la realtà — un collaudo scritto sull'assunzione che verifica non
 * dimostra nulla, dà solo la sensazione di aver verificato.
 *
 * Ora si parte dai nomi della risposta reale. Le grafie alternative restano collaudate
 * come ripieghi, ma dichiarate per quello che sono.
 */
describe('Indicatori sintetici di negatività', () => {
  it('riconosce l’assenza di negatività dai nomi della risposta reale', () => {
    const esito = soloIndicatori({
      data: {
        presenzaProtesti: false,
        presenzaPregiudizievoli: false,
        presenzaProcedure: false,
      },
    });
    expect(esito?.presenti).toBe(false);
  });

  it('elenca quali negatività risultano presenti', () => {
    const esito = soloIndicatori({
      data: { presenzaProtesti: true, presenzaPregiudizievoli: false, presenzaProcedure: true },
    });
    expect(esito?.presenti).toBe(true);
    expect(esito?.quali).toEqual(['protesti', 'procedure concorsuali']);
  });

  it('accetta anche le grafie di ripiego, che costano nulla e coprono le varianti', () => {
    const esito = soloIndicatori({
      data: { hasProtests: true, hasPrejudicials: false, hasProcedures: false },
    });
    expect(esito?.quali).toEqual(['protesti']);
  });

  it('restituisce null quando nessun indicatore è presente', () => {
    expect(soloIndicatori({ data: { altro: 1 } })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function risposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Pratiche asincrone', () => {
  function client(fetchImpl: typeof fetch, ledger?: MemoryCostLedger) {
    return new HttpProviderClient({
      baseUrl: 'https://risk.test',
      token: 't',
      provider: 'Test',
      fetchImpl,
      ...(ledger === undefined ? {} : { ledger }),
    });
  }

  const richiesta = {
    service: 'IT-negativita',
    startPath: '/IT-negativita',
    body: { cf_piva: '12485671007' },
    statusPath: '/IT-request/{id}',
    costoCentesimi: 45,
    cacheTtlSeconds: 0,
    timeoutMs: 20_000,
  } as const;

  it('apre la pratica e ne attende il completamento', async () => {
    let chiamate = 0;
    const fetchMock = vi.fn(async () => {
      chiamate += 1;
      if (chiamate === 1) return risposta({ data: { id: 'abc123', state: 'PENDING' } });
      if (chiamate === 2) return risposta({ data: { id: 'abc123', state: 'PENDING' } });
      return risposta({ data: { id: 'abc123', state: 'DONE', protesti: [] } });
    });

    const esito = await client(fetchMock).requestAsync(richiesta);

    expect(esito.stato).toBe('completata');
    expect(esito.richiestaId).toBe('abc123');
  });

  it('addebita solo l’apertura, non le verifiche di stato', async () => {
    let chiamate = 0;
    const fetchMock = vi.fn(async () => {
      chiamate += 1;
      return chiamate === 1
        ? risposta({ data: { id: 'x', state: 'PENDING' } })
        : risposta({ data: { id: 'x', state: 'DONE' } });
    });

    const ledger = new MemoryCostLedger();
    await client(fetchMock, ledger).requestAsync(richiesta);

    // Il polling è gratuito: pagare ogni controllo moltiplicherebbe il costo per nulla.
    expect(ledger.totaleCentesimi()).toBe(45);
    expect(ledger.events.length).toBeGreaterThan(1);
  });

  it('riconosce lo stato di errore senza attendere invano', async () => {
    let chiamate = 0;
    const fetchMock = vi.fn(async () => {
      chiamate += 1;
      return chiamate === 1
        ? risposta({ data: { id: 'x', state: 'PENDING' } })
        : risposta({ data: { id: 'x', state: 'ERROR' } });
    });

    const esito = await client(fetchMock).requestAsync(richiesta);
    expect(esito.stato).toBe('fallita');
  });

  it('senza identificativo nella risposta non tenta il polling', async () => {
    const fetchMock = vi.fn(async () => risposta({ data: {} }));
    const esito = await client(fetchMock).requestAsync(richiesta);

    expect(esito.stato).toBe('fallita');
    expect(esito.richiestaId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('scaduta l’attesa restituisce l’identificativo invece di riaprire la pratica', async () => {
    // Riaprire una pratica già pagata significa pagarla due volte.
    const fetchMock = vi.fn(async () => risposta({ data: { id: 'lenta', state: 'PENDING' } }));

    const esito = await client(fetchMock).requestAsync({
      ...richiesta,
      timeoutMs: 3_000,
    });

    expect(esito.stato).toBe('in-corso');
    expect(esito.richiestaId).toBe('lenta');
  });
});
