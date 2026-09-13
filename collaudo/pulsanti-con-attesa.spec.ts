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
 * PERCHÉ QUI SI PREME «REPORT PER IL CLIENTE». Nella modalità dimostrativa il fornitore
 * restituisce il profilo intero, la scheda dichiara già mostrati approfondimento ed eventi
 * negativi, e i due pulsanti che spendono non compaiono (`Intestazione` riceve
 * `livelloMostrato`). «Report per il cliente» è lo stesso componente, `CollegamentoAzione`,
 * su una navigazione che non ha uno scheletro d'attesa suo. Che i pulsanti a pagamento usino
 * quel componente, senza prefetch, lo prova `apps/web/test/pulsanti-con-attesa.test.ts`.
 *
 * COME SI MISURA, dopo tre versioni che supponevano.
 *
 * La rotella resta accesa quanto la risposta tarda, e la demo risponde in pochi millisecondi:
 * la richiesta della pagina nuova si rallenta di proposito. Le prime due versioni la
 * riconoscevano dall'intestazione «rsc» e poi da un filtro sull'indirizzo, e la traccia ha
 * mostrato la richiesta servita in 79 e 145 ms: il rallentamento non scattava, e il collaudo
 * accusava la rotella. Da sola la prova passava per caso, quando il report veniva compilato al
 * primo accesso.
 *
 * Ora si intercetta tutto, si rallenta ciò che porta «_rsc», e si CONTA: se nessuna richiesta
 * è stata rallentata la prova lo dice, invece di dare la colpa alla rotella. E la rotella la
 * registra un osservatore del documento installato prima del clic, così la vede anche se
 * resta accesa un istante, e anche se quando il collaudo guarda la pagina è già cambiata.
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

    const rallentate: string[] = [];
    await page.route('**/*', async (percorso) => {
      const indirizzo = percorso.request().url();
      if (indirizzo.includes('_rsc=')) {
        rallentate.push(indirizzo);
        await new Promise((fine) => setTimeout(fine, 2_000));
      }
      await percorso.continue();
    });

    // Il segno sulla finestra sparisce se la pagina si ricarica; l'osservatore registra la rotella.
    await page.evaluate(() => {
      const finestra = window as unknown as { senzaRicarica?: boolean; rotellaVista?: boolean };
      finestra.senzaRicarica = true;
      finestra.rotellaVista = false;
      new MutationObserver(() => {
        if (document.querySelector('a [data-rotella]') !== null) finestra.rotellaVista = true;
      }).observe(document.body, { childList: true, subtree: true });
    });

    await pulsante.click();

    await expect(page).toHaveURL(new RegExp(`/azienda/${AZIENDA_MAI_APERTA}/report`), {
      timeout: 90_000,
    });
    await expect(page.getByRole('link', { name: /Torna all.analisi/ })).toBeVisible({ timeout: 90_000 });

    expect(
      rallentate.length,
      'nessuna richiesta della pagina nuova è stata rallentata: la prova non misurerebbe la rotella',
    ).toBeGreaterThan(0);

    const stato = await page.evaluate(() => {
      const finestra = window as unknown as { senzaRicarica?: boolean; rotellaVista?: boolean };
      return { senzaRicarica: finestra.senzaRicarica, rotellaVista: finestra.rotellaVista };
    });
    expect(stato.rotellaVista, 'la rotella non si è accesa').toBe(true);
    expect(stato.senzaRicarica, 'la pagina è stata ricaricata').toBe(true);
    expect(errori).toEqual([]);
  });
});
