import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';
import type { Persistenza } from '../src/persistenza.js';
import { accedi, creaUtenteDiProva, persistenzaDiProva, serverDiProva } from './aiuti.js';

/**
 * Il CRM, dalla rotta (17/09/2026, «AEGIS - cambi.pptx»).
 *
 * Tre promesse del documento: le aziende di un elenco comprato entrano nel CRM e ci restano
 * («per sempre non per 24 ore»); il CRM porta stato e nota dell'intermediario invece dei dati
 * assicurativi; e — come ogni dato dello studio — non si vede da un altro studio.
 */

const MECCANICA = '03158460174';
const ADRIATICA = '02413390390';

interface VoceDto {
  identificativo: string;
  denominazione: string;
  comune: string | null;
  telefono: string | null;
  pec: string | null;
  sitoWeb: string | null;
  stato: string;
  nota: string | null;
  propertyRisk: number | null;
  biPunteggio: number | null;
  biPerditaGiornalieraCentesimi: number | null;
  cyberRisk: number | null;
  analizzataIl: string | null;
  daElencoIl: string | null;
}

describe('CRM senza database', () => {
  it('un elenco comprato entra nel CRM, un conteggio no', async () => {
    const app = buildServer({ provider: new MockCompanyProvider() });

    await app.inject({ method: 'GET', url: '/api/prospect?comune=A060&soloConteggio=1' });
    const vuoto = (await app.inject({ method: 'GET', url: '/api/crm' })).json<{ aziende: VoceDto[] }>();
    expect(vuoto.aziende).toEqual([]);

    const elenco = await app.inject({ method: 'GET', url: '/api/prospect?comune=A060' });
    expect(elenco.json<{ salvateNelCrm?: boolean }>().salvateNelCrm).toBe(true);

    const crm = (await app.inject({ method: 'GET', url: '/api/crm' })).json<{
      aziende: VoceDto[];
      conteggi: Record<string, number>;
    }>();
    expect(crm.aziende.map((a) => a.identificativo)).toEqual([MECCANICA]);
    expect(crm.aziende[0]?.stato).toBe('da-contattare');
    expect(crm.aziende[0]?.daElencoIl).not.toBeNull();
    expect(crm.aziende[0]?.analizzataIl).toBeNull();
    expect(crm.conteggi['da-contattare']).toBe(1);

    await app.close();
  });

  it('il conteggio gratuito non dichiara niente sul CRM', async () => {
    const app = buildServer({ provider: new MockCompanyProvider() });
    const conteggio = await app.inject({ method: 'GET', url: '/api/prospect?comune=A060&soloConteggio=1' });
    expect(conteggio.json<Record<string, unknown>>()).not.toHaveProperty('salvateNelCrm');
    await app.close();
  });

  it('stato e nota si cambiano, e un campo assente non si tocca', async () => {
    const app = buildServer({ provider: new MockCompanyProvider() });
    await app.inject({ method: 'GET', url: '/api/prospect?comune=A060' });

    const patch = (payload: unknown) =>
      app.inject({ method: 'PATCH', url: `/api/crm/${MECCANICA}`, payload: payload as object });

    expect((await patch({ stato: 'in-trattativa', nota: '  Richiamare lunedì  ' })).statusCode).toBe(200);
    expect((await patch({ stato: 'cliente' })).statusCode).toBe(200);

    const [voce] = (await app.inject({ method: 'GET', url: '/api/crm' })).json<{ aziende: VoceDto[] }>()
      .aziende;
    expect(voce?.stato).toBe('cliente');
    // La nota è rimasta, senza gli spazi ai bordi.
    expect(voce?.nota).toBe('Richiamare lunedì');

    // Una nota svuotata è «nessuna nota», non un testo vuoto.
    expect((await patch({ nota: '' })).statusCode).toBe(200);
    const [dopo] = (await app.inject({ method: 'GET', url: '/api/crm' })).json<{ aziende: VoceDto[] }>()
      .aziende;
    expect(dopo?.nota).toBeNull();
    expect(dopo?.stato).toBe('cliente');

    await app.close();
  });

  it('rifiuta stati inventati, modifiche vuote e aziende che il CRM non ha', async () => {
    const app = buildServer({ provider: new MockCompanyProvider() });
    await app.inject({ method: 'GET', url: '/api/prospect?comune=A060' });

    const inventato = await app.inject({
      method: 'PATCH',
      url: `/api/crm/${MECCANICA}`,
      payload: { stato: 'inadempiente' },
    });
    expect(inventato.statusCode).toBe(400);

    const vuota = await app.inject({ method: 'PATCH', url: `/api/crm/${MECCANICA}`, payload: {} });
    expect(vuota.statusCode).toBe(400);

    const sconosciuta = await app.inject({
      method: 'PATCH',
      url: `/api/crm/${ADRIATICA}`,
      payload: { stato: 'cliente' },
    });
    expect(sconosciuta.statusCode).toBe(404);

    await app.close();
  });

  it('il file segue il filtro per stato e non ha colonne assicurative', async () => {
    const app = buildServer({ provider: new MockCompanyProvider() });
    await app.inject({ method: 'GET', url: '/api/prospect?comune=A060' });
    await app.inject({ method: 'POST', url: `/api/aziende/${ADRIATICA}/analisi`, payload: {} });
    await app.inject({ method: 'PATCH', url: `/api/crm/${ADRIATICA}`, payload: { stato: 'cliente' } });

    const tutto = await app.inject({ method: 'GET', url: '/api/crm/esporta' });
    expect(tutto.headers['content-type']).toContain('text/csv');
    expect(tutto.headers['content-disposition']).toMatch(
      /attachment; filename="crm-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(tutto.body).toContain(MECCANICA);
    expect(tutto.body).toContain(ADRIATICA);
    expect(tutto.body).not.toMatch(/CAT NAT|Coperture da attivare|Esposizione non assicurata/);

    const clienti = await app.inject({ method: 'GET', url: '/api/crm/esporta?filtro=cliente' });
    expect(clienti.headers['content-disposition']).toContain('crm-cliente-');
    expect(clienti.body).toContain(ADRIATICA);
    expect(clienti.body).not.toContain(MECCANICA);

    await app.close();
  });
});

describe('CRM su database', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva('Studio del CRM');
    await creaUtenteDiProva(persistenza, 'crm@studio.it');
    app = serverDiProva(persistenza);
    cookie = await accedi(app, 'crm@studio.it');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  const leggi = async (conCookie = cookie) =>
    (await app.inject({ method: 'GET', url: '/api/crm', headers: { cookie: conCookie } })).json<{
      aziende: VoceDto[];
    }>().aziende;

  it('l’elenco comprato resta nel CRM, con il comune; ricomprarlo non cambia lo stato', async () => {
    const elenco = await app.inject({
      method: 'GET',
      url: '/api/prospect?comune=A060',
      headers: { cookie },
    });
    expect(elenco.json<{ salvateNelCrm?: boolean }>().salvateNelCrm).toBe(true);

    const [meccanica] = await leggi();
    expect(meccanica?.identificativo).toBe(MECCANICA);
    expect(meccanica?.comune).toBe('Adro');
    expect(meccanica?.stato).toBe('da-contattare');
    const primoArrivo = meccanica?.daElencoIl;
    expect(primoArrivo).not.toBeNull();

    const cambio = await app.inject({
      method: 'PATCH',
      url: `/api/crm/${MECCANICA}`,
      headers: { cookie },
      payload: { stato: 'cliente', nota: 'Firmato' },
    });
    expect(cambio.statusCode).toBe(200);

    // Lo stesso elenco comprato di nuovo: il cliente resta cliente, e la data del primo arrivo resta.
    await app.inject({ method: 'GET', url: '/api/prospect?comune=A060', headers: { cookie } });
    const [dopo] = await leggi();
    expect(dopo?.stato).toBe('cliente');
    expect(dopo?.nota).toBe('Firmato');
    expect(dopo?.daElencoIl).toBe(primoArrivo);
  });

  it('un’azienda analizzata porta i contatti del record camerale', async () => {
    const analisi = await app.inject({
      method: 'POST',
      url: `/api/aziende/${ADRIATICA}/analisi`,
      headers: { cookie },
      payload: {},
    });
    expect(analisi.statusCode).toBe(200);

    /*
      I contatti sono quelli DI QUESTA azienda.

      Con due aziende nel CRM, una query che prendesse l'ultimo snapshot dell'archivio invece di
      quello dell'azienda darebbe le stesse righe piene e passerebbe un controllo generico. Finché
      le aziende dimostrative si ereditavano i contatti fra loro, questa differenza non era
      nemmeno osservabile.
    */
    const aziende = await leggi();
    const adriatica = aziende.find((a) => a.identificativo === ADRIATICA);
    expect(adriatica?.analizzataIl).not.toBeNull();
    expect(adriatica?.daElencoIl).toBeNull();
    expect(adriatica?.pec).toBe('adriaticalogistica@pec.example');
    expect(adriatica?.telefono).toBe('+39 0544 000000');
    expect(adriatica?.sitoWeb).toBe('https://www.adriaticalogistica.example');

    const meccanica = aziende.find((a) => a.identificativo === MECCANICA);
    expect(meccanica?.pec).not.toBe(adriatica?.pec);
  });

  /*
    I punteggi del CRM sono quelli della scheda, non un secondo calcolo.

    Richiesta di Simone del 19/09/2026: Property, Business Interruption e Cyber per ogni azienda
    del CRM. Sono salvati con l'analisi (migrazione 0017) proprio perché ricalcolarli qui vorrebbe
    dire rispondere due volte alla stessa domanda, e un giorno rispondere diverso.
  */
  it('i punteggi delle protezioni sono quelli dell\u2019analisi, e chi non \u00e8 stata analizzata non ne ha', async () => {
    const analisi = await app.inject({
      method: 'POST',
      url: `/api/aziende/${ADRIATICA}/analisi`,
      headers: { cookie },
      payload: {},
    });
    const { protezioni } = analisi.json<{
      protezioni: {
        property: { punteggio: number | null };
        businessInterruption: {
          punteggioFisico: number | null;
          perditaGiornaliera: { centesimi: number } | null;
        };
        cyber: { punteggio: number | null };
      };
    }>();
    expect(protezioni.property.punteggio).not.toBeNull();
    expect(protezioni.cyber.punteggio).not.toBeNull();

    const aziende = await leggi();
    const adriatica = aziende.find((a) => a.identificativo === ADRIATICA);
    expect(adriatica?.propertyRisk).toBe(protezioni.property.punteggio);
    expect(adriatica?.biPunteggio).toBe(protezioni.businessInterruption.punteggioFisico);
    expect(adriatica?.biPerditaGiornalieraCentesimi).toBe(
      protezioni.businessInterruption.perditaGiornaliera?.centesimi ?? null,
    );
    expect(adriatica?.cyberRisk).toBe(protezioni.cyber.punteggio);

    // Arrivata da un elenco e mai analizzata: nessun punteggio inventato, e nessuno zero.
    const meccanicaOra = aziende.find((a) => a.identificativo === MECCANICA);
    expect(meccanicaOra?.analizzataIl).toBeNull();
    expect(meccanicaOra?.propertyRisk).toBeNull();
    expect(meccanicaOra?.cyberRisk).toBeNull();
    expect(meccanicaOra?.biPerditaGiornalieraCentesimi).toBeNull();

    // E nel file esportato ci sono le colonne, con la virgola decimale.
    const csv = await app.inject({ method: 'GET', url: '/api/crm/esporta', headers: { cookie } });
    expect(csv.body).toContain('"Property Risk";"Business Interruption al giorno";"Cyber Risk"');
  });

  it('un altro studio non vede il CRM, e non può cambiarne una riga', async () => {
    const { schema } = await import('@aegis/db');
    const [altro] = await persistenza.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio concorrente' })
      .returning({ id: schema.tenants.id });
    if (altro === undefined) throw new Error('secondo studio non creato');
    await creaUtenteDiProva(persistenza, 'concorrente@altro.it', altro.id);
    const cookieAltro = await accedi(app, 'concorrente@altro.it');

    expect(await leggi(cookieAltro)).toEqual([]);

    const tentativo = await app.inject({
      method: 'PATCH',
      url: `/api/crm/${MECCANICA}`,
      headers: { cookie: cookieAltro },
      payload: { stato: 'non-interessata' },
    });
    expect(tentativo.statusCode).toBe(404);

    const [meccanica] = (await leggi()).filter((a) => a.identificativo === MECCANICA);
    expect(meccanica?.stato).toBe('cliente');
  });
});
