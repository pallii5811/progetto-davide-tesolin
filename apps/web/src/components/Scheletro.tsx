import type { ReactNode } from 'react';

/**
 * I pezzi degli scheletri di caricamento (`loading.tsx`).
 *
 * Dal redesign del 18/09/2026 ogni pagina principale ne ha uno. Non per mostrare
 * un'animazione: Next scarica in anticipo lo scheletro delle pagine a cui portano i
 * collegamenti visibili, quindi al clic la pagina nuova compare **subito** con la sua forma
 * — titolo, carte, righe — e i dati la riempiono appena arrivano. Chi clicca vede che il
 * clic è stato preso, e l'occhio sa già dove guardare.
 *
 * La pulsazione è solo per chi non ha chiesto meno movimento (`motion-safe`): per gli altri
 * lo scheletro resta fermo, ed è ugualmente leggibile come «sta arrivando».
 */

/** Un blocco grigio della forma del testo che sta arrivando. */
export function Blocco({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-bordo motion-safe:animate-pulse ${className}`} />;
}

/** La cornice: dichiara l'attesa a chi usa un lettore di schermo, una volta sola. */
export function Scheletro({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{etichetta}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Titolo e sottotitolo di pagina. */
export function TitoloScheletro({ conRitorno = false }: { conRitorno?: boolean }) {
  return (
    <div className="mb-8 space-y-3">
      {conRitorno && <Blocco className="h-3 w-40" />}
      <Blocco className="h-7 w-72 max-w-full" />
      <Blocco className="h-3.5 w-96 max-w-full" />
    </div>
  );
}

/** Una carta bianca con righe di testo. */
export function CartaScheletro({ righe = 3, className = '' }: { righe?: number; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-bordo bg-superficie p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      <Blocco className="h-4 w-48 max-w-full" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: righe }, (_, n) => (
          <Blocco key={n} className={`h-3 ${n === righe - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

/** Una griglia di campi di modulo: etichetta sopra, casella sotto. */
export function CampiScheletro({
  quanti,
  colonne = 'sm:grid-cols-2 lg:grid-cols-4',
}: {
  quanti: number;
  colonne?: string;
}) {
  return (
    <div className={`grid gap-x-4 gap-y-5 ${colonne}`}>
      {Array.from({ length: quanti }, (_, n) => (
        <div key={n}>
          <Blocco className="mb-2 h-3 w-24" />
          <div className="h-[38px] rounded-xl border border-bordo bg-fondo" />
        </div>
      ))}
    </div>
  );
}
