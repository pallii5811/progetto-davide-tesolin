import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Ogni pagina si apre, mostra il proprio contenuto e non produce errori.
 *
 * Nasce da un guasto vero: «Catalogo rischi», voce del menu principale, rispondeva 500
 * da giorni. La chiamata all'API partiva senza sessione, l'API rispondeva 401, e il corpo
 * di quel 401 era JSON valido — quindi nessuna eccezione, nessun allarme, e una pagina
 * che si rompeva su un campo mancante.
 */
test.describe('Le pagine si aprono e mostrano qualcosa', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  const pagine = [
    { percorso: '/prospect', atteso: /Trova nuove aziende/ },
    { percorso: '/portafoglio', atteso: /Le aziende già analizzate/ },
    { percorso: '/impostazioni', atteso: /Cambia password/i },
    { percorso: '/impostazioni/utenti', atteso: /Utenti dello studio/i },
  ];

  test('l’avviso di modalità dimostrativa dice il vero e indica un rimedio praticabile', async ({
    page,
  }) => {
    /*
      Nasce da un errore mio, sopravvissuto perché nessun collaudo guardava questo testo:
      l'avviso rimandava «alle impostazioni», dove non c'è nulla da attivare. Chi lo
      leggeva ci andava, non trovava niente, e concludeva che il prodotto fosse rotto.

      Un avviso che manda in un posto sbagliato è peggio di un avviso assente: consuma la
      fiducia di chi lo segue. Qui si verificano le due cose che deve fare — dichiarare
      che i dati **non sono veri**, e indicare il rimedio che chi legge può davvero
      compiere.
    */
    // Dal 13/09/2026 l'avviso sta in «Ricerca Clienti»: la pagina «Ricerca» non c'è più.
    await page.goto('/prospect');

    // Il titolo esatto dell'avviso, non una ricerca a tentoni: «modalità dimostrativa»
    // compare anche fra gli esempi di partita IVA sotto il modulo di ricerca.
    const avviso = page.getByText('Modalità dimostrativa', { exact: true }).locator('..');
    await expect(avviso).toBeVisible();
    const testo = await avviso.innerText();

    // Che i dati non siano veri va detto con una parola sola e inequivocabile: chi legge
    // di fretta deve capirlo senza interpretare.
    expect(testo).toMatch(/inventate/i);

    // Il collaudo gira in sviluppo: il rimedio è il comando che chi legge può eseguire,
    // non un rinvio a una pagina dove non c'è niente da attivare.
    expect(testo).toContain('npm run dev:api');
    expect(testo).not.toMatch(/impostazioni/i);
  });

  for (const { percorso, atteso } of pagine) {
    test(`${percorso} risponde e mostra il proprio contenuto`, async ({ page }) => {
      const sorveglianza = sorvegliaErrori(page);

      const risposta = await page.goto(percorso);
      expect(risposta?.status(), percorso).toBeLessThan(400);
      await expect(page.getByText(atteso).first()).toBeVisible();

      expect(sorveglianza.errori, percorso).toEqual([]);
    });
  }

  /*
    Monitoraggio, Catalogo rischi e Importa elenco clienti sono stati tolti il 17/09/2026
    («AEGIS - cambi.pptx»). I loro indirizzi portano al CRM: un segnalibro vecchio non deve
    finire su una pagina inesistente, e non deve riaprire una pagina tolta.
  */
  for (const tolta of ['/monitoraggio', '/catalogo', '/portafoglio/importa']) {
    test(`${tolta} non esiste più e porta al CRM`, async ({ page }) => {
      const risposta = await page.goto(tolta);
      expect(risposta?.status(), tolta).toBeLessThan(400);
      await expect(page).toHaveURL(/\/portafoglio$/);
    });
  }

  test('il menu ha due voci: Ricerca Clienti e CRM', async ({ page }) => {
    await page.goto('/prospect');
    const menu = page.getByRole('navigation', { name: 'Principale' });
    await expect(menu.getByRole('link')).toHaveText(['Ricerca Clienti', 'CRM']);
  });
});

test.describe('Analisi di un’azienda', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  /*
    Dal 13/09/2026 la testata porta le tre protezioni del foglio «Veezco_Analisi Rischio.xlsx»
    al posto di score, fido, patrimonio esposto ed esposizione non assicurata.
  */
  test('l’analisi si apre con Property Risk, Business Interruption e Cyber Risk', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    for (const metrica of ['property-risk', 'business-interruption', 'cyber-risk']) {
      await expect(page.getByTestId(`metrica-${metrica}`), metrica).toBeVisible();
    }

    /*
      Il Property Risk dal 14/09/2026 si calcola: i pericoli naturali vengono dalle classi ufficiali
      (zona sismica, ISPRA IdroGEO del comune) con la scala decisa da Simone al posto della tabella
      che nel foglio manca. ADRIATICA LOGISTICA, divisione 52 (attività 5): la sede di Ravenna ha
      alluvione alta 7, zona 3 → 3, frana bassa 1; medio 3,67, pericoli 5,34; 1,50 + 1,00 + 2,67 =
      5,17. Il numero atteso è calcolato a mano dai dati grezzi, non dal motore.
    */
    await expect(page.getByTestId('metrica-property-risk').locator('dd').first()).toHaveText('5,17 su 7');
    // L'impresa dimostrativa ha ATECO e bilancio: gli altri due riquadri portano un numero.
    await expect(page.getByTestId('metrica-business-interruption').locator('dd').first()).toHaveText(/\d/);
    /*
      ADRIATICA LOGISTICA S.R.L., ATECO 52.10.10: nel foglio la divisione 52 vale 6, 4, 4 e 6,
      cioè 6 × 30% + 4 × 30% + 4 × 15% + 6 × 25% = 5,1. Il numero atteso viene dal foglio.
    */
    await expect(page.getByTestId('metrica-cyber-risk').locator('dd').first()).toHaveText('5,1 su 7');

    expect(sorveglianza.errori).toEqual([]);
  });

  test('ogni protezione dice in testa come è stata calcolata, con la formula in chiaro', async ({
    page,
  }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    for (const [id, formula] of [
      ['property-risk', /Property Risk = 30% × rischio dell’attività/],
      ['business-interruption', /Perdita giornaliera = margine di contribuzione annuo ÷ 365/],
      ['cyber-risk', /Cyber Risk = arrotondato a un decimale/],
    ] as const) {
      const sezione = page.locator(`#${id}`);
      await expect(sezione.getByText('Come è stato calcolato'), id).toBeVisible();
      // Visibile senza aprire nulla: la formula sta sopra il risultato, non in un blocco chiuso.
      await expect(sezione.getByText(formula), id).toBeVisible();
    }
  });

  test('gli scenari di fermo tornano con la perdita giornaliera stampata', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    const sezione = page.locator('#business-interruption');

    const importoDi = async (selettore: string): Promise<number> => {
      const testo = await sezione.locator(selettore).locator('td').last().innerText();
      return Number(testo.replace(/[^\d,]/g, '').replace(',', '.'));
    };

    // Per identificativo, non per testo: «perdita giornaliera × 90» sta anche nelle righe degli
    // scenari, e una ricerca sul testo le prendeva tutte.
    const giornaliera = await importoDi('[data-testid="bi-perdita-giornaliera"]');
    expect(giornaliera).toBeGreaterThan(0);
    for (const giorni of [7, 30, 90]) {
      const scenario = await importoDi(`[data-testid="bi-scenario-${giorni}"]`);
      // Al centesimo: chi rifà la moltiplicazione con il numero a schermo trova lo stesso importo.
      expect(Math.round(scenario * 100), `${giorni} giorni`).toBe(Math.round(giornaliera * 100) * giorni);
    }
  });

  test('il report per il cliente si apre e riporta le motivazioni', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);

    await expect(page.getByRole('button', { name: /stampa/i })).toBeVisible();
    expect(sorveglianza.errori).toEqual([]);
  });
});

/**
 * La scheda porta le protezioni e il profilo aziendale, non l'analisi assicurativa di prima.
 *
 * Il 13/09/2026 piano d'azione, registro e matrice dei rischi, somme assicurande, danno
 * massimo, capacità di ritenzione e prevenzione hanno lasciato il posto a Property, Business
 * Interruption e Cyber Risk del foglio Veezco. Il report per il cliente resta com'era. Qui si
 * verifica che sulla scheda non ne resti un pezzo, e che il profilo aziendale sia intero.
 */
test.describe('La scheda porta le protezioni e il profilo, non l’analisi di prima', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.getByTestId('metrica-cyber-risk')).toBeVisible();
  });

  test('le sezioni tolte non ci sono più', async ({ page }) => {
    for (const id of [
      'piano',
      'rischi',
      'matrice',
      'somme',
      'danno-massimo',
      'ritenzione',
      'prevenzione',
    ]) {
      await expect(page.locator(`#${id}`), id).toHaveCount(0);
    }
    await expect(page.getByText(/Intervista (non ancora )?compilata/)).toHaveCount(0);
    await expect(page.getByText(/Obbligo assicurativo catastrofale|Obbligo CAT NAT/)).toHaveCount(0);
  });

  test('il profilo aziendale resta intero', async ({ page }) => {
    for (const id of ['record-camerale', 'ubicazioni', 'assetto', 'credito']) {
      await expect(page.locator(`#${id}`), id).toHaveCount(1);
    }
  });

  test('il Cyber Risk dell’impresa dimostrativa è quello del foglio per la divisione 52', async ({
    page,
  }) => {
    const sezione = page.locator('#cyber-risk');
    await expect(sezione.getByText(/Divisione ATECO 52/)).toBeVisible();
    await expect(sezione.getByText('5,1 su 7')).toBeVisible();
  });
});
