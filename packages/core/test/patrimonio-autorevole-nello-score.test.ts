import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';

/**
 * Il terzo consumatore del patrimonio netto, che la prima correzione non aveva raggiunto.
 *
 * TRANSPECIAL S.R.L.: l'anagrafica estesa porta nei bilanci sintetici un campo che vale
 * −121.388 € nel 2025 — la perdita d'esercizio, non il patrimonio — mentre il profilo
 * completo dà 393.127 €. Fido, equity ratio e record camerale leggevano già il secondo; il
 * tetto dello score sul «patrimonio netto negativo» leggeva ancora il primo, e tagliava il
 * punteggio a 35 su un'impresa con quasi quattrocentomila euro di mezzi propri.
 */
const profilo = demoCompanyProfile();

function conCampoGrezzoNegativo(patrimonioDellArchivio: number | null): CompanyProfile {
  const [ultimo, ...precedenti] = profilo.bilanciSintetici;
  return {
    ...profilo,
    bilanci: [],
    bilanciSintetici: [
      { ...ultimo!, value: { ...ultimo!.value, patrimonioNetto: Money.euro(-121_388) } },
      ...precedenti,
    ],
    indicatoriFornitore: {
      ...profilo.indicatoriFornitore,
      aggregati: patrimonioDellArchivio === null ? null : { patrimonioNetto: patrimonioDellArchivio },
    },
  };
}

const score = (p: CompanyProfile) => analyzeCompany(p, [], DEMO_AS_OF).creditScore.value;

describe('Lo score legge il patrimonio netto dalla fonte che sa dimostrarlo', () => {
  it('il campo grezzo negativo non taglia il punteggio quando l’archivio dà il patrimonio vero', () => {
    const s = score(conCampoGrezzoNegativo(393_127));
    expect(s.cap ?? '').not.toContain('Patrimonio netto negativo');
  });

  it('senza il patrimonio dell’archivio il tetto resta, come prima: il dato non si inventa', () => {
    const s = score(conCampoGrezzoNegativo(null));
    expect(s.cap ?? '').toContain('Patrimonio netto negativo');
    expect(s.value ?? 100).toBeLessThanOrEqual(35);
  });

  it('e un patrimonio negativo dichiarato dall’archivio il tetto lo applica', () => {
    const s = score(conCampoGrezzoNegativo(-50_000));
    expect(s.cap ?? '').toContain('Patrimonio netto negativo');
  });
});
