import { describe, expect, it } from 'vitest';
import { mappaAnagrafica } from '../src/openapi/mapper.js';

/**
 * I codici ATECO secondari sono quelli che il fornitore dichiara tali.
 *
 * GALENO S.R.L.: la scheda stampava «ATECO secondari 86.22» accanto al primario 86.22.09. Il
 * mappatore prendeva per secondari le altre versioni dello stesso codice — 2007, 2022, la
 * forma a quattro cifre — e ignorava `secondaryAteco2022`, dove stava il secondario vero.
 * Le due forme della classificazione sono quelle delle risposte registrate il 13/09/2026.
 */
const QUANDO = new Date('2026-09-13T00:00:00Z');

describe('ATECO secondari', () => {
  it('anagrafica estesa: le versioni del primario non diventano secondari', () => {
    const a = mappaAnagrafica(
      {
        atecoClassification: {
          ateco: { code: '8622', description: "Attivita' di medicina specialistica" },
          ateco2007: { code: '862209', description: 'Altri studi medici specialistici e poliambulatori' },
          ateco2022: { code: '862209', description: 'Altri studi medici specialistici e poliambulatori' },
        },
      },
      'IT-advanced',
      QUANDO,
    ).value;
    expect(a.atecoSecondari).toEqual([]);
  });

  it('profilo completo: il secondario dichiarato arriva, formattato', () => {
    const a = mappaAnagrafica(
      {
        atecoClassification: {
          ateco: { code: '8622', description: 'Medical specialists activities' },
          ateco2022: {
            code: '862209',
            description: 'Other specialist medical practices and group practices',
          },
          secondaryAteco: '821',
          secondaryAteco2022: '821909',
        },
      },
      'IT-full',
      QUANDO,
    ).value;
    expect(a.atecoSecondari.map(String)).toEqual(['82.19.09']);
  });
});
