import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * Ricerca Clienti.
 *
 * È l'unica funzione che porta clienti che non si hanno ancora, ed è anche l'unica in cui
 * l'utente potrebbe spendere **senza volerlo**: comporre filtri è un gesto esplorativo, e
 * se ogni tentativo costasse, l'esplorazione si fermerebbe.
 *
 * Il presidio più importante di questo collaudo è quindi negativo: premere «Conta Aziende»
 * non deve mai scaricare un elenco. La spesa avviene solo dopo un secondo gesto deliberato.
 *
 * Dal 13/09/2026: la città (tutti i comuni italiani, cercando per nome) al posto della
 * provincia; la pagina «Ricerca» tolta e la ricerca per partita IVA come sezione a parte.
 * Dal 17/09/2026 («AEGIS - cambi.pptx», slide 1 e 2): la città è facoltativa ma un filtro ci
 * vuole; i nomi di pagina, campi e pulsanti cambiano; niente più richiamo dell'elenco di
 * ventiquattro ore né avviso «Dati reali»; l'elenco comprato va nel CRM; la ricerca singola è
 * solo per partita IVA; in fondo alla pagina c'è la dichiarazione IVASS.
 */
/**
 * Il campo che si chiama esattamente `nome`, anche quando la sua etichetta contiene una nota.
 *
 * getByLabel non confronta il nome accessibile ma il testo dell'etichetta, cioè i suoi nodi di
 * testo uniti senza spazi: nome e nota arrivano attaccati, «Codice ATECOInserisci il codice
 * senza punti», «Numero di aziendeCosto dell'elenco: …». Dopo il nome quindi c'è la fine
 * dell'etichetta o la maiuscola con cui comincia la nota; un nome allungato o cambiato
 * («Codice ATECO (6 cifre)», «Numero aziende») non combacia.
 */
function nomeDelCampo(nome: string): RegExp {
  return new RegExp('^' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|(?=[A-ZÀ-Ý]))');
}

test.describe('Ricerca Clienti', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('la pagina si apre dal menu principale, con il titolo e la descrizione del documento', async ({
    page,
  }) => {
    const sorveglianza = sorvegliaErrori(page);

    await page.goto('/portafoglio');
    await page.getByRole('link', { name: 'Ricerca Clienti' }).click();

    await expect(page).toHaveURL(/\/prospect/);
    await expect(page.getByRole('heading', { name: 'Trova nuove aziende' })).toBeVisible();
    await expect(page.getByText('Cerca le imprese che corrispondono ai tuoi criteri.')).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('la pagina «Ricerca» non c’è più: il menu non la offre e «/» porta a Ricerca Clienti', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/prospect$/);
    const menu = page.getByRole('navigation', { name: 'Principale' });
    await expect(menu.getByRole('link', { name: 'Ricerca', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Ricerca Clienti' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  test('i testi tolti non compaiono: niente richiamo di ventiquattro ore, niente «Dati reali»', async ({
    page,
  }) => {
    // Un elenco comprato prima: il richiamo che compariva dopo è quello che va tolto.
    await page.goto('/prospect?comune=A060&scarica=1');
    await expect(page.getByRole('table')).toBeVisible();
    await page.goto('/prospect');

    for (const tolto of [
      /Hai già scaricato un elenco/i,
      /ventiquattro ore/i,
      /Dati reali/i,
      /è obbligatoria/i,
      /Quante sono/i,
      /Dammi l.elenco/i,
    ]) {
      await expect(page.getByText(tolto), String(tolto)).toHaveCount(0);
    }
  });

  test('la città si sceglie fra tutti i comuni cercandola, e da sola basta a contare', async ({ page }) => {
    await page.goto('/prospect');

    const citta = page.getByRole('combobox', { name: 'Città' });
    await citta.fill('adro');
    await page.getByRole('option', { name: 'Adro (BS)' }).click();
    await expect(citta).toHaveValue('Adro (BS)');

    await page.getByRole('button', { name: /Conta Aziende/i }).click();

    // Al servizio arriva il codice catastale del comune scelto, non il nome scritto.
    await expect(page).toHaveURL(/comune=A060/);
    // Il conteggio compare, e con esso il prezzo dell'elenco: chi cerca vede quanto
    // costerebbe **prima** di pagarlo.
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toBeVisible();
    // Ad Adro l'azienda dimostrativa è una sola: «1 azienda corrisponde», non «1 aziende corrispondono».
    await expect(page.getByText('azienda corrisponde ai criteri', { exact: true })).toBeVisible();

    // Il pulsante che spende sta accanto a quello che conta, non dopo: il conteggio non
    // deve essere un passaggio obbligato per arrivare all'elenco.
    await expect(page.getByTestId('scarica-elenco')).toHaveText(/Crea Elenco/);

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

  test('la città non è obbligatoria: senza, si conta in tutta Italia con gli altri filtri', async ({
    page,
  }) => {
    await page.goto('/prospect');

    await page.getByLabel('Codice ATECO').fill('2562');
    await page.getByRole('button', { name: /Conta Aziende/i }).click();

    await expect(page).toHaveURL(/ateco=2562/);
    // La meccanica bresciana dimostrativa, trovata senza città.
    await expect(page.getByText('azienda corrisponde ai criteri', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Città' })).toHaveValue('');
  });

  test('senza nessun filtro non parte nessuna ricerca, e la pagina dice cosa manca', async ({ page }) => {
    await page.goto('/prospect');

    await page.getByRole('button', { name: /Conta Aziende/i }).click();

    await expect(page.getByText('Nessun filtro indicato', { exact: true })).toBeVisible();
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('una città scritta e non scelta dall’elenco non parte, né gratis né a pagamento', async ({
    page,
  }) => {
    await page.goto('/prospect');
    const navigazioni: string[] = [];
    page.on('request', (richiesta) => {
      if (richiesta.isNavigationRequest()) navigazioni.push(richiesta.url());
    });

    // «Livo» sono due comuni: il nome da solo non sceglie niente.
    await page.getByRole('combobox', { name: 'Città' }).fill('livo');
    await page.getByLabel('Codice ATECO').fill('2562');
    await page.getByRole('button', { name: /Conta Aziende/i }).click();
    await page.getByTestId('scarica-elenco').click();
    // Il tempo che basterebbe a una navigazione per partire, se il modulo venisse inviato.
    await page.waitForTimeout(1_500);

    expect(navigazioni, 'il modulo è stato inviato con una città non scelta').toEqual([]);
    await expect(page.getByRole('table')).toHaveCount(0);
    const messaggio = await page
      .getByRole('combobox', { name: 'Città' })
      .evaluate((campo: HTMLInputElement) => campo.validationMessage);
    expect(messaggio).toMatch(/città/i);
  });

  test('un indirizzo con un codice che non è un comune lo dice, e non cerca', async ({ page }) => {
    await page.goto('/prospect?comune=Z999&ateco=2562');

    await expect(page.getByText('Città non riconosciuta', { exact: true })).toBeVisible();
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toHaveCount(0);
  });

  test('i campi si chiamano come nel documento', async ({ page }) => {
    await page.goto('/prospect');

    for (const etichetta of [
      'Città',
      'Codice ATECO',
      'Dipendenti min.',
      'Dipendenti max.',
      'Fatturato min.',
      'Fatturato max.',
      'Ragione Sociale',
      'Codice Fiscale Socio',
      'Forma giuridica',
      'Numero di aziende',
    ]) {
      await expect(page.getByLabel(nomeDelCampo(etichetta)), etichetta).toBeVisible();
    }
    await expect(page.getByText('Inserisci il codice senza punti', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Trova le società partecipate dalla stessa persona.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Per le ditte individuali alcuni dati finanziari potrebbero non essere disponibili.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Conta Aziende/ })).toContainText('non consuma crediti');
  });

  test('i filtri facoltativi, se ci sono, restringono la ricerca', async ({ page }) => {
    // Nella città dell'azienda dimostrativa di meccanica: con il suo settore c'è, con un altro no.
    await page.goto('/prospect?comune=A060&ateco=2562');
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toBeVisible();

    await page.goto('/prospect?comune=A060&ateco=4120');
    await expect(page.getByText(/Nessuna azienda corrisponde/i)).toBeVisible();
  });

  test('crea l’elenco solo su richiesta esplicita, e lo salva nel CRM', async ({ page }) => {
    await page.goto('/prospect?comune=A060');
    await page.getByTestId('scarica-elenco').click();

    await expect(page.getByRole('table')).toBeVisible();
    // Ad Adro l'azienda dimostrativa è una sola: la frase va al singolare, non «1 aziende».
    await expect(page.getByText('1 azienda scaricata', { exact: false })).toBeVisible();
    // Il consuntivo di spesa accanto ai risultati: si è appena speso, e va detto.
    await expect(page.getByText(/€ spesi/i)).toBeVisible();
    await expect(page.getByText(/È salvata nel CRM/)).toBeVisible();
    // Da ogni riga si passa all'analisi: è il punto in cui il prospect diventa cliente.
    await expect(page.getByRole('link', { name: 'Analizza' }).first()).toBeVisible();
  });

  test('un elenco comprato non si perde: le sue aziende restano nel CRM', async ({ page }) => {
    /*
      È successo davvero: cinquanta centesimi di aziende scaricate, un clic su «Analizza»,
      il tasto indietro — e la schermata di ricerca vuota, senza traccia di ciò che era
      stato comprato. Fino al 17/09/2026 l'elenco si ritrovava con un richiamo che durava
      ventiquattro ore; da quella data le aziende vanno nel CRM e ci restano.
    */
    await page.goto('/prospect?comune=A060&scarica=1');
    await expect(page.getByRole('table')).toBeVisible();

    await page.goto('/portafoglio');
    await expect(page.locator('body')).toContainText(/MECCANICA BRESCIANA/i);

    // E prima di ricomprarlo, la pagina ricorda che le aziende sono già nel CRM.
    await page.goto('/prospect?comune=A060');
    await expect(page.getByText(/Questo elenco l.hai già comprato/i)).toBeVisible();
    await page.getByRole('link', { name: 'Aprile nel CRM' }).click();
    await expect(page).toHaveURL(/\/portafoglio$/);
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

    // L'etichetta comprende il costo scritto sotto il campo: si confronta il nome, all'inizio.
    const quante = page.getByLabel(nomeDelCampo('Numero di aziende'));
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

  test('la ricerca singola è una sezione a parte, solo per partita IVA', async ({ page }) => {
    await page.goto('/prospect');

    const sezione = page.locator('#ricerca-azienda');
    await expect(sezione.getByRole('heading', { name: 'Cerca una singola azienda' })).toBeVisible();
    await expect(sezione.getByText('Cerca per Partita IVA.', { exact: true })).toBeVisible();
    // Il campo della ragione sociale non c'è più.
    await expect(sezione.getByPlaceholder('Ragione sociale, anche parziale')).toHaveCount(0);
    await expect(sezione.getByLabel('Denominazione', { exact: true })).toHaveCount(0);

    await sezione.getByPlaceholder('11 cifre').fill('02413390390');
    await sezione.getByRole('button', { name: 'Cerca' }).click();

    await expect(page).toHaveURL(/\/prospect\?piva=02413390390/);
    await expect(sezione.getByText(/ADRIATICA LOGISTICA/i).first()).toBeVisible();

    // Il modulo della ricerca per insiemi resta lì sopra, senza aver cercato niente per conto suo.
    await expect(page.getByRole('combobox', { name: 'Città' })).toHaveValue('');
    await expect(page.getByText(/corrispond(e|ono) ai criteri/i)).toHaveCount(0);
  });

  test('in fondo alla pagina c’è la dichiarazione, con le parole del documento, una volta sola', async ({
    page,
  }) => {
    await page.goto('/prospect');

    // Nel piè di pagina comune: la versione precedente, «Le valutazioni prodotte…», non c'è più.
    await expect(page.getByText(/elaborazioni statistiche/)).toHaveCount(1);
    const dichiarazione = page
      .getByRole('contentinfo')
      .getByText(/Le valutazioni fornite sono elaborazioni statistiche/);
    await expect(dichiarazione).toBeVisible();
    await expect(dichiarazione).toHaveText(
      'Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono consulenza finanziaria né garanzia di solvibilità. Le eventuali proposte assicurative sono soggette alla valutazione dell’intermediario secondo la normativa IVASS applicabile.',
    );
  });
});
