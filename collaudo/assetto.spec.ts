import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Assetto proprietario, gruppo e collegamenti.
 *
 * Il valore di questa sezione non sta nell'elenco dei soci — quello lo dà una visura — ma
 * in ciò che se ne deduce: chi controlla, quale responsabilità ne discende, e **quali
 * altre aziende dello stesso intermediario** fanno capo alle stesse persone.
 *
 * L'ultimo test è quello che conta davvero, perché attraversa tutta la catena: analisi →
 * salvataggio della compagine → interrogazione incrociata → collegamento in pagina. È
 * anche l'unico modo di accorgersi se una di quelle giunture si stacca.
 */
// Partita IVA dimostrativa **non usata da altri collaudi**: analizzarla mette un'azienda
// in portafoglio, e il collaudo dell'importazione conta proprio quante ne mancano.
const SECONDA_AZIENDA = '12345678903';

test.describe('Assetto proprietario e gruppo', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('mostra la compagine sociale con le quote', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const sezione = page.locator('#assetto');
    await expect(sezione).toBeVisible();
    await expect(sezione.getByText('ROSSI GIOVANNI').first()).toBeVisible();

    // Le quote arrivano dal fornitore come frazioni (0,6): mostrarle così direbbe
    // «0,6%» invece di «60%», cioè un socio di minoranza al posto del controllante.
    await expect(sezione.getByText('60%').first()).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('dichiara il tipo di controllo, non solo l’elenco dei nomi', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toContainText(/Maggioranza in capo a una persona fisica/i);
  });

  test('spiega la responsabilità degli amministratori e cosa farne', async ({ page }) => {
    const sezione = page.locator('#assetto');
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    await expect(sezione).toContainText(/Responsabilità personale degli amministratori/i);
    // Un'implicazione senza azione è un'informazione; con l'azione è consulenza.
    await expect(sezione).toContainText(/D&O/);
    /*
      L'azienda di prova è una **S.r.l.**, e per la S.r.l. la responsabilità degli
      amministratori è retta dall'art. 2476 c.c.

      Qui era pinnato il 2392, che è norma della S.p.A.: il collaudo fissava la citazione
      sbagliata, e finché ci restava nessuno poteva correggerla senza far diventare rosso
      il collaudo. Si verifica anche che l'altra **non** compaia: una citazione errata è
      più dannosa di una mancante, perché dà l'aria della competenza a un errore.
    */
    await expect(sezione).toContainText(/2476/);
    await expect(sezione).not.toContainText(/2392/);
  });

  test('elenca le domande da porre al cliente', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toContainText(/Da chiedere al cliente/i);
  });

  test('collega le aziende del portafoglio che hanno lo stesso socio', async ({ page }) => {
    // Due analisi distinte: il collegamento nasce dal confronto fra le due compagini
    // salvate, quindi prima devono esistere entrambe.
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    await expect(page.locator('#assetto')).toBeVisible();

    await page.goto(`/azienda/${SECONDA_AZIENDA}`);
    await expect(page.locator('#assetto')).toBeVisible();

    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
    const collegamenti = page.getByText('Collegamenti nel tuo portafoglio');
    await expect(collegamenti).toBeVisible();

    // Il collegamento deve essere **percorribile**, ed è l'indirizzo a dirlo: è il gesto
    // che trasforma la scoperta in un'altra analisi. Legarlo al nome dell'azienda
    // lascerebbe passare un collegamento rotto purché l'etichetta fosse giusta.
    const sezione = page.locator('#assetto');
    await expect(sezione.locator(`a[href="/azienda/${SECONDA_AZIENDA}"]`).first()).toBeVisible();
  });

  test('il titolare effettivo compare, col criterio e con la decisione se comprare', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    const riquadro = page.locator('#assetto').getByText('Titolare effettivo', { exact: true });
    await expect(riquadro).toBeVisible({ timeout: 90_000 });

    /*
      Il riferimento normativo accanto al titolo non è decorazione: un titolare effettivo
      indicato senza dire con quale criterio è stato individuato non si difende davanti a
      un’ispezione, ed è proprio il documento che serve a difendersi.
    */
    await expect(page.getByText('art. 20 D.Lgs. 231/2007')).toBeVisible();

    /*
      La riga che fa risparmiare: dice se la visura da 1,10 € serva o no. Senza, chi legge
      un elenco di titolari resta nel dubbio — e nel dubbio compra un dato che ha già.
    */
    const azione = page.locator('#assetto').getByText(/visura sul registro/);
    await expect(azione.first()).toBeVisible();
  });
});
