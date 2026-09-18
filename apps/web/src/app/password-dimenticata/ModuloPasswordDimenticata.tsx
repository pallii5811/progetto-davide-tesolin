'use client';

import { useActionState } from 'react';
import { CampoAccesso } from '@/components/accesso';
import { BottoneAccesso } from '@/components/BottoneAccesso';
import type { EsitoRichiesta } from './actions';

export function ModuloPasswordDimenticata({
  azione,
}: {
  azione: (precedente: EsitoRichiesta | null, modulo: FormData) => Promise<EsitoRichiesta>;
}) {
  const [esito, invia] = useActionState(azione, null);

  if (esito?.stato === 'inviata') {
    return (
      <div role="status" className="space-y-3 text-sm leading-relaxed">
        <p className="font-medium">Controlla la tua casella.</p>
        <p className="text-testo-tenue">{esito.messaggio}</p>
        <p className="text-testo-tenue">Non la trovi? Guarda anche nella posta indesiderata.</p>
      </div>
    );
  }

  return (
    <form action={invia} className="space-y-4">
      <CampoAccesso
        id="email"
        etichetta="Indirizzo di posta"
        tipo="email"
        autoComplete="username"
        valore={esito?.email}
        errore={esito?.stato === 'errore' ? esito.messaggio : undefined}
        massimo={200}
      />
      <BottoneAccesso testo="Mandami il collegamento" attesa="Invio in corso…" />
    </form>
  );
}
