'use client';

import { useTransition } from 'react';
import { Rotella } from '@/components/Rotella';
import { cambiaAcquisti } from './actions';

/**
 * Attiva o blocca gli acquisti di dati di uno studio.
 *
 * È il passaggio che apre davvero uno studio registrato da solo (decisione di Simone del
 * 18/09/2026): da quel clic in poi spende il credito della piattaforma. Per questo chiede
 * conferma, e ricorda di guardare il RUI prima. Con la posta attiva non si attiva finché chi
 * ha aperto lo studio non ha confermato la sua email: lo rifiuterebbe l'API, e il pulsante
 * lo dice prima.
 */
export function BottoneAcquisti({
  id,
  denominazione,
  numeroRui,
  abilitati,
  attesaConferma = false,
}: {
  id: string;
  denominazione: string;
  numeroRui: string | null;
  abilitati: boolean;
  /** Vero se la posta è attiva e il referente non ha ancora confermato l'indirizzo. */
  attesaConferma?: boolean;
}) {
  const [inCorso, avvia] = useTransition();

  if (!abilitati && attesaConferma) {
    return (
      <span className="inline-flex items-center rounded border border-bordo px-2.5 py-1 text-xs text-testo-debole">
        attende la conferma email
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={inCorso}
      onClick={() => {
        const domanda = abilitati
          ? `Bloccare gli acquisti di «${denominazione}»? Potrà entrare e lavorare, ma non comprare dati.`
          : `Attivare gli acquisti di «${denominazione}»${numeroRui === null ? '' : ` (RUI ${numeroRui})`}? ` +
            'Da ora potrà spendere il credito della piattaforma.';
        if (!confirm(domanda)) return;
        avvia(() => void cambiaAcquisti(id, !abilitati));
      }}
      aria-busy={inCorso}
      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        abilitati
          ? 'border border-bordo-forte text-testo-tenue hover:text-testo'
          : 'bg-azione text-azione-testo hover:opacity-90'
      }`}
    >
      {inCorso && <Rotella className="h-3 w-3" />}
      {abilitati ? 'Blocca acquisti' : 'Attiva acquisti'}
    </button>
  );
}
