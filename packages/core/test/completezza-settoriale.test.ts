/**
 * Il questionario cambia con il settore.
 *
 * Chiedere a uno studio di architettura se trasporta merci proprie non è soltanto inutile:
 * quella domanda entra nel denominatore della completezza, e un'impresa che non può
 * rispondere resta per sempre sotto il cento per cento — cioè viene invitata all'infinito
 * a compilare qualcosa che non la riguarda.
 *
 * La regola qui presidiata è duplice: la domanda esce **e dal numeratore e dal
 * denominatore**, e quando il codice ATECO non è noto la domanda resta, perché escluderla
 * sarebbe una decisione presa al buio.
 */

import { describe, expect, it } from 'vitest';
import { deriveFacts, valutaCompletezza, demoCompanyProfile, DATI_DICHIARATI_VUOTI } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';
import { parseAteco } from '../src/shared/identifiers.js';

function profiloCon(ateco: string | null): CompanyProfile {
  const base = demoCompanyProfile();
  return {
    ...base,
    datiDichiarati: DATI_DICHIARATI_VUOTI,
    anagrafica: {
      ...base.anagrafica,
      value: {
        ...base.anagrafica.value,
        atecoPrimario: ateco === null ? null : parseAteco(ateco),
        atecoSecondari: [],
      },
    },
  };
}

function chiaviMancanti(ateco: string | null): string[] {
  const profilo = profiloCon(ateco);
  const facts = deriveFacts(profilo, null, new Date('2026-01-01T00:00:00Z'));
  return valutaCompletezza(profilo.datiDichiarati, facts).mancanti.map((m) => m.chiave);
}

describe('Domande pertinenti al settore', () => {
  it('non chiede la RC Prodotti a uno studio professionale', () => {
    // 71.11.09 — attività di architettura: non immette prodotti sul mercato.
    expect(chiaviMancanti('71.11.09')).not.toContain('prodotti');
  });

  it('la chiede a un’impresa manifatturiera', () => {
    // 25.62.00 — lavori di meccanica generale.
    expect(chiaviMancanti('25.62.00')).toContain('prodotti');
  });

  it('chiede delle lavorazioni in cantiere a un’impresa di costruzioni', () => {
    expect(chiaviMancanti('41.20.00')).toContain('cantiere');
  });

  it('la chiede anche a uno studio tecnico, che opera presso il cliente', () => {
    // I servizi tecnici il cantiere lo frequentano: la domanda ha oggetto.
    expect(chiaviMancanti('71.11.09')).toContain('cantiere');
  });

  it('non chiede il trasporto di merci proprie a chi merci non ne ha', () => {
    expect(chiaviMancanti('71.11.09')).not.toContain('trasporti');
    expect(chiaviMancanti('25.62.00')).toContain('trasporti');
  });

  it('con ATECO ignoto pone comunque tutte le domande', () => {
    // Escludere una domanda senza sapere il settore significherebbe sostituire
    // un'informazione mancante con un'ipotesi.
    const mancanti = chiaviMancanti(null);
    expect(mancanti).toContain('prodotti');
    expect(mancanti).toContain('trasporti');
    expect(mancanti).toContain('cantiere');
  });
});

describe('Le domande non pertinenti non pesano sulla completezza', () => {
  it('lo studio professionale può raggiungere il cento per cento', () => {
    const profilo = profiloCon('71.11.09');
    const facts = deriveFacts(profilo, null, new Date('2026-01-01T00:00:00Z'));

    const completezza = valutaCompletezza(profilo.datiDichiarati, facts);
    const senzaFiltro = valutaCompletezza(profilo.datiDichiarati);

    // Stesso questionario vuoto: entrambe a zero. Ciò che cambia è il denominatore,
    // e quindi quante domande restano da porre.
    expect(completezza.punteggioMassimo).toBeLessThan(senzaFiltro.punteggioMassimo);
    expect(completezza.mancanti.length).toBeLessThan(senzaFiltro.mancanti.length);
  });

  it('l’impresa manifatturiera conserva l’intero questionario', () => {
    const profilo = profiloCon('25.62.00');
    const facts = deriveFacts(profilo, null, new Date('2026-01-01T00:00:00Z'));

    expect(valutaCompletezza(profilo.datiDichiarati, facts).punteggioMassimo).toBe(
      valutaCompletezza(profilo.datiDichiarati).punteggioMassimo,
    );
  });
});
