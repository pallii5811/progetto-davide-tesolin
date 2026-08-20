import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * La scelta di cosa portare nel documento.
 *
 * È una funzione comoda e potenzialmente pericolosa: questo report è la documentazione di
 * adeguatezza dell'art. 58 del Reg. IVASS 40/2018, cioè la carta che difende
 * l'intermediario davanti a una contestazione. Poter togliere dei rischi va bene;
 * toglierli **in silenzio** produrrebbe un documento che sembra completo e non lo è, e a
 * rimetterci sarebbe proprio l'intermediario.
 *
 * Le prove qui sotto misurano entrambe le metà: che l'esclusione funzioni, e che il
 * documento la dichiari.
 */
test.describe('Selezione dei rischi da portare nel report', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
    // Un'analisi vera, così il registro dei rischi ha delle righe.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
  });

  test('senza selezione il report è intero e non dichiara nulla', async ({ page }) => {
    test.setTimeout(120_000);
    const sorveglianza = sorvegliaErrori(page);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(page.getByRole('button', { name: /stampa/i })).toBeVisible({ timeout: 90_000 });

    await expect(page.getByText('Documento parziale')).toHaveCount(0);
    await expect(page.getByText(/Tutti i \d+ rischi rilevati sono nel documento/)).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('escludere un rischio lo toglie dal registro e lo dichiara nel documento', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(page.getByRole('button', { name: /stampa/i })).toBeVisible({ timeout: 90_000 });

    /*
      Il nome del rischio si legge dal pannello, non dalla tabella.

      Prendere «la prima tabella dell'articolo» sembrava equivalente e non lo era: la prima
      è quella di sintesi, e la prova finiva per escludere «Score di credito». Il pannello
      elenca esattamente i rischi selezionabili, quindi è l'unica fonte non ambigua.
    */
    await page.getByRole('button', { name: 'Scegli i rischi da includere' }).click();
    const primaVoce = page.locator('label').filter({ has: page.getByRole('checkbox') }).first();
    const etichetta = (await primaVoce.innerText()).split('\n')[0]?.trim() ?? '';
    expect(etichetta.length).toBeGreaterThan(3);

    // Il registro dei rischi, prima: il nome c'è.
    const registro = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Richieste ed esigenze rilevate/ }) });
    await expect(registro.getByText(etichetta, { exact: false }).first()).toBeVisible();

    await primaVoce.getByRole('checkbox').uncheck();

    /*
      La dichiarazione è la metà che conta: senza, chi legge concluderebbe che quel rischio
      non è stato rilevato, invece che non riportato. La differenza fra le due cose è tutto
      ciò che l'intermediario ha, il giorno in cui il cliente fa la domanda.
    */
    await expect(page.getByText('Documento parziale')).toBeVisible({ timeout: 30_000 });
    // Senza l'apostrofo iniziale: nel documento è `&apos;`, che rende un apostrofo dritto,
    // mentre nel codice si scrive quello tipografico. Cercare il carattere renderebbe la
    // prova sensibile a una scelta di composizione invece che al contenuto.
    await expect(
      page.getByText(/esclusione riguarda la presentazione, non la valutazione/),
    ).toBeVisible();
    await expect(page.getByText(`Non riportati:`)).toBeVisible();
    await expect(page.getByText(etichetta, { exact: false }).last()).toBeVisible();

    // E il registro, dopo: il nome non c'è più fra le righe valutate.
    await expect(registro.locator('tbody').getByText(etichetta, { exact: false })).toHaveCount(0);

    // La selezione vive nell'indirizzo: il documento si può rifare identico.
    await expect(page).toHaveURL(/escludi=/);
  });

  test('la selezione sopravvive al ricaricamento e si annulla del tutto', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    await expect(page.getByRole('button', { name: /stampa/i })).toBeVisible({ timeout: 90_000 });

    await page.getByRole('button', { name: 'Scegli i rischi da includere' }).click();
    await page.getByRole('checkbox').first().uncheck();
    await expect(page.getByText('Documento parziale')).toBeVisible({ timeout: 30_000 });

    // L'indirizzo **è** il documento: ricaricandolo si riottiene la stessa copia.
    await page.reload();
    await expect(page.getByText('Documento parziale')).toBeVisible({ timeout: 90_000 });

    await page.getByRole('button', { name: 'Rimetti tutti' }).click();
    await expect(page.getByText('Documento parziale')).toHaveCount(0, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/escludi=/);
  });

  test('il pannello di selezione non finisce in stampa', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/report`);
    const pannello = page.getByRole('button', { name: 'Scegli i rischi da includere' });
    await expect(pannello).toBeVisible({ timeout: 90_000 });

    /*
      I comandi non appartengono al documento consegnato. La regola `no-print` esiste per
      questo, e va verificata sul media di stampa: a schermo il pannello sembra corretto
      comunque, ed è esattamente il difetto che nessuno nota finché non stampa.
    */
    await page.emulateMedia({ media: 'print' });
    await expect(pannello).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });
});
