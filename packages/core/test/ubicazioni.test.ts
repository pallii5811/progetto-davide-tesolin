/**
 * Ubicazioni: dove l'impresa sta davvero.
 *
 * Il difetto che questi test presidiano non è un errore di calcolo, è un errore di
 * modello: ridurre l'azienda al suo indirizzo di sede legale. Un'impresa con la sede a
 * Milano e lo stabilimento in Irpinia risultava a rischio sismico basso; due capannoni
 * contigui e due stabilimenti a trecento chilometri producevano lo stesso danno massimo.
 *
 * La distinzione fra i due raggruppamenti — contiguità per l'incendio, territorio per il
 * sisma — è la stessa che fa un sottoscrittore, e senza di essa il capitale è sbagliato
 * in eccesso o in difetto a seconda dei casi.
 */

import { describe, expect, it } from 'vitest';
import { RAGGIO_COMPLESSO_METRI, analizzaUbicazioni, distanzaMetri } from '../src/company/ubicazioni.js';
import type { Indirizzo, ImmobileDichiarato, UnitaLocale } from '../src/company/profile.js';

function indirizzo(
  parziale: Partial<Indirizzo> & Pick<Indirizzo, 'via' | 'comune' | 'provincia'>,
): Indirizzo {
  return {
    civico: null,
    cap: '00000',
    regione: null,
    latitudine: null,
    longitudine: null,
    ...parziale,
  };
}

const MILANO = indirizzo({
  via: 'VIA CERVA',
  civico: '4',
  comune: 'MILANO',
  provincia: 'MI',
  latitudine: 45.4637,
  longitudine: 9.19837,
});

/** Circa 150 m da MILANO: dentro il raggio di contiguità. */
const MILANO_ACCANTO = indirizzo({
  via: 'VIA BORGOGNA',
  civico: '2',
  comune: 'MILANO',
  provincia: 'MI',
  latitudine: 45.46505,
  longitudine: 9.19837,
});

/** Stesso comune ma lontano: un incendio no, un sisma sì. */
const MILANO_LONTANO = indirizzo({
  via: 'VIA RIPAMONTI',
  civico: '200',
  comune: 'MILANO',
  provincia: 'MI',
  latitudine: 45.4262,
  longitudine: 9.2038,
});

const AVELLINO = indirizzo({
  via: 'ZONA INDUSTRIALE',
  comune: 'AVELLINO',
  provincia: 'AV',
  latitudine: 40.9145,
  longitudine: 14.7906,
});

function unitaLocale(ind: Indirizzo): UnitaLocale {
  return { tipo: 'stabilimento', indirizzo: ind, attivita: null, addetti: 12 };
}

function immobile(ind: Indirizzo | null, superficieMq: number | null = null): ImmobileDichiarato {
  return {
    descrizione: 'Capannone',
    indirizzo: ind,
    superficieMq,
    titolo: 'proprieta',
    tipologiaCostruttiva: null,
    annoCostruzione: null,
    presenzaImpiantoAntincendio: null,
    presenzaAllarme: null,
    compartimentazioneREI: null,
    presenzaSprinkler: null,
  } as ImmobileDichiarato;
}

describe('Distanza fra due punti', () => {
  it('misura in metri, non in gradi', () => {
    const d = distanzaMetri(
      { latitudine: 45.4637, longitudine: 9.19837 },
      { latitudine: 45.46505, longitudine: 9.19837 },
    );
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(180);
  });

  it('riconosce la distanza fra Milano e Avellino', () => {
    const d = distanzaMetri(
      { latitudine: 45.4637, longitudine: 9.19837 },
      { latitudine: 40.9145, longitudine: 14.7906 },
    );
    // Circa 690 km in linea d'aria: la tolleranza copre l'approssimazione sferica.
    expect(d / 1000).toBeGreaterThan(650);
    expect(d / 1000).toBeLessThan(730);
  });

  it('è zero fra un punto e se stesso', () => {
    const p = { latitudine: 45.4637, longitudine: 9.19837 };
    expect(distanzaMetri(p, p)).toBeCloseTo(0, 6);
  });
});

describe('Raccolta e deduplicazione', () => {
  it('raccoglie sede legale, unità locali e immobili rilevati', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(AVELLINO)],
      immobili: [immobile(MILANO_LONTANO, 1_200)],
    });

    expect(a.ubicazioni).toHaveLength(3);
    expect(a.province.sort()).toEqual(['AV', 'MI']);
  });

  it('non conta due volte lo stesso indirizzo che arriva da fonti diverse', () => {
    // Il caso reale: la visura dà la sede legale, l'intervista rileva lo stesso immobile.
    // Contarlo due volte raddoppierebbe il capitale fabbricati.
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [],
      immobili: [immobile({ ...MILANO, via: 'via cerva' }, 800)],
    });

    expect(a.ubicazioni).toHaveLength(1);
    expect(a.ubicazioni[0]?.origini).toContain('sede-legale');
    expect(a.ubicazioni[0]?.origini).toContain('immobile-rilevato');
    // Il dato rilevato in intervista arricchisce quello camerale invece di sostituirlo.
    expect(a.ubicazioni[0]?.superficieMq).toBe(800);
  });

  it('ignora gli immobili senza indirizzo invece di inventarne uno', () => {
    const a = analizzaUbicazioni({ sedeLegale: MILANO, unitaLocali: [], immobili: [immobile(null)] });
    expect(a.ubicazioni).toHaveLength(1);
  });
});

describe('Contiguità: cosa può bruciare insieme', () => {
  it('unisce in un solo complesso le ubicazioni entro il raggio', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(MILANO_ACCANTO)],
      immobili: [],
    });

    expect(a.complessiIncendio).toHaveLength(1);
    expect(a.unicoComplesso).toBe(true);
  });

  it('tiene separate le ubicazioni lontane, anche nello stesso comune', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(MILANO_LONTANO)],
      immobili: [],
    });

    // Quattro chilometri: nessun incendio li attraversa. Trattarli come un unico
    // complesso gonfierebbe il danno massimo del quindici per cento.
    expect(a.complessiIncendio).toHaveLength(2);
    expect(a.unicoComplesso).toBe(false);
  });

  it('propaga la contiguità in modo transitivo', () => {
    // A-B vicine, B-C vicine, A-C lontane: restano un complesso solo, perché è così
    // che si propaga un incendio lungo una fila di capannoni.
    const meta = indirizzo({
      via: 'VIA DI MEZZO',
      comune: 'MILANO',
      provincia: 'MI',
      latitudine: 45.46505,
      longitudine: 9.19837,
    });
    const fondo = indirizzo({
      via: 'VIA IN FONDO',
      comune: 'MILANO',
      provincia: 'MI',
      latitudine: 45.4664,
      longitudine: 9.19837,
    });

    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(meta), unitaLocale(fondo)],
      immobili: [],
    });

    const distanzaEstremi = distanzaMetri(
      { latitudine: 45.4637, longitudine: 9.19837 },
      { latitudine: 45.4664, longitudine: 9.19837 },
    );
    expect(distanzaEstremi).toBeGreaterThan(RAGGIO_COMPLESSO_METRI);
    expect(a.complessiIncendio).toHaveLength(1);
  });

  it('senza coordinate considera l’ubicazione separata, e lo dichiara', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(indirizzo({ via: 'VIA IGNOTA', comune: 'MILANO', provincia: 'MI' }))],
      immobili: [],
    });

    expect(a.complessiIncendio).toHaveLength(2);
    // L'ipotesi va detta: chi legge deve poter correggere.
    expect(a.domande.some((d) => /coordinate/i.test(d))).toBe(true);
  });
});

describe('Territorio: cosa può cadere insieme', () => {
  it('aggrega per comune, non per distanza', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(MILANO_LONTANO)],
      immobili: [],
    });

    // Quattro chilometri separano i due siti per l'incendio, ma un sisma li prende
    // insieme: due complessi incendio, un solo aggregato territoriale.
    expect(a.complessiIncendio).toHaveLength(2);
    expect(a.aggregatiTerritoriali).toHaveLength(1);
  });

  it('sceglie l’ubicazione più esposta, non la sede legale', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(AVELLINO)],
      immobili: [],
    });

    // È il guasto di modello all'origine: la sede amministrativa a Milano nascondeva
    // lo stabilimento in zona sismica.
    expect(a.ubicazionePeggiore?.indirizzo.provincia).toBe('AV');
    expect(a.esposizionePeggiore?.sismica).toBe('alta');
  });

  it('misura la distanza massima fra le ubicazioni', () => {
    const a = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(AVELLINO)],
      immobili: [],
    });

    expect(a.distanzaMassimaKm).not.toBeNull();
    expect(a.distanzaMassimaKm!).toBeGreaterThan(650);
  });
});

describe('Ciò che non si sa', () => {
  it('dichiara la granularità provinciale della classificazione', () => {
    const a = analizzaUbicazioni({ sedeLegale: MILANO, unitaLocali: [], immobili: [] });
    // Attribuire alla stima una precisione comunale che non ha sarebbe il modo più
    // elegante di sbagliare: la nota esiste perché la maglia sia dichiarata.
    expect(a.note.some((n) => /provinciale/i.test(n))).toBe(true);
    expect(a.note.some((n) => /comunale/i.test(n))).toBe(true);
  });

  it('senza alcuna ubicazione lo dice e abbassa la confidenza', () => {
    const a = analizzaUbicazioni({ sedeLegale: null, unitaLocali: [], immobili: [] });

    expect(a.ubicazioni).toHaveLength(0);
    expect(a.confidenza).toBe('bassa');
    expect(a.esposizionePeggiore).toBeNull();
    expect(a.domande.some((d) => /Dove si svolge/i.test(d))).toBe(true);
  });

  it('con una sola ubicazione chiede dei depositi non registrati', () => {
    const a = analizzaUbicazioni({ sedeLegale: MILANO, unitaLocali: [], immobili: [] });
    expect(a.domande.some((d) => /depositi|magazzini|cantieri/i.test(d))).toBe(true);
  });

  it('la confidenza è alta solo quando tutte le ubicazioni sono geolocalizzate', () => {
    const conTutte = analizzaUbicazioni({ sedeLegale: MILANO, unitaLocali: [], immobili: [] });
    expect(conTutte.confidenza).toBe('alta');

    const conUnaCieca = analizzaUbicazioni({
      sedeLegale: MILANO,
      unitaLocali: [unitaLocale(indirizzo({ via: 'VIA IGNOTA', comune: 'LODI', provincia: 'LO' }))],
      immobili: [],
    });
    expect(conUnaCieca.confidenza).toBe('media');
  });
});
