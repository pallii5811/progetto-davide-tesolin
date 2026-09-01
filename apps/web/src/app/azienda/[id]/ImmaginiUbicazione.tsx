'use client';

import { useState, useTransition } from 'react';
import { caricaImmagineAzione, rimuoviImmagineAzione } from './actions';
import type { ImmagineUbicazioneDto } from '@/lib/api';

/*
  I limiti sono dichiarati **dall'API**, che è l'autorità: qui servono solo a dare un
  messaggio utile prima di caricare invano un file da dieci megabyte su una linea lenta.
  Se divergono, vince il server — e chi carica riceve comunque un rifiuto comprensibile.
*/
const LIMITE_BYTE = 1024 * 1024;
const MAX_PER_UBICAZIONE = 6;
const TIPI_AMMESSI = ['image/jpeg', 'image/png', 'image/webp'];

interface UbicazioneMinima {
  readonly id: string;
  readonly etichetta: string;
}

/**
 * Fotografie di sopralluogo, per ubicazione.
 *
 * Un capannone si descrive male a parole: struttura portante, copertura, distanza dal
 * confine, ordine del piazzale sono cose che un assuntore legge in due secondi da una
 * fotografia e che nessun questionario riesce a farsi raccontare. Finiscono nel report,
 * accanto all'ubicazione a cui appartengono.
 */
export function ImmaginiUbicazione({
  identificativo,
  ubicazioni,
  immagini,
}: {
  identificativo: string;
  ubicazioni: readonly UbicazioneMinima[];
  immagini: readonly ImmagineUbicazioneDto[];
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  if (ubicazioni.length === 0) return null;

  async function carica(ubicazioneId: string, file: File, didascalia: string): Promise<void> {
    setErrore(null);

    if (!TIPI_AMMESSI.includes(file.type)) {
      setErrore('Formati ammessi: JPEG, PNG, WebP.');
      return;
    }
    /*
      Il peso si controlla **prima** di leggere il file. Un data URI cresce di circa un
      terzo: verificare dopo la conversione significherebbe caricare in memoria dieci
      megabyte per poi scartarli, e su una macchina lenta la pagina si blocca prima di
      riuscire a dirlo.
    */
    if (file.size > LIMITE_BYTE) {
      setErrore(
        // `toFixed` scriverebbe «1.5 MB» in un messaggio che il resto della pagina
        // circonda di virgole: è la stessa classe di difetto di «PD 12 mesi 3.00%».
        `L'immagine pesa ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(file.size / (1024 * 1024))} MB: il massimo è ${LIMITE_BYTE / (1024 * 1024)} MB.`,
      );
      return;
    }

    const dati = await new Promise<string | null>((risolvi) => {
      const lettore = new FileReader();
      lettore.onload = () => {
        // `readAsDataURL` produce sempre una stringa, ma il tipo ammette anche un
        // ArrayBuffer: convertirlo con String() darebbe «[object ArrayBuffer]» dentro un
        // attributo `src` — un guasto silenzioso invece di un errore.
        risolvi(typeof lettore.result === 'string' ? lettore.result : null);
      };
      lettore.onerror = () => {
        risolvi(null);
      };
      lettore.readAsDataURL(file);
    });

    if (dati === null) {
      setErrore('Non è stato possibile leggere il file.');
      return;
    }

    avvia(() => {
      void caricaImmagineAzione(identificativo, {
        ubicazioneId,
        didascalia: didascalia.trim() === '' ? null : didascalia.trim(),
        tipoMime: file.type,
        dati,
      }).then((esito) => {
        if (!esito.ok) setErrore(esito.messaggio);
      });
    });
  }

  function rimuovi(immagineId: string): void {
    setErrore(null);
    avvia(() => {
      void rimuoviImmagineAzione(identificativo, immagineId).then((esito) => {
        if (!esito.ok) setErrore(esito.messaggio);
      });
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Fotografie delle ubicazioni</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-testo-tenue">
          Struttura, copertura, vicinanze, ordine del piazzale: quello che un assuntore incendio chiede e
          che nessun questionario riesce a descrivere. Compaiono nel report, accanto alla propria
          ubicazione. Massimo {MAX_PER_UBICAZIONE} per ubicazione, {LIMITE_BYTE / (1024 * 1024)} MB
          ciascuna.
        </p>
      </div>

      {errore !== null && <p className="text-sm text-critico">{errore}</p>}

      {ubicazioni.map((u) => {
        const sue = immagini.filter((i) => i.ubicazioneId === u.id);
        return (
          <Blocco
            key={u.id}
            ubicazione={u}
            immagini={sue}
            inCorso={inCorso}
            onCarica={carica}
            onRimuovi={rimuovi}
          />
        );
      })}
    </div>
  );
}

function Blocco({
  ubicazione,
  immagini,
  inCorso,
  onCarica,
  onRimuovi,
}: {
  ubicazione: UbicazioneMinima;
  immagini: readonly ImmagineUbicazioneDto[];
  inCorso: boolean;
  onCarica: (ubicazioneId: string, file: File, didascalia: string) => Promise<void>;
  onRimuovi: (immagineId: string) => void;
}) {
  const [didascalia, setDidascalia] = useState('');
  const pieno = immagini.length >= MAX_PER_UBICAZIONE;

  return (
    <div className="rounded-lg border border-bordo bg-superficie p-3">
      <p className="text-sm font-medium">{ubicazione.etichetta}</p>

      {immagini.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {immagini.map((i) => (
            <li key={i.id} className="w-40">
              {/* Data URI locale: nulla da ottimizzare, e `next/image` vuole un dominio noto. */}
              <img
                src={i.dati}
                alt={i.didascalia ?? `Fotografia di ${ubicazione.etichetta}`}
                className="h-28 w-40 rounded border border-bordo object-cover"
              />
              <p className="mt-1 text-xs leading-snug text-testo-tenue">
                {i.didascalia ?? <span className="italic">senza didascalia</span>}
              </p>
              <button
                type="button"
                disabled={inCorso}
                onClick={() => {
                  onRimuovi(i.id);
                }}
                className="mt-0.5 text-xs text-testo-tenue underline hover:text-critico disabled:opacity-50"
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      )}

      {pieno ? (
        <p className="mt-2 text-xs text-testo-debole">
          Raggiunto il massimo di {MAX_PER_UBICAZIONE} immagini. Rimuoverne una per aggiungerne
          un&apos;altra.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/*
            Etichette esplicite su entrambi i campi, e ripetute per ogni ubicazione.

            Il campo file non ne aveva alcuna e il collaudo di accessibilità l'ha respinto:
            per chi naviga con un lettore di schermo era «pulsante», senza dire di quale
            sede. Il segnaposto non basta come etichetta — sparisce appena si scrive — ed è
            il motivo per cui anche la didascalia ne ha una propria.
          */}
          <input
            type="text"
            value={didascalia}
            onChange={(e) => {
              setDidascalia(e.target.value);
            }}
            maxLength={200}
            placeholder="Didascalia — cosa mostra"
            aria-label={`Didascalia della prossima fotografia di ${ubicazione.etichetta}`}
            className="min-w-[16rem] flex-1 rounded border border-bordo bg-fondo px-2 py-1.5 text-sm"
          />
          <input
            type="file"
            accept={TIPI_AMMESSI.join(',')}
            aria-label={`Scegli una fotografia per ${ubicazione.etichetta}`}
            disabled={inCorso}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file === undefined) return;
              void onCarica(ubicazione.id, file, didascalia).then(() => {
                setDidascalia('');
              });
              // Azzerare il campo permette di ricaricare lo stesso file dopo un errore:
              // senza, il browser non emette un secondo evento per la stessa scelta.
              e.target.value = '';
            }}
            className="block text-sm text-testo-tenue file:mr-3 file:rounded file:border-0 file:bg-azione file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-azione-testo hover:file:opacity-90 disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}
