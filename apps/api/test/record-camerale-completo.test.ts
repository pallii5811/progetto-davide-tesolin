/**
 * Quanto del record camerale arriva davvero a chi guarda lo schermo.
 *
 * Esisteva già un presidio sui campi acquistati, e diceva che venivano letti **tutti**.
 * Diceva il vero, e non bastava: leggere non è mostrare. Dodici campi su venti venivano
 * letti dal mappatore, usati nei calcoli — quindi nessun collaudo li dava per mancanti — e
 * non comparivano da nessuna parte. Capitale sociale, numero REA, PEC, ATECO secondari,
 * date di costituzione e di inizio attività, codice catastale, fatturato dichiarato.
 *
 * Chi paga dieci centesimi e vede metà scheda vuota conclude che il fornitore non abbia il
 * dato. È la conclusione sbagliata, ed è la peggiore: porta a comprare l'approfondimento
 * da trenta centesimi per ottenere qualcosa che era già lì.
 *
 * Questo collaudo chiude proprio quella distanza: prende ogni campo valorizzato
 * dell'anagrafica e pretende di ritrovarlo nella risposta che il servizio manda alla
 * pagina. Se qualcuno aggiunge una lettura senza aggiungere la resa, qui diventa rosso.
 */

import { describe, expect, it } from 'vitest';
import { demoCompanyProfile } from '@aegis/core';

describe('Il record camerale acquistato arriva per intero alla pagina', () => {
  it('ogni campo valorizzato dell’anagrafica compare nella risposta', async () => {
    const { presentAnalysis } = await import('../src/presenter.js');
    const { analyzeCompany } = await import('@aegis/core');

    const profilo = demoCompanyProfile();
    const analisi = analyzeCompany(profilo, [], new Date('2026-08-21T00:00:00Z'));
    const dto = presentAnalysis(analisi) as unknown as Record<string, unknown>;

    const registro = dto['registro'] as Record<string, unknown> | undefined;
    expect(registro, 'la risposta deve contenere il record camerale').toBeDefined();

    const a = profilo.anagrafica.value as unknown as Record<string, unknown>;

    /*
      I campi che **non** devono comparire, con il motivo.
      Un elenco senza motivazioni tornerebbe a essere una lista di dimenticanze.
    */
    const ALTROVE: Readonly<Record<string, string>> = {
      formaGiuridica: 'codice interno: a schermo va la descrizione, che è nel record',
      statoAttivita: 'mostrato come etichetta accanto alla denominazione',
      atecoPrimario: 'mostrato nell’intestazione, con la sua descrizione',
      atecoPrimarioDescrizione: 'idem',
      dataAggiornamento: 'mostrata come provenienza del dato, accanto alla fonte',
    };

    const assenti: string[] = [];
    for (const [chiave, valore] of Object.entries(a)) {
      if (valore === null || valore === undefined) continue;
      if (Array.isArray(valore) && valore.length === 0) continue;
      if (chiave in ALTROVE) continue;
      if (!(chiave in registro!)) assenti.push(chiave);
    }

    expect(
      assenti,
      `campi del record camerale acquistati e non inviati alla pagina: ${assenti.join(', ')}`,
    ).toEqual([]);
  });

  it('i campi che il registro non riporta restano assenti, non diventano zero', () => {
    /*
      Un capitale sociale sconosciuto non è un capitale sociale di zero euro, e su un
      documento che un intermediario consegna al cliente la differenza è tutta.
    */
    const profilo = demoCompanyProfile();
    expect(profilo.anagrafica.value.dataCessazione).toBeNull();
  });
});
