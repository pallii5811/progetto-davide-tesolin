'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Rotella } from './Rotella';

/**
 * Il pulsante che invia un modulo con un'azione, e mostra che l'invio è in corso.
 *
 * `useFormStatus` legge il modulo che lo contiene, quindi funziona anche dentro una pagina
 * che gira sul server — «Esci» nell'intestazione, «Segna gestito» nel monitoraggio — senza
 * trasformare la pagina intera in un componente di client.
 *
 * Durante l'invio il pulsante è spento: il secondo clic non parte. E `aria-busy` più il
 * testo che cambia dicono l'attesa a chi non vede la rotella.
 */
export function BottoneInvio({
  children,
  inCorso,
  className = '',
}: {
  children: ReactNode;
  /** Il testo durante l'invio; se manca resta quello del pulsante, con la rotella accanto. */
  inCorso?: ReactNode | undefined;
  className?: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-wait ${className}`}
    >
      {pending && <Rotella />}
      {pending && inCorso !== undefined ? inCorso : children}
    </button>
  );
}
