import { describe, expect, it } from 'vitest';
import { HttpProviderClient, MemoryCache, MemoryCostLedger } from '../src/http.js';
import { ProviderError } from '../src/port.js';

/**
 * Un guasto momentaneo del fornitore non è un'indisponibilità del servizio.
 *
 * IL DIFETTO. `408 Request Timeout` e `425 Too Early` finivano in «sconosciuto», che non è
 * ritentabile: il client si arrendeva al primo colpo e l'intermediario leggeva «il servizio
 * dati non è al momento disponibile» — cioè un guasto nostro — mentre il fornitore stava
 * solo chiedendo di riprovare fra poco.
 *
 * La distinzione conta due volte: decide se il client riprova da solo, e decide quale frase
 * si legge a schermo. Un'attesa raccontata come guasto fa chiudere la scheda e rifare tutto
 * più tardi — e la seconda volta si ripaga.
 *
 * `429` era già trattato bene ed è qui accanto, perché la prova serve a fissare il CONFINE:
 * ciò che sta di qua si ritenta, ciò che sta di là no. Un 404 ritentato pagherebbe due
 * volte per sapere la stessa cosa.
 */
describe('Il confine fra ciò che si ritenta e ciò che no', () => {
  const client = (fetchImpl: () => Promise<Response>, maxRetries = 2) =>
    new HttpProviderClient({
      baseUrl: 'https://esempio.test',
      token: 't',
      provider: 'Test',
      cache: new MemoryCache(),
      ledger: new MemoryCostLedger(),
      maxRetries,
      attesaBaseMs: 1,
      fetchImpl,
    });

  const richiesta = {
    service: 'anagrafica',
    path: '/IT-advanced/123',
    cacheTtlSeconds: 0,
    costoCentesimi: 10,
  };

  for (const stato of [408, 425, 503]) {
    it(`${stato} viene ritentato, e la seconda volta riesce`, async () => {
      let chiamate = 0;
      const c = client(async () => {
        chiamate += 1;
        return chiamate === 1
          ? new Response('', { status: stato })
          : new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      await expect(c.request(richiesta)).resolves.toEqual({ ok: true });
      expect(chiamate, 'un guasto momentaneo va ritentato, non riferito').toBe(2);
    });
  }

  for (const stato of [404, 406]) {
    it(`${stato} NON viene ritentato: la risposta non cambierebbe, la spesa sì`, async () => {
      let chiamate = 0;
      const c = client(async () => {
        chiamate += 1;
        return new Response('', { status: stato });
      });

      await expect(c.request(richiesta)).rejects.toBeInstanceOf(ProviderError);
      expect(chiamate, 'una partita IVA che non esiste non esiste nemmeno al secondo tentativo').toBe(1);
    });
  }

  it('408 si dichiara temporaneo, non sconosciuto: è la parola che sceglie la frase a schermo', async () => {
    const c = client(async () => new Response('', { status: 408 }), 0);
    await expect(c.request(richiesta)).rejects.toMatchObject({ kind: 'temporaneo' });
  });
});
