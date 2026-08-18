/**
 * Assetto proprietario: chi controlla, chi è persona chiave, cosa manca.
 *
 * La compagine usata nel primo blocco è **reale**: OPENAPI S.p.A. risulta partecipata al
 * 100% da OPEN HOLDING S.R.L. Serve a fissare il caso che il codice sbagliava prima:
 * l'appartenenza a un gruppo veniva dedotta da un campo `parentCompany` che il fornitore
 * non compila mai, mentre la holding è lì, elencata fra i soci, con la sua partita IVA.
 *
 * Conseguenza pratica dell'errore: su ogni controllata la responsabilità da direzione e
 * coordinamento (art. 2497 c.c.) non veniva mai considerata, e la D&O veniva dimensionata
 * come se sopra non ci fosse nessuno.
 */

import { describe, expect, it } from 'vitest';
import { analizzaAssetto } from '../src/governance/assetto.js';
import type { Assetti, Socio } from '../src/company/profile.js';

const PMI = { formaGiuridica: 'srl' as const, addetti: 19 };

function assetti(soci: readonly Partial<Socio>[], cariche: Assetti['cariche'] = []): Assetti {
  return {
    soci: soci.map((s) => ({
      denominazione: s.denominazione ?? 'Socio',
      codiceFiscale: s.codiceFiscale ?? null,
      tipo: s.tipo ?? 'persona-fisica',
      quotaPercentuale: s.quotaPercentuale ?? null,
      quotaValore: null,
    })),
    cariche,
    controllante: null,
    controllate: [],
  };
}

describe('Controllo societario (compagine reale)', () => {
  const openapi = assetti([
    {
      denominazione: 'OPEN HOLDING S.R.L.',
      codiceFiscale: '16935371001',
      tipo: 'persona-giuridica',
      quotaPercentuale: 100,
    },
  ]);

  const analisi = analizzaAssetto(openapi, { formaGiuridica: 'spa', addetti: 19 });

  it('riconosce il gruppo dai soci, non da un campo che il fornitore non manda', () => {
    expect(analisi.tipoControllo).toBe('controllo-societario');
    expect(analisi.capogruppo?.denominazione).toBe('OPEN HOLDING S.R.L.');
    expect(analisi.capogruppo?.controlloDiDiritto).toBe(true);
  });

  it('conserva la partita IVA della capogruppo, che la rende analizzabile', () => {
    // Senza questa, la capogruppo è una stringa in un riquadro; con questa, è la
    // prossima azienda da analizzare — ed è il motivo per cui la si estrae.
    expect(analisi.capogruppo?.partitaIva).toBe('16935371001');
  });

  it('fa scattare la presunzione di direzione e coordinamento', () => {
    expect(analisi.soggettaADirezioneECoordinamento).toBe(true);
    const implicazione = analisi.implicazioni.find((i) => i.riferimento?.includes('2497'));
    expect(implicazione).toBeDefined();
    expect(implicazione?.azione).toMatch(/D&O/);
  });

  it('chiede se la D&O è di gruppo o della singola società', () => {
    expect(analisi.domande.some((d) => /D&O di gruppo/.test(d))).toBe(true);
  });
});

describe('Socio societario unico senza quota dichiarata', () => {
  // Caso frequente nel dato reale: la partecipazione totalitaria è proprio quella per cui
  // la percentuale manca più spesso. Fermarsi alla quota nasconderebbe il gruppo.
  const analisi = analizzaAssetto(
    assetti([{ denominazione: 'HOLDING S.P.A.', tipo: 'persona-giuridica', codiceFiscale: '12345678903' }]),
    PMI,
  );

  it('riconosce comunque il controllo: un socio solo possiede tutto', () => {
    expect(analisi.tipoControllo).toBe('controllo-societario');
    expect(analisi.capogruppo?.denominazione).toBe('HOLDING S.P.A.');
  });

  it('ma non dichiara un controllo di diritto che nessuno ha attestato', () => {
    expect(analisi.capogruppo?.controlloDiDiritto).toBe(false);
    expect(analisi.confidenza).not.toBe('alta');
  });
});

describe('Persona chiave', () => {
  it('segnala il socio unico persona fisica', () => {
    const analisi = analizzaAssetto(
      assetti([{ denominazione: 'MARIO ROSSI', tipo: 'persona-fisica', quotaPercentuale: 100 }]),
      PMI,
    );

    expect(analisi.tipoControllo).toBe('socio-unico-persona-fisica');
    expect(analisi.personeChiave).toHaveLength(1);
    expect(analisi.implicazioni.some((i) => i.titolo === 'Persona chiave')).toBe(true);
  });

  it('non segnala come chiave un socio di minoranza', () => {
    const analisi = analizzaAssetto(
      assetti([
        { denominazione: 'A', tipo: 'persona-fisica', quotaPercentuale: 40 },
        { denominazione: 'B', tipo: 'persona-fisica', quotaPercentuale: 35 },
        { denominazione: 'C', tipo: 'persona-fisica', quotaPercentuale: 25 },
      ]),
      PMI,
    );

    expect(analisi.personeChiave).toHaveLength(0);
    expect(analisi.tipoControllo).toBe('compagine-frammentata');
  });

  it('riconosce lo stallo di una compagine paritetica', () => {
    const analisi = analizzaAssetto(
      assetti([
        { denominazione: 'A', tipo: 'persona-fisica', quotaPercentuale: 50 },
        { denominazione: 'B', tipo: 'persona-fisica', quotaPercentuale: 50 },
      ]),
      PMI,
    );

    expect(analisi.tipoControllo).toBe('compagine-paritetica');
    expect(analisi.implicazioni.some((i) => /stallo/i.test(i.titolo))).toBe(true);
  });
});

describe('Quote espresse in frazione', () => {
  it('legge 0,6 e 0,4 come 60% e 40%, non come sessanta centesimi di punto', () => {
    const analisi = analizzaAssetto(
      assetti([
        { denominazione: 'HOLDING S.R.L.', tipo: 'persona-giuridica', quotaPercentuale: 0.6 },
        { denominazione: 'MARIO ROSSI', tipo: 'persona-fisica', quotaPercentuale: 0.4 },
      ]),
      PMI,
    );

    expect(analisi.quotaPrimoSocio).toBe(60);
    expect(analisi.compagineCompleta).toBe(true);
    // Lette come frazioni, nessuno avrebbe superato la soglia di controllo e il gruppo
    // sarebbe sparito: è la ragione per cui la normalizzazione guarda l'intera compagine.
    expect(analisi.tipoControllo).toBe('controllo-societario');
  });

  it('non trasforma un socio all’1% in un controllante totalitario', () => {
    const analisi = analizzaAssetto(
      assetti([
        { denominazione: 'MAGGIORANZA S.R.L.', tipo: 'persona-giuridica', quotaPercentuale: 99 },
        { denominazione: 'MINORE', tipo: 'persona-fisica', quotaPercentuale: 1 },
      ]),
      PMI,
    );

    expect(analisi.quotaPrimoSocio).toBe(99);
    expect(analisi.soci[1]?.quotaPercentuale).toBe(1);
  });
});

describe('Ciò che il fornitore non dice', () => {
  const analisi = analizzaAssetto(assetti([]), PMI);

  it('dichiara l’assetto non disponibile invece di inventarlo', () => {
    expect(analisi.tipoControllo).toBe('non-disponibile');
    expect(analisi.confidenza).toBe('bassa');
    expect(analisi.capogruppo).toBeNull();
  });

  it('chiede le cariche, che l’anagrafica estesa non contiene', () => {
    // Il fornitore non restituisce gli amministratori a questo livello: dedurli
    // significherebbe scrivere un nome su un documento contrattuale senza fonte.
    expect(analisi.caricheDisponibili).toBe(false);
    expect(analisi.domande.some((d) => /amministratori/i.test(d))).toBe(true);
  });

  it('segnala la compagine incompleta invece di darla per buona', () => {
    const parziale = analizzaAssetto(
      assetti([{ denominazione: 'UNICO NOTO', tipo: 'persona-fisica', quotaPercentuale: 30 }]),
      PMI,
    );

    expect(parziale.compagineCompleta).toBe(false);
    expect(parziale.confidenza).toBe('media');
    expect(parziale.domande.some((d) => /30%/.test(d))).toBe(true);
  });

  it('con le cariche note non fa la domanda inutile', () => {
    const conCariche = analizzaAssetto(
      assetti([{ denominazione: 'MARIO ROSSI', tipo: 'persona-fisica', quotaPercentuale: 100 }], [
        {
          nominativo: 'MARIO ROSSI',
          codiceFiscale: null,
          ruolo: 'Amministratore unico',
          dataNomina: null,
          isRappresentanteLegale: true,
        },
      ]),
      PMI,
    );

    expect(conCariche.caricheDisponibili).toBe(true);
    expect(conCariche.domande.some((d) => /Chi sono gli amministratori/.test(d))).toBe(false);
  });
});

describe('Compagine parziale: ciò che il dato non consente di affermare', () => {
  it('non dichiara socio unico chi detiene una quota di minoranza', () => {
    // Il fornitore ha restituito un solo socio, ma con il 30%: il dato stesso dice che
    // il restante 70% è di qualcun altro. «Socio unico» sarebbe una contraddizione.
    const analisi = analizzaAssetto(
      assetti([{ denominazione: 'SOCIO NOTO', tipo: 'persona-fisica', quotaPercentuale: 30 }]),
      PMI,
    );

    expect(analisi.tipoControllo).not.toBe('socio-unico-persona-fisica');
    expect(analisi.compagineCompleta).toBe(false);
  });

  it('non promuove a controllante una società con quota dichiarata di minoranza', () => {
    const analisi = analizzaAssetto(
      assetti([
        { denominazione: 'SOCIA S.R.L.', tipo: 'persona-giuridica', quotaPercentuale: 30, codiceFiscale: '12345678903' },
      ]),
      PMI,
    );

    // Senza questo controllo, un socio al 30% faceva scattare l'art. 2497 e con esso una
    // raccomandazione sulla D&O di gruppo, per un gruppo che non risulta esistere.
    expect(analisi.capogruppo).toBeNull();
    expect(analisi.soggettaADirezioneECoordinamento).toBe(false);
  });

  it('dichiara comunque il socio unico quando nessuna quota è indicata', () => {
    const analisi = analizzaAssetto(
      assetti([{ denominazione: 'UNICO SOCIO', tipo: 'persona-fisica' }]),
      PMI,
    );

    expect(analisi.tipoControllo).toBe('socio-unico-persona-fisica');
    // Nessuna quota nota: l'affermazione regge sul numero di soci, e la confidenza lo dice.
    expect(analisi.confidenza).toBe('bassa');
  });
});
