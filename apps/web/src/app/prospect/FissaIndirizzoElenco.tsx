'use client';

import { useEffect } from 'react';

/**
 * Dopo un acquisto, l'indirizzo della pagina porta la posizione da cui l'elenco è partito.
 *
 * Dal 18/09/2026 ricomprare gli stessi filtri porta le aziende successive a quelle già
 * comprate. La pagina dell'elenco compra quando si apre: ricaricarla, o tornarci con
 * «indietro», avrebbe comprato le successive senza che nessuno lo chiedesse. Con `salta`
 * nell'indirizzo la richiesta ripetuta è identica alla prima, e la memoria la serve senza
 * pagare.
 *
 * Si sostituisce la voce della cronologia invece di aggiungerne una: «indietro» deve tornare al
 * modulo, non a una copia di questa pagina.
 */
export function FissaIndirizzoElenco({ salta }: { salta: number }) {
  useEffect(() => {
    const indirizzo = new URL(window.location.href);
    if (indirizzo.searchParams.get('salta') === String(salta)) return;
    indirizzo.searchParams.set('salta', String(salta));
    window.history.replaceState(window.history.state, '', indirizzo.toString());
  }, [salta]);

  return null;
}
