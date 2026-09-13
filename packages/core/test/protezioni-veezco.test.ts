import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile } from '../src/index.js';
import {
  PESI_CYBER,
  PESI_PROPERTY,
  RISCHIO_ATTIVITA,
  RISCHIO_CYBER,
  RISCHIO_TIPO_DI_SITO,
} from '../src/protezioni/tabelle-veezco.js';
import {
  FORMULA_PROPERTY,
  calcolaPropertyRisk,
  pericoliNaturali,
  tipoDiSitoDelFoglio,
} from '../src/protezioni/property-risk.js';
import type { UbicazionePerProperty } from '../src/protezioni/property-risk.js';
import { calcolaBusinessInterruption } from '../src/protezioni/business-interruption.js';
import { FORMULA_CYBER, calcolaCyberRisk } from '../src/protezioni/cyber-risk.js';

/**
 * Le tre protezioni del foglio «Veezco_Analisi Rischio.xlsx», verificate contro il foglio.
 *
 * I valori attesi vengono dal foglio letto il 13/09/2026, non dal codice: una prova che
 * ricopiasse il calcolo passerebbe anche su un calcolo sbagliato.
 */

describe('Le tabelle sono quelle del foglio', () => {
  it('87 divisioni ATECO in entrambe le tabelle, le stesse', () => {
    expect(Object.keys(RISCHIO_ATTIVITA)).toHaveLength(87);
    expect(Object.keys(RISCHIO_CYBER).sort()).toEqual(Object.keys(RISCHIO_ATTIVITA).sort());
    expect(
      RISCHIO_ATTIVITA['45'],
      'la divisione 45 non è nella classificazione 2025 del foglio',
    ).toBeUndefined();
  });

  it('i pesi sono quelli del foglio e sommano a uno', () => {
    expect(PESI_PROPERTY).toEqual({ attivita: 0.3, tipoDiSito: 0.2, pericoliNaturali: 0.5 });
    expect(PESI_CYBER).toEqual({
      dipendenzaDigitale: 0.3,
      sensibilitaDati: 0.3,
      esposizioneTransazioni: 0.15,
      attrattivita: 0.25,
    });
  });

  it('righe lette nel foglio, a campione', () => {
    expect(RISCHIO_ATTIVITA['49']).toEqual({
      titolo: 'Trasporto terrestre e trasporto mediante condotte',
      punteggio: 4,
      fascia: 'Medium',
    });
    expect(RISCHIO_ATTIVITA['05']?.punteggio).toBe(7);
    expect(RISCHIO_ATTIVITA['62']?.punteggio).toBe(2);
    expect(RISCHIO_ATTIVITA['69']?.punteggio).toBe(1);
    expect(RISCHIO_TIPO_DI_SITO.find((t) => t.tipo === 'Ufficio')?.punteggio).toBe(1);
    expect(RISCHIO_TIPO_DI_SITO.find((t) => t.tipo === 'Stabilimento')?.punteggio).toBe(7);
    expect(RISCHIO_TIPO_DI_SITO.find((t) => t.tipo === 'Sede secondaria')?.punteggio).toBeNull();
    expect(RISCHIO_CYBER['63']).toMatchObject({
      dipendenzaDigitale: 7,
      sensibilitaDati: 7,
      esposizioneTransazioni: 6,
    });
  });
});

describe('Cyber Risk', () => {
  it('su tutte le 87 divisioni il calcolo restituisce il punteggio salvato nel foglio', () => {
    const diversi = Object.entries(RISCHIO_CYBER)
      .map(
        ([divisione, riga]) =>
          [divisione, calcolaCyberRisk(divisione).punteggio, riga.punteggioDelFoglio] as const,
      )
      .filter(([, calcolato, foglio]) => calcolato !== foglio);
    expect(diversi).toEqual([]);
  });

  it('il mezzo si arrotonda come nel foglio: divisione 25, 3,35 → 3,4', () => {
    expect(calcolaCyberRisk('25').punteggio).toBe(3.4);
  });

  it('TRANSPECIAL, divisione 49: 6 × 30% + 4 × 30% + 4 × 15% + 6 × 25% = 5,1', () => {
    const c = calcolaCyberRisk('49');
    expect(c.punteggio).toBe(5.1);
    expect(c.voci.map((v) => v.punteggio)).toEqual([6, 4, 4, 6]);
    expect(c.voci.map((v) => v.peso)).toEqual([0.3, 0.3, 0.15, 0.25]);
    expect(c.titoloDivisione).toBe('Trasporto terrestre e trasporto mediante condotte');
  });

  it('la divisione 45 e l’ATECO assente restano non calcolabili, senza un punteggio preso a prestito', () => {
    expect(calcolaCyberRisk('45').punteggio).toBeNull();
    expect(calcolaCyberRisk('45').note.join(' ')).toContain('ATECO 2025');
    expect(calcolaCyberRisk(null).punteggio).toBeNull();
  });

  it('la formula porta i pesi del foglio', () => {
    for (const p of ['30%', '15%', '25%']) expect(FORMULA_CYBER).toContain(p);
  });
});

describe('Property Risk', () => {
  const sede: UbicazionePerProperty = {
    id: 'monticellibrusati|fornaci2022',
    etichetta: 'Sede legale — VIA FORNACI 20/22, MONTICELLI BRUSATI (BS)',
    tipo: 'sede-legale',
    sismica: 'media',
    idraulica: 'bassa',
    frane: null,
  };

  it('TRANSPECIAL: attività 4, sito sul ripiego del foglio, pericoli naturali senza tabella → non calcolabile', () => {
    const p = calcolaPropertyRisk('49', [sede]);
    const [attivita, sito, pericoli] = p.ubicazioni[0]!.voci;
    expect(attivita?.punteggio).toBe(4);
    expect(attivita?.contributo).toBeCloseTo(1.2, 9);
    expect(sito?.punteggio).toBe(4);
    expect(sito?.contributo).toBeCloseTo(0.8, 9);
    expect(sito?.dettaglio).toContain('il foglio prescrive di usare il punteggio dell’attività');
    expect(pericoli?.punteggio).toBeNull();
    expect(pericoli?.dettaglio).toContain('frana non determinata');
    expect(p.punteggio, 'il 50% mancante non si stima sulle altre due voci').toBeNull();
    expect(p.note.join(' ')).toContain('Natural_Hazard_Risk');
  });

  it('il tipo di sito viene dal foglio dove il registro lo dice', () => {
    expect(tipoDiSitoDelFoglio('ufficio')).toEqual({ tipo: 'Ufficio', punteggio: 1 });
    expect(tipoDiSitoDelFoglio('punto-vendita')).toEqual({ tipo: 'Negozio', punteggio: 3 });
    expect(tipoDiSitoDelFoglio('magazzino')).toEqual({ tipo: 'Magazzino', punteggio: 5 });
    expect(tipoDiSitoDelFoglio('stabilimento')).toEqual({ tipo: 'Stabilimento', punteggio: 7 });
    for (const amministrativo of ['sede-legale', 'sede-operativa', 'altro'] as const) {
      expect(tipoDiSitoDelFoglio(amministrativo)).toBeNull();
    }
    expect(tipoDiSitoDelFoglio(null)).toBeNull();
  });

  it('la formula dei pericoli naturali è quella scritta: metà il massimo, metà la media dei tre', () => {
    expect(pericoliNaturali(6, 2, 3)).toBeCloseTo(0.5 * 6 + 0.5 * (11 / 3), 9);
  });

  it('senza ATECO nessuna voce prende un punteggio', () => {
    const p = calcolaPropertyRisk(null, [sede]);
    expect(p.ubicazioni[0]!.voci.map((v) => v.punteggio)).toEqual([null, null, null]);
  });

  it('la formula porta i pesi del foglio', () => {
    expect(FORMULA_PROPERTY).toBe(
      'Property Risk = 30% × rischio dell’attività + 20% × tipo di sito + 50% × pericoli naturali',
    );
  });
});

describe('Business Interruption', () => {
  const property = calcolaPropertyRisk('49', []);

  it('l’esempio del foglio: fatturato 365.000.000 → 1.000.000 al giorno, 7, 30 e 90 giorni', () => {
    const bi = calcolaBusinessInterruption(property, null, Money.euro(365_000_000));
    expect(bi.base).toBe('fatturato');
    expect(Money.toEuro(bi.perditaGiornaliera!)).toBe(1_000_000);
    expect(bi.scenari.map((s) => [s.giorni, Money.toEuro(s.perdita)])).toEqual([
      [7, 7_000_000],
      [30, 30_000_000],
      [90, 90_000_000],
    ]);
    expect(bi.note.join(' ')).toContain('per eccesso');
  });

  it('con il margine di contribuzione si usa il margine', () => {
    const bi = calcolaBusinessInterruption(property, Money.euro(3_650_000), Money.euro(20_000_000));
    expect(bi.base).toBe('margine-di-contribuzione');
    expect(Money.toEuro(bi.perditaGiornaliera!)).toBe(10_000);
    expect(Money.toEuro(bi.scenari[1]!.perdita)).toBe(300_000);
  });

  it('gli scenari tornano con la perdita giornaliera stampata: chi rifà il conto trova lo stesso numero', () => {
    // 1.000.000 € ÷ 365 = 2.739,726… €, stampata 2.739,73 €. × 90 = 246.575,70 €, non i
    // 246.575,34 € della base: la scheda mostra il primo, e il secondo non tornerebbe.
    const bi = calcolaBusinessInterruption(property, Money.euro(1_000_000), null);
    expect(Money.toEuro(bi.perditaGiornaliera!)).toBe(2739.73);
    for (const s of bi.scenari) {
      expect(s.perdita, `${s.giorni} giorni`).toBe(Money.multiply(bi.perditaGiornaliera!, s.giorni));
    }
    expect(Money.toEuro(bi.scenari[2]!.perdita)).toBe(246575.7);
  });

  it('un margine non positivo non misura una perdita: si usa il fatturato e lo si dice', () => {
    const bi = calcolaBusinessInterruption(property, Money.euro(-50_000), Money.euro(730_000));
    expect(bi.base).toBe('fatturato');
    expect(bi.note.join(' ')).toContain('non è positivo');
  });

  it('né margine né fatturato: da rilevare, nessuno scenario inventato', () => {
    const bi = calcolaBusinessInterruption(property, null, null);
    expect(bi.base).toBeNull();
    expect(bi.perditaGiornaliera).toBeNull();
    expect(bi.scenari).toEqual([]);
  });

  it('il punteggio fisico è il Property Risk', () => {
    expect(calcolaBusinessInterruption(property, null, null).punteggioFisico).toBe(property.punteggio);
  });
});

describe('Nell’analisi', () => {
  it('l’impresa dimostrativa porta le tre protezioni, una per ubicazione nel Property', () => {
    const a = analyzeCompany(demoCompanyProfile(), [], DEMO_AS_OF);
    expect(a.protezioni.fonte).toBe('Veezco_Analisi Rischio.xlsx');
    expect(a.protezioni.cyber.divisioneAteco).toBe('25');
    expect(a.protezioni.cyber.punteggio).toBe(3.4);
    expect(a.protezioni.property.ubicazioni).toHaveLength(a.ubicazioni.ubicazioni.length);
    expect(a.protezioni.businessInterruption.perditaGiornaliera).not.toBeNull();
  });
});
