'use client';

import { useActionState } from 'react';
import { CampoAccesso, CollegamentoPubblico } from '@/components/accesso';
import { BottoneAccesso } from '@/components/BottoneAccesso';
import type { EsitoNuovaPassword } from './actions';

export function ModuloNuovaPassword({
  azione,
  codice,
}: {
  azione: (precedente: EsitoNuovaPassword | null, modulo: FormData) => Promise<EsitoNuovaPassword>;
  codice: string;
}) {
  const [esito, invia] = useActionState(azione, null);

  // Un collegamento che non vale più non si ripara riprovando: se ne chiede un altro.
  if (esito?.problema === 'codice') {
    return (
      <div role="alert" className="space-y-3 text-sm leading-relaxed">
        <p className="text-critico">{esito.messaggio}</p>
        <p>
          <CollegamentoPubblico href="/password-dimenticata">
            Chiedi un nuovo collegamento
          </CollegamentoPubblico>
        </p>
      </div>
    );
  }

  return (
    <form action={invia} className="space-y-4">
      <input type="hidden" name="codice" value={codice} />
      <CampoAccesso
        id="password"
        etichetta="Nuova password"
        tipo="password"
        autoComplete="new-password"
        errore={esito?.problema === 'password' ? esito.messaggio : undefined}
        aiuto="Almeno 12 caratteri, senza parole ovvie come «password», «broker», «assicurazioni» o «aegis». Una frase che ricordi va benissimo."
        minimo={12}
        massimo={200}
      />
      <CampoAccesso
        id="ripetiPassword"
        etichetta="Ripeti la nuova password"
        tipo="password"
        autoComplete="new-password"
        minimo={12}
        massimo={200}
      />
      <div aria-live="polite" className="min-h-5">
        {esito?.problema === 'servizio' && <p className="text-sm text-critico">{esito.messaggio}</p>}
      </div>
      <BottoneAccesso testo="Salva la nuova password" attesa="Salvataggio…" />
    </form>
  );
}
