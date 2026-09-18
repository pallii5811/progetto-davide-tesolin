import { Blocco, CampiScheletro, CartaScheletro, Scheletro, TitoloScheletro } from '@/components/Scheletro';

/**
 * I dati di intervista mentre arrivano.
 *
 * Senza questo file valeva lo scheletro della scheda (`../loading.tsx`), che ha la forma
 * dell'analisi — riquadri dei rischi e sezioni — e non quella di un modulo: la pagina
 * cambiava forma due volte.
 */
export default function Caricamento() {
  return (
    <Scheletro etichetta="Caricamento dei dati di intervista…">
      <TitoloScheletro conRitorno />
      <CartaScheletro righe={5} />
      <div className="mt-5 space-y-5">
        {[0, 1].map((n) => (
          <div
            key={n}
            className="rounded-2xl border border-bordo bg-superficie p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <Blocco className="mb-5 h-4 w-52" />
            <CampiScheletro quanti={4} colonne="sm:grid-cols-2" />
          </div>
        ))}
      </div>
    </Scheletro>
  );
}
