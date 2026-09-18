/**
 * Il freno delle rotte pubbliche (18/09/2026), e le due correzioni della revisione di sicurezza:
 * il tetto complessivo non si cancella con la pulizia, e un IPv6 conta per la sua rete.
 */

import { describe, expect, it } from 'vitest';
import { Limitatore, chiaveIndirizzo } from '../src/limitatore.js';

const ORA = 60 * 60 * 1_000;

describe('Limitatore', () => {
  it('ammette fino al limite nella finestra, poi ferma; fuori dalla finestra riparte', () => {
    const l = new Limitatore();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) expect(l.consenti('k', 3, ORA, t0 + i)).toBe(true);
    expect(l.consenti('k', 3, ORA, t0 + 10)).toBe(false);
    // Un rifiuto non allunga l'attesa: passata l'ora dal primo, si riparte.
    expect(l.consenti('k', 3, ORA, t0 + ORA + 1)).toBe(true);
  });

  it('un limite a zero non frena', () => {
    const l = new Limitatore();
    for (let i = 0; i < 50; i += 1) expect(l.consenti('k', 0, ORA)).toBe(true);
  });

  it('la pulizia sotto attacco non azzera il tetto complessivo', () => {
    const l = new Limitatore();
    const t0 = 5_000_000;
    const globale = `${Limitatore.PREFISSO_GLOBALE}registrazioni`;
    expect(l.consenti(globale, 1, ORA, t0)).toBe(true);
    expect(l.consenti(globale, 1, ORA, t0 + 1)).toBe(false);

    // Ventimila e più indirizzi diversi, tutti nella stessa ora: la pulizia deve togliere chiavi.
    for (let i = 0; i < 20_050; i += 1)
      l.consenti(`conferma:10.0.${i >> 8}.${i & 255}`, 60, ORA, t0 + 2 + i);

    expect(l.consenti(globale, 1, ORA, t0 + 30_000)).toBe(false);
  });
});

describe('La chiave di un indirizzo', () => {
  it('un IPv4 resta sé stesso, anche scritto in forma IPv6', () => {
    expect(chiaveIndirizzo('203.0.113.7')).toBe('203.0.113.7');
    expect(chiaveIndirizzo('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('un IPv6 conta per la sua rete /64, comunque sia scritto', () => {
    const rete = chiaveIndirizzo('2001:db8:abcd:12::1');
    expect(rete).toBe('2001:db8:abcd:12::/64');
    expect(chiaveIndirizzo('2001:0db8:abcd:0012:ffff:ffff:ffff:fffe')).toBe(rete);
    expect(chiaveIndirizzo('2001:db8:abcd:12:1:2:3:4')).toBe(rete);
    expect(chiaveIndirizzo('2001:db8:abcd:13::1')).not.toBe(rete);
    expect(chiaveIndirizzo('::1')).toBe('0:0:0:0::/64');
  });
});
