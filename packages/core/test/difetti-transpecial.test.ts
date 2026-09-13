import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile, parseAteco } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';
import type { CompanyFacts } from '../src/company/facts.js';
import { stimaDannoMassimo } from '../src/coverage/danno-massimo.js';
import { trasportoSuStrada } from '../src/company/trasporto-su-strada.js';

/**
 * I difetti letti sulla scheda di un autotrasportatore in provincia di Brescia.
 *
 * TRANSPECIAL S.R.L., 49.41, 13/09/2026. Score e fido tornavano con le formule; non tornavano
 * le frasi accanto ai numeri, e il piano d'azione non conteneva l'RCA.
 */
const profilo = demoCompanyProfile();
const archivio = profilo.indicatoriFornitore;
const conArchivio = (modifiche: Partial<CompanyProfile['indicatoriFornitore']>): CompanyProfile => ({
  ...profilo,
  bilanci: [],
  indicatoriFornitore: { ...archivio, ...modifiche },
});
const fattore = (p: CompanyProfile, chiave: string) =>
  analyzeCompany(p, [], DEMO_AS_OF).creditScore.value.factors.find((f) => f.key === chiave)!;

describe('1 · Liquidità: sotto 1 non è «appena sufficiente»', () => {
  it('current ratio 0,94 con ciclo breve: lo dice, con i numeri', () => {
    const l = fattore(
      conArchivio({ solidita: { ...archivio.solidita!, currentRatio: 0.94, acidTest: 0.94 } }),
      'liquidita',
    );
    expect(l.score ?? 0, 'la prova deve cadere nella fascia di mezzo').toBeGreaterThanOrEqual(45);
    expect(l.score ?? 100).toBeLessThan(70);
    expect(l.rationale).toContain('non coprono per intero gli impegni a breve (0,94×)');
    expect(l.rationale).not.toContain('appena sufficiente');
  });
});

describe('2 · Solidità: «nella norma» non si dice a immobilizzazioni scoperte', () => {
  it('copertura 0,68× con patrimonio sopra il 20%', () => {
    const s = fattore(
      conArchivio({
        solidita: { ...archivio.solidita!, tassoCoperturaImmobilizzazioni: 0.68 },
        indebitamento: { ...archivio.indebitamento!, gradoDiCapitalizzazione: 0.216 },
      }),
      'solidita',
    );
    expect(s.score ?? 0, 'la prova deve cadere nella fascia di mezzo').toBeGreaterThanOrEqual(45);
    expect(s.score ?? 100).toBeLessThan(70);
    expect(s.rationale).toContain('coperte solo 0,68×');
    expect(s.rationale).not.toContain('nella norma');
  });
});

describe('3 · Redditività: con l’EBIT in perdita si dice', () => {
  const conMargineEdEbit = (margine: number, ebit: number) =>
    conArchivio({
      kpi: { ...archivio.kpi!, marginePercentualeEbitda: margine },
      risultatiOperativi: { ...archivio.risultatiOperativi!, ebit },
    });

  it('TRANSPECIAL: margine 3,28% ed EBIT −109.612 €', () => {
    const r = fattore(conMargineEdEbit(3.28, -109_612), 'redditivita');
    expect(r.rationale).toContain('il risultato operativo è negativo');
    expect(r.rationale).toContain('109.612 €');
    expect(r.rationale).not.toContain('poco spazio');
  });

  it('con l’EBIT positivo la frase resta quella del margine', () => {
    const r = fattore(conMargineEdEbit(3.46, 114_046), 'redditivita');
    expect(r.rationale).toContain('il margine EBITDA è il 3,5%');
    expect(r.rationale).not.toContain('negativo');
  });
});

describe('4 · Il trasporto su strada ha l’RCA nel piano', () => {
  const conAttivita = (codice: string): CompanyProfile => ({
    ...profilo,
    bilanci: [],
    anagrafica: {
      ...profilo.anagrafica,
      value: { ...profilo.anagrafica.value, atecoPrimario: parseAteco(codice)!, atecoSecondari: [] },
    },
    datiDichiarati: { ...profilo.datiDichiarati, numeroVeicoli: null },
  });

  it('49.41 è trasporto su strada, 28.99 no', () => {
    const f = (codice: string) =>
      ({ ateco: parseAteco(codice)!, atecoSecondari: [] }) as unknown as CompanyFacts;
    expect(trasportoSuStrada(f('49.41.00'))).toBe(true);
    expect(trasportoSuStrada(f('49.32.10'))).toBe(true);
    expect(trasportoSuStrada(f('28.99.99'))).toBe(false);
  });

  it('TRANSPECIAL: RC auto nel piano, con l’obbligo di legge', () => {
    const rca = analyzeCompany(conAttivita('49.41.00'), [], DEMO_AS_OF).gap.gaps.find(
      (g) => g.definition.id === 'rca-flotta',
    );
    expect(rca, 'l’RCA manca dal piano di un autotrasportatore').toBeDefined();
    expect(rca!.obbligoDiLegge).toBe(true);
    expect(rca!.obbligo.dovuto).toBe(true);
    expect(rca!.obbligo.fonte).toContain('trasporto su strada');
    // La motivazione dice perché, non «se l'impresa dispone di veicoli».
    expect(rca!.motivazioneAdeguatezza).toContain(
      'Trasporto su strada: i veicoli sono lo strumento dell’attività',
    );
    expect(rca!.motivazioneAdeguatezza).not.toContain('Se l’impresa dispone di veicoli');
  });

  it('TRANSPECIAL: il rischio flotta è accertato, non «parco non rilevato»', () => {
    const flotta = analyzeCompany(conAttivita('49.41.00'), [], DEMO_AS_OF).rischi.risks.find(
      (r) => r.definition.id === 'sinistro-flotta',
    );
    const identifica = flotta?.identificationRules.find((r) => r.ruleId === 'flotta/veicoli-aziendali');
    expect(identifica, 'il rischio flotta non è stato identificato').toBeDefined();
    expect(identifica!.suDatoIgnoto).toBe(false);
    expect(identifica!.rationale).toContain('Trasporto su strada');
  });

  it('un’impresa qualunque senza veicoli rilevati non riceve un obbligo certo', () => {
    const rca = analyzeCompany(conAttivita('28.99.99'), [], DEMO_AS_OF).gap.gaps.find(
      (g) => g.definition.id === 'rca-flotta',
    );
    expect(rca?.obbligoDiLegge ?? false).toBe(false);
  });
});

describe('5 · Il danno probabile dichiara la concentrazione', () => {
  const fatti = (unita: number) =>
    ({ atecoDivisione: '49', numeroUnitaLocali: unita }) as unknown as CompanyFacts;

  it('un solo complesso: quota alzata e dichiarata', () => {
    const d = stimaDannoMassimo(Money.euro(1_000_000), fatti(1), [], null).value!;
    expect(d.concentrazioneApplicata).toBe(true);
    expect(d.quota).toBeCloseTo(0.7 * 1.15, 9);
  });

  it('più sedi: nessun aumento', () => {
    const d = stimaDannoMassimo(Money.euro(1_000_000), fatti(3), [], null).value!;
    expect(d.concentrazioneApplicata).toBe(false);
    expect(d.quota).toBeCloseTo(0.7, 9);
  });

  it('quota già piena: il 15% non sposta niente e non si dichiara', () => {
    const ignota = { atecoDivisione: null, numeroUnitaLocali: 1 } as unknown as CompanyFacts;
    const d = stimaDannoMassimo(Money.euro(1_000_000), ignota, [], null).value!;
    expect(d.quota).toBe(1);
    expect(d.concentrazioneApplicata).toBe(false);
  });
});
