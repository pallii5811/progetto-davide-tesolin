'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { aggiornaMonitoraggio } from './actions';
import type { EsitoMonitoraggio } from './actions';

function Bottone() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-marchio px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      {pending ? 'Verifica in corso…' : 'Aggiorna monitoraggio'}
    </button>
  );
}

export function BottoneAggiorna() {
  const [esito, esegui] = useActionState<EsitoMonitoraggio | null>(() => aggiornaMonitoraggio(), null);

  return (
    <form action={esegui} className="text-right">
      <Bottone />
      <div aria-live="polite" className="mt-1 min-h-5">
        {esito !== null && (
          <p className={`text-xs ${esito.ok ? 'text-testo-tenue' : 'text-critico'}`}>{esito.messaggio}</p>
        )}
      </div>
      {/*
        Nessuna chiamata al provider, nessun costo: si confrontano le fotografie già
        salvate. Dichiararlo evita che l'intermediario eviti di premerlo per prudenza.
      */}
      <p className="mt-0.5 text-xs text-testo-debole">Non consuma credito dati.</p>
    </form>
  );
}
