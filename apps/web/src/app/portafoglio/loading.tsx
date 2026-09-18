import { Blocco, Scheletro, TitoloScheletro } from '@/components/Scheletro';

/** Il CRM mentre arriva: il titolo, i filtri per stato, le righe delle aziende. */
export default function Caricamento() {
  return (
    <Scheletro etichetta="Caricamento del CRM…">
      <TitoloScheletro />
      <div className="mb-4 flex flex-wrap gap-2">
        {['w-20', 'w-28', 'w-24', 'w-32', 'w-24'].map((larghezza, n) => (
          <Blocco key={n} className={`h-8 rounded-full ${larghezza}`} />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-bordo bg-superficie shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-4 border-b border-bordo px-5 py-4 last:border-b-0">
            <div className="min-w-0 flex-1 space-y-2">
              <Blocco className="h-4 w-64 max-w-full" />
              <Blocco className="h-3 w-40 max-w-full" />
            </div>
            <Blocco className="hidden h-6 w-20 rounded-full sm:block" />
            <Blocco className="hidden h-6 w-16 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </Scheletro>
  );
}
