import { describe, expect, it } from 'vitest';
import { Money, isBilancioQuadrato, reclassify } from '@aegis/core';
import {
  mappaAnagrafica,
  mappaAssetti,
  mappaBilancio,
  mappaEventiNegativi,
  mappaUnitaLocali,
  normalizzaFormaGiuridica,
  normalizzaStatoAttivita,
} from '../src/openapi/mapper.js';

const OSSERVATO = new Date('2026-08-01T00:00:00Z');

describe('Normalizzazione della forma giuridica', () => {
  it.each([
    ["SOCIETA' A RESPONSABILITA' LIMITATA", 'srl'],
    ['S.R.L.', 'srl'],
    ['SOCIETA A RESPONSABILITA LIMITATA SEMPLIFICATA', 'srls'],
    ["SOCIETA' PER AZIONI", 'spa'],
    ['S.P.A.', 'spa'],
    ['SOCIETA IN NOME COLLETTIVO', 'snc'],
    ['SOCIETA IN ACCOMANDITA SEMPLICE', 'sas'],
    ['IMPRESA INDIVIDUALE', 'ditta-individuale'],
    ['SOCIETA COOPERATIVA', 'cooperativa'],
    ['CONSORZIO', 'consorzio'],
  ])('riconosce «%s» come %s', (descrizione, atteso) => {
    expect(normalizzaFormaGiuridica(descrizione)).toBe(atteso);
  });

  it('la semplificata non viene scambiata per una srl ordinaria', () => {
    // L'ordine dei pattern conta: «responsabilità limitata» comparirebbe in entrambe.
    expect(normalizzaFormaGiuridica('SOCIETA A RESPONSABILITA LIMITATA SEMPLIFICATA')).toBe('srls');
  });

  it('ripiega su «altro» invece di indovinare', () => {
    expect(normalizzaFormaGiuridica('FORMA MAI VISTA')).toBe('altro');
    expect(normalizzaFormaGiuridica(null)).toBe('altro');
  });
});

describe('Normalizzazione dello stato di attività', () => {
  it.each([
    ['ATTIVA', 'attiva'],
    ['CESSATA', 'cessata'],
    ['IN LIQUIDAZIONE', 'in-liquidazione'],
    ['FALLITA', 'fallita'],
    ['SOSPESA', 'sospesa'],
    ['INATTIVA', 'inattiva'],
  ])('riconosce «%s»', (input, atteso) => {
    expect(normalizzaStatoAttivita(input)).toBe(atteso);
  });
});

describe('Mappatura dell’anagrafica', () => {
  it('regge nomi di campo in italiano e in inglese', () => {
    const inglese = mappaAnagrafica(
      {
        legalForm: "SOCIETA' A RESPONSABILITA' LIMITATA",
        atecoCode: '256200',
        shareCapital: 500000,
        employees: 35,
        registeredOffice: { comune: 'Adro', provincia: 'BS', cap: '25030', via: 'Via Industria' },
      },
      'IT-advanced',
      OSSERVATO,
    );

    const italiano = mappaAnagrafica(
      {
        formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA",
        codiceAteco: '25.62.00',
        capitaleSociale: '500.000,00',
        numeroDipendenti: '35',
        sedeLegale: { comune: 'Adro', provincia: 'bs', cap: '25030', via: 'Via Industria' },
      },
      'IT-advanced',
      OSSERVATO,
    );

    expect(inglese.value.formaGiuridica).toBe('srl');
    expect(italiano.value.formaGiuridica).toBe('srl');
    expect(inglese.value.atecoPrimario).toBe('25.62.00');
    expect(italiano.value.atecoPrimario).toBe('25.62.00');
    expect(italiano.value.numeroAddetti).toBe(35);
    // La sigla provincia viene normalizzata in maiuscolo: le regole geografiche vi si appoggiano.
    expect(italiano.value.sedeLegale?.provincia).toBe('BS');
  });

  it('su risposta vuota non inventa nulla e non lancia', () => {
    const risultato = mappaAnagrafica({}, 'IT-start', OSSERVATO);
    expect(risultato.value.atecoPrimario).toBeNull();
    expect(risultato.value.numeroAddetti).toBeNull();
    expect(risultato.value.sedeLegale).toBeNull();
    expect(risultato.value.statoAttivita).toBe('attiva');
  });

  it('conserva la provenienza del dato', () => {
    const risultato = mappaAnagrafica({}, 'IT-advanced', OSSERVATO);
    expect(risultato.source).toEqual({
      kind: 'provider',
      provider: 'OpenAPI.com',
      service: 'IT-advanced',
    });
    expect(risultato.observedAt).toBe(OSSERVATO);
  });
});

describe('Mappatura degli assetti', () => {
  it('riconosce il rappresentante legale dal ruolo', () => {
    const risultato = mappaAssetti(
      {
        managers: [
          { name: 'ROSSI GIOVANNI', role: 'Amministratore Unico' },
          { name: 'BIANCHI ANNA', role: 'Sindaco effettivo' },
        ],
        shareholders: [
          { name: 'ROSSI GIOVANNI', sharePercentage: 60, type: 'persona fisica' },
          { name: 'HOLDING SRL', sharePercentage: 40, type: 'persona giuridica' },
        ],
      },
      'IT-shareholders',
      OSSERVATO,
    );

    expect(risultato.value.cariche[0]?.isRappresentanteLegale).toBe(true);
    expect(risultato.value.cariche[1]?.isRappresentanteLegale).toBe(false);
    expect(risultato.value.soci[1]?.tipo).toBe('persona-giuridica');
    expect(risultato.value.soci[0]?.quotaPercentuale).toBeCloseTo(0.6, 6);
  });

  it('su liste assenti restituisce array vuoti, non errori', () => {
    const risultato = mappaAssetti({}, 'IT-shareholders', OSSERVATO);
    expect(risultato.value.soci).toEqual([]);
    expect(risultato.value.cariche).toEqual([]);
    expect(risultato.value.controllante).toBeNull();
  });
});

describe('Mappatura del bilancio', () => {
  const grezzo = {
    year: 2025,
    closingDate: '31/12/2025',
    employees: 35,
    assets: {
      terreniEFabbricati: 1_450_000,
      impiantiEMacchinario: 980_000,
      attrezzature: 210_000,
      rimanenze: 890_000,
      creditiVersoClienti: 1_640_000,
      disponibilitaLiquide: 380_000,
    },
    liabilities: {
      capitaleSociale: 500_000,
      riserve: 780_000,
      debitiVersoFornitori: 1_420_000,
      debitiBancheBreve: 620_000,
      debitiBancheOltre: 1_150_000,
    },
    incomeStatement: {
      ricaviVendite: 6_480_000,
      costiMateriePrime: 2_850_000,
      costiServizi: 1_180_000,
      salariStipendi: 1_180_000,
      oneriSociali: 420_000,
      ammortamenti: 385_000,
      oneriFinanziari: 92_000,
    },
  };

  it('mappa le voci e le rende riclassificabili', () => {
    const bilancio = mappaBilancio(grezzo);
    expect(bilancio).not.toBeNull();

    const riclassificato = reclassify(bilancio!);
    expect(Money.toEuro(riclassificato.ce.ricavi)).toBe(6_480_000);
    // Valore aggiunto = 6.480.000 − (2.850.000 + 1.180.000) = 2.450.000
    expect(Money.toEuro(riclassificato.ce.valoreAggiunto)).toBe(2_450_000);
    expect(Money.toEuro(riclassificato.ce.ebitda)).toBe(2_450_000 - 1_600_000);
    expect(riclassificato.numeroDipendenti).toBe(35);
  });

  it('interpreta la data di chiusura in formato italiano', () => {
    const bilancio = mappaBilancio(grezzo);
    expect(bilancio?.dataChiusura.getUTCMonth()).toBe(11);
    expect(bilancio?.dataChiusura.getUTCDate()).toBe(31);
  });

  it('le voci assenti valgono zero: in un bilancio è la lettura corretta', () => {
    const bilancio = mappaBilancio({ year: 2025, assets: {}, liabilities: {}, incomeStatement: {} });
    expect(bilancio).not.toBeNull();
    expect(Money.toEuro(bilancio!.attivo.rimanenze)).toBe(0);
    expect(isBilancioQuadrato(reclassify(bilancio!))).toBe(true);
  });

  it('senza anno di esercizio il bilancio non è utilizzabile', () => {
    expect(mappaBilancio({ assets: {} })).toBeNull();
  });

  it('accetta lo schema piatto, senza sezioni annidate', () => {
    const piatto = { anno: 2024, ricaviVendite: 1_000_000, rimanenze: 50_000, capitaleSociale: 10_000 };
    const bilancio = mappaBilancio(piatto);
    expect(Money.toEuro(bilancio!.contoEconomico.ricaviVendite)).toBe(1_000_000);
    expect(Money.toEuro(bilancio!.attivo.rimanenze)).toBe(50_000);
  });
});

describe('Mappatura degli eventi negativi', () => {
  it('classifica i pregiudizievoli dalla descrizione', () => {
    const risultato = mappaEventiNegativi(
      { protests: [{ date: '14/09/2021', amount: 12_400, type: 'Cambiale', settled: 'SI' }] },
      {
        prejudicials: [
          { date: '2023-03-01', description: 'Ipoteca giudiziale su immobile' },
          { date: '2024-01-15', description: 'Pignoramento presso terzi' },
          { date: '2024-06-01', description: 'Decreto ingiuntivo' },
        ],
        procedures: [{ type: 'Concordato preventivo', openingDate: '2025-02-01' }],
      },
      'IT-protests',
      OSSERVATO,
    );

    expect(risultato.value.protesti[0]?.levato).toBe(true);
    expect(Money.toEuro(risultato.value.protesti[0]!.importo)).toBe(12_400);
    expect(risultato.value.pregiudizievoli.map((p) => p.tipo)).toEqual([
      'ipoteca-giudiziale',
      'pignoramento',
      'decreto-ingiuntivo',
    ]);
    expect(risultato.value.procedure[0]?.tipo).toBe('concordato-preventivo');
    // Nessuna data di chiusura significa procedura ancora aperta: forza lo score a ≤ 10.
    expect(risultato.value.procedure[0]?.aperta).toBe(true);
  });

  it('scarta le voci prive di data invece di inventarne una', () => {
    const risultato = mappaEventiNegativi(
      { protests: [{ amount: 5_000 }, { date: '01/01/2024', amount: 1_000 }] },
      {},
      'IT-protests',
      OSSERVATO,
    );
    expect(risultato.value.protesti).toHaveLength(1);
  });
});

describe('Mappatura delle unità locali', () => {
  it('classifica il tipo di unità dalla descrizione', () => {
    const risultato = mappaUnitaLocali(
      {
        localUnits: [
          { type: 'Sede legale', address: { comune: 'Adro', provincia: 'BS', via: 'Via A' } },
          { type: 'Deposito merci', address: { comune: 'Erbusco', provincia: 'BS', via: 'Via B' } },
          { type: 'Punto vendita', address: { comune: 'Brescia', provincia: 'BS', via: 'Via C' } },
        ],
      },
      'IT-local-units',
      OSSERVATO,
    );

    expect(risultato.value.map((u) => u.tipo)).toEqual(['sede-legale', 'magazzino', 'punto-vendita']);
  });

  it('scarta le unità senza indirizzo utilizzabile', () => {
    const risultato = mappaUnitaLocali({ localUnits: [{ type: 'Ufficio' }] }, 'IT-local-units', OSSERVATO);
    expect(risultato.value).toHaveLength(0);
  });
});
