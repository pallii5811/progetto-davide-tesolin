import { describe, expect, it } from 'vitest';
import { OpenApiProvider } from '../src/openapi/provider.js';

/**
 * Il fornitore vero quando con gli stessi filtri qualcosa è già stato comprato (18/09/2026).
 *
 * Il prossimo elenco salta le aziende già comprate: l'acquisto passa `skip`, e il conteggio
 * annuncia il lotto che resta e il suo prezzo. Qui si guardano le richieste che partono, perché
 * è lì che si spende: nessuna chiamata a pagamento, il fornitore è simulato.
 */

function simulato(count: number) {
  const richieste: URL[] = [];
  const fetchImpl = ((url: string): Promise<Response> => {
    richieste.push(new URL(String(url)));
    return Promise.resolve(
      new Response(JSON.stringify({ data: [], count, success: true, message: '', error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
  return { provider: new OpenApiProvider({ token: 't', fetchImpl }), richieste };
}

describe('Il conteggio dopo acquisti con gli stessi filtri', () => {
  it('annuncia il lotto che resta, e chiede il prezzo di quel lotto', async () => {
    const { provider, richieste } = simulato(5);
    const esito = await provider.cercaProspect(
      { comune: 'A794', limite: 5, salta: 3 },
      { soloConteggio: true },
    );

    expect(esito.totale).toBe(5);
    expect(esito.lotto).toBe(2);
    // Il fornitore qui non dichiara il costo: si ricade sul listino, cinque centesimi a record.
    expect(esito.costoElencoCentesimi).toBe(10);

    expect(richieste).toHaveLength(2);
    for (const richiesta of richieste) {
      expect(richiesta.searchParams.get('dryRun')).toBe('1');
      // La posizione non si passa al conteggio: come la tratti in dryRun non è verificato.
      expect(richiesta.searchParams.has('skip')).toBe(false);
    }
    expect(richieste.map((r) => r.searchParams.get('limit'))).toEqual([null, '2']);
  });

  it('se non resta niente il prezzo è zero, e il preventivo non si chiede', async () => {
    const { provider, richieste } = simulato(5);
    const esito = await provider.cercaProspect(
      { comune: 'A794', limite: 5, salta: 5 },
      { soloConteggio: true },
    );

    expect(esito.lotto).toBe(0);
    expect(esito.costoElencoCentesimi).toBe(0);
    expect(richieste).toHaveLength(1);
  });

  it('senza acquisti precedenti le richieste restano quelle di prima', async () => {
    const { provider, richieste } = simulato(40);
    const esito = await provider.cercaProspect({ comune: 'A794', limite: 5 }, { soloConteggio: true });

    expect(esito.lotto).toBe(5);
    expect(richieste.map((r) => r.searchParams.get('limit')).sort()).toEqual(['5', null].sort());
    expect(richieste.some((r) => r.searchParams.has('skip'))).toBe(false);
  });
});

describe('L’acquisto dopo acquisti con gli stessi filtri', () => {
  it('chiede al fornitore le aziende dopo quelle già comprate', async () => {
    const { provider, richieste } = simulato(5);
    await provider.cercaProspect({ comune: 'A794', limite: 5, salta: 3 });

    expect(richieste).toHaveLength(1);
    const [acquisto] = richieste;
    expect(acquisto?.searchParams.get('skip')).toBe('3');
    expect(acquisto?.searchParams.get('limit')).toBe('5');
    expect(acquisto?.searchParams.has('dryRun')).toBe(false);
  });
});
