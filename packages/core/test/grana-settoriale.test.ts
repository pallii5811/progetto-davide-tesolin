import { describe, expect, it } from 'vitest';
import { predicates } from '../src/risk/rules.js';
import { ESPOSIZIONE_SETTORIALE } from '../src/risk/data/esposizione-settoriale.js';
import type { CompanyFacts } from '../src/company/facts.js';

/**
 * Il settore gradua il rischio, invece di dividerlo in due.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * Il rischio incendio si modulava su un elenco di ventidue divisioni ATECO, tutte uguali
 * fra loro: dentro l'elenco +1, fuori niente. Messo accanto a un catalogo settoriale che
 * gradua le stesse ventidue da 4 a 7 su 7, il difetto si vede in due direzioni.
 *
 * Dentro: un impianto chimico (classe 7) e un laboratorio di confezioni (classe 4)
 * prendevano la stessa identica modulazione.
 *
 * Fuori, e pesa di più: trentadue divisioni con pericolosità da 4 a 5 non prendevano nulla.
 * Fra queste il **magazzinaggio e deposito** — la divisione 52, il cui mestiere è
 * precisamente il capannone pieno di merce — e le costruzioni. Il motore le trattava come
 * uno studio di consulenza.
 *
 * ── LA PROPRIETÀ CHE VA TENUTA FERMA ─────────────────────────────────────────
 *
 * Nessuna impresa perde modulazione: la soglia bassa è 4 e le ventidue divisioni di prima
 * stanno tutte fra 4 e 7. Il cambiamento aggiunge grana, non toglie protezione — e questo
 * si verifica sulla tabella intera, non su un campione.
 */

const { classeSettoriale } = predicates;

function conAteco(atecoDivisione: string | null): CompanyFacts {
  return { atecoDivisione } as unknown as CompanyFacts;
}

/** Le ventidue divisioni che il motore trattava come un unico gruppo indistinto. */
const PRODUTTIVE_DI_IERI = [
  '10',
  '11',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
];

describe('Nessuna impresa perde modulazione', () => {
  it('tutte e ventidue le divisioni di ieri restano sopra la soglia bassa', () => {
    /*
      È la sola proprietà che rende sicuro il cambiamento: se una sola scendesse sotto 4,
      un'impresa già analizzata vedrebbe il proprio rischio incendio ABBASSARSI senza che
      nulla di lei sia cambiato — e non c'è modo di spiegarlo a chi ha in mano la scheda
      di ieri.
    */
    for (const divisione of PRODUTTIVE_DI_IERI) {
      const classe = ESPOSIZIONE_SETTORIALE[divisione]?.incendio;
      expect(classe, `divisione ${divisione} assente dalla tabella`).toBeDefined();
      expect(classeSettoriale(conAteco(divisione), 'incendio', 4), `divisione ${divisione}`).toBe(true);
    }
  });

  it('la tabella copre tutte le divisioni ATECO 2025, e solo con punteggi da 1 a 7', () => {
    const voci = Object.entries(ESPOSIZIONE_SETTORIALE);
    expect(voci).toHaveLength(87);
    for (const [divisione, e] of voci) {
      expect(divisione, 'la divisione è un identificatore a due cifre, zero iniziale compreso').toMatch(
        /^[0-9]{2}$/,
      );
      for (const valore of Object.values(e)) {
        expect(valore).toBeGreaterThanOrEqual(1);
        expect(valore).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe('Adesso il settore distingue dove prima non distingueva', () => {
  it('la chimica prende due gradini, le confezioni uno solo', () => {
    expect(classeSettoriale(conAteco('20'), 'incendio', 4)).toBe(true);
    expect(classeSettoriale(conAteco('20'), 'incendio', 6)).toBe(true);

    expect(classeSettoriale(conAteco('14'), 'incendio', 4)).toBe(true);
    expect(classeSettoriale(conAteco('14'), 'incendio', 6)).toBe(false);
  });

  it('il magazzinaggio adesso si accende: prima non prendeva niente', () => {
    // Divisione 52, «Magazzinaggio, deposito e attività di supporto ai trasporti».
    expect(PRODUTTIVE_DI_IERI).not.toContain('52');
    expect(classeSettoriale(conAteco('52'), 'incendio', 4)).toBe(true);
  });

  it('lo studio di software resta basso sull’incendio e alto sui dati', () => {
    expect(classeSettoriale(conAteco('62'), 'incendio', 4)).toBe(false);
    expect(classeSettoriale(conAteco('62'), 'sensibilitaDati', 6)).toBe(true);
  });

  it('il commercio al dettaglio è basso sui dati e alto sulle transazioni', () => {
    expect(classeSettoriale(conAteco('47'), 'sensibilitaDati', 6)).toBe(false);
    expect(classeSettoriale(conAteco('47'), 'esposizioneTransazioni', 6)).toBe(true);
  });
});

describe('Ciò che non si sa resta non saputo', () => {
  it('senza codice di attività il verdetto è «ignoto», non «no»', () => {
    expect(classeSettoriale(conAteco(null), 'incendio', 4)).toBe('ignoto');
    expect(classeSettoriale(conAteco(null), 'sensibilitaDati', 6)).toBe('ignoto');
  });

  it('una divisione fuori catalogo è «ignoto», non zero', () => {
    // La 45 non esiste in ATECO 2025: il commercio di autoveicoli è confluito in 46 e 47.
    expect(classeSettoriale(conAteco('45'), 'incendio', 4)).toBe('ignoto');
  });
});
