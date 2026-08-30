/**
 * I difetti bloccanti del motore CAT NAT, uno per prova.
 *
 * Ogni prova qui sotto è stata vista fallire sul codice non corretto. Le prove che già
 * esistevano non li vedevano per una ragione precisa e ripetuta: confrontavano la stringa
 * ISO della costante, oppure getUTCFullYear, cioè il valore che dentro la costante è
 * corretto. Il giorno che il prodotto stampa a un intermediario italiano non è quello: è
 * il giorno letto a Roma, e su sette termini di legge su sette era il giorno dopo.
 *
 * Da qui la regola di questo file: le date si guardano come le guarda il cliente, con
 * formattaGiorno, che il fuso lo dichiara invece di ereditarlo dalla macchina.
 */

import { describe, expect, it } from 'vitest';
import { PROROGHE_SETTORIALI, TERMINI_CATNAT, assessCatNat } from '../src/coverage/catnat.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { FormaGiuridica, StatoAttivita } from '../src/company/profile.js';
import { DEMO_AS_OF, demoCompanyProfile, deriveFacts, euro, reclassify } from '../src/index.js';
import { formattaGiorno } from '../src/shared/tempo.js';

const profilo = demoCompanyProfile();
const bilancio = reclassify(profilo.bilanci[0]!.value);
const FATTI = deriveFacts(profilo, bilancio, DEMO_AS_OF);

function valuta(modifiche: Partial<CompanyFacts>, asOf: Date = DEMO_AS_OF) {
  return assessCatNat({
    facts: { ...FATTI, ...modifiche },
    baseAssicurabile: euro(1_000_000),
    giaCoperta: false,
    asOf,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 3 · Sette termini di legge su sette stampati il giorno dopo
// ─────────────────────────────────────────────────────────────────────────────

describe('Le sette date di legge sono quelle di docs/DOMINIO.md', () => {
  it('le quattro scadenze per classe dimensionale', () => {
    expect(formattaGiorno(TERMINI_CATNAT.grande), 'grandi imprese').toBe('31/03/2025');
    expect(formattaGiorno(TERMINI_CATNAT.media), 'medie imprese').toBe('01/10/2025');
    expect(formattaGiorno(TERMINI_CATNAT.piccola), 'piccole imprese').toBe('01/01/2026');
    expect(formattaGiorno(TERMINI_CATNAT.micro), 'micro imprese').toBe('01/01/2026');
  });

  it('e le tre proroghe settoriali', () => {
    expect(formattaGiorno(PROROGHE_SETTORIALI['03']!.termine), 'pesca').toBe('31/12/2026');
    expect(formattaGiorno(PROROGHE_SETTORIALI['55']!.termine), 'alloggio').toBe('31/03/2026');
    expect(formattaGiorno(PROROGHE_SETTORIALI['56']!.termine), 'somministrazione').toBe('31/03/2026');
  });

  it('il giorno che il motore dichiara è quello della tabella', () => {
    const esito = valuta({ dimensione: 'grande' });
    const stampato = esito.explanation.inputs.find((i) => i.label === 'Termine di legge')?.value;
    expect(stampato).toBe('31/03/2025');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 3b · Il meno zero: ventiquattro ore di scadenza invisibile
// ─────────────────────────────────────────────────────────────────────────────

describe('Il termine scade quando finisce il giorno che il prodotto stampa', () => {
  // Termine delle piccole imprese: 01/01/2026. A Roma finisce alle 23:59:59 di quel giorno.
  const PICCOLA: Partial<CompanyFacts> = { dimensione: 'piccola', atecoDivisione: '25' };

  it('il giorno del termine non è ancora scaduto, e mancano zero giorni', () => {
    const esito = valuta(PICCOLA, new Date('2026-01-01T12:00:00Z')).value;
    expect(esito.status).toBe('in-scadenza');
    expect(esito.giorniAlTermine).toBe(0);
  });

  it('il giorno dopo è scaduto, e lo è per tutte e ventiquattro le ore', () => {
    for (let ora = 0; ora < 24; ora += 1) {
      const quando = new Date(Date.UTC(2026, 0, 2, ora, 30, 0));
      const dove = `alle ${String(ora)}:30 UTC del 02/01/2026`;
      const esito = valuta(PICCOLA, quando).value;
      expect(esito.status, dove).toBe('inadempiente');
      expect(esito.giorniAlTermine, dove).toBeLessThan(0);
    }
  });

  it('e non produce mai un meno zero, che minore di zero non è', () => {
    const esito = valuta(PICCOLA, new Date('2026-01-02T00:30:00Z'));
    expect(Object.is(esito.value.giorniAlTermine, -0)).toBe(false);
    expect(esito.explanation.notes.join(' ')).not.toContain('entro 0 giorni');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 12 · Enti non imprenditoriali dichiarati soggetti
// ─────────────────────────────────────────────────────────────────────────────

describe('L’obbligo grava sulle imprese tenute all’iscrizione ex art. 2188 c.c.', () => {
  const NON_IMPRENDITORIALI: readonly FormaGiuridica[] = ['associazione', 'fondazione', 'ente-pubblico'];

  it('associazione, fondazione ed ente pubblico non sono dichiarati inadempienti', () => {
    for (const formaGiuridica of NON_IMPRENDITORIALI) {
      const esito = valuta({ formaGiuridica }).value;
      expect(esito.soggetta, formaGiuridica).toBe(false);
      expect(esito.status, formaGiuridica).toBe('non-soggetta');
    }
  });

  it('e l’esclusione dichiara la condizione che la riaprirebbe', () => {
    for (const formaGiuridica of NON_IMPRENDITORIALI) {
      const motivo = valuta({ formaGiuridica }).value.motivoEsclusione ?? '';
      expect(motivo, formaGiuridica).toContain('2188');
      expect(motivo, formaGiuridica).toContain('registro delle imprese');
    }
  });

  it('la società di capitali e quella di persone restano soggette', () => {
    for (const formaGiuridica of ['srl', 'spa', 'snc', 'ditta-individuale'] as const) {
      expect(valuta({ formaGiuridica }).value.soggetta, formaGiuridica).toBe(true);
    }
  });

  it('la forma non rilevata non vale esclusione: ignoto non è escluso', () => {
    expect(valuta({ formaGiuridica: 'altro' }).value.soggetta).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 12b · Solo cessata escludeva, e dentro la sezione A non escludeva affatto
// ─────────────────────────────────────────────────────────────────────────────

describe('Lo stato dell’impresa viene letto, e viene letto per primo', () => {
  it('l’impresa fallita non riceve l’avviso di inadempimento', () => {
    const esito = valuta({ statoAttivita: 'fallita' }).value;
    expect(esito.soggetta).toBe(false);
    expect(esito.motivoEsclusione ?? '').toContain('liquidazione giudiziale');
  });

  it('dentro la sezione A il controllo sullo stato non è irraggiungibile', () => {
    // Prima: la sezione A ritornava sempre prima, e un peschereccio cessato usciva
    // soggetto e inadempiente.
    const esito = valuta({
      atecoSezione: 'A',
      atecoDivisione: '03',
      statoAttivita: 'cessata',
    }).value;
    expect(esito.soggetta).toBe(false);
    expect(esito.motivoEsclusione ?? '').toContain('cessata');
  });

  it('gli stati non terminali restano soggetti, ma lo stato viene dichiarato', () => {
    const attesi: Readonly<Record<string, string>> = {
      'in-liquidazione': 'in liquidazione',
      inattiva: 'inattiva',
      sospesa: 'sospesa',
    };
    for (const [stato, parola] of Object.entries(attesi)) {
      const esito = valuta({ statoAttivita: stato as StatoAttivita });
      expect(esito.value.soggetta, stato).toBe(true);
      expect(esito.explanation.notes.join(' '), stato).toContain(parola);
    }
  });

  it('e l’impresa attiva non si porta dietro nessuna di quelle note', () => {
    const note = valuta({ statoAttivita: 'attiva' }).explanation.notes.join(' ');
    expect(note).not.toContain('in liquidazione');
    expect(note).not.toContain('sospesa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 13 · L’art. 2086 alla ditta individuale, e «preclude» per «si tiene conto»
// ─────────────────────────────────────────────────────────────────────────────

describe('Le conseguenze dell’inadempimento dicono quello che dice la norma', () => {
  it('l’art. 2086 c. 2 c.c. si cita a chi opera in forma societaria o collettiva', () => {
    for (const formaGiuridica of ['srl', 'spa', 'snc', 'sas', 'cooperativa'] as const) {
      const testo = valuta({ formaGiuridica }).value.conseguenzeInadempimento.join(' ');
      expect(testo, formaGiuridica).toContain('2086');
    }
  });

  it('e non alla ditta individuale, che in forma societaria non opera', () => {
    const testo = valuta({
      formaGiuridica: 'ditta-individuale',
    }).value.conseguenzeInadempimento.join(' ');
    expect(testo).not.toContain('2086');
  });

  it('e nemmeno alla forma non rilevata, che è il valore dell’ignoto', () => {
    const testo = valuta({ formaGiuridica: 'altro' }).value.conseguenzeInadempimento.join(' ');
    expect(testo).not.toContain('2086');
  });

  it('l’inadempimento non preclude i sostegni straordinari: se ne tiene conto', () => {
    const testo = valuta({}).value.conseguenzeInadempimento.join(' ');
    expect(testo.length, 'senza conseguenze non ci sarebbe niente da guardare').toBeGreaterThan(0);
    expect(testo).not.toMatch(/preclud/i);
    expect(testo).not.toContain('nessun accesso');
    expect(testo).toContain('si tiene conto');
  });
});
