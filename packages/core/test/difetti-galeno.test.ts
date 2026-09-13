import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile, parseAteco } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';
import type { FormaGiuridica } from '../src/company/profile.js';
import type { CompanyFacts } from '../src/company/facts.js';
import { computeSumsInsured } from '../src/coverage/sums-insured.js';
import { minimoSanitarioPerSinistro, titoloObbligoSanitario } from '../src/coverage/obbligo-sanitario.js';
import { traduciDescrizioneArchivio } from '../src/shared/traduzioni-archivio.js';

/**
 * I difetti letti sulla scheda di un poliambulatorio in provincia di Brescia.
 *
 * GALENO S.R.L., 86.22.09, 13/09/2026. Il più grave non si vedeva in nessun numero: la
 * motivazione della responsabilità professionale diceva che la copertura è imposta dalla
 * legge, e il piano d'azione la metteva «alla prossima revisione» senza il segno
 * dell'obbligo. L'art. 10 della L. 24/2017 obbliga la struttura sanitaria privata alla
 * copertura della responsabilità verso terzi e verso i prestatori d'opera, e il D.M.
 * 232/2023 ne fissa i massimali minimi.
 */

const profilo = demoCompanyProfile();

function conAttivita(codice: string, forma: FormaGiuridica = 'srl'): CompanyProfile {
  return {
    ...profilo,
    anagrafica: {
      ...profilo.anagrafica,
      value: {
        ...profilo.anagrafica.value,
        atecoPrimario: parseAteco(codice)!,
        atecoSecondari: [],
        formaGiuridica: forma,
      },
    },
  };
}

const voce = (p: CompanyProfile, id: string) =>
  analyzeCompany(p, [], DEMO_AS_OF).gap.gaps.find((g) => g.definition.id === id);

function fatti(codice: string, forma: FormaGiuridica = 'srl'): CompanyFacts {
  const ateco = parseAteco(codice)!;
  return {
    ateco,
    atecoDivisione: ateco.slice(0, 2),
    atecoSezione: 'Q',
    formaGiuridica: forma,
    fatturato: Money.euro(400_000),
    addetti: 14,
    lavoraInCantiere: false,
  } as unknown as CompanyFacts;
}

describe('1 · «Sole owner» è il socio unico', () => {
  it('il codice SOU si traduce', () => {
    expect(traduciDescrizioneArchivio('Sole owner')).toBe('socio unico');
  });
});

describe('2 · Chi è tenuto all’obbligo della L. 24/2017', () => {
  it('la società nell’assistenza sanitaria è una struttura', () => {
    expect(titoloObbligoSanitario(fatti('86.22.09'))).toBe('struttura');
    expect(titoloObbligoSanitario(fatti('87.10.00'))).toBe('struttura');
  });

  it('la ditta individuale nella 86 è il professionista', () => {
    expect(titoloObbligoSanitario(fatti('86.22.09', 'ditta-individuale'))).toBe('professionista');
  });

  it('l’assistenza sociale non residenziale e gli altri settori non sono obbligati', () => {
    expect(titoloObbligoSanitario(fatti('88.10.00'))).toBeNull();
    expect(titoloObbligoSanitario({ ...fatti('28.99.99'), atecoSezione: 'C' })).toBeNull();
  });
});

describe('3 · Il piano d’azione porta l’obbligo, con il suo termine', () => {
  const galeno = conAttivita('86.22.09');

  it.each(['rct', 'rco', 'rc-professionale'])('%s: obbligo di legge, azione immediata', (id) => {
    const v = voce(galeno, id);
    expect(v, `${id} assente dal piano`).toBeDefined();
    expect(v!.obbligoDiLegge).toBe(true);
    expect(v!.piano.urgenza).toBe('immediata');
  });

  it('il termine non è quello della CAT NAT', () => {
    const rct = voce(galeno, 'rct')!;
    expect(rct.piano.termine?.toISOString()).toBe(DEMO_AS_OF.toISOString());
    const catNat = voce(galeno, 'catastrofali')!;
    expect(catNat.piano.termine?.toISOString()).toBe('2025-12-31T22:59:59.999Z');
  });

  it('la motivazione cita la norma e dichiara ciò che va confermato', () => {
    const rct = voce(galeno, 'rct')!;
    expect(rct.motivazioneRiferimenti.join(' ')).toContain('Art. 10, c. 1, L. 24/2017');
    expect(rct.motivazionePresupposti.join(' ')).toContain('autorizzazione della struttura va confermata');
  });

  it('il professionista individuale: obbligata la sola responsabilità professionale', () => {
    const medico = conAttivita('86.22.09', 'ditta-individuale');
    expect(voce(medico, 'rc-professionale')?.obbligoDiLegge).toBe(true);
    expect(voce(medico, 'rct')?.obbligoDiLegge).toBe(false);
  });

  it('un’impresa non sanitaria non vede nessun obbligo nuovo', () => {
    const rct = voce(profilo, 'rct')!;
    expect(rct.obbligoDiLegge).toBe(false);
    expect(rct.motivazioneRiferimenti.join(' ')).not.toContain('24/2017');
  });
});

describe('4 · I massimali minimi del D.M. 232/2023, art. 4', () => {
  it.each([
    ['86.22.09', 'srl', 1_000_000, 'c. 1, lett. a)'],
    ['86.23.00', 'srl', 2_000_000, 'c. 1, lett. b)'],
    ['87.10.00', 'srl', 2_000_000, 'c. 1, lett. b)'],
    ['86.10.00', 'srl', 5_000_000, 'c. 1, lett. c)'],
    ['86.22.09', 'ditta-individuale', 1_000_000, 'c. 2, lett. a)'],
  ] as const)('%s (%s): %d € per sinistro, %s', (codice, forma, euro, lettera) => {
    const m = minimoSanitarioPerSinistro(fatti(codice, forma))!;
    expect(m.euroPerSinistro).toBe(euro);
    expect(m.riferimento).toContain(lettera);
  });

  it('il massimale RCT consigliato non scende mai sotto il minimo di legge', () => {
    const s = computeSumsInsured(fatti('86.10.00'), null, []);
    expect(Money.toEuro(s.massimaleRct.value)).toBeGreaterThanOrEqual(5_000_000);
    expect(s.massimaleRct.explanation.inputs.map((i) => i.label)).toContain('Minimo di legge per sinistro');
  });

  it('fuori dalla sanità non compare nessun minimo', () => {
    const s = computeSumsInsured(
      { ...fatti('28.99.99'), atecoDivisione: '28', atecoSezione: 'C' },
      null,
      [],
    );
    expect(s.massimaleRct.explanation.inputs.map((i) => i.label)).not.toContain(
      'Minimo di legge per sinistro',
    );
  });
});
