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

    /*
      E NON VEDE NEMMENO I TESTI SCRITTI PER CHI GLI VENDE LA POLIZZA.

      Il modulo è lo stesso componente dei due lati — al cliente cambia solo la funzione di
      salvataggio — e le spiegazioni erano scritte per l'intermediario. Accanto alla casella
      dell'export l'impresa assicurata leggeva «è la domanda più redditizia dell'intera
      intervista», cioè che quella domanda fa guadagnare il suo broker; e più sopra «cinque
      minuti che valgono quanto il servizio a pagamento da 5 € per impresa», che le scopre
      quanto costa il dato a chi la sta assistendo.

      Si controlla il TESTO RESO, non il codice: il componente ora riceve un `lettore`
      obbligatorio, ma una prova sul tipo direbbe solo che la porta è dichiarata, non che
      da questa porta esce la frase giusta.
    */
    const testoCliente = (await paginaCliente.locator('body').innerText()).toLowerCase();
    for (const frase of ['redditizia', '5 € per impresa', 'si chiede, non si deduce']) {
      expect(
        testoCliente,
        `il questionario del cliente contiene un testo scritto per l’intermediario: «${frase}»`,
      ).not.toContain(frase.toLowerCase());
    }

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
