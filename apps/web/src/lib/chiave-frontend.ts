/**
 * Il segreto che questo frontend presenta all'API, quando l'API sta altrove.
 *
 * ── PERCHÉ ESISTE ─────────────────────────────────────────────────────────────
 *
 * Finché il sito e l'API girano sulla stessa macchina, l'API ascolta su `127.0.0.1` e il
 * firewall chiude la porta: la sua difesa è la rete, e basta. Nel momento in cui il
 * frontend si sposta — su Vercel, su un'altra macchina, ovunque — quella difesa sparisce e
 * l'API deve poter distinguere «la richiesta viene dalle mie pagine» da «la richiesta viene
 * da internet».
 *
 * `AEGIS_CHIAVE_FRONTEND` è quel segreto, e deve valere lo stesso nei due posti.
 *
 * ── PERCHÉ STA IN UN FILE DA SOLO ────────────────────────────────────────────
 *
 * Per la stessa ragione per cui esiste `chiamaApiConSessione`: le chiamate all'API partono
 * da tre punti diversi, e un segreto dimenticato in uno solo di quei tre produce un guasto
 * che non assomiglia alla sua causa — una pagina che risponde 404 mentre le altre
 * funzionano, e nessuna riga di log che dica perché. Passando tutti da qui, dimenticarlo
 * non è più possibile.
 *
 * ── QUANDO NON C'È ────────────────────────────────────────────────────────────
 *
 * Non succede niente, ed è voluto. Su una macchina sola l'aggiunta non protegge da nulla e
 * aggiungerebbe solo un modo di sbagliare la configurazione. Vale la regola di sempre:
 * l'assenza resta assenza, non diventa una stringa vuota da confrontare.
 */

/** L'intestazione con il segreto, oppure nessuna intestazione se non è configurato. */
export function intestazioneChiaveFrontend(): Record<string, string> {
  const chiave = process.env['AEGIS_CHIAVE_FRONTEND'] ?? '';
  return chiave === '' ? {} : { 'x-aegis-frontend': chiave };
}
