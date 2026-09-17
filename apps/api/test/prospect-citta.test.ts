import { describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import type { CriteriProspezione } from '@aegis/providers';
import { buildServer } from '../src/server.js';

/**
 * Ricerca clienti: la città è facoltativa, ma un filtro ci vuole.
 *
 * Il 13/09/2026 Simone ha chiesto la città obbligatoria; il 17/09/2026 l'ha resa facoltativa
 * («Questo non obbligatorio», AEGIS - cambi.pptx). La rotta spende, quindi la regola sta
 * anche qui e non solo nel modulo: senza nessun filtro la ricerca coprirebbe l'Italia intera,
 * e con un codice inesistente il fornitore risponderebbe zero e sembrerebbe una città senza
 * aziende.
 */
class ProviderCheRegistra extends MockCompanyProvider {
  readonly criteriRicevuti: CriteriProspezione[] = [];

  override cercaProspect(
    criteri: CriteriProspezione,
    opzioni?: { readonly soloConteggio?: boolean | undefined },
  ): ReturnType<MockCompanyProvider['cercaProspect']> {
    this.criteriRicevuti.push(criteri);
    return super.cercaProspect(criteri, opzioni);
  }
}

function avvia() {
  const provider = new ProviderCheRegistra();
  const app = buildServer({ provider });
  const get = async (url: string) => {
    const risposta = await app.inject({ method: 'GET', url });
    return { status: risposta.statusCode, body: risposta.json<Record<string, unknown>>() };
  };
  return { provider, get };
}

describe('Ricerca clienti: almeno un filtro', () => {
  it('senza nessun filtro la ricerca non parte, e il messaggio dice cosa manca', async () => {
    const { provider, get } = avvia();

    for (const url of [
      '/api/prospect?soloConteggio=1',
      // Forma giuridica e numero di aziende arrivano già compilati: da soli non descrivono un'impresa.
      '/api/prospect?formaGiuridicaCodice=SR&limite=5&soloConteggio=1',
      // La provincia non è un filtro di questa rotta dal 13/09/2026: non basta.
      '/api/prospect?provincia=BS&soloConteggio=1',
      // Una città lasciata vuota non è un filtro.
      '/api/prospect?comune=&soloConteggio=1',
    ]) {
      const { status, body } = await get(url);
      expect(status, url).toBe(400);
      expect(String(body['errore']), url).toMatch(/Indicare almeno un filtro/);
    }
    // Nessuna chiamata al fornitore: è quella che costa.
    expect(provider.criteriRicevuti).toEqual([]);
  });

  it('un codice che non è un comune italiano viene rifiutato prima del fornitore', async () => {
    const { provider, get } = avvia();

    const { status, body } = await get('/api/prospect?comune=Z999&ateco=2562&soloConteggio=1');

    expect(status).toBe(400);
    expect(String(body['errore'])).toMatch(/Città non riconosciuta/);
    expect(provider.criteriRicevuti).toEqual([]);
  });
});

describe('Ricerca clienti: la città', () => {
  it('senza città la ricerca parte con gli altri filtri, e al fornitore la città non arriva', async () => {
    const { provider, get } = avvia();

    const { status, body } = await get('/api/prospect?comune=&ateco=2562&soloConteggio=1');

    expect(status).toBe(200);
    // La meccanica bresciana dimostrativa: in tutta Italia, non in una città.
    expect(body['totale']).toBe(1);
    expect(provider.criteriRicevuti).toHaveLength(1);
    expect(provider.criteriRicevuti[0]?.ateco).toBe('2562');
    expect(provider.criteriRicevuti[0]).not.toHaveProperty('comune');
  });

  it('con la sola città la ricerca parte, e il comune arriva al fornitore come codice catastale', async () => {
    const { provider, get } = avvia();

    const { status, body } = await get('/api/prospect?comune=a060&soloConteggio=1');

    expect(status).toBe(200);
    // Adro, dove sta l'azienda dimostrativa di meccanica.
    expect(body['totale']).toBe(1);
    expect(provider.criteriRicevuti).toHaveLength(1);
    expect(provider.criteriRicevuti[0]?.comune).toBe('A060');
  });

  it('gli altri filtri restano facoltativi e, se ci sono, si applicano', async () => {
    const { get } = avvia();

    const soloCitta = await get('/api/prospect?comune=A060&soloConteggio=1');
    const conAteco = await get('/api/prospect?comune=A060&ateco=2562&soloConteggio=1');
    const conAtecoDiverso = await get('/api/prospect?comune=A060&ateco=4120&soloConteggio=1');

    expect(soloCitta.body['totale']).toBe(1);
    expect(conAteco.body['totale']).toBe(1);
    expect(conAtecoDiverso.body['totale']).toBe(0);
  });

  it('una città senza aziende dimostrative risponde zero, non un errore', async () => {
    const { get } = avvia();

    const { status, body } = await get('/api/prospect?comune=H501&soloConteggio=1');

    expect(status).toBe(200);
    expect(body['totale']).toBe(0);
  });
});
