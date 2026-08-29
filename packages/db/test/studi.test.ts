/**
 * Gli studi ospitati sulla piattaforma.
 *
 * Due proprietà che sembrano contabilità e non lo sono.
 *
 * La prima è il **conteggio dei collaboratori**: scritto come sottoquery correlata a mano,
 * dava zero per tutti. Interpolando le colonne in SQL grezzo il costruttore emette i nomi
 * non qualificati — `WHERE "tenant_id" = "id"` — e dentro la sottoquery `"id"` è la
 * colonna di `utenti`, che ce l'ha anche lei. Il confronto diventava «l'utente con sé
 * stesso»: sempre falso, sempre zero, e uno zero è un numero perfettamente plausibile che
 * nessuna eccezione segnala. È il tipo di difetto che si scopre solo guardando la pagina
 * con dei dati veri davanti.
 *
 * La seconda è la **riparazione degli archivi nati prima** della distinzione fra gestore
 * e clienti: senza, nessuno risulterebbe gestore e le pagine della fornitura dati
 * resterebbero irraggiungibili per tutti, compreso chi ha installato la piattaforma —
 * senza alcun modo di rimediare dall'interfaccia.
 */

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applicaSchemaTollerante,
  assicuraTenantPredefinito,
  connetti,
  creaStudio,
  creaUtente,
  elencoStudi,
  impostaAttivitaStudio,
  statoStudio,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';
import { schema } from '../src/index.js';

describe('Elenco degli studi', () => {
  let connessione: Connessione;

  beforeEach(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);
  }, 90_000);

  afterEach(async () => {
    await connessione.chiudi();
  });

  it('conta i collaboratori di ciascuno studio, non quelli di tutti', async () => {
    const gestore = await assicuraTenantPredefinito(connessione.db, 'Studio gestore');
    await creaUtente(connessione.db, {
      tenantId: gestore,
      email: 'uno@gestore.it',
      nome: 'Uno',
      passwordHash: 'x',
    });

    const cliente = await creaStudio(connessione.db, 'Studio cliente');
    await creaUtente(connessione.db, {
      tenantId: cliente,
      email: 'due@cliente.it',
      nome: 'Due',
      passwordHash: 'x',
    });
    await creaUtente(connessione.db, {
      tenantId: cliente,
      email: 'tre@cliente.it',
      nome: 'Tre',
      passwordHash: 'x',
    });

    await creaStudio(connessione.db, 'Studio senza nessuno');

    const elenco = await elencoStudi(connessione.db);
    const per = (nome: string): number => elenco.find((s) => s.denominazione === nome)?.utenti ?? -1;

    expect(per('Studio gestore')).toBe(1);
    expect(per('Studio cliente')).toBe(2);
    // Zero e non uno: con `COUNT(*)` su una giunzione esterna una riga senza
    // corrispondenze conterebbe sé stessa.
    expect(per('Studio senza nessuno')).toBe(0);
  }, 90_000);

  it('mette per primo lo studio che gestisce la piattaforma', async () => {
    // «Zeta» verrebbe per ultimo in ordine alfabetico: il gestore precede comunque,
    // perché chi apre questa pagina cerca prima di tutto sé stesso.
    await assicuraTenantPredefinito(connessione.db, 'Zeta gestore');
    await creaStudio(connessione.db, 'Alfa cliente');

    const elenco = await elencoStudi(connessione.db);
    expect(elenco[0]?.denominazione).toBe('Zeta gestore');
    expect(elenco[0]?.gestorePiattaforma).toBe(true);
  }, 90_000);

  it('gli studi aperti dopo sono clienti, non gestori', async () => {
    await assicuraTenantPredefinito(connessione.db, 'Studio gestore');
    const cliente = await creaStudio(connessione.db, 'Studio cliente');

    // Un cliente creato per errore come gestore vedrebbe la fornitura dati di tutti.
    expect((await statoStudio(connessione.db, cliente)).gestorePiattaforma).toBe(false);
  }, 90_000);

  it('la sospensione si legge dallo stato dello studio', async () => {
    await assicuraTenantPredefinito(connessione.db, 'Studio gestore');
    const cliente = await creaStudio(connessione.db, 'Studio cliente');

    await impostaAttivitaStudio(connessione.db, cliente, false);
    expect((await statoStudio(connessione.db, cliente)).attivo).toBe(false);

    await impostaAttivitaStudio(connessione.db, cliente, true);
    expect((await statoStudio(connessione.db, cliente)).attivo).toBe(true);
  }, 90_000);

  it('uno studio che non esiste non è né gestore né attivo', async () => {
    // Negare è l'unico esito sicuro: un identificativo inventato non deve aprire nulla.
    const stato = await statoStudio(connessione.db, '00000000-0000-0000-0000-000000000000');
    expect(stato).toEqual({ gestorePiattaforma: false, attivo: false });
  }, 90_000);
});

describe('Archivi nati prima della distinzione fra gestore e clienti', () => {
  let connessione: Connessione;

  beforeEach(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);
  }, 90_000);

  afterEach(async () => {
    await connessione.chiudi();
  });

  it('promuove a gestore lo studio più vecchio quando nessuno lo è', async () => {
    const primo = await assicuraTenantPredefinito(connessione.db, 'Studio storico');
    await creaStudio(connessione.db, 'Studio aggiunto dopo');

    // Si riporta l'archivio com'era prima che la colonna esistesse: nessun gestore.
    await connessione.db.update(schema.tenants).set({ gestorePiattaforma: false });
    expect((await statoStudio(connessione.db, primo)).gestorePiattaforma).toBe(false);

    // È la stessa funzione che gira a ogni avvio del servizio: la riparazione avviene
    // da sé, senza che nessuno debba toccare il database a mano.
    const risolto = await assicuraTenantPredefinito(connessione.db, 'Studio storico');

    expect(risolto).toBe(primo);
    expect((await statoStudio(connessione.db, primo)).gestorePiattaforma).toBe(true);
  }, 90_000);

  it('non promuove nessuno se un gestore c’è già', async () => {
    const primo = await assicuraTenantPredefinito(connessione.db, 'Studio gestore');
    const secondo = await creaStudio(connessione.db, 'Studio cliente');

    // Il gestore vero è il secondo: chi ha installato la piattaforma può averlo spostato.
    await connessione.db.update(schema.tenants).set({ gestorePiattaforma: false });
    await connessione.db
      .update(schema.tenants)
      .set({ gestorePiattaforma: true })
      .where(eq(schema.tenants.id, secondo));

    await assicuraTenantPredefinito(connessione.db, 'Studio gestore');

    // Riparare un archivio già sano ne creerebbe due, e la fornitura dati diventerebbe
    // visibile a chi non doveva vederla.
    expect((await statoStudio(connessione.db, primo)).gestorePiattaforma).toBe(false);
    expect((await statoStudio(connessione.db, secondo)).gestorePiattaforma).toBe(true);

    const quanti = await connessione.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.tenants)
      .where(eq(schema.tenants.gestorePiattaforma, true));
    expect(quanti[0]?.n).toBe(1);
  }, 90_000);
});
