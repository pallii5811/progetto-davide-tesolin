import { describe, expect, it } from 'vitest';
import { Money } from '@aegis/core';
import { bool, date, money, num, percent, pick, str } from '../src/openapi/parse.js';

/**
 * Il parsing difensivo è il codice più esposto dell'intera piattaforma: è l'unico punto
 * dove entrano dati che non controlliamo. Ogni caso qui sotto è una forma che i provider
 * italiani restituiscono davvero.
 */
describe('Lettura difensiva delle risposte', () => {
  describe('pick', () => {
    it('prova gli alias in ordine e ignora i valori vuoti', () => {
      expect(pick({ a: '', b: null, c: 'ok' }, 'a', 'b', 'c')).toBe('ok');
      expect(pick({ denominazione: 'ACME' }, 'companyName', 'denominazione')).toBe('ACME');
    });

    it('non esplode su input che non è un oggetto', () => {
      expect(pick(null, 'a')).toBeUndefined();
      expect(pick('stringa', 'a')).toBeUndefined();
      expect(pick([1, 2, 3], 'a')).toBeUndefined();
    });
  });

  describe('num', () => {
    it('legge i numeri in formato italiano', () => {
      expect(num({ v: '1.234.567,89' }, 'v')).toBeCloseTo(1_234_567.89, 2);
    });

    it('legge i numeri in formato anglosassone', () => {
      expect(num({ v: '1234567.89' }, 'v')).toBeCloseTo(1_234_567.89, 2);
    });

    it('restituisce null e non NaN su valori non numerici', () => {
      expect(num({ v: 'non disponibile' }, 'v')).toBeNull();
      expect(num({ v: {} }, 'v')).toBeNull();
      expect(num({}, 'v')).toBeNull();
    });
  });

  describe('money', () => {
    it('converte in centesimi senza errore in virgola mobile', () => {
      const importo = money({ v: '1.234.567,89' }, 'v');
      expect(importo).not.toBeNull();
      expect(Money.toEuro(importo!)).toBe(1_234_567.89);
    });

    it('non trasforma un dato mancante in zero', () => {
      // Un fatturato assente non è un fatturato di zero: la differenza cambia lo score.
      expect(money({}, 'fatturato')).toBeNull();
    });
  });

  describe('date', () => {
    it('interpreta il formato italiano gg/mm/aaaa', () => {
      const risultato = date({ v: '05/11/2024' }, 'v');
      expect(risultato?.getUTCMonth()).toBe(10); // novembre, non maggio
      expect(risultato?.getUTCDate()).toBe(5);
    });

    it('interpreta il formato ISO', () => {
      expect(date({ v: '2024-11-05' }, 'v')?.getUTCFullYear()).toBe(2024);
    });

    it('restituisce null su date non valide', () => {
      expect(date({ v: '99/99/9999' }, 'v')).toBeNull();
      expect(date({ v: 'mai' }, 'v')).toBeNull();
    });
  });

  describe('bool', () => {
    it('riconosce le forme italiane e inglesi', () => {
      expect(bool({ v: 'SI' }, 'v')).toBe(true);
      expect(bool({ v: 'sì' }, 'v')).toBe(true);
      expect(bool({ v: 'no' }, 'v')).toBe(false);
      expect(bool({ v: 1 }, 'v')).toBe(true);
      expect(bool({ v: 0 }, 'v')).toBe(false);
    });

    it('distingue «non lo so» da «no»', () => {
      expect(bool({}, 'v')).toBeNull();
      expect(bool({ v: 'forse' }, 'v')).toBeNull();
    });
  });

  describe('percent', () => {
    it('accetta sia la quota sia i punti percentuali', () => {
      expect(percent({ v: 0.42 }, 'v')).toBeCloseTo(0.42, 6);
      expect(percent({ v: 42 }, 'v')).toBeCloseTo(0.42, 6);
    });
  });

  describe('str', () => {
    it('rimuove gli spazi e considera vuota la stringa di soli spazi', () => {
      expect(str({ v: '  ACME  ' }, 'v')).toBe('ACME');
      expect(str({ v: '   ' }, 'v')).toBeNull();
    });

    it('converte i numeri in stringa (i codici REA arrivano in entrambe le forme)', () => {
      expect(str({ v: 412987 }, 'v')).toBe('412987');
    });
  });
});
