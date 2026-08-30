/**
 * Le sette affermazioni false del modulo coperture.
 *
 * Sono i reperti 6, 7, 8, 9, 10, 13 e 14 dell'audit di consegna. Hanno una forma sola:
 * il motore afferma con la stessa faccia ciò che ha misurato e ciò che ha dedotto da un
 * dato che non ha. Una polizza morta contata fra le adeguate, un contratto in vigore
 * scartato perché il precedente era più capiente, un obbligo di legge negato a un intero
 * comparto, un capitale della RCT proposto per la tutela legale.
 *
 * Ogni prova qui sotto è stata **vista fallire** sul codice non corretto: la riga che
 * ciascuna presidia è annotata con ciò che il prodotto diceva prima.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';
import type { Money as Euro } from '../src/shared/money.js';
import { explain } from '../src/shared/explain.js';
import { analyzeGaps } from '../src/coverage/gap.js';
import type { GapAnalysis, GapAnalysisInput } from '../src/coverage/gap.js';
import { indexPolizze } from '../src/coverage/policy.js';
import type { PolizzaInEssere } from '../src/coverage/policy.js';
import { assessCatNat } from '../src/coverage/catnat.js';
import { computeSumsInsured } from '../src/coverage/sums-insured.js';
import type { SumsInsured } from '../src/coverage/sums-insured.js';
import { calcolaMetricheDiImpatto } from '../src/coverage/metriche-impatto.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { BilancioRiclassificato } from '../src/company/financials.js';
import type { ImmobileDichiarato } from '../src/company/profile.js';
import type { AssessedRisk, RiskAssessment } from '../src/risk/engine.js';
import type { CoverageId } from '../src/coverage/taxonomy.js';

const OGGI = new Date('2026-08-30T00:00:00Z');
/** 181 giorni prima di OGGI: il numero che il prodotto stampava col segno meno. */
const SCADUTA_DA_181_GIORNI = new Date('2026-03-02T00:00:00Z');
const IN_VIGORE = new Date('2027-06-30T00:00:00Z');

// ─────────────────────────────────────────────────────────────────────────────
// Impalcature minime: solo i campi che i calcoli leggono davvero.
// ─────────────────────────────────────────────────────────────────────────────

function fatti(modifiche: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    denominazione: 'ALFA MECCANICA S.R.L.',
    formaGiuridica: 'srl',
    statoAttivita: 'attiva',
    dimensione: 'piccola',
    ateco: null,
    atecoSezione: 'C',
    atecoDivisione: '25',
    atecoSecondari: [],
    addetti: null,
    fatturato: null,
    numeroVeicoli: 0,
    haDipendenti: false,
    numeroSoci: 2,
    haSociPersonaGiuridica: false,
    ...modifiche,
  } as CompanyFacts;
}

function polizza(
  modifiche: Partial<PolizzaInEssere> & Pick<PolizzaInEssere, 'id' | 'coverage'>,
): PolizzaInEssere {
  return {
    compagnia: 'Compagnia di prova S.p.A.',
    numeroPolizza: null,
    sommaAssicurata: null,
    massimale: null,
    franchigia: null,
    scoperto: null,
    dataEffetto: new Date('2024-01-01T00:00:00Z'),
    dataScadenza: IN_VIGORE,
    premioAnnuo: null,
    formaGaranzia: null,
    note: null,
    ...modifiche,
  };
}

function somme(modifiche: Partial<SumsInsured> = {}): SumsInsured {
  const ignoto = explain('—').value<Euro | null>(null);
  const zero = explain('—').value<Euro>(Money.ZERO);
  return {
    fabbricati: ignoto,
    contenuto: ignoto,
    scorte: ignoto,
    danniIndiretti: ignoto,
    monteSalari: ignoto,
    massimaleRct: zero,
    massimaleRcoPerPersona: zero,
    massimaleRcProdotti: ignoto,
    massimaleDandO: ignoto,
    massimaleCyber: zero,
    fidoClienti: ignoto,
    baseCatNat: ignoto,
    patrimonioEsposto: ignoto,
    ...modifiche,
  };
}

/**
 * Un rischio finto che chiede una copertura precisa.
 *
 * Serve perché `analyzeGaps` valuta le garanzie richieste dall'analisi dei rischi più
 * quelle già in portafoglio: senza rischi, lo scenario «nessuna polizza» non produce
 * alcun gap e il confronto con lo scenario «polizza muta» sarebbe fra due vuoti.
 */
function rischioChe(chiede: CoverageId): AssessedRisk {
  // Solo i campi che `analyzeGaps` legge davvero: costruire un `AssessedRisk` intero
  // richiederebbe l'intero motore delle regole senza aggiungere nulla alla prova.
  const parziale: unknown = {
    definition: { id: 'prova', label: 'Rischio di prova' },
    treatment: 'trasferire',
    coverages: [chiede],
    residualLevel: 'moderato',
    residualScore: 10,
  };
  return parziale as AssessedRisk;
}

function rischi(...coverture: readonly CoverageId[]): RiskAssessment {
  return {
    risks: coverture.map(rischioChe),
    asOf: OGGI,
    catalogVersion: 'prova',
    rulesVersion: 'prova',
    daTrasferire: coverture.length,
    daVerificare: 0,
  };
}

function analizza(
  polizze: readonly PolizzaInEssere[],
  sums: SumsInsured = somme(),
  modifiche: Partial<GapAnalysisInput> = {},
): GapAnalysis {
  return analyzeGaps({
    assessment: rischi(),
    facts: fatti(),
    sums,
    polizze,
    catNat: null,
    dannoMassimo: null,
    asOf: OGGI,
    ...modifiche,
  });
}

function gapDi(analisi: GapAnalysis, coverage: CoverageId) {
  const gap = analisi.gaps.find((g) => g.definition.id === coverage);
  expect(gap, `nessun gap per ${coverage}`).toBeDefined();
  return gap!;
}

function esplicato(v: Euro | null) {
  return explain('—').value<Euro | null>(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Una polizza scaduta non è una copertura adeguata
// ─────────────────────────────────────────────────────────────────────────────

describe('6 · La polizza scaduta non è una copertura', () => {
  const scaduta = polizza({
    id: 'rct-morta',
    coverage: 'rct',
    massimale: Money.euro(1_000_000),
    dataScadenza: SCADUTA_DA_181_GIORNI,
  });

  const analisi = () =>
    analizza([scaduta], somme({ massimaleRct: explain('—').value<Euro>(Money.euro(1_000_000)) }));

  it('non la conta fra le coperture adeguate', () => {
    // Prima: status 'in-scadenza', che `analyzeGaps` somma in `coperturaAdeguata`.
    const a = analisi();
    expect(gapDi(a, 'rct').status).toBe('assente');
    expect(a.coperturaAdeguata).toBe(0);
    expect(a.coperturaAssente).toBe(1);
  });

  it('non annuncia una scadenza con i giorni al negativo', () => {
    // Prima: «Polizza in scadenza fra -181 giorni: avviare la verifica di rinnovo».
    const azione = gapDi(analisi(), 'rct').azione;
    expect(azione).not.toMatch(/-\d+\s*giorni/);
    expect(azione).toContain('scaduta');
  });

  it('non lascia in essere un capitale che nessuna polizza garantisce oggi', () => {
    const gap = gapDi(analisi(), 'rct');
    expect(gap.capitaleInEssere).toBeNull();
    expect(gap.polizzaScaduta).toBe(true);
    // Il contratto resta a fascicolo: va nominato, non contato.
    expect(gap.polizza?.id).toBe('rct-morta');
  });

  it('il piano non fissa un termine già passato: la scopertura è in atto oggi', () => {
    // Prima: urgenza 'alla-scadenza' con termine 2 marzo 2026, cioè nel passato.
    const piano = gapDi(analisi(), 'rct').piano;
    expect(piano.urgenza).toBe('immediata');
    expect(piano.termine === null || piano.termine.getTime() >= OGGI.getTime()).toBe(true);
  });

  it('vale anche per le garanzie a valore, non solo per i massimali', () => {
    const incendioMorto = polizza({
      id: 'incendio-morto',
      coverage: 'incendio',
      sommaAssicurata: Money.euro(9_300_000),
      dataScadenza: SCADUTA_DA_181_GIORNI,
      formaGaranzia: 'valore-a-nuovo',
    });
    const a = analizza([incendioMorto], somme({ patrimonioEsposto: esplicato(Money.euro(9_300_000)) }));
    expect(gapDi(a, 'incendio').status).toBe('assente');
    expect(a.coperturaAdeguata).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Fra due polizze vince quella in vigore, non la più capiente
// ─────────────────────────────────────────────────────────────────────────────

describe('7 · Il rinnovo non si scarta perché il contratto morto era più grosso', () => {
  const vecchia = polizza({
    id: 'vecchia',
    coverage: 'rct',
    massimale: Money.euro(5_000_000),
    dataScadenza: SCADUTA_DA_181_GIORNI,
  });
  const rinnovo = polizza({
    id: 'rinnovo',
    coverage: 'rct',
    massimale: Money.euro(1_000_000),
    dataScadenza: IN_VIGORE,
  });

  it('indicizza la polizza in vigore, quale che sia il capitale della scaduta', () => {
    // Prima: 5.000.000 > 1.000.000, e vinceva il contratto morto.
    expect(indexPolizze([vecchia, rinnovo], OGGI).get('rct')?.id).toBe('rinnovo');
    expect(indexPolizze([rinnovo, vecchia], OGGI).get('rct')?.id).toBe('rinnovo');
  });

  it('a parità di stato torna a decidere il capitale', () => {
    const piccola = polizza({ id: 'piccola', coverage: 'rct', massimale: Money.euro(500_000) });
    const grande = polizza({ id: 'grande', coverage: 'rct', massimale: Money.euro(3_000_000) });
    expect(indexPolizze([piccola, grande], OGGI).get('rct')?.id).toBe('grande');
    expect(indexPolizze([grande, piccola], OGGI).get('rct')?.id).toBe('grande');
  });

  it('segnala la sottoassicurazione reale, quella del contratto in vigore', () => {
    // Prima: giudicava i 5 M della polizza morta contro un benchmark da 2 M e
    // dichiarava la garanzia in ordine.
    const a = analizza(
      [vecchia, rinnovo],
      somme({ massimaleRct: explain('—').value<Euro>(Money.euro(2_000_000)) }),
    );
    const gap = gapDi(a, 'rct');
    expect(gap.polizza?.id).toBe('rinnovo');
    expect(gap.capitaleInEssere).toBe(Money.euro(1_000_000));
    expect(gap.status).toBe('massimale-insufficiente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Una polizza senza capitale dichiarato non è «nessuna polizza»
// ─────────────────────────────────────────────────────────────────────────────

describe('8 · Il capitale non dichiarato non è un capitale pari a zero', () => {
  const sums = somme({ patrimonioEsposto: esplicato(Money.euro(9_300_000)) });

  const daIncendio = { assessment: rischi('incendio') };

  const senzaPolizza = () => analizza([], sums, daIncendio);
  const conPolizzaMuta = () =>
    analizza(
      [polizza({ id: 'incendio-muto', coverage: 'incendio', formaGaranzia: 'valore-a-nuovo' })],
      sums,
      daIncendio,
    );

  it('senza polizze l’esposizione è l’intero patrimonio', () => {
    expect(senzaPolizza().esposizioneNonAssicurata).toBe(Money.euro(9_300_000));
  });

  it('con una polizza dal capitale ignoto l’esposizione non è la stessa', () => {
    // Prima: 9.300.000 € in entrambi gli scenari, perché il capitale ignoto veniva
    // sottratto come se valesse zero.
    expect(conPolizzaMuta().esposizioneNonAssicurata).not.toBe(senzaPolizza().esposizioneNonAssicurata);
  });

  it('la conta fra le garanzie da quantificare, come il commento promette', () => {
    const a = conPolizzaMuta();
    expect(gapDi(a, 'incendio').status).toBe('da-quantificare');
    expect(a.coperturaDaQuantificare).toBe(1);
    expect(a.esposizioneNonAssicurata).toBe(Money.ZERO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · La pesca non è esclusa dall'obbligo catastrofale
// ─────────────────────────────────────────────────────────────────────────────

describe('9 · L’obbligo CAT NAT e la sezione A', () => {
  const valuta = (atecoDivisione: string | null, dimensione: CompanyFacts['dimensione'] = 'micro') =>
    assessCatNat({
      facts: fatti({ atecoSezione: 'A', atecoDivisione, dimensione }),
      baseAssicurabile: Money.euro(1_000_000),
      giaCoperta: false,
      asOf: OGGI,
    }).value;

  it('l’impresa agricola resta esclusa: per lei opera il Fondo AGRICAT', () => {
    for (const divisione of ['01', '02']) {
      const esito = valuta(divisione);
      expect(esito.soggetta, `divisione ${divisione}`).toBe(false);
      expect(esito.motivoEsclusione).toContain('AGRICAT');
    }
  });

  it('la pesca è soggetta: negarlo è il verso che costa', () => {
    // Prima: tutta la sezione A dichiarata «non soggetta», pesca compresa.
    const esito = valuta('03');
    expect(esito.soggetta).toBe(true);
    expect(esito.motivoEsclusione).toBeNull();
  });

  it('e la proroga della pesca smette di essere irraggiungibile', () => {
    // Prima: il ramo che applica PROROGHE_SETTORIALI['03'] non era raggiungibile,
    // perché l'esclusione della sezione A ritornava prima.
    expect(valuta('03')?.termine?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });

  it('la proroga resta riservata a micro e piccole, come la norma dispone', () => {
    expect(valuta('03', 'grande')?.termine?.toISOString()).toBe('2025-03-31T23:59:59.000Z');
  });

  it('l’impresa cessata resta esclusa', () => {
    const esito = assessCatNat({
      facts: fatti({ statoAttivita: 'cessata' }),
      baseAssicurabile: null,
      giaCoperta: false,
      asOf: OGGI,
    }).value;
    expect(esito.soggetta).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Il capitale della RCT non è il capitale della tutela legale
// ─────────────────────────────────────────────────────────────────────────────

describe('10 · Nessuna garanzia porta il capitale e la spiegazione di un’altra', () => {
  const sums = somme({
    massimaleRct: explain('Massimale consigliato — RCT').value<Euro>(Money.euro(10_000_000)),
  });

  for (const coverage of ['tutela-legale', 'rc-inquinamento'] as const) {
    it(`${coverage} non propone il massimale della RCT`, () => {
      // Prima: «Attivare la copertura Tutela legale con capitale di 10,0 Mln €»,
      // con allegata la spiegazione della RCT.
      const gap = gapDi(analizza([polizza({ id: coverage, coverage })], sums), coverage);
      expect(gap.capitaleRaccomandato.value).toBeNull();
      expect(gap.capitaleRaccomandato.explanation.label).not.toContain('RCT');
      expect(gap.azione).not.toContain('10,0');
    });
  }

  it('la RCT continua a portare il suo', () => {
    const gap = gapDi(analizza([polizza({ id: 'rct', coverage: 'rct' })], sums), 'rct');
    expect(gap.capitaleRaccomandato.value).toBe(Money.euro(10_000_000));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · La somma parziale si dichiara anche sul capitale CAT NAT
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · Il capitale CAT NAT dice quando è una somma parziale', () => {
  const immobile: ImmobileDichiarato = {
    descrizione: 'Capannone',
    indirizzo: null,
    superficieMq: 2_000,
    titolo: 'proprieta',
    tipologiaCostruttiva: 'prefabbricato',
    annoCostruzione: 2010,
    presenzaImpiantoAntincendio: null,
    presenzaAllarme: null,
    compartimentazioneRei: null,
    impiantoSprinkler: null,
  };

  it('con i soli fabbricati noti avvisa che il totale è per difetto', () => {
    // Prima: nessun avviso. La funzione gemella `patrimonioEsposto` ce l'ha da sempre,
    // 760 righe più su nello stesso file.
    const sums = computeSumsInsured(fatti(), null, [immobile]);
    expect(sums.baseCatNat.value).not.toBeNull();
    expect(sums.contenuto.value).toBeNull();
    expect(sums.baseCatNat.explanation.notes.join(' ')).toContain('Somma parziale');
  });

  it('senza alcuna componente non parla di somma parziale ma di capitale non quantificabile', () => {
    const sums = computeSumsInsured(fatti(), null, []);
    const note = sums.baseCatNat.explanation.notes.join(' ');
    expect(sums.baseCatNat.value).toBeNull();
    expect(note).not.toContain('Somma parziale');
    expect(note).toContain('non quantificabile');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14 · Gli artt. 2446-2447 sono norme della S.p.A.
// ─────────────────────────────────────────────────────────────────────────────

describe('14 · La soglia critica non cita a chiunque le norme di una sola forma', () => {
  const bilancio = (patrimonioNetto: number): BilancioRiclassificato =>
    ({
      sp: {
        liquiditaImmediate: Money.euro(100_000),
        liquiditaDifferite: Money.euro(400_000),
        attivoCorrente: Money.euro(900_000),
        passivoCorrente: Money.euro(600_000),
        patrimonioNetto: Money.euro(patrimonioNetto),
      },
      ce: {
        ebitda: Money.euro(300_000),
        margineDiContribuzione: Money.euro(1_100_000),
      },
    }) as BilancioRiclassificato;

  const critica = (capitaleSociale: Euro) => {
    const m = calcolaMetricheDiImpatto(bilancio(1_200_000), capitaleSociale);
    const fascia = m.value.fasce.find((f) => f.livello === 'critico');
    expect(fascia).toBeDefined();
    return { fascia: fascia!, riferimenti: m.explanation.references.join(' · ') };
  };

  it('non afferma a una S.r.l. gli obblighi degli artt. 2446 e 2447', () => {
    // Prima: «erode il patrimonio fino a far scattare gli obblighi degli artt. 2446 e
    // 2447 c.c.», stampato a chiunque — e quelle sono norme della S.p.A.
    const { fascia } = critica(Money.euro(100_000));
    expect(fascia.descrizione).not.toContain('2446');
    expect(fascia.descrizione).not.toContain('2447');
    expect(fascia.ancoraggio).not.toContain('2446');
  });

  it('cita entrambi i regimi, ciascuno con la sua forma', () => {
    const { riferimenti } = critica(Money.euro(100_000));
    expect(riferimenti).toContain('2446');
    expect(riferimenti).toContain('2482-bis');
    expect(riferimenti).toContain('2482-ter');
  });

  it('senza capitale sociale non affaccia alcun obbligo societario', () => {
    const { fascia } = critica(Money.ZERO);
    expect(fascia.descrizione).not.toContain('2446');
    expect(fascia.ancoraggio).toContain('patrimonio netto');
  });

  it('la soglia resta quella che porta il patrimonio sotto i due terzi del capitale', () => {
    const { fascia } = critica(Money.euro(900_000));
    // 1.200.000 − (900.000 × 2/3) = 600.000
    expect(Money.toEuro(fascia.importo)).toBe(600_000);
  });
});
