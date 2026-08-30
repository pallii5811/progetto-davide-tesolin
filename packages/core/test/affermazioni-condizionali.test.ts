/**
 * Ciò che il prodotto afferma dev'essere vero per l'impresa a cui lo dice.
 *
 * Il difetto originario era una sola frase: la motivazione della RCT diceva «trasferisce
 * l'obbligazione risarcitoria verso terzi, che nelle società di persone si estende al
 * patrimonio dei soci», ed era una stringa fissa mostrata a ogni impresa — S.r.l. e
 * S.p.A. comprese, dove non si applica. Nel documento dimostrativo giustificava un
 * massimale da dieci milioni per una S.r.l.
 *
 * Cercandone altre ne sono uscite otto, tutte della stessa forma: una clausola che vale
 * per alcuni, scritta dentro una frase che leggono tutti. La peggiore affermava a
 * un'impresa agricola — esclusa per legge — un obbligo CAT NAT scaduto, con priorità
 * forzata in cima al piano d'azione, mentre il pannello accanto ne dichiarava
 * l'esclusione: il documento si contraddiceva al proprio interno.
 *
 * Queste prove tengono fermo il principio, non le singole frasi: **ogni affermazione
 * condizionale si accende e si spegne**, e nessuna clausola condizionale può tornare a
 * vivere dentro una stringa fissa del catalogo. L'ultima prova è il guardiano: fallisce
 * al prossimo «nelle società di…» scritto nel posto sbagliato.
 */

import { describe, expect, it } from 'vitest';
import {
  COVERAGE_CATALOG,
  DATI_DICHIARATI_VUOTI,
  RISK_CATALOG,
  RISK_RULES,
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  deriveFacts,
  normaResponsabilitaAmministratori,
  regimeDiResponsabilita,
} from '../src/index.js';
import type { CompanyAnalysis, CompanyProfile, FormaGiuridica, Socio } from '../src/index.js';
import { parseAteco } from '../src/shared/identifiers.js';

const QUANDO = new Date('2026-08-17T00:00:00Z');

function profilo(
  modifiche: {
    readonly forma?: FormaGiuridica;
    readonly ateco?: string | null;
    readonly soci?: readonly Socio[];
    readonly controllate?: readonly { partitaIva: null; codiceFiscale: null; denominazione: string }[];
    readonly cariche?: readonly [];
    readonly senzaAssetti?: boolean;
  } = {},
): CompanyProfile {
  const base = demoCompanyProfile();
  const assetti = base.assetti;
  return {
    ...base,
    datiDichiarati: DATI_DICHIARATI_VUOTI,
    anagrafica: {
      ...base.anagrafica,
      value: {
        ...base.anagrafica.value,
        formaGiuridica: modifiche.forma ?? base.anagrafica.value.formaGiuridica,
        atecoPrimario:
          modifiche.ateco === undefined
            ? base.anagrafica.value.atecoPrimario
            : modifiche.ateco === null
              ? null
              : parseAteco(modifiche.ateco),
      },
    },
    assetti:
      modifiche.senzaAssetti === true || assetti === null
        ? null
        : {
            ...assetti,
            value: {
              ...assetti.value,
              soci: modifiche.soci ?? assetti.value.soci,
              controllate: modifiche.controllate ?? assetti.value.controllate,
              cariche: modifiche.cariche ?? assetti.value.cariche,
            },
          },
  };
}

function analizza(p: CompanyProfile): CompanyAnalysis {
  return analyzeCompany(p, demoPolizze(), QUANDO);
}

function motivazione(analisi: CompanyAnalysis, coverage: string): string {
  return analisi.gap.gaps.find((g) => g.definition.id === coverage)?.motivazioneAdeguatezza ?? '';
}

const socio = (over: Partial<Socio> = {}): Socio => ({
  denominazione: 'ALFA HOLDING S.P.A.',
  codiceFiscale: '01234567890',
  tipo: 'persona-giuridica',
  quotaPercentuale: 100,
  quotaValore: null,
  socioDal: null,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Chi risponde del risarcimento: cinque regimi, non uno', () => {
  it('a una S.r.l. non dice che il risarcimento aggredisce il patrimonio dei soci', () => {
    const testo = motivazione(analizza(profilo({ forma: 'srl' })), 'rct');
    expect(testo).not.toContain('si estende al patrimonio dei soci');
    expect(testo).toContain('risponde la sola società con il suo patrimonio');
  });

  it('a una S.n.c. lo dice, con la norma giusta', () => {
    const regime = regimeDiResponsabilita('snc');
    expect(regime.illimitata).toBe(true);
    expect(regime.riferimento).toBe('Art. 2291 c.c.');
    expect(regime.testo).toContain('solidalmente e illimitatamente');
  });

  it('nell’accomandita nomina i soli accomandatari, non «i soci»', () => {
    for (const forma of ['sas', 'sapa'] as const) {
      const regime = regimeDiResponsabilita(forma);
      expect(regime.illimitata).toBe(true);
      expect(regime.testo).toContain('accomandatari');
    }
  });

  it('alla ditta individuale non parla di soci: non ne ha', () => {
    const regime = regimeDiResponsabilita('ditta-individuale');
    expect(regime.testo).not.toContain('soci');
    expect(regime.riferimento).toBe('Art. 2740 c.c.');
  });
});

describe('La norma sugli amministratori segue la forma giuridica', () => {
  it('per la S.r.l. è l’art. 2476, non gli artt. 2392 ss. che sono della S.p.A.', () => {
    const srl = normaResponsabilitaAmministratori('srl');
    expect(srl).toContain('2476');
    expect(srl).not.toContain('2392');

    const spa = normaResponsabilitaAmministratori('spa');
    expect(spa).toContain('2392');
    expect(spa).not.toContain('2476');
  });

  it('non ne indica alcuna dove non esiste un organo distinto dalla proprietà', () => {
    for (const forma of ['snc', 'sas', 'ditta-individuale'] as const) {
      expect(normaResponsabilitaAmministratori(forma)).toBeNull();
    }
  });

  it('il ragionamento sul massimale D&O non cita mai la norma di un’altra forma', () => {
    const analisi = analizza(profilo({ forma: 'srl' }));
    const spiegazione = JSON.stringify(analisi.sommeAssicurande.massimaleDandO);
    expect(spiegazione).toContain('2476');
    expect(spiegazione).not.toContain('2392');
  });
});

describe('«Amministratori in carica: 0» è un’assenza travestita da misura', () => {
  it('senza assetti il conteggio è null, non zero', () => {
    const facts = deriveFacts(profilo({ senzaAssetti: true }), null, QUANDO);
    expect(facts.numeroAmministratori).toBeNull();
  });

  it('con assetti presenti e nessuna carica il conteggio è zero: sono due cose diverse', () => {
    const facts = deriveFacts(profilo({ cariche: [] }), null, QUANDO);
    expect(facts.numeroAmministratori).toBe(0);
  });

  it('la spiegazione del massimale D&O non stampa mai zero amministratori', () => {
    const analisi = analizza(profilo({ senzaAssetti: true }));
    const spiegazione = JSON.stringify(analisi.sommeAssicurande.massimaleDandO);
    expect(spiegazione).not.toContain('Amministratori in carica","valore":"0"');
    expect(spiegazione).toContain('non acquisiti');
  });
});

describe('L’art. 2497 grava su chi dirige, non su chi è diretto', () => {
  it('la controllata non si sente dire che ne risponde', () => {
    const analisi = analizza(profilo({ soci: [socio({ quotaPercentuale: 100 })] }));
    const facts = deriveFacts(profilo({ soci: [socio({ quotaPercentuale: 100 })] }), null, QUANDO);

    expect(facts.soggettaADirezioneECoordinamento).toBe(true);
    expect(facts.esercitaDirezioneECoordinamento).toBe(false);

    const testo = motivazione(analisi, 'd-and-o');
    expect(testo).toContain('è soggetta a direzione e coordinamento');
    expect(testo).not.toContain('risponde verso i soci e i creditori delle società dirette');
  });

  it('la controllante sì', () => {
    const conControllate = profilo({
      soci: [socio({ tipo: 'persona-fisica', denominazione: 'ROSSI MARIO', quotaPercentuale: 100 })],
      controllate: [{ partitaIva: null, codiceFiscale: null, denominazione: 'BETA S.R.L.' }],
    });
    const facts = deriveFacts(conControllate, null, QUANDO);
    expect(facts.esercitaDirezioneECoordinamento).toBe(true);

    expect(motivazione(analizza(conControllate), 'd-and-o')).toContain(
      'esercita direzione e coordinamento',
    );
  });
});

describe('Il controllo di diritto è la maggioranza, non la metà', () => {
  it('due soci societari al 50% non formano un gruppo', () => {
    const facts = deriveFacts(
      profilo({
        soci: [
          socio({ denominazione: 'ALFA S.P.A.', codiceFiscale: '11111111111', quotaPercentuale: 50 }),
          socio({ denominazione: 'BETA S.P.A.', codiceFiscale: '22222222222', quotaPercentuale: 50 }),
        ],
      }),
      null,
      QUANDO,
    );
    expect(facts.soggettaADirezioneECoordinamento).toBe(false);
    expect(facts.appartieneAGruppo).toBe(false);
  });

  it('al 50,1% sì', () => {
    const facts = deriveFacts(
      profilo({
        soci: [
          socio({ denominazione: 'ALFA S.P.A.', codiceFiscale: '11111111111', quotaPercentuale: 50.1 }),
          socio({ denominazione: 'BETA S.P.A.', codiceFiscale: '22222222222', quotaPercentuale: 49.9 }),
        ],
      }),
      null,
      QUANDO,
    );
    expect(facts.soggettaADirezioneECoordinamento).toBe(true);
  });
});

describe('L’obbligo di legge è dell’impresa, non della copertura', () => {
  // 01.11.00 — coltivazione di cereali: impresa agricola ex art. 2135 c.c., esclusa
  // dall'obbligo CAT NAT perché coperta dal Fondo AGRICAT.
  const agricola = () => analizza(profilo({ ateco: '01.11.00' }));

  /*
    I tre `if (gap === undefined) return` che stavano qui facevano passare ogni prova
    sull'agricola **anche sull'oggetto assente**.

    L'intenzione era legittima — «se la copertura non è proposta affatto, va bene uguale» —
    ma l'effetto no: misurato, il gap `catastrofali` c'è sempre (priorità 60, urgenza
    `prossima-revisione`), quindi quei rami non sono mai stati eseguiti. Erano una rete che
    non prendeva nulla oggi e avrebbe ingoiato in silenzio la regressione di domani: il
    giorno in cui il gap sparisse, tutte e tre le prove diventerebbero verdi per assenza di
    informazione.

    È lo stesso difetto che il rapporto chiama «verde per assenza», e la correzione è la
    stessa: si dichiara che l'oggetto dev'esserci, e lo si guarda.
  */
  const gapCatastrofali = (analisi: CompanyAnalysis) => {
    const gap = analisi.gap.gaps.find((g) => g.definition.id === 'catastrofali');
    expect(
      gap,
      'la copertura catastrofale non compare fra i gap: la prova non ha nulla da guardare',
    ).toBeDefined();
    return gap!;
  };

  it('all’impresa agricola non afferma l’obbligo catastrofale', () => {
    const analisi = agricola();
    expect(analisi.catNat.value.soggetta).toBe(false);

    const gap = gapCatastrofali(analisi);
    expect(gap.obbligoDiLegge).toBe(false);
    expect(gap.motivazioneAdeguatezza).toContain('non è soggetta all’obbligo');
  });

  it('e non la mette in cima al piano con un termine già scaduto', () => {
    const gap = gapCatastrofali(agricola());
    expect(gap.priorita).toBeLessThan(92);
    expect(gap.piano.urgenza).not.toBe('immediata');
  });

  it('il pannello CAT NAT e il piano d’azione non si contraddicono', () => {
    const analisi = agricola();
    const gap = gapCatastrofali(analisi);
    const esclusa = analisi.catNat.value.soggetta === false;
    // Se un pannello dichiara l'esclusione, l'altro non può dichiarare l'inadempimento.
    expect(esclusa && gap.obbligoDiLegge).toBe(false);
  });

  it('all’impresa soggetta e scoperta l’allarme resta intatto', () => {
    const analisi = analizza(profilo({ ateco: '25.62.00' }));
    expect(analisi.catNat.value.soggetta).toBe(true);
    const gap = analisi.gap.gaps.find((g) => g.definition.id === 'catastrofali');
    expect(gap?.obbligoDiLegge).toBe(true);
    expect(gap?.priorita).toBe(100);
  });
});

describe('Il perimetro del D.Lgs. 231/2001 non ha soglie dimensionali', () => {
  it('comprende anche la S.r.l.s. e la società di persone', () => {
    for (const forma of ['srls', 'snc', 'sas'] as const) {
      const analisi = analizza(profilo({ forma }));
      const rischio = analisi.rischi.risks.find((r) => r.definition.id === 'sanzioni-231');
      expect(rischio, `atteso il rischio 231 per ${forma}`).toBeDefined();
    }
  });

  it('esclude l’impresa individuale, che non è un ente distinto dalla persona', () => {
    const analisi = analizza(profilo({ forma: 'ditta-individuale' }));
    expect(analisi.rischi.risks.find((r) => r.definition.id === 'sanzioni-231')).toBeUndefined();
  });
});

describe('I numeri delle frasi vengono dall’impresa, non dalle soglie', () => {
  it('il valore mensile del fermo è il margine di questa azienda diviso dodici', () => {
    const analisi = analizza(demoCompanyProfile());
    const fermo = analisi.rischi.risks.find((r) => r.definition.id === 'fermo-attivita');
    const motivi = (fermo?.modulationRules ?? []).map((r) => r.rationale).join(' ');

    /*
      Il margine dimostrativo è 3.080.000 €: un dodicesimo fa 256.667 €.

      Prima la frase diceva «oltre 80.000 €», cioè la soglia della regola (1 M€) divisa
      per dodici — un numero che non dipendeva dall'azienda. Qui si verifica il valore
      vero, non l'assenza di quello falso: «80.000» è un pezzo di «3.080.000», e cercarne
      l'assenza avrebbe prodotto una prova che fallisce quando il codice è giusto.
    */
    expect(motivi).toContain('3.080.000');
    expect(motivi).toContain('256.667');
  });
});

/**
 * Il guardiano.
 *
 * Non verifica una frase: verifica che nessuna frase **fissa** contenga una clausola
 * condizionale. È il controllo che avrebbe preso il difetto originario, e l'unico che
 * impedisce alla prossima copertura aggiunta di reintrodurlo.
 */
describe('Nessuna clausola condizionale dentro una frase fissa', () => {
  const CONDIZIONALI = [
    'nelle società di',
    'nelle imprese a',
    'per gli esercenti',
    'se l’impresa',
    "se l'impresa",
  ];

  const contieneCondizionale = (testo: string): string | null =>
    CONDIZIONALI.find((c) => testo.toLowerCase().includes(c)) ?? null;

  /*
    Il titolo diceva «motivazioni, insidie e **riferimenti**», e i riferimenti non li
    guardava: il ciclo scorreva `motivazioneTipo` e `insidie` e si fermava lì. Un titolo
    che promette più di quel che il corpo esegue è il modo in cui un presidio smette di
    esistere senza che nessuno lo cancelli.

    ⚠ Resta scoperto ciò che questo guardiano non è costruito per vedere: una norma
    **asserita a tutti**. I cinque frammenti qui sopra riconoscono una clausola
    condizionale scritta in italiano dentro una frase fissa; non riconoscono un riferimento
    come «D.Lgs. 138/2024 — NIS 2» citato a ogni impresa, perché in quella stringa non
    compare nessuno dei cinque. È un difetto diverso, e chiuderlo richiede un presidio
    diverso — non un frammento in più in questo elenco.
  */
  it('nel catalogo delle coperture: motivazioni, insidie e riferimenti', () => {
    const colpevoli: string[] = [];
    for (const def of Object.values(COVERAGE_CATALOG)) {
      for (const testo of [def.motivazioneTipo, ...def.insidie, ...def.riferimenti]) {
        const trovata = contieneCondizionale(testo);
        if (trovata !== null) colpevoli.push(`${def.id}: «${trovata}»`);
      }
    }
    expect(colpevoli, colpevoli.join(' · ')).toEqual([]);
  });

  it('nel catalogo dei rischi', () => {
    const colpevoli: string[] = [];
    for (const def of Object.values(RISK_CATALOG)) {
      const trovata = contieneCondizionale(def.description);
      if (trovata !== null) colpevoli.push(`${def.id}: «${trovata}»`);
    }
    expect(colpevoli, colpevoli.join(' · ')).toEqual([]);
  });

  it('nei motivi delle regole scritti come stringa fissa', () => {
    const colpevoli: string[] = [];
    for (const regola of RISK_RULES) {
      // Un motivo che è una funzione è per costruzione condizionale: è il caso giusto.
      if (typeof regola.rationale !== 'string') continue;
      const trovata = contieneCondizionale(regola.rationale);
      if (trovata !== null) colpevoli.push(`${regola.id}: «${trovata}»`);
    }
    expect(colpevoli, colpevoli.join(' · ')).toEqual([]);
  });
});
