import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/**
 * La vetrina: «/» senza sessione (richiesta di Simone del 18/09/2026).
 *
 * È la prima pagina che vede chiunque arrivi sul dominio, quindi si misura come quelle del
 * prodotto e qualcosa di più: che non rinvii, che non mostri niente del prodotto riservato,
 * che porti all'accesso con la pagina di accesso completa, che regga axe in entrambi i temi e
 * il telefono senza scorrere di lato. E che chi ha la sessione non la veda affatto.
 */

const DICHIARAZIONE_IVASS =
  'Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono consulenza finanziaria né garanzia di solvibilità.';

test.describe('Vetrina pubblica', () => {
  test('senza sessione «/» mostra la vetrina, senza rinvii e senza errori', async ({ page }) => {
    // La prima richiesta compila la pagina e il carattere: il margine serve solo a quella.
    test.setTimeout(240_000);
    const sorveglianza = sorvegliaErrori(page);

    const risposta = await page.goto('/', { timeout: 180_000 });

    expect(risposta?.status()).toBe(200);
    expect(risposta?.request().redirectedFrom() ?? null).toBeNull();
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page).toHaveTitle(/AEGIS/);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Trova nuove aziende, misura i loro rischi, consegna il report con il tuo nome.',
    );

    // Il menu è quello della vetrina; quello del prodotto non c'è.
    const menu = page.getByRole('navigation', { name: 'Vetrina' });
    await expect(menu.getByRole('link', { name: 'Accedi' })).toHaveAttribute('href', '/accedi');
    await expect(page.getByRole('navigation', { name: 'Principale' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Esci' })).toHaveCount(0);

    // La dichiarazione che il prodotto porta in fondo a ogni pagina c'è anche qui, una volta.
    await expect(page.getByText(DICHIARAZIONE_IVASS, { exact: false })).toHaveCount(1);
    await expect(
      page.getByText('Le aziende e i valori nelle illustrazioni di questa pagina sono di esempio.'),
    ).toBeVisible();

    // Le illustrazioni con aziende di esempio restano fuori dall'albero di accessibilità: lette
    // ad alta voce, righe e punteggi finti sembrerebbero dati veri.
    await expect(page.getByRole('table')).toHaveCount(0);

    expect(sorveglianza.errori).toEqual([]);
  });

  test('ogni collegamento porta da qualche parte: le ancore alle sezioni, il resto ad accesso o registrazione', async ({
    page,
  }) => {
    await page.goto('/');

    const destinazioni = await page
      .locator('a[href]')
      .evaluateAll((collegamenti) => collegamenti.map((a) => a.getAttribute('href') ?? ''));
    expect(destinazioni.length).toBeGreaterThan(10);

    for (const href of new Set(destinazioni)) {
      if (href.startsWith('#')) {
        await expect(page.locator(href), `l’ancora ${href} non ha una sezione`).toHaveCount(1);
      } else {
        // La vetrina non porta in nessuna pagina riservata, e da nessuna parte fuori dal dominio.
        expect(['/accedi', '/registrati'], `collegamento inatteso: ${href}`).toContain(href);
      }
    }
  });

  test('«Accedi» apre la pagina di accesso completa, con intestazione e dichiarazione', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Vetrina' }).getByRole('link', { name: 'Accedi' }).click();

    await expect(page).toHaveURL(/\/accedi$/);
    await expect(page.getByLabel('Indirizzo di posta')).toBeVisible();
    // Il layout del prodotto torna: la vetrina non se lo porta dietro.
    await expect(page.getByRole('banner').getByText('AEGIS', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('contentinfo').getByText(DICHIARAZIONE_IVASS, { exact: false }),
    ).toBeVisible();
  });

  test('con la sessione «/» porta a Ricerca Clienti, anche se il browser chiede la vetrina', async ({
    page,
  }) => {
    await accedi(page);
    // Il segnale falso: il middleware lo toglie da ogni richiesta, e con la sessione non lo scrive.
    await page.setExtraHTTPHeaders({ 'x-aegis-vetrina': '1' });

    await page.goto('/');
    await expect(page).toHaveURL(/\/prospect$/);
    await expect(page.getByRole('navigation', { name: 'Principale' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Vetrina' })).toHaveCount(0);

    await page.goto('/portafoglio');
    await expect(page.getByRole('navigation', { name: 'Principale' })).toBeVisible();
  });

  test('non ha violazioni WCAG A/AA, né in tema chiaro né in tema scuro', async ({ page }) => {
    test.setTimeout(180_000);
    const regole = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto('/');
      const esito = await new AxeBuilder({ page }).withTags(regole).analyze();
      const violazioni = esito.violations.flatMap((v) =>
        v.nodes.map(
          (n) =>
            `[${tema}] ${v.id} (${v.impact ?? 'n.d.'}) su ${n.target.join(' ')}: ${n.failureSummary ?? v.help}`,
        ),
      );
      expect(violazioni, `${violazioni.length} violazioni in tema ${tema}`).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('su telefono non scorre in orizzontale e l’accesso resta a portata di pollice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const eccedenza = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(eccedenza, `la pagina sborda di ${eccedenza}px`).toBeLessThanOrEqual(0);

    await expect(
      page.getByRole('navigation', { name: 'Vetrina' }).getByRole('link', { name: 'Accedi' }),
    ).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  });

  test('chi ha chiesto meno movimento non vede niente che fluttua', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const animazioni = await page
      .locator('.vetrina-animata')
      .evaluateAll((elementi) => elementi.map((el) => getComputedStyle(el).animationName));
    expect(animazioni.length).toBeGreaterThan(0);
    expect(animazioni.filter((nome) => nome !== 'none')).toEqual([]);
  });
});
