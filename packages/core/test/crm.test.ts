import { describe, expect, it } from 'vitest';
import {
  ETICHETTE_STATO_CRM,
  PRIORITA_STATO_CRM,
  STATI_CRM,
  applicaFiltroCrm,
  esportaCrmCsv,
  isStatoCrm,
  nomeFileEsportazioneCrm,
  perPrioritaDiIntervento,
  ultimaAttivitaCrm,
} from '../src/index.js';
import type { VoceCrm } from '../src/index.js';

/**
 * Il CRM (17/09/2026, «AEGIS - cambi.pptx»): stati, priorità di intervento, filtro e file.
 *
 * «Questa pagina deve essere un CRM non un tracker assicurativo»: qui si presidia che l'ordine
 * sia quello dichiarato, che il filtro non svuoti per un valore sbagliato, e che nel file non
 * entri nessuna colonna assicurativa.
 */

const GIORNO = 86_400_000;
const OGGI = new Date('2026-09-17T10:00:00Z');

function voce(parziale: Partial<VoceCrm> & Pick<VoceCrm, 'identificativo'>): VoceCrm {
  return {
    denominazione: `Impresa ${parziale.identificativo}`,
    partitaIva: parziale.identificativo,
    comune: null,
    provincia: null,
    atecoDescrizione: null,
    telefono: null,
    pec: null,
    sitoWeb: null,
    stato: 'da-contattare',
    nota: null,
    scoreCredito: null,
    classeCredito: null,
    analizzataIl: null,
    daElencoIl: null,
    statoAggiornatoIl: null,
    aggiuntaIl: new Date(OGGI.getTime() - 30 * GIORNO),
    ...parziale,
  };
}

describe('Gli stati del CRM', () => {
  it('sono cinque, ciascuno con un’etichetta e una priorità', () => {
    expect(STATI_CRM).toEqual([
      'da-contattare',
      'contattata',
      'in-trattativa',
      'cliente',
      'non-interessata',
    ]);
    for (const stato of STATI_CRM) {
      expect(ETICHETTE_STATO_CRM[stato], stato).toMatch(/^[A-Z]/);
      expect(PRIORITA_STATO_CRM[stato], stato).toBeTypeOf('number');
    }
    expect(new Set(Object.values(PRIORITA_STATO_CRM)).size).toBe(STATI_CRM.length);
  });

  it('riconosce solo gli stati veri', () => {
    expect(isStatoCrm('cliente')).toBe(true);
    expect(isStatoCrm('Cliente')).toBe(false);
    expect(isStatoCrm('catnat')).toBe(false);
    expect(isStatoCrm(undefined)).toBe(false);
  });
});

describe('La priorità di intervento', () => {
  it('prima le trattative, poi da contattare, contattate, clienti e non interessate', () => {
    const voci = [
      voce({ identificativo: 'A', stato: 'non-interessata' }),
      voce({ identificativo: 'B', stato: 'cliente' }),
      voce({ identificativo: 'C', stato: 'contattata' }),
      voce({ identificativo: 'D', stato: 'da-contattare' }),
      voce({ identificativo: 'E', stato: 'in-trattativa' }),
    ];
    expect([...voci].sort(perPrioritaDiIntervento).map((v) => v.stato)).toEqual([
      'in-trattativa',
      'da-contattare',
      'contattata',
      'cliente',
      'non-interessata',
    ]);
  });

  it('a parità di stato, in cima l’azienda toccata per ultima', () => {
    const analizzataIeri = voce({ identificativo: 'A', analizzataIl: new Date(OGGI.getTime() - GIORNO) });
    const daElencoOggi = voce({ identificativo: 'B', daElencoIl: OGGI });
    const aggiornataUnaSettimanaFa = voce({
      identificativo: 'C',
      statoAggiornatoIl: new Date(OGGI.getTime() - 7 * GIORNO),
    });

    const ordinate = [aggiornataUnaSettimanaFa, analizzataIeri, daElencoOggi].sort(perPrioritaDiIntervento);
    expect(ordinate.map((v) => v.identificativo)).toEqual(['B', 'A', 'C']);
    expect(ultimaAttivitaCrm(analizzataIeri).getTime()).toBe(OGGI.getTime() - GIORNO);
  });
});

describe('Il filtro per stato', () => {
  const voci = [
    voce({ identificativo: 'A', stato: 'cliente' }),
    voce({ identificativo: 'B', stato: 'in-trattativa' }),
    voce({ identificativo: 'C', stato: 'cliente' }),
  ];

  it('tiene solo lo stato scelto', () => {
    expect(applicaFiltroCrm(voci, 'cliente').map((v) => v.identificativo)).toEqual(['A', 'C']);
  });

  it('un valore sconosciuto o vecchio non svuota l’elenco', () => {
    // «catnat» era un filtro del portafoglio assicurativo: un segnalibro vecchio non deve
    // mostrare un CRM vuoto, che si leggerebbe come clienti persi.
    for (const filtro of ['catnat', 'scoperte', '', undefined, null]) {
      expect(applicaFiltroCrm(voci, filtro), String(filtro)).toHaveLength(3);
    }
  });
});

describe('Il file del CRM', () => {
  const csv = esportaCrmCsv([
    voce({
      identificativo: '03158460174',
      denominazione: 'MECCANICA BRESCIANA S.R.L.',
      comune: 'Adro',
      provincia: 'BS',
      atecoDescrizione: '25.62.00',
      telefono: '+39 030 1234567',
      pec: 'meccanicabresciana@pec.it',
      sitoWeb: 'www.meccanicabresciana.it',
      stato: 'in-trattativa',
      nota: 'Richiamare lunedì; vuole il preventivo',
      scoreCredito: 62,
      classeCredito: 'C',
      analizzataIl: new Date('2026-09-12T08:00:00Z'),
      aggiuntaIl: new Date('2026-09-12T08:00:00Z'),
    }),
    voce({ identificativo: '02413390390', denominazione: 'ADRIATICA LOGISTICA S.R.L.' }),
  ]);
  const righe = csv.replace('﻿', '').trimEnd().split('\r\n');

  it('è per Excel italiano: BOM, punto e virgola, CRLF, celle fra virgolette', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(righe).toHaveLength(3);
    expect(righe[0]).toBe(
      [
        'Denominazione',
        'Partita IVA',
        'Comune',
        'Provincia',
        'Settore',
        'Stato',
        'Nota',
        'Telefono',
        'PEC',
        'Sito web',
        'Score di credito',
        'Classe',
        'Analizzata il',
        'Nel CRM dal',
        'Identificativo',
      ]
        .map((c) => `"${c}"`)
        .join(';'),
    );
  });

  it('porta stato e nota come l’intermediario li ha scritti, e le date in italiano', () => {
    expect(righe[1]).toContain('"In trattativa";"Richiamare lunedì; vuole il preventivo"');
    expect(righe[1]).toContain('"12/09/2026"');
  });

  it('non contiene nessuna colonna assicurativa', () => {
    expect(righe[0]).not.toMatch(/CAT NAT|Coperture|Esposizione|Azione prioritaria|Rischi critici/i);
  });

  it('un’azienda mai analizzata ha celle vuote, non zeri né «null»', () => {
    expect(righe[2]).toContain('"Da contattare";""');
    expect(righe[2]).not.toMatch(/null|undefined/);
    expect(righe[2]).toContain('"";"";""');
  });

  it('il nome del file dice la data e, se c’è, lo stato filtrato', () => {
    expect(nomeFileEsportazioneCrm(OGGI)).toBe('crm-2026-09-17.csv');
    expect(nomeFileEsportazioneCrm(OGGI, 'in-trattativa')).toBe('crm-in-trattativa-2026-09-17.csv');
    expect(nomeFileEsportazioneCrm(OGGI, 'catnat')).toBe('crm-2026-09-17.csv');
  });
});
