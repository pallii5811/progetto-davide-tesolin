import { describe, expect, it } from 'vitest';
import { calcolaPropertyRisk } from '../src/protezioni/property-risk.js';
import type { UbicazionePerProperty } from '../src/protezioni/property-risk.js';

/**
 * I punteggi che il popup del Property mostra come lancette.
 *
 * Richiesta di Simone del 14/09/2026, sulla slide di Luca: una lancetta con il totale e quattro con
 * i rischi — fiamme o esplosione (l'attività), sismica, alluvione, frana — e il tipo di sito. Il
 * popup non calcola niente: stampa i punteggi che il motore espone per ogni sede, e quei numeri
 * devono essere gli stessi delle voci del calcolo, non un secondo conto che un giorno diverge.
 *
 * I valori attesi sono fatti a mano, non ricopiati dal codice.
 */

const ESPOSTA: UbicazionePerProperty = {
  id: 'prova|via-esposta-1',
  etichetta: 'Sede legale — VIA ESPOSTA 1, PROVA (XX)',
  tipo: 'sede-legale',
  zonaSismica: 2,
  // Il 20% delle imprese del comune in pericolosità idraulica elevata: alluvione alta. Nessuna in
  // pericolosità da frana: frana bassa.
  indicatoriIdrogeo: { idrA: 5, idrM: 10, impIdrA: 20, impIdrM: 0, frnA: 0, impFrnA: 0 },
};

describe('I punteggi della sede per il popup', () => {
  it('uno per lancetta, calcolati a mano', () => {
    /*
      Divisione 49: attività 4 (foglio). Sede legale: il foglio prescrive l'attività, sito 4.
      Zona 2 → 5, alluvione alta → 7, frana bassa → 1.
      Medio (7 + 5 + 1) / 3 = 4,33; pericoli 50% × 7 + 50% × 4,33 = 5,665 → 5,67.
      Property 4 × 30% + 4 × 20% + 5,67 × 50% = 1,20 + 0,80 + 2,84 = 4,84.
    */
    const [sede] = calcolaPropertyRisk('49', [ESPOSTA]).ubicazioni;

    expect(sede?.punteggi).toEqual({
      attivita: 4,
      tipoDiSito: 4,
      terremoto: 5,
      alluvione: 7,
      frana: 1,
      pericoliNaturali: 5.67,
    });
    expect(sede?.punteggio).toBe(4.84);
  });

  it('i punteggi sono quelli delle voci, non un secondo calcolo', () => {
    const [sede] = calcolaPropertyRisk('49', [ESPOSTA]).ubicazioni;
    const [attivita, sito, pericoli] = sede!.voci;

    expect(sede?.punteggi.attivita).toBe(attivita?.punteggio);
    expect(sede?.punteggi.tipoDiSito).toBe(sito?.punteggio);
    expect(sede?.punteggi.pericoliNaturali).toBe(pericoli?.punteggio);
  });

  /*
    Una sede legale prende il punteggio dell'attività anche come tipo di sito, perché il foglio lo
    prescrive: i due numeri coincidono, e un popup che mostrasse l'attività al posto del tipo di sito
    passerebbe inosservato. La prova a vuoto l'ha trovata verde. Uno stabilimento li separa.
  */
  it('il tipo di sito ha il suo punteggio anche quando è diverso dall’attività', () => {
    // Stabilimento: nel foglio 7, mentre la divisione 49 vale 4.
    // Property 4 × 30% + 7 × 20% + 5,67 × 50% = 1,20 + 1,40 + 2,84 = 5,44.
    const [sede] = calcolaPropertyRisk('49', [{ ...ESPOSTA, tipo: 'stabilimento' }]).ubicazioni;
    const [, sito] = sede!.voci;

    expect(sede?.punteggi.attivita).toBe(4);
    expect(sede?.punteggi.tipoDiSito).toBe(7);
    expect(sede?.punteggi.tipoDiSito).toBe(sito?.punteggio);
    expect(sede?.punteggio).toBe(5.44);
  });

  it('ogni pericolo ha la sua didascalia breve, con parole sue', () => {
    const [sede] = calcolaPropertyRisk('49', [ESPOSTA]).ubicazioni;

    expect(sede?.didascalie).toEqual({
      terremoto: 'zona sismica 2',
      alluvione: 'pericolosità idraulica alta nel comune',
      frana: 'pericolosità da frana bassa nel comune',
    });
  });

  it('senza dati ISPRA alluvione e frana restano senza punteggio, e nessuna lancetta lo inventa', () => {
    const [sede] = calcolaPropertyRisk('49', [
      { ...ESPOSTA, zonaSismica: 3, indicatoriIdrogeo: null },
    ]).ubicazioni;

    expect(sede?.punteggi).toEqual({
      attivita: 4,
      tipoDiSito: 4,
      terremoto: 3,
      alluvione: null,
      frana: null,
      pericoliNaturali: null,
    });
    expect(sede?.punteggio).toBeNull();
    expect(sede?.didascalie.alluvione).toBe('comune fuori dall’archivio ISPRA');
    expect(sede?.didascalie.frana).toBe('comune fuori dall’archivio ISPRA');
  });

  it('senza zona sismica il terremoto resta senza punteggio', () => {
    const [sede] = calcolaPropertyRisk('49', [{ ...ESPOSTA, zonaSismica: null }]).ubicazioni;

    expect(sede?.punteggi.terremoto).toBeNull();
    expect(sede?.punteggi.pericoliNaturali).toBeNull();
    expect(sede?.didascalie.terremoto).toBe('comune non classificato');
  });

  it('senza ATECO nel foglio la lancetta dell’attività resta vuota', () => {
    const [sede] = calcolaPropertyRisk(null, [ESPOSTA]).ubicazioni;

    expect(sede?.punteggi.attivita).toBeNull();
    expect(sede?.punteggio).toBeNull();
  });
});
