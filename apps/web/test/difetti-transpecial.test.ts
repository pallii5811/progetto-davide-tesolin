import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { didascaliaDannoProbabile } from '../src/lib/didascalia-danno.js';

/** Le due didascalie di TRANSPECIAL S.R.L. che dicevano meno di quanto il numero contenesse. */
const SORGENTI = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'apps/web/src');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');

describe('La didascalia del danno probabile nomina tutte le sue cause', () => {
  it('81%: classe di settore e concentrazione', () => {
    const d = didascaliaDannoProbabile([], true);
    expect(d).toContain('aumentata del 15%');
    expect(d).not.toContain('per la sola classe');
  });

  it('senza concentrazione resta la sola classe', () => {
    expect(didascaliaDannoProbabile([], false)).toContain('per la sola classe di rischio del settore');
  });

  it('con protezioni accertate e concentrazione, entrambe', () => {
    const d = didascaliaDannoProbabile(['impianto di estinzione automatica'], true);
    expect(d).toContain('impianto di estinzione automatica');
    expect(d).toContain('concentrazione dei valori');
  });
});

describe('Le unità locali dell’archivio sono quelle fuori dalla sede', () => {
  it('l’etichetta lo dice', () => {
    expect(leggi('app/azienda/[id]/IndicatoriArchivio.tsx')).toContain("'Unità locali fuori dalla sede'");
  });
});
