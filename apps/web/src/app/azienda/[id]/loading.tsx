/**
 * Stato di caricamento.
 *
 * L'analisi richiede più chiamate al provider dati: senza questo, la pagina resta bianca
 * per qualche secondo e l'utente clicca di nuovo. Lo scheletro riproduce la struttura reale
 * della pagina, così l'occhio sa già dove guardare quando i dati arrivano.
 */
export default function Caricamento() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Analisi in corso…</span>

      <div className="mb-6 space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-bordo" />
        <div className="h-8 w-96 max-w-full animate-pulse rounded bg-bordo" />
        <div className="h-3 w-72 max-w-full animate-pulse rounded bg-bordo" />
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="rounded-lg border border-bordo bg-superficie p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-bordo" />
            <div className="mt-2 h-7 w-32 animate-pulse rounded bg-bordo" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-bordo" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="rounded-lg border border-bordo bg-superficie p-4">
            <div className="h-4 w-64 max-w-full animate-pulse rounded bg-bordo" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-bordo" />
            <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-bordo" />
          </div>
        ))}
      </div>
    </div>
  );
}
