/**
 * Capacità e propensione: quanto l'impresa può e quanto vuole tenersi.
 *
 * Il punto delicato è che sono due cose diverse. La capacità si legge nel bilancio; la
 * propensione si chiede. Confonderle significherebbe decidere al posto dell'imprenditore —
 * ed è esattamente ciò che un'analisi ISO 31000 non deve fare.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';
import { valutaRitenzione } from '../src/risk/ritenzione.js';
import type { BilancioRiclassificato } from '../src/company/financials.js';

/** Impresa solida: patrimonio 2 M€, EBITDA 600 k€, cassa 400 k€. */
function bilancio(modifiche: {
  patrimonioNetto?: number;
  ebitda?: number;
  liquiditaImmediate?: number;
}): BilancioRiclassificato {
  return {
    sp: {
      patrimonioNetto: Money.euro(modifiche.patrimonioNetto ?? 2_000_000),
      liquiditaImmediate: Money.euro(modifiche.liquiditaImmediate ?? 400_000),
    },
    ce: { ebitda: Money.euro(modifiche.ebitda ?? 600_000) },
  } as unknown as BilancioRiclassificato;
}

describe('La capacità si legge nel bilancio', () => {
  it('prende il vincolo più stringente, non la media', () => {
    // 3% di 2 M€ = 60 k€ · 10% di 600 k€ = 60 k€ · 15% di 100 k€ = 15 k€.
    const esito = valutaRitenzione(bilancio({ liquiditaImmediate: 100_000 }), 'equilibrata');

    expect(esito.value?.vincoloAttivo).toBe('liquidità');
    expect(Money.toEuro(esito.value!.perSinistro)).toBe(15_000);
  });

  it('quando il limite è la cassa lo dice, e spiega perché', () => {
    const esito = valutaRitenzione(bilancio({ liquiditaImmediate: 50_000 }), 'equilibrata');

    // Un'impresa redditizia ma senza cassa non paga un sinistro con l'EBITDA.
    expect(esito.explanation.notes.join(' ')).toMatch(/cassa|soldi subito/i);
  });

  it('un patrimonio negativo non produce capacità negativa', () => {
    const esito = valutaRitenzione(bilancio({ patrimonioNetto: -500_000 }), 'equilibrata');

    expect(Money.toEuro(esito.value!.perSinistro)).toBe(0);
    expect(esito.value?.effettoAtteso).toMatch(/non lasciano margine|minimo/i);
  });

  it('senza bilancio non propone franchigie', () => {
    const esito = valutaRitenzione(null, 'incline-a-ritenere');

    // Proporre una franchigia senza sapere cosa l'impresa regge sposta il rischio sul
    // cliente, e la propensione dichiarata non basta a colmare il vuoto.
    expect(esito.value).toBeNull();
    expect(esito.confidence).toBe('bassa');
  });
});

describe('La propensione si chiede, non si deduce', () => {
  it('modula la capacità nelle due direzioni', () => {
    const prudente = valutaRitenzione(bilancio({}), 'prudente');
    const equilibrata = valutaRitenzione(bilancio({}), 'equilibrata');
    const incline = valutaRitenzione(bilancio({}), 'incline-a-ritenere');

    expect(prudente.value!.perSinistro).toBeLessThan(equilibrata.value!.perSinistro);
    expect(incline.value!.perSinistro).toBeGreaterThan(equilibrata.value!.perSinistro);
  });

  it('non dichiarata: ipotesi prudente e confidenza bassa', () => {
    const esito = valutaRitenzione(bilancio({}), null);

    // Una franchigia proposta su una propensione presunta non è documentazione di
    // adeguatezza: è un'assunzione travestita da consulenza, e va dichiarata come tale.
    expect(esito.value?.propensione).toBe('prudente');
    expect(esito.confidence).toBe('bassa');
    expect(esito.explanation.notes.join(' ')).toMatch(/non dichiarata/i);
  });

  it('dichiarata: la confidenza è alta', () => {
    expect(valutaRitenzione(bilancio({}), 'equilibrata').confidence).toBe('alta');
  });
});

describe('La franchigia proposta', () => {
  it('si arrotonda per difetto', () => {
    const esito = valutaRitenzione(bilancio({ liquiditaImmediate: 77_777 }), 'equilibrata');

    // Arrotondare per eccesso farebbe trattenere più di quanto l'impresa regge: è l'errore
    // opposto alla sottoassicurazione, ma con la stessa vittima.
    expect(esito.value!.franchigiaConsigliata).toBeLessThanOrEqual(esito.value!.perSinistro);
  });

  it('spiega perché alzarla non sposta rischio reale', () => {
    const esito = valutaRitenzione(bilancio({}), 'equilibrata');

    expect(esito.value?.effettoAtteso).toMatch(/senza spostare rischio reale/i);
    // E dichiara anche il limite oltre il quale non conviene più.
    expect(esito.value?.effettoAtteso).toMatch(/sopra, si trattiene/i);
  });

  it('la ritenzione annua è un multiplo, non la somma illimitata', () => {
    const esito = valutaRitenzione(bilancio({}), 'equilibrata');

    // Più sinistri nello stesso esercizio si sommano, e la cassa è una sola.
    expect(esito.value!.annua).toBeGreaterThan(esito.value!.perSinistro);
    expect(Money.toEuro(esito.value!.annua)).toBeLessThan(Money.toEuro(esito.value!.perSinistro) * 5);
  });

  it('cita ISO 31000 e il regolamento IVASS', () => {
    const riferimenti = valutaRitenzione(bilancio({}), 'equilibrata').explanation.references.join(' ');

    expect(riferimenti).toContain('31000');
    expect(riferimenti).toContain('40/2018');
  });
});

describe('Coerenza di formato nei testi discorsivi', () => {
  it('gli importi in prosa non portano i centesimi', () => {
    const esito = valutaRitenzione(bilancio({}), 'equilibrata');

    // La stessa cifra scritta in due modi nello stesso riquadro — «38.000 €» nella scheda
    // e «38.000,00 €» nel testo — è un dettaglio piccolo che a un lettore attento toglie
    // fiducia in tutto il resto. Nelle voci di calcolo i centesimi restano: lì servono a
    // far tornare la somma.
    expect(esito.value?.effettoAtteso).not.toMatch(/\d,\d{2}\s*€/);
  });

  it('le voci di calcolo li mantengono, perché lì si verifica una somma', () => {
    const esito = valutaRitenzione(bilancio({}), 'equilibrata');
    const voci = esito.explanation.inputs.map((i) => i.value).join(' ');

    expect(voci).toMatch(/\d,\d{2}\s*€/);
  });
});
