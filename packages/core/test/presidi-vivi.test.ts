/**
 * I presidi devono poter diventare rossi.
 *
 * Quattro dei controlli di questo pacchetto passavano sempre, e non per fortuna: giravano
 * su un insieme vuoto, su una fixture costruita perché non potessero fallire, o su un
 * codice ATECO che non esiste. Un controllo mai visto fallire non è un controllo — è una
 * riga che rassicura, e la lista delle assoluzioni è la parte di un audit che nessuno
 * riapre.
 *
 * Qui stanno le prove che tengono ferma **la forma** di quei controlli: non ripetono le
 * asserzioni corrette (che vivono nei file di sempre), verificano che la fixture su cui
 * quei file girano abbia ancora le proprietà che rendono le asserzioni significative. Se
 * domani la fixture cambia e torna a essere un terreno dove nulla può fallire, questo file
 * lo dice prima che qualcuno se ne accorga in produzione.
 */

import { describe, expect, it } from 'vitest';
import {
  COVERAGE_CATALOG,
  DATI_DICHIARATI_VUOTI,
  DEMO_AS_OF,
  DIVISIONE_PESCA,
  analyzeCompany,
  assessCatNat,
  demoCompanyProfile,
  demoPolizze,
  deriveFacts,
  euro,
  reclassify,
} from '../src/index.js';

const profilo = demoCompanyProfile();
const polizze = demoPolizze();
const bilancio = reclassify(profilo.bilanci[0]!.value);
const facts = deriveFacts(profilo, bilancio, DEMO_AS_OF);

/**
 * Il terreno su cui gira la prova AGRICAT dev'essere un terreno reale.
 *
 * La prova costruiva una sezione A lasciando la divisione della fixture. Se quella
 * divisione appartiene alla sezione A, la costruzione è coerente e la prova è cieca a
 * metà; se non le appartiene — ed è il caso, è la 25 — il codice è incoerente e qualunque
 * lettura risponde «agricola», anche la peggiore.
 */
describe('La fixture dimostrativa non è una sezione A travestita', () => {
  it('la divisione della fixture non appartiene alla sezione A', () => {
    expect(facts.atecoSezione).not.toBe('A');
    expect(['01', '02', '03']).not.toContain(facts.atecoDivisione);
  });

  it('le tre divisioni della sezione A non danno tutte lo stesso esito', () => {
    // È la proprietà che rende la prova AGRICAT capace di fallire: se le tre divisioni
    // rispondessero allo stesso modo, non ci sarebbe distinzione da verificare.
    const esito = (divisione: string | null): boolean =>
      assessCatNat({
        facts: { ...facts, atecoSezione: 'A', atecoDivisione: divisione },
        baseAssicurabile: euro(500_000),
        giaCoperta: false,
        asOf: DEMO_AS_OF,
      }).value.soggetta;

    expect(esito('01')).toBe(false);
    expect(esito('02')).toBe(false);
    expect(esito(DIVISIONE_PESCA)).toBe(true);
    expect(esito(null)).toBe(true);
  });
});

/**
 * Il guardiano delle clausole condizionali dev'essere puntato su qualcosa.
 *
 * Cercava cinque frammenti dentro due campi su tre, mentre il titolo ne prometteva tre.
 * Un elenco di frammenti che non compare in nessuno dei campi guardati è un guardiano
 * spento: passa perché non guarda, non perché non ci sia nulla.
 */
describe('Il guardiano delle clausole condizionali guarda campi non vuoti', () => {
  it('i tre campi ispezionati contengono davvero del testo', () => {
    const conteggi = Object.values(COVERAGE_CATALOG).reduce(
      (acc, def) => ({
        motivazioni: acc.motivazioni + (def.motivazioneTipo.length > 0 ? 1 : 0),
        insidie: acc.insidie + def.insidie.length,
        riferimenti: acc.riferimenti + def.riferimenti.length,
      }),
      { motivazioni: 0, insidie: 0, riferimenti: 0 },
    );

    expect(conteggi.motivazioni).toBeGreaterThan(0);
    expect(conteggi.insidie).toBeGreaterThan(0);
    // Il campo che il guardiano non guardava: se fosse vuoto, allargarlo non varrebbe nulla.
    expect(conteggi.riferimenti).toBeGreaterThan(0);
  });
});

/**
 * La distinzione «assenza constatata» / «assenza ignota» ha due stati.
 *
 * La prova che la verificava filtrava le raccomandazioni con `accertataAssente === false`
 * e sulla fixture ne trovava zero: il corpo del ciclo non è mai stato eseguito. Qui si
 * fissa la proprietà che rendeva la prova vuota, così che il giorno in cui la fixture
 * cambiasse non tornasse a esserlo in silenzio.
 */
describe('La fixture esercita un solo lato della distinzione', () => {
  const ASOF = new Date('2026-06-15T00:00:00Z');

  it('a questionario compilato ogni assenza è constatata, non ignota', () => {
    const conQuestionario = analyzeCompany(profilo, [], ASOF);
    expect(conQuestionario.prevenzione.length).toBeGreaterThan(0);
    expect(conQuestionario.prevenzione.filter((r) => !r.accertataAssente)).toEqual([]);
  });
});

/**
 * Il fido va misurato dove può sforare, non dove non può.
 *
 * Sulla fixture lo score sta sotto 80 e il fattore resta sotto 1,00: il fido non può
 * superare il vincolo, qualunque cosa faccia il codice. La prova va quindi eseguita anche
 * sul percorso che gira in produzione, che il bilancio in schema CEE non ce l'ha.
 */
describe('Il percorso di produzione non è quello della fixture', () => {
  it('togliere il bilancio CEE cambia score, classe e fattore', () => {
    const conCee = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    const senzaCee = analyzeCompany({ ...profilo, bilanci: [] }, polizze, DEMO_AS_OF);

    // Se i due percorsi coincidessero, esercitarne uno solo sarebbe indifferente. Non
    // coincidono: è la ragione per cui la prova sul fido va eseguita su entrambi.
    expect(senzaCee.creditScore.value.value).not.toBe(conCee.creditScore.value.value);

    /*
      IL VERSO, non il numero.

      Questa riga pretendeva fattoreScore maggiore di 1 sul percorso senza bilancio: era la
      misura del DIFETTO, non il comportamento voluto. Su score da 80 in su il fattore
      superava l'uno e il fido sforava il vincolo che la nota accanto chiama il più
      stringente, fino al venticinque per cento sopra. Ora vale 0,86 e la pretesa si
      rovescia.

      Si fissa la disuguaglianza e non il valore: 0,86 dipende da una fixture, e un numero
      esatto tornerebbe rosso alla prima correzione legittima. Un presidio che grida al
      lupo insegna a ignorarlo.
    */
    expect(conCee.creditLimit.value.fattoreScore).toBeLessThanOrEqual(1);
    expect(
      senzaCee.creditLimit.value.fattoreScore,
      'il fido non deve superare il vincolo che la sua stessa nota dichiara più stringente',
    ).toBeLessThanOrEqual(1);
  });

  it('togliere dati non fa MIGLIORARE il merito creditizio', () => {
    /*
      Il difetto 5 in una riga, ed è il più grave del rapporto.

      Misurato prima della correzione: stessa impresa, con il bilancio in schema CEE score
      76 classe B; togliendolo, 85 classe A «rischio molto basso». La media pesata
      rinormalizzava senza pavimento e regalava il peso dei fattori spariti a quelli
      superstiti, che erano i più alti.

      E il percorso senza bilancio è l'UNICO che gira in produzione, perché il bilancio
      dettagliato non viene mai comprato. Cioè: ogni impresa vera veniva giudicata meglio
      di quanto il prodotto sapesse, e il fascicolo stampava «classe A» senza dire su
      quanti fattori si reggesse.

      È l'asserzione che non deve mai più tornare verde per la ragione sbagliata: meno
      dati non possono valere un giudizio migliore.
    */
    const conCee = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    const senzaCee = analyzeCompany({ ...profilo, bilanci: [] }, polizze, DEMO_AS_OF);

    expect(
      senzaCee.creditScore.value.value,
      'con meno dati lo score non può salire: era 85 contro 76, e il percorso povero è quello di produzione',
    ).toBeLessThanOrEqual(conCee.creditScore.value.value);
  });
});

/**
 * Il piano di prevenzione alla prima visita.
 *
 * Era registrato qui come misura del difetto: a questionario vuoto il piano usciva VUOTO,
 * zero raccomandazioni. Il commento diceva «quando la corsia del motore avrà corretto,
 * questa riga diventerà rossa: è il segnale che la misura va aggiornata». Ha suonato, e
 * il numero osservato è nove.
 *
 * Il difetto era di quelli che si tengono in piedi da soli: i controlli su dato IGNOTO
 * finivano nell'insieme degli «applicati», quindi il motore affermava nove protezioni che
 * nessuno aveva dichiarato — «Impianto di allarme dichiarato presente» — e nello stesso
 * documento smetteva di raccomandare quelle che mancavano. Alla prima visita, cioè
 * l'unico momento in cui un piano di prevenzione serve davvero.
 *
 * Ora la pretesa è rovesciata, e si fissa il verso: a questionario vuoto il piano NON può
 * essere vuoto. Nove è il numero di oggi e dipende dalla fixture; il vincolo è che ce ne
 * sia almeno uno.
 */
describe('Prima visita: quanto raccomanda il motore', () => {
  it('a questionario vuoto il piano non è vuoto: è il momento in cui serve di più', () => {
    const primaVisita = analyzeCompany(
      { ...profilo, datiDichiarati: DATI_DICHIARATI_VUOTI },
      [],
      new Date('2026-06-15T00:00:00Z'),
    );
    expect(
      primaVisita.prevenzione.length,
      'senza questionario il motore deve raccomandare ciò che manca, non tacere',
    ).toBeGreaterThan(0);
  });
});
