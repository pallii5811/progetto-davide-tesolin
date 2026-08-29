import { describe, expect, it } from 'vitest';
import {
  BILANCIO_DEPOSITATO,
  REGISTRO_IMPRESE,
  REGISTRO_PROTESTI,
  assumed,
  declared,
  describeSource,
  describeSourceTecnica,
  fromProvider,
  sourced,
} from '../src/shared/provenance.js';
import type { DataSource } from '../src/shared/provenance.js';

const OSSERVATO = new Date('2026-08-19T00:00:00Z');

/**
 * La fonte che il cliente legge.
 *
 * Il broker consegna al proprio cliente un fascicolo che dovrà difendere — davanti al
 * cliente stesso, davanti a un legale dopo un sinistro, davanti a IVASS in ispezione. In
 * quel documento la fonte citata deve essere il registro pubblico dove il dato è
 * depositato: nominare l'API commerciale da cui è transitato indica un soggetto che
 * nessuno di quegli interlocutori conosce, e indebolisce il documento invece di sostenerlo.
 *
 * È anche, banalmente, ciò che un distributore non vuole mostrare ai propri clienti. Le
 * due esigenze coincidono, e questo file è il presidio che le tiene insieme.
 */
describe('Provenienza mostrata al cliente', () => {
  it('per un dato acquistato cita il registro, non chi lo rivende', () => {
    const s = fromProvider({}, 'OpenAPI.com', 'IT-advanced', REGISTRO_IMPRESE, OSSERVATO);
    expect(describeSource(s.source)).toBe('Registro Imprese');
  });

  it('nessuna descrizione destinata al cliente nomina un distributore', () => {
    /*
      Il presidio vero: non verifica una stringa attesa, verifica che **nessun** nome di
      distributore possa comparire, qualunque sia il servizio interrogato. Se un domani si
      aggiunge una seconda fonte a pagamento, questo collaudo la copre già.
    */
    const distributori = ['OpenAPI', 'openapi', 'Creditsafe', 'Cerved', 'IT-advanced', 'IT-full'];

    const fonti: readonly DataSource[] = [
      fromProvider({}, 'OpenAPI.com', 'IT-advanced', REGISTRO_IMPRESE, OSSERVATO).source,
      fromProvider({}, 'OpenAPI.com', 'IT-full', REGISTRO_IMPRESE, OSSERVATO).source,
      fromProvider({}, 'OpenAPI.com', 'IT-balance-sheet', BILANCIO_DEPOSITATO, OSSERVATO).source,
      fromProvider({}, 'OpenAPI.com', 'IT-negativita', REGISTRO_PROTESTI, OSSERVATO).source,
      fromProvider({}, 'Creditsafe', 'company-report', REGISTRO_IMPRESE, OSSERVATO).source,
      declared({}, 'intervista al cliente', OSSERVATO).source,
      assumed({}, 'bilancio non disponibile', OSSERVATO).source,
      sourced({}, { kind: 'documento', tipo: 'SFCR', riferimento: '2025' }, OSSERVATO).source,
      sourced({}, { kind: 'calcolato', da: ['ricavi', 'ebitda'] }, OSSERVATO).source,
      sourced({}, { kind: 'benchmark', dataset: 'ATECO 25.62' }, OSSERVATO).source,
      sourced({}, { kind: 'norma', riferimento: 'art. 1907 c.c.' }, OSSERVATO).source,
    ];

    for (const fonte of fonti) {
      const descrizione = describeSource(fonte);
      for (const distributore of distributori) {
        expect(descrizione).not.toContain(distributore);
      }
    }
  });

  it('i registri citati sono quelli che un cliente riconosce', () => {
    expect(describeSource(fromProvider({}, 'X', 'y', REGISTRO_IMPRESE, OSSERVATO).source)).toBe(
      'Registro Imprese',
    );
    expect(describeSource(fromProvider({}, 'X', 'y', BILANCIO_DEPOSITATO, OSSERVATO).source)).toBe(
      'Bilancio depositato al Registro Imprese',
    );
    expect(describeSource(fromProvider({}, 'X', 'y', REGISTRO_PROTESTI, OSSERVATO).source)).toBe(
      'Registro protesti e procedure concorsuali',
    );
  });

  it('le altre provenienze restano descritte come prima', () => {
    // La correzione riguarda solo i dati acquistati: dichiarato, calcolato, ipotesi e norma
    // non passano da nessun distributore e devono continuare a dire ciò che dicevano.
    expect(describeSource(declared({}, 'il cliente', OSSERVATO).source)).toBe('Dichiarato da il cliente');
    expect(describeSource(assumed({}, 'dato mancante', OSSERVATO).source)).toBe('Ipotesi: dato mancante');
    expect(
      describeSource(sourced({}, { kind: 'norma', riferimento: 'L. 213/2023' }, OSSERVATO).source),
    ).toBe('Riferimento normativo: L. 213/2023');
  });
});

/**
 * La diagnostica di chi gestisce la piattaforma è l'unico posto dove il distributore va
 * nominato: quando un dato non torna, la prima domanda è quale chiamata l'ha prodotto.
 */
describe('Provenienza tecnica', () => {
  it('nomina registro, distributore e servizio', () => {
    const s = fromProvider({}, 'OpenAPI.com', 'IT-advanced', REGISTRO_IMPRESE, OSSERVATO);
    expect(describeSourceTecnica(s.source)).toBe('Registro Imprese · via OpenAPI.com IT-advanced');
  });

  it('sulle fonti non acquistate coincide con quella mostrata al cliente', () => {
    const s = declared({}, 'il cliente', OSSERVATO);
    expect(describeSourceTecnica(s.source)).toBe(describeSource(s.source));
  });
});
