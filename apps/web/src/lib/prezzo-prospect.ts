/**
 * Il prezzo di una riga d'elenco, ricavato dal totale che il fornitore dichiara.
 *
 * Accanto a un totale che arriva dalla risposta («si spendono 0,25 €») la pagina scriveva
 * «· 5 centesimi ad azienda», a mano. Due numeri sulla stessa riga, uno misurato e uno
 * ricordato: il giorno in cui il listino cambia, il primo si aggiorna e il secondo no, e
 * chi legge non ha modo di sapere quale dei due credere. È già successo su un altro
 * pulsante di questa stessa schermata, con «+0,48 €» su un servizio che ne costava trenta.
 *
 * L'assenza resta assenza: senza righe non esiste un prezzo unitario, e `null` è la
 * risposta giusta — zero sarebbe un prezzo, e un prezzo sbagliato accanto a un pulsante
 * che spende.
 */
export function centesimiPerRiga(costoElencoCentesimi: number, righe: number): number | null {
  if (!Number.isFinite(righe) || righe <= 0) return null;
  if (!Number.isFinite(costoElencoCentesimi)) return null;
  return costoElencoCentesimi / righe;
}
