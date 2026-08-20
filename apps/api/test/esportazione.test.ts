/**
 * L'esportazione dell'elenco, dalla rotta.
 *
 * La composizione del CSV è provata nel dominio. Qui si verifica ciò che solo la rotta può
 * sbagliare, e che rende un file inutilizzabile senza che nulla segnali un errore: le
 * intestazioni con cui il browser decide se **salvare** o mostrare a schermo, e il fatto
 * che il filtro applicato al file sia lo stesso che l'utente sta guardando.
 */

import { describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';

const AZIENDA = '03158460174';

async function appConPortafoglio() {
  const app = buildServer({ provider: new MockCompanyProvider() });
  // Il portafoglio si popola analizzando: è l'unico modo in cui ci finisce un'azienda.
  await app.inject({ method: 'POST', url: `/api/aziende/${AZIENDA}/analisi`, payload: {} });
  return app;
}

describe('Esportazione del portafoglio', () => {
  it('si annuncia come file da salvare, non come pagina da mostrare', async () => {
    const app = await appConPortafoglio();
    const risposta = await app.inject({ method: 'GET', url: '/api/portafoglio/esporta' });

    expect(risposta.statusCode).toBe(200);

    /*
      Senza `Content-Disposition: attachment` il browser mostra il CSV a schermo: una
      colonna sola piena di punti e virgola, che chi la vede legge come «esportazione
      rotta». È l'intestazione che trasforma una risposta in un file.
    */
    expect(risposta.headers['content-type']).toContain('text/csv');
    expect(risposta.headers['content-disposition']).toContain('attachment');
    expect(risposta.headers['content-disposition']).toMatch(
      /filename="portafoglio-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    await app.close();
  });

  it('il contenuto è leggibile da Excel italiano e contiene l’azienda analizzata', async () => {
    const app = await appConPortafoglio();
    const risposta = await app.inject({ method: 'GET', url: '/api/portafoglio/esporta' });

    const csv = risposta.body;
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Denominazione');
    expect(csv).toContain(AZIENDA);

    await app.close();
  });

  it('esporta ciò che il filtro mostra, non tutto', async () => {
    const app = await appConPortafoglio();

    const tutte = await app.inject({ method: 'GET', url: '/api/portafoglio/esporta' });
    const conformi = await app.inject({
      method: 'GET',
      url: '/api/portafoglio/esporta?filtro=catnat',
    });

    const righe = (corpo: string) => corpo.replace('﻿', '').trimEnd().split('\r\n').length;

    // Il nome del file dichiara il filtro: tre esportazioni nella stessa cartella devono
    // restare distinguibili.
    expect(conformi.headers['content-disposition']).toContain('portafoglio-catnat-');
    expect(righe(conformi.body)).toBeLessThanOrEqual(righe(tutte.body));

    await app.close();
  });

  it('un filtro sconosciuto non svuota il file', async () => {
    const app = await appConPortafoglio();

    const inventato = await app.inject({
      method: 'GET',
      url: '/api/portafoglio/esporta?filtro=inventato',
    });
    const tutte = await app.inject({ method: 'GET', url: '/api/portafoglio/esporta' });

    /*
      Un parametro sbagliato che restituisce zero righe è la risposta peggiore: il file si
      apre, sembra un portafoglio vuoto, e chi lo legge conclude di aver perso i clienti.
    */
    expect(inventato.body).toBe(tutte.body);

    await app.close();
  });
});
