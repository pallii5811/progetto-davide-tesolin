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

/**
 * La compagine dimostrativa è scritta nella scala che tutto il resto usa.
 *
 * La fixture dichiarava le quote come frazioni — 0,6 e 0,4 — mentre le soglie del motore
 * (SOGLIA_CONTROLLO = 50, SOGLIA_PARTECIPAZIONE = 25) e tutte e sei le schermate che
 * stampano una quota usano i punti percentuali.
 *
 * Attenzione a cosa questo controllo prova e cosa NON prova, perché la prima volta la
 * conclusione sbagliata l'ho tratta io. La divergenza di scala **non** impediva di
 * riconoscere il socio maggioritario: `analizzaAssetto` normalizza per conto suo, e con
 * 0,6 il tipo di controllo usciva già corretto. Il danno era un altro e più sottile — due
 * grafie della stessa cosa che convivono, ciascuna corretta solo grazie a un adattatore
 * che qualcuno deve ricordarsi di attraversare. È così che è nato il difetto della scheda
 * di ricerca, dove un `* 100` di troppo mostrava il socio unico come «10000,00 %».
 *
 * Qui si tiene ferma la convenzione — punti percentuali — così che l'adattatore diventi
 * una rete e non un requisito.
 */
describe('Le quote dimostrative sono nella scala che il motore confronta', () => {
  const profilo = demoCompanyProfile();
  const soci = profilo.assetti?.value.soci ?? [];

  it('la compagine non è vuota, altrimenti non si sta controllando niente', () => {
    expect(soci.length).toBeGreaterThan(0);
  });

  it('le quote sono in punti percentuali, non in frazioni', () => {
    const somma = soci
      .map((s) => s.quotaPercentuale)
      .filter((q): q is number => q !== null)
      .reduce((t, q) => t + q, 0);

    expect(
      somma,
      `le quote dimostrative sommano a ${somma}. Il motore le confronta con 50 e 25, che sono ` +
        'punti percentuali: scritte come frazioni nessuna soglia scatta mai.',
    ).toBeGreaterThan(1.01);
  });

  it('e il socio maggioritario viene effettivamente riconosciuto', () => {
    const analisi = analyzeCompany(profilo, demoPolizze(), DEMO_AS_OF);
    expect(
      analisi.assetto.tipoControllo,
      'il socio al 60 % non risulta maggioritario: la scala delle quote non è quella che il motore confronta',
    ).toBe('maggioranza-persona-fisica');
  });

  it('la quota del primo socio arriva al motore in punti, non in frazioni', () => {
    /*
      Il controllo sopra guarda la conseguenza; questo guarda il numero. Servono
      entrambi: se un domani il tipo di controllo venisse dedotto per un'altra via,
      quello resterebbe verde mentre la quota torna sbagliata.
    */
    const analisi = analyzeCompany(profilo, demoPolizze(), DEMO_AS_OF);
    expect(analisi.assetto.quotaPrimoSocio).toBe(60);
  });
});
