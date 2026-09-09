import { describe, expect, it } from 'vitest';
import { frasiIdrogeo, livelloFrana, livelloIdraulico } from '../src/risk/idrogeo.js';
import type { IndicatoriIdrogeo } from '../src/risk/idrogeo.js';

/**
 * La pericolosità idraulica e da frana del comune: la misura, e la convenzione.
 *
 * Ciò che va tenuto fermo non è il valore delle soglie — quelle sono una scelta di questo
 * prodotto e possono cambiare — ma tre proprietà che, se saltano, rendono il numero
 * ingannevole invece che approssimato:
 *
 *  1. la percentuale compare SEMPRE accanto alla parola, perché la parola è convenzione;
 *  2. zero imprese esposte si dice come misura, non come assenza di dato;
 *  3. il limite comunale si ripete accanto al numero, non solo in fondo alla pagina.
 */
const vuoto: IndicatoriIdrogeo = { idrA: 0, idrM: 0, impIdrA: 0, impIdrM: 0, frnA: 0, impFrnA: 0 };

describe('Il livello idraulico legge le imprese, non il territorio', () => {
  it('sale ad «alta» quando molte imprese stanno in area a pericolosità elevata', () => {
    expect(livelloIdraulico({ ...vuoto, impIdrA: 22 })).toBe('alta');
  });

  it('sale ad «alta» anche con la sola cumulata, quando l’area media è vastissima', () => {
    /*
      Un comune può essere esposto in due modi diversi: una piccola area molto pericolosa
      dove però stanno le fabbriche, oppure una grande area mediamente pericolosa. Una
      soglia sola vedrebbe il primo e mancherebbe il secondo.
    */
    expect(livelloIdraulico({ ...vuoto, impIdrA: 1, impIdrM: 45 })).toBe('alta');
  });

  it('resta «bassa» quando nessuna impresa è in area mappata', () => {
    expect(livelloIdraulico(vuoto)).toBe('bassa');
  });

  it('il territorio da solo non muove il livello: contano le imprese', () => {
    // Metà del comune in pericolosità elevata, ma nessuna impresa lì dentro: per un
    // assicuratore che deve dire se QUESTA impresa è esposta, il primo numero non serve.
    expect(livelloIdraulico({ ...vuoto, idrA: 50, idrM: 30 })).toBe('bassa');
  });
});

describe('Le frane hanno una sola classe, e soglie proprie', () => {
  it('una impresa su dieci in area elevata è «alta»', () => {
    expect(livelloFrana({ ...vuoto, impFrnA: 12 })).toBe('alta');
  });

  it('una su cinquanta è «media», non «bassa»', () => {
    expect(livelloFrana({ ...vuoto, impFrnA: 2.5 })).toBe('media');
  });

  it('zero è «bassa» misurata', () => {
    expect(livelloFrana(vuoto)).toBe('bassa');
  });
});

describe('Le frasi portano il numero accanto alla parola', () => {
  it('la percentuale compare, perché la parola è una convenzione e il numero è il dato', () => {
    const frasi = frasiIdrogeo({ ...vuoto, impIdrA: 18.4, impIdrM: 7, impFrnA: 3.2 }, 'RAVENNA');
    const testo = frasi.join(' ');
    expect(testo).toContain('18,4 %');
    expect(testo).toContain('7 %');
    expect(testo).toContain('3,2 %');
    expect(testo).toContain('RAVENNA');
  });

  it('zero imprese esposte si dice come misura, non come assenza di dato', () => {
    const testo = frasiIdrogeo(vuoto, 'AGNOSINE').join(' ');
    expect(testo).toMatch(/nessuna impresa di AGNOSINE risulta in area a pericolosità idraulica/);
    expect(testo).toMatch(/nessuna impresa di AGNOSINE risulta in area a pericolosità da frana/);
    // «non determinata» sarebbe un'altra cosa, e non deve comparire.
    expect(testo).not.toMatch(/non determinat|non disponibil|sconosciut/i);
  });

  it('il limite comunale sta accanto al numero, non solo in fondo alla pagina', () => {
    for (const ind of [vuoto, { ...vuoto, impIdrA: 30, impFrnA: 20 }]) {
      const testo = frasiIdrogeo(ind, 'MILANO').join(' ');
      expect(testo).toMatch(/dato del comune, non della sede/);
      expect(testo).toMatch(/verifica sull’indirizzo resta necessaria/);
    }
  });

  it('le percentuali non escono con il punto decimale inglese', () => {
    // Una pagina che scrive «1,37» e poi «18.4 %» sembra tradotta da un'altra lingua.
    const testo = frasiIdrogeo({ ...vuoto, impIdrA: 18.4, impIdrM: 2.5, impFrnA: 0.7 }, 'ADRO').join(' ');
    expect(testo).not.toMatch(/\d\.\d/);
  });
});
