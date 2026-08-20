/**
 * La raccolta del contesto territoriale, e i limiti che la governano.
 *
 * Questa parte nasce da un difetto di consegna, non di codice: il modulo che legge il
 * contesto da OpenStreetMap era scritto e collaudato, ma non lo chiamava nessuno. Un
 * provider che nessuno invoca è codice morto che sembra una funzionalità — e a schermo,
 * per chi deve consegnare il prodotto, è indistinguibile dal non averlo fatto.
 *
 * Qui si verifica l'aggancio, e soprattutto i tre vincoli verso una fonte donata: il tetto
 * di ubicazioni, la lettura in sequenza, il tempo massimo complessivo. Sono i vincoli che
 * impediscono a un'impresa con quaranta unità locali di far chiudere il rubinetto a tutti.
 */

import { describe, expect, it } from 'vitest';
import { demoCompanyProfile, analizzaUbicazioni } from '@aegis/core';
import type { ContestoTerritoriale } from '@aegis/core';
import { raccogliContesti, raccogliConEsito } from '../src/contesto-ubicazioni.js';

const CONTESTO: ContestoTerritoriale = {
  vigiliDelFuoco: [{ nome: 'Distaccamento di prova', distanzaKm: 3.1, minutiStimati: 9 }],
  attivitaVicine: [
    { nome: 'Carrozzeria Tal dei Tali', categoria: 'autofficina', distanzaMetri: 120, aggravaIlRischio: true },
  ],
  attivitaCheAggravano: 1,
  raggioAnalizzatoMetri: 300,
  fonte: '© contributori OpenStreetMap (ODbL)',
};

type Esito =
  | { readonly esito: 'osservato'; readonly contesto: ContestoTerritoriale }
  | { readonly esito: 'occupato' }
  | { readonly esito: 'non-raggiunto' };

const OSSERVATO: Esito = { esito: 'osservato', contesto: CONTESTO };

/** Un lettore finto che conta le chiamate: la fonte vera non va toccata in prova. */
function lettoreFinto(risposta: Esito = OSSERVATO) {
  const chiamate: { lat: number; lon: number }[] = [];
  return {
    chiamate,
    leggi: async (lat: number, lon: number) => {
      chiamate.push({ lat, lon });
      return Promise.resolve(risposta);
    },
  };
}

describe('Raccolta del contesto territoriale', () => {
  it('indicizza il contesto con le stesse chiavi che userà l’analisi', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto();

    const contesti = await raccogliContesti(profilo, { leggi: finto.leggi });

    // La proprietà che conta: le chiavi devono combaciare con quelle prodotte dal motore,
    // altrimenti il contesto viene raccolto, pagato in tempo, e poi non trovato da nessuno.
    const { ubicazioni } = analizzaUbicazioni({
      sedeLegale: profilo.anagrafica.value.sedeLegale,
      unitaLocali: profilo.unitaLocali?.value ?? [],
      immobili: profilo.datiDichiarati.immobili,
    });
    const chiaviNote = new Set(ubicazioni.map((u) => u.id));

    expect(contesti.size).toBeGreaterThan(0);
    for (const chiave of contesti.keys()) expect(chiaviNote.has(chiave)).toBe(true);
  });

  it('non interroga le ubicazioni prive di coordinate', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto();

    await raccogliContesti(profilo, { leggi: finto.leggi });

    const { ubicazioni } = analizzaUbicazioni({
      sedeLegale: profilo.anagrafica.value.sedeLegale,
      unitaLocali: profilo.unitaLocali?.value ?? [],
      immobili: profilo.datiDichiarati.immobili,
    });
    const conCoordinate = ubicazioni.filter(
      (u) => u.indirizzo.latitudine !== null && u.indirizzo.longitudine !== null,
    );

    expect(finto.chiamate.length).toBeLessThanOrEqual(conCoordinate.length);
  });

  it('rispetta il tetto di ubicazioni interrogate', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto();

    await raccogliContesti(profilo, { leggi: finto.leggi, maxUbicazioni: 1 });

    expect(finto.chiamate).toHaveLength(1);
  });

  it('si ferma quando il tempo concesso è esaurito', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto();

    // Orologio finto già oltre la scadenza al primo controllo: nessuna lettura deve partire.
    let scatti = 0;
    const adesso = (): number => {
      scatti += 1;
      return scatti === 1 ? 0 : 1_000_000;
    };

    await raccogliContesti(profilo, { leggi: finto.leggi, budgetMs: 10, adesso });

    expect(finto.chiamate).toHaveLength(0);
  });

  it('una fonte che tace produce una mappa vuota, non un’eccezione', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto({ esito: 'non-raggiunto' });

    const contesti = await raccogliContesti(profilo, { leggi: finto.leggi });

    // La distinzione che deve sopravvivere fino al report: nessun contesto ≠ nessun rischio.
    expect(contesti.size).toBe(0);
    expect(finto.chiamate.length).toBeGreaterThan(0);
  });

  it('davanti a un limite d’uso smette di insistere e lo conta', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto({ esito: 'occupato' });

    const esito = await raccogliConEsito(profilo, { leggi: finto.leggi });

    /*
      Gli slot di Overpass sono per indirizzo IP: se la prima ubicazione trova la coda, la
      seconda la troverà uguale. Insistere consumerebbe il tempo dell'analisi per
      collezionare rifiuti — e peggiorerebbe la coda per tutti gli altri.
    */
    expect(finto.chiamate).toHaveLength(1);
    expect(esito.contesti.size).toBe(0);
    expect(esito.occupate).toBeGreaterThanOrEqual(1);
    expect(esito.nonRaggiunte).toBe(0);
  });

  it('«fonte occupata» arriva fino alle note, anche se non si è osservato nulla', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto({ esito: 'occupato' });

    const esito = await raccogliConEsito(profilo, { leggi: finto.leggi });
    const { note } = analizzaUbicazioni({
      sedeLegale: profilo.anagrafica.value.sedeLegale,
      unitaLocali: profilo.unitaLocali?.value ?? [],
      immobili: profilo.datiDichiarati.immobili,
      contesti: esito.contesti,
      esitoContesto: { occupate: esito.occupate, nonRaggiunte: esito.nonRaggiunte },
    });

    /*
      È il caso in cui il capitolo sparisce dal report: se anche la nota tacesse, il
      documento non direbbe niente di un dato che si era deciso di raccogliere, e chi legge
      concluderebbe che intorno non c'è nulla.
    */
    expect(note.some((n) => n.includes("limite d'uso"))).toBe(true);
  });

  it('il contesto raccolto arriva nell’analisi, indicizzato per ubicazione', async () => {
    const profilo = demoCompanyProfile();
    const finto = lettoreFinto();

    const contesti = await raccogliContesti(profilo, { leggi: finto.leggi });
    const { ubicazioni, note } = analizzaUbicazioni({
      sedeLegale: profilo.anagrafica.value.sedeLegale,
      unitaLocali: profilo.unitaLocali?.value ?? [],
      immobili: profilo.datiDichiarati.immobili,
      contesti,
    });

    const conContesto = ubicazioni.filter((u) => u.contesto !== null);
    expect(conContesto.length).toBe(contesti.size);

    // L'attribuzione della fonte è un obbligo di licenza: deve comparire da sola, senza
    // che chi costruisce la pagina debba ricordarsene.
    expect(note.some((n) => n.includes('OpenStreetMap'))).toBe(true);
  });
});
