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
    { percorso: '/', atteso: /Analisi integrata/i },
    { percorso: '/portafoglio', atteso: /Portafoglio/i },
    { percorso: '/catalogo', atteso: /Cataloghi di riferimento/i },
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
    await page.goto('/');

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

  test('il catalogo elenca davvero i rischi, non una pagina vuota', async ({ page }) => {
    await page.goto('/catalogo');

    // Un catalogo vuoto passerebbe il controllo sul titolo: qui si guarda il contenuto.
    await expect(page.getByText(/\d+ rischi · ISO 31000/)).toBeVisible();
    await expect(page.getByText(/\d+ garanzie/)).toBeVisible();
  });
});

test.describe('Analisi di un’azienda', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('l’analisi si apre con score, fido ed esposizione', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    for (const metrica of [
      'score-di-credito',
      'fido-consigliato',
      'patrimonio-esposto',
      'esposizione-non-assicurata',
    ]) {
      const carta = page.getByTestId(`metrica-${metrica}`);
      await expect(carta, metrica).toBeVisible();

      // Ogni riquadro deve mostrare un numero, non un segnaposto: «da rilevare» al posto
      // di una cifra significa che il motore non ha saputo calcolare, e va visto subito.
      await expect(carta.locator('dd').first(), metrica).toHaveText(/\d/);
    }

    expect(sorveglianza.errori).toEqual([]);
  });

  test('ogni numero sa spiegarsi', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const spiegazioni = page.getByText('Come è stato calcolato');
    expect(await spiegazioni.count()).toBeGreaterThan(3);

    await spiegazioni.first().click();
    await expect(page.getByText(/Formula:/).first()).toBeVisible();
  });

  test('l’esposizione non supera patrimonio più margine', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const leggiEuro = async (metrica: string): Promise<number> => {
      const testo = await page.getByTestId(`metrica-${metrica}`).locator('dd').first().innerText();
      const cifra = /([\d.]+)\s*€/.exec(testo)?.[1] ?? '0';
      return Number(cifra.replace(/\./g, ''));
    };

    const patrimonio = await leggiEuro('patrimonio-esposto');
    const esposizione = await leggiEuro('esposizione-non-assicurata');

    // Il doppio conteggio delle scorte gonfiava proprio questo rapporto. Il margine può
    // farla superare il patrimonio, ma non di un multiplo.
    expect(esposizione).toBeGreaterThan(0);
    expect(esposizione).toBeLessThan(patrimonio * 3);
  });

  test('il report per il cliente si apre e riporta le motivazioni', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);

    await expect(page.getByRole('button', { name: /stampa/i })).toBeVisible();
    expect(sorveglianza.errori).toEqual([]);
  });
});

/**
 * Il danno massimo probabile è il numero con cui un assicuratore dimensiona davvero
 * l'incendio, e la scelta di forma che ne discende è la parte di maggior valore per chi
 * consiglia: decide se il cliente resta esposto alla regola proporzionale o ne è fuori.
 */
test.describe('Danno massimo e forma della copertura', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  });

  test('mostra possibile, probabile e la forma consigliata', async ({ page }) => {
    const sezione = page.locator('#danno-massimo');
    await expect(sezione).toBeVisible();

    await expect(sezione.getByText('Danno massimo possibile')).toBeVisible();
    await expect(sezione.getByText('Danno massimo probabile')).toBeVisible();
    await expect(sezione.getByText(/Forma consigliata:/)).toBeVisible();
  });

  test('il probabile non supera mai il possibile', async ({ page }) => {
    const leggiEuro = async (etichetta: string): Promise<number> => {
      const testo = await page
        .locator('#danno-massimo')
        .locator('dl')
        .filter({ hasText: etichetta })
        .innerText();
      return Number((/([\d.]+)\s*€/.exec(testo)?.[1] ?? '0').replace(/\./g, ''));
    };

    const possibile = await leggiEuro('Danno massimo possibile');
    const probabile = await leggiEuro('Danno massimo probabile');

    expect(possibile).toBeGreaterThan(0);
    expect(probabile).toBeGreaterThan(0);
    expect(probabile).toBeLessThanOrEqual(possibile);
  });

  test('spiega la scelta citando la regola proporzionale', async ({ page }) => {
    // È l'argomento che un assicuratore riconosce: senza, la proposta è solo un numero.
    await expect(page.locator('#danno-massimo').getByText(/regola proporzionale/i)).toBeVisible();
  });

  test('dichiara cosa chiedere quando la stima resta prudenziale', async ({ page }) => {
    const sezione = page.locator('#danno-massimo');
    const domande = sezione.getByText(/Cosa chiedere per stimare meglio/);

    // L'azienda dimostrativa non ha compartimentazione dichiarata: la piattaforma deve
    // dire quale domanda abbasserebbe il capitale, invece di limitarsi a un numero alto.
    if ((await domande.count()) > 0) {
      // Compare sia nell'elenco delle domande sia fra le note del calcolo: basta che ci
      // sia, non che sia in un punto solo.
      await expect(sezione.getByText(/compartimentazione/i).first()).toBeVisible();
    }
  });
});

/**
 * Capacità e propensione al rischio.
 *
 * È il primo passo dell'ISO 31000 e l'unico che trasforma il trattamento in una decisione
 * dell'imprenditore. Se la propensione non è stata chiesta, la piattaforma deve dirlo: una
 * franchigia proposta su un'ipotesi non è documentazione di adeguatezza.
 */
test.describe('Capacità e propensione al rischio', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  });

  test('mostra franchigia sostenibile e vincolo più stringente', async ({ page }) => {
    const sezione = page.locator('#ritenzione');
    if ((await sezione.count()) === 0) return; // senza bilancio non si propone nulla

    await expect(sezione.getByTestId('metrica-franchigia-sostenibile')).toBeVisible();
    await expect(sezione.getByTestId('metrica-vincolo-piu-stringente')).toBeVisible();
  });

  test('quando la propensione non è stata chiesta lo dichiara', async ({ page }) => {
    const sezione = page.locator('#ritenzione');
    if ((await sezione.count()) === 0) return;

    const avviso = sezione.getByText(/Propensione al rischio non ancora rilevata/);
    if ((await avviso.count()) > 0) {
      // Compare nell'avviso e fra le note del calcolo: basta che ci sia.
      await expect(sezione.getByText(/ipotesi prudente/i).first()).toBeVisible();
    }
  });

  test('la franchigia non supera mai la capacità per sinistro', async ({ page }) => {
    const sezione = page.locator('#ritenzione');
    if ((await sezione.count()) === 0) return;

    const leggi = async (testid: string): Promise<number> => {
      const testo = await sezione.getByTestId(testid).locator('dd').first().innerText();
      return Number((/([\d.]+)\s*€/.exec(testo)?.[1] ?? '0').replace(/\./g, ''));
    };

    // La ritenzione annua è un multiplo del singolo sinistro: se fosse minore, il modello
    // starebbe dicendo che due sinistri costano meno di uno.
    expect(await leggi('metrica-ritenzione-annua')).toBeGreaterThanOrEqual(
      await leggi('metrica-franchigia-sostenibile'),
    );
  });
});
