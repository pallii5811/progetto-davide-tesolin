import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';
import type { Persistenza } from '../src/persistenza.js';
import { aziendeDaMostrare, chiaveElenco } from '../src/elenchi-scaricati.js';
import { accedi, creaUtenteDiProva, persistenzaDiProva, serverDiProva } from './aiuti.js';

/**
 * Gli elenchi già comprati non si ricomprano, e le aziende già nel CRM non escono (18/09/2026).
 *
 * Richiesta di Simone: «alla prossima ricerca se cerco gli stessi filtri quelle aziende già nel
 * CRM non devono uscire». Il fornitore fa pagare ogni azienda che restituisce: ricomprando gli
 * stessi filtri si chiedono le successive, e ciò che è già nel CRM per altre vie resta fuori.
 *
 * Le aziende dimostrative di Bergamo esistono per queste prove: due hanno «bergamasch» nel nome,
 * TRASPORTI BERGAMASCHI prima e MECCANICHE BERGAMASCHE dopo, nell'ordine del catalogo.
 */

const TRASPORTI = 'TRASPORTI BERGAMASCHI S.R.L.';
const MECCANICHE = 'MECCANICHE BERGAMASCHE S.R.L.';
const DUE_A_BERGAMO = '/api/prospect?comune=A794&denominazione=bergamasch&limite=1';

interface Risposta {
  totale: number;
  lotto: number;
  costoElencoCentesimi: number;
  aziende: { denominazione: string; partitaIva: string | null }[];
  giaScaricate?: number;
  saltate?: number;
  giaNelCrm?: number;
}

describe('La chiave di un elenco', () => {
  it('non cambia con quante aziende si chiedono né da dove si parte', () => {
    const base = chiaveElenco({ comune: 'A794', ateco: '25.62' });
    expect(chiaveElenco({ comune: 'A794', ateco: '25.62', limite: 5 })).toBe(base);
    expect(chiaveElenco({ comune: 'A794', ateco: '25.62', limite: 20, salta: 3 })).toBe(base);
    expect(chiaveElenco({ comune: 'A794', ateco: '25.62', arricchimento: 'advanced' })).toBe(base);
  });

  it('scritture diverse della stessa richiesta al fornitore sono la stessa chiave', () => {
    // Il fornitore riceve l'ATECO senza punti e la provincia in maiuscolo.
    expect(chiaveElenco({ comune: 'A794', ateco: '2562' })).toBe(
      chiaveElenco({ comune: 'A794', ateco: '25.62' }),
    );
    expect(chiaveElenco({ provincia: 'bg', ateco: '2562' })).toBe(
      chiaveElenco({ provincia: 'BG', ateco: '2562' }),
    );
    expect(chiaveElenco({ comune: 'A794', denominazione: '  rossi ' })).toBe(
      chiaveElenco({ comune: 'A794', denominazione: 'rossi' }),
    );
  });

  it('filtri diversi sono chiavi diverse', () => {
    const base = chiaveElenco({ comune: 'A794', ateco: '2562' });
    expect(chiaveElenco({ comune: 'A794', ateco: '2511' })).not.toBe(base);
    expect(chiaveElenco({ comune: 'A060', ateco: '2562' })).not.toBe(base);
    expect(chiaveElenco({ comune: 'A794', ateco: '2562', addettiMin: 10 })).not.toBe(base);
    expect(chiaveElenco({ comune: 'A794', ateco: '2562', formaGiuridicaCodice: 'SP' })).not.toBe(base);
    expect(chiaveElenco({ comune: 'A794', ateco: '2562', soloAttive: false })).not.toBe(base);
  });
});

describe('Quali aziende di un elenco si mostrano', () => {
  const a = { partitaIva: '04801050164' };
  const b = { partitaIva: '04801060163' };
  const senza = { partitaIva: null };

  it('fuori quelle già nel CRM, dentro quelle arrivate da questi stessi filtri', () => {
    const nelCrm = new Set(['04801050164', '04801060163']);
    const { visibili, nascoste } = aziendeDaMostrare([a, b], nelCrm, new Set(['04801050164']));
    expect(visibili).toEqual([a]);
    expect(nascoste).toBe(1);
  });

  it('senza partita IVA non si può dire che sia già nota: si mostra', () => {
    const { visibili, nascoste } = aziendeDaMostrare([senza], new Set(['04801050164']), new Set());
    expect(visibili).toEqual([senza]);
    expect(nascoste).toBe(0);
  });
});

describe('Ricomprare gli stessi filtri, senza database', () => {
  const nuovo = () => buildServer({ provider: new MockCompanyProvider() });
  const chiedi = async (app: FastifyInstance, url: string) =>
    (await app.inject({ method: 'GET', url })).json<Risposta>();

  it('il secondo acquisto porta la successiva, il terzo niente e non costa niente', async () => {
    const app = nuovo();

    const primo = await chiedi(app, DUE_A_BERGAMO);
    expect(primo.aziende.map((x) => x.denominazione)).toEqual([TRASPORTI]);
    expect(primo.saltate).toBe(0);
    expect(primo.giaNelCrm).toBe(0);

    const conteggio = await chiedi(app, `${DUE_A_BERGAMO}&soloConteggio=1`);
    expect(conteggio.totale).toBe(2);
    expect(conteggio.giaScaricate).toBe(1);
    expect(conteggio.lotto).toBe(1);

    const secondo = await chiedi(app, DUE_A_BERGAMO);
    expect(secondo.aziende.map((x) => x.denominazione)).toEqual([MECCANICHE]);
    expect(secondo.saltate).toBe(1);

    const finito = await chiedi(app, `${DUE_A_BERGAMO}&soloConteggio=1`);
    expect(finito.giaScaricate).toBe(2);
    expect(finito.lotto).toBe(0);
    expect(finito.costoElencoCentesimi).toBe(0);

    const terzo = await chiedi(app, DUE_A_BERGAMO);
    expect(terzo.aziende).toEqual([]);
    expect(terzo.saltate).toBe(2);
    expect(terzo.costoElencoCentesimi).toBe(0);
    await app.close();
  });

  it('ricaricare la pagina di un elenco lo rimostra, e non fa avanzare niente', async () => {
    const app = nuovo();
    await chiedi(app, DUE_A_BERGAMO);
    await chiedi(app, DUE_A_BERGAMO);

    // L'indirizzo del primo acquisto porta salta=0: stessa richiesta, stesse aziende.
    const ricaricato = await chiedi(app, `${DUE_A_BERGAMO}&salta=0`);
    expect(ricaricato.aziende.map((x) => x.denominazione)).toEqual([TRASPORTI]);
    expect(ricaricato.giaNelCrm).toBe(0);

    const conteggio = await chiedi(app, `${DUE_A_BERGAMO}&soloConteggio=1`);
    expect(conteggio.giaScaricate).toBe(2);
    await app.close();
  });

  it('una posizione oltre quelle comprate non salta aziende mai viste', async () => {
    const app = nuovo();
    const oltre = await chiedi(app, `${DUE_A_BERGAMO}&salta=50`);
    expect(oltre.saltate).toBe(0);
    expect(oltre.aziende.map((x) => x.denominazione)).toEqual([TRASPORTI]);
    await app.close();
  });

  it('un’azienda già nel CRM da un altro elenco non esce, e la pagina sa quante ne ha tenute fuori', async () => {
    const app = nuovo();
    // OFFICINE OROBICHE entra nel CRM con un elenco per settore…
    const perSettore = await chiedi(app, '/api/prospect?comune=A794&ateco=2511&limite=5');
    expect(perSettore.aziende.map((x) => x.denominazione)).toEqual(['OFFICINE OROBICHE S.R.L.']);

    // …e un elenco con filtri diversi che la ritrova non la mostra di nuovo.
    const perNome = await chiedi(app, '/api/prospect?comune=A794&denominazione=orobiche&limite=5');
    expect(perNome.aziende).toEqual([]);
    expect(perNome.giaNelCrm).toBe(1);
    expect(perNome.saltate).toBe(0);
    await app.close();
  });

  it('il conteggio senza acquisti precedenti resta quello di prima', async () => {
    const app = nuovo();
    const conteggio = await chiedi(app, '/api/prospect?comune=A794&limite=2&soloConteggio=1');
    expect(conteggio.totale).toBe(6);
    expect(conteggio.lotto).toBe(2);
    expect(conteggio.giaScaricate).toBe(0);
    expect(conteggio.costoElencoCentesimi).toBe(10);
    await app.close();
  });
});

describe('Ricomprare gli stessi filtri, su database', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva('Studio degli elenchi');
    await creaUtenteDiProva(persistenza, 'elenchi@studio.it');
    app = serverDiProva(persistenza);
    cookie = await accedi(app, 'elenchi@studio.it');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  const chiedi = async (url: string, conCookie = cookie) =>
    (await app.inject({ method: 'GET', url, headers: { cookie: conCookie } })).json<Risposta>();

  it('il punto di ripartenza resta nell’archivio, e le aziende di questi filtri si rivedono ricaricando', async () => {
    expect((await chiedi(DUE_A_BERGAMO)).aziende.map((x) => x.denominazione)).toEqual([TRASPORTI]);
    expect((await chiedi(DUE_A_BERGAMO)).aziende.map((x) => x.denominazione)).toEqual([MECCANICHE]);
    expect((await chiedi(`${DUE_A_BERGAMO}&soloConteggio=1`)).giaScaricate).toBe(2);
    expect((await chiedi(`${DUE_A_BERGAMO}&salta=1`)).aziende.map((x) => x.denominazione)).toEqual([
      MECCANICHE,
    ]);
    expect((await chiedi(`${DUE_A_BERGAMO}&soloConteggio=1`)).giaScaricate).toBe(2);
  });

  it('un altro studio riparte dall’inizio: il punto di ripartenza è dello studio', async () => {
    const { schema } = await import('@aegis/db');
    const [altro] = await persistenza.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio concorrente degli elenchi' })
      .returning({ id: schema.tenants.id });
    if (altro === undefined) throw new Error('secondo studio non creato');
    await creaUtenteDiProva(persistenza, 'concorrente@elenchi.it', altro.id);
    const cookieAltro = await accedi(app, 'concorrente@elenchi.it');

    const conteggio = await chiedi(`${DUE_A_BERGAMO}&soloConteggio=1`, cookieAltro);
    expect(conteggio.giaScaricate).toBe(0);
    const primo = await chiedi(DUE_A_BERGAMO, cookieAltro);
    expect(primo.aziende.map((x) => x.denominazione)).toEqual([TRASPORTI]);
    expect(primo.giaNelCrm).toBe(0);
  });
});
