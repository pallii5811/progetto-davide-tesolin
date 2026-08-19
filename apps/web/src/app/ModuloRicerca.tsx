'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Il modulo di ricerca.
 *
 * Era un `<form method="get">` puro, e su un servizio a pagamento è stato un errore caro.
 * Il browser navigava, l'archivio camerale rispondeva in qualche secondo, e in quei
 * secondi la pagina restava identica: nessuna animazione, nessun pulsante spento, niente.
 * Sembrava rotta. Chi la usava rifaceva clic — e la seconda ricerca **veniva pagata come
 * la prima**, perché partiva prima che la risposta della prima arrivasse in cache.
 *
 * Non è una raffinatezza estetica: l'assenza di un segnale di attesa costava denaro a ogni
 * clic ripetuto. Qui il pulsante dichiara che sta lavorando e **si rifiuta di ripartire**
 * finché non ha finito.
 */
export function ModuloRicerca({
  denominazione,
  partitaIva,
  aPagamento,
}: {
  denominazione: string;
  partitaIva: string;
  /** Sui dati reali il pulsante dice anche quanto sta per costare: si decide prima. */
  aPagamento: boolean;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [q, setQ] = useState(denominazione);
  const [piva, setPiva] = useState(partitaIva);

  const vuoto = q.trim() === '' && piva.trim() === '';

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        if (vuoto || inCorso) return;

        const parametri = new URLSearchParams();
        if (q.trim() !== '') parametri.set('q', q.trim());
        if (piva.trim() !== '') parametri.set('piva', piva.trim());

        // `useTransition` tiene `inCorso` vero finché il server non ha finito di
        // costruire la pagina: è l'unico modo di sapere davvero quando la ricerca è
        // conclusa, invece di indovinarlo con un tempo fisso.
        avvia(() => router.push(`/?${parametri.toString()}`));
      }}
      className="grid gap-4 sm:grid-cols-[2fr_1fr_auto]"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
          Denominazione
        </span>
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={inCorso}
          placeholder="Ragione sociale, anche parziale"
          className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
          Partita IVA
        </span>
        <input
          type="text"
          name="piva"
          inputMode="numeric"
          value={piva}
          onChange={(e) => setPiva(e.target.value)}
          disabled={inCorso}
          placeholder="11 cifre"
          className="tabular w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={inCorso || vuoto}
        // `aria-busy` e il testo che cambia: chi usa un lettore di schermo non vede
        // l'animazione, e resterebbe senza alcun segnale che qualcosa sta accadendo.
        aria-busy={inCorso}
        data-testid="pulsante-cerca"
        className="flex items-center justify-center gap-2 self-end rounded bg-azione px-5 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {inCorso && (
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {inCorso ? 'Interrogazione…' : 'Cerca'}
      </button>

      {inCorso && aPagamento && (
        <p
          role="status"
          className="text-xs text-testo-tenue sm:col-span-3"
        >
          Interrogazione degli archivi camerali in corso. Può richiedere qualche secondo:
          attendere invece di ripetere la ricerca, perché ogni interrogazione viene pagata.
        </p>
      )}
    </form>
  );
}
