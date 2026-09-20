/**
 * Quello che il CRM legge di un'azienda: i punteggi delle protezioni e i contatti.
 *
 * Richiesta di Simone del 19/09/2026: «oltre la pec metti anche il numero se c'è, e poi metti
 * anche il punteggio property risk, cyber risk e business interruption che si vede per ogni
 * azienda nel crm». Due cose da presidiare, e nessuna delle due si vede dall'interfaccia:
 *
 * - il telefono sta in **due posti** del profilo — l'anagrafica del record camerale e le
 *   qualifiche del profilo completo — e il CRM ne leggeva uno solo: con l'analisi approfondita
 *   la scheda mostrava il numero e il CRM la sola PEC;
 * - i punteggi arrivano da colonne `numeric` e `bigint`, che il driver restituisce come
 *   STRINGA (CLAUDE.md, regola 2). Un «5.17» al posto di 5,17 non dà errore: disegna un cerchio
 *   vuoto e ordina male, in silenzio.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applicaSchemaTollerante, connetti, elencoCrm, salvaAnalisi, schema } from '../src/index.js';
import type { Connessione } from '../src/index.js';

/** Un profilo ridotto all'osso: conta dove stanno telefono e sito, non il resto. */
function profilo(anagrafica: Record<string, unknown>, qualifiche: Record<string, unknown> | null) {
  return {
    anagrafica: { value: { sedeLegale: { comune: 'Adro', provincia: 'BS' }, ...anagrafica } },
    indicatoriFornitore: { qualifiche },
  };
}

describe('Il CRM legge i punteggi e i contatti dell’ultima analisi', () => {
  let connessione: Connessione;
  let tenantId: string;
  let conQualifiche: string;
  let conAnagrafica: string;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);

    const tenant = await connessione.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio dei punteggi' })
      .returning({ id: schema.tenants.id });
    tenantId = tenant[0]!.id;

    const aziende = await connessione.db
      .insert(schema.aziende)
      .values([
        { tenantId, denominazione: 'OROBIA S.R.L.', partitaIva: '00000000011' },
        { tenantId, denominazione: 'SERIO S.R.L.', partitaIva: '00000000012' },
      ])
      .returning({ id: schema.aziende.id });
    conQualifiche = aziende[0]!.id;
    conAnagrafica = aziende[1]!.id;

    const snapshot = await connessione.db
      .insert(schema.snapshotAzienda)
      .values([
        {
          aziendaId: conQualifiche,
          tenantId,
          provider: 'prova',
          livello: 'completo',
          // L'anagrafica non ha il numero: ce l'ha il profilo completo, come sulle aziende vere.
          profilo: profilo(
            { telefono: null, pec: 'orobia@pec.example', sitoWeb: '  ' },
            {
              telefono: '+39 030 1234567',
              sitoWeb: 'www.orobia.example',
            },
          ),
          osservatoIl: new Date('2026-09-18T08:00:00Z'),
          costoCentesimi: 0,
        },
        {
          aziendaId: conAnagrafica,
          tenantId,
          provider: 'prova',
          livello: 'completo',
          profilo: profilo({ telefono: '+39 035 7654321', pec: 'serio@pec.example', sitoWeb: null }, null),
          osservatoIl: new Date('2026-09-18T08:00:00Z'),
          costoCentesimi: 0,
        },
      ])
      .returning({ id: schema.snapshotAzienda.id });

    const comune = {
      tenantId,
      asOf: new Date('2026-09-18T08:00:00Z'),
      scoreCredito: 62,
      classeCredito: 'C',
      fidoConsigliatoCentesimi: null,
      patrimonioEspostoCentesimi: null,
      esposizioneNonAssicurataCentesimi: null,
      rischiCritici: 2,
      coperturaAssente: 1,
      statoCatNat: 'inadempiente' as const,
      risultato: {},
      versioneCore: '0.1.0',
      versioneCatalogoRischi: '1',
      versioneRegole: '1',
      gap: [],
    };

    await salvaAnalisi(connessione.db, {
      ...comune,
      aziendaId: conQualifiche,
      snapshotId: snapshot[0]!.id,
      propertyRisk: 5.17,
      biPunteggio: 5.17,
      biPerditaGiornalieraCentesimi: 5_424_658,
      cyberRisk: 5.1,
    });

    // La seconda senza protezioni: è un'analisi come quelle salvate prima della migrazione 0017.
    await salvaAnalisi(connessione.db, {
      ...comune,
      aziendaId: conAnagrafica,
      snapshotId: snapshot[1]!.id,
    });
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  it('i punteggi tornano come numeri, non come stringhe', async () => {
    const righe = await elencoCrm(connessione.db, tenantId);
    const orobia = righe.find((r) => r.partitaIva === '00000000011');

    expect(orobia?.propertyRisk).toBe(5.17);
    expect(orobia?.biPunteggio).toBe(5.17);
    expect(orobia?.biPerditaGiornalieraCentesimi).toBe(5_424_658);
    expect(orobia?.cyberRisk).toBe(5.1);
    for (const valore of [
      orobia?.propertyRisk,
      orobia?.biPunteggio,
      orobia?.biPerditaGiornalieraCentesimi,
      orobia?.cyberRisk,
    ]) {
      expect(typeof valore).toBe('number');
    }
  }, 90_000);

  it('un’analisi salvata prima della migrazione non inventa zeri', async () => {
    const righe = await elencoCrm(connessione.db, tenantId);
    const serio = righe.find((r) => r.partitaIva === '00000000012');

    expect(serio?.propertyRisk).toBeNull();
    expect(serio?.biPunteggio).toBeNull();
    expect(serio?.biPerditaGiornalieraCentesimi).toBeNull();
    expect(serio?.cyberRisk).toBeNull();
  }, 90_000);

  it('il telefono e il sito arrivano anche dalle qualifiche del profilo completo', async () => {
    const righe = await elencoCrm(connessione.db, tenantId);

    const orobia = righe.find((r) => r.partitaIva === '00000000011');
    expect(orobia?.telefono).toBe('+39 030 1234567');
    // Il sito nell'anagrafica era due spazi: vale come assente, e si scende alle qualifiche.
    expect(orobia?.sitoWeb).toBe('www.orobia.example');
    expect(orobia?.pec).toBe('orobia@pec.example');

    // Dove l'anagrafica ha il numero resta quello, e senza qualifiche non si rompe niente.
    const serio = righe.find((r) => r.partitaIva === '00000000012');
    expect(serio?.telefono).toBe('+39 035 7654321');
    expect(serio?.sitoWeb).toBeNull();
  }, 90_000);
});
