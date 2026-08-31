/**
 * L'azione consigliata deve dire QUALE dato manca, non che ne manca uno.
 *
 * Sulla scheda di un'impresa reale comparivano nove schede una sotto l'altra che dicevano
 * tutte la stessa cosa: «Rilevare i dati necessari a dimensionare X», col solo nome della
 * garanzia a cambiare. Nove volte la stessa istruzione è nessuna istruzione — chi legge
 * deve presentarsi dal cliente sapendo quale domanda fare, e quella riga non lo diceva.
 *
 * Il catalogo lo sapeva già: ogni garanzia dichiara la propria base di calcolo. Il campo
 * era però letto in un posto solo, la rotta che lo ricopia verso il client, mentre il
 * commento sopra il tipo prometteva che «guida il motore di calcolo delle somme
 * assicurande». Otto varianti scritte con cura, e nessuna che facesse qualcosa.
 *
 * Queste prove sono state viste fallire sul codice non corretto: prima della modifica la
 * prima falliva su ogni garanzia e la seconda trovava una sola frase distinta.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile, demoPolizze } from '../src/index.js';

/** La frase che c'era prima, tenuta qui perché non possa tornare senza farlo notare. */
const FRASE_GENERICA = 'Rilevare i dati necessari a dimensionare';

const scenari = [
  { nome: 'con le polizze in essere', polizze: demoPolizze() },
  { nome: 'alla prima visita, senza polizze', polizze: [] },
] as const;

describe('Le garanzie da quantificare dicono quale dato serve', () => {
  for (const scenario of scenari) {
    const analisi = analyzeCompany(demoCompanyProfile(), scenario.polizze, DEMO_AS_OF);
    const daQuantificare = analisi.gap.gaps.filter((g) => g.status === 'da-quantificare');

    it(`${scenario.nome}: lo scenario esercita davvero questo stato`, () => {
      // Senza questa riga le due prove sotto passerebbero su un insieme vuoto, che è il
      // modo più silenzioso che un presidio ha di non guardare niente.
      expect(daQuantificare.length).toBeGreaterThan(0);
    });

    it(`${scenario.nome}: nessuna ripete la frase generica`, () => {
      const generiche = daQuantificare.filter((g) => g.azione.includes(FRASE_GENERICA));
      expect(generiche.map((g) => g.definition.label)).toEqual([]);
    });

    it(`${scenario.nome}: basi di calcolo diverse danno istruzioni diverse`, () => {
      /*
        Il vincolo vero, ed è più forte di «la frase è cambiata».

        Due garanzie che si dimensionano sulla STESSA base possono legittimamente
        condividere l'istruzione: se per entrambe serve il monte salari, la domanda da
        fare al cliente è una sola e ripeterla è corretto. Ciò che non deve accadere è
        l'opposto — che basi diverse producano la stessa frase, perché allora
        l'informazione che il catalogo possiede sta andando persa un'altra volta.
      */
      const perBase = new Map<string, Set<string>>();
      for (const g of daQuantificare) {
        const insieme = perBase.get(g.definition.base) ?? new Set<string>();
        // Il nome della garanzia esce dal confronto: due frasi che differiscono solo per
        // quello sono la stessa istruzione, ed è esattamente il difetto di partenza.
        insieme.add(g.azione.split(g.definition.label).join('…'));
        perBase.set(g.definition.base, insieme);
      }

      const frasiPerBase = [...perBase.entries()].map(([base, frasi]) => ({
        base,
        frasi: [...frasi],
      }));
      const distinte = new Set(frasiPerBase.flatMap((v) => v.frasi));

      expect(
        distinte.size,
        `${perBase.size} basi di calcolo distinte producono ${distinte.size} istruzioni: ` +
          frasiPerBase.map((v) => `${v.base} → ${v.frasi.join(' | ')}`).join('  ·  '),
      ).toBe(perBase.size);
    });
  }
});
