/**
 * I codici mandati per email: conferma dell'indirizzo e nuova password (18/09/2026).
 *
 * Un codice per cambiare password è una chiave dell'account. Le quattro proprietà che lo
 * rendono accettabile si provano qui, sulla funzione che le garantisce: vale una volta sola,
 * solo per il suo scopo, solo finché non scade, e smette di valere quando una password nuova
 * ne rende inutili i fratelli.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  annullaCodiciEmail,
  applicaSchemaTollerante,
  connetti,
  consumaCodiceEmail,
  contaCodiciEmailDal,
  creaCodiceEmail,
  creaUtente,
  schema,
  segnaEmailVerificata,
  trovaUtentePerId,
} from '../src/index.js';
import type { Connessione, ScopoCodiceEmail } from '../src/index.js';

const ORA = 60 * 60 * 1_000;

describe('Codici mandati per email', () => {
  let connessione: Connessione;
  let utenteId: string;
  let tenantId: string;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);

    const tenant = await connessione.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio di prova' })
      .returning({ id: schema.tenants.id });
    tenantId = tenant[0]!.id;

    utenteId = await creaUtente(connessione.db, {
      tenantId,
      email: 'titolare@studio.it',
      nome: 'Titolare',
      passwordHash: 'non-usato-in-questi-test',
      emailDaConfermare: true,
    });
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  async function codice(impronta: string, scopo: ScopoCodiceEmail, scadeIl: Date): Promise<void> {
    await creaCodiceEmail(connessione.db, { utenteId, tenantId, scopo, impronta, scadeIl });
  }

  it('vale una volta sola', async () => {
    const adesso = new Date();
    await codice('una-volta', 'nuova-password', new Date(adesso.getTime() + ORA));

    expect(
      await consumaCodiceEmail(connessione.db, { impronta: 'una-volta', scopo: 'nuova-password', adesso }),
    ).toEqual({
      utenteId,
      tenantId,
    });
    expect(
      await consumaCodiceEmail(connessione.db, { impronta: 'una-volta', scopo: 'nuova-password', adesso }),
    ).toBeNull();
  }, 90_000);

  it('due consumi nello stesso istante: ne passa uno solo', async () => {
    const adesso = new Date();
    await codice('concorrente', 'nuova-password', new Date(adesso.getTime() + ORA));

    const esiti = await Promise.all(
      Array.from({ length: 5 }, () =>
        consumaCodiceEmail(connessione.db, { impronta: 'concorrente', scopo: 'nuova-password', adesso }),
      ),
    );
    expect(esiti.filter((e) => e !== null)).toHaveLength(1);
  }, 90_000);

  it('non vale per l’altro scopo', async () => {
    const adesso = new Date();
    await codice('solo-conferma', 'conferma-email', new Date(adesso.getTime() + ORA));

    expect(
      await consumaCodiceEmail(connessione.db, {
        impronta: 'solo-conferma',
        scopo: 'nuova-password',
        adesso,
      }),
    ).toBeNull();
    // E il tentativo sbagliato non lo ha bruciato: per il suo scopo vale ancora.
    expect(
      await consumaCodiceEmail(connessione.db, {
        impronta: 'solo-conferma',
        scopo: 'conferma-email',
        adesso,
      }),
    ).not.toBeNull();
  }, 90_000);

  it('scaduto non vale, anche se non è mai stato usato', async () => {
    const adesso = new Date();
    await codice('scaduto', 'nuova-password', new Date(adesso.getTime() - 1));

    expect(
      await consumaCodiceEmail(connessione.db, { impronta: 'scaduto', scopo: 'nuova-password', adesso }),
    ).toBeNull();
  }, 90_000);

  it('una password nuova annulla i collegamenti precedenti per cambiarla', async () => {
    const adesso = new Date();
    await codice('vecchio-1', 'nuova-password', new Date(adesso.getTime() + ORA));
    await codice('vecchio-2', 'nuova-password', new Date(adesso.getTime() + ORA));
    await codice('conferma-intatta', 'conferma-email', new Date(adesso.getTime() + ORA));

    await annullaCodiciEmail(connessione.db, utenteId, 'nuova-password', adesso);

    for (const impronta of ['vecchio-1', 'vecchio-2']) {
      expect(
        await consumaCodiceEmail(connessione.db, { impronta, scopo: 'nuova-password', adesso }),
      ).toBeNull();
    }
    // L'annullamento riguarda solo il suo scopo.
    expect(
      await consumaCodiceEmail(connessione.db, {
        impronta: 'conferma-intatta',
        scopo: 'conferma-email',
        adesso,
      }),
    ).not.toBeNull();
  }, 90_000);

  it('conta gli invii recenti, per frenare chi li ripete', async () => {
    const prima = new Date(Date.now() - 1_000);
    const iniziali = await contaCodiciEmailDal(connessione.db, utenteId, 'conferma-email', prima);
    await codice('conteggio-1', 'conferma-email', new Date(Date.now() + ORA));
    await codice('conteggio-2', 'conferma-email', new Date(Date.now() + ORA));

    expect(await contaCodiciEmailDal(connessione.db, utenteId, 'conferma-email', prima)).toBe(iniziali + 2);
    expect(
      await contaCodiciEmailDal(connessione.db, utenteId, 'conferma-email', new Date(Date.now() + ORA)),
    ).toBe(0);
  }, 90_000);

  it('la conferma dell’indirizzo resta alla prima data', async () => {
    const prima = new Date('2026-09-18T10:00:00Z');
    await segnaEmailVerificata(connessione.db, utenteId, prima);
    await segnaEmailVerificata(connessione.db, utenteId, new Date('2026-09-19T10:00:00Z'));

    expect((await trovaUtentePerId(connessione.db, utenteId))?.emailVerificataIl?.toISOString()).toBe(
      prima.toISOString(),
    );
  }, 90_000);
});
