import { describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';

const app = buildServer({ provider: new MockCompanyProvider() });

async function get(url: string): Promise<{ status: number; body: any }> {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json() };
}

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const response = await app.inject({ method: 'POST', url, payload });
  return { status: response.statusCode, body: response.json() };
}

describe('API', () => {
  it('espone lo stato del servizio e il provider attivo', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.stato).toBe('ok');
    expect(body.datiReali).toBe(false);
  });

  it('rifiuta una ricerca senza criteri', async () => {
    const { status } = await get('/api/aziende/ricerca');
    expect(status).toBe(400);
  });

  it('cerca per denominazione', async () => {
    const { status, body } = await get('/api/aziende/ricerca?denominazione=meccanica');
    expect(status).toBe(200);
    expect(body.risultati).toHaveLength(1);
    expect(body.risultati[0].denominazione).toContain('MECCANICA');
  });

  it('cerca per partita IVA', async () => {
    const { body } = await get('/api/aziende/ricerca?partitaIva=02413390390');
    expect(body.risultati[0].provincia).toBe('RA');
  });

  it('rifiuta subito una partita IVA con check digit errato, senza interrogare il provider', async () => {
    const { status, body } = await get('/api/aziende/ricerca?partitaIva=02413390398');
    expect(status).toBe(400);
    expect(body.errore).toContain('carattere di controllo');
  });

  it('restituisce il profilo anagrafico', async () => {
    const { status, body } = await get('/api/aziende/03158460174/profilo');
    expect(status).toBe(200);
    expect(body.anagrafica.formaGiuridica).toBe('srl');
    expect(body.eserciziDisponibili).toEqual([2025, 2024]);
  });

  it('produce l’analisi completa con importi in tre forme', async () => {
    const { status, body } = await post('/api/aziende/03158460174/analisi', {
      asOf: '2026-08-17T00:00:00Z',
    });
    expect(status).toBe(200);

    expect(body.sintesi.scoreCredito).toBeGreaterThan(0);
    expect(body.sintesi.fidoConsigliato).toHaveProperty('centesimi');
    expect(body.sintesi.fidoConsigliato).toHaveProperty('euro');
    expect(body.sintesi.fidoConsigliato.formattato).toContain('€');

    expect(body.rischi.length).toBeGreaterThan(10);
    expect(body.gap.voci.length).toBeGreaterThan(5);
    expect(body.catNat.stato).toBe('inadempiente');
  });

  it('ogni numero dell’analisi porta con sé la propria spiegazione', async () => {
    const { body } = await post('/api/aziende/03158460174/analisi', {});
    expect(body.sommeAssicurande.danniIndiretti.spiegazione.formula).toContain('Margine di contribuzione');
    expect(body.sommeAssicurande.danniIndiretti.spiegazione.note.length).toBeGreaterThan(0);
    expect(body.credito.fido.spiegazione.input.length).toBeGreaterThan(3);
  });

  it('conserva i dati di intervista fra due analisi successive', async () => {
    const url = '/api/aziende/02657870644/analisi';

    await post(url, {
      datiDichiarati: { numeroVeicoli: 12, lavoraInCantiere: true },
      polizze: [],
    });
    // Seconda chiamata senza ripetere i dati: devono essere ancora presenti.
    const { body } = await post(url, { asOf: '2026-08-17T00:00:00Z' });

    const flotta = body.rischi.find((r: any) => r.id === 'sinistro-flotta');
    expect(flotta).toBeDefined();
    expect(flotta.daVerificare).toBe(false);

    const dossier = await get('/api/aziende/02657870644/dossier');
    expect(dossier.body.datiDichiarati.numeroVeicoli).toBe(12);
  });

  it('l’analisi tiene conto delle polizze dichiarate', async () => {
    const url = '/api/aziende/02413390390/analisi';
    const { body } = await post(url, {
      asOf: '2026-08-17T00:00:00Z',
      polizze: [
        {
          id: 'p1',
          coverage: 'catastrofali',
          compagnia: 'Compagnia Gamma',
          sommaAssicurataEuro: 4_000_000,
          dataEffetto: '2026-01-01',
          dataScadenza: '2027-01-01',
        },
      ],
    });
    expect(body.catNat.stato).toBe('adempiente');
    expect(body.sintesi.catNatConforme).toBe(true);
  });

  it('rifiuta una polizza con copertura sconosciuta', async () => {
    const { status } = await post('/api/aziende/03158460174/analisi', {
      polizze: [
        {
          id: 'p1',
          coverage: 'copertura-inventata',
          compagnia: 'X',
          dataEffetto: '2026-01-01',
          dataScadenza: '2027-01-01',
        },
      ],
    });
    expect(status).toBe(400);
  });

  it('espone i cataloghi di rischi e coperture', async () => {
    const rischi = await get('/api/catalogo/rischi');
    const coperture = await get('/api/catalogo/coperture');
    expect(rischi.body.rischi.length).toBeGreaterThan(25);
    expect(coperture.body.coperture.length).toBeGreaterThan(20);
    expect(coperture.body.coperture.some((c: any) => c.obbligoDiLegge)).toBe(true);
  });

  it('espone il registro dei costi dati', async () => {
    const { status, body } = await get('/api/costi');
    expect(status).toBe(200);
    expect(body).toHaveProperty('totaleEuro');
    expect(body).toHaveProperty('risparmioDaCacheEuro');
  });
});
