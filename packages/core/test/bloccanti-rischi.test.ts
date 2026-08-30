/**
 * I difetti bloccanti del motore dei rischi, uno per prova.
 *
 * Hanno tutti la stessa forma: il **registro dei rischi** afferma per conto proprio
 * qualcosa che non gli compete — un perimetro di legge che il motore CAT NAT ha già
 * stabilito, un obbligo che vale per una parte del settore e non per l'intero, una
 * protezione che nessuno ha dichiarato, una misura che la tabella non ha fatto.
 *
 * Ogni prova qui sotto è stata vista fallire sul codice non corretto prima di essere
 * vista passare. Un controllo che non ha mai fallito non è un controllo.
 */

import { describe, expect, it } from 'vitest';

import { assessRisks } from '../src/risk/engine.js';
import { RISK_CATALOG, RISK_RULES } from '../src/index.js';
import { territorialExposure, worstExposure } from '../src/risk/geo.js';
import { raccomandaPrevenzione } from '../src/risk/prevenzione.js';
import { rilevaEventi } from '../src/monitoring/detect.js';
import { deriveFacts } from '../src/company/facts.js';
import { reclassify } from '../src/company/financials.js';
import { DEMO_AS_OF, demoCompanyProfile } from '../src/fixtures/demo.js';
import { parseAteco } from '../src/shared/identifiers.js';
import { DATI_DICHIARATI_VUOTI } from '../src/index.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { AssessRisksOptions } from '../src/risk/engine.js';
import type { RiskId } from '../src/risk/taxonomy.js';
import type { StatoSorvegliato } from '../src/monitoring/state.js';

// ─────────────────────────────────────────────────────────────────────────────
// Apparecchiature
// ─────────────────────────────────────────────────────────────────────────────

const profiloDemo = demoCompanyProfile();
const bilancioDemo = reclassify(profiloDemo.bilanci[0]!.value);
const fattiDemo = deriveFacts(profiloDemo, bilancioDemo, DEMO_AS_OF);

/** I fatti dell'azienda dimostrativa con qualche tratto sostituito. */
function fatti(patch: Partial<CompanyFacts>): CompanyFacts {
  return { ...fattiDemo, ...patch };
}

/**
 * I fatti a **questionario vuoto**: è lo stato normale della prima visita, e quello su
 * cui il documento afferma di più senza sapere niente.
 */
const fattiSenzaIntervista = deriveFacts(
  { ...profiloDemo, datiDichiarati: DATI_DICHIARATI_VUOTI },
  bilancioDemo,
  DEMO_AS_OF,
);

function registro(patch: Partial<CompanyFacts>, options: AssessRisksOptions = {}) {
  return assessRisks(fatti(patch), DEMO_AS_OF, options);
}

function rischio(patch: Partial<CompanyFacts>, id: RiskId, options: AssessRisksOptions = {}) {
  return registro(patch, options).risks.find((r) => r.definition.id === id);
}

/** Il codice ATECO scomposto come lo scompone il prodotto. */
function conAteco(codice: string): Partial<CompanyFacts> {
  const ateco = parseAteco(codice);
  return {
    ateco,
    atecoSezione: fattiDemo.atecoSezione,
    atecoDivisione: codice.slice(0, 2),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 4 — il perimetro CAT NAT sta in un posto solo, e non è il registro
// ─────────────────────────────────────────────────────────────────────────────

describe('4 · Il registro dei rischi non riscrive il perimetro CAT NAT', () => {
  /*
    Il registro e il motore CAT NAT divergevano su tre popolazioni su tre, dentro lo
    stesso documento: l'impresa cessata e l'agricola ricevevano dal registro un obbligo
    che il motore aveva escluso; la pesca ne riceveva il silenzio mentre il motore la
    dichiarava soggetta.

    La correzione non è una regola più intelligente in `rules.ts`: è che `rules.ts` smette
    di avere un'opinione. Il perimetro arriva dal motore, che è l'unico a conoscerlo.
  */

  it('sull’impresa esclusa dal motore non afferma l’obbligo catastrofale', () => {
    for (const motivo of ['impresa cessata', 'impresa agricola ex art. 2135 c.c.']) {
      const valutati = registro({}, { catNat: { soggetta: false, motivoEsclusione: motivo } });
      const inadempimento = valutati.risks.find((r) => r.definition.id === 'inadempimento-catnat');
      expect(inadempimento, `esclusa per «${motivo}»`).toBeUndefined();
    }
  });

  it('sull’impresa che il motore dichiara soggetta non tace', () => {
    // La pesca: il motore la dichiara soggetta — il Fondo AGRICAT non la copre — e il
    // registro, che escludeva la sezione A intera, taceva.
    const valutati = registro(
      { atecoSezione: 'A', atecoDivisione: '03' },
      { catNat: { soggetta: true, motivoEsclusione: null } },
    );
    const inadempimento = valutati.risks.find((r) => r.definition.id === 'inadempimento-catnat');
    expect(inadempimento).toBeDefined();
    expect(inadempimento?.daVerificare).toBe(false);
  });

  it('senza l’esito del motore non decide da sé: dichiara la verifica', () => {
    // «Non l'ho ancora valutato» non è «non è soggetta», e non è nemmeno «è soggetta».
    const inadempimento = rischio({}, 'inadempimento-catnat');
    expect(inadempimento).toBeDefined();
    expect(inadempimento?.daVerificare).toBe(true);
  });

  it('nessuna frase fissa del registro afferma l’obbligo CAT NAT', () => {
    /*
      Le descrizioni del catalogo e i motivi scritti come stringa fissa vengono letti da
      **ogni** impresa: due di essi dichiaravano «Rientra nell'obbligo assicurativo CAT
      NAT» a chi il motore aveva escluso. L'obbligo lo afferma il capitolo CAT NAT, che sa
      per chi vale.
    */
    const colpevoli: string[] = [];
    for (const def of Object.values(RISK_CATALOG)) {
      if (/obbligo (assicurativo )?(catastrofale|CAT NAT)|obbligo CAT NAT/i.test(def.description)) {
        colpevoli.push(`catalogo ${def.id}`);
      }
    }
    for (const regola of RISK_RULES) {
      if (typeof regola.rationale !== 'string') continue;
      if (/obbligo assicurativo catastrofale|obbligo CAT NAT/i.test(regola.rationale)) {
        colpevoli.push(`regola ${regola.id}`);
      }
    }
    expect(colpevoli, colpevoli.join(' · ')).toEqual([]);
  });

  it('e non sovradichiara la conseguenza dell’inadempimento', () => {
    // Art. 1 c. 102 L. 213/2023: dell'inadempimento «si tiene conto». Non «esclude».
    const testo = RISK_CATALOG['inadempimento-catnat'].description;
    expect(testo).not.toMatch(/esclusione dall/i);
    expect(testo).toContain('si tiene conto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 11 — le strutture sanitarie e l'art. 10 della L. 24/2017
// ─────────────────────────────────────────────────────────────────────────────

describe('11 · La struttura sanitaria riceve la responsabilità professionale', () => {
  // 86.10.10 — ospedali e case di cura generici: sezione ATECO Q.
  const struttura: Partial<CompanyFacts> = {
    ...conAteco('86.10.10'),
    atecoSezione: 'Q',
    addetti: 60,
    haDipendenti: true,
  };

  it('la identifica anche fuori dalle sezioni M, J e K', () => {
    expect(rischio(struttura, 'rc-professionale')).toBeDefined();
  });

  it('e ne cita l’obbligo di legge, che è dell’art. 10 della L. 24/2017', () => {
    const riferimenti = rischio(struttura, 'rc-professionale')?.definition.riferimenti ?? [];
    expect(riferimenti.join(' · ')).toContain('L. 24/2017');
  });

  it('senza estenderlo a chi non è una struttura sanitaria', () => {
    const riferimenti = rischio({ atecoSezione: 'M' }, 'rc-professionale')?.definition.riferimenti ?? [];
    expect(riferimenti.join(' · ')).not.toContain('24/2017');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 13 — nove citazioni applicate al tipo d'impresa sbagliato
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · L’art. 118 Cod. cons. è la norma delle esimenti, non della responsabilità', () => {
  it('non lo cita come fonte della responsabilità oggettiva del produttore', () => {
    const motivi = (rischio({ produceBeniFinali: true }, 'rc-prodotto')?.identificationRules ?? [])
      .map((r) => r.rationale)
      .join(' ');
    // Prima: «risponde a prescindere dalla colpa (artt. 114 e 118 D.Lgs. 206/2005)».
    expect(motivi).not.toMatch(/a prescindere dalla colpa[^.]*118/);
    expect(motivi).toContain('esimenti');
  });
});

describe('13 · NIS 2 e prevenzione incendi non valgono per chiunque', () => {
  /*
    Le due regole che identificano ransomware e incendio sono `SEMPRE`: un parrucchiere
    con un addetto riceveva entrambe le citazioni come se lo riguardassero.

    Il perimetro vero — gli allegati I e II del D.Lgs. 138/2024, l'Allegato I del D.P.R.
    151/2011 — non si deduce dai fatti che il prodotto possiede, e inventarlo sarebbe
    peggio. Si degrada l'affermazione a ciò che si sa: la norma esiste, e vale per quelli.
  */
  const parrucchiere: Partial<CompanyFacts> = {
    ...conAteco('96.02.01'),
    atecoSezione: 'S',
    addetti: 1,
  };

  it('la citazione NIS 2 dichiara il proprio perimetro', () => {
    const riferimenti = rischio(parrucchiere, 'ransomware')?.definition.riferimenti ?? [];
    const nis = riferimenti.find((r) => r.includes('138/2024')) ?? '';
    expect(nis).not.toBe('');
    expect(nis.toLowerCase()).toContain('allegat');
  });

  it('e così la citazione del D.P.R. 151/2011', () => {
    const riferimenti = rischio(parrucchiere, 'incendio-fabbricati')?.definition.riferimenti ?? [];
    const vvf = riferimenti.find((r) => r.includes('151/2011')) ?? '';
    expect(vvf).not.toBe('');
    expect(vvf.toLowerCase()).toContain('allegat');
  });
});

describe('13 · L’obbligo dell’iscritto all’albo non è di tutta la sezione M', () => {
  it('la citazione dichiara che l’obbligo è dell’iscritto, non della sezione', () => {
    // 73.11.01 — agenzie pubblicitarie: sezione M, nessun albo.
    const riferimenti =
      rischio({ ...conAteco('73.11.01'), atecoSezione: 'M' }, 'rc-professionale')?.definition.riferimenti ??
      [];
    const albo = riferimenti.find((r) => r.includes('137/2012')) ?? '';
    expect(albo).not.toBe('');
    expect(albo.toLowerCase()).toContain('iscritt');
  });
});

describe('13 · Il D.Lgs. 231/2001 non si applica all’ente pubblico non economico', () => {
  it('non lo asserisce allo Stato e agli enti pubblici non economici (art. 1 c. 3)', () => {
    expect(rischio({ formaGiuridica: 'ente-pubblico' }, 'sanzioni-231')).toBeUndefined();
  });

  it('e sulla forma «altro», che è il valore dell’ignoto, non afferma: verifica', () => {
    const trovato = rischio({ formaGiuridica: 'altro' }, 'sanzioni-231');
    expect(trovato).toBeDefined();
    expect(trovato?.daVerificare).toBe(true);
  });

  it('mentre agli enti privati collettivi resta, senza soglie', () => {
    for (const forma of ['consorzio', 'associazione', 'fondazione'] as const) {
      expect(rischio({ formaGiuridica: forma }, 'sanzioni-231'), forma).toBeDefined();
    }
  });
});

describe('13 · La D&O non salta consorzi, associazioni e fondazioni', () => {
  it('il rischio degli amministratori esiste dove esiste un organo amministrativo', () => {
    for (const forma of ['consorzio', 'associazione', 'fondazione'] as const) {
      expect(rischio({ formaGiuridica: forma }, 'responsabilita-amministratori'), forma).toBeDefined();
    }
  });

  it('e non lo si dice a chi amministra sé stesso', () => {
    expect(
      rischio({ formaGiuridica: 'ditta-individuale' }, 'responsabilita-amministratori'),
    ).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 19 — la sismica senza «non lo so»
// ─────────────────────────────────────────────────────────────────────────────

describe('19 · La provincia assente dalla tabella sismica è ignota, non bassa', () => {
  it('non dichiara «bassa» ciò che non ha misurato', () => {
    // MI non compare in nessuna delle due tabelle: non è zona 4 accertata, è assente.
    const milano = territorialExposure('MI');
    expect(milano.sismica).toBeNull();
    expect(milano.sismicaEtichetta).toBe('non determinata');
  });

  it('ma continua a dire «alta» e «media» dove la misura c’è', () => {
    expect(territorialExposure('UD').sismica).toBe('alta');
    expect(territorialExposure('BO').sismica).toBe('media');
  });

  it('con sole province non misurate non inventa un livello', () => {
    // TO e MI: dodici delle trentatré assenti compaiono in IDRAULICA_ALTA, quindi il file
    // le conosce e semplicemente non le ha classificate.
    expect(worstExposure(['MI', 'TO'])?.sismica).toBeNull();
  });

  it('e il registro dei rischi lo porta in intervista invece di tacerlo', () => {
    /*
      `sismicaAlta` rispondeva `false`, e in `engine.ts` una regola con verdetto falso non
      entra affatto nel registro: la modulazione sismica spariva senza lasciare traccia
      per un terzo delle province italiane.
    */
    const sisma = rischio({ provinceOperative: ['MI'] }, 'catastrofale-sisma');
    const zona = (sisma?.modulationRules ?? []).find((r) => r.ruleId === 'sisma/zona-alta');
    expect(zona, 'la modulazione sismica non compare affatto').toBeDefined();
    expect(zona?.suDatoIgnoto).toBe(true);
    expect(zona?.likelihoodDelta).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 23 — il piano di prevenzione alla prima visita
// ─────────────────────────────────────────────────────────────────────────────

describe('23 · A questionario vuoto non afferma protezioni e non smette di raccomandarle', () => {
  const valutati = assessRisks(fattiSenzaIntervista, DEMO_AS_OF);

  it('non dichiara presente un impianto che nessuno ha dichiarato', () => {
    const affermazioni = valutati.risks
      .flatMap((r) => r.controlRules)
      .map((r) => r.rationale)
      .filter((t) => /dichiarat[oa] present/i.test(t));
    expect(affermazioni, affermazioni.join(' · ')).toEqual([]);
  });

  it('e il piano di prevenzione non esce vuoto proprio alla prima visita', () => {
    const piano = raccomandaPrevenzione(valutati.risks, fattiSenzaIntervista);
    expect(piano.length).toBeGreaterThan(0);
    // Non «accertata assente»: non l'abbiamo chiesto. La distinzione a due stati esiste
    // già nel modello e va usata, non aggirata.
    expect(piano.every((r) => r.accertataAssente === false)).toBe(true);
  });

  it('mentre a questionario compilato l’assenza constatata resta constatata', () => {
    const conIntervista = fatti({ haAllarme: false, haImpiantoAntincendio: false });
    const piano = raccomandaPrevenzione(assessRisks(conIntervista, DEMO_AS_OF).risks, conIntervista);
    expect(piano.some((r) => r.accertataAssente === true)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 24 — i delta stampati devono tornare con i livelli stampati
// ─────────────────────────────────────────────────────────────────────────────

describe('24 · I delta di modulazione stampati coincidono con la differenza', () => {
  /*
    Dove il tetto della scala 1-5 morde, la somma dei delta mostrati non è la differenza
    fra base e inerente: una s.n.c. edile vede «+1 impatto» due volte e ne conta uno. È
    l'unico controllo che il lettore del documento può fare, e non tornava.
  */
  const casi: readonly (readonly [string, Partial<CompanyFacts>])[] = [
    ['s.n.c. edile', { formaGiuridica: 'snc', atecoSezione: 'F', lavoraInCantiere: true }],
    ['dimostrativa', {}],
    ['senza intervista', {}],
  ];

  for (const [nome, patch] of casi) {
    it(`tornano su ${nome}`, () => {
      const valutati = registro(patch);
      for (const r of valutati.risks) {
        const attesaL = r.definition.baseLikelihood + somma(r.modulationRules, 'likelihoodDelta');
        const attesaI = r.definition.baseImpact + somma(r.modulationRules, 'impactDelta');
        expect(attesaL, `${r.definition.id} · probabilità inerente`).toBe(r.likelihood);
        expect(attesaI, `${r.definition.id} · impatto inerente`).toBe(r.impact);

        const residuaL = r.likelihood + somma(r.controlRules, 'likelihoodDelta');
        const residuaI = r.impact + somma(r.controlRules, 'impactDelta');
        expect(residuaL, `${r.definition.id} · probabilità residua`).toBe(r.residualLikelihood);
        expect(residuaI, `${r.definition.id} · impatto residuo`).toBe(r.residualImpact);
      }
    });
  }

  function somma(
    regole: readonly { readonly likelihoodDelta: number; readonly impactDelta: number }[],
    campo: 'likelihoodDelta' | 'impactDelta',
  ): number {
    return regole.reduce((tot, r) => tot + r[campo], 0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 13 — l'avviso di monitoraggio: «si tiene conto», e l'art. 2086
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · L’avviso CAT NAT del monitoraggio non sovradichiara', () => {
  const stato: StatoSorvegliato = {
    osservatoIl: DEMO_AS_OF.toISOString(),
    denominazione: 'ALFA MECCANICA DI ROSSI MARIO',
    formaGiuridica: 'Impresa individuale',
    attiva: true,
    ateco: '25.62.00',
    indirizzoSedeLegale: 'Via Roma 1, Milano',
    numeroUnitaLocali: null,
    dimensione: 'micro',
    addetti: 3,
    fatturato: null,
    annoUltimoBilancio: null,
    patrimonioNetto: null,
    scoreCredito: 70,
    classeCredito: 'B',
    proceduraConcorsualeAperta: false,
    eventiNegativiPresenti: false,
    statoCatNat: 'inadempiente',
    capitaliRaccomandati: {},
    polizze: [],
  };

  const avviso = () => {
    const eventi = rilevaEventi(null, stato, { asOf: DEMO_AS_OF });
    const trovato = eventi.find((e) => e.tipo === 'obbligo-normativo');
    expect(trovato, 'l’avviso CAT NAT non è stato emesso').toBeDefined();
    return trovato!;
  };

  it('dice «se ne tiene conto», non «preclude»', () => {
    const testo = avviso().conseguenza;
    expect(testo).not.toContain('preclude');
    expect(testo).toContain('si tiene conto');
  });

  it('e non mette l’art. 2086 in capo all’organo amministrativo di una ditta individuale', () => {
    /*
      Il comma 2 dell'art. 2086 vale per l'imprenditore «che operi in forma societaria o
      collettiva». La fotografia sorvegliata porta la forma giuridica come descrizione
      camerale, non come categoria: non si indovina, si dichiara il perimetro della norma.
    */
    const evento = avviso();
    const art2086 = evento.riferimenti.find((r) => r.includes('2086')) ?? '';
    expect(art2086).not.toBe('');
    expect(art2086.toLowerCase()).toMatch(/societaria|collettiva/);
    expect(evento.conseguenza.toLowerCase()).toMatch(/societaria|collettiva/);
  });
});
