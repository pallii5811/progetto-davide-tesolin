import { describe, expect, it } from 'vitest';
import { COMUNI_ITALIANI } from '@aegis/core/comuni';
import { MockCompanyProvider } from '../src/mock.js';

/**
 * Le aziende dimostrative non si contraddicono con l'elenco dei comuni.
 *
 * Dal 13/09/2026 la ricerca di nuovi clienti mostra il codice catastale della città scelta,
 * preso dall'elenco ISTAT. La scheda dell'azienda dimostrativa di Adro diceva A057, che è
 * Adrara San Martino (BG), e le aziende di Avellino e Ravenna ereditavano lo stesso codice
 * dal profilo di base: sulla stessa pagina, il modulo diceva A060 e la scheda sotto un altro
 * comune. Un dato inventato che contraddice un dato vero insegna a non fidarsi di nessuno
 * dei due.
 */
describe('Codici catastali delle aziende dimostrative', () => {
  it('ogni scheda porta il codice ISTAT del comune in cui la sede si trova', async () => {
    const aziende = await new MockCompanyProvider().search({});

    expect(aziende.length).toBeGreaterThanOrEqual(3);
    for (const azienda of aziende) {
      const sede = azienda.anagrafica?.sedeLegale;
      const comuneIstat = COMUNI_ITALIANI.find(
        (c) => c.nome === sede?.comune && c.sigla === sede.provincia,
      );
      expect(comuneIstat, `${azienda.denominazione}: comune ${sede?.comune} non trovato`).toBeDefined();
      expect(azienda.anagrafica?.codiceCatastale, azienda.denominazione).toBe(comuneIstat?.codiceCatastale);
    }
  });

  it('la ricerca per città trova ciascuna azienda nel suo comune, e solo lì', async () => {
    const provider = new MockCompanyProvider();
    const aziende = await provider.search({});

    for (const azienda of aziende) {
      const codice = azienda.anagrafica?.codiceCatastale ?? '';
      const trovate = await provider.cercaProspect({ comune: codice }, { soloConteggio: false });
      expect(
        trovate.aziende.map((a) => a.denominazione),
        `${azienda.denominazione} (${codice})`,
      ).toEqual([azienda.denominazione]);
    }
  });
});
