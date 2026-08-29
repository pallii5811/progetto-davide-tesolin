/**
 * Il denaro non entra in un `integer`.
 *
 * Questi test nascono da un guasto reale: un massimale RC di 25.000.000 € — 2,5 miliardi
 * di centesimi — faceva fallire l'inserimento con «value out of range for type integer».
 * Non un arrotondamento, non un troncamento: la polizza non si salvava affatto.
 *
 * Il tetto di `int4` è 2.147.483.647 centesimi, cioè 21.474.836 €: sotto la somma
 * assicurata di un capannone di medie dimensioni, e otto ordini di grandezza sotto il
 * patrimonio di vigilanza di una compagnia.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { applicaSchemaTollerante, connetti, registraCosto, riepilogoCosti, schema } from '../src/index.js';
import type { Connessione } from '../src/index.js';

const OLTRE_INT32 = 2_500_000_000; // 25 milioni di euro in centesimi

describe('Colonne di denaro', () => {
  let connessione: Connessione;
  let tenantId: string;
  let aziendaId: string;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);

    const tenant = await connessione.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio di prova' })
      .returning({ id: schema.tenants.id });
    tenantId = tenant[0]!.id;

    const azienda = await connessione.db
      .insert(schema.aziende)
      .values({ tenantId, denominazione: 'Industria Pesante S.p.A.', partitaIva: '00000000000' })
      .returning({ id: schema.aziende.id });
    aziendaId = azienda[0]!.id;
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  it('accetta un massimale da 25 milioni di euro', async () => {
    const inserite = await connessione.db
      .insert(schema.polizze)
      .values({
        tenantId,
        aziendaId,
        copertura: 'rct',
        compagnia: 'Compagnia di prova',
        massimaleCentesimi: OLTRE_INT32,
        sommaAssicurataCentesimi: OLTRE_INT32 * 4,
        dataEffetto: '2026-01-01',
        dataScadenza: '2027-01-01',
      })
      .returning({
        massimale: schema.polizze.massimaleCentesimi,
        somma: schema.polizze.sommaAssicurataCentesimi,
      });

    // Riletti, non solo scritti: una conversione sbagliata si vede al ritorno.
    expect(inserite[0]?.massimale).toBe(OLTRE_INT32);
    expect(inserite[0]?.somma).toBe(OLTRE_INT32 * 4);
  });

  it('regge il patrimonio di vigilanza di una compagnia (decine di miliardi)', async () => {
    const compagnia = await connessione.db
      .insert(schema.compagnie)
      .values({ denominazione: 'Grande Compagnia S.p.A.' })
      .returning({ id: schema.compagnie.id });

    const fondiPropri = 5_000_000_000_000; // 50 miliardi di euro
    const salvata = await connessione.db
      .insert(schema.solidita)
      .values({
        compagniaId: compagnia[0]!.id,
        anno: 2025,
        fonte: 'SFCR 2025',
        fondiPropriCentesimi: fondiPropri,
        scrCentesimi: 2_000_000_000_000,
      })
      .returning({ fondiPropri: schema.solidita.fondiPropriCentesimi });

    expect(salvata[0]?.fondiPropri).toBe(fondiPropri);
  });

  it('nessuna colonna di denaro è rimasta a integer', async () => {
    const righe = await connessione.db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name LIKE '%_centesimi'
        AND data_type <> 'bigint'
    `);

    // Il guasto originale era esattamente questo, e nessun test lo avrebbe intercettato:
    // le somme in gioco nei test di dominio stavano tutte sotto i 21 milioni.
    expect(righe.rows).toEqual([]);
  });
});

describe('Registro costi: gli importi tornano numeri', () => {
  it('somma correttamente anche quando il driver restituisce stringhe', async () => {
    const connessione = await connetti();
    try {
      await applicaSchemaTollerante(connessione);

      const tenant = await connessione.db
        .insert(schema.tenants)
        .values({ denominazione: 'Studio costi' })
        .returning({ id: schema.tenants.id });
      const tenantId = tenant[0]!.id;

      await registraCosto(connessione.db, {
        tenantId,
        aziendaId: null,
        provider: 'OpenAPI.com',
        servizio: 'IT-advanced',
        costoCentesimi: 10,
        servitoDaCache: false,
      });
      await registraCosto(connessione.db, {
        tenantId,
        aziendaId: null,
        provider: 'OpenAPI.com',
        servizio: 'IT-advanced',
        costoCentesimi: 10,
        servitoDaCache: true,
      });

      const riepilogo = await riepilogoCosti(connessione.db, tenantId);

      // `bigint` può arrivare come stringa dal driver: sommarla darebbe `NaN`, e un `NaN`
      // nel registro costi si nota solo quando qualcuno chiede quanto ha speso.
      expect(Number.isFinite(riepilogo.totaleCentesimi)).toBe(true);
      expect(riepilogo.totaleCentesimi).toBe(10);
      expect(riepilogo.risparmioCentesimi).toBe(10);
      expect(riepilogo.chiamate).toBe(2);
      expect(riepilogo.perServizio[0]?.costoCentesimi).toBe(10);
    } finally {
      await connessione.chiudi();
    }
  }, 90_000);
});
