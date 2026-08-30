/**
 * I bloccanti della corsia «coperture e capitali».
 *
 * Sono i reperti 9, 13 (per la parte su sums-insured e motivazione), 14, 15, 17, 18 e 22
 * dell'audit di consegna. Hanno tutti la stessa forma: un capitale misurato contro un
 * metro che non è il suo, oppure una frase che afferma come accertato ciò che nessuno ha
 * misurato.
 *
 * Ogni prova qui sotto è stata **vista fallire** sul codice non corretto, e accanto a
 * ciascuna è annotato ciò che il prodotto diceva prima.
 *
 * Il difetto 16 — l'art. 1907 misurato contro un capitale che comprende il picco
 * stagionale — non è coperto qui: correggerlo richiede una seconda serie di capitali
 * (quello da proporre e quello che i beni valgono al momento del sinistro) che il motore
 * oggi non ha. È dichiarato nel resoconto, non corretto a metà.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';
import type { Money as Euro } from '../src/shared/money.js';
import { computeSumsInsured } from '../src/coverage/sums-insured.js';
import { analyzeGaps } from '../src/coverage/gap.js';
import type { GapAnalysis, GapAnalysisInput } from '../src/coverage/gap.js';
import { componiMotivazioneCopertura } from '../src/coverage/motivazione.js';
import { COVERAGE_CATALOG } from '../src/coverage/taxonomy.js';
import { stimaDannoMassimo } from '../src/coverage/danno-massimo.js';
import { analizzaUbicazioni } from '../src/company/ubicazioni.js';
import { classifySize } from '../src/company/size.js';
import { explain } from '../src/shared/explain.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { BilancioRiclassificato } from '../src/company/financials.js';
import type { Indirizzo, ImmobileDichiarato } from '../src/company/profile.js';
import type { PolizzaInEssere } from '../src/coverage/policy.js';
import type { SumsInsured } from '../src/coverage/sums-insured.js';
import type { AssessedRisk, RiskAssessment } from '../src/risk/engine.js';
import type { CoverageId } from '../src/coverage/taxonomy.js';

const OGGI = new Date('2026-08-30T00:00:00Z');
const IN_VIGORE = new Date('2027-06-30T00:00:00Z');

const euro = (v: number): Euro => Money.euro(v);

// ─────────────────────────────────────────────────────────────────────────────
// Impalcature: solo i campi che i calcoli leggono davvero.
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
    totaleAttivo: null,
    numeroVeicoli: 0,
    haDipendenti: false,
    numeroSoci: 2,
    haSociPersonaGiuridica: false,
    possiedeImmobili: false,
    rimanenze: null,
    margineDiContribuzione: null,
    costoDelPersonale: null,
    creditiVersoClienti: null,
    costoStoricoImmobilizzazioni: null,
    valoreImpiantiNetto: null,
    numeroAmministratori: null,
    esercitaDirezioneECoordinamento: false,
    soggettaADirezioneECoordinamento: false,
    numeroUnitaLocali: null,
    ...modifiche,
  } as CompanyFacts;
}

/**
 * Un bilancio in schema CEE ridotto alle sole voci che i capitali leggono.
 *
 * Non è una scorciatoia: costruirlo intero richiederebbe la riclassificazione completa
 * senza aggiungere nulla alla prova, ed è la stessa impalcatura usata da
 * `audit-coperture.test.ts`.
 */
function bilancioConAttivo(attivo: {
  terreniEFabbricati?: number;
  impiantiEMacchinario?: number;
  attrezzature?: number;
  altreImmobilizzazioniMateriali?: number;
  costoStoricoImmobilizzazioniMateriali?: number;
}): BilancioRiclassificato {
  const parziale: unknown = {
    origine: {
      attivo: {
        terreniEFabbricati: euro(attivo.terreniEFabbricati ?? 0),
        impiantiEMacchinario: euro(attivo.impiantiEMacchinario ?? 0),
        attrezzature: euro(attivo.attrezzature ?? 0),
        altreImmobilizzazioniMateriali: euro(attivo.altreImmobilizzazioniMateriali ?? 0),
        ...(attivo.costoStoricoImmobilizzazioniMateriali === undefined
          ? {}
          : {
              costoStoricoImmobilizzazioniMateriali: euro(attivo.costoStoricoImmobilizzazioniMateriali),
            }),
      },
    },
    sp: { rimanenze: Money.ZERO },
    ce: {
      margineDiContribuzione: Money.ZERO,
      valoreDellaProduzione: Money.ZERO,
      costiVariabili: Money.ZERO,
      costoDelPersonale: Money.ZERO,
    },
  };
  return parziale as BilancioRiclassificato;
}

function immobile(modifiche: Partial<ImmobileDichiarato> = {}): ImmobileDichiarato {
  return {
    descrizione: 'Capannone',
    indirizzo: null,
    superficieMq: null,
    titolo: 'proprieta',
    tipologiaCostruttiva: 'cemento-armato',
    annoCostruzione: 2010,
    presenzaImpiantoAntincendio: null,
    presenzaAllarme: null,
    compartimentazioneRei: null,
    impiantoSprinkler: null,
    ...modifiche,
  };
}

function indirizzo(modifiche: Partial<Indirizzo> = {}): Indirizzo {
  return {
    via: 'Via delle Prove',
    civico: '1',
    cap: '20100',
    comune: 'Milano',
    provincia: 'MI',
    regione: 'Lombardia',
    frazione: null,
    latitudine: null,
    longitudine: null,
    ...modifiche,
  };
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

function rischioChe(chiede: CoverageId): AssessedRisk {
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
  sums: SumsInsured,
  modifiche: Partial<GapAnalysisInput> = {},
): GapAnalysis {
  return analyzeGaps({
    assessment: rischi('incendio'),
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

const note = (e: { explanation: { notes: readonly string[] } }): string => e.explanation.notes.join(' § ');

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Il valore allo stato d'uso non si misura su un capitale a nuovo
// ─────────────────────────────────────────────────────────────────────────────

describe('9 · La polizza a valore allo stato d’uso ha un metro suo', () => {
  /*
    Il capitale raccomandato è calcolato a nuovo — COEFF_NETTO_A_RIMPIAZZO vale 2,0 —
    mentre una garanzia a valore allo stato d'uso indennizza il bene degradato.
    Confrontare i due numeri non misura la sottoassicurazione: la fabbrica, e di circa
    la metà.
  */
  const patrimonio = somme({ patrimonioEsposto: explain('—').value<Euro | null>(euro(6_200_000)) });

  const conForma = (formaGaranzia: PolizzaInEssere['formaGaranzia']) =>
    gapDi(
      analizza(
        [
          polizza({
            id: 'inc',
            coverage: 'incendio',
            sommaAssicurata: euro(2_000_000),
            formaGaranzia,
          }),
        ],
        patrimonio,
      ),
      'incendio',
    );

  it('non la dichiara sottoassicurata sul capitale a nuovo', () => {
    // Prima: status 'sottoassicurata', identico carattere per carattere a 'valore-a-nuovo'.
    expect(conForma('valore-allo-stato-duso').status).not.toBe('sottoassicurata');
  });

  it('dichiara che il metro manca, invece di dedurre un’insufficienza', () => {
    const gap = conForma('valore-allo-stato-duso');
    expect(gap.status).toBe('da-quantificare');
    expect(gap.sottoassicurazione?.value?.adeguatezzaDelLimite).toBe('non-verificabile');
    expect(gap.sottoassicurazione?.value?.sottoassicurata).toBe(false);
    expect(note(gap.sottoassicurazione!)).toContain('stato d’uso');
  });

  it('e non stampa la percentuale di sottoassicurazione che non ha misurato', () => {
    // Prima: «⚠ SOTTOASSICURAZIONE del 67% … resterebbero a carico dell'impresa».
    expect(note(conForma('valore-allo-stato-duso').sottoassicurazione!)).not.toContain(
      'SOTTOASSICURAZIONE del',
    );
  });

  it('la stessa somma a valore a nuovo resta sottoassicurata', () => {
    // La guardia: il capitale raccomandato è a nuovo, quindi per questa forma il metro
    // è quello giusto e il verdetto non deve cambiare.
    expect(conForma('valore-a-nuovo').status).toBe('sottoassicurata');
  });

  it('e la forma non dichiarata continua a valere come valore intero', () => {
    // `null` è assenza di dato, non «stato d'uso»: dedurne il ramo più favorevole
    // dichiarerebbe non giudicabile una polizza che al sinistro subisce la riduzione.
    expect(conForma(null).status).toBe('sottoassicurata');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14 · La base CAT NAT è B-II 1, 2 e 3 — non 4 e 5
// ─────────────────────────────────────────────────────────────────────────────

describe('14 · La base CAT NAT non comprende gli altri beni', () => {
  const soloAltriBeni = () =>
    computeSumsInsured(
      fatti({ possiedeImmobili: false }),
      bilancioConAttivo({ altreImmobilizzazioniMateriali: 1_000_000 }),
      [],
    );

  it('con i soli automezzi e mobili a bilancio la base dell’obbligo è zero', () => {
    // Prima: baseCatNat 2.000.000 € — 1.000.000 di B-II 4/5 riportato a nuovo con il
    // coefficiente 2,0 — su beni che la L. 213/2023 non chiede di assicurare.
    const sums = soloAltriBeni();
    expect(sums.contenuto.value).toBe(euro(2_000_000));
    expect(sums.baseCatNat.value).toBe(Money.ZERO);
  });

  it('e dichiara che cosa ha escluso, invece di tacerlo', () => {
    expect(note(soloAltriBeni().baseCatNat)).toContain('B-II 4');
  });

  it('quando l’aggregato non è scomponibile lo dice, e non finge di averlo scomposto', () => {
    /*
      Il costo storico da nota integrativa è un totale delle immobilizzazioni materiali:
      le voci 4 e 5 ci sono dentro e non si separano. Il numero resta per eccesso — che
      è il verso prudente per un capitale — ma l'ipotesi si dichiara.
    */
    const sums = computeSumsInsured(
      fatti({ possiedeImmobili: false }),
      bilancioConAttivo({
        terreniEFabbricati: 0,
        costoStoricoImmobilizzazioniMateriali: 1_000_000,
      }),
      [],
    );
    expect(sums.baseCatNat.value).not.toBeNull();
    expect(note(sums.baseCatNat)).toContain('non è scomponibile');
    expect(sums.baseCatNat.confidence).not.toBe('alta');
  });

  it('gli impianti e le attrezzature restano invece dentro la base', () => {
    // La guardia opposta: escludere ciò che la norma chiede sarebbe l'errore speculare,
    // e peggiore, perché produce un capitale per difetto su un obbligo di legge.
    const sums = computeSumsInsured(
      fatti({ possiedeImmobili: false }),
      bilancioConAttivo({ impiantiEMacchinario: 400_000, attrezzature: 100_000 }),
      [],
    );
    expect(sums.baseCatNat.value).toBe(euro(1_000_000));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15 · La somma parziale sui fabbricati si dichiara
// ─────────────────────────────────────────────────────────────────────────────

describe('15 · Tre immobili di cui due senza superficie non fanno un totale', () => {
  const tre = [
    immobile({ descrizione: 'Capannone A', superficieMq: 2_000 }),
    immobile({ descrizione: 'Capannone B' }),
    immobile({ descrizione: 'Deposito C' }),
  ];

  const sums = () => computeSumsInsured(fatti({ possiedeImmobili: true }), null, tre);

  it('avvisa che il totale è per difetto', () => {
    // Prima: 1.900.000 € presentati come il capitale fabbricati, nessuna nota.
    expect(note(sums().fabbricati)).toContain('Somma parziale');
  });

  it('nomina gli immobili che non sono entrati nella somma', () => {
    const n = note(sums().fabbricati);
    expect(n).toContain('Capannone B');
    expect(n).toContain('Deposito C');
  });

  it('e non resta a confidenza alta su un totale incompleto', () => {
    // Prima: 'alta', la stessa di un rilievo completo.
    expect(sums().fabbricati.confidence).not.toBe('alta');
  });

  it('con tutte le superfici rilevate il totale resta pieno e accertato', () => {
    // La guardia: la fixture dimostrativa ha entrambi gli immobili misurati e non deve
    // perdere né il capitale né la confidenza.
    const complete = computeSumsInsured(fatti({ possiedeImmobili: true }), null, [
      immobile({ descrizione: 'Capannone A', superficieMq: 2_000 }),
      immobile({ descrizione: 'Capannone B', superficieMq: 1_000 }),
    ]);
    expect(complete.fabbricati.confidence).toBe('alta');
    expect(note(complete.fabbricati)).not.toContain('Somma parziale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · L'art. 118 Cod. cons. è la norma delle esimenti
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · L’art. 118 non è la fonte della responsabilità da prodotto', () => {
  const riferimenti = () =>
    componiMotivazioneCopertura(
      COVERAGE_CATALOG['rc-prodotti'],
      fatti({ produceBeniFinali: true }),
      [],
      null,
    ).riferimenti.join(' | ');

  it('non lo cita in coppia con il 114 come se fondasse la responsabilità', () => {
    // Prima: «Artt. 114 e 118 D.Lgs. 206/2005». La lettura corretta è in
    // coverage/taxonomy.ts:283, che chiama il 118 «l'elenco delle esimenti».
    expect(riferimenti()).not.toContain('Artt. 114 e 118');
  });

  it('e lo nomina per quello che è', () => {
    const r = riferimenti();
    expect(r).toContain('Art. 114');
    expect(r).toContain('esimenti');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · La D&O di una fondazione non è «non pertinente»
// ─────────────────────────────────────────────────────────────────────────────

describe('13 · Associazioni e fondazioni hanno amministratori che rispondono', () => {
  const dandO = (formaGiuridica: CompanyFacts['formaGiuridica']) =>
    computeSumsInsured(fatti({ formaGiuridica, totaleAttivo: euro(3_000_000) }), null, []).massimaleDandO;

  it('alla fondazione non dice che la garanzia non serve', () => {
    /*
      Prima, a confidenza 'alta': «Forma giuridica priva di organo amministrativo distinto
      dalla proprietà: garanzia non pertinente.» In una fondazione la proprietà non esiste
      — è un patrimonio destinato a uno scopo — e gli amministratori rispondono ex art. 18
      c.c. La nota era rovesciata in entrambe le sue metà.
    */
    expect(note(dandO('fondazione'))).not.toContain('non pertinente');
    expect(dandO('fondazione').value).not.toBeNull();
  });

  it('e cita la norma che li riguarda', () => {
    const riferimenti = dandO('fondazione').explanation.references.join(' | ');
    expect(riferimenti).toContain('Art. 18 c.c.');
  });

  it('lo stesso vale per l’associazione', () => {
    expect(note(dandO('associazione'))).not.toContain('non pertinente');
    expect(dandO('associazione').value).not.toBeNull();
  });

  it('alla ditta individuale la garanzia resta davvero non pertinente', () => {
    // La guardia: chi amministra è chi possiede, e lì la frase è vera.
    expect(note(dandO('ditta-individuale'))).toContain('non pertinente');
    expect(dandO('ditta-individuale').value).toBeNull();
  });

  it('e su una forma non determinata non si afferma né l’una né l’altra cosa', () => {
    // 'altro' è il valore dell'ignoto: affermarci sopra «non pertinente» a confidenza
    // alta è la stessa assenza-fatta-dato di ogni altro difetto di questa corsia.
    expect(dandO('altro').confidence).not.toBe('alta');
    expect(note(dandO('altro'))).toContain('non è determinata');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17 · Il danno massimo non dichiara separato ciò che somma
// ─────────────────────────────────────────────────────────────────────────────

describe('17 · I complessi separati o si escludono dal conto o non si dichiarano', () => {
  const dueIndirizziSenzaCoordinate = () =>
    analizzaUbicazioni({
      sedeLegale: indirizzo({ via: 'Via Prima', civico: '1' }),
      unitaLocali: [],
      immobili: [
        immobile({ descrizione: 'Deposito', indirizzo: indirizzo({ via: 'Via Seconda', civico: '2' }) }),
      ],
    });

  const stima = () =>
    stimaDannoMassimo(euro(6_200_000), fatti({ numeroUnitaLocali: 2 }), [], dueIndirizziSenzaCoordinate());

  it('il ramo gira davvero su due indirizzi senza coordinate', () => {
    expect(dueIndirizziSenzaCoordinate().complessiIncendio.length).toBe(2);
  });

  it('non afferma che il danno massimo non li comprende tutti, mentre li comprende', () => {
    /*
      Prima: «Valori distribuiti su 2 complessi separati: il danno massimo non li
      comprende tutti» — mentre `probabile` è il valore INTERO dei beni per la quota di
      settore, cioè li comprende tutti. La nota e il numero si contraddicevano dentro
      lo stesso oggetto.
    */
    expect(note(stima())).not.toContain('non li comprende tutti');
  });

  it('e dichiara che la separazione non è stata misurata', () => {
    expect(note(stima())).toContain('non per distanza misurata');
  });

  it('il capitale resta calcolato sul valore complessivo, e lo dice', () => {
    const s = stima();
    // 6,2 M€ × 0,6 (divisione 25, metalmeccanica) = 3,72 M€, arrotondati per eccesso al
    // taglio commerciale: nessun complesso è stato tolto dal conto, ed è questo che la
    // nota deve ammettere.
    expect(s.value?.probabile).toBe(euro(3_800_000));
    expect(note(s)).toContain('valore complessivo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18 · L'assenza di coordinate non è una separazione misurata
// ─────────────────────────────────────────────────────────────────────────────

describe('18 · «Ubicazione isolata» è una misura, e va fatta per dirla', () => {
  const senzaCoordinate = analizzaUbicazioni({
    sedeLegale: indirizzo({ via: 'Via Prima', civico: '1' }),
    unitaLocali: [],
    immobili: [
      immobile({ descrizione: 'Deposito', indirizzo: indirizzo({ via: 'Via Seconda', civico: '2' }) }),
    ],
  });

  const conCoordinate = analizzaUbicazioni({
    sedeLegale: indirizzo({ via: 'Via Prima', civico: '1', latitudine: 45.46, longitudine: 9.19 }),
    unitaLocali: [],
    immobili: [
      immobile({
        descrizione: 'Deposito',
        indirizzo: indirizzo({
          via: 'Via Lontana',
          civico: '9',
          comune: 'Torino',
          provincia: 'TO',
          latitudine: 45.07,
          longitudine: 7.68,
        }),
      }),
    ],
  });

  it('senza coordinate non dichiara l’ubicazione isolata dalle altre', () => {
    // Prima: «Ubicazione isolata rispetto alle altre note.» — una separazione MISURATA,
    // affermata su zero misure. In produzione nessuna unità locale ha coordinate.
    const motivi = senzaCoordinate.complessiIncendio.map((c) => c.motivo).join(' § ');
    expect(motivi).not.toContain('Ubicazione isolata rispetto alle altre note.');
  });

  it('e dice invece che la distanza non è stata misurata', () => {
    const motivi = senzaCoordinate.complessiIncendio.map((c) => c.motivo).join(' § ');
    expect(motivi).toContain('non rilevate');
  });

  it('con le coordinate la separazione è una misura, e si afferma', () => {
    // La guardia: dove il dato c'è, l'affermazione va fatta — degradare tutto sarebbe
    // l'errore opposto e altrettanto inutile.
    const motivi = conCoordinate.complessiIncendio.map((c) => c.motivo).join(' § ');
    expect(conCoordinate.complessiIncendio.length).toBe(2);
    expect(motivi).toContain('Ubicazione isolata rispetto alle altre note.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22 · La soglia finanziaria non si afferma senza fatturato né attivo
// ─────────────────────────────────────────────────────────────────────────────

describe('22 · La classe dimensionale dichiara su che cosa è stata decisa', () => {
  const soloAddetti = () => classifySize({ addetti: 5, fatturato: null, totaleAttivo: null });

  it('non resta a confidenza alta quando il criterio finanziario non è stato verificato', () => {
    // Prima: 'alta', e una nota identica a quella di un'impresa con entrambi i dati.
    // Il caso è reale: 1 risposta su 3 registrate ha tutti gli aggregati a null.
    expect(soloAddetti().confidence).not.toBe('alta');
  });

  it('e non afferma una soglia che non ha misurato', () => {
    const n = note(soloAddetti());
    expect(n).toContain('non è stato verificato');
  });

  it('con entrambi i dati la classificazione resta accertata', () => {
    const completa = classifySize({
      addetti: 35,
      fatturato: euro(6_480_000),
      totaleAttivo: euro(6_055_000),
    });
    expect(completa.value).toBe('piccola');
    expect(completa.confidence).toBe('alta');
  });

  it('dichiara che l’aggregazione delle imprese associate e collegate non è stata eseguita', () => {
    /*
      La Raccomandazione 2003/361/CE non è il solo art. 2: gli artt. 3 e 6 dell'allegato
      impongono di sommare i dati delle imprese associate e collegate. Il motore applica
      l'art. 2 ai dati della sola impresa, e su un'impresa di gruppo la classe che ne esce
      può essere inferiore a quella di legge — con essa il termine dell'obbligo CAT NAT.
      Finché l'aggregazione non c'è, il limite si dichiara.
    */
    const n = note(
      classifySize({ addetti: 35, fatturato: euro(6_480_000), totaleAttivo: euro(6_055_000) }),
    );
    expect(n).toContain('artt. 3 e 6');
  });
});
