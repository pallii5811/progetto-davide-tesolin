import { describe, expect, it } from 'vitest';
import {
  Money,
  atecoSection,
  commercialRound,
  euro,
  interpolate,
  isValidCodiceFiscale,
  isValidPartitaIva,
  parseAteco,
  parsePartitaIva,
  weakestConfidence,
} from '../src/index.js';

describe('Money', () => {
  it('non soffre di errori in virgola mobile', () => {
    // 0.1 + 0.2 !== 0.3 in floating point: qui deve fare esattamente 0,30 €.
    expect(Money.add(euro(0.1), euro(0.2))).toBe(euro(0.3));
  });

  it('somma senza perdita di precisione su molti addendi', () => {
    const centesimi = Array.from({ length: 1000 }, () => euro(0.01));
    expect(Money.toEuro(Money.add(...centesimi))).toBe(10);
  });

  it('arrotonda a taglio commerciale in funzione dell’ordine di grandezza', () => {
    expect(Money.toEuro(commercialRound(euro(1_234)))).toBe(1_200);
    expect(Money.toEuro(commercialRound(euro(187_432)))).toBe(185_000);
    expect(Money.toEuro(commercialRound(euro(4_312_900)))).toBe(4_300_000);
  });

  it('restituisce null sul rapporto con denominatore nullo invece di Infinity', () => {
    expect(Money.ratio(euro(100), euro(0))).toBeNull();
  });

  it('formatta in convenzione italiana', () => {
    expect(Money.formatCompact(euro(1_234_567))).toContain('1.234.567');
  });
});

describe('Partita IVA', () => {
  it('accetta partite IVA con check digit corretto', () => {
    expect(isValidPartitaIva('03158460174')).toBe(true);
    expect(isValidPartitaIva('IT 03158460174')).toBe(true);
  });

  it('rifiuta un check digit errato', () => {
    expect(isValidPartitaIva('03158460175')).toBe(false);
  });

  it('rifiuta lunghezze diverse da 11 cifre', () => {
    expect(parsePartitaIva('0315846017')).toBeNull();
    expect(parsePartitaIva('abcdefghijk')).toBeNull();
  });
});

describe('Codice fiscale', () => {
  it('valida il carattere di controllo a 16 caratteri', () => {
    expect(isValidCodiceFiscale('RSSMRA85T10A562S')).toBe(true);
    expect(isValidCodiceFiscale('RSSMRA85T10A562X')).toBe(false);
  });

  it('accetta la forma a 11 cifre delle persone giuridiche', () => {
    expect(isValidCodiceFiscale('03158460174')).toBe(true);
  });
});

describe('ATECO', () => {
  it('normalizza in forma puntata', () => {
    expect(parseAteco('256200')).toBe('25.62.00');
    expect(parseAteco('25.62.00')).toBe('25.62.00');
  });

  it('deriva la sezione dalla divisione', () => {
    expect(atecoSection(parseAteco('25.62.00')!)).toBe('C'); // manifatturiero
    expect(atecoSection(parseAteco('41.20.00')!)).toBe('F'); // costruzioni
    expect(atecoSection(parseAteco('01.11.00')!)).toBe('A'); // agricoltura
    expect(atecoSection(parseAteco('62.01.00')!)).toBe('J'); // informatica
  });
});

describe('interpolate', () => {
  it('interpola linearmente fra i punti di controllo', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 100 },
    ];
    expect(interpolate(5, points)).toBe(50);
  });

  it('blocca il valore agli estremi', () => {
    const points = [
      { x: 1, y: 10 },
      { x: 5, y: 90 },
    ];
    expect(interpolate(-3, points)).toBe(10);
    expect(interpolate(99, points)).toBe(90);
  });
});

describe('confidenza', () => {
  it('si propaga sempre al ribasso', () => {
    expect(weakestConfidence('alta', 'bassa', 'media')).toBe('bassa');
    expect(weakestConfidence('alta', 'media')).toBe('media');
    expect(weakestConfidence('alta')).toBe('alta');
  });
});
