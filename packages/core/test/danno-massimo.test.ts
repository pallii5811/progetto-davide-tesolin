/**
 * Il danno massimo probabile, e la scelta di forma che ne discende.
 *
 * Il punto non è produrre un numero più basso: è produrne uno **difendibile**. Un capitale
 * stimato in basso su protezioni mai accertate al sinistro non basta, e la responsabilità
 * di quel numero è dell'intermediario che l'ha proposto.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';
import { stimaDannoMassimo } from '../src/coverage/danno-massimo.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { ImmobileDichiarato } from '../src/company/profile.js';

const VALORE = Money.euro(4_000_000);

function fatti(modifiche: Partial<CompanyFacts> = {}): CompanyFacts {
  // Solo i campi che il calcolo legge davvero: costruire un `CompanyFacts` intero
  // renderebbe il test illeggibile senza aggiungere nulla.
  return {
    atecoDivisione: '25',
    numeroUnitaLocali: 2,
    ...modifiche,
  } as CompanyFacts;
}

function immobile(modifiche: Partial<ImmobileDichiarato> = {}): ImmobileDichiarato {
  return {
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
    ...modifiche,
  };
}

describe('Senza informazioni non si è ottimisti', () => {
  it('con attività ignota assume la perdita totale', () => {
    const esito = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: null }), []);

    expect(esito.value?.quota).toBe(1);
    expect(esito.value?.probabile).toBe(VALORE);
    expect(esito.value?.forma).toBe('valore-intero');
  });

  it('protezioni non dichiarate non valgono come protezioni presenti', () => {
    const ignoto = stimaDannoMassimo(VALORE, fatti(), [immobile()]);
    const protetto = stimaDannoMassimo(VALORE, fatti(), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    // «Non lo so» non è «ce l'ha»: la differenza è ciò che al sinistro fa la differenza.
    expect(ignoto.value!.quota).toBeGreaterThan(protetto.value!.quota);
  });

  it('dichiara quale domanda abbasserebbe la stima, in ordine di impatto', () => {
    const esito = stimaDannoMassimo(VALORE, fatti(), [immobile()]);

    expect(esito.value?.domandeCheAbbassanoLaStima[0]).toMatch(/compartimentazione/i);
    expect(esito.confidence).toBe('bassa');
  });

  it('senza il valore dei beni non produce un numero inventato', () => {
    const esito = stimaDannoMassimo(null, fatti(), [immobile()]);

    expect(esito.value).toBeNull();
    expect(esito.confidence).toBe('bassa');
  });
});

describe('Le protezioni abbassano la stima secondo quanto reggono davvero', () => {
  it('la compartimentazione pesa più dello sprinkler', () => {
    const soloCompartimenti = stimaDannoMassimo(VALORE, fatti(), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: false }),
    ]);
    const soloSprinkler = stimaDannoMassimo(VALORE, fatti(), [
      immobile({ compartimentazioneRei: false, impiantoSprinkler: true }),
    ]);

    // È struttura, non un dispositivo che deve attivarsi: le compagnie la trattano così,
    // e il modello deve rispecchiarlo.
    expect(soloCompartimenti.value!.quota).toBeLessThan(soloSprinkler.value!.quota);
  });

  it('con tutte le protezioni accertate la confidenza è alta', () => {
    const esito = stimaDannoMassimo(VALORE, fatti(), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    expect(esito.confidence).toBe('alta');
    expect(esito.value?.domandeCheAbbassanoLaStima).toEqual([]);
  });

  it('non scende mai sotto un terzo del valore', () => {
    const esito = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: '25' }), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    // 0.6 × 0.55 × 0.7 = 0.231, sotto il pavimento: nessuna protezione è certa, e un
    // capitale più basso al sinistro non basterebbe.
    expect(esito.value!.quota).toBe(0.35);
    expect(esito.explanation.notes.join(' ')).toMatch(/nessuna protezione è certa/i);
  });

  it('i valori concentrati in un’unica ubicazione alzano la stima', () => {
    const concentrati = stimaDannoMassimo(VALORE, fatti({ numeroUnitaLocali: 1 }), [
      immobile({ compartimentazioneRei: false, impiantoSprinkler: false }),
    ]);
    const distribuiti = stimaDannoMassimo(VALORE, fatti({ numeroUnitaLocali: 3 }), [
      immobile({ compartimentazioneRei: false, impiantoSprinkler: false }),
      immobile({ compartimentazioneRei: false, impiantoSprinkler: false }),
    ]);

    expect(concentrati.value!.quota).toBeGreaterThan(distribuiti.value!.quota);
  });
});

describe('La combustibilità del settore fa la differenza', () => {
  const conSettore = (divisione: string): number =>
    stimaDannoMassimo(VALORE, fatti({ atecoDivisione: divisione }), [
      immobile({ compartimentazioneRei: false, impiantoSprinkler: false }),
    ]).value!.quota;

  it('un deposito di legname brucia più di un’officina meccanica', () => {
    expect(conSettore('16')).toBeGreaterThan(conSettore('25'));
  });

  it('la chimica è il caso peggiore: l’esplosione vanifica i compartimenti', () => {
    const chimica = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: '20' }), [
      immobile({ compartimentazioneRei: false, impiantoSprinkler: false }),
    ]);
    expect(chimica.value!.quota).toBeGreaterThanOrEqual(0.9);
  });

  it('il magazzinaggio sconta i valori concentrati e impilati', () => {
    expect(conSettore('52')).toBeGreaterThan(conSettore('25'));
  });
});

describe('La scelta di forma, e perché è la parte che vale di più', () => {
  it('con danno probabile contenuto propone il primo rischio assoluto', () => {
    const esito = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: '25' }), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    expect(esito.value?.forma).toBe('primo-rischio-assoluto');
    // L'argomento decisivo non è il risparmio di premio: è che il primo rischio assoluto
    // non è soggetto alla regola proporzionale, e per una PMI che stima i beni a occhio
    // quella è la differenza fra essere indennizzati e non esserlo.
    expect(esito.value?.motivazioneForma).toMatch(/regola\s+\*{0,2}proporzionale/i);
    expect(esito.value?.motivazioneForma).toMatch(/1907/);
  });

  it('dichiara anche il lato scomodo del primo rischio', () => {
    const esito = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: '25' }), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    // Presentare solo il vantaggio sarebbe vendere, non consigliare.
    expect(esito.value?.motivazioneForma).toMatch(/scoperta per l’eccedenza|eccedenza/i);
    expect(esito.value?.motivazioneForma).toMatch(/spetta al cliente/i);
  });

  it('con danno probabile vicino al totale resta il valore intero', () => {
    const esito = stimaDannoMassimo(VALORE, fatti({ atecoDivisione: '16' }), [immobile()]);

    expect(esito.value?.forma).toBe('valore-intero');
    expect(esito.value?.motivazioneForma).toMatch(/regola proporzionale/i);
  });

  it('il danno possibile resta il valore intero dei beni', () => {
    const esito = stimaDannoMassimo(VALORE, fatti(), [
      immobile({ compartimentazioneRei: true, impiantoSprinkler: true }),
    ]);

    // Il probabile è una stima; il possibile è un fatto, e non va mai perso di vista.
    expect(esito.value?.possibile).toBe(VALORE);
    expect(esito.value!.probabile).toBeLessThan(esito.value!.possibile);
  });

  it('il capitale si arrotonda per eccesso', () => {
    const esito = stimaDannoMassimo(Money.euro(3_333_333), fatti({ atecoDivisione: '16' }), [immobile()]);

    // Arrotondare per difetto un capitale da assicurare crea la sottoassicurazione che
    // tutto questo lavoro serve a evitare.
    expect(esito.value!.probabile).toBeGreaterThanOrEqual(
      Money.multiply(Money.euro(3_333_333), esito.value!.quota),
    );
  });
});
