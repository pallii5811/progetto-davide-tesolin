/**
 * Il monitoraggio deve segnalare ciò che sposta una copertura, e tacere sul resto.
 *
 * Un avviso che non porta a un'azione consuma l'attenzione dell'intermediario, e
 * un'attenzione consumata è ciò che fa ignorare l'avviso che invece contava.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';
import { rilevaEventi } from '../src/monitoring/detect.js';
import type { StatoSorvegliato } from '../src/monitoring/state.js';

const OGGI = new Date('2026-06-15T10:00:00Z');

function stato(modifiche: Partial<StatoSorvegliato> = {}): StatoSorvegliato {
  return {
    osservatoIl: '2026-06-15T10:00:00.000Z',
    denominazione: 'Adriatica Logistica S.r.l.',
    formaGiuridica: 'Società a responsabilità limitata',
    attiva: true,
    ateco: '52.10.10',
    indirizzoSedeLegale: 'Via dell’Industria 42, Ravenna',
    numeroUnitaLocali: 1,
    dimensione: 'piccola',
    addetti: 35,
    fatturato: Money.euro(4_800_000),
    annoUltimoBilancio: 2024,
    patrimonioNetto: Money.euro(2_560_000),
    scoreCredito: 76,
    classeCredito: 'B',
    proceduraConcorsualeAperta: false,
    eventiNegativiPresenti: false,
    statoCatNat: 'adempiente',
    capitaliRaccomandati: {},
    polizze: [],
    ...modifiche,
  };
}

describe('Monitoraggio: nessun rumore', () => {
  it('due fotografie identiche non producono alcun evento', () => {
    const eventi = rilevaEventi(stato(), stato(), { asOf: OGGI });
    expect(eventi).toEqual([]);
  });

  it('una variazione di score sotto soglia non merita una telefonata', () => {
    const eventi = rilevaEventi(stato({ scoreCredito: 76 }), stato({ scoreCredito: 79 }), {
      asOf: OGGI,
    });
    expect(eventi).toEqual([]);
  });

  it('l’inadempienza CAT NAT viene dichiarata anche quando persiste', () => {
    const inadempiente = stato({ statoCatNat: 'inadempiente' });

    // Uno stato che dura non è meno grave perché dura: tacerlo lo farebbe sparire
    // proprio dalle situazioni in cui è aperto da più tempo. A non riempire la coda di
    // doppioni pensa chi la coda la tiene, non il rilevatore.
    expect(rilevaEventi(null, inadempiente, { asOf: OGGI })).toHaveLength(1);
    expect(rilevaEventi(inadempiente, inadempiente, { asOf: OGGI })).toHaveLength(1);
  });
});

describe('Monitoraggio: variazioni che rendono inoperante una garanzia', () => {
  it('il cambio di ATECO è al massimo della rilevanza e cita l’aggravamento del rischio', () => {
    const eventi = rilevaEventi(stato(), stato({ ateco: '41.20.00' }), { asOf: OGGI });

    const evento = eventi.find((e) => e.tipo === 'ateco-variato');
    expect(evento?.rilevanza).toBe(5);
    expect(evento?.conseguenza).toMatch(/inoperativit|garanzia/i);
    expect(evento?.riferimenti.join(' ')).toContain('1898');
  });

  it('una nuova unità locale segnala che l’ubicazione non è coperta', () => {
    const eventi = rilevaEventi(stato(), stato({ numeroUnitaLocali: 3 }), { asOf: OGGI });

    const evento = eventi.find((e) => e.tipo === 'nuova-sede');
    expect(evento?.rilevanza).toBe(5);
    expect(evento?.titolo).toContain('2 nuove unità locali');
    expect(evento?.conseguenza).toMatch(/non è coperta/i);
  });

  it('il trasferimento della sede impone l’appendice di variazione', () => {
    const eventi = rilevaEventi(stato(), stato({ indirizzoSedeLegale: 'Via Nuova 1, Forlì' }), {
      asOf: OGGI,
    });

    const evento = eventi.find((e) => e.tipo === 'nuova-sede');
    expect(evento?.azioneSuggerita).toMatch(/appendice/i);
  });
});

describe('Monitoraggio: sottoassicurazione sopravvenuta', () => {
  const conPolizzaIncendio = (sommaAssicurata: number, raccomandato: number): StatoSorvegliato =>
    stato({
      annoUltimoBilancio: 2025,
      capitaliRaccomandati: { incendio: Money.euro(raccomandato) },
      polizze: [
        {
          coverage: 'incendio',
          compagnia: 'Compagnia Alfa',
          numeroPolizza: '2024/117/884512',
          scadenza: '2027-06-30',
          sommaAssicurata: Money.euro(sommaAssicurata),
          massimale: null,
        },
      ],
    });

  it('segnala il capitale non più capiente quando il bilancio nuovo lo rivela', () => {
    const eventi = rilevaEventi(stato(), conPolizzaIncendio(2_000_000, 3_000_000), { asOf: OGGI });

    const evento = eventi.find((e) => e.titolo.includes('non più capiente'));
    expect(evento, 'uno scostamento del 50% deve essere segnalato').toBeDefined();
    expect(evento?.rilevanza).toBe(5);
    expect(evento?.riferimenti.join(' ')).toContain('1907');

    // La conseguenza dev'essere quantificata: «regola proporzionale» non dice nulla a un
    // imprenditore, «su 100.000 € ne prendi 66.667» sì.
    expect(evento?.conseguenza).toMatch(/66\.667|66667/);
  });

  it('tace sugli scostamenti fisiologici', () => {
    // Il 5% è oscillazione ordinaria: segnalarla ogni anno svuoterebbe l'avviso.
    const eventi = rilevaEventi(stato(), conPolizzaIncendio(2_000_000, 2_100_000), { asOf: OGGI });
    expect(eventi.filter((e) => e.titolo.includes('non più capiente'))).toEqual([]);
  });

  it('non segnala nulla se la polizza assicura più del raccomandato', () => {
    const eventi = rilevaEventi(stato(), conPolizzaIncendio(4_000_000, 3_000_000), { asOf: OGGI });
    expect(eventi.filter((e) => e.titolo.includes('non più capiente'))).toEqual([]);
  });
});

describe('Monitoraggio: scadenze', () => {
  const conScadenza = (scadenza: string): StatoSorvegliato =>
    stato({
      polizze: [
        {
          coverage: 'rct',
          compagnia: 'Compagnia Beta',
          numeroPolizza: 'LM-2025-4471',
          scadenza,
          sommaAssicurata: null,
          massimale: Money.euro(5_000_000),
        },
      ],
    });

  it('avvisa entro il preavviso e tace oltre', () => {
    expect(rilevaEventi(null, conScadenza('2026-07-10'), { asOf: OGGI })).toHaveLength(1);
    expect(rilevaEventi(null, conScadenza('2027-07-10'), { asOf: OGGI })).toEqual([]);
  });

  it('una polizza già scaduta è al massimo della rilevanza', () => {
    const eventi = rilevaEventi(null, conScadenza('2026-05-01'), { asOf: OGGI });

    expect(eventi[0]?.rilevanza).toBe(5);
    expect(eventi[0]?.titolo).toContain('scaduta da 45 giorni');
    expect(eventi[0]?.conseguenza).toMatch(/non troverebbe indennizzo/i);
  });

  it('il preavviso è configurabile', () => {
    const fraCentoGiorni = conScadenza('2026-09-20');
    expect(rilevaEventi(null, fraCentoGiorni, { asOf: OGGI })).toEqual([]);
    expect(rilevaEventi(null, fraCentoGiorni, { asOf: OGGI, preavvisoScadenzaGiorni: 120 })).toHaveLength(
      1,
    );
  });
});

describe('Monitoraggio: credito e dimensione', () => {
  it('un calo di score propone la revisione del fido', () => {
    const eventi = rilevaEventi(stato(), stato({ scoreCredito: 52, classeCredito: 'C' }), {
      asOf: OGGI,
    });

    const evento = eventi.find((e) => e.tipo === 'score-variato');
    expect(evento?.azioneSuggerita).toMatch(/fido/i);
    expect(evento?.rilevanza).toBe(4);
  });

  it('un miglioramento è un’occasione commerciale, non un allarme', () => {
    const eventi = rilevaEventi(stato({ scoreCredito: 60 }), stato({ scoreCredito: 82 }), {
      asOf: OGGI,
    });

    const evento = eventi.find((e) => e.tipo === 'score-variato');
    expect(evento?.rilevanza).toBe(2);
    expect(evento?.azioneSuggerita).toMatch(/rinegoziare/i);
  });

  it('il salto dimensionale rende insufficienti i massimali precedenti', () => {
    const eventi = rilevaEventi(stato(), stato({ dimensione: 'media', addetti: 120 }), {
      asOf: OGGI,
    });

    const evento = eventi.find((e) => e.tipo === 'salto-dimensionale');
    expect(evento?.conseguenza).toMatch(/insufficient/i);
    expect(evento?.azioneSuggerita).toMatch(/RCT|D&O/);
  });

  it('la procedura concorsuale aperta è al massimo della rilevanza', () => {
    const eventi = rilevaEventi(stato(), stato({ proceduraConcorsualeAperta: true }), {
      asOf: OGGI,
    });

    const evento = eventi.find((e) => e.tipo === 'procedura-aperta');
    expect(evento?.rilevanza).toBe(5);
    expect(evento?.azioneSuggerita).toMatch(/fido/i);
  });
});

describe('Monitoraggio: ordinamento della coda', () => {
  it('mette per primo ciò che costa di più non fare', () => {
    const eventi = rilevaEventi(
      stato(),
      stato({
        scoreCredito: 66,
        ateco: '41.20.00',
        annoUltimoBilancio: 2025,
      }),
      { asOf: OGGI },
    );

    expect(eventi.length).toBeGreaterThan(2);
    expect(eventi[0]?.rilevanza).toBe(5);

    const rilevanze = eventi.map((e) => e.rilevanza);
    expect([...rilevanze].sort((a, b) => b - a)).toEqual(rilevanze);
  });

  it('ogni evento porta fatto, conseguenza e azione', () => {
    const eventi = rilevaEventi(
      stato(),
      stato({ ateco: '41.20.00', numeroUnitaLocali: 2, scoreCredito: 50 }),
      { asOf: OGGI },
    );

    for (const evento of eventi) {
      expect(evento.descrizione.length, evento.titolo).toBeGreaterThan(20);
      expect(evento.conseguenza.length, evento.titolo).toBeGreaterThan(30);
      expect(evento.azioneSuggerita.length, evento.titolo).toBeGreaterThan(20);
    }
  });
});
