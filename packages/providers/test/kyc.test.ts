import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { componiEsito, pesaCandidato } from '@aegis/core';
import { corpoRichiesta, mappaCandidati } from '../src/openapi/kyc.js';

/**
 * L'adeguata verifica, provata sulla risposta VERA del servizio.
 *
 * Il campione in `.sonda/prod-WW-kyc-full-prova-schema.json` viene da una chiamata sola,
 * autorizzata dal proprietario e pagata 0,062 €. Da lì in avanti tutto si prova senza
 * spendere. Una prova a risposte inventate non avrebbe potuto insegnare la cosa che conta:
 * lo stesso nome restituisce **due persone diverse**, e il prodotto non deve confonderle.
 */
const radice = fileURLToPath(new URL('../../..', import.meta.url));
const PERCORSO = `${radice}/.sonda/prod-WW-kyc-full-prova-schema.json`;

/*
  Le risposte registrate non stanno in git: contengono dati pagati, e `.sonda/` è escluso.
  Su una macchina che non le ha, questo collaudo si salta invece di cadere — ma il salto
  deve essere rumoroso, perché un collaudo che sparisce in silenzio è verde per assenza di
  dato, che è il difetto che questo progetto insegue da sempre.
*/
const disponibile = existsSync(PERCORSO);
const campione: unknown = disponibile ? JSON.parse(readFileSync(PERCORSO, 'utf8')) : null;

describe.skipIf(!disponibile)('La risposta del servizio diventa candidati, non verdetti', () => {
  const candidati = mappaCandidati(campione);

  it('legge i due candidati distinti, e non li fonde in uno', () => {
    expect(candidati).toHaveLength(2);
    expect(new Set(candidati.map((c) => c.identificativo)).size).toBe(2);
  });

  it('distingue chi è in lista sanzioni da chi compare solo nella stampa', () => {
    const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'));
    const soloStampa = candidati.find((c) => !c.liste.includes('sanzioni'));

    expect(sanzionato?.liste).toContain('pep');
    expect(soloStampa?.liste).toEqual(['stampa-avversa']);
  });

  it('i tag «…_related» restano collegamenti, non riscontri diretti', () => {
    /*
      La fonte marca lo stesso soggetto con `sanctions` e `sanctions_related`. Appiattirli
      trasformerebbe il familiare di un sanzionato in un sanzionato: sono due cose che il
      fascicolo deve poter dire separate.
    */
    const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'))!;
    expect(sanzionato.liste).toContain('collegato-a-sanzionato');
    expect(sanzionato.liste).toContain('collegato-a-pep');
  });

  it('tiene l’anno di nascita e dice quando la fonte lo ha dedotto', () => {
    const soloStampa = candidati.find((c) => !c.liste.includes('sanzioni'))!;
    expect(soloStampa.anniDiNascita.every((a) => a.dedotto)).toBe(true);

    const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'))!;
    expect(sanzionato.anniDiNascita.some((a) => a.anno === 1952 && !a.dedotto)).toBe(true);
  });

  it('raccoglie i codici delle autorità, che sono la fonte da citare nel fascicolo', () => {
    const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'))!;
    const autorita = sanzionato.riferimenti.map((r) => r.autorita);
    expect(autorita).toContain('OFAC (Stati Uniti)');
    expect(autorita).toContain('Unione europea');
    expect(autorita).toContain('Nazioni Unite');
  });

  it('unisce le translitterazioni dello stesso nome senza ripeterle', () => {
    const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'))!;
    expect(sanzionato.nomi.length).toBe(new Set(sanzionato.nomi).size);
    expect(sanzionato.nomi.length).toBeGreaterThan(1);
  });

  it('una risposta non ancora completa non è una risposta vuota', () => {
    // «Non ho ancora guardato» non è «non c'è niente»: regola 3 del progetto.
    expect(mappaCandidati({ data: { state: 'PENDING', entities: [] } })).toEqual([]);
    expect(mappaCandidati({ data: { state: 'COMPLETED', entities: [] } })).toEqual([]);
    expect(mappaCandidati(null)).toEqual([]);
  });
});

describe.skipIf(!disponibile)('Il peso di un candidato dice su cosa si fonda', () => {
  const candidati = mappaCandidati(campione);
  const sanzionato = candidati.find((c) => c.liste.includes('sanzioni'))!;
  const soloStampa = candidati.find((c) => !c.liste.includes('sanzioni'))!;

  it('senza anno di nascita il massimo che si può dire è «possibile»', () => {
    const p = pesaCandidato({ nome: 'Vladimir Putin', ruolo: 'titolare effettivo' }, sanzionato);
    expect(p.forza).toBe('possibile');
    expect(p.perche.join(' ')).toMatch(/non è stato possibile distinguerla da un omonimo/);
  });

  it('con l’anno che coincide diventa «forte», e lo dice', () => {
    const p = pesaCandidato(
      { nome: 'Vladimir Putin', annoDiNascita: 1952, ruolo: 'titolare effettivo' },
      sanzionato,
    );
    expect(p.forza).toBe('forte');
    expect(p.gravita).toBe('bloccante');
    expect(p.perche.join(' ')).toMatch(/L’anno di nascita coincide \(1952\)/);
  });

  it('con l’anno che NON coincide scende a «debole», anche se il nome è identico', () => {
    /*
      È il caso che protegge il cliente: due persone con lo stesso nome, una sanzionata e
      una no. Il nome identico non basta, e l'anno che non torna è ciò che le separa.
    */
    const p = pesaCandidato(
      { nome: 'Vladimir Putin', annoDiNascita: 1970, ruolo: 'titolare effettivo' },
      sanzionato,
    );
    expect(p.forza).toBe('debole');
    expect(p.perche.join(' ')).toMatch(/NON coincide/);
  });

  it('un anno dedotto dalla fonte non conferma e non esclude', () => {
    const p = pesaCandidato(
      { nome: 'Vladimir Putin', annoDiNascita: 1978, ruolo: 'titolare effettivo' },
      soloStampa,
    );
    expect(p.perche.join(' ')).toMatch(/dedotto/);
    expect(p.forza).not.toBe('forte');
  });
});

describe.skipIf(!disponibile)('La conclusione che finisce nel fascicolo', () => {
  it('con dei candidati non afferma nulla sulla persona, e dice a chi tocca decidere', () => {
    const esito = componiEsito(
      { nome: 'Vladimir Putin', ruolo: 'titolare effettivo' },
      mappaCandidati(campione),
      new Date('2026-09-09T00:00:00Z'),
    );
    expect(esito.stato).toBe('da-esaminare');
    expect(esito.conclusione).toContain('2 candidati trovati');
    expect(esito.conclusione).toMatch(/va confermata o esclusa dall’intermediario/);
    // Non deve mai dire che la persona È sanzionata.
    expect(esito.conclusione).not.toMatch(/è sanzionat|risulta sanzionat/i);
  });

  it('senza candidati conclude, ma dichiara il limite della ricerca per nome', () => {
    const esito = componiEsito(
      { nome: 'Mario Rossi', ruolo: 'contraente' },
      [],
      new Date('2026-09-09T00:00:00Z'),
    );
    expect(esito.stato).toBe('nessun-riscontro');
    expect(esito.conclusione).toMatch(/La ricerca è per nome/);
    expect(esito.conclusione).toMatch(/accertata dal documento/);
  });
});

describe('Il corpo della richiesta ha la forma che il servizio accetta', () => {
  it('«query» è un oggetto: una stringa viene rifiutata con un 406', () => {
    const corpo = corpoRichiesta('Mario Rossi') as { query: Record<string, unknown> };
    expect(typeof corpo.query).toBe('object');
    expect(corpo.query['name']).toBe('Mario Rossi');
    expect(corpo.query['birthDate']).toBeNull();
  });

  it('l’anno di nascita, quando c’è, viaggia con la domanda', () => {
    const corpo = corpoRichiesta('Mario Rossi', 1952) as { query: Record<string, unknown> };
    expect(corpo.query['birthDate']).toBe('1952');
  });
});
