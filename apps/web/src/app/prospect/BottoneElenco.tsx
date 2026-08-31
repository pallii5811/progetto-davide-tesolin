'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Il pulsante che spende, e che dopo il primo clic non spende una seconda volta.
 *
 * IL DIFETTO. «Dammi l'elenco» era un `submit` dentro un modulo che naviga: finché il
 * server non risponde la pagina resta identica, nessuna attesa è visibile, e il pulsante si
 * lascia premere ancora. Un secondo clic è un secondo acquisto — a cinque centesimi per
 * azienda, un lotto da venticinque costa 1,25 € e chi non vede succedere niente clicca di
 * nuovo, che è la cosa più naturale del mondo. Il pulsante di ACCESSO, che non costa nulla,
 * si disabilitava già durante l'invio; questo no.
 *
 * PERCHÉ NON `useFormStatus`. Quel gancio vuole un modulo con un'azione React; qui è un
 * `<form method="get">` di un componente server, perché la ricerca vive nell'indirizzo e
 * dev'essere condivisibile e ripetibile.
 *
 * PERCHÉ IL DISABILITARE È DIFFERITO, e questa riga è costata una prova rossa.
 *
 * Disabilitare il pulsante che sta inviando fa ANNULLARE l'invio al browser: il collaudo ha
 * cliccato «Dammi l'elenco» e non è arrivata nessuna tabella, perché la navigazione non è
 * mai partita. Spostare l'ascolto da `onClick` all'evento `submit` non basta — l'evento
 * scatta prima che il browser cominci davvero — quindi lo spegnimento si rimanda al giro
 * successivo del ciclo di eventi, quando la richiesta è già in volo.
 *
 * `event.submitter` distingue QUESTO pulsante dall'altro dello stesso modulo: il conteggio
 * è gratuito, e scrivergli sopra «acquisto in corso» sarebbe una bugia sul denaro.
 */
export function BottoneElenco({ etichetta }: { etichetta: string }) {
  const [inCorso, setInCorso] = useState(false);
  const riferimento = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const modulo = riferimento.current?.form;
    if (!modulo) return undefined;

    const allInvio = (evento: SubmitEvent): void => {
      if (evento.submitter !== riferimento.current) return;
      // Zero millisecondi, ma un giro dopo: la navigazione è cominciata e spegnere il
      // pulsante non la può più annullare.
      setTimeout(() => setInCorso(true), 0);
    };

    modulo.addEventListener('submit', allInvio);
    return () => modulo.removeEventListener('submit', allInvio);
  }, []);

  return (
    <button
      ref={riferimento}
      type="submit"
      name="scarica"
      value="1"
      data-testid="scarica-elenco"
      disabled={inCorso}
      // Chi usa un lettore di schermo deve sentire che l'acquisto è partito: senza, per lui
      // non è cambiato niente, ed è esattamente il caso in cui si riprova.
      aria-live="polite"
      className="rounded bg-azione px-5 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {inCorso ? 'Acquisto in corso…' : etichetta}
    </button>
  );
}
