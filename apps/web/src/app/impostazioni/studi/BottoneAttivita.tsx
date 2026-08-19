'use client';

import { useTransition } from 'react';
import { cambiaAttivita } from './actions';

/**
 * Sospende o riattiva uno studio.
 *
 * La sospensione non cancella nulla: i dati restano, gli accessi no. È la leva per un
 * abbonamento non pagato, dove distruggere il portafoglio di un intermediario sarebbe
 * sproporzionato — e, sui dati dei suoi clienti, probabilmente illecito.
 */
export function BottoneAttivita({
  id,
  denominazione,
  attivo,
}: {
  id: string;
  denominazione: string;
  attivo: boolean;
}) {
  const [inCorso, avvia] = useTransition();

  return (
    <button
      type="button"
      disabled={inCorso}
      onClick={() => {
        // Sospendere fa smettere di lavorare delle persone, subito e senza preavviso:
        // merita la conferma che riattivare non merita.
        if (attivo && !confirm(`Sospendere «${denominazione}»? Gli accessi cessano subito.`)) return;
        avvia(() => void cambiaAttivita(id, !attivo));
      }}
      className="rounded border border-bordo-forte px-2.5 py-1 text-xs text-testo-tenue transition hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40 disabled:opacity-50"
    >
      {inCorso ? '…' : attivo ? 'Sospendi' : 'Riattiva'}
    </button>
  );
}
