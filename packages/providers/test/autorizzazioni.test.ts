/**
 * Verifica delle autorizzazioni: deve costare zero e non mentire.
 *
 * I token di OpenAPI.com sono per scope: lo stesso token risponde 200 su un servizio e
 * 401 su un altro. Chi non lo sa passa il pomeriggio a controllare la chiave, e chi lo
 * sa ma non ha lo strumento apre un terminale — cosa che un intermediario non farà mai.
 *
 * Le due proprietà presidiate qui sono precise: la sonda non deve **mai** usare un
 * identificativo reale (verrebbe fatturata), e deve distinguere «non autorizzato» da
 * «non raggiungibile», perché portano a due azioni diverse: la console del fornitore
 * nel primo caso, la rete nel secondo.
 */

import { describe, expect, it } from 'vitest';
import { OPENAPI_DEFAULT_CONFIG, verificaAutorizzazioni } from '../src/index.js';

function rispondiCon(mappa: Record<string, number>, chiamate: string[] = []) {
  return ((url: string): Promise<Response> => {
    chiamate.push(String(url));
    const trovato = Object.entries(mappa).find(([frammento]) => String(url).includes(frammento));
    return Promise.resolve(new Response('{}', { status: trovato?.[1] ?? 200 }));
  }) as unknown as typeof fetch;
}

describe('Autorizzazioni del token', () => {
  it('sonda con una partita IVA inesistente, mai con una reale', async () => {
    const chiamate: string[] = [];
    await verificaAutorizzazioni({
      token: 't',
      config: OPENAPI_DEFAULT_CONFIG,
      fetchImpl: rispondiCon({}, chiamate),
    });

    /*
      L'invariante non è «ogni URL contiene il segnaposto» — alcuni servizi non hanno un
      identificativo nel percorso — ma «nessun URL contiene un identificativo **diverso**
      dal segnaposto».

      «00000000000» è formalmente valida e non attribuita a nessuno: nessuna lavorazione,
      nessun addebito. Se qualcuno la sostituisse con una partita IVA vera, la diagnostica
      comincerebbe a costare in silenzio a ogni apertura della pagina — e nessuno se ne
      accorgerebbe finché non arriva il consuntivo.
    */
    expect(chiamate.length).toBeGreaterThan(0);
    for (const url of chiamate) {
      for (const sequenza of url.match(/d{11}/g) ?? []) {
        expect(sequenza).toBe('00000000000');
      }
    }
  });

  it('legge il 401 come autorizzazione mancante e nomina lo scope', async () => {
    const esiti = await verificaAutorizzazioni({
      token: 't',
      config: OPENAPI_DEFAULT_CONFIG,
      fetchImpl: rispondiCon({ 'IT-full': 401 }),
    });

    const full = esiti.find((e) => e.chiave === 'profiloCompleto');
    expect(full?.stato).toBe('non-autorizzato');
    // Senza il nome dello scope l'utente sa di avere un problema e non sa cosa fare.
    expect(full?.dettaglio).toContain('company / IT-full');
  });

  it('considera autorizzato tutto ciò che non è un rifiuto di autenticazione', async () => {
    // Un 404 su una P.IVA inesistente **dimostra** che l'autorizzazione c'è: il rifiuto
    // per scope arriverebbe prima, senza nemmeno cercare l'azienda.
    const esiti = await verificaAutorizzazioni({
      token: 't',
      config: OPENAPI_DEFAULT_CONFIG,
      fetchImpl: rispondiCon({ 'IT-start': 404, 'IT-advanced': 406 }),
    });

    expect(esiti.find((e) => e.chiave === 'anagraficaBase')?.stato).toBe('autorizzato');
    expect(esiti.find((e) => e.chiave === 'anagraficaEstesa')?.stato).toBe('autorizzato');
  });

  it('distingue un problema di rete da un’autorizzazione mancante', async () => {
    const esiti = await verificaAutorizzazioni({
      token: 't',
      config: OPENAPI_DEFAULT_CONFIG,
      fetchImpl: () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
    });

    // Le due situazioni portano a due azioni diverse: la console del fornitore, oppure
    // la connessione. Confonderle manda l'utente nel posto sbagliato.
    expect(esiti.every((e) => e.stato === 'non-raggiungibile')).toBe(true);
    expect(esiti[0]?.dettaglio).toContain('ENOTFOUND');
  });

  it('riporta il prezzo di ogni servizio, perché la scelta è economica', async () => {
    const esiti = await verificaAutorizzazioni({
      token: 't',
      config: OPENAPI_DEFAULT_CONFIG,
      fetchImpl: rispondiCon({}),
    });

    expect(esiti.every((e) => e.costoCentesimi > 0)).toBe(true);
    expect(esiti.find((e) => e.chiave === 'anagraficaEstesa')?.costoCentesimi).toBe(10);
  });
});
