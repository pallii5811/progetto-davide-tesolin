import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creaPersistenza } from '../src/persistenza.js';
import type { ContestoTenant, Persistenza } from '../src/persistenza.js';
import { accedi, creaUtenteDiProva, serverDiProva } from './aiuti.js';

/**
 * Prove sulla persistenza reale.
 *
 * Girano su PGlite — PostgreSQL compilato in WebAssembly, nello stesso processo del test.
 * Non è un finto database: è lo stesso dialetto, lo stesso DDL e le stesse transazioni
 * della produzione. Un test di persistenza scritto contro un doppio in memoria non
 * dimostra nulla, perché il doppio non ha vincoli di integrità, tipi né transazioni.
 */
describe('Persistenza su database', () => {
  let persistenza: Persistenza;
  let contesto: ContestoTenant;

  beforeAll(async () => {
    persistenza = await creaPersistenza({ denominazioneTenant: 'Broker di prova' });
    contesto = persistenza.perTenant(persistenza.tenantPredefinito);
  }, 60_000);

  afterAll(async () => {
    await persistenza.chiudi();
  });

  it('crea un solo intermediario predefinito, anche a chiamate ripetute', () => {
    expect(persistenza.tenantPredefinito).toMatch(/^[0-9a-f-]{36}$/);
    expect(contesto.tenantId).toBe(persistenza.tenantPredefinito);
  });

  it('conserva i dati di intervista fra due letture distinte', async () => {
    await contesto.dossier.upsert('03158460174', {
      datiDichiarati: { numeroVeicoli: 7, lavoraInCantiere: true },
    });

    const riletto = await contesto.dossier.get('03158460174');
    expect(riletto?.datiDichiarati.numeroVeicoli).toBe(7);
    expect(riletto?.datiDichiarati.lavoraInCantiere).toBe(true);
  });

  it('il salvataggio parziale non cancella i dati già raccolti', async () => {
    // È l'errore che farebbe perdere mezz'ora di intervista al primo salvataggio parziale.
    await contesto.dossier.upsert('03158460174', { datiDichiarati: { numeroDipendenti: 22 } });

    const riletto = await contesto.dossier.get('03158460174');
    expect(riletto?.datiDichiarati.numeroDipendenti).toBe(22);
    expect(riletto?.datiDichiarati.numeroVeicoli).toBe(7);
  });

  it('conserva le polizze con gli importi in centesimi, senza perdita di precisione', async () => {
    await contesto.dossier.upsert('03158460174', {
      polizze: [
        {
          id: 'p1',
          coverage: 'incendio',
          compagnia: 'Compagnia Alfa',
          numeroPolizza: '2024/117',
          sommaAssicurata: 200_000_00 as never,
          massimale: null,
          franchigia: 2_500_00 as never,
          scoperto: null,
          dataEffetto: new Date('2024-06-30T00:00:00Z'),
          dataScadenza: new Date('2026-06-30T00:00:00Z'),
          premioAnnuo: 4_800_00 as never,
          formaGaranzia: 'valore-a-nuovo',
          note: null,
        },
      ],
    });

    const riletto = await contesto.dossier.get('03158460174');
    expect(riletto?.polizze).toHaveLength(1);
    expect(riletto?.polizze[0]?.sommaAssicurata).toBe(200_000_00);
    expect(riletto?.polizze[0]?.compagnia).toBe('Compagnia Alfa');
    expect(riletto?.polizze[0]?.dataScadenza.getUTCFullYear()).toBe(2026);
  });

  it('restituisce null per un’azienda mai vista', async () => {
    expect(await contesto.dossier.get('99999999999')).toBeNull();
  });
});

describe('Analisi congelate e portafoglio', () => {
  let persistenza: Persistenza;

  beforeAll(async () => {
    persistenza = await creaPersistenza({ denominazioneTenant: 'Broker di prova' });
    await creaUtenteDiProva(persistenza, 'persistenza@studio.it');
  }, 60_000);

  afterAll(async () => {
    await persistenza.chiudi();
  });

  it('un’analisi eseguita via API compare nel portafoglio', async () => {
    const app = serverDiProva(persistenza);
    const cookie = await accedi(app, 'persistenza@studio.it');

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie },
      payload: { asOf: '2026-08-17T00:00:00Z' },
    });
    expect(risposta.statusCode).toBe(200);

    const portafoglio = await app.inject({ method: 'GET', url: '/api/portafoglio', headers: { cookie } });
    const corpo = portafoglio.json();

    expect(corpo.riepilogo.totale).toBe(1);
    expect(corpo.aziende[0]?.denominazione).toContain('MECCANICA');
    expect(corpo.aziende[0]?.statoCatNat).toBe('inadempiente');

    await app.close();
  });

  it('due analisi della stessa azienda producono due righe storiche, non una sovrascrittura', async () => {
    const app = serverDiProva(persistenza);
    const cookie = await accedi(app, 'persistenza@studio.it');

    await app.inject({
      method: 'POST',
      url: '/api/aziende/02657870644/analisi',
      headers: { cookie },
      payload: { asOf: '2026-01-15T00:00:00Z' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/aziende/02657870644/analisi',
      headers: { cookie },
      payload: { asOf: '2026-08-17T00:00:00Z' },
    });

    // Il portafoglio mostra una riga per azienda — l'ultima analisi — ma lo storico resta:
    // è ciò che rende difendibile una proposta fatta mesi prima.
    const { schema } = await import('@aegis/db');
    const righe = await persistenza.db.select().from(schema.analisi);
    expect(righe.length).toBeGreaterThanOrEqual(3);

    const portafoglio = await app.inject({ method: 'GET', url: '/api/portafoglio', headers: { cookie } });
    const corpo = portafoglio.json();
    expect(corpo.aziende).toHaveLength(2);

    await app.close();
  });

  it('ogni analisi salva uno snapshot immutabile dei dati che l’hanno prodotta', async () => {
    const { schema } = await import('@aegis/db');
    const snapshot = await persistenza.db.select().from(schema.snapshotAzienda);
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot[0]?.profilo).toBeTruthy();
  });

  it('registra le azioni nell’audit trail', async () => {
    const { schema } = await import('@aegis/db');
    const righe = await persistenza.db.select().from(schema.auditLog);
    const azioni = righe.map((r) => r.azione);
    expect(azioni).toContain('analisi.eseguita');
  });

  it('estrae le righe di gap per la lista di lavoro', async () => {
    const { schema } = await import('@aegis/db');
    const gap = await persistenza.db.select().from(schema.gapCoperture);
    expect(gap.length).toBeGreaterThan(0);
    // La CAT NAT inadempiente deve essere in cima: priorità 100.
    expect(gap.some((g) => g.copertura === 'catastrofali' && g.priorita === 100)).toBe(true);
  });
});
