import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Il questionario compilato dal cliente, dal collegamento fino al dossier.
 *
 * Le prove unitarie coprono l'API — impronta del token, scadenza, revoca, cosa la porta
 * pubblica espone. Qui si misura il giro intero, che nessuna di quelle tocca: il broker
 * genera il collegamento, **un browser senza sessione** lo apre, compila e salva, e il
 * dato ricompare dalla parte dell'intermediario.
 *
 * Il secondo contesto del browser non è un dettaglio di comodità: è la sostanza. Aprire il
 * collegamento nella stessa scheda del broker proverebbe soltanto che funziona per chi è
 * già dentro — cioè l'unico caso che non interessa.
 */
test.describe('Questionario compilato dal cliente', () => {
  test('il broker genera, il cliente compila, il dato torna al broker', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const sorveglianza = sorvegliaErrori(page);

    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);

    await expect(page.getByRole('heading', { name: 'Far compilare al cliente' })).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole('button', { name: /Genera( un nuovo)? collegamento/ }).click();

    /*
      Il collegamento compare **una volta sola**: in archivio ne resta l'impronta. Se questo
      riquadro non lo mostrasse, la funzione sarebbe inutilizzabile e nessuna prova
      sull'API se ne accorgerebbe.
    */
    const riquadro = page.getByText('Copiare adesso: non verrà mostrato di nuovo');
    await expect(riquadro).toBeVisible({ timeout: 60_000 });

    const indirizzo = await page.locator('p.font-mono').first().innerText();
    expect(indirizzo).toContain('/questionario/');

    // ── Il cliente: un browser che non ha mai visto questa piattaforma ──────
    const contestoCliente = await browser.newContext();
    const paginaCliente = await contestoCliente.newPage();
    const sorveglianzaCliente = sorvegliaErrori(paginaCliente);

    await paginaCliente.goto(indirizzo);
    await expect(paginaCliente.getByText('Questionario assicurativo')).toBeVisible({
      timeout: 90_000,
    });

    /*
      Da questa porta non si entra nel prodotto: niente navigazione del broker, niente
      portafoglio. Chi ha il collegamento vede solo ciò che gli si chiede di compilare.
    */
    await expect(paginaCliente.getByRole('link', { name: 'Portafoglio' })).toHaveCount(0);
    await expect(paginaCliente.getByRole('link', { name: 'Monitoraggio' })).toHaveCount(0);

    const veicoli = paginaCliente.getByLabel(/veicoli/i).first();
    await expect(veicoli).toBeVisible();
    await veicoli.fill('17');
    await paginaCliente.getByRole('button', { name: /salva/i }).first().click();

    await expect(paginaCliente.getByText(/Risposte inviate/)).toBeVisible({ timeout: 60_000 });
    expect(sorveglianzaCliente.errori).toEqual([]);

    // ── Il broker, di nuovo: il dato deve essere arrivato ───────────────────
    await page.reload();
    await expect(page.getByLabel(/veicoli/i).first()).toHaveValue('17', { timeout: 90_000 });

    // E il riquadro dice che il cliente ha compilato: è ciò che evita la telefonata
    // «hai poi risposto?».
    await expect(page.getByText(/Ultima compilazione/)).toBeVisible();

    await contestoCliente.close();
    expect(sorveglianza.errori).toEqual([]);
  });

  test('revocato il collegamento, il cliente non entra più', async ({ page, browser }) => {
    test.setTimeout(240_000);

    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}/dati`);
    await expect(page.getByRole('heading', { name: 'Far compilare al cliente' })).toBeVisible({
      timeout: 90_000,
    });

    await page.getByRole('button', { name: /Genera( un nuovo)? collegamento/ }).click();
    await expect(page.getByText('Copiare adesso: non verrà mostrato di nuovo')).toBeVisible({
      timeout: 60_000,
    });
    const indirizzo = await page.locator('p.font-mono').first().innerText();

    await page.getByRole('button', { name: 'Revoca' }).click();
    await expect(page.getByText(/non apre più nulla/)).toBeVisible({ timeout: 60_000 });

    const contestoCliente = await browser.newContext();
    const paginaCliente = await contestoCliente.newPage();
    await paginaCliente.goto(indirizzo);

    /*
      Il messaggio non distingue «revocato» da «mai esistito»: dirlo aiuterebbe chi prova
      indirizzi a caso. Indica però il rimedio, che è lo stesso in tutti i casi.
    */
    await expect(paginaCliente.getByText('Collegamento non valido')).toBeVisible({ timeout: 90_000 });
    await expect(paginaCliente.getByLabel(/veicoli/i)).toHaveCount(0);

    await contestoCliente.close();
  });
});
