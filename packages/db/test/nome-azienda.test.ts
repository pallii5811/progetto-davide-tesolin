/**
 * Il nome dell'azienda non si perde per un gesto ordinario.
 *
 * `assicuraAzienda` la chiamano anche operazioni che dell'impresa conoscono soltanto la
 * partita IVA — salvare i dati di intervista, allegare una fotografia al sopralluogo — e
 * che passavano quella come denominazione, per non lasciare il campo vuoto.
 *
 * L'aggiornamento la scriveva sopra al nome vero arrivato dall'analisi. Da quel momento
 * l'impresa si chiamava «02072030980»: nel portafoglio, nel monitoraggio, e soprattutto
 * nel questionario che il cliente riceve — dove si presentava a lui con il proprio codice
 * fiscale al posto del nome.
 *
 * Nessun collaudo poteva vederlo: ogni singola operazione faceva esattamente ciò che
 * dichiarava. Il danno nasceva dalla loro sequenza.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assicuraAzienda,
  assicuraTenantPredefinito,
  connetti,
  applicaSchemaTollerante,
} from '../src/index.js';
import type { Connessione } from '../src/client.js';

describe('La denominazione sopravvive alle operazioni che non la conoscono', () => {
  let c: Connessione;
  let tenantId: string;

  beforeAll(async () => {
    c = await connetti();
    await applicaSchemaTollerante(c);
    tenantId = await assicuraTenantPredefinito(c.db, 'Studio di prova');
  }, 60_000);

  afterAll(async () => {
    await c.chiudi();
  });

  it('un salvataggio che passa la partita IVA come nome non cancella quello vero', async () => {
    const piva = '02072030980';

    // L'analisi conosce il nome e lo registra.
    await assicuraAzienda(c.db, tenantId, {
      partitaIva: piva,
      codiceFiscale: null,
      denominazione: 'FIMET MANIGLIE S.R.L.',
      providerId: piva,
      provincia: 'BS',
      atecoPrimario: '25.72',
    });

    // Poi si salvano i dati di intervista: quel percorso il nome non ce l'ha, e passa la
    // chiave. È il gesto che cancellava tutto.
    await assicuraAzienda(c.db, tenantId, {
      partitaIva: piva,
      codiceFiscale: null,
      denominazione: piva,
      providerId: piva,
      provincia: null,
      atecoPrimario: null,
    });

    const { schema } = await import('../src/index.js');
    const { eq, and } = await import('drizzle-orm');
    const righe = await c.db
      .select()
      .from(schema.aziende)
      .where(and(eq(schema.aziende.tenantId, tenantId), eq(schema.aziende.partitaIva, piva)));

    expect(righe[0]?.denominazione, 'il nome vero non deve essere sostituito dalla partita IVA').toBe(
      'FIMET MANIGLIE S.R.L.',
    );
    // E ciò che l'operazione non conosce non azzera ciò che era già noto.
    expect(righe[0]?.provincia).toBe('BS');
    expect(righe[0]?.atecoPrimario).toBe('25.72');
  }, 60_000);
});
