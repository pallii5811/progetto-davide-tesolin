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
 *
 * Dal 13/09/2026, su richiesta di Simone: la città (tutti i comuni italiani, cercando per
 * nome) prende il posto della provincia ed è l'unico filtro obbligatorio; gli altri sono
 * facoltativi; «Addetti da/a» diventa «Min/Max dipendenti»; la pagina «Ricerca» non c'è
 * più e la ricerca per partita IVA è una sezione a parte di questa.
 */
test.describe('Ricerca di nuovi clienti', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la pagina si apre dal menu principale', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);

    await page.goto('/portafoglio');
    await page.getByRole('link', { name: 'Nuovi clienti' }).click();

    await expect(page).toHaveURL(/\/prospect/);
    await expect(page.getByRole('heading', { name: /Ricerca di nuovi clienti/i })).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('la pagina «Ricerca» non c’è più: il menu non la offre e «/» porta a Nuovi clienti', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/prospect$/);
    const menu = page.getByRole('navigation', { name: 'Principale' });
    await expect(menu.getByRole('link', { name: 'Ricerca', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Nuovi clienti' })).toHaveAttribute('aria-current', 'page');
  });

  test('un vecchio collegamento a una ricerca per partita IVA arriva alla sezione giusta', async ({
    page,
  }) => {
    await page.goto('/?piva=02413390390');

    await expect(page).toHaveURL(/\/prospect\?piva=02413390390/);
    await expect(
      page
        .locator('#ricerca-azienda')
        .getByText(/ADRIATICA LOGISTICA/i)
        .first(),
    ).toBeVisible();
  });

  test('la città si sceglie fra tutti i comuni cercandola, e da sola basta a contare', async ({ page }) => {
    await page.goto('/prospect');

    const citta = page.getByRole('combobox', { name: 'Città' });
    await citta.fill('adro');
    await page.getByRole('option', { name: 'Adro (BS)' }).click();
    await expect(citta).toHaveValue('Adro (BS)');

    await page.getByRole('button', { name: /Quante sono/i }).click();

    // Al servizio arriva il codice catastale del comune scelto, non il nome scritto.
    await expect(page).toHaveURL(/comune=A060/);
    // Il conteggio compare, e con esso il prezzo dell'elenco: chi cerca vede quanto
    // costerebbe **prima** di pagarlo.
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toBeVisible();
    // Ad Adro l'azienda dimostrativa è una sola: «1 azienda corrisponde», non «1 aziende corrispondono».
    await expect(page.getByText('azienda corrisponde ai criteri', { exact: true })).toBeVisible();

    // Il pulsante che spende sta accanto a quello che conta, non dopo: il conteggio non
    // deve essere un passaggio obbligato per arrivare all'elenco.
    await expect(page.getByTestId('scarica-elenco')).toBeVisible();

    // E nessuna azienda è stata scaricata: la tabella dei risultati non esiste ancora.
    await expect(page.getByRole('table')).toHaveCount(0);

    // Tornando sul modulo, la città scelta è ancora lì, con la sua sigla.
    await expect(page.getByRole('combobox', { name: 'Città' })).toHaveValue('Adro (BS)');
  });

  test('la ricerca della città ignora gli accenti e distingue i comuni con lo stesso nome', async ({
    page,
  }) => {
    await page.goto('/prospect');
    const citta = page.getByRole('combobox', { name: 'Città' });

    await citta.fill('forli');
    await expect(page.getByRole('option', { name: 'Forlì (FC)' })).toBeVisible();

    await citta.fill('livo');
    await expect(page.getByRole('option', { name: 'Livo (CO)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Livo (TN)' })).toBeVisible();

    // Da tastiera: Invio sceglie il comune evidenziato e NON invia il modulo.
    await citta.fill('ravenna');
    await citta.press('Enter');
    await expect(citta).toHaveValue('Ravenna (RA)');
    await expect(page).toHaveURL(/\/prospect$/);
  });

  test('senza città non parte nessuna ricerca, né quella gratuita né quella che spende', async ({
    page,
  }) => {
    await page.goto('/prospect');
    const navigazioni: string[] = [];
    page.on('request', (richiesta) => {
      if (richiesta.isNavigationRequest()) navigazioni.push(richiesta.url());
    });

    await page.getByLabel('Codice ATECO').fill('2562');
    await page.getByRole('button', { name: /Quante sono/i }).click();
    await page.getByTestId('scarica-elenco').click();
    // Il tempo che basterebbe a una navigazione per partire, se il modulo venisse inviato.
    await page.waitForTimeout(1_500);

    expect(navigazioni, 'il modulo è stato inviato senza città').toEqual([]);
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    const messaggio = await page
      .getByRole('combobox', { name: 'Città' })
      .evaluate((campo: HTMLInputElement) => campo.validationMessage);
    expect(messaggio).toMatch(/città/i);
  });

  test('i dipendenti si filtrano con «Min dipendenti» e «Max dipendenti», e tutto tranne la città è facoltativo', async ({
    page,
  }) => {
    await page.goto('/prospect');

    await expect(page.getByLabel('Min dipendenti')).toBeVisible();
    await expect(page.getByLabel('Max dipendenti')).toBeVisible();
    await expect(page.getByText(/Addetti da|Addetti a/i)).toHaveCount(0);
    await expect(page.getByText(/Solo la città è obbligatoria/i)).toBeVisible();
  });

  test('i filtri facoltativi, se ci sono, restringono la ricerca', async ({ page }) => {
    // Nella città dell'azienda dimostrativa di meccanica: con il suo settore c'è, con un altro no.
    await page.goto('/prospect?comune=A060&ateco=2562');
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toBeVisible();

    await page.goto('/prospect?comune=A060&ateco=4120');
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toBeVisible();
  });

  test('scarica l’elenco, e solo su richiesta esplicita', async ({ page }) => {
    await page.goto('/prospect?comune=A060');
    await page.getByTestId('scarica-elenco').click();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/aziend(a|e) scaricat(a|e)/i)).toBeVisible();
    // Ad Adro l'azienda dimostrativa è una sola: la frase va al singolare, non «1 aziende».
    await expect(page.getByText('1 azienda scaricata')).toBeVisible();
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
    // Roma: nessuna delle aziende dimostrative sta lì.
    await page.goto('/prospect?comune=H501');
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toBeVisible();
    await expect(page.getByText(/comune vicino/i)).toBeVisible();
  });

  test('un indirizzo con filtri ma senza città lo dice, e non cerca', async ({ page }) => {
    // Com'erano gli indirizzi prima del 13/09/2026, quando si cercava per provincia.
    await page.goto('/prospect?provincia=BS&ateco=2562');

    await expect(page.getByText('Manca la città', { exact: true })).toBeVisible();
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toHaveCount(0);
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

  test('un elenco pagato non si perde premendo indietro', async ({ page }) => {
    /*
      È successo davvero: cinquanta centesimi di aziende scaricate, un clic su «Analizza»,
      il tasto indietro — e la schermata di ricerca vuota, senza traccia di ciò che era
      stato comprato.

      Tecnicamente non era perso — l'archivio lo conserva ventiquattro ore e rifare la
      stessa ricerca non costa nulla — ma «ricomponi a memoria gli stessi sette filtri»
      non è una risposta, e nessuno sapeva comunque che fosse gratis.
    */
    await page.goto('/prospect?comune=A060&scarica=1');
    await expect(page.getByRole('table')).toBeVisible();

    // Si torna alla pagina nuda, come dopo un «indietro» finito altrove.
    await page.goto('/prospect');

    const richiamo = page.getByText(/Hai già scaricato un elenco/i);
    await expect(richiamo).toBeVisible();
    await expect(page.getByText(/non consuma credito/i)).toBeVisible();

    await page.getByRole('link', { name: /Riaprilo/i }).click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('la ricerca per partita IVA è una sezione a parte della stessa pagina', async ({ page }) => {
    await page.goto('/prospect');

    const sezione = page.locator('#ricerca-azienda');
    await expect(sezione.getByRole('heading', { name: /Cerca un'azienda per partita IVA/i })).toBeVisible();

    await sezione.getByPlaceholder('11 cifre').fill('02413390390');
    await sezione.getByRole('button', { name: 'Cerca' }).click();

    await expect(page).toHaveURL(/\/prospect\?piva=02413390390/);
    await expect(sezione.getByText(/ADRIATICA LOGISTICA/i).first()).toBeVisible();

    // Il modulo dei nuovi clienti resta lì sopra, senza aver cercato niente per conto suo.
    await expect(page.getByRole('combobox', { name: 'Città' })).toHaveValue('');
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
  });
});
