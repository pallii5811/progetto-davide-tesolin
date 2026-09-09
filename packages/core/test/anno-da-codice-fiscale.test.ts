import { describe, expect, it } from 'vitest';
import { annoDiNascitaDaCodiceFiscale } from '../src/index.js';

/**
 * L'anno di nascita dal codice fiscale, e il secolo che non si indovina.
 *
 * Serve all'adeguata verifica: senza l'anno, due omonimi in lista di sanzioni restano
 * entrambi «possibili», e l'intermediario non ha di che distinguerli. Con l'anno, uno
 * diventa «forte» e l'altro «debole».
 *
 * I codici usati qui sono validi di controllo ma non appartengono a nessuno: sono costruiti
 * per il collaudo. Non si mettono in una prova i dati di una persona vera.
 */
describe('L’anno di nascita dal codice fiscale', () => {
  /* Codice di prova con le cifre dell'anno a 70: valido nel carattere di controllo. */
  const conAnno = (dueCifre: string): string => {
    // Le posizioni 7-8 (1-based) sono l'anno. Il resto è una struttura qualunque valida.
    const base = `RSSMRA${dueCifre}A01H501`;
    return base + carattereDiControllo(base);
  };

  it('legge l’anno e sceglie il secolo che dà un’età plausibile', () => {
    expect(annoDiNascitaDaCodiceFiscale(conAnno('52'), 2026)).toBe(1952);
    expect(annoDiNascitaDaCodiceFiscale(conAnno('70'), 2026)).toBe(1970);
    expect(annoDiNascitaDaCodiceFiscale(conAnno('99'), 2026)).toBe(1999);
  });

  it('per le cifre basse sceglie il duemila, perché il novecento darebbe un ultracentenario', () => {
    // 05 → 1905 farebbe 121 anni; 2005 ne fa 21.
    expect(annoDiNascitaDaCodiceFiscale(conAnno('05'), 2026)).toBe(2005);
    expect(annoDiNascitaDaCodiceFiscale(conAnno('08'), 2026)).toBe(2008);
  });

  it('quando nessuno dei due secoli regge, non ne sceglie uno', () => {
    // 20 → 1920 farebbe 106 anni (dentro la finestra), 2020 ne farebbe 6 (fuori).
    expect(annoDiNascitaDaCodiceFiscale(conAnno('20'), 2026)).toBe(1920);
    // 24 → 1924 farebbe 102, 2024 ne farebbe 2: resta il novecento.
    expect(annoDiNascitaDaCodiceFiscale(conAnno('24'), 2026)).toBe(1924);
  });

  it('l’anno di riferimento cambia la risposta, ed è per questo che si passa', () => {
    /*
      Lo stesso codice, letto fra vent'anni, non deve dare la stessa risposta per inerzia:
      chi nel 2026 era un ventiduenne del 2005, nel 2116 sarebbe un ultracentenario e la
      deduzione andrebbe rifatta. Una funzione che leggesse l'orologio nasconderebbe questo,
      e nessun collaudo se ne accorgerebbe.
    */
    expect(annoDiNascitaDaCodiceFiscale(conAnno('05'), 2026)).toBe(2005);
    expect(annoDiNascitaDaCodiceFiscale(conAnno('05'), 1990)).toBe(1905);
  });

  it('un codice non valido non produce un anno inventato', () => {
    expect(annoDiNascitaDaCodiceFiscale('non-un-codice', 2026)).toBeNull();
    expect(annoDiNascitaDaCodiceFiscale('', 2026)).toBeNull();
    expect(annoDiNascitaDaCodiceFiscale('RSSMRA70A01H501X', 2026)).toBeNull();
  });
});

/** Il carattere di controllo, per costruire codici di prova che passino la validazione. */
function carattereDiControllo(quindici: string): string {
  const dispari: Readonly<Record<string, number>> = {
    '0': 1,
    '1': 0,
    '2': 5,
    '3': 7,
    '4': 9,
    '5': 13,
    '6': 15,
    '7': 17,
    '8': 19,
    '9': 21,
    A: 1,
    B: 0,
    C: 5,
    D: 7,
    E: 9,
    F: 13,
    G: 15,
    H: 17,
    I: 19,
    J: 21,
    K: 2,
    L: 4,
    M: 18,
    N: 20,
    O: 11,
    P: 3,
    Q: 6,
    R: 8,
    S: 12,
    T: 14,
    U: 16,
    V: 10,
    W: 22,
    X: 25,
    Y: 24,
    Z: 23,
  };
  const pari: Readonly<Record<string, number>> = {
    '0': 0,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
  };
  let somma = 0;
  for (let i = 0; i < 15; i += 1) {
    const c = quindici[i]!;
    somma += i % 2 === 0 ? dispari[c]! : pari[c]!;
  }
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[somma % 26]!;
}
