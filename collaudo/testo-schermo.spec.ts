import { expect, test } from '@playwright/test';
import { accedi, AZIENDA_DI_PROVA } from './aiuti.js';
import { rilieviSulTesto } from '../scripts/lib/rilevatori-testo.js';

/**
 * Ogni riga che il browser rende, letta dagli stessi rilevatori dell'auditor.
 *
 * `scripts/audit-testo-schermo.ts` misura il DTO che il presentatore consegna alla pagina,
 * e su quello ha chiuso cinque classi di difetto. Ma il report per il cliente — il
 * documento che l'intermediario stampa e consegna — ha prosa scritta direttamente nei
 * componenti: «Restano da acquisire: …», le note metodologiche, le avvertenze di legge.
 * Quella prosa non passa dal DTO, e nessun rilevatore l'aveva mai letta. Era l'unica
 * superficie del prodotto non misurata, ed era quella con il lettore più esigente.
 *
 * Qui si apre ogni pagina che un lettore vede davvero, si spalancano i blocchi
 * ripiegabili — «Perché questo rischio», «Come è stato calcolato» stanno dentro
 * `<details>` chiusi, e `innerText` non li leggerebbe — e si passa ogni riga resa ai tre
 * rilevatori di testo puro: separatore decimale inglese, accordo con il numero uno,
 * affermazioni ripetute.
 *
 * I rilevatori sono gli stessi dell'auditor, importati e non copiati: una copia in due
 * posti divergerebbe entro un mese, e la prova continuerebbe a passare sul rilevatore
 * vecchio.
 */
const PAGINE: readonly (readonly [string, string])[] = [
  ['analisi azienda', `/azienda/${AZIENDA_DI_PROVA}`],
  ['dati di intervista', `/azienda/${AZIENDA_DI_PROVA}/dati`],
  ['report sintetico', `/azienda/${AZIENDA_DI_PROVA}/report?profondita=sintetica`],
  ['report motivato', `/azienda/${AZIENDA_DI_PROVA}/report?profondita=motivata`],
  ['report approfondito', `/azienda/${AZIENDA_DI_PROVA}/report?profondita=approfondita`],
];

/**
 * Le righe che non sono prosa e che sporcherebbero il conto.
 *
 * Un indirizzo di posta, un sito, un codice: il rilevatore del separatore decimale li
 * riconosce già dal contesto (`@`, `http`). Qui si tolgono le righe **vuote** e quelle di
 * una o due lettere — le lettere di una matrice, i separatori — che non sono frasi.
 */
function righeDiProsa(testo: string): string[] {
  return testo
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 2);
}

test.describe('Ogni riga resa dal browser passa dai rilevatori di testo', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page);
  });

  for (const [nome, percorso] of PAGINE) {
    test(`${nome}: nessun rilievo`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto(percorso);
      await page.waitForLoadState('networkidle');

      // I blocchi ripiegabili si aprono tutti, o il testo che contengono non esiste per
      // `innerText` — ed è proprio lì che stanno le motivazioni e i calcoli.
      await page
        .locator('details')
        .evaluateAll((elementi) => elementi.forEach((d) => d.setAttribute('open', '')));

      const testo = await page.locator('body').innerText();
      const righe = righeDiProsa(testo);
      expect(righe.length, 'la pagina deve avere del testo da misurare').toBeGreaterThan(50);

      const rilievi: string[] = [];
      for (const riga of righe) {
        for (const r of rilieviSulTesto(riga)) rilievi.push(`${r} — ${riga.slice(0, 100)}`);
      }

      expect(rilievi, rilievi.join('\n')).toEqual([]);
    });
  }
});
