import { Blocco, Scheletro } from '@/components/Scheletro';

/**
 * Il report mentre arriva: la barra dei comandi e il foglio del documento.
 *
 * Senza questo file valeva lo scheletro della scheda (`../loading.tsx`), con la forma
 * dell'analisi invece di quella di un documento.
 */
export default function Caricamento() {
  return (
    <Scheletro etichetta="Preparazione del report…">
      <div className="mb-5 flex items-center justify-between">
        <Blocco className="h-3 w-28" />
        <Blocco className="h-9 w-44 rounded-full" />
      </div>
      <Blocco className="h-14 w-full rounded-2xl" />
      <div className="mx-auto mt-6 max-w-3xl space-y-3">
        <Blocco className="h-3 w-80 max-w-full" />
        <Blocco className="h-8 w-96 max-w-full" />
        <Blocco className="h-3.5 w-full" />
        <Blocco className="h-3.5 w-2/3" />
        <div className="!mt-8 h-px bg-bordo" />
        <Blocco className="!mt-8 h-5 w-56" />
        {[0, 1, 2, 3, 4].map((n) => (
          <Blocco key={n} className="h-3.5 w-full" />
        ))}
      </div>
    </Scheletro>
  );
}
