'use client';

import { useState, useTransition } from 'react';
import { Rotella } from '@/components/Rotella';
import { cambiaTettoTotale } from './actions';

/** Centesimi in euro all'italiana: 500 → «5,00». */
function euro(centesimi: number): string {
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/**
 * «5», «5,00», «5.5» → centesimi; vuoto → `null` (nessun tetto); altro → `undefined` (non valido).
 * Si accetta la virgola perché è quella che un italiano scrive, e il punto perché capita.
 */
function centesimiDa(testo: string): number | null | undefined {
  const pulito = testo.trim().replace(/\s|€/g, '');
  if (pulito === '') return null;
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(pulito)) return undefined;
  return Math.round(Number(pulito.replace(',', '.')) * 100);
}

/**
 * Il tetto di spesa complessivo di uno studio, e quanto ha già speso.
 *
 * Nasce per gli account di prova (19/09/2026: «in totale può usare massimo 5 euro»): il gestore
 * lo legge sulla riga dello studio e lo cambia sul posto. Vuoto vuol dire nessun tetto, cioè lo
 * studio spende come tutti gli altri, entro il solo tetto giornaliero.
 */
export function TettoTotale({
  id,
  denominazione,
  tettoCentesimi,
  spesoCentesimi,
}: {
  id: string;
  denominazione: string;
  tettoCentesimi: number | null;
  spesoCentesimi: number;
}) {
  const [aperto, setAperto] = useState(false);
  const [valore, setValore] = useState(tettoCentesimi === null ? '' : euro(tettoCentesimi));
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  const salva = () => {
    const centesimi = centesimiDa(valore);
    if (centesimi === undefined) {
      setErrore('Scrivi un importo in euro, per esempio 5 o 5,00; vuoto per nessun tetto.');
      return;
    }
    setErrore(null);
    avvia(async () => {
      if (await cambiaTettoTotale(id, centesimi)) setAperto(false);
      else setErrore('Tetto non salvato: il servizio non ha risposto come doveva. Riprova.');
    });
  };

  return (
    <div className="min-w-[12rem] text-xs">
      {/* Gli importi non si spezzano: «0,00» su una riga e «€» sotto si legge male. */}
      <p className="tabular leading-relaxed text-testo-tenue">
        <span className="whitespace-nowrap">{euro(spesoCentesimi)} € spesi</span>
        {tettoCentesimi === null ? (
          <span className="whitespace-nowrap text-testo-debole"> · nessun tetto</span>
        ) : (
          <>
            {' '}
            <span className="whitespace-nowrap">
              su <strong className="font-semibold text-testo">{euro(tettoCentesimi)} €</strong>
            </span>
            {spesoCentesimi >= tettoCentesimi && (
              <span className="ml-1.5 whitespace-nowrap rounded-full border border-attenzione/40 bg-attenzione-fondo px-2 py-0.5 font-medium text-attenzione">
                esaurito
              </span>
            )}
          </>
        )}
      </p>
      {aperto ? (
        <form
          className="mt-1.5 flex items-center gap-1.5"
          onSubmit={(evento) => {
            evento.preventDefault();
            salva();
          }}
        >
          <label className="sr-only" htmlFor={`tetto-${id}`}>
            Tetto di spesa totale di {denominazione}, in euro
          </label>
          <input
            id={`tetto-${id}`}
            inputMode="decimal"
            value={valore}
            onChange={(evento) => setValore(evento.target.value)}
            placeholder="nessuno"
            aria-invalid={errore === null ? undefined : true}
            aria-describedby={errore === null ? undefined : `tetto-${id}-errore`}
            className="tabular w-20 rounded-lg border border-bordo-forte bg-superficie px-2 py-1 text-xs transition focus:border-marchio"
          />
          <span className="text-testo-debole">€</span>
          <button
            type="submit"
            disabled={inCorso}
            aria-busy={inCorso}
            className="inline-flex items-center gap-1 rounded-full bg-azione px-2.5 py-1 font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
          >
            {inCorso && <Rotella className="h-3 w-3" />}
            Salva
          </button>
          <button
            type="button"
            onClick={() => {
              setAperto(false);
              setErrore(null);
              setValore(tettoCentesimi === null ? '' : euro(tettoCentesimi));
            }}
            className="rounded-full px-2 py-1 text-testo-tenue transition hover:text-testo"
          >
            Annulla
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="mt-1 rounded-full text-marchio underline-offset-2 hover:underline"
        >
          {tettoCentesimi === null ? 'Imposta un tetto' : 'Cambia il tetto'}
        </button>
      )}
      {errore !== null && (
        <p id={`tetto-${id}-errore`} role="alert" className="mt-1 text-critico">
          {errore}
        </p>
      )}
    </div>
  );
}
