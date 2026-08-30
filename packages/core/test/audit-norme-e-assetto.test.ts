/**
 * Norme citate, assetto proprietario, esposizione territoriale: ciò che il prodotto
 * afferma senza sapere.
 *
 * Dieci reperti dell'audit di consegna vivono qui. Hanno in comune una sola forma: una
 * frase vera per QUALCHE impresa, scritta come se fosse vera per TUTTE. Una citazione
 * della S.p.A. su una S.r.l., l'obbligo assicurativo degli avvocati su una software
 * house, «la quasi totalità del capitale» a chi ne ha i due terzi, un ripiego di tabella
 * mostrato come una misura.
 *
 * Ogni prova qui sotto è stata vista fallire sul codice non corretto prima di essere
 * vista passare: un controllo che non ha mai fallito non è un controllo.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { analizzaAssetto } from '../src/governance/assetto.js';
import { analizzaTitolareEffettivo } from '../src/governance/titolare-effettivo.js';
import {
  normaResponsabilitaAmministratori,
  normaRiduzioneCapitalePerPerdite,
} from '../src/governance/norme.js';
import { assessRisks } from '../src/risk/engine.js';
import { territorialExposure, worstExposure } from '../src/risk/geo.js';
import { computeAltmanZ } from '../src/credit/altman.js';
import { computeCreditScore } from '../src/credit/score.js';
import { deriveFacts } from '../src/company/facts.js';
import { reclassify } from '../src/company/financials.js';
import { euro } from '../src/shared/money.js';
import { DEMO_AS_OF, demoCompanyProfile } from '../src/fixtures/demo.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { Bilancio } from '../src/company/financials.js';
import type { Assetti, CompanyProfile, FormaGiuridica, Socio } from '../src/company/profile.js';
import type { RiskId } from '../src/risk/taxonomy.js';

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

/** I riferimenti normativi che il motore attribuisce a un rischio, per questa impresa. */
function riferimentiDi(rischio: RiskId, patch: Partial<CompanyFacts>): readonly string[] {
  const valutati = assessRisks(fatti(patch), DEMO_AS_OF);
  const trovato = valutati.risks.find((r) => r.definition.id === rischio);
  if (trovato === undefined) throw new Error(`Il rischio ${rischio} non è stato identificato`);
  return trovato.definition.riferimenti;
}

/** Le motivazioni di identificazione di un rischio, per questa impresa. */
function motiviDi(rischio: RiskId, patch: Partial<CompanyFacts>): readonly string[] {
  const valutati = assessRisks(fatti(patch), DEMO_AS_OF);
  const trovato = valutati.risks.find((r) => r.definition.id === rischio);
  if (trovato === undefined) throw new Error(`Il rischio ${rischio} non è stato identificato`);
  return trovato.identificationRules.map((r) => r.rationale);
}

function socio(patch: Partial<Socio>): Socio {
  return {
    denominazione: patch.denominazione ?? 'Socio',
    codiceFiscale: patch.codiceFiscale ?? null,
    tipo: patch.tipo ?? 'persona-fisica',
    quotaPercentuale: patch.quotaPercentuale ?? null,
    quotaValore: null,
    socioDal: null,
  };
}

function assetti(soci: readonly Socio[], cariche: Assetti['cariche'] = []): Assetti {
  return { soci, cariche, controllante: null, controllate: [] };
}

/** Il profilo dimostrativo con una compagine sociale diversa. */
function profiloCon(soci: readonly Socio[]): CompanyProfile {
  const base = demoCompanyProfile();
  const originale = base.assetti;
  if (originale === null) throw new Error('Il profilo dimostrativo deve avere gli assetti');
  return {
    ...base,
    assetti: { ...originale, value: { ...originale.value, soci } },
  };
}

/** Un bilancio dimostrativo portato in perdita di capitale. */
function bilancioConPatrimonioNegativo(): Bilancio {
  const grezzo = demoCompanyProfile().bilanci[0]!.value;
  return {
    ...grezzo,
    passivo: { ...grezzo.passivo, utileEsercizio: euro(-4_000_000) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 3 — «Artt. 2392-2395 c.c.» a ogni S.r.l.
// ─────────────────────────────────────────────────────────────────────────────

describe('Responsabilità degli amministratori: la norma segue la forma giuridica (difetto 3)', () => {
  it('su una S.r.l. cita il 2476 e non le norme della S.p.A.', () => {
    const riferimenti = riferimentiDi('responsabilita-amministratori', { formaGiuridica: 'srl' }).join(
      ' | ',
    );
    expect(riferimenti).toContain('2476');
    expect(riferimenti).not.toContain('2392');
  });

  it('su una S.p.A. cita gli artt. 2392-2395', () => {
    const riferimenti = riferimentiDi('responsabilita-amministratori', { formaGiuridica: 'spa' }).join(
      ' | ',
    );
    expect(riferimenti).toContain('2392');
  });

  it('su una cooperativa cita l’art. 2519, non quelle della S.p.A. né quelle della S.r.l.', () => {
    const riferimenti = riferimentiDi('responsabilita-amministratori', {
      formaGiuridica: 'cooperativa',
    }).join(' | ');
    expect(riferimenti).toContain('2519');
  });

  it('nessuna forma riceve una norma diversa da quella che governance/norme.ts le assegna', () => {
    const forme: readonly FormaGiuridica[] = ['spa', 'srl', 'srls', 'sapa', 'cooperativa'];
    for (const forma of forme) {
      const attesa = normaResponsabilitaAmministratori(forma);
      expect(attesa).not.toBeNull();
      expect(riferimentiDi('responsabilita-amministratori', { formaGiuridica: forma })).toContain(attesa);
    }
  });

  it('è l’ultima copia: nessun modulo della corsia cita il 2392 fuori da governance/norme.ts', () => {
    /*
      Il confronto è sul codice EMESSO, non sui commenti: i commenti che spiegano la
      correzione nominano la norma sbagliata apposta, ed è giusto che restino. Si
      cancellano quindi i commenti — di blocco e di riga — sostituendoli con spazi, così
      che i numeri di riga restino quelli veri.

      Si cancellano i commenti, MAI le stringhe: la citazione che si sta cercando vive
      dentro una stringa, e un controllo che le togliesse direbbe «pulito» per non aver
      guardato.

      Il perimetro è la corsia di questo intervento — risk/, governance/, credit/ e
      company/facts.ts. `coverage/metriche-impatto.ts:245` cita 2392 e 2476 insieme, che
      è la forma degradata e non una falsità, ed è comunque il difetto 14 di un'altra
      corsia.
    */
    const senzaCommenti = (sorgente: string): string =>
      sorgente
        .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (riga) => ' '.repeat(riga.length));

    const radice = join(fileURLToPath(new URL('../src', import.meta.url)));
    const cartelle = ['risk', 'governance', 'credit'];
    const colpevoli: string[] = [];

    const file: string[] = [join(radice, 'company', 'facts.ts')];
    for (const cartella of cartelle) {
      for (const nome of readdirSync(join(radice, cartella))) {
        if (nome.endsWith('.ts')) file.push(join(radice, cartella, nome));
      }
    }

    // Un controllo che non ha mai visto nulla non è un controllo: la prova qui è che
    // `governance/norme.ts` — l'unico posto dove la citazione deve stare — viene trovato.
    expect(senzaCommenti(readFileSync(join(radice, 'governance', 'norme.ts'), 'utf8'))).toContain('2392');

    for (const percorso of file) {
      if (percorso.endsWith(join('governance', 'norme.ts'))) continue;
      const righe = senzaCommenti(readFileSync(percorso, 'utf8')).split('\n');
      righe.forEach((riga, i) => {
        if (riga.includes('2392')) colpevoli.push(`${percorso}:${i + 1}`);
      });
    }

    expect(colpevoli).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 4 — la polizza degli avvocati a ogni software house; il 2050 a chiunque
// ─────────────────────────────────────────────────────────────────────────────

describe('RC professionale e RC verso terzi: norme condizionate (difetto 4)', () => {
  const softwareHouse = { atecoSezione: 'J', atecoDivisione: '62' };
  const studioLegale = { atecoSezione: 'M', atecoDivisione: '69' };

  it('non afferma la L. 124/2017 a una software house', () => {
    expect(riferimentiDi('rc-professionale', softwareHouse).join(' | ')).not.toContain('124/2017');
  });

  it('non afferma l’obbligo del professionista iscritto all’albo fuori dalla sezione M', () => {
    const riferimenti = riferimentiDi('rc-professionale', softwareHouse).join(' | ');
    expect(riferimenti).not.toContain('137/2012');
    expect(riferimenti).not.toContain('138/2011');
  });

  it('lo afferma dove l’albo c’è: sezione M', () => {
    const riferimenti = riferimentiDi('rc-professionale', studioLegale).join(' | ');
    expect(riferimenti).toContain('137/2012');
  });

  it('cita comunque la diligenza professionale, che vale per chiunque presti servizi', () => {
    expect(riferimentiDi('rc-professionale', softwareHouse).join(' | ')).toContain('2236');
  });

  it('non cita l’art. 2050 — attività pericolose — a un’impresa qualunque', () => {
    expect(riferimentiDi('rc-verso-terzi', {}).join(' | ')).not.toContain('2050');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 30 — «Società di capitali» detto a una cooperativa
// ─────────────────────────────────────────────────────────────────────────────

describe('La categoria societaria non si generalizza (difetto 30)', () => {
  it('non chiama «società di capitali» una società cooperativa', () => {
    const motivi = motiviDi('responsabilita-amministratori', { formaGiuridica: 'cooperativa' }).join(' | ');
    expect(motivi).not.toContain('Società di capitali');
    expect(motivi).toContain('cooperativa');
  });

  it('continua a chiamarla così dove è vero', () => {
    expect(motiviDi('responsabilita-amministratori', { formaGiuridica: 'srl' }).join(' | ')).toContain(
      'Società di capitali',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 29 — «la quasi totalità del capitale» a chi ne ha il 66%
// ─────────────────────────────────────────────────────────────────────────────

describe('La quota della persona chiave si compone dal valore (difetto 29)', () => {
  const conQuota = (quota: number): string => {
    const analisi = analizzaAssetto(
      assetti([
        socio({ denominazione: 'ROSSI GIOVANNI', tipo: 'persona-fisica', quotaPercentuale: quota }),
        socio({ denominazione: 'BIANCHI MARIA', tipo: 'persona-fisica', quotaPercentuale: 100 - quota }),
      ]),
      { formaGiuridica: 'srl', addetti: 19 },
    );
    return analisi.implicazioni
      .filter((i) => i.titolo.startsWith('Persona chiave'))
      .map((i) => i.conseguenza)
      .join(' | ');
  };

  it('a chi ne ha il 66% dice il 66%, non «la quasi totalità»', () => {
    const frase = conQuota(66);
    expect(frase).toContain('66%');
    expect(frase).not.toContain('quasi totalità');
  });

  it('a chi ne ha il 100% dice il 100%', () => {
    const frase = conQuota(100);
    expect(frase).toContain('100%');
    expect(frase).not.toContain('quasi totalità');
  });

  it('a chi comanda per sola carica non attribuisce alcuna quota', () => {
    const analisi = analizzaAssetto(
      assetti(
        [socio({ denominazione: 'BIANCHI MARIA', quotaPercentuale: 40 })],
        [
          {
            nominativo: 'VERDI LUCA',
            codiceFiscale: null,
            ruolo: 'Amministratore delegato',
            dataNomina: null,
            isRappresentanteLegale: true,
            eta: 51,
            dataNascita: null,
            luogoNascita: null,
          },
        ],
      ),
      { formaGiuridica: 'srl', addetti: 19 },
    );
    const frase = analisi.implicazioni
      .filter((i) => i.titolo.includes('VERDI LUCA'))
      .map((i) => i.conseguenza)
      .join(' | ');
    expect(frase).toContain('rappresentanza legale');
    expect(frase).not.toContain('capitale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 31 — l'esposizione idraulica «media» per ripiego
// ─────────────────────────────────────────────────────────────────────────────

describe('Esposizione idraulica: la tabella conosce solo le province alte (difetto 31)', () => {
  it('dichiara «non determinata» dove non ha misurato, invece di dire «media»', () => {
    const milano = territorialExposure('MI');
    expect(milano.idraulica).toBeNull();
    expect(milano.idraulicaEtichetta).toBe('non determinata');
  });

  it('continua a dire «alta» dove la misura c’è', () => {
    const ferrara = territorialExposure('FE');
    expect(ferrara.idraulica).toBe('alta');
    expect(ferrara.idraulicaEtichetta).toBe('alta');
  });

  /*
    Questa prova diceva che sulla sismica il livello «bassa» esiste davvero, e portava
    Milano come esempio. Non regge più — e non perché la correzione abbia sbagliato: è
    esattamente ciò che la correzione ha scoperto.

    La tabella di geo.ts contiene due insiemi, alta e media. Le province assenti da
    entrambi uscivano «bassa», e il commento accanto dichiarava «zona 4, cioè esposizione
    bassa accertata». Non era accertato niente: era l'assenza dalla tabella, letta come
    una misura. Milano era una delle trentatré.

    Ora quelle province rispondono null, e «bassa» non la produce nessuna: la
    classificazione della zona 4 secondo l'OPCM 3519/2003 non è mai stata trascritta.

    Il livello resta nel tipo perché il dominio ha tre gradi, e trascriverli è un lavoro
    che si fa sulla fonte. Fino ad allora il prodotto dice «non determinata», che è vero,
    invece di «bassa», che era una deduzione dall'ignoranza. Su un rischio sismico, dire
    «basso» senza aver guardato è il verso che costa.
  */
  it('dove la misura c’è la sismica la dichiara, e dove non c’è non la inventa', () => {
    expect(territorialExposure('UD').sismica).toBe('alta');
    expect(territorialExposure('MI').sismica).toBeNull();
  });

  it('nessuna provincia esce «bassa»: quella tabella non è ancora stata trascritta', () => {
    /*
      Presidio del DEBITO, non della correttezza. Il giorno in cui qualcuno trascrive la
      zona 4 dall'OPCM questa prova diventa rossa, e sarà il segnale che va tolta — non un
      difetto. Senza, l'assenza di quella tabella resterebbe invisibile, che è come è
      rimasta finora.
    */
    const province = ['MI', 'TO', 'GE', 'VE', 'PD', 'MN', 'PC', 'UD', 'FE', 'RM'];
    const livelli = province.map((p) => territorialExposure(p).sismica);
    expect(livelli.length, 'l’elenco di prova non può essere vuoto').toBeGreaterThan(0);
    expect(livelli).not.toContain('bassa');
  });

  it('la peggiore fra più province conserva l’unica esposizione idraulica misurata', () => {
    const peggiore = worstExposure(['MI', 'FE']);
    expect(peggiore?.idraulica).toBe('alta');
  });

  it('con sole province non misurate non inventa un livello', () => {
    const peggiore = worstExposure(['MI', 'TO']);
    expect(peggiore?.idraulica).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 32 — la visura da 1,10 € proposta quando basta l'anagrafica da 0,10 €
// ─────────────────────────────────────────────────────────────────────────────

describe('Titolare effettivo: socio unico societario senza quota (difetto 32)', () => {
  const analisi = analizzaTitolareEffettivo(
    analizzaAssetto(
      assetti([
        socio({
          denominazione: 'OPEN HOLDING S.R.L.',
          codiceFiscale: '16935371001',
          tipo: 'persona-giuridica',
          quotaPercentuale: null,
        }),
      ]),
      { formaGiuridica: 'srl', addetti: 19 },
    ),
  );

  it('indica la controllante fra le società da risalire, invece di lasciare il campo vuoto', () => {
    expect(analisi.daRisalire.map((s) => s.denominazione)).toEqual(['OPEN HOLDING S.R.L.']);
  });

  it('propone l’anagrafica da 0,10 €, non la visura da 1,10 €', () => {
    expect(analisi.azione).toContain('0,10');
    expect(analisi.azione).toContain('OPEN HOLDING S.R.L.');
  });

  it('non dichiara la catena chiusa: sopra la holding c’è ancora una persona da trovare', () => {
    expect(analisi.catenaChiusa).toBe(false);
  });

  it('resta la visura quando la controllante non ha una partita IVA con cui risalire', () => {
    const senzaCf = analizzaTitolareEffettivo(
      analizzaAssetto(
        assetti([
          socio({
            denominazione: 'HOLDING IGNOTA S.R.L.',
            tipo: 'persona-giuridica',
            quotaPercentuale: null,
          }),
        ]),
        { formaGiuridica: 'srl', addetti: 19 },
      ),
    );
    expect(senzaCf.azione).toContain('visura');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetti 57 e 58 — lo Z'' «per imprese non manifatturiere» su una manifattura,
// e gli artt. 2482-bis/ter citati a una S.p.A.
// ─────────────────────────────────────────────────────────────────────────────

describe("Altman Z'': il riferimento non contraddice l’impresa che ha davanti (difetto 57)", () => {
  it('su un’impresa manifatturiera non afferma che il modello è «per imprese non manifatturiere»', () => {
    const esito = computeAltmanZ(bilancioDemo, { formaGiuridica: 'srl', atecoSezione: 'C' });
    expect(esito.explanation.references.join(' | ')).not.toContain('non manifatturiere');
  });

  it('su un’impresa manifatturiera dichiara il limite della calibrazione e abbassa la confidenza', () => {
    const esito = computeAltmanZ(bilancioDemo, { formaGiuridica: 'srl', atecoSezione: 'C' });
    expect(esito.explanation.notes.join(' | ')).toContain('manifatturier');
    expect(esito.confidence).not.toBe('alta');
  });

  it('fuori dalla manifattura non aggiunge la riserva né abbassa la confidenza', () => {
    const esito = computeAltmanZ(bilancioDemo, { formaGiuridica: 'srl', atecoSezione: 'G' });
    expect(esito.confidence).toBe('alta');
  });

  it('l’azienda dimostrativa è manifatturiera: è la schermata che si mostra al cliente', () => {
    expect(fattiDemo.atecoSezione).toBe('C');
  });
});

describe('Riduzione del capitale per perdite: la norma segue la forma (difetto 58)', () => {
  const bilancioInPerdita = reclassify(bilancioConPatrimonioNegativo());

  it('a una S.p.A. cita gli artt. 2446-2447, non quelli della S.r.l.', () => {
    const note = computeAltmanZ(bilancioInPerdita, {
      formaGiuridica: 'spa',
      atecoSezione: 'C',
    }).explanation.notes.join(' | ');
    expect(note).toContain('2446');
    expect(note).not.toContain('2482-bis');
  });

  it('a una S.r.l. cita gli artt. 2482-bis/ter', () => {
    const note = computeAltmanZ(bilancioInPerdita, {
      formaGiuridica: 'srl',
      atecoSezione: 'C',
    }).explanation.notes.join(' | ');
    expect(note).toContain('2482-bis');
  });

  it('senza forma giuridica nota non sceglie: nomina entrambe le discipline', () => {
    const note = computeAltmanZ(bilancioInPerdita).explanation.notes.join(' | ');
    expect(note).toContain('2446');
    expect(note).toContain('2482-bis');
  });

  it('la norma sta in un punto solo, come quella sugli amministratori', () => {
    expect(normaRiduzioneCapitalePerPerdite('spa')).toContain('2446');
    expect(normaRiduzioneCapitalePerPerdite('srl')).toContain('2482-bis');
    expect(normaRiduzioneCapitalePerPerdite('snc')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 68 — la PD a 12 mesi, unico numero nudo della scheda
// ─────────────────────────────────────────────────────────────────────────────

describe('Probabilità di default: formula, riferimento e confidenza (difetto 68)', () => {
  const score = computeCreditScore({
    profile: profiloDemo,
    bilancio: bilancioDemo,
    indicatori: null,
    livelloDati: 'completo',
    asOf: DEMO_AS_OF,
  });

  it('viaggia come Explained, con la formula che l’ha prodotta', () => {
    const pd = score.value.probabilitaDefaultSpiegata;
    expect(pd.explanation.formula).not.toBeNull();
    expect(pd.explanation.references.length).toBeGreaterThan(0);
  });

  it('non si dichiara affidabile: la curva non è calibrata sui dati della piattaforma', () => {
    expect(score.value.probabilitaDefaultSpiegata.confidence).not.toBe('alta');
    expect(score.value.probabilitaDefaultSpiegata.explanation.notes.join(' | ')).toContain('calibr');
  });

  it('il valore resta quello della curva: la forma cambia, il numero no', () => {
    expect(score.value.probabilitaDefaultSpiegata.value).toBe(score.value.probabilitaDefault);
  });

  it('compare anche nella spiegazione dello score, che è ciò che la scheda stampa', () => {
    const etichette = score.explanation.inputs.map((i) => i.label).join(' | ');
    expect(etichette).toContain('Probabilità di default');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 69 — due moduli, due risposte alla stessa domanda giuridica
// ─────────────────────────────────────────────────────────────────────────────

describe('Controllo societario: facts e assetto rispondono allo stesso modo (difetto 69)', () => {
  const holding = (quota: number | null): Socio =>
    socio({
      denominazione: 'OPEN HOLDING S.R.L.',
      codiceFiscale: '16935371001',
      tipo: 'persona-giuridica',
      quotaPercentuale: quota,
    });

  const daiDueModuli = (quota: number | null): { facts: boolean; assetto: boolean } => {
    const soci = [holding(quota)];
    const profilo = profiloCon(soci);
    return {
      facts: deriveFacts(profilo, bilancioDemo, DEMO_AS_OF).soggettaADirezioneECoordinamento,
      assetto: analizzaAssetto(assetti(soci), { formaGiuridica: 'srl', addetti: 19 })
        .soggettaADirezioneECoordinamento,
    };
  };

  it('socio unico societario senza quota: controllante per entrambi', () => {
    const esito = daiDueModuli(null);
    expect(esito.assetto).toBe(true);
    expect(esito.facts).toBe(true);
  });

  it('socio unico societario con quota dichiarata MINORITARIA: per nessuno dei due', () => {
    // Se il dato dice 30%, dice anche che il 70% è di qualcun altro. Da qui l'art. 2497
    // entrava nel fascicolo come fatto accertato.
    const esito = daiDueModuli(30);
    expect(esito.assetto).toBe(false);
    expect(esito.facts).toBe(false);
  });

  it('socio unico societario con quota maggioritaria: controllante per entrambi', () => {
    const esito = daiDueModuli(80);
    expect(esito.assetto).toBe(true);
    expect(esito.facts).toBe(true);
  });

  it('la quota del socio di controllo non si inventa quando la maggioranza non c’è', () => {
    const profilo = profiloCon([holding(30)]);
    expect(deriveFacts(profilo, bilancioDemo, DEMO_AS_OF).quotaSocioDiControllo).toBeNull();
  });
});
