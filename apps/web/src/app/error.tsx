'use client';

import { useEffect } from 'react';

/**
 * Confine di errore dell'applicazione.
 *
 * Senza, un errore in una sola sezione fa cadere l'intera pagina su una schermata vuota
 * del framework. Qui il messaggio è in italiano, indica cosa fare, e offre un tentativo
 * di ripristino senza perdere il contesto di navigazione.
 */
export default function Errore({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // In produzione qui va il collegamento al sistema di tracciamento errori.
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-lg border border-critico/40 bg-critico-fondo p-6">
      <h1 className="text-lg font-semibold">Qualcosa non ha funzionato</h1>
      <p className="mt-1.5 text-sm leading-relaxed">
        L&apos;operazione non è andata a buon fine. Se il problema persiste, verificare che il servizio di
        analisi sia attivo sulla porta 3001.
      </p>
      {error.message !== '' && (
        <p className="mt-3 rounded border border-bordo bg-fondo p-2.5 font-mono text-xs">{error.message}</p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-marchio px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-marchio/40"
        >
          Riprova
        </button>
        <a
          href="/"
          className="rounded border border-bordo-forte px-4 py-2 text-sm transition hover:border-marchio"
        >
          Torna alla ricerca
        </a>
      </div>
    </div>
  );
}
