import { describe, expect, it } from 'vitest';
import { motivoIdraulica, motivoSismica } from '../src/risk/rules.js';
import { territorialExposure, territorialExposureDi } from '../src/risk/geo.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { TerritorialExposure } from '../src/risk/geo.js';

/**
 * Il motivo territoriale dice DA DOVE viene la misura.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * Il registro dei rischi di COMINOTTI, letto in produzione il 10/09/2026, diceva:
 *
 *   «Sede o unità locali in PROVINCIA a sismicità prevalente elevata (zone 1-2).»
 *
 * La zona sismica era però stata letta sul COMUNE — Agnosine (BS), zona 2 — e la provincia
 * di Brescia a sismicità prevalente elevata non è. La frase era rimasta indietro rispetto
 * alla fonte: affermava del territorio largo ciò che si sapeva di quello stretto.
 *
 * Vale identico al contrario, e quel verso era stato introdotto lo stesso giorno: la
 * motivazione idraulica diceva «Comune con quota elevata di imprese…» anche quando il
 * livello arrivava dalla tabella provinciale, promettendo una precisione che non c'era.
 *
 * ── PERCHÉ CONTA ──────────────────────────────────────────────────────────────
 *
 * Queste righe non restano a schermo: finiscono nel fascicolo di adeguatezza, che
 * l'intermediario firma e consegna. Una motivazione che nomina la fonte sbagliata è una
 * dichiarazione sbagliata, e la sbaglia in un punto che il cliente non può verificare.
 */

const NIENTE: CompanyFacts = {
  esposizioniTerritoriali: [],
  provinceOperative: [],
} as unknown as CompanyFacts;

function conEsposizioni(esposizioni: readonly TerritorialExposure[]): CompanyFacts {
  return { ...NIENTE, esposizioniTerritoriali: esposizioni };
}

function conProvince(sigle: readonly string[]): CompanyFacts {
  return { ...NIENTE, provinceOperative: sigle };
}

describe('Il motivo sismico nomina la fonte che ha misurato', () => {
  it('sul comune risolto dice comune, e cita la classificazione ufficiale', () => {
    // Agnosine (BS) è in zona 2: è il caso vero da cui il difetto è stato visto.
    const agnosine = territorialExposureDi({ provincia: 'BS', comune: 'Agnosine' });
    expect(agnosine.sismica, 'il caso di prova non regge se il comune non è alto').toBe('alta');
    expect(agnosine.sismicaComunale).toBe(true);

    const motivo = motivoSismica(conEsposizioni([agnosine]));
    expect(motivo).toContain('comune classificato in zona sismica');
    expect(motivo, 'non deve attribuire alla provincia ciò che sa del comune').not.toContain('provincia');
  });

  it('sul ripiego provinciale dice provincia, e dichiara che il comune non è stato risolto', () => {
    // Senza comune resta la tabella provinciale, che è ciò che la frase deve raccontare.
    const motivo = motivoSismica(conProvince(['RC']));
    const soloProvincia = territorialExposure('RC');
    expect(soloProvincia.sismica, 'il caso di prova non regge se la provincia non è alta').toBe('alta');
    expect(motivo).toContain('provincia');
    expect(motivo).toContain('non è stata risolta');
  });

  it('con fonti miste vince la più prudente: la frase deve restare vera per tutte le righe', () => {
    const comunale = territorialExposureDi({ provincia: 'BS', comune: 'Agnosine' });
    const provinciale = territorialExposure('RC');
    const motivo = motivoSismica(conEsposizioni([comunale, provinciale]));
    expect(motivo).toContain('provincia');
  });
});

describe('Il motivo idraulico nomina la fonte che ha misurato', () => {
  it('sul comune risolto dice comune e cita ISPRA', () => {
    // Dello (BS): il 28,8 % delle imprese sta in area a pericolosità elevata.
    const dello = territorialExposureDi({ provincia: 'BS', comune: 'Dello' });
    expect(dello.idraulica, 'il caso di prova non regge se il comune non è alto').toBe('alta');
    expect(dello.idrogeoComunale).toBe(true);

    const motivo = motivoIdraulica(conEsposizioni([dello]));
    expect(motivo).toContain('Comune con quota elevata di imprese');
    expect(motivo).toContain('ISPRA');
  });

  it('sul ripiego provinciale dice provincia, e non promette una misura comunale', () => {
    const provinciale = territorialExposure('VE');
    expect(provinciale.idraulica, 'il caso di prova non regge se la provincia non è alta').toBe('alta');

    const motivo = motivoIdraulica(conEsposizioni([provinciale]));
    expect(motivo).toContain('Provincia a elevata pericolosità idraulica');
    expect(motivo).toContain('il comune non è stato risolto');
    expect(
      motivo,
      'non deve promettere la quota di imprese, che a maglia provinciale non esiste',
    ).not.toContain('quota elevata di imprese');
  });
});
