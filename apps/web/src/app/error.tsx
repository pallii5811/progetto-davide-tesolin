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
      {/*
        Qui c'era «verificare che il servizio di analisi sia attivo sulla porta 3001».

        La porta è configurabile con AEGIS_API_URL, e nominarne una fissa manda a cercare
        il guasto nel posto sbagliato — è già successo, con l'API su un'altra porta e
        l'interfaccia che continuava a indicare la 3001. Questo è un componente di client:
        l'indirizzo vero non lo può nemmeno leggere, perché Next inserisce nel pacchetto
        del browser le sole variabili `NEXT_PUBLIC_*` e le altre valgono `undefined`.
        Stamparlo da qui vorrebbe dire stampare il ripiego, cioè di nuovo la 3001 — un
        numero verosimile e non verificato, che è la forma peggiore.

        Quindi non si nomina: si dice cosa fare, e i due lettori hanno due rimedi diversi.
      */}
      <p className="mt-1.5 text-sm leading-relaxed">
        L&apos;operazione non è andata a buon fine.{' '}
        {process.env.NODE_ENV === 'production'
          ? 'Se il problema persiste, segnalarlo all’assistenza riportando il messaggio qui sotto.'
          : 'Se il problema persiste, verificare che il servizio di analisi risponda all’indirizzo indicato in AEGIS_API_URL.'}
      </p>
      {error.message !== '' && (
        <p className="mt-3 rounded border border-bordo bg-fondo p-2.5 font-mono text-xs">{error.message}</p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90"
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
