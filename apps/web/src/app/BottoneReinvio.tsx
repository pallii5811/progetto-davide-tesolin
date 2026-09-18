'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Rotella } from '@/components/Rotella';
import { reinviaConferma } from './azioni-account';

function Pulsante() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-1.5 rounded-full border border-marchio/40 px-3 py-1 text-xs font-medium text-marchio transition hover:bg-superficie disabled:opacity-50"
    >
      {pending && <Rotella />}
      {pending ? 'Invio…' : 'Invia di nuovo'}
    </button>
  );
}

/** «Invia di nuovo» dell'avviso di conferma, con l'esito accanto invece che in un'altra pagina. */
export function BottoneReinvio() {
  const [esito, invia] = useActionState(reinviaConferma, null);
  return (
    <form action={invia} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Pulsante />
      <span
        aria-live="polite"
        className={`text-xs ${esito?.ok === false ? 'text-critico' : 'text-testo-tenue'}`}
      >
        {esito?.messaggio ?? ''}
      </span>
    </form>
  );
}
