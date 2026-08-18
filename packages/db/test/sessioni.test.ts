/**
 * Ciclo di vita delle sessioni.
 *
 * La revoca è la ragione per cui le sessioni stanno su database invece che dentro un
 * token autofirmato: un token firmato resta valido fino a scadenza anche dopo che un
 * collaboratore ha lasciato lo studio. Qui si verifica che la revoca morda davvero, e
 * che la manutenzione non porti via ciò che serve.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicaSchemaTollerante,
  connetti,
  creaSessione,
  creaUtente,
  purgaSessioniScadute,
  revocaSessioniUtente,
  schema,
  trovaSessioneValida,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';

const ORA = 60 * 60 * 1_000;

describe('Sessioni', () => {
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
      email: 'prova@studio.it',
      nome: 'Utente di prova',
      passwordHash: 'non-usato-in-questi-test',
    });
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  async function apriSessione(impronta: string, scadeIl: Date): Promise<void> {
    await creaSessione(connessione.db, { utenteId, tenantId, improntaToken: impronta, scadeIl });
  }

  it('una sessione scaduta non è valida, anche se la riga esiste ancora', async () => {
    const adesso = new Date();
    await apriSessione('scaduta', new Date(adesso.getTime() - ORA));

    expect(await trovaSessioneValida(connessione.db, 'scaduta', adesso)).toBeNull();
  });

  it('la revoca ha effetto immediato', async () => {
    const adesso = new Date();
    await apriSessione('viva', new Date(adesso.getTime() + 12 * ORA));

    expect(await trovaSessioneValida(connessione.db, 'viva', adesso)).not.toBeNull();

    await revocaSessioniUtente(connessione.db, utenteId);

    // È la proprietà che un token autofirmato non può garantire.
    expect(await trovaSessioneValida(connessione.db, 'viva', adesso)).toBeNull();
  });

  it('la pulizia toglie le scadute e lascia intatte le valide', async () => {
    const adesso = new Date();
    await apriSessione('vecchia-1', new Date(adesso.getTime() - 48 * ORA));
    await apriSessione('vecchia-2', new Date(adesso.getTime() - ORA));
    await apriSessione('in-corso', new Date(adesso.getTime() + 12 * ORA));

    await purgaSessioniScadute(connessione.db, adesso);

    const rimaste = await connessione.db
      .select({ impronta: schema.sessioni.improntaToken })
      .from(schema.sessioni);
    const impronte = rimaste.map((r) => r.impronta);

    expect(impronte).toContain('in-corso');
    expect(impronte).not.toContain('vecchia-1');
    expect(impronte).not.toContain('vecchia-2');
  });
});
