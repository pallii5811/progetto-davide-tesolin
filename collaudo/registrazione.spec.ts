import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accedi, esci, sorvegliaErrori } from './aiuti.js';
import { AMMINISTRATORE } from './ambiente.js';

/**
 * Registrazione, accesso e recupero, dall'interfaccia (18/09/2026).
 *
 * Il collaudo gira senza posta configurata — nessuna email parte da qui — quindi i percorsi
 * che passano da un collegamento ricevuto (conferma, nuova password) si provano fino a dove
 * l'interfaccia arriva da sola: il codice valido lo provano i collaudi dell'API
 * (apps/api/test/registrazione.test.ts), con una posta finta che raccoglie i messaggi.
 *
 * Ogni giro parte da un archivio vuoto e da un'API appena avviata, quindi il freno di cinque
 * registrazioni l'ora dallo stesso indirizzo basta: qui se ne fanno meno.
 */

const PASSWORD = 'lanterna-verde-sul-molo-2026';

/*
  Indirizzi e nomi unici a ogni esecuzione: l'archivio si azzera a ogni giro, ma non fra le
  ripetizioni dello stesso giro (`--repeat-each`), e il secondo passaggio troverebbe l'indirizzo
  «già registrato» dal primo.
*/
let progressivo = 0;
function studioNuovo(sigla: string) {
  progressivo += 1;
  const unico = `${sigla}${Date.now().toString(36)}${progressivo}`;
  return {
    nome: 'Giulia Ferri',
    email: `titolare.${unico}@studioferri.it`,
    denominazione: `Studio Ferri ${unico}`,
    rui: 'b 000 123 456',
  };
}

async function compilaRegistrazione(
  page: Page,
  dati: { nome: string; email: string; denominazione: string; rui: string },
  password = PASSWORD,
): Promise<void> {
  /*
    Si aspetta la pagina pronta, come fa una persona. Al primo giro Next la compila, e un clic
    prima dell'idratazione manda il modulo alla vecchia maniera: funziona — la registrazione
    riesce e si finisce dentro — ma in sviluppo React segnala «Connection closed», che il
    collaudo scambierebbe per un errore del prodotto.
  */
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Nome e cognome').fill(dati.nome);
  await page.getByLabel('Email di lavoro').fill(dati.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Ripeti la password').fill(password);
  await page.getByLabel('Nome dello studio').fill(dati.denominazione);
  await page.getByLabel('Numero di iscrizione al RUI').fill(dati.rui);
  await page.getByRole('button', { name: 'Crea l’account' }).click();
}

test.describe('Registrazione e accesso', () => {
  test('dalla vetrina alla registrazione, e dentro subito con lo studio in attesa', async ({ page }) => {
    test.setTimeout(240_000);
    const sorveglianza = sorvegliaErrori(page);
    const studio = studioNuovo('a');

    await page.goto('/', { timeout: 180_000 });
    await page
      .getByRole('navigation', { name: 'Vetrina' })
      .getByRole('link', { name: 'Crea un account' })
      .click();
    await expect(page).toHaveURL(/\/registrati$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Crea il tuo account' })).toBeVisible();

    await compilaRegistrazione(page, studio);

    // Dentro, a Ricerca Clienti, con l'avviso dell'attivazione e senza un secondo accesso.
    await expect(page).toHaveURL(/\/prospect/, { timeout: 90_000 });
    await expect(page.getByRole('navigation', { name: 'Principale' })).toBeVisible();
    await expect(page.getByText('Studio in attesa di attivazione.')).toBeVisible();
    // Senza posta configurata non si chiede di confermare un indirizzo a cui nulla è partito.
    await expect(page.getByText('Conferma il tuo indirizzo.')).toHaveCount(0);

    // Esce e rientra con la password appena scelta. Prima di riaprire l'accesso si aspetta che la
    // pagina dell'uscita abbia finito di arrivare: aprirne un'altra a metà flusso fa segnalare al
    // browser «Connection closed», un errore del collaudo e non del prodotto.
    await esci(page);
    await expect(page.getByLabel('Indirizzo di posta')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await accedi(page, { email: studio.email, password: PASSWORD });
    await expect(page.getByText('Studio in attesa di attivazione.')).toBeVisible();

    expect(sorveglianza.errori).toEqual([]);
  });

  test('un errore compare sotto il campo sbagliato, e il modulo non si svuota', async ({ page }) => {
    const studio = studioNuovo('b');
    await page.goto('/registrati');
    await compilaRegistrazione(page, { ...studio, rui: 'X12' });

    const rui = page.getByLabel('Numero di iscrizione al RUI');
    await expect(rui).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#numeroRui-errore')).toContainText('lettera da A a F');
    // Quello che era giusto resta scritto; la password no, per scelta.
    await expect(page.getByLabel('Nome e cognome')).toHaveValue(studio.nome);
    await expect(page.getByLabel('Nome dello studio')).toHaveValue(studio.denominazione);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  });

  test('un indirizzo già registrato si dice sotto l’email, e rimanda al recupero', async ({ page }) => {
    await page.goto('/registrati');
    await compilaRegistrazione(page, { ...studioNuovo('c'), email: AMMINISTRATORE.email });
    await expect(page.locator('#email-errore')).toContainText('già registrato');
    await expect(page.locator('#email-errore')).toContainText('Password dimenticata');
  });

  test('le due password devono coincidere', async ({ page }) => {
    await page.goto('/registrati');
    const studio = studioNuovo('d');
    await page.getByLabel('Nome e cognome').fill(studio.nome);
    await page.getByLabel('Email di lavoro').fill(studio.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Ripeti la password').fill(`${PASSWORD}-diversa`);
    await page.getByLabel('Nome dello studio').fill(studio.denominazione);
    await page.getByLabel('Numero di iscrizione al RUI').fill(studio.rui);
    await page.getByRole('button', { name: 'Crea l’account' }).click();
    await expect(page.locator('#password-errore')).toHaveText('Le due password non coincidono.');
  });

  test('il gestore attiva gli acquisti, e l’avviso sparisce allo studio', async ({ browser }) => {
    test.setTimeout(240_000);
    const studio = studioNuovo('e');

    const nuovo = await browser.newContext();
    const paginaNuovo = await nuovo.newPage();
    await paginaNuovo.goto('/registrati');
    await compilaRegistrazione(paginaNuovo, studio);
    await expect(paginaNuovo.getByText('Studio in attesa di attivazione.')).toBeVisible({
      timeout: 90_000,
    });

    const gestore = await browser.newContext();
    const paginaGestore = await gestore.newPage();
    await accedi(paginaGestore);
    await paginaGestore.goto('/impostazioni/studi');
    const riga = paginaGestore.getByRole('row').filter({ hasText: studio.denominazione });
    await expect(riga).toContainText('registrato da sé');
    await expect(riga).toContainText('RUI n. B000123456');
    await expect(riga).toContainText(studio.email);
    await expect(riga).toContainText('in attesa');

    paginaGestore.once('dialog', (d) => void d.accept());
    await riga.getByRole('button', { name: 'Attiva acquisti' }).click();
    await expect(riga.getByRole('button', { name: 'Blocca acquisti' })).toBeVisible();
    await expect(riga).toContainText('attivi');

    await paginaNuovo.reload();
    await expect(paginaNuovo.getByRole('navigation', { name: 'Principale' })).toBeVisible();
    await expect(paginaNuovo.getByText('Studio in attesa di attivazione.')).toHaveCount(0);

    await nuovo.close();
    await gestore.close();
  });

  test('la pagina di accesso porta alla registrazione e al recupero', async ({ page }) => {
    await page.goto('/accedi');
    await expect(page.getByRole('link', { name: 'Crea il tuo studio' })).toHaveAttribute(
      'href',
      '/registrati',
    );
    await page.getByRole('link', { name: 'Password dimenticata?' }).click();
    await expect(page).toHaveURL(/\/password-dimenticata$/);
    // Il collaudo gira senza posta: la pagina dice a chi rivolgersi invece di fingere un invio.
    await expect(page.getByText('Chiedi all’amministratore del tuo studio')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mandami il collegamento' })).toHaveCount(0);
  });

  test('un collegamento per la nuova password senza codice, o con un codice che non vale', async ({
    page,
  }) => {
    await page.goto('/nuova-password');
    await expect(page.getByRole('heading', { name: 'Collegamento incompleto' })).toBeVisible();

    await page.goto('/nuova-password?codice=codice-inventato-ma-abbastanza-lungo');
    await page.getByLabel('Nuova password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Ripeti la nuova password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Salva la nuova password' }).click();
    // Dentro il contenuto: Next ha un suo `alert` fuori, l'annunciatore delle navigazioni.
    await expect(page.getByRole('main').getByRole('alert')).toContainText('non è più valido');
    await expect(page.getByRole('link', { name: 'Chiedi un nuovo collegamento' })).toBeVisible();
  });

  test('la conferma dell’indirizzo vuole un clic, e un codice che non vale lo dice', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto('/conferma-email?codice=codice-inventato-ma-abbastanza-lungo');
    // Aprire la pagina non conferma niente (revisione del 18/09/2026: i filtri antivirus la aprono
    // prima della persona). Serve il pulsante.
    await expect(page.getByRole('heading', { name: 'Conferma il tuo indirizzo' })).toBeVisible();
    await page.getByRole('button', { name: 'Conferma il mio indirizzo' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('non è valido');
    await expect(page.getByRole('link', { name: 'Accedi' })).toBeVisible();

    await page.goto('/conferma-email');
    await expect(page.getByRole('heading', { name: 'Collegamento incompleto' })).toBeVisible();
    expect(sorveglianza.errori).toEqual([]);
  });

  test('le pagine pubbliche dell’accesso non hanno violazioni WCAG, in chiaro e in scuro', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const regole = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
    for (const percorso of [
      '/accedi',
      '/registrati',
      '/password-dimenticata',
      '/nuova-password?codice=codice-inventato-ma-abbastanza-lungo',
      '/conferma-email?codice=codice-inventato-ma-abbastanza-lungo',
    ]) {
      for (const tema of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: tema });
        await page.goto(percorso);
        const esito = await new AxeBuilder({ page }).withTags(regole).analyze();
        const violazioni = esito.violations.flatMap((v) =>
          v.nodes.map((n) => `[${tema}] ${percorso}: ${v.id} su ${n.target.join(' ')}`),
        );
        expect(violazioni).toEqual([]);
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('la registrazione su telefono non scorre di lato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/registrati');
    const eccedenza = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(eccedenza).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Crea l’account' })).toBeVisible();
  });
});
