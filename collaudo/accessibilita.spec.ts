import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';

/**
 * Accessibilità, misurata invece che supposta.
 *
 * Uno strumento professionale si usa otto ore al giorno: chi ha una vista ridotta, chi
 * naviga da tastiera, chi lavora su uno schermo scadente in un ufficio illuminato male.
 * Un contrasto insufficiente o un campo senza etichetta non sono un problema di eleganza,
 * sono un problema di lavoro — e per un fornitore di servizi sono anche un problema
 * normativo.
 *
 * Si verificano le regole **serie** — WCAG 2 livelli A e AA — su ogni pagina che
 * l'intermediario apre davvero, incluse quelle dietro l'autenticazione, che sono la
 * maggioranza e quelle che nessuno controlla mai.
 */
const PAGINE: readonly (readonly [string, string])[] = [
  ['ricerca', '/'],
  ['nuovi clienti', '/prospect'],
  ['portafoglio', '/portafoglio'],
  ['monitoraggio', '/monitoraggio'],
  ['catalogo rischi', '/catalogo'],
  ['impostazioni', '/impostazioni'],
  ['compagnie', '/impostazioni/compagnie'],
  ['studi sulla piattaforma', '/impostazioni/studi'],
  ['analisi azienda', `/azienda/${AZIENDA_DI_PROVA}`],
  ['dati di intervista', `/azienda/${AZIENDA_DI_PROVA}/dati`],
  ['report per il cliente', `/azienda/${AZIENDA_DI_PROVA}/report`],
];

test.describe('Accessibilità', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  for (const [nome, percorso] of PAGINE) {
    test(`${nome} non ha violazioni WCAG A/AA`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(percorso);

      const esito = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      /*
        Il messaggio d'errore elenca le violazioni con il selettore dell'elemento: senza,
        un collaudo rosso dice «questa pagina è inaccessibile» e lascia a chi legge il
        compito di scoprire dove — che è esattamente il motivo per cui questi collaudi
        vengono disattivati invece che risolti.
      */
      const violazioni = esito.violations.flatMap((v) =>
        v.nodes.map(
          (n) =>
            `${v.id} (${v.impact ?? 'n.d.'}) su ${n.target.join(' ')}
      ${n.failureSummary ?? v.help}`,
        ),
      );

      expect(violazioni, `${nome}: ${violazioni.length} violazioni`).toEqual([]);
    });
  }

  test('la pagina di accesso è accessibile anche senza sessione', async ({ page }) => {
    // È l'unica pagina che vede chi non è ancora entrato, e l'unica che qualcuno potrebbe
    // dover usare con uno screen reader prima di poter chiedere aiuto a un collega.
    await page.goto('/accedi');

    const esito = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(esito.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
