import { describe, expect, it } from 'vitest';
import { computeSumsInsured } from '../src/coverage/sums-insured.js';
import { analizzaAssetto } from '../src/governance/assetto.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { Assetti, Carica, Socio } from '../src/company/profile.js';
import { etichettaAddetti } from '../../../apps/web/src/lib/etichetta-addetti.js';

/**
 * Tre difetti letti sulla scheda di un autotrasportatore in provincia di Brescia.
 *
 * Nessuno dei tre si vedeva in un numero preso da solo. Tutti e tre si vedevano leggendo
 * la pagina intera, che è l'unico controllo che chi la riceve può fare.
 *
 * 1. **Un capitale su cinque presentato come il totale.** La somma assicuranda fabbricati
 *    — 4,7 milioni, a confidenza media, poi ripresa come capitale CAT NAT da assicurare per
 *    legge — veniva dall'impronta a terra di una sola ubicazione su cinque. Le altre quattro
 *    contribuivano zero, e la scheda non lo diceva. È la sottoassicurazione che il prodotto
 *    esiste per prevenire, prodotta dal prodotto.
 *
 * 2. **Un procuratore che «blocca le decisioni sociali».** Il fornitore marca come
 *    rappresentante legale anche il procuratore speciale, e il prodotto ne ricavava una
 *    persona chiave con la frase «la sua assenza improvvisa blocca le decisioni sociali» e
 *    una proposta di key man. Il sorgente diceva già il contrario — «un procuratore non
 *    entra» — e non si avverava.
 *
 * 3. **Due numeri diversi con lo stesso nome.** «40 addetti» nell'intestazione, «Addetti 45»
 *    nel record camerale: il primo erano i dipendenti dal bilancio, il secondo gli addetti
 *    al registro. Entrambi giusti, e chiamati allo stesso modo.
 */

function fatti(modifiche: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    denominazione: 'AUTOTRASPORTI DI PROVA S.R.L.',
    formaGiuridica: 'srl',
    statoAttivita: 'attiva',
    dimensione: 'media',
    ateco: null,
    atecoSezione: 'H',
    atecoDivisione: '49',
    atecoSecondari: [],
    addetti: null,
    fatturato: null,
    numeroVeicoli: 0,
    haDipendenti: false,
    numeroSoci: 2,
    haSociPersonaGiuridica: false,
    ...modifiche,
  } as CompanyFacts;
}

const note = (s: ReturnType<typeof computeSumsInsured>): string => s.fabbricati.explanation.notes.join(' ');

describe('1 · Il capitale fabbricati dice su quante ubicazioni è stato calcolato', () => {
  it('una ubicazione su cinque: la nota dichiara la somma parziale e la confidenza scende', () => {
    const s = computeSumsInsured(fatti(), null, [], {
      superficieCartograficaMq: 2_000,
      ubicazioniConSuperficie: 1,
      ubicazioniTotali: 5,
    });
    expect(note(s)).toContain('SOMMA PARZIALE');
    expect(note(s)).toContain('1 ubicazione/i su 5');
    expect(s.fabbricati.confidence, 'meno di metà delle ubicazioni non è confidenza media').toBe('bassa');
  });

  it('tre su cinque: somma parziale dichiarata, ma resta a confidenza media', () => {
    const s = computeSumsInsured(fatti(), null, [], {
      superficieCartograficaMq: 6_000,
      ubicazioniConSuperficie: 3,
      ubicazioniTotali: 5,
    });
    expect(note(s)).toContain('SOMMA PARZIALE');
    expect(s.fabbricati.confidence).toBe('media');
  });

  it('tutte le ubicazioni coperte: nessuna nota parziale, niente cambia rispetto a prima', () => {
    const s = computeSumsInsured(fatti(), null, [], {
      superficieCartograficaMq: 2_000,
      ubicazioniConSuperficie: 2,
      ubicazioniTotali: 2,
    });
    expect(note(s)).not.toContain('SOMMA PARZIALE');
    expect(s.fabbricati.confidence).toBe('media');
  });

  it('senza i conteggi — il chiamante di prima — il risultato è identico a prima', () => {
    // È la proprietà che tiene ferme le istantanee: chi non passa la copertura non vede
    // comparire note o confidenze nuove.
    const s = computeSumsInsured(fatti(), null, [], { superficieCartograficaMq: 2_000 });
    expect(note(s)).not.toContain('SOMMA PARZIALE');
    expect(s.fabbricati.confidence).toBe('media');
  });
});

function carica(nominativo: string, ruolo: string, rappresentante: boolean): Carica {
  return {
    nominativo,
    codiceFiscale: null,
    ruolo,
    dataNomina: null,
    isRappresentanteLegale: rappresentante,
    eta: null,
    dataNascita: null,
    luogoNascita: null,
  };
}

function assetti(cariche: readonly Carica[]): Assetti {
  const soci: Socio[] = [
    {
      denominazione: 'SOCIO UNO',
      codiceFiscale: null,
      tipo: 'persona-fisica',
      quotaPercentuale: 20,
      quotaValore: null,
    },
    {
      denominazione: 'SOCIO DUE',
      codiceFiscale: null,
      tipo: 'persona-fisica',
      quotaPercentuale: 20,
      quotaValore: null,
    },
  ] as unknown as Socio[];
  return { soci, cariche, controllante: null, controllate: [] };
}

const titoli = (a: ReturnType<typeof analizzaAssetto>): string[] => a.implicazioni.map((i) => i.titolo);

describe('2 · Il procuratore rappresenta, ma la sua assenza non blocca le decisioni', () => {
  it('col flag del fornitore acceso, il procuratore speciale non diventa persona chiave', () => {
    const a = analizzaAssetto(
      assetti([
        carica('ROSSI MARIO', 'chairman of board of directors', true),
        carica('BIANCHI LUCA', 'special representative/agent', true),
      ]),
      { formaGiuridica: 'srl', addetti: 40 },
    );
    expect(titoli(a)).toContain('Persona chiave — ROSSI MARIO');
    expect(titoli(a), 'il procuratore non blocca le decisioni sociali').not.toContain(
      'Persona chiave — BIANCHI LUCA',
    );
  });

  it('vale anche quando il ruolo arriva già in italiano', () => {
    const a = analizzaAssetto(assetti([carica('VERDI ANNA', 'Procuratore speciale', true)]), {
      formaGiuridica: 'srl',
      addetti: 40,
    });
    expect(titoli(a)).not.toContain('Persona chiave — VERDI ANNA');
  });

  it('il presidente del consiglio resta persona chiave: nessuna regressione sugli organi', () => {
    const a = analizzaAssetto(assetti([carica('NERI PAOLO', 'chairman of board of directors', true)]), {
      formaGiuridica: 'srl',
      addetti: 40,
    });
    expect(titoli(a)).toContain('Persona chiave — NERI PAOLO');
  });
});

describe('3 · Il numero di persone si chiama per quello che è', () => {
  it('dal bilancio sono dipendenti', () => {
    expect(etichettaAddetti(40, 'bilancio')).toBe('40 dipendenti');
  });

  it('dal registro, dall’intervista o senza fonte sono addetti', () => {
    expect(etichettaAddetti(45, 'archivio')).toBe('45 addetti');
    expect(etichettaAddetti(12, 'intervista')).toBe('12 addetti');
    expect(etichettaAddetti(3, null)).toBe('3 addetti');
  });
});
