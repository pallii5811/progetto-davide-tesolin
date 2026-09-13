import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile, demoPolizze } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';
import { PROROGHE_SETTORIALI, TERMINI_CATNAT } from '../src/coverage/catnat.js';
import { computeSumsInsured, UBICAZIONI_CON_SUPERFICIE } from '../src/coverage/sums-insured.js';
import { indicatoriDaArchivio } from '../src/company/indicators.js';
import { traduciDescrizioneArchivio } from '../src/shared/traduzioni-archivio.js';
import { analizzaAssetto } from '../src/governance/assetto.js';
import { formattaGiorno } from '../src/shared/tempo.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { Assetti, Carica, Socio } from '../src/company/profile.js';

/**
 * I difetti letti sulla scheda di un carpentiere metallico in provincia di Brescia.
 *
 * RED GROUP S.R.L., 13/09/2026, analisi approfondita acquistata. Score e fido tornavano al
 * centesimo, la matrice dei rischi pure. I difetti stavano tutti fra due righe della stessa
 * pagina: una data di legge sbagliata di un giorno, una nota che negava i tre fattori
 * elencati sopra, un indice pagato e dichiarato mancante, un giudizio sul capitale sotto un
 * ROE del 17,89 %, una carica in inglese, un monte salari chiamato capitale.
 */

const profilo = demoCompanyProfile();
const polizze = demoPolizze();
const archivio = profilo.indicatoriFornitore;

/** La demo senza schema CEE: il percorso che gira in produzione. */
function conArchivio(modifiche: Partial<CompanyProfile['indicatoriFornitore']>): CompanyProfile {
  return { ...profilo, bilanci: [], indicatoriFornitore: { ...archivio, ...modifiche } };
}

const analizza = (p: CompanyProfile) => analyzeCompany(p, polizze, DEMO_AS_OF);
const fattore = (a: ReturnType<typeof analizza>, chiave: string) =>
  a.creditScore.value.factors.find((f) => f.key === chiave)!;
const noteDelloScore = (a: ReturnType<typeof analizza>): string =>
  a.creditScore.explanation.notes.join(' ');

describe('1 · CAT NAT: piccole e micro al 31 dicembre 2025', () => {
  it('è il termine del D.L. 39/2025, non il giorno dopo', () => {
    expect(formattaGiorno(TERMINI_CATNAT.piccola)).toBe('31/12/2025');
    expect(formattaGiorno(TERMINI_CATNAT.micro)).toBe('31/12/2025');
  });

  it('e la pesca resta al 31 dicembre 2026, per il D.L. 25/2026 art. 9 c. 6', () => {
    // La proroga del Milleproroghe al 31 marzo è stata superata: chi la rimettesse
    // dichiarerebbe inadempiente un'impresa ittica che non lo è.
    expect(formattaGiorno(PROROGHE_SETTORIALI['03']!.termine)).toBe('31/12/2026');
  });
});

describe('2 · La nota del livello sintetico non nega i fattori che il punteggio ha valutato', () => {
  const VECCHIA =
    'Analisi condotta sugli aggregati di bilancio (fatturato, patrimonio netto, totale attivo, ' +
    'costo del personale). Redditività, liquidità e sostenibilità del debito non sono valutabili ' +
    'senza il bilancio in schema CEE dettagliato.';

  it('con gli indici dell’archivio li dichiara valutati, e non valutabili nessuno', () => {
    const a = analizza(conArchivio({}));
    for (const chiave of ['redditivita', 'liquidita', 'sostenibilita-debito']) {
      expect(fattore(a, chiave).score, chiave).not.toBeNull();
    }
    expect(noteDelloScore(a)).not.toContain('non sono valutabili senza il bilancio');
    expect(noteDelloScore(a)).toContain(
      'Redditività, liquidità e sostenibilità del debito sono valutate sugli indici che il Registro Imprese elabora sul bilancio depositato.',
    );
  });

  it('senza nessuno dei tre, la frase è quella di prima parola per parola', () => {
    const a = analizza(
      conArchivio({
        kpi: null,
        solidita: null,
        cicloFinanziario: null,
        leveFinanziarie: null,
        coperturaOneri: null,
      }),
    );
    expect(noteDelloScore(a)).toContain(VECCHIA);
  });

  it('quando manca uno solo, nomina quello e solo quello', () => {
    const a = analizza(conArchivio({ solidita: null, cicloFinanziario: null }));
    expect(fattore(a, 'liquidita').score).toBeNull();
    expect(noteDelloScore(a)).toContain('Redditività e sostenibilità del debito sono valutate');
    expect(noteDelloScore(a)).toContain(
      'Liquidità non è valutabile senza il bilancio in schema CEE dettagliato.',
    );
  });
});

describe('3 · L’esercizio di riferimento è quello degli aggregati, non da chiedere al cliente', () => {
  it('senza schema CEE dichiara l’anno del bilancio sintetico', () => {
    const a = analizza(conArchivio({}));
    const anno = profilo.bilanciSintetici[0]!.value.anno;
    const voce = a.creditScore.explanation.inputs.find((i) => i.label === 'Esercizio di riferimento');
    expect(voce?.value).toBe(`${String(anno)} (aggregati del Registro Imprese)`);
  });

  it('con lo schema CEE resta l’anno del bilancio, come prima', () => {
    const a = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    const voce = a.creditScore.explanation.inputs.find((i) => i.label === 'Esercizio di riferimento');
    expect(voce?.value).toMatch(/^\d{4}$/);
  });
});

describe('4 · La redditività insufficiente si dice con l’indice che l’ha misurata', () => {
  it('con il solo margine EBITDA non parla di capitale investito', () => {
    // I numeri veri: margine EBITDA 3,46 %, ROI fuori dal punteggio, ROE 17,89 % a schermo.
    const a = analizza(conArchivio({ kpi: { ...archivio.kpi!, marginePercentualeEbitda: 3.46 } }));
    const redditivita = fattore(a, 'redditivita');
    expect(redditivita.score).toBeLessThan(45);
    expect(redditivita.rationale).not.toContain('capitale investito');
    expect(redditivita.rationale).toContain('il margine EBITDA è il 3,5%');
  });

  it('con il margine negativo non dice «poco spazio»: dice che non copre i costi', () => {
    // Trovato dall'istantanea del motore, su un'impresa vera con EBITDA di −209.451 €.
    const a = analizza(conArchivio({ kpi: { ...archivio.kpi!, marginePercentualeEbitda: -3.1 } }));
    const redditivita = fattore(a, 'redditivita');
    expect(redditivita.rationale).toContain('il margine EBITDA è negativo');
    expect(redditivita.rationale).not.toContain('poco spazio');
  });
});

describe('5 · PFN/EBITDA dall’archivio: il secondo campo, e il segno', () => {
  const leve = (pfn: number | null, netta: number | null) => ({
    ebitdaLevaLorda: null,
    ebitdaLevaNetta: netta,
    pfnSuEbitda: pfn,
    ffoLevaNetta: null,
  });
  const conEbitda = (ebitda: number | null) => ({ ...archivio.risultatiOperativi!, ebitda });

  it('se pfnEbitda manca legge la leva netta, che è lo stesso indice', () => {
    const ind = indicatoriDaArchivio({
      ...archivio,
      leveFinanziarie: leve(null, 0.967),
      risultatiOperativi: conEbitda(139_088),
    });
    expect(ind?.pfnSuEbitda).toBe(0.967);
  });

  it('con l’EBITDA negativo il rapporto non vale come cassa netta', () => {
    const ind = indicatoriDaArchivio({
      ...archivio,
      leveFinanziarie: leve(-45.5959, -45.5959),
      risultatiOperativi: conEbitda(-209_451),
    });
    expect(ind?.pfnSuEbitda).toBeNull();
  });

  it('e senza un EBITDA noto il segno non si legge', () => {
    const ind = indicatoriDaArchivio({
      ...archivio,
      leveFinanziarie: leve(1.2, 1.2),
      risultatiOperativi: null,
    });
    expect(ind?.pfnSuEbitda).toBeNull();
  });

  it('la scheda non dice più «da rilevare in intervista» accanto alla leva dell’archivio', () => {
    const a = analizza(
      conArchivio({ leveFinanziarie: leve(null, 0.967), risultatiOperativi: conEbitda(139_088) }),
    );
    expect(fattore(a, 'sostenibilita-debito').details.join(' ')).toContain('PFN / EBITDA: 0,97×');
  });

  it('dove c’erano entrambi, niente cambia', () => {
    expect(indicatoriDaArchivio(archivio)?.pfnSuEbitda).toBe(archivio.leveFinanziarie!.pfnSuEbitda);
  });
});

describe('6 · Cosa sbloccherebbe il bilancio CEE: indice per indice', () => {
  const voci = (p: CompanyProfile): readonly string[] =>
    analizza(p).arricchimentiPossibili.find((a) => a.dato === 'Bilancio in schema CEE dettagliato')
      ?.sbloccherebbe ?? [];

  it('manca la sola PFN/EBITDA: la voce chiede solo quella', () => {
    const elenco = voci(conArchivio({ leveFinanziarie: null }));
    expect(elenco).toContain('Sostenibilità del debito (PFN/EBITDA)');
    expect(elenco.join(' ')).not.toContain('copertura oneri finanziari');
  });

  it('manca il solo ciclo del circolante: non promette gli indici di liquidità', () => {
    const elenco = voci(conArchivio({ cicloFinanziario: null }));
    expect(elenco).toContain('Ciclo del circolante');
    expect(elenco.join(' ')).not.toMatch(/current ratio|quick ratio/);
  });

  it('quando mancano tutti, le frasi sono quelle di prima', () => {
    const elenco = voci(
      conArchivio({ solidita: null, cicloFinanziario: null, leveFinanziarie: null, coperturaOneri: null }),
    );
    expect(elenco).toContain('Indici di liquidità (current ratio, quick ratio) e ciclo del circolante');
    expect(elenco).toContain('Sostenibilità del debito (PFN/EBITDA, copertura oneri finanziari)');
  });
});

function carica(nominativo: string, ruolo: string, rappresentante: boolean): Carica {
  return {
    nominativo,
    codiceFiscale: null,
    ruolo,
    dataNomina: null,
    isRappresentanteLegale: rappresentante,
    eta: null,
    dataNascita: null,
    luogoNascita: null,
  };
}

function assetti(cariche: readonly Carica[]): Assetti {
  const soci = [
    {
      denominazione: 'SOCIO UNO',
      codiceFiscale: null,
      tipo: 'persona-fisica',
      quotaPercentuale: 50,
      quotaValore: null,
    },
    {
      denominazione: 'SOCIO DUE',
      codiceFiscale: null,
      tipo: 'persona-fisica',
      quotaPercentuale: 50,
      quotaValore: null,
    },
  ] as unknown as Socio[];
  return { soci, cariche, controllante: null, controllate: [] };
}

describe('7 · Le cariche misurate codice per codice non restano in inglese', () => {
  it.each([
    ['Director', 'amministratore'],
    ['Technical manager', 'responsabile tecnico'],
    ['Procurator/attorney/representative', 'procuratore'],
    ['Auditor', 'revisore'],
  ])('«%s» diventa «%s»', (inglese, italiano) => {
    expect(traduciDescrizioneArchivio(inglese)).toBe(italiano);
  });

  it('la frase della persona chiave dice «(amministratore)», non «(director)»', () => {
    const a = analizzaAssetto(assetti([carica('DOGALI MICHELE', 'Director', true)]), {
      formaGiuridica: 'srl',
      addetti: 15,
    });
    const persona = a.implicazioni.find((i) => i.titolo === 'Persona chiave — DOGALI MICHELE');
    expect(persona?.conseguenza).toContain('(amministratore)');
    expect(persona?.conseguenza).not.toMatch(/director/i);
  });

  it('il procuratore del codice PC resta fuori dalle persone chiave, come quello speciale', () => {
    const a = analizzaAssetto(
      assetti([
        carica('ROSSI MARIO', 'Director', true),
        carica('BIANCHI LUCA', 'Procurator/attorney/representative', true),
      ]),
      { formaGiuridica: 'srl', addetti: 15 },
    );
    const titoli = a.implicazioni.map((i) => i.titolo);
    expect(titoli).toContain('Persona chiave — ROSSI MARIO');
    expect(titoli).not.toContain('Persona chiave — BIANCHI LUCA');
  });
});

describe('8 · Il monte salari non si chiama capitale', () => {
  const azione = (id: string): string =>
    analyzeCompany(profilo, [], DEMO_AS_OF).gap.gaps.find((g) => g.definition.id === id)?.azione ?? '';

  it('infortuni dipendenti: «sul monte salari annuo», non «con capitale di»', () => {
    expect(azione('infortuni-dipendenti')).toContain('sul monte salari annuo di');
    expect(azione('infortuni-dipendenti')).not.toContain('con capitale di');
  });

  it('le coperture a capitale continuano a dire «con capitale di»', () => {
    expect(azione('incendio')).toContain('con capitale di');
  });

  /*
    Il rovescio, trovato dall'istantanea del motore e non da un test.

    Anche l'RCO dichiara `base: 'monte-salari'`, perché il premio si calcola sulle
    retribuzioni; ma il suo importo raccomandato è il massimale per persona. La prima
    versione della correzione guardava la base, e su nove imprese su undici scriveva
    «Attivare la copertura RCO sul monte salari annuo di 2.500.000 €».
  */
  it('RCO: il massimale resta un capitale, anche se la base del premio è il monte salari', () => {
    expect(azione('rco')).toContain('con capitale di');
    expect(azione('rco')).not.toContain('monte salari');
  });
});

describe('9 · Il capitale fabbricati dichiara fra gli input su quante ubicazioni poggia', () => {
  const fatti = {
    dimensione: 'piccola',
    atecoSezione: 'C',
    atecoDivisione: '25',
  } as unknown as CompanyFacts;
  const inputs = (coperte: number, totali: number) =>
    computeSumsInsured(fatti, null, [], {
      superficieCartograficaMq: 8_230,
      ubicazioniConSuperficie: coperte,
      ubicazioniTotali: totali,
    }).fabbricati.explanation.inputs;

  it('una su due: l’input c’è, e dice «1 su 2»', () => {
    expect(inputs(1, 2).find((i) => i.label === UBICAZIONI_CON_SUPERFICIE)?.value).toBe('1 su 2');
  });

  it('tutte coperte: l’input non compare', () => {
    expect(inputs(2, 2).find((i) => i.label === UBICAZIONI_CON_SUPERFICIE)).toBeUndefined();
  });
});
