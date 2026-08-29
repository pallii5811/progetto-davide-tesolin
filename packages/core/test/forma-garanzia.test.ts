/**
 * La polizza che c'è si giudica sulla forma con cui è stata scritta.
 *
 * Il difetto: `computeUnderinsurance` decideva `sottoassicurata` su
 * `gradoDiCopertura < 0,98` senza mai guardare se la garanzia fosse soggetta alla regola
 * proporzionale. Una polizza scritta **correttamente** a primo rischio assoluto — cioè
 * con un limite inferiore al valore dei beni, che è il punto di quella forma — risultava
 * sottoassicurata. E la stessa `Explained` conteneva già la nota «la regola proporzionale
 * non si applica»: la spiegazione e il verdetto si contraddicevano dentro lo stesso
 * oggetto. Chi leggeva la nota si fidava, chi leggeva il flag agiva.
 *
 * Non serviva collegare nulla per vederlo: bastava che un cliente portasse una polizza a
 * primo rischio — cioè quasi ogni polizza furto del mercato — perché il prodotto gli
 * dicesse di comprare capitale che non gli serve.
 *
 * Nessun collaudo copriva questo caso: `primo-rischio-assoluto` compariva nei test solo
 * dentro `danno-massimo.test.ts`, e mai su una polizza in essere.
 */

import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  Money,
  analyzeCompany,
  computeUnderinsurance,
  demoCompanyProfile,
  demoPolizze,
} from '../src/index.js';
import type { CompanyAnalysis, PolizzaInEssere } from '../src/index.js';

const euro = (v: number) => Money.euro(v);

/** Il patrimonio esposto dell'azienda dimostrativa: 6,2 M€. */
const VALORE_BENI = euro(6_200_000);
/** Il danno massimo probabile con le protezioni dichiarate: 2,2 M€. */
const DANNO_PROBABILE = euro(2_200_000);

function polizzaIncendio(over: Partial<PolizzaInEssere>): PolizzaInEssere {
  return {
    id: 'pol-incendio',
    coverage: 'incendio',
    compagnia: 'Compagnia Beta S.p.A.',
    numeroPolizza: '2026/1',
    sommaAssicurata: DANNO_PROBABILE,
    massimale: null,
    franchigia: null,
    scoperto: null,
    dataEffetto: new Date('2025-01-01T00:00:00Z'),
    dataScadenza: new Date('2027-01-01T00:00:00Z'),
    premioAnnuo: euro(5_000),
    formaGaranzia: 'primo-rischio-assoluto',
    note: null,
    ...over,
  };
}

function conPolizzaIncendio(p: PolizzaInEssere): CompanyAnalysis {
  const altre = demoPolizze().filter((x) => x.coverage !== 'incendio');
  return analyzeCompany(demoCompanyProfile(), [...altre, p], DEMO_AS_OF);
}

const gapIncendio = (a: CompanyAnalysis) => a.gap.gaps.find((g) => g.definition.id === 'incendio');

// ─────────────────────────────────────────────────────────────────────────────

describe('Il verdetto guarda il metro della forma', () => {
  it('un primo rischio sul danno probabile è adeguato, non sottoassicurato', () => {
    const verifica = computeUnderinsurance(VALORE_BENI, DANNO_PROBABILE, {
      soggettaARegolaProporzionale: false,
      riferimentoAdeguatezza: DANNO_PROBABILE,
    });

    expect(verifica.value?.adeguatezzaDelLimite).toBe('adeguata');
    expect(verifica.value?.sottoassicurata).toBe(false);
  });

  it('e l’indennizzo non subisce riduzione proporzionale', () => {
    const verifica = computeUnderinsurance(VALORE_BENI, DANNO_PROBABILE, {
      soggettaARegolaProporzionale: false,
      riferimentoAdeguatezza: DANNO_PROBABILE,
      dannoSimulato: euro(1_000_000),
    });
    // Sotto il limite: si indennizza il danno per intero.
    expect(verifica.value?.simulazione.indennizzo).toBe(euro(1_000_000));
    expect(verifica.value?.simulazione.aCaricoAssicurato).toBe(Money.ZERO);
  });

  it('lo stesso capitale a valore intero è invece sottoassicurato', () => {
    const verifica = computeUnderinsurance(VALORE_BENI, DANNO_PROBABILE, {
      soggettaARegolaProporzionale: true,
    });

    expect(verifica.value?.adeguatezzaDelLimite).toBe('insufficiente');
    expect(verifica.value?.sottoassicurata).toBe(true);
    // 2,2 su 6,2: al sinistro si prende poco più di un terzo.
    expect(verifica.value?.gradoDiCopertura).toBeCloseTo(0.3548, 3);
  });

  it('un primo rischio troppo basso resta insufficiente, ma per il motivo giusto', () => {
    const verifica = computeUnderinsurance(VALORE_BENI, euro(500_000), {
      soggettaARegolaProporzionale: false,
      riferimentoAdeguatezza: DANNO_PROBABILE,
    });

    expect(verifica.value?.adeguatezzaDelLimite).toBe('insufficiente');
    const note = JSON.stringify(verifica.explanation);
    // Il motivo giusto è l'eccedenza scoperta, non la riduzione dell'indennizzo: su un
    // primo rischio la proporzionale non opera, e annunciarla sarebbe l'allarme sbagliato.
    expect(note).toContain('eccedenza resterebbe');
    expect(note).not.toContain('SOTTOASSICURAZIONE del');
  });

  it('senza un metro il limite non si giudica: si dichiara, non si deduce', () => {
    const verifica = computeUnderinsurance(VALORE_BENI, euro(500_000), {
      soggettaARegolaProporzionale: false,
    });

    expect(verifica.value?.adeguatezzaDelLimite).toBe('non-verificabile');
    expect(verifica.value?.sottoassicurata).toBe(false);
    expect(verifica.value?.riferimentoAdeguatezza).toBeNull();
    expect(JSON.stringify(verifica.explanation)).toContain('non è giudicabile');
  });
});

describe('Sull’analisi intera, non solo sulla funzione', () => {
  it('la polizza incendio a primo rischio sul danno probabile risulta adeguata', () => {
    const gap = gapIncendio(conPolizzaIncendio(polizzaIncendio({})));
    expect(gap?.status).toBe('adeguata');
    expect(gap?.sottoassicurazione?.value?.sottoassicurata).toBe(false);
  });

  it('la stessa somma dichiarata a valore a nuovo resta sottoassicurata', () => {
    const gap = gapIncendio(conPolizzaIncendio(polizzaIncendio({ formaGaranzia: 'valore-a-nuovo' })));
    expect(gap?.status).toBe('sottoassicurata');
  });

  it('forma non dichiarata: si applica il ramo più prudente, cioè il valore intero', () => {
    /*
      `null` è assenza di dato, non «primo rischio». Dedurre la forma più favorevole da
      un campo vuoto significherebbe dichiarare adeguata una polizza che al sinistro
      subisce la riduzione — l'errore esattamente opposto, e con la stessa vittima.
    */
    const gap = gapIncendio(conPolizzaIncendio(polizzaIncendio({ formaGaranzia: null })));
    expect(gap?.status).toBe('sottoassicurata');
  });

  it('la polizza dimostrativa continua a essere sottoassicurata', () => {
    // Il guardrail: è scritta a valore a nuovo, quindi nessuna correzione deve toccarla.
    const analisi = analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF);
    const gap = gapIncendio(analisi);
    expect(gap?.status).toBe('sottoassicurata');
    expect(gap?.sottoassicurazione?.value?.sottoassicurata).toBe(true);
  });
});
