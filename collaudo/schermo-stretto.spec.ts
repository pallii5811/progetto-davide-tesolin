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
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';

const LARGHEZZA_TELEFONO = 390;

const PAGINE: readonly { readonly percorso: string; readonly nome: string }[] = [
  { percorso: '/', nome: 'ricerca' },
  { percorso: '/prospect', nome: 'nuovi clienti' },
  { percorso: '/portafoglio', nome: 'portafoglio' },
  { percorso: '/monitoraggio', nome: 'monitoraggio' },
  { percorso: '/catalogo', nome: 'catalogo rischi' },
  { percorso: '/impostazioni', nome: 'impostazioni' },
  { percorso: '/impostazioni/costi', nome: 'consumi dei dati' },
  // Le più pesanti: tabelle di indici, righe di capitali, elenchi di rischi, moduli.
  { percorso: `/azienda/${AZIENDA_DI_PROVA}`, nome: 'scheda azienda' },
  { percorso: `/azienda/${AZIENDA_DI_PROVA}/report`, nome: 'report per il cliente' },
  { percorso: `/azienda/${AZIENDA_DI_PROVA}/dati`, nome: 'dati di intervista' },
];

/*
  Questo collaudo non poteva fallire, ed è il difetto che si corregge qui.

  Era l'unico spec su diciannove **senza accesso**: ogni pagina dell'elenco è protetta, il
  browser veniva rinviato a `/accedi`, e le nove asserzioni «nessuna pagina scorre in
  orizzontale» misuravano nove volte lo stesso modulo di accesso — che è largo trecento
  pixel e non scorre. Nove righe verdi su una cosa mai guardata.

  Due segni che avrebbero dovuto insospettire: la partita IVA `03158460174` non è quella
  dell'azienda dimostrativa che la predisposizione crea, quindi quelle due voci non
  avrebbero funzionato nemmeno con l'accesso; e `accedi()` compare in tutti gli altri
  diciotto spec. Un controllo che non è mai fallito non è un controllo.
*/
test.describe('Schermo stretto', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  for (const { percorso, nome } of PAGINE) {
    test(`${nome} non scorre in orizzontale`, async ({ page }) => {
      // Le due pagine dell'azienda rifanno l'intera analisi: il tempo predefinito basta a
      // regime e non basta alla prima compilazione delle rotte.
      test.setTimeout(180_000);
      await page.setViewportSize({ width: LARGHEZZA_TELEFONO, height: 844 });
      await page.goto(percorso);

      /*
        Si misura la pagina chiesta, non quella che il server ha messo al suo posto.

        È l'errore che questo file conteneva: senza questa riga, un rinvio all'accesso
        passa inosservato e la misura riguarda un'altra schermata. Vale anche adesso, se
        domani una rotta cambia guardia.
      */
      await expect(page).not.toHaveURL(/\/accedi/);
      await page.waitForLoadState('networkidle');

      /*
        Si misura l'eccedenza e si nomina CHI la causa.

        «5px di contenuto fuori schermo» è vero e inservibile: chi lo legge deve poi
        aprire il browser e cercare a mano l'elemento che sborda. L'elenco dei colpevoli
        costa una manciata di righe e trasforma un fallimento frustrante in una
        correzione di un minuto.
      */
      const { eccedenza, colpevoli } = await page.evaluate(() => {
        const larghezza = document.documentElement.clientWidth;
        const sborda = (e: Element): boolean => e.getBoundingClientRect().right > larghezza + 1;
        const fuori: string[] = [];

        /*
          Array.from e non un for-of sulla NodeList: senza DOM.Iterable fra le librerie di
          TypeScript l'iterazione diretta produce `any`, e con essa sedici errori di lint
          che nascondono quelli veri.
        */
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || !sborda(el)) continue;

          /*
            Solo i colpevoli PIÙ ESTERNI. Se un contenitore sborda, sborda anche tutta la
            sua discendenza: stampare venti righe per un difetto solo lo nasconde invece
            di mostrarlo.
          */
          const padre = el.parentElement;
          if (padre !== null && padre !== document.body && sborda(padre)) continue;

          const classi = el.className.toString().slice(0, 80);
          fuori.push(
            `<${el.tagName.toLowerCase()} class="${classi}"> sborda di ${Math.round(r.right - larghezza)}px`,
          );
        }

        return {
          eccedenza: document.documentElement.scrollWidth - larghezza,
          colpevoli: fuori.slice(0, 5),
        };
      });

      /*
        Qualche pixel di tolleranza: gli arrotondamenti del motore di rendering non sono un
        difetto. Oltre, c'è del contenuto che nessuno vedrà.
      */
      expect(
        eccedenza,
        `${nome}: ${eccedenza}px di contenuto fuori schermo.\n` +
          (colpevoli.length > 0
            ? `Elementi che sbordano:\n  ${colpevoli.join('\n  ')}`
            : 'Nessun elemento singolo sborda: guardare margini negativi e larghezze minime.'),
      ).toBeLessThanOrEqual(2);
    });
  }
});
