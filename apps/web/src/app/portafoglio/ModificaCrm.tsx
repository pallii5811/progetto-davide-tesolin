'use client';

import { useActionState } from 'react';
import { ETICHETTE_STATO_CRM, STATI_CRM } from '@aegis/core/crm';
import type { StatoCrm } from '@aegis/core/crm';
import { BottoneInvio } from '@/components/BottoneInvio';
import { salvaCrm } from './actions';
import type { EsitoCrm } from './actions';

/**
 * Lo stato e la nota di un'azienda, modificabili sulla riga del CRM.
 *
 * Un modulo per azienda, con il suo pulsante: chi aggiorna dieci aziende dopo un giro di
 * telefonate salva una riga alla volta e vede subito se è andata. L'esito resta accanto al
 * pulsante e si annuncia a chi usa un lettore di schermo.
 */
export function ModificaCrm({
  identificativo,
  denominazione,
  stato,
  nota,
}: {
  identificativo: string;
  denominazione: string;
  stato: StatoCrm;
  nota: string | null;
}) {
  const [esito, azione] = useActionState<EsitoCrm | null, FormData>(
    salvaCrm.bind(null, identificativo),
    null,
  );

  return (
    <form action={azione} className="space-y-2">
      <label className="block">
        <span className="sr-only">Stato di {denominazione}</span>
        <select
          name="stato"
          defaultValue={stato}
          className="w-full rounded border border-bordo-forte bg-fondo px-2 py-1.5 text-sm focus:border-marchio"
        >
          {STATI_CRM.map((valore) => (
            <option key={valore} value={valore}>
              {ETICHETTE_STATO_CRM[valore]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Nota su {denominazione}</span>
        <textarea
          name="nota"
          defaultValue={nota ?? ''}
          rows={2}
          maxLength={2000}
          placeholder="Nota"
          className="w-full rounded border border-bordo-forte bg-fondo px-2 py-1.5 text-sm focus:border-marchio"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <BottoneInvio
          inCorso="Salvataggio…"
          className="rounded border border-bordo-forte px-3 py-1 text-xs font-medium transition hover:border-marchio"
        >
          Salva
        </BottoneInvio>
        <span
          role="status"
          className={`text-xs ${esito?.ok === false ? 'text-critico' : 'text-testo-tenue'}`}
        >
          {esito?.messaggio ?? ''}
        </span>
      </div>
    </form>
  );
}
