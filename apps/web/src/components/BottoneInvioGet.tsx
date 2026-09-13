'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Rotella } from './Rotella';

/**
 * Il pulsante di un `<form method="get">`, che mostra l'attesa e non si lascia ripremere.
 *
 * Nato dentro «Dammi l'elenco» (vedi `prospect/BottoneElenco.tsx`, dove è raccontato il
 * difetto che l'ha reso necessario) e portato qui quando è servito anche a «Quante sono?»:
 * due copie della stessa sottigliezza sarebbero diventate due comportamenti diversi alla
 * prima correzione fatta su una sola.
 *
 * PERCHÉ NON `useFormStatus`. Quel gancio vuole un modulo con un'azione React; qui il
 * modulo naviga da sé, perché la ricerca vive nell'indirizzo e dev'essere condivisibile.
 *
 * PERCHÉ LO SPEGNIMENTO È DIFFERITO. Disabilitare il pulsante che sta inviando fa annullare
 * l'invio al browser: lo spegnimento si rimanda al giro successivo del ciclo di eventi,
 * quando la richiesta è già in volo.
 *
 * PERCHÉ `pageshow`. Tornando indietro, il browser può restituire la pagina dalla sua cache
 * esattamente com'era — con il pulsante spento e «in corso» — e nessuno lo riaccenderebbe.
 *
 * `event.submitter` distingue QUESTO pulsante dagli altri dello stesso modulo.
 */
export function BottoneInvioGet({
  children,
  inCorso,
  className = '',
  name,
  value,
  testId,
}: {
  children: ReactNode;
  inCorso: ReactNode;
  className?: string | undefined;
  name?: string | undefined;
  value?: string | undefined;
  testId?: string | undefined;
}) {
  const [attesa, setAttesa] = useState(false);
  const riferimento = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const modulo = riferimento.current?.form;
    if (!modulo) return undefined;

    const allInvio = (evento: SubmitEvent): void => {
      if (evento.submitter !== riferimento.current) return;
      setTimeout(() => setAttesa(true), 0);
    };
    const alRitorno = (evento: PageTransitionEvent): void => {
      if (evento.persisted) setAttesa(false);
    };

    modulo.addEventListener('submit', allInvio);
    window.addEventListener('pageshow', alRitorno);
    return () => {
      modulo.removeEventListener('submit', allInvio);
      window.removeEventListener('pageshow', alRitorno);
    };
  }, []);

  return (
    <button
      ref={riferimento}
      type="submit"
      name={name}
      value={value}
      data-testid={testId}
      disabled={attesa}
      aria-busy={attesa}
      // Chi usa un lettore di schermo deve sentire che la richiesta è partita: senza, per lui
      // non è cambiato niente, ed è esattamente il caso in cui si riprova.
      aria-live="polite"
      className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-wait ${className}`}
    >
      {attesa && <Rotella />}
      {attesa ? inCorso : children}
    </button>
  );
}
