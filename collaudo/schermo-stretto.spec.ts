/**
 * Su telefono nessuna pagina deve scorrere in orizzontale.
 *
 * Lo scorrimento laterale del corpo pagina è il difetto più comune e il più fastidioso:
 * una tabella larga, una riga di numeri che non va a capo, e metà del contenuto finisce
 * fuori schermo **senza alcun indizio che ci sia dell'altro**. Chi guarda conclude che il
 * dato non ci sia.
 *
 * Un intermediario apre queste schermate dal telefono, in azienda, davanti al cliente. È
 * il momento in cui il prodotto viene giudicato, e non c'è una seconda occasione.
 */

import { expect, test } from '@playwright/test';

const LARGHEZZA_TELEFONO = 390;

const PAGINE: readonly { readonly percorso: string; readonly nome: string }[] = [
  { percorso: '/', nome: 'ricerca' },
  { percorso: '/prospect', nome: 'nuovi clienti' },
  { percorso: '/portafoglio', nome: 'portafoglio' },
  { percorso: '/monitoraggio', nome: 'monitoraggio' },
  { percorso: '/catalogo', nome: 'catalogo rischi' },
  { percorso: '/impostazioni', nome: 'impostazioni' },
  { percorso: '/impostazioni/costi', nome: 'consumi dei dati' },
  // Le due più pesanti: tabelle di indici, righe di capitali, elenchi di rischi.
  { percorso: '/azienda/03158460174', nome: 'scheda azienda' },
  { percorso: '/azienda/03158460174/report', nome: 'report per il cliente' },
];

test.describe('Schermo stretto', () => {
  for (const { percorso, nome } of PAGINE) {
    test(`${nome} non scorre in orizzontale`, async ({ page }) => {
      await page.setViewportSize({ width: LARGHEZZA_TELEFONO, height: 844 });
      await page.goto(percorso);

      const eccedenza = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      /*
        Qualche pixel di tolleranza: gli arrotondamenti del motore di rendering non sono un
        difetto. Oltre, c'è del contenuto che nessuno vedrà.
      */
      expect(eccedenza, `${nome}: ${eccedenza}px di contenuto fuori schermo`).toBeLessThanOrEqual(2);
    });
  }
});
