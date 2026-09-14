import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA, sorvegliaErrori } from './aiuti.js';

/**
 * Il popup del Property Risk, come lo vede chi lo apre.
 *
 * Richiesta di Simone del 14/09/2026, sulla slide di Luca: cliccando Property Risk si apre una
 * finestra con una lancetta per il totale e quattro per i rischi — fiamme o esplosione, sismica,
 * alluvione, frana — e il tipo di sito sotto. Qui si prova che si apre dai due punti previsti, che
 * le lancette si leggono anche senza vederle, che si chiude, e che a finestra aperta la pagina non
 * ha violazioni di accessibilità.
 */
test.describe('Popup del Property Risk', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  test('si apre cliccando il riquadro in testa alla scheda, e mostra cinque lancette', async ({ page }) => {
    const sorveglianza = sorvegliaErrori(page);
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    await page.getByTestId('apri-popup-property').click();

    const popup = page.locator('dialog[open]');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('heading', { name: 'Property Risk' })).toBeVisible();

    // Una lancetta si legge dal suo nome: chi usa un lettore di schermo non vede l'ago.
    const punteggio = /: (\d(,\d{1,2})? su 7|non calcolabile)$/;
    for (const titolo of [
      'Property Risk',
      'Rischio evento fiamme o esplosione',
      'Attività sismica',
      'Rischio alluvione',
      'Rischio frana',
    ]) {
      const lancetta = popup.getByRole('img', { name: new RegExp(`^${titolo}${punteggio.source}`) });
      await expect(lancetta, titolo).toHaveCount(1);
    }
    await expect(popup.getByText(/Tipo di sito/)).toBeVisible();

    // Il totale della lancetta è lo stesso numero del riquadro da cui si è partiti.
    const riquadro = (
      await page.getByTestId('metrica-property-risk').locator('dd').first().innerText()
    ).trim();
    if (/su 7$/.test(riquadro)) {
      await expect(popup.getByRole('img', { name: `Property Risk: ${riquadro}` })).toHaveCount(1);
    }

    expect(sorveglianza.errori).toEqual([]);
  });

  test('si chiude con Esc e con la crocetta', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    await page.getByTestId('apri-popup-property').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await page.getByTestId('apri-popup-property').click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('si apre anche dal pulsante della sezione Property Risk', async ({ page }) => {
    await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);

    await page.locator('#property-risk').getByRole('button', { name: 'Vedi le lancette' }).click();
    await expect(
      page.locator('dialog[open]').getByRole('heading', { name: 'Property Risk' }),
    ).toBeVisible();
  });

  test('a finestra aperta nessuna violazione WCAG A/AA, in tema chiaro e scuro', async ({ page }) => {
    test.setTimeout(120_000);
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto(`/azienda/${AZIENDA_DI_PROVA}`);
      await page.getByTestId('apri-popup-property').click();
      await expect(page.locator('dialog[open]')).toBeVisible();

      const esito = await new AxeBuilder({ page })
        .include('dialog[open]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        esito.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        tema,
      ).toEqual([]);
    }
  });
});
