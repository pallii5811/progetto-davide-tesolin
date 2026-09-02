import { describe, expect, it } from 'vitest';
import { mappaUnitaLocali } from '../src/openapi/mapper.js';

/**
 * La virgola in coda alla via.
 *
 * Da `allOffices` la sede arriva a volte come «LOCALITA' LOC. FONDI ZONA INDUSTRIALE 102,»
 * — civico dentro la via, virgola dopo. L'etichetta dell'ubicazione aggiunge la propria
 * virgola prima del comune, e la scheda stampava «102,, AGNOSINE (BS)». Il separatore del
 * civico non la toccava, perché cerca «, 221» e qui dopo la virgola non c'è niente.
 */
const QUANDO = new Date('2026-09-02T00:00:00Z');

function via(unita: unknown): { via: string; civico: string | null } {
  const mappate = mappaUnitaLocali({ localUnits: [unita] }, 'IT-full', QUANDO).value;
  const prima = mappate[0];
  if (prima === undefined) throw new Error('nessuna unità locale mappata');
  return { via: prima.indirizzo.via, civico: prima.indirizzo.civico };
}

describe('La via non tiene la virgola in coda', () => {
  it('dal campo composto, con il civico dentro e la virgola dopo', () => {
    const esito = via({
      address: {
        streetName: "LOCALITA' LOC. FONDI ZONA INDUSTRIALE 102,",
        town: 'AGNOSINE',
        province: 'BS',
      },
    });
    expect(esito.via).toBe("LOCALITA' LOC. FONDI ZONA INDUSTRIALE 102");
    expect(esito.civico).toBeNull();
  });

  it('dai pezzi separati, quando è il nome della via a portarla', () => {
    const esito = via({ address: { toponym: 'VIA', street: 'DENTI 26,', town: 'FIESSE', province: 'BS' } });
    expect(esito.via).toBe('VIA DENTI 26');
  });

  it('e il civico dopo la virgola continua a essere separato come prima', () => {
    const esito = via({
      address: { streetName: 'VIALE FILIPPO TOMMASO MARINETTI, 221', town: 'ROMA', province: 'RM' },
    });
    expect(esito.via).toBe('VIALE FILIPPO TOMMASO MARINETTI');
    expect(esito.civico).toBe('221');
  });

  it('anche con una virgola in coda dopo il civico', () => {
    const esito = via({ address: { streetName: 'VIA ROMA, 6,', town: 'TERNI', province: 'TR' } });
    expect(esito.via).toBe('VIA ROMA');
    expect(esito.civico).toBe('6');
  });
});
