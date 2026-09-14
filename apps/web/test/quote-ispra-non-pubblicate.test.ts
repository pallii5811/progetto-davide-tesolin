import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * La scheda non stampa più «−1 %» dove ISPRA non pubblica una quota.
 *
 * Dal 14/09/2026 il motore porta null al posto del −1 di IdroGEO. Il tipo della pagina deve
 * ammetterlo, e la scheda deve dirlo a parole: un numero mancante stampato come numero è lo
 * stesso difetto, spostato di un passo.
 */
const SORGENTI = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'apps/web/src');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');

describe('Le quote ISPRA nella scheda azienda', () => {
  const pagina = leggi('app/azienda/[id]/page.tsx');
  const api = leggi('lib/api.ts');

  it('una quota non pubblicata si scrive «non pubblicata», non come numero', () => {
    const inizio = pagina.indexOf('function percentualeIt(');
    expect(inizio, 'percentualeIt non c’è').toBeGreaterThan(-1);
    const funzione = pagina.slice(inizio, pagina.indexOf('\n}\n', inizio));
    expect(funzione).toContain('valore: number | null');
    expect(funzione).toContain("if (valore === null) return 'non pubblicata';");
  });

  it('la quota media si dice «media o elevata», perché comprende l’elevata', () => {
    expect(pagina).toContain(", media o elevata{' '}");
  });

  it('il tipo della pagina ammette le quote mancanti', () => {
    for (const campo of ['impreseIdraulicaElevata', 'impreseIdraulicaMedia', 'impreseFranaElevata']) {
      expect(api, campo).toContain(`${campo}: number | null;`);
    }
  });
});
