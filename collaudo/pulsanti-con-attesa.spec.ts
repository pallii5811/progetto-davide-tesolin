import { expect, test } from '@playwright/test';
import { accedi, sorvegliaErrori } from './aiuti.js';

/*
  Una partita IVA dimostrativa che nessun altro collaudo tocca: ogni prova parte da una
  scheda mai aperta. Il controllo di 09876543217 è valido (7), altrimenti la scheda non si
  aprirebbe.
*/
const AZIENDA_MAI_APERTA = '09876543217';

/**
 * Un pulsante della scheda si preme una volta, mostra l'attesa, e la pagina cambia da sola.
 *
 * Il difetto visto su RED GROUP S.R.L.: premuto «Analisi approfondita», per alcuni secondi
 * non cambiava niente, e l'intermediario ha ricaricato la pagina credendo che il tasto non
 * andasse.
 *
 * PERCHÉ QUI SI PREME «REPORT PER IL CLIENTE» E NON «ANALISI APPROFONDITA». La prima versione
 * di questa prova premeva il pulsante del difetto, e non l'ha mai trovato: nella modalità
 * dimostrativa il fornitore restituisce il profilo intero, la scheda dichiara già mostrati
 * approfondimento ed eventi negativi, e i due pulsanti che spendono non compaiono affatto
 * (`Intestazione` riceve `livelloMostrato`). Nella demo non si possono premere, e fingere il
 * contrario vorrebbe dire provare un'altra pagina.
 *
 * «Report per il cliente» è lo stesso componente — `CollegamentoAzione` — su una navigazione
 * che, come l'approfondimento, non ha uno scheletro d'attesa suo: senza la rotella la scheda
 * resterebbe ferma finché il report non arriva. Che i due pulsanti a pagamento usino quel
 * componente, senza prefetch, lo prova `apps/web/test/pulsanti-con-attesa.test.ts`.
 *
 * Il server della demo risponde in un attimo, e una rotella accesa per venti millisecondi
 * non si può vedere né provare: la risposta si rallenta di proposito.
 */
test.describe('Pulsanti con attesa', () => {
  test('«Report per il cliente» mostra la rotella e apre il report senza ricaricare la pagina', async ({
    page,
  }) => {
    const { errori } = sorvegliaErrori(page);
    await accedi(page);
    await page.goto(`/azienda/${AZIENDA_MAI_APERTA}`);

    const pulsante = page.getByRole('link', { name: 'Report per il cliente' });
    await expect(pulsante).toBeVisible({ timeout: 90_000 });

    // Un segno sulla finestra: se la pagina si ricaricasse, sparirebbe con lei.
    await page.evaluate(() => {
      (window as unknown as { senzaRicarica?: boolean }).senzaRicarica = true;
    });

    await page.route('**/azienda/**', async (percorso) => {
      if (percorso.request().headers()['rsc'] === '1') {
        await new Promise((fine) => setTimeout(fine, 2_000));
      }
      await percorso.continue();
    });

    await pulsante.click();
    await expect(pulsante.locator('[data-rotella]'), 'la rotella non si è accesa').toBeVisible();

    await expect(page).toHaveURL(new RegExp(`/azienda/${AZIENDA_MAI_APERTA}/report`), {
      timeout: 90_000,
    });
    await expect(page.getByRole('link', { name: /Torna all.analisi/ })).toBeVisible({ timeout: 90_000 });

    const senzaRicarica = await page.evaluate(
      () => (window as unknown as { senzaRicarica?: boolean }).senzaRicarica,
    );
    expect(senzaRicarica, 'la pagina è stata ricaricata').toBe(true);
    expect(errori).toEqual([]);
  });
});
