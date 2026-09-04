import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile, demoPolizze } from '../src/index.js';
import type { CompanyProfile, Indirizzo } from '../src/index.js';
import { analizzaUbicazioni } from '../src/company/ubicazioni.js';

/**
 * Le frasi si compongono dai valori, e la scheda non contraddice sé stessa.
 *
 * Sei difetti usciti insieme sulla stessa scheda (COMINOTTI S.R.L., 02/09/2026), con
 * l'auditor a zero rilievi, perché ognuno stava fra due righe lontane: una frase scelta
 * dalla soglia del punteggio invece che dai numeri, un ruolo stampato in inglese accanto
 * alla sua traduzione, un elenco fisso che chiedeva ciò che l'archivio aveva già dato, un
 * «EBITDA non calcolabile» sotto un EBITDA stampato, un peso ricopiato a mano, una virgola
 * raddoppiata. Qui ciascuno ha la sua riga rossa.
 */
const profilo = demoCompanyProfile();
const polizze = demoPolizze();

function conArchivio(modifiche: Partial<CompanyProfile['indicatoriFornitore']>): CompanyProfile {
  return {
    ...profilo,
    bilanci: [],
    indicatoriFornitore: { ...profilo.indicatoriFornitore, ...modifiche },
  };
}

describe('La frase della liquidità dice ciò che i numeri accanto mostrano', () => {
  it('con current ratio sopra 1 e quick ratio sotto, non nega la copertura delle attività correnti', () => {
    // I numeri veri: current ratio 1,37, quick ratio 0,53, ciclo 313 giorni. Il punteggio
    // era 33 e la frase diceva «gli impegni a breve non sono coperti dalle attività
    // correnti» — falso, e smentito dalla riga sotto.
    const analisi = analyzeCompany(
      conArchivio({
        solidita: { ...profilo.indicatoriFornitore.solidita!, currentRatio: 1.37, acidTest: 0.53 },
        cicloFinanziario: { ...profilo.indicatoriFornitore.cicloFinanziario!, durataCicloFinanziario: 313 },
      }),
      polizze,
      DEMO_AS_OF,
    );
    const liquidita = analisi.creditScore.value.factors.find((f) => f.key === 'liquidita');
    expect(liquidita?.score).not.toBeNull();
    expect(liquidita!.score!).toBeLessThan(45);
    expect(liquidita?.rationale).toContain('coprono gli impegni a breve (1,37×)');
    expect(liquidita?.rationale).toContain('0,53×');
    expect(liquidita?.rationale).not.toContain('non sono coperti');
  });

  it('con current ratio sotto 1 lo dice, perché è vero', () => {
    const analisi = analyzeCompany(
      conArchivio({
        solidita: { ...profilo.indicatoriFornitore.solidita!, currentRatio: 0.8, acidTest: 0.53 },
        cicloFinanziario: { ...profilo.indicatoriFornitore.cicloFinanziario!, durataCicloFinanziario: 313 },
      }),
      polizze,
      DEMO_AS_OF,
    );
    const liquidita = analisi.creditScore.value.factors.find((f) => f.key === 'liquidita');
    expect(liquidita?.rationale).toContain('non sono coperti dalle attività correnti');
  });
});

describe('La carica si stampa tradotta, come nel riquadro accanto', () => {
  it('«chairman of board of directors» diventa «presidente del consiglio di amministrazione»', () => {
    const analisi = analyzeCompany(
      {
        ...profilo,
        assetti: {
          ...profilo.assetti!,
          value: {
            ...profilo.assetti!.value,
            cariche: [
              {
                nominativo: 'BIANCHI LUCIA',
                codiceFiscale: null,
                ruolo: 'CHAIRMAN OF BOARD OF DIRECTORS',
                dataNomina: null,
                isRappresentanteLegale: true,
                eta: 50,
                dataNascita: null,
                luogoNascita: null,
              },
            ],
          },
        },
      },
      polizze,
      DEMO_AS_OF,
    );
    const persona = analisi.assetto.implicazioni.find((i) => i.titolo === 'Persona chiave — BIANCHI LUCIA');
    expect(persona?.conseguenza).toContain('(presidente del consiglio di amministrazione)');
    expect(persona?.conseguenza).not.toMatch(/chairman|board of directors/i);
  });
});

describe('L’elenco di ciò che sbloccherebbe il bilancio dettagliato chiede solo ciò che manca', () => {
  const vociDelBilancio = (analisi: ReturnType<typeof analyzeCompany>): readonly string[] =>
    analisi.arricchimentiPossibili.find((a) => a.dato === 'Bilancio in schema CEE dettagliato')
      ?.sbloccherebbe ?? [];

  it('non promette gli indici di liquidità e la sostenibilità del debito quando l’archivio li dà già', () => {
    const voci = vociDelBilancio(analyzeCompany(conArchivio({}), polizze, DEMO_AS_OF));
    expect(voci.join(' ')).not.toMatch(/current ratio|PFN\/EBITDA/);
    expect(voci).toContain("Altman Z''-score");
    expect(voci.join(' ')).toContain('Margine di contribuzione');
  });

  it('li promette quando l’archivio non li ha', () => {
    const voci = vociDelBilancio(
      analyzeCompany(
        conArchivio({
          solidita: null,
          cicloFinanziario: null,
          leveFinanziarie: null,
          coperturaOneri: null,
        }),
        polizze,
        DEMO_AS_OF,
      ),
    );
    expect(voci.join(' ')).toMatch(/current ratio/);
    expect(voci.join(' ')).toMatch(/PFN\/EBITDA/);
  });

  it('il peso del fattore «eventi negativi» è quello stampato in scheda, non i punti', () => {
    const analisi = analyzeCompany({ ...profilo, eventiNegativi: null }, polizze, DEMO_AS_OF);
    const fattore = analisi.creditScore.value.factors.find((f) => f.key === 'eventi-negativi')!;
    const atteso = `${(fattore.weight * 100).toFixed(0)}%`;
    const voce = analisi.arricchimentiPossibili
      .find((a) => a.dato === 'Protesti e pregiudizievoli')
      ?.sbloccherebbe.find((s) => s.startsWith('Il fattore che pesa'));
    expect(voce).toContain(atteso);
    expect(voce).not.toContain('20%');
  });
});

describe('Il fido non dice «EBITDA non calcolabile» sotto un EBITDA stampato', () => {
  it('usa l’EBITDA dell’archivio camerale e lo dichiara accanto al numero', () => {
    const analisi = analyzeCompany(conArchivio({}), polizze, DEMO_AS_OF);
    const etichette = analisi.creditLimit.explanation.inputs.map((i) => i.label);
    expect(etichette).toContain('EBITDA (dall’archivio camerale)');
    expect(Money.toEuro(analisi.creditLimit.value.limiteFlusso!)).toBe(3 * 850_000);
    expect(analisi.creditLimit.explanation.notes.join(' ')).toContain('archivio camerale');
  });

  it('dal bilancio dettagliato l’etichetta resta «EBITDA», senza attribuzione', () => {
    const analisi = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    const etichette = analisi.creditLimit.explanation.inputs.map((i) => i.label);
    expect(etichette).toContain('EBITDA');
    expect(etichette).not.toContain('EBITDA (dall’archivio camerale)');
  });
});

describe('L’etichetta dell’ubicazione non raddoppia la virgola', () => {
  it('una via arrivata con la virgola in coda esce «102, AGNOSINE (BS)»', () => {
    const agnosine: Indirizzo = {
      via: "LOCALITA' LOC. FONDI ZONA INDUSTRIALE 102,",
      civico: null,
      cap: '25071',
      comune: 'AGNOSINE',
      provincia: 'BS',
      frazione: null,
      regione: 'Lombardia',
      latitudine: null,
      longitudine: null,
    };
    const analisi = analizzaUbicazioni({ sedeLegale: agnosine, unitaLocali: [], immobili: [] });
    const etichetta = analisi.ubicazioni[0]?.etichetta ?? '';
    expect(etichetta).toContain('INDUSTRIALE 102, AGNOSINE (BS)');
    expect(etichetta).not.toMatch(/,,/);
  });
});

describe('La frase della solidità dice cosa regge e cosa no', () => {
  it('con il patrimonio al 13,7% dell’attivo non dice «nella norma»', () => {
    // I numeri veri: equity ratio 13,7 %, 6,3× di debiti sui mezzi propri, immobilizzazioni
    // coperte 3,05× dalle fonti durevoli. Il punteggio stava a 48 per la copertura, e la
    // frase — scelta dalla soglia — diceva «Patrimonializzazione nella norma».
    const profiloSottile: CompanyProfile = {
      ...profilo,
      bilanci: [],
      bilanciSintetici: profilo.bilanciSintetici.map((s) => ({
        ...s,
        value: { ...s.value, patrimonioNetto: Money.euro(719_768), totaleAttivo: Money.euro(5_250_000) },
      })),
      indicatoriFornitore: {
        ...profilo.indicatoriFornitore,
        solidita: { ...profilo.indicatoriFornitore.solidita!, tassoCoperturaImmobilizzazioni: 3.05 },
      },
    };
    const analisi = analyzeCompany(profiloSottile, polizze, DEMO_AS_OF);
    const solidita = analisi.creditScore.value.factors.find((f) => f.key === 'solidita');
    expect(solidita?.rationale).toContain('Patrimonio sottile (13,7%');
    expect(solidita?.rationale).toContain('coperte 3,05×');
    expect(solidita?.rationale).not.toContain('nella norma');
  });
});
