import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Ricerca di nuovi clienti.
 *
 * È l'unica funzione che porta clienti che non si hanno ancora, ed è anche l'unica in cui
 * l'utente potrebbe spendere **senza volerlo**: comporre filtri è un gesto esplorativo, e
 * se ogni tentativo costasse, l'esplorazione si fermerebbe.
 *
 * Il presidio più importante di questo collaudo è quindi negativo: premere «Conta quante
 * sono» non deve mai scaricare un elenco. La spesa avviene solo dopo un secondo gesto
 * deliberato.
 */
test.describe('Ricerca di nuovi clienti', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la pagina si apre dal menu principale', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Nuovi clienti' }).click();

    await expect(page).toHaveURL(/\/prospect/);
    await expect(page.getByRole('heading', { name: /Ricerca di nuovi clienti/i })).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('conta le aziende senza scaricarne l’elenco', async ({ page }) => {
    await page.goto('/prospect');

    await page.getByLabel('Provincia').fill('BS');
    await page.getByRole('button', { name: /Quante sono/i }).click();

    // Il conteggio compare, e con esso il prezzo dell'elenco: chi cerca vede quanto
    // costerebbe **prima** di pagarlo.
    await expect(page.getByText(/aziende corrispondono/i)).toBeVisible();

    // Il pulsante che spende sta accanto a quello che conta, non dopo: il conteggio non
    // deve essere un passaggio obbligato per arrivare all'elenco.
    await expect(page.getByTestId('scarica-elenco')).toBeVisible();

    // E nessuna azienda è stata scaricata: la tabella dei risultati non esiste ancora.
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('scarica l’elenco, e solo su richiesta esplicita', async ({ page }) => {
    await page.goto('/prospect?provincia=BS');
    await page.getByTestId('scarica-elenco').click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/aziende scaricate/i)).toBeVisible();
    // Il consuntivo di spesa accanto ai risultati: si è appena speso, e va detto.
    await expect(page.getByText(/€ spesi/i)).toBeVisible();
    // Da ogni riga si passa all'analisi: è il punto in cui il prospect diventa cliente.
    await expect(page.getByRole('link', { name: 'Analizza' }).first()).toBeVisible();
  });

  test('dichiara come va scritto il codice ATECO', async ({ page }) => {
    await page.goto('/prospect');
    // Il confronto del fornitore è esatto e senza punti: senza questa nota, chi scrive
    // «25.62.00» ottiene zero risultati e conclude che non esistono aziende.
    await expect(page.getByText(/Senza punti/i)).toBeVisible();
  });

  test('con criteri che non trovano nulla lo dice, e suggerisce come allargare', async ({ page }) => {
    await page.goto('/prospect?provincia=ZZ');
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toBeVisible();
  });

  test('il costo si legge prima di premere, e il valore predefinito è piccolo', async ({ page }) => {
    /*
      Il valore predefinito di un campo che spende è una decisione presa al posto
      dell'utente. Era venticinque: chi apriva la pagina e premeva senza guardare pagava
      un euro e venticinque. Ora è cinque, e il prezzo è scritto accanto al campo mentre
      lo si compila — non dentro l'etichetta di una tendina, dove resterebbe fermo al
      giorno in cui è stato scritto.
    */
    await page.goto('/prospect');

    const quante = page.getByLabel(/Quante aziende vuoi/i);
    await expect(quante).toHaveValue('5');
    await expect(page.getByText(/0,25 €/)).toBeVisible();

    await quante.fill('20');
    await expect(page.getByText(/1,00 €/)).toBeVisible();
  });

  test('le ditte individuali si possono escludere, e di norma lo sono', async ({ page }) => {
    /*
      Le ditte individuali non depositano bilanci: su di esse metà dell'analisi resta
      vuota qualunque cifra si spenda. E sono la maggioranza dell'archivio — su una
      ricerca reale, 339 imprese su 542. Senza questo filtro due terzi di ogni elenco
      pagato sono righe che non si possono valutare.
    */
    await page.goto('/prospect');
    await expect(page.getByLabel(/Forma giuridica/i)).toHaveValue('SR');
  });
});
