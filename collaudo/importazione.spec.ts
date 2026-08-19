import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * La presa in carico di un portafoglio esistente.
 *
 * È il primo momento in cui un intermediario incontra davvero la piattaforma: ha
 * quattrocento clienti in un foglio di calcolo. Se questo passaggio non funziona, tutto il
 * resto non arriva mai in mano a nessuno.
 *
 * Le partite IVA sono valide ma **dedicate a questo file**: nessun altro collaudo le
 * analizza. La suite condivide un solo archivio, e «da acquisire: 2» è vero soltanto se
 * nessun collaudo precedente ha già portato una delle due in portafoglio — è già
 * successo, con un test che visitava un'azienda dimostrativa e faceva sparire un
 * acquisto da questo conteggio.
 */
const CSV = [
  'Codice cliente;Ragione sociale;Partita IVA;Agente',
  'C-0012;CLIENTE IMPORTATO UNO;01234567897;Rossi',
  'C-0013;CLIENTE IMPORTATO DUE;01111111116;Bianchi',
  'C-0014;CLIENTE SENZA PIVA;;Verdi',
  'C-0015;RIGA SBAGLIATA;non disponibile;Verdi',
].join('\n');

test.describe('Presa in carico massiva', () => {
  test('dice quanto costa prima di spendere', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await accedi(page);
    await page.goto('/portafoglio/importa');

    await page.getByLabel(/incolla qui/i).fill(CSV);
    await page.getByRole('button', { name: /leggi il file/i }).click();

    // Due leggibili, una senza partita IVA, una con un valore che non lo è.
    await expect(page.getByTestId('riquadro-da-acquisire')).toContainText('2');
    // Due aziende al prezzo unitario dichiarato dall'anteprima: la cifra non si inchioda
    // nel collaudo, perché dipende da quali servizi il token è autorizzato a usare.
    const unitario = await page.getByTestId('riquadro-costo-stimato').innerText();
    expect(unitario).toMatch(/per azienda/);

    // E soprattutto: finché non si conferma, non è stato acquisito nulla.
    await expect(page.getByRole('button', { name: /prendi in carico 2 aziende/i })).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('dice riga per riga cosa non riesce a leggere', async ({ page }) => {
    await accedi(page);
    await page.goto('/portafoglio/importa');

    await page.getByLabel(/incolla qui/i).fill(CSV);
    await page.getByRole('button', { name: /leggi il file/i }).click();

    // Rifiutare l'intero file per due righe costringerebbe a ricominciare da capo.
    await expect(page.getByText(/2 righe scartate/)).toBeVisible();
    await expect(page.getByText('Partita IVA assente')).toBeVisible();
    await expect(page.getByText(/caratteri non numerici/)).toBeVisible();
    await expect(page.getByText('riga 4')).toBeVisible();
  });

  test('prende in carico le aziende e le porta in portafoglio', async ({ page }) => {
    await accedi(page);
    await page.goto('/portafoglio/importa');

    await page.getByLabel(/incolla qui/i).fill(CSV);
    await page.getByRole('button', { name: /leggi il file/i }).click();
    await page.getByRole('button', { name: /prendi in carico/i }).click();

    await expect(page.getByText(/2 aziende prese in carico/)).toBeVisible({ timeout: 60_000 });

    await page.goto('/portafoglio');
    // Nella tabella, non nella scheda: quest'ultima esiste nel DOM ma è nascosta alle
    // larghezze da scrivania, ed è la tabella che il broker sta effettivamente guardando.
    // Le partite IVA dedicate non corrispondono a varianti note: il provider dimostrativo
    // le battezza con la partita IVA nel nome, ed è quella che si cerca in tabella.
    const tabella = page.getByRole('table');
    await expect(tabella).toContainText(/01234567897/);
    await expect(tabella).toContainText(/01111111116/);
  });

  test('non riacquista ciò che è già in portafoglio', async ({ page }) => {
    await accedi(page);
    await page.goto('/portafoglio/importa');

    await page.getByLabel(/incolla qui/i).fill(CSV);
    await page.getByRole('button', { name: /leggi il file/i }).click();

    // Far pagare due volte lo stesso dato è il modo più rapido per perdere la fiducia
    // di chi tiene d'occhio il credito.
    await expect(page.getByTestId('riquadro-gia-in-portafoglio')).toContainText('2');
    await expect(page.getByTestId('riquadro-da-acquisire')).toContainText('0');
    await expect(page.getByText(/già tutte in portafoglio/)).toBeVisible();
  });

  test('reintegra gli zeri iniziali che i fogli di calcolo tolgono', async ({ page }) => {
    await accedi(page);
    await page.goto('/portafoglio/importa');

    // `743110157` è `00743110157` a cui Excel ha mangiato i due zeri iniziali trattandola
    // come un numero. Rifiutarla sarebbe formalmente corretto e praticamente inutile.
    // Qui basta l'anteprima: legge e conta, senza acquisire nulla.
    await page.getByLabel(/incolla qui/i).fill('p.iva\n743110157');
    await page.getByRole('button', { name: /leggi il file/i }).click();

    await expect(page.getByTestId('riquadro-da-acquisire')).toContainText('1');
    await expect(page.getByText(/righe scartate/)).toHaveCount(0);
  });
});
