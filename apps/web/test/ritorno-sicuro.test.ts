/**
 * Il rinvio dopo l'accesso resta sul sito (revisione di sicurezza del 18/09/2026).
 */

import { describe, expect, it } from 'vitest';
import { RITORNO_PREDEFINITO, ritornoSicuro } from '../src/lib/ritorno-sicuro.js';

describe('Dove tornare dopo l’accesso', () => {
  it('accetta le pagine del sito, con i loro parametri', () => {
    for (const buono of [
      '/prospect',
      '/azienda/03158460174',
      '/portafoglio?stato=cliente',
      '/impostazioni/utenti#x',
    ]) {
      expect(ritornoSicuro(buono)).toBe(buono);
    }
  });

  it('rifiuta ogni forma che il browser porterebbe su un altro sito', () => {
    for (const cattivo of [
      '//attaccante.example',
      '/\\attaccante.example',
      '/\\/attaccante.example',
      '/\t/attaccante.example',
      '/%09/attaccante.example'.replace('%09', '\t'),
      'https://attaccante.example',
      'javascript:alert(1)',
      ' /prospect',
      '/pro spect',
      '/prospect\\..\\',
      '',
    ]) {
      expect(ritornoSicuro(cattivo), JSON.stringify(cattivo)).toBe(RITORNO_PREDEFINITO);
    }
  });
});
