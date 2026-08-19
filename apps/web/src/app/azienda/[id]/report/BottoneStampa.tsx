'use client';

/**
 * Stampa e salvataggio in PDF.
 *
 * Si usa la finestra di stampa del sistema invece di generare il PDF lato server: il
 * risultato è identico (il broker sceglie «Salva come PDF»), non aggiunge una dipendenza
 * di rendering headless, e soprattutto la resa segue il CSS di stampa che è già scritto e
 * verificabile a schermo. Quando servirà l'invio automatico via email, il PDF lato server
 * diventerà necessario: allora si aggiungerà, non prima.
 */
export function BottoneStampa() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      Stampa o salva in PDF
    </button>
  );
}
