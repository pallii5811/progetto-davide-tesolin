/**
 * La schermata che si mostra al cliente deve mostrare quello che promette.
 *
 * Le due polizze dimostrative scadevano il 30 giugno 2026, e DEMO_AS_OF è il 17 agosto
 * 2026: erano morte da quarantotto giorni. Non se n'era accorto nessuno perché il motore
 * ignorava le date di scadenza — il difetto della fixture era nascosto da un difetto del
 * codice, e i due si tenevano in piedi a vicenda.
 *
 * Correggendo il motore (una polizza scaduta non è più contata fra le coperture adeguate)
 * è saltata fuori la fixture: la dimostrazione smetteva di mostrare la sottoassicurazione
 * — che è il suo unico scopo — e mostrava due buchi di copertura. Vero, ma non è quello
 * che il venditore sta spiegando in quel momento.
 *
 * Questo presidio esiste perché quel marciume non si ripeta in silenzio. È il caso in cui
 * un dato di prova invecchia mentre nessuno guarda, e il primo ad accorgersene sarebbe il
 * cliente, davanti allo schermo.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, demoCompanyProfile, demoPolizze } from '../src/index.js';
import { analyzeCompany } from '../src/index.js';

describe('Le polizze dimostrative sono vive alla data della dimostrazione', () => {
  const polizze = demoPolizze();

  it('la fixture non è vuota, altrimenti questo controllo non controlla niente', () => {
    // Un test che scorre zero elementi passa sempre, e passa in silenzio.
    expect(polizze.length).toBeGreaterThan(0);
  });

  it.each(polizze.map((p) => [p.id, p] as const))(
    'la polizza %s è in vigore al 17 agosto 2026',
    (_id, polizza) => {
      expect(
        polizza.dataScadenza.getTime(),
        `la polizza ${polizza.id} scade il ${polizza.dataScadenza.toISOString().slice(0, 10)}, ` +
          `prima della data della dimostrazione (${DEMO_AS_OF.toISOString().slice(0, 10)}). ` +
          'Spostare la scadenza in avanti: una polizza morta non mostra la sottoassicurazione.',
      ).toBeGreaterThan(DEMO_AS_OF.getTime());

      expect(
        polizza.dataEffetto.getTime(),
        `la polizza ${polizza.id} decorre dopo la data della dimostrazione: non è ancora in vigore.`,
      ).toBeLessThanOrEqual(DEMO_AS_OF.getTime());
    },
  );
});

describe('E la dimostrazione mostra ancora ciò per cui esiste', () => {
  /*
    Non basta che le polizze siano vive: devono continuare a raccontare la storia. Se un
    domani qualcuno alza la somma assicurata dell'incendio "per far tornare i conti", la
    schermata smette di spiegare la sottoassicurazione e nessun controllo se ne accorge.
  */
  const analisi = analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF);

  it('l’incendio resta sottoassicurato: è la cosa che la schermata spiega', () => {
    const incendio = analisi.gap.gaps.find((g) => g.definition.id === 'incendio');
    expect(incendio, 'nessun gap incendio nella dimostrazione').toBeDefined();
    expect(incendio!.status).toBe('sottoassicurata');
  });

  it('e la RCT resta con il massimale insufficiente', () => {
    const rct = analisi.gap.gaps.find((g) => g.definition.id === 'rct');
    expect(rct, 'nessun gap RCT nella dimostrazione').toBeDefined();
    expect(rct!.status).toBe('massimale-insufficiente');
  });

  it('nessuna copertura dimostrativa risulta assente per scadenza', () => {
    // È il sintomo esatto del marciume: lo stato scivola su assente e la vetrina sparisce.
    const perScadenza = analisi.gap.gaps.filter((g) => g.status === 'assente' && g.polizzaScaduta === true);
    expect(
      perScadenza.map((g) => g.definition.id),
      'una polizza dimostrativa è scaduta: la schermata mostra un buco invece della sottoassicurazione',
    ).toEqual([]);
  });
});
