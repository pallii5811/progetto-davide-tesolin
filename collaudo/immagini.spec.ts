import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Le fotografie delle ubicazioni, dal browser al report.
 *
 * Le prove unitarie coprono l'API — formato, peso, tetto, isolamento fra intermediari —
 * ma non toccano il percorso che l'intermediario usa davvero, che è più lungo e ha già
 * tradito una volta su questo prodotto: il file viene letto **nel browser**, convertito
 * in data URI, passato a una Server Action, da lì all'API con il cookie di sessione, e
 * infine la pagina va rinfrescata perché la nuova immagine compaia.
 *
 * Ognuno di quei passaggi può fallire in silenzio. La Server Action che salvava
 * l'intervista, per un periodo, chiamava l'API senza sessione: l'API rispondeva 401 con
 * un corpo JSON valido, e mezz'ora di lavoro spariva senza un messaggio.
 *
 * La verifica decisiva non è che l'anteprima appaia — quella la si può mostrare dal file
 * letto in memoria, senza aver salvato niente — ma che la fotografia **si ritrovi dopo un
 * ricaricamento** e che **arrivi nel report**, che è il documento consegnato al cliente.
 */

/** Un PNG rosso 2×2, il più piccolo file valido che un browser accetta di mostrare. */
const PNG_ROSSO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z4AATAxQxhBiAgD4qgH/HrGZlgAAAABJRU5ErkJggg==',
  'base64',
);

const DIDASCALIA = 'Prospetto nord, copertura in pannello sandwich';

test.describe('Fotografie delle ubicazioni', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('una fotografia caricata sopravvive al ricaricamento e arriva nel report', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const sorveglianza = sorvegliaErrori(page);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const sezione = page.getByText('Fotografie delle ubicazioni');
    await expect(sezione).toBeVisible({ timeout: 90_000 });

    // La prima ubicazione: la didascalia e il campo file sono nel suo blocco.
    await page.getByPlaceholder('Didascalia — cosa mostra').first().fill(DIDASCALIA);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: 'capannone.png', mimeType: 'image/png', buffer: PNG_ROSSO });

    // Il caricamento passa da una Server Action: si attende che la didascalia compaia
    // come testo della miniatura, non un tempo fisso.
    await expect(page.getByText(DIDASCALIA)).toBeVisible({ timeout: 60_000 });

    /*
      Il ricaricamento è la prova vera. Un'anteprima si può disegnare dal file letto in
      memoria senza che nulla sia stato salvato: solo dopo un giro completo dal database
      si sa che la fotografia c'è davvero.
    */
    await page.reload();
    await expect(page.getByText(DIDASCALIA)).toBeVisible({ timeout: 90_000 });

    // E deve arrivare dove serve: nel documento che l'intermediario consegna.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(
      page.getByRole('heading', { name: /Documentazione fotografica delle ubicazioni/ }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(DIDASCALIA)).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('la numerazione dei capitoli del report non salta', async ({ page }) => {
    test.setTimeout(120_000);

    /*
      I capitoli sono numerati da un contatore proprio perché due di essi sono
      condizionali e a mano era già uscito un «3-bis» stampato dopo il quinto. Su un
      documento consegnato a un cliente è la prima cosa che si nota, e mette in dubbio
      tutto il resto: qui si misura che la successione sia intera.
    */
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(page.getByRole('heading', { name: /Sintesi per la direzione/ })).toBeVisible({
      timeout: 90_000,
    });

    const titoli = await page.locator('article h2').allTextContents();
    const numeri = titoli.map((t) => Number.parseInt(t.trim(), 10)).filter((n) => !Number.isNaN(n));

    expect(numeri.length).toBeGreaterThan(5);
    expect(numeri).toEqual(numeri.map((_, i) => i + 1));
  });

  test('un file che non è una fotografia viene rifiutato con un motivo', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.getByText('Fotografie delle ubicazioni')).toBeVisible({ timeout: 90_000 });

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'contratto.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 finto'),
      });

    // Il rifiuto deve dire **cosa** è ammesso: «formato non valido» manda a indovinare.
    await expect(page.getByText(/Formati ammessi/)).toBeVisible({ timeout: 30_000 });
  });
});
