/**
 * Ogni spesa deve comparire nella propria contabilità.
 *
 * La ricerca per partita IVA **è a pagamento**: acquista l'anagrafica estesa, che l'analisi
 * poi riusa dalla cache invece di ricomprarla. Per un periodo quel costo non è stato né
 * registrato né sottoposto al tetto di spesa: il credito usciva dal contratto e il registro
 * diceva zero.
 *
 * Tre conseguenze, e la terza è la peggiore:
 *
 *  - il tetto giornaliero non proteggeva la ricerca, cioè proprio il gesto che si ripete
 *    più spesso e che si ripete **due volte** quando l'interfaccia non dà segno di lavorare;
 *  - il credito residuo mostrava un numero falso;
 *  - chi vedeva il saldo calare non aveva modo di sapere dove fossero finiti i soldi.
 *
 * Una spesa che non compare nella propria contabilità è peggio di una spesa alta: non si
 * può governare, e toglie fiducia a tutti gli altri numeri che il sistema mostra.
 *
 * Il difetto è passato perché nessun collaudo verificava che una rotta a pagamento
 * **scrivesse** nel registro. Qui si verifica per la ricerca; il provider di prova emette
 * un costo dichiarato, così la proprietà si misura senza spendere nulla di vero.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockCompanyProvider } from '@aegis/providers';
import type { CompanyDataProvider, CostLedger } from '@aegis/providers';
import { registraCosto, spesaOdierna } from '@aegis/db';
import { buildServer } from '../src/server.js';
import { RegistroPerRichiesta } from '../src/costi-richiesta.js';
import type { Persistenza } from '../src/persistenza.js';
import { accedi, creaUtenteDiProva, persistenzaDiProva } from './aiuti.js';

const EMAIL = 'ricerca@studio.it';
const COSTO_RICERCA = 10;

/**
 * Provider che si comporta come quello vero: la ricerca costa, e lo dichiara al registro.
 *
 * `MockCompanyProvider` non annota nulla, perché nella dimostrazione non si spende. Qui
 * serve invece un provider che spenda, altrimenti il collaudo non potrebbe distinguere
 * «registrato correttamente» da «non è costato niente».
 */
function providerCheSpende(ledger: CostLedger): CompanyDataProvider {
  const vero = new MockCompanyProvider();
  return new Proxy(vero, {
    get(bersaglio, proprieta, ricevitore) {
      if (proprieta !== 'search') return Reflect.get(bersaglio, proprieta, ricevitore);

      return async (criteri: Parameters<CompanyDataProvider['search']>[0]) => {
        ledger.record({
          provider: 'OpenAPI.com',
          service: 'IT-advanced',
          costoStimatoCentesimi: COSTO_RICERCA,
          cacheHit: false,
          timestamp: new Date(),
          riferimento: null,
        });
        return vero.search(criteri);
      };
    },
  });
}

describe('La ricerca annota quello che spende', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio che cerca');
    await creaUtenteDiProva(persistenza, EMAIL);

    // Il registro **per richiesta**: è quello che deposita gli eventi nel contenitore
    // della richiesta in corso. Un registro qualsiasi verrebbe scritto e ignorato, e il
    // collaudo misurerebbe zero senza che nulla sia rotto.
    const registro = new RegistroPerRichiesta({ record: () => undefined });
    app = buildServer({ provider: providerCheSpende(registro), persistenza });
    cookie = await accedi(app, EMAIL);
  }, 180_000);

  afterEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('scrive nel registro dei costi ciò che la ricerca ha speso', async () => {
    expect(await spesaOdierna(persistenza.db, persistenza.tenantPredefinito)).toBe(0);

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/aziende/ricerca?partitaIva=03158460174',
      headers: { cookie },
    });

    expect(risposta.statusCode).toBe(200);
    // Il numero deve arrivare nel registro persistente, non solo nel corpo della risposta:
    // è da lì che si calcolano tetto e credito residuo.
    expect(await spesaOdierna(persistenza.db, persistenza.tenantPredefinito)).toBe(COSTO_RICERCA);
  }, 180_000);

  it('dichiara nella risposta quanto è costata', async () => {
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/aziende/ricerca?partitaIva=03158460174',
      headers: { cookie },
    });

    const corpo = risposta.json();
    expect(corpo.costoCentesimi).toBe(COSTO_RICERCA);
  }, 180_000);

  it('una partita IVA malformata non arriva a costare nulla', async () => {
    // Il carattere di controllo si verifica in casa: quasi sempre è un errore di
    // battitura, e cercarla costerebbe una chiamata per non trovare niente.
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/aziende/ricerca?partitaIva=11111111111',
      headers: { cookie },
    });

    expect(risposta.statusCode).toBe(400);
    expect(await spesaOdierna(persistenza.db, persistenza.tenantPredefinito)).toBe(0);
  }, 180_000);

  it('il tetto di spesa ferma anche la ricerca, non solo l’analisi', async () => {
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '1';
    await registraCosto(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 500,
      servitoDaCache: false,
    });

    const suaApp = buildServer({
      provider: providerCheSpende(new RegistroPerRichiesta({ record: () => undefined })),
      persistenza,
    });
    try {
      const suoCookie = await accedi(suaApp, EMAIL);
      const risposta = await suaApp.inject({
        method: 'GET',
        url: '/api/aziende/ricerca?partitaIva=03158460174',
        headers: { cookie: suoCookie },
      });

      // La ricerca è il gesto che si ripete più spesso: lasciarla fuori dal tetto
      // significava lasciare scoperta proprio la via più facile per svuotare il credito.
      expect(risposta.statusCode).toBe(429);
      expect(await spesaOdierna(persistenza.db, persistenza.tenantPredefinito)).toBe(500);
    } finally {
      await suaApp.close();
    }
  }, 120_000);
});
