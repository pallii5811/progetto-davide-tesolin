import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Gli studi ospitati sulla piattaforma, dal browser.
 *
 * Il percorso che fa chi vende il servizio: apre lo studio del cliente, gli consegna le
 * credenziali, e più avanti — quando un abbonamento non viene pagato — ne sospende gli
 * accessi senza toccargli i dati.
 *
 * Il presidio che conta è l'ultimo di questo file: lo studio cliente, entrato con le
 * proprie credenziali, **non deve vedere** da dove arrivano i dati né quanto costano.
 * Verificarlo dal browser è l'unico modo di sapere che vale anche quando qualcuno
 * digita l'indirizzo a mano.
 */
test.describe('Studi sulla piattaforma', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la pagina esiste e dichiara che gli studi sono isolati', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto('/impostazioni/studi');

    await expect(page.getByRole('heading', { name: /Studi sulla piattaforma/i })).toBeVisible();
    await expect(page.getByText(/lavora isolato/i)).toBeVisible();
    // Lo studio con cui si sta lavorando è quello che gestisce: deve dirlo.
    await expect(page.getByText('gestore').first()).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('apre uno studio cliente e mostra la password una volta sola', async ({ page }) => {
    await page.goto('/impostazioni/studi');

    await page.getByLabel(/Denominazione dello studio/i).fill('STUDIO COLLAUDO S.R.L.');
    await page.getByLabel(/Referente/i).fill('Titolare di collaudo');
    await page.getByLabel(/Indirizzo di accesso/i).fill('titolare@studiocollaudo.it');
    await page.getByRole('button', { name: /Apri lo studio/i }).click();

    await expect(page.getByText(/STUDIO COLLAUDO S\.R\.L\. aperto/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Non verrà mostrata di nuovo/i)).toBeVisible();

    // Ricaricando, la password non c'è più: è il comportamento voluto, e va collaudato
    // perché è esattamente ciò che qualcuno un giorno «aggiusterà» conservandola.
    await page.reload();
    await expect(page.getByText(/Non verrà mostrata di nuovo/i)).toHaveCount(0);
    await expect(page.getByText('STUDIO COLLAUDO S.R.L.')).toBeVisible();
  });

  test('lo studio del gestore non ha il comando per sospendersi', async ({ page }) => {
    await page.goto('/impostazioni/studi');

    // Sospendere sé stessi significherebbe chiudersi fuori dalla piattaforma che si
    // amministra, senza nessuno che possa riaprirla.
    const rigaGestore = page.getByRole('row').filter({ hasText: 'gestore' });
    await expect(rigaGestore.getByRole('button', { name: /Sospendi/i })).toHaveCount(0);
  });

  test('lo studio cliente ha il comando per sospenderlo', async ({ page }) => {
    await page.goto('/impostazioni/studi');

    await page.getByLabel(/Denominazione dello studio/i).fill('STUDIO DA SOSPENDERE S.R.L.');
    await page.getByLabel(/Referente/i).fill('Titolare');
    await page.getByLabel(/Indirizzo di accesso/i).fill('titolare@dasospendere.it');
    await page.getByRole('button', { name: /Apri lo studio/i }).click();
    await expect(page.getByText(/STUDIO DA SOSPENDERE S\.R\.L\. aperto/i)).toBeVisible({
      timeout: 30_000,
    });

    const riga = page.getByRole('row').filter({ hasText: 'STUDIO DA SOSPENDERE S.R.L.' });
    await expect(riga.getByRole('button', { name: /Sospendi/i })).toBeVisible();
    await expect(riga.getByText('attivo')).toBeVisible();
  });
});

/**
 * Il confine visto dall'altra parte.
 *
 * Non basta che le voci di menù non compaiano: si entra con le credenziali di uno studio
 * cliente e si digitano gli indirizzi a mano, come farebbe chiunque li avesse visti una
 * volta.
 */
test.describe('Cosa non vede uno studio cliente', () => {
  const EMAIL = 'confine@studiocliente.it';
  const DENOMINAZIONE = 'STUDIO CONFINE S.R.L.';

  test('non trova né i servizi dati né la fornitura né gli altri studi', async ({ page, browser }) => {
    await accedi(page);
    await page.goto('/impostazioni/studi');

    await page.getByLabel(/Denominazione dello studio/i).fill(DENOMINAZIONE);
    await page.getByLabel(/Referente/i).fill('Titolare');
    await page.getByLabel(/Indirizzo di accesso/i).fill(EMAIL);
    await page.getByRole('button', { name: /Apri lo studio/i }).click();
    await expect(
      page.getByText(new RegExp(`${DENOMINAZIONE.replace(/\./g, '\\.')} aperto`, 'i')),
    ).toBeVisible({
      timeout: 30_000,
    });

    const password = (await page.getByTestId('password-iniziale').innerText()).trim();

    // Sessione pulita: il cliente entra dal proprio browser, non eredita nulla.
    const contesto = await browser.newContext();
    const suaPagina = await contesto.newPage();
    try {
      await accedi(suaPagina, { email: EMAIL, password });

      // Nel menù non compaiono.
      await suaPagina.goto('/impostazioni');
      await expect(suaPagina.getByRole('link', { name: /Servizi dati/i })).toHaveCount(0);
      await expect(suaPagina.getByRole('link', { name: /Studi sulla piattaforma/i })).toHaveCount(0);

      // E digitando l'indirizzo a mano si finisce fuori, non dentro.
      for (const percorso of ['/impostazioni/servizi', '/impostazioni/studi']) {
        await suaPagina.goto(percorso);
        await expect(suaPagina).toHaveURL(/\/impostazioni$/);
      }

      // Da nessuna parte deve comparire il nome del fornitore dei dati.
      const testo = await suaPagina.locator('body').innerText();
      expect(testo).not.toContain('OpenAPI');
    } finally {
      await contesto.close();
    }
  });
});

/**
 * L'account di prova: uno studio con un tetto di spesa complessivo per i dati.
 *
 * Richiesta di Simone del 19/09/2026 — un cliente che prova il prodotto e «in totale può usare
 * massimo 5 euro». Il gestore lo imposta sulla riga dello studio; il cliente lo vede in cima a
 * ogni pagina, prima di scoprirlo da un rifiuto; e quando il credito finisce l'avviso lo dice.
 */
test.describe('Account di prova con credito', () => {
  const EMAIL = 'prova@tettocollaudo.it';
  const DENOMINAZIONE = 'STUDIO PROVA TETTO S.R.L.';

  /** Imposta il tetto dalla riga dello studio, come farebbe il gestore. */
  const impostaTetto = async (page: Page, euro: string): Promise<void> => {
    await page.goto('/impostazioni/studi');
    const riga = page.getByRole('row').filter({ hasText: DENOMINAZIONE });
    await riga.getByRole('button', { name: /(Imposta|Cambia) il tetto|Imposta un tetto/i }).click();
    await riga
      .getByLabel(new RegExp(`Tetto di spesa totale di ${DENOMINAZIONE.replace(/\./g, '\\.')}`))
      .fill(euro);
    await riga.getByRole('button', { name: 'Salva' }).click();
    await expect(riga.getByText(new RegExp(`su ${euro},00 €`))).toBeVisible({ timeout: 30_000 });
  };

  /** Axe su chiaro e scuro: l'avviso nuovo compare solo qui, le altre pagine non lo vedono mai. */
  const senzaViolazioni = async (page: Page, cosa: string): Promise<void> => {
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.reload();
      const esito = await new AxeBuilder({ page })
        .include('[role="status"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const violazioni = esito.violations.flatMap((v) =>
        v.nodes.map((n) => `[${tema}] ${v.id} su ${n.target.join(' ')}`),
      );
      expect(violazioni, `${cosa}: ${violazioni.length} violazioni`).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };

  test('il gestore lo imposta, il cliente lo vede e lo vede finire', async ({ page, browser }) => {
    test.setTimeout(240_000);
    await accedi(page);
    await page.goto('/impostazioni/studi');

    await page.getByLabel(/Denominazione dello studio/i).fill(DENOMINAZIONE);
    await page.getByLabel(/Referente/i).fill('Titolare in prova');
    await page.getByLabel(/Indirizzo di accesso/i).fill(EMAIL);
    await page.getByRole('button', { name: /Apri lo studio/i }).click();
    await expect(
      page.getByText(new RegExp(`${DENOMINAZIONE.replace(/\./g, '\\.')} aperto`, 'i')),
    ).toBeVisible({ timeout: 30_000 });
    const password = (await page.getByTestId('password-iniziale').innerText()).trim();

    // Uno studio appena aperto non ha tetto: spende come tutti gli altri.
    const riga = page.getByRole('row').filter({ hasText: DENOMINAZIONE });
    await expect(riga.getByText(/nessun tetto/i)).toBeVisible();

    // Un importo che non è un importo non parte, e lo dice.
    await riga.getByRole('button', { name: /Imposta un tetto/i }).click();
    await riga.getByLabel(/Tetto di spesa totale/i).fill('cinque');
    await riga.getByRole('button', { name: 'Salva' }).click();
    await expect(riga.getByRole('alert')).toContainText(/per esempio 5 o 5,00/);
    await riga.getByRole('button', { name: 'Annulla' }).click();

    await impostaTetto(page, '5');

    const contesto = await browser.newContext();
    const suaPagina = await contesto.newPage();
    try {
      const sorveglianza = sorvegliaErrori(suaPagina);
      await accedi(suaPagina, { email: EMAIL, password });
      await suaPagina.goto('/prospect');

      const avviso = suaPagina.getByRole('status').filter({ hasText: /Account di prova/ });
      await expect(avviso).toContainText('Hai usato 0,00 € dei 5,00 € a disposizione per i dati.');
      await senzaViolazioni(suaPagina, 'avviso del credito');
      // Il cliente non deve sapere da chi arrivano i dati, nemmeno dal suo avviso.
      expect(await suaPagina.locator('body').innerText()).not.toContain('OpenAPI');

      // Tetto a zero: il credito è finito, e l'avviso lo dice con quello che resta possibile.
      await impostaTetto(page, '0');
      await suaPagina.reload();
      const finito = suaPagina.getByRole('status').filter({ hasText: /Credito di prova esaurito/ });
      await expect(finito).toContainText('le aziende già analizzate restano consultabili');
      await senzaViolazioni(suaPagina, 'avviso del credito esaurito');

      expect(sorveglianza.errori).toEqual([]);
    } finally {
      await contesto.close();
    }
  });
});
