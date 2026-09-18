'use client';

import { useActionState } from 'react';
import { BottoneAccesso } from '@/components/BottoneAccesso';
import type { EsitoConferma } from './actions';

export function ModuloConferma({
  azione,
  codice,
}: {
  azione: (precedente: EsitoConferma | null, modulo: FormData) => Promise<EsitoConferma>;
  codice: string;
}) {
  const [esito, invia] = useActionState(azione, null);

  if (esito?.ok === true) {
    return (
      <p role="status" className="text-sm leading-relaxed text-testo-tenue">
        {esito.messaggio}
      </p>
    );
  }

  return (
    <form action={invia} className="space-y-4">
      <input type="hidden" name="codice" value={codice} />
      <div aria-live="polite" className="min-h-5">
        {esito?.ok === false && (
          <p role="alert" className="text-sm text-critico">
            {esito.messaggio}
          </p>
        )}
      </div>
      <BottoneAccesso testo="Conferma il mio indirizzo" attesa="Conferma in corso…" />
    </form>
  );
}
