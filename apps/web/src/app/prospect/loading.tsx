import { Blocco, CampiScheletro, Scheletro, TitoloScheletro } from '@/components/Scheletro';

/** Ricerca Clienti mentre arriva: il titolo, il modulo dei filtri, la ricerca per partita IVA. */
export default function Caricamento() {
  return (
    <Scheletro etichetta="Caricamento di Ricerca Clienti…">
      <TitoloScheletro />
      <div className="rounded-2xl border border-bordo bg-superficie p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <CampiScheletro quanti={8} />
        <div className="mt-6 flex gap-3">
          <Blocco className="h-9 w-44 rounded-full" />
          <Blocco className="h-9 w-32 rounded-full" />
        </div>
      </div>
      <div className="mt-12 space-y-3">
        <Blocco className="h-5 w-56" />
        <Blocco className="h-3.5 w-40" />
      </div>
      <div className="mt-5 rounded-2xl border border-bordo bg-superficie p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <CampiScheletro quanti={1} colonne="" />
      </div>
    </Scheletro>
  );
}
