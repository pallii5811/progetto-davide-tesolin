import { describe, expect, it } from 'vitest';
import {
  sismicaDelComune,
  territorialExposure,
  territorialExposureDi,
  conIdraulicaPuntuale,
  normalizzaComune,
} from '../src/risk/geo.js';
import { sismicaComunale } from '../src/risk/data/sismica-comunale.js';
import { analizzaUbicazioni } from '../src/company/ubicazioni.js';
import type { Indirizzo } from '../src/company/profile.js';

function indirizzo(parziale: Partial<Indirizzo> & Pick<Indirizzo, 'comune' | 'provincia'>): Indirizzo {
  return {
    via: parziale.via ?? 'Via prova',
    civico: parziale.civico ?? '1',
    cap: parziale.cap ?? '00000',
    comune: parziale.comune,
    provincia: parziale.provincia,
    regione: parziale.regione ?? null,
    frazione: parziale.frazione ?? null,
    latitudine: parziale.latitudine ?? null,
    longitudine: parziale.longitudine ?? null,
  };
}

describe('Sismica comunale Protezione Civile', () => {
  it('il ripiego provinciale su MI resta null (non inventa zona 4)', () => {
    expect(territorialExposure('MI').sismica).toBeNull();
  });

  it('Milano (comune) è zona 3 → media; Abbiategrasso zona 4 → bassa; L’Aquila zona 1 → alta', () => {
    expect(territorialExposureDi({ provincia: 'MI', comune: 'Milano' }).sismica).toBe('media');
    expect(territorialExposureDi({ provincia: 'MI', comune: 'Abbiategrasso' }).sismica).toBe('bassa');
    expect(territorialExposureDi({ provincia: 'AQ', comune: "L'Aquila" }).sismica).toBe('alta');
    expect(sismicaDelComune("L'Aquila", 'AQ')).toBe('alta');
  });

  it('due comuni stessa provincia possono divergere', () => {
    const milano = territorialExposureDi({ provincia: 'MI', comune: 'Milano' });
    const abbiate = territorialExposureDi({ provincia: 'MI', comune: 'Abbiategrasso' });
    expect(milano.sismica).not.toBe(abbiate.sismica);
    expect(milano.sismicaComunale).toBe(true);
    expect(abbiate.sismicaComunale).toBe(true);
  });

  it('comune sconosciuto ripiega sulla provincia senza inventare', () => {
    const e = territorialExposureDi({ provincia: 'MI', comune: 'ComuneInesistenteXYZ' });
    expect(e.sismica).toBeNull();
    expect(e.sismicaComunale).toBeUndefined();
  });

  it('conIdraulicaPuntuale non inventa se ISPRA tace', () => {
    const base = territorialExposureDi({ provincia: 'MI', comune: 'Milano' });
    expect(conIdraulicaPuntuale(base, null).idraulica).toBe(base.idraulica);
    expect(conIdraulicaPuntuale(base, 'media').idraulica).toBe('media');
  });

  it('analizzaUbicazioni espone sismiche diverse su due comuni MI', () => {
    const a = analizzaUbicazioni({
      sedeLegale: indirizzo({
        comune: 'Milano',
        provincia: 'MI',
        via: 'Via A',
        latitudine: 45.46,
        longitudine: 9.19,
      }),
      unitaLocali: [
        {
          tipo: 'stabilimento',
          attivita: null,
          addetti: null,
          indirizzo: indirizzo({
            comune: 'Abbiategrasso',
            provincia: 'MI',
            via: 'Via B',
            latitudine: 45.4,
            longitudine: 8.91,
          }),
        },
      ],
      immobili: [],
    });
    const livelli = new Set(a.ubicazioni.map((u) => u.esposizione.sismica));
    expect(livelli.has('media')).toBe(true);
    expect(livelli.has('bassa')).toBe(true);
    expect(a.note.some((n) => /comunale/i.test(n))).toBe(true);
  });
});

describe('Il dataset comunale e la normalizzazione di runtime sono la stessa cosa', () => {
  it('ogni chiave generata è un punto fisso di normalizzaComune', () => {
    // Il generatore usa la funzione di runtime, non una copia: se qualcuno le separasse di
    // nuovo, un comune con apostrofo o accento cadrebbe in silenzio sul ripiego provinciale.
    const chiavi = Object.keys(sismicaComunale.livelli);
    expect(chiavi.length).toBeGreaterThan(7000);
    const instabili = chiavi.filter((k) => {
      const [sigla, comune] = k.split('|');
      return `${sigla}|${normalizzaComune(comune ?? '')}` !== k;
    });
    expect(instabili).toEqual([]);
  });
});
