/**
 * Il tetto di spesa complessivo di uno studio: gli account di prova.
 *
 * Richiesta di Simone del 19/09/2026: un account per un cliente che «in totale può usare
 * massimo 5 euro da OpenAPI». Il tetto giornaliero non basta — si azzera ogni notte — e un tetto
 * controllato solo sulla spesa già fatta non basta nemmeno: con venti centesimi rimasti si
 * comprerebbe un elenco da cinque euro. Qui si prova che:
 *
 * - si ferma quando la spesa di sempre, più quanto può costare l'operazione, supera il tetto;
 * - lascia passare ciò che sta sotto, e ciò che è gratis (conteggio, cache, aziende già in casa);
 * - dice quanto è stato usato e quanto resta, e non promette un «domani» che non arriva;
 * - vale per lo studio che ce l'ha, e per nessun altro;
 * - lo imposta e lo toglie solo il gestore della piattaforma.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { creaStudio, creaUtente, registraCosto } from '@aegis/db';
import { MockCompanyProvider } from '@aegis/providers';
import { derivaPassword } from '../src/auth.js';
import type { Persistenza } from '../src/persistenza.js';
import { buildServer } from '../src/server.js';
import {
  PASSWORD_DI_PROVA,
  accedi,
  creaUtenteDiProva,
  persistenzaDiProva,
  serverDiProva,
} from './aiuti.js';

const GESTORE = 'gestore@piattaforma.it';
const PROVA = 'davide@demo.example';
const ALTRO = 'altro@studio.it';

/** Cinque euro, come l'account di prova di Davide. */
const TETTO = 500;

describe('Tetto di spesa complessivo dello studio', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let studioProva: string;
  let cookieProva: string;
  let cookieGestore: string;

  /** Una spesa già avvenuta nello studio di prova, come se l'avesse fatta un'analisi. */
  const spendi = async (centesimi: number, daCache = false, tenantId = studioProva): Promise<void> => {
    await registraCosto(persistenza.db, {
      tenantId,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: centesimi,
      servitoDaCache: daCache,
    });
  };

  const analizza = (piva: string, payload: Record<string, unknown> = {}, cookie = cookieProva) =>
    app.inject({ method: 'POST', url: `/api/aziende/${piva}/analisi`, headers: { cookie }, payload });

  const io = async (cookie = cookieProva) =>
    (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json<{
      creditoProva: { limiteCentesimi: number; spesoCentesimi: number } | null;
    }>();

  beforeEach(async () => {
    // Il giornaliero spento: qui si misura il complessivo, e le spese finte lo sforerebbero.
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '0';
    persistenza = await persistenzaDiProva('Studio del gestore');
    await creaUtenteDiProva(persistenza, GESTORE);
    studioProva = await creaStudio(persistenza.db, 'Davide Tesolin', { tettoSpesaTotaleCentesimi: TETTO });
    await creaUtente(persistenza.db, {
      tenantId: studioProva,
      email: PROVA,
      nome: 'Davide Tesolin',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    app = serverDiProva(persistenza);
    cookieGestore = await accedi(app, GESTORE);
    cookieProva = await accedi(app, PROVA);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('sotto il tetto si lavora come sempre, e il credito usato si vede', async () => {
    expect((await analizza('03158460174')).statusCode).toBe(200);

    const credito = (await io()).creditoProva;
    expect(credito?.limiteCentesimi).toBe(TETTO);
    expect(credito?.spesoCentesimi).toBeGreaterThanOrEqual(0);
  }, 90_000);

  it('a tetto pieno l’analisi di un’azienda nuova si ferma, e il messaggio dice quanto è stato usato', async () => {
    await spendi(TETTO);

    const risposta = await analizza('03158460174');

    // 403 e non 429: riprovare più tardi non cambia niente, il credito di prova non si ricarica.
    expect(risposta.statusCode).toBe(403);
    expect(risposta.json().errore).toMatch(/Credito di prova esaurito/);
    expect(risposta.json().errore).toMatch(/5,00/);
    expect(risposta.json().errore).not.toMatch(/domani/);
  }, 90_000);

  it('si guarda anche quanto costa l’operazione: un elenco che sforerebbe non parte', async () => {
    // Restano cinque centesimi: un elenco di cinque aziende ne costa venticinque.
    await spendi(TETTO - 5);

    const troppo = await app.inject({
      method: 'GET',
      url: '/api/prospect?comune=A060&limite=5',
      headers: { cookie: cookieProva },
    });
    expect(troppo.statusCode).toBe(403);
    expect(troppo.json().errore).toMatch(/insufficiente/);
    expect(troppo.json().errore).toMatch(/0,05/);
    expect(troppo.json().errore).toMatch(/0,25/);

    // Un'azienda sola sta nei cinque centesimi che restano: passa.
    const giusto = await app.inject({
      method: 'GET',
      url: '/api/prospect?comune=A060&limite=1',
      headers: { cookie: cookieProva },
    });
    expect(giusto.statusCode).toBe(200);
  }, 90_000);

  it('il conteggio resta gratuito anche a credito finito', async () => {
    await spendi(TETTO);

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/prospect?comune=A060&soloConteggio=1',
      headers: { cookie: cookieProva },
    });
    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('le risposte servite dalla cache non consumano il credito', async () => {
    await spendi(50_000, true);

    expect((await analizza('03158460174')).statusCode).toBe(200);
  }, 90_000);

  it('un’azienda già analizzata si riapre a credito finito, ma non si compra l’approfondimento', async () => {
    expect((await analizza('03158460174')).statusCode).toBe(200);
    await spendi(TETTO);

    // Rileggere ciò che si è già pagato non costa: il tetto non confisca i dati di chi li ha.
    expect((await analizza('03158460174')).statusCode).toBe(200);

    /*
      Il fornitore di prova dichiara ogni approfondimento già in casa, e allora chiederlo non è un
      acquisto. Qui serve il caso vero — l'approfondimento da comprare — e lo dà un fornitore che
      non ha niente in cache, sullo stesso archivio.
    */
    class SenzaCache extends MockCompanyProvider {
      override acquistoSenzaSpesa(): Promise<boolean> {
        return Promise.resolve(false);
      }
    }
    const appSenzaCache = buildServer({ provider: new SenzaCache(), persistenza });
    try {
      const cookie = await accedi(appSenzaCache, PROVA);
      const approfondita = await appSenzaCache.inject({
        method: 'POST',
        url: '/api/aziende/03158460174/analisi',
        headers: { cookie },
        payload: { approfondita: true },
      });
      expect(approfondita.statusCode).toBe(403);
      expect(approfondita.json().errore).toMatch(/Credito di prova/);
    } finally {
      await appSenzaCache.close();
    }
  }, 90_000);

  it('il tetto vale per lo studio che ce l’ha, e per nessun altro', async () => {
    const altroStudio = await creaStudio(persistenza.db, 'Studio senza tetto');
    await creaUtente(persistenza.db, {
      tenantId: altroStudio,
      email: ALTRO,
      nome: 'Altro',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    const cookieAltro = await accedi(app, ALTRO);
    await spendi(TETTO * 10, false, altroStudio);

    expect((await analizza('03158460174', {}, cookieAltro)).statusCode).toBe(200);
    expect((await io(cookieAltro)).creditoProva).toBeNull();
  }, 90_000);

  it('lo imposta e lo toglie il gestore, e lo studio non può alzarselo da solo', async () => {
    const daSolo = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioProva}`,
      headers: { cookie: cookieProva },
      payload: { tettoSpesaTotaleCentesimi: 1_000_000 },
    });
    expect(daSolo.statusCode).toBeGreaterThanOrEqual(403);
    expect((await io()).creditoProva?.limiteCentesimi).toBe(TETTO);

    const alzato = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioProva}`,
      headers: { cookie: cookieGestore },
      payload: { tettoSpesaTotaleCentesimi: 1000 },
    });
    expect(alzato.statusCode).toBe(200);
    expect((await io()).creditoProva?.limiteCentesimi).toBe(1000);

    // Il gestore vede tetto e spesa nell'elenco degli studi.
    await spendi(120);
    const studi = (
      await app.inject({ method: 'GET', url: '/api/studi', headers: { cookie: cookieGestore } })
    ).json<{
      studi: { id: string; tettoSpesaTotaleCentesimi: number | null; spesaTotaleCentesimi: number }[];
    }>().studi;
    const riga = studi.find((s) => s.id === studioProva);
    expect(riga?.tettoSpesaTotaleCentesimi).toBe(1000);
    expect(riga?.spesaTotaleCentesimi).toBeGreaterThanOrEqual(120);

    const tolto = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioProva}`,
      headers: { cookie: cookieGestore },
      payload: { tettoSpesaTotaleCentesimi: null },
    });
    expect(tolto.statusCode).toBe(200);
    expect((await io()).creditoProva).toBeNull();

    const negativo = await app.inject({
      method: 'PATCH',
      url: `/api/studi/${studioProva}`,
      headers: { cookie: cookieGestore },
      payload: { tettoSpesaTotaleCentesimi: -1 },
    });
    expect(negativo.statusCode).toBe(400);
  }, 90_000);
});
