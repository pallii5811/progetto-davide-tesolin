'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { EsitoAccesso } from './actions';

function Bottone() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-azione px-4 py-2.5 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Verifica in corso…' : 'Entra'}
    </button>
  );
}

export function ModuloAccesso({
  azione,
  ritorno,
}: {
  azione: (precedente: EsitoAccesso | null, modulo: FormData) => Promise<EsitoAccesso>;
  ritorno: string;
}) {
  const [esito, invia] = useActionState(azione, null);

  return (
    <form action={invia} className="space-y-4">
      <input type="hidden" name="ritorno" value={ritorno} />
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
        >
          Indirizzo di posta
        </label>
        {/*
          `defaultValue` ricompila l'indirizzo dopo un tentativo fallito: chi sbaglia la
          password non deve riscrivere anche la propria posta. La password, invece, resta
          vuota — riproporla a schermo sarebbe un regalo a chi passa davanti allo schermo.
        */}
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={esito?.email ?? ''}
          className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm transition focus:border-marchio"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm transition focus:border-marchio"
        />
      </div>

      {/* `aria-live` perché anche chi usa un lettore di schermo senta l'esito. */}
      <div aria-live="polite" className="min-h-5">
        {esito !== null && !esito.ok && <p className="text-sm text-critico">{esito.messaggio}</p>}
      </div>

      <Bottone />
    </form>
  );
}
