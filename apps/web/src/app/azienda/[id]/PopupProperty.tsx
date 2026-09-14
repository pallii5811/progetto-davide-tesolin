'use client';

import { useId, useRef, useState } from 'react';
import type { ProtezioniDto } from '@/lib/api';

type Property = ProtezioniDto['property'];

/** Con la virgola, come il resto della scheda; interi senza decimali, gli altri al centesimo. */
function numeroIt(valore: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: Number.isInteger(valore) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valore);
}

const CENTRO_X = 100;
const CENTRO_Y = 100;
const RAGGIO = 78;

/** Al centesimo di unità: invisibile a occhio, e uguale sul server e nel browser. */
const alCentesimo = (valore: number): number => Math.round(valore * 100) / 100;

/**
 * La posizione di un punteggio da 1 a 7 sul semicerchio: 1 a sinistra, 7 a destra.
 *
 * Arrotondata, e non per estetica. Seno e coseno danno l'ultima cifra diversa fra il Node del
 * server e il Chrome del browser — 22,593612044262784 contro 22,59361204426277 — e React, che
 * confronta gli attributi disegnati dal server con quelli del browser, scriveva un errore di
 * idratazione in console su ogni scheda. Sette collaudi l'hanno fermato il 14/09/2026.
 */
function punto(valore: number, raggio: number): { x: number; y: number } {
  const angolo = Math.PI - ((valore - 1) / 6) * Math.PI;
  return {
    x: alCentesimo(CENTRO_X + raggio * Math.cos(angolo)),
    y: alCentesimo(CENTRO_Y - raggio * Math.sin(angolo)),
  };
}

/**
 * Una lancetta semicircolare da 1 a 7, dal verde al rosso, come nella slide di Luca.
 *
 * I colori sono quelli della scala di gravità del tema (basso → critico), così seguono anche il
 * tema scuro. Senza punteggio l'ago non si disegna e l'arco resta grigio: un ago appoggiato
 * sull'1 direbbe «rischio minimo», che è un'affermazione, non un'assenza.
 */
export function Lancetta({
  valore,
  etichetta,
  grande = false,
}: {
  valore: number | null;
  etichetta: string;
  grande?: boolean;
}) {
  const id = useId();
  const ago = valore === null ? null : punto(Math.min(7, Math.max(1, valore)), RAGGIO - 22);
  return (
    <svg
      viewBox="0 0 200 128"
      role="img"
      aria-label={
        valore === null ? `${etichetta}: non calcolabile` : `${etichetta}: ${numeroIt(valore)} su 7`
      }
      className={grande ? 'mx-auto w-64 max-w-full' : 'mx-auto w-36 max-w-full'}
    >
      <defs>
        <linearGradient id={`${id}-scala`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--color-basso)' }} />
          <stop offset="35%" style={{ stopColor: 'var(--color-moderato)' }} />
          <stop offset="60%" style={{ stopColor: 'var(--color-rilevante)' }} />
          <stop offset="80%" style={{ stopColor: 'var(--color-alto)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-critico)' }} />
        </linearGradient>
      </defs>
      <path
        d={`M ${CENTRO_X - RAGGIO} ${CENTRO_Y} A ${RAGGIO} ${RAGGIO} 0 0 1 ${CENTRO_X + RAGGIO} ${CENTRO_Y}`}
        fill="none"
        stroke={valore === null ? 'var(--color-bordo-forte)' : `url(#${id}-scala)`}
        strokeWidth="16"
      />
      {[1, 2, 3, 4, 5, 6, 7].map((n) => {
        const p = punto(n, RAGGIO + 16);
        return (
          <text key={n} x={p.x} y={p.y + 4} textAnchor="middle" className="fill-testo-tenue text-[11px]">
            {n}
          </text>
        );
      })}
      {ago !== null && (
        <line
          data-ago
          x1={CENTRO_X}
          y1={CENTRO_Y}
          x2={ago.x}
          y2={ago.y}
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-testo"
        />
      )}
      <circle cx={CENTRO_X} cy={CENTRO_Y} r="6" className="fill-testo" />
      <text
        x={CENTRO_X}
        y={CENTRO_Y + 24}
        textAnchor="middle"
        className="fill-testo text-[15px] font-semibold"
      >
        {valore === null ? 'non calcolabile' : numeroIt(valore)}
      </text>
    </svg>
  );
}

/**
 * Il popup del Property Risk: una lancetta con il totale, quattro con i rischi, il tipo di sito.
 *
 * Richiesta di Simone del 14/09/2026, sulla slide di Luca. Si apre da due punti — il riquadro in
 * testa alla scheda e il pulsante accanto al titolo della sezione — con lo stesso contenuto.
 *
 * `<dialog>` nativo e `showModal`: il browser porta il fuoco dentro, lo trattiene, chiude con Esc e
 * rende inerte la pagina sotto. Scriverlo a mano sono cinque difetti di accessibilità in attesa.
 *
 * I numeri sono quelli del motore, voce per voce: il popup non calcola niente.
 */
export function PopupProperty({
  property,
  innesco,
}: {
  property: Property;
  innesco: 'riquadro' | 'pulsante';
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitolo = useId();
  const idSede = useId();
  const piuEsposta = Math.max(
    0,
    property.ubicazioni.findIndex((u) => u.etichetta === property.ubicazioneDiRiferimento),
  );
  const [indice, setIndice] = useState(piuEsposta);

  const sede = property.ubicazioni[indice] ?? property.ubicazioni[0];
  if (sede === undefined) return null;

  const apri = (): void => {
    setIndice(piuEsposta);
    dialogo.current?.showModal();
  };
  const chiudi = (): void => dialogo.current?.close();

  const rischi = [
    {
      titolo: 'Rischio evento fiamme o esplosione',
      valore: sede.punteggi.attivita,
      didascalia: 'dall’attività dell’impresa',
    },
    { titolo: 'Attività sismica', valore: sede.punteggi.terremoto, didascalia: sede.didascalie.terremoto },
    { titolo: 'Rischio alluvione', valore: sede.punteggi.alluvione, didascalia: sede.didascalie.alluvione },
    { titolo: 'Rischio frana', valore: sede.punteggi.frana, didascalia: sede.didascalie.frana },
  ];

  return (
    <>
      {innesco === 'riquadro' ? (
        <button
          type="button"
          onClick={apri}
          aria-haspopup="dialog"
          aria-label="Property Risk: apri le lancette dei punteggi"
          data-testid="apri-popup-property"
          className="absolute inset-0 cursor-pointer rounded-lg transition hover:bg-marchio/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marchio"
        />
      ) : (
        <button
          type="button"
          onClick={apri}
          aria-haspopup="dialog"
          className="shrink-0 rounded border border-bordo-forte px-3 py-1.5 text-xs font-medium transition hover:border-marchio"
        >
          Vedi le lancette
        </button>
      )}

      <dialog
        ref={dialogo}
        aria-labelledby={idTitolo}
        data-testid="popup-property"
        // Un clic sullo sfondo arriva al dialog stesso, non a un suo figlio: è il segnale per chiudere.
        onClick={(evento) => {
          if (evento.target === dialogo.current) chiudi();
        }}
        className="m-auto w-[min(48rem,calc(100vw-2rem))] rounded-xl border border-bordo bg-superficie p-0 text-testo backdrop:bg-black/50"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={idTitolo} className="text-lg font-semibold tracking-tight">
                Property Risk
              </h2>
              {/* Con più sedi la sede la dice il menu qui sotto: ripeterla sotto il titolo è la stessa riga due volte. */}
              {property.ubicazioni.length === 1 && (
                <p className="mt-0.5 text-sm text-testo-tenue">{sede.etichetta}</p>
              )}
            </div>
            <button
              type="button"
              onClick={chiudi}
              aria-label="Chiudi"
              className="rounded px-2 py-1 text-lg leading-none text-testo-tenue hover:text-testo"
            >
              ✕
            </button>
          </div>

          {property.ubicazioni.length > 1 && (
            <label htmlFor={idSede} className="mt-3 block text-xs text-testo-tenue">
              Sede
              <select
                id={idSede}
                value={indice}
                onChange={(evento) => setIndice(Number(evento.target.value))}
                className="mt-1 block w-full rounded border border-bordo-forte bg-fondo px-2 py-1.5 text-sm text-testo"
              >
                {property.ubicazioni.map((u, i) => (
                  <option key={u.id} value={i}>
                    {u.etichetta}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-4">
            <Lancetta valore={sede.punteggio} etichetta="Property Risk" grande />
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {rischi.map((r) => (
              <li key={r.titolo} className="text-center">
                <Lancetta valore={r.valore} etichetta={r.titolo} />
                <p className="mt-1 text-sm font-medium leading-snug">{r.titolo}</p>
                <p className="mt-0.5 text-xs leading-snug text-testo-tenue">{r.didascalia}</p>
              </li>
            ))}
          </ul>

          <p className="mt-5 border-t border-bordo pt-3 text-xs leading-relaxed text-testo-tenue">
            Tipo di sito{' '}
            <strong className="font-medium text-testo">
              {sede.punteggi.tipoDiSito === null ? 'non calcolabile' : numeroIt(sede.punteggi.tipoDiSito)}
            </strong>
            , pesa il 20%. Pericoli naturali{' '}
            <strong className="font-medium text-testo">
              {sede.punteggi.pericoliNaturali === null
                ? 'non calcolabili'
                : numeroIt(sede.punteggi.pericoliNaturali)}
            </strong>
            , pesano il 50%; l’attività pesa il 30%. Il calcolo per esteso è nella sezione Property Risk.
          </p>
        </div>
      </dialog>
    </>
  );
}
