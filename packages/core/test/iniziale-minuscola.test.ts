import { describe, expect, it } from 'vitest';
import { inizialeMinuscola } from '../src/shared/testo.js';
import { RISK_CATALOG } from '../src/index.js';

/**
 * Un'etichetta infilata in una frase perde la maiuscola iniziale, non le altre.
 *
 * IL DIFETTO, trovato da `scripts/audit-testo-schermo.ts` mentre inseguiva altro: la
 * motivazione di adeguatezza faceva `label.toLowerCase()` sull'etichetta intera, e sulla
 * scheda di un'impresa vera usciva
 *
 *   «…rischi residui a carico dell'impresa: … responsabilità amministrativa dell'ente
 *    (d.lgs. 231/2001) (rilevante).»
 *
 * `D.Lgs.` è la citazione di una legge. Scritta così è sbagliata su un documento che
 * l'intermediario consegna al cliente e che, davanti a una contestazione, finisce in un
 * fascicolo — dove la prima cosa che un legale guarda sono proprio i riferimenti.
 *
 * Non era un caso isolato: `CAT NAT` diventava `cat nat`, e nel report per il cliente le
 * certificazioni `ISO 9001, 14001, 27001, 45001` diventavano `iso 9001…`.
 */
describe('L’iniziale si abbassa, le sigle no', () => {
  it('la citazione di legge dentro l’etichetta resta in piedi', () => {
    expect(inizialeMinuscola('Responsabilità amministrativa dell’ente (D.Lgs. 231/2001)')).toBe(
      'responsabilità amministrativa dell’ente (D.Lgs. 231/2001)',
    );
  });

  it('una sigla in coda resta una sigla', () => {
    expect(inizialeMinuscola('Inadempimento dell’obbligo assicurativo CAT NAT')).toBe(
      'inadempimento dell’obbligo assicurativo CAT NAT',
    );
  });

  it('le certificazioni non diventano parole comuni', () => {
    expect(inizialeMinuscola('Certificazioni di sistema (ISO 9001, 14001, 27001, 45001)')).toBe(
      'certificazioni di sistema (ISO 9001, 14001, 27001, 45001)',
    );
  });

  it('un’etichetta che COMINCIA con una sigla non si tocca', () => {
    // «rCT» e «d&O» sarebbero peggio del problema di partenza.
    expect(inizialeMinuscola('RCT — Responsabilità civile verso terzi')).toBe(
      'RCT — Responsabilità civile verso terzi',
    );
    expect(inizialeMinuscola('D&O — Responsabilità di amministratori')).toBe(
      'D&O — Responsabilità di amministratori',
    );
    expect(inizialeMinuscola('CAT NAT obbligatoria')).toBe('CAT NAT obbligatoria');
  });

  it('quello che è già minuscolo, e il vuoto, restano com’erano', () => {
    expect(inizialeMinuscola('attacco ransomware')).toBe('attacco ransomware');
    expect(inizialeMinuscola('')).toBe('');
  });

  /*
    Il controllo che vale più di tutti quelli sopra: si applica al catalogo VERO.

    Le prove qui sopra guardano cinque stringhe scelte da me, e resterebbero verdi anche se
    domani entrasse un rischio la cui etichetta contiene una sigla che questa funzione
    rovina. Questo invece scorre tutte le etichette che il prodotto stampa davvero.
  */
  it('su ogni etichetta del catalogo, nulla cambia oltre la prima lettera', () => {
    const rovinate: string[] = [];
    for (const definizione of Object.values(RISK_CATALOG)) {
      const dopo = inizialeMinuscola(definizione.label);
      if (dopo.slice(1) !== definizione.label.slice(1)) rovinate.push(definizione.label);
    }
    expect(rovinate, rovinate.join(' · ')).toEqual([]);
  });
});
