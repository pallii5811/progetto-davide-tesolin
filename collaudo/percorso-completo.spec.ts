/**
 * Il viaggio intero, in una volta sola: da «non conosco nessuno» a «ho il documento».
 *
 * Gli altri collaudi provano i pezzi — la ricerca, la scheda, il questionario, il report —
 * e ognuno parte da uno stato preparato apposta. Nessuno percorre la strada che percorre
 * davvero un intermediario, e i difetti più cari di questo prodotto sono nati **fra** i
 * pezzi, non dentro:
 *
 *  - il nome dell'azienda cancellato dal salvataggio dell'intervista, che nessuna delle
 *    due operazioni sbagliava da sola;
 *  - il fido consigliato senza aver verificato le procedure concorsuali, perché il prezzo
 *    era stato corretto in un punto e l'assunzione era rimasta in un altro;
 *  - l'elenco pagato che spariva premendo «indietro» dopo l'analisi.
 *
 * Un collaudo che attraversa tutto vede ciò che nessun collaudo di sezione può vedere: lo
 * stato che si trascina da un passo al successivo.
 */

import { expect, test } from '@playwright/test';
import { accedi } from './aiuti.js';

const AZIENDA = '03158460174';

test.describe('Percorso completo dell’intermediario', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('dalla ricerca al documento, senza perdere niente per strada', async ({ page }) => {
    test.setTimeout(180_000);

    // ── 1. Trova l'impresa ────────────────────────────────────────────────
    await page.goto('/');
    await page.getByPlaceholder('11 cifre').fill(AZIENDA);
    await page.getByRole('button', { name: 'Cerca' }).click();

    const denominazione = page.getByText(/MECCANICA BRESCIANA/i).first();
    await expect(denominazione).toBeVisible();

    // ── 2. Aprila ─────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'Analizza' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/azienda/${AZIENDA}`));
    await expect(page.getByText(/Score di credito/i).first()).toBeVisible();

    /*
      Il nome deve esserci, e deve essere un nome.

      Su un'impresa vera si è visto comparire la partita IVA al suo posto: un salvataggio
      che della società conosceva solo il numero glielo scriveva sopra. Qui si pretende che
      il nome sopravviva a tutto il percorso, controllandolo a ogni tappa.
    */
    await expect(page.getByRole('heading', { name: /MECCANICA BRESCIANA/i })).toBeVisible();

    // ── 3. Le sezioni che compongono il valore ────────────────────────────
    for (const sezione of [
      /Piano d’azione sulle coperture/i,
      /Somme assicurande/i,
      /Merito creditizio/i,
      /Record camerale/i,
    ]) {
      await expect(page.getByText(sezione).first()).toBeVisible();
    }

    // ── 4. Compila un dato d'intervista ───────────────────────────────────
    await page.goto(`/azienda/${AZIENDA}/dati`);
    const dipendenti = page.getByLabel('Dipendenti', { exact: false }).first();
    await expect(dipendenti).toBeVisible();
    await dipendenti.fill('42');
    await page.getByRole('button', { name: /salva/i }).click();

    // ── 5. Il nome è sopravvissuto al salvataggio ─────────────────────────
    await page.goto(`/azienda/${AZIENDA}`);
    await expect(
      page.getByRole('heading', { name: /MECCANICA BRESCIANA/i }),
      'il salvataggio dei dati di intervista non deve sostituire il nome con la partita IVA',
    ).toBeVisible();

    // ── 6. Il documento per il cliente ────────────────────────────────────
    await page.goto(`/azienda/${AZIENDA}/report`);
    await expect(page.getByText(/Sintesi per la direzione/i)).toBeVisible();
    await expect(page.getByText(/MECCANICA BRESCIANA/i).first()).toBeVisible();

    /*
      Nel documento che si consegna al cliente non deve comparire nessuna affermazione che
      la piattaforma non abbia accertato. È la specie di difetto che è ricomparsa sette
      volte in questo prodotto, e il report è il posto in cui costa di più: porta il
      marchio dello studio e si rilegge fuori contesto.
    */
    const testo = (await page.locator('article').innerText()).toLowerCase();
    for (const frase of ['non risulta averlo adempiuto', 'da sanare']) {
      expect(testo, `il report non deve affermare «${frase}» senza averlo verificato`).not.toContain(frase);
    }

    // ── 7. Il portafoglio l'ha registrata ─────────────────────────────────
    await page.goto('/portafoglio');
    // Il portafoglio disegna la stessa riga due volte — tabella per schermo largo, schede
    // per telefono — e una delle due è nascosta dal foglio di stile. Si verifica che il
    // nome ci sia, non quale delle due copie sia visibile.
    await expect(page.locator('body')).toContainText(/MECCANICA BRESCIANA/i);
  });
});

test.describe('La navigazione dell’analisi', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('ogni voce del menu porta a una sezione che esiste', async ({ page }) => {
    /*
      L'elenco era fisso: dodici voci sempre. Su un'impresa senza bilancio depositato
      quattro puntavano a sezioni che la pagina non disegna — Ritenzione, Prevenzione,
      Eventi negativi, Bilancio. Si cliccava e non succedeva niente.

      Chi clicca due volte e non vede muoversi la pagina non conclude «questa sezione non
      c'è», conclude «questo programma è rotto». E ha ragione.
    */
    await page.goto(`/azienda/${AZIENDA}`);
    await expect(page.getByText(/Score di credito/i).first()).toBeVisible();

    const ancore = await page
      .locator('nav[aria-label="Sezioni dell’analisi"] a')
      .evaluateAll((elementi) => elementi.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));

    expect(ancore.length, 'il menu delle sezioni deve esserci').toBeGreaterThan(3);

    for (const href of ancore) {
      const id = href.replace('#', '');
      await expect(
        page.locator(`#${id}`),
        `la voce «${id}» del menu punta a una sezione che non esiste`,
      ).toHaveCount(1);
    }
  });
});

test.describe('Il secondo percorso: dai filtri al cliente nuovo', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('trova per insiemi, compra l’elenco, analizza, esporta e sorveglia', async ({ page }) => {
    test.setTimeout(180_000);

    // ── 1. Descrive l'insieme che cerca ───────────────────────────────────
    await page.goto('/prospect');
    await page.getByLabel('Provincia').fill('BS');
    await page.getByRole('button', { name: /Quante sono/i }).click();
    await expect(page.getByText(/aziende corrispondono/i)).toBeVisible();

    /*
      Il prezzo si legge prima di premere.

      È la regola che questo prodotto ha violato per un'intera notte — un pulsante che
      dichiarava dieci centesimi e ne spendeva cinquantacinque, un altro che comprava
      filtri diversi da quelli scritti a schermo. Qui la si ripretende nel punto esatto in
      cui i soldi escono.
    */
    /*
      Il prezzo ora compare in DUE punti, e questo è un bene: prima era scritto a mano in
      quattro posti diversi, e il commento del sorgente sosteneva che stesse in uno solo.
      Centralizzato il valore, il testo che qui era unico non lo è più e la ricerca
      trovava due elementi.

      Si poteva mettere `.first()` e tacere. Ma quando due schermate mostrano lo stesso
      prezzo, la cosa che vale la pena controllare non è che se ne veda uno: è che
      DICANO LO STESSO NUMERO. È esattamente il difetto da cui questa correzione nasce.
    */
    const prezziAdAzienda = page.getByText(/€ ad azienda/);
    await expect(prezziAdAzienda.first()).toBeVisible();

    const cifre = (await prezziAdAzienda.allInnerTexts()).map(
      (t) => /(\d+[.,]\d+)\s*€\s*ad azienda/.exec(t)?.[1] ?? t,
    );
    expect(
      cifre.length,
      'nessun prezzo per azienda a schermo prima del pulsante che spende',
    ).toBeGreaterThan(0);
    expect(new Set(cifre).size, `due prezzi diversi sulla stessa schermata: ${cifre.join(' / ')}`).toBe(1);

    // ── 2. Compra l'elenco ────────────────────────────────────────────────
    await page.getByTestId('scarica-elenco').click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/aziende scaricate/i)).toBeVisible();

    // ── 3. Analizza la prima, e il registro dei rischi c'è ────────────────
    await page.getByRole('link', { name: 'Analizza' }).first().click();
    await expect(page.getByText(/Score di credito/i).first()).toBeVisible();
    await expect(page.getByText(/Registro dei rischi/i)).toBeVisible();
    await expect(page.getByText(/ISO 31000/i).first()).toBeVisible();

    // ── 4. Il portafoglio si esporta, e il file non accusa nessuno ────────
    await page.goto('/portafoglio');
    const scaricamento = page.waitForEvent('download');
    await page
      .getByRole('link', { name: /Esporta/i })
      .first()
      .click();
    const file = await scaricamento;
    const flusso = await file.createReadStream();
    let csv = '';
    for await (const pezzo of flusso) csv += String(pezzo);

    expect(csv, 'il file deve avere le intestazioni').toContain('Denominazione');
    expect(
      csv.toLowerCase(),
      'un file che esce dalla piattaforma non deve dichiarare inadempienze non verificate',
    ).not.toContain('da sanare');

    // ── 5. Il monitoraggio gira, e dichiara di non consumare credito ──────
    await page.goto('/monitoraggio');
    await expect(page.getByText(/Non consuma credito dati/i)).toBeVisible();
  });
});
