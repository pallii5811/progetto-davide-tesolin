/**
 * Una volta comprato, mai più ripagato.
 *
 * Finché la cache viveva in memoria, ogni riavvio del servizio buttava via tutto ciò che
 * era stato acquistato: rianalizzare la stessa azienda il giorno dopo costava di nuovo
 * cinquantacinque centesimi per dati identici, già presenti in archivio. Bastavano un
 * aggiornamento, un riavvio notturno o un secondo processo a rifare la spesa — e nessuno se
 * ne accorgeva, perché il conto del fornitore arriva a fine mese e non dice quale euro era
 * evitabile.
 *
 * La prova decisiva è la terza: **due server distinti**, come dopo un riavvio. Le altre
 * verificano che la cache non menta — non serva un dato scaduto, non tenga in vita ciò che
 * è stato cancellato — perché una cache che risponde con dati vecchi è peggio di nessuna
 * cache: fa decidere su un'azienda che non esiste più in quella forma.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creaPersistenza } from '../src/persistenza.js';
import type { Persistenza } from '../src/persistenza.js';
import { CachePersistente } from '../src/cache-persistente.js';

describe('Cache delle risposte comprate', () => {
  let persistenza: Persistenza;

  beforeAll(async () => {
    persistenza = await creaPersistenza({ denominazioneTenant: 'Broker di prova' });
  }, 60_000);

  afterAll(async () => {
    await persistenza.chiudi();
  });

  it('conserva e restituisce ciò che è stato comprato', async () => {
    const cache = new CachePersistente(persistenza.db);
    await cache.set('GET /IT-advanced/123', {
      value: { denominazione: 'ACME' },
      expiresAt: Date.now() + 60_000,
    });

    const letto = await cache.get('GET /IT-advanced/123');
    expect(letto?.value).toEqual({ denominazione: 'ACME' });
  });

  it('sopravvive al riavvio: è tutto il punto', async () => {
    const primaAccensione = new CachePersistente(persistenza.db);
    await primaAccensione.set('GET /IT-advanced/456', {
      value: { denominazione: 'DOPO IL RIAVVIO' },
      expiresAt: Date.now() + 3_600_000,
    });

    /*
      Un'istanza nuova, con la memoria vuota: è ciò che accade a ogni riavvio, a ogni
      aggiornamento e su un secondo processo. Prima di questa tabella, qui si tornava dal
      fornitore e si ripagava.
    */
    const dopoIlRiavvio = new CachePersistente(persistenza.db);
    const letto = await dopoIlRiavvio.get('GET /IT-advanced/456');

    expect(letto?.value).toEqual({ denominazione: 'DOPO IL RIAVVIO' });
  });

  it('non serve un dato scaduto, e lo toglie di mezzo', async () => {
    const cache = new CachePersistente(persistenza.db);
    await cache.set('GET /IT-advanced/scaduto', {
      value: { vecchio: true },
      expiresAt: Date.now() - 1_000,
    });

    /*
      Una cache che risponde con dati vecchi è peggio di nessuna cache: fa decidere su
      un'azienda che non esiste più in quella forma, e il risparmio non vale la decisione
      sbagliata. La riga scaduta si cancella alla lettura, che è il momento in cui si sa
      con certezza che non serve più.
    */
    const cacheNuova = new CachePersistente(persistenza.db);
    expect(await cacheNuova.get('GET /IT-advanced/scaduto')).toBeUndefined();

    const { schema } = await import('@aegis/db');
    const righe = await persistenza.db.select().from(schema.cacheRisposte);
    expect(righe.some((r) => r.chiave === 'GET /IT-advanced/scaduto')).toBe(false);
  });

  it('riscrivere la stessa chiave aggiorna invece di fallire', async () => {
    const cache = new CachePersistente(persistenza.db);
    const chiave = 'GET /IT-advanced/concorrenza';

    /*
      Due analisi della stessa azienda lanciate insieme scrivono la stessa chiave. Un
      vincolo violato farebbe fallire l'analisi **dopo** aver già pagato il dato: si
      perderebbero insieme il denaro e il risultato.
    */
    await Promise.all([
      cache.set(chiave, { value: { giro: 1 }, expiresAt: Date.now() + 60_000 }),
      cache.set(chiave, { value: { giro: 2 }, expiresAt: Date.now() + 60_000 }),
    ]);

    const letto = await new CachePersistente(persistenza.db).get(chiave);
    expect(letto).toBeDefined();
  });

  it('dimenticare una chiave la toglie da entrambi gli strati', async () => {
    const cache = new CachePersistente(persistenza.db);
    await cache.set('GET /IT-advanced/dimenticabile', {
      value: { c: 1 },
      expiresAt: Date.now() + 60_000,
    });

    await cache.delete('GET /IT-advanced/dimenticabile');

    // Sulla stessa istanza — cioè anche lo strato veloce, non solo il database.
    expect(await cache.get('GET /IT-advanced/dimenticabile')).toBeUndefined();
  });
});
