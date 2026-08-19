'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { cambiaPasswordAzione } from './actions';

const CAMPO =
  'w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none transition focus:border-marchio focus:ring-2 focus:ring-marchio/25';
const ETICHETTA = 'mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole';

function Bottone() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      {pending ? 'Aggiornamento…' : 'Aggiorna password'}
    </button>
  );
}

export function ModuloPassword() {
  const [esito, invia] = useActionState(cambiaPasswordAzione, null);

  return (
    // `key` sull'esito riuscito: il modulo si svuota da solo dopo il cambio, così i campi
    // non restano compilati sullo schermo di una postazione condivisa.
    <form key={esito?.ok === true ? 'pulito' : 'compilazione'} action={invia} className="space-y-4">
      <div>
        <label htmlFor="corrente" className={ETICHETTA}>
          Password attuale
        </label>
        <input
          id="corrente"
          name="corrente"
          type="password"
          autoComplete="current-password"
          required
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="nuova" className={ETICHETTA}>
          Nuova password
        </label>
        <input
          id="nuova"
          name="nuova"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby="requisiti"
          className={CAMPO}
        />
        <p id="requisiti" className="mt-1 text-xs text-testo-debole">
          Almeno 12 caratteri.
        </p>
      </div>

      <div>
        <label htmlFor="conferma" className={ETICHETTA}>
          Conferma nuova password
        </label>
        <input
          id="conferma"
          name="conferma"
          type="password"
          autoComplete="new-password"
          required
          className={CAMPO}
        />
      </div>

      <div aria-live="polite" className="min-h-5">
        {esito !== null && (
          <p className={`text-sm ${esito.ok ? 'text-basso' : 'text-critico'}`}>{esito.messaggio}</p>
        )}
      </div>

      <Bottone />
    </form>
  );
}
