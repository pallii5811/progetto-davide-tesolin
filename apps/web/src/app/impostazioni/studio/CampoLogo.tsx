'use client';

import { useState } from 'react';

/**
 * Il logo dello studio.
 *
 * Il report è il documento che l'intermediario consegna al proprio cliente e su cui mette
 * la faccia: senza il suo marchio resta lo stampato di un fornitore. È la prima cosa che le
 * piattaforme concorrenti mettono in vetrina — «report personalizzati con il tuo brand» — e
 * costa una manciata di righe.
 *
 * La conversione in data URI avviene **qui**, nel browser, dove il file c'è. Mandare il
 * file grezzo al server richiederebbe multipart su tutta la catena — modulo, azione, API —
 * per un'immagine che pesa quanto un'icona.
 */
const LIMITE_BYTE = 512 * 1024;
const TIPI_AMMESSI = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function CampoLogo({ iniziale }: { iniziale: string | null }) {
  const [logo, setLogo] = useState(iniziale ?? '');
  const [errore, setErrore] = useState<string | null>(null);

  // Non è asincrona: `FileReader` lavora a richiami, non a promesse. Dichiararla `async`
  // senza mai attendere nulla prometteva un'attesa che non c'era.
  function carica(file: File): void {
    setErrore(null);

    if (!TIPI_AMMESSI.includes(file.type)) {
      setErrore('Formati ammessi: PNG, JPEG, WebP, SVG.');
      return;
    }
    /*
      Il controllo sulla dimensione è **prima** della lettura, non dopo.

      Un data URI in base64 cresce di circa un terzo rispetto al file: verificare dopo la
      conversione significherebbe caricare in memoria un file da dieci megabyte per poi
      scartarlo, e su una macchina lenta la pagina si blocca prima di dirlo.
    */
    if (file.size > LIMITE_BYTE) {
      setErrore(`L’immagine supera i ${Math.round(LIMITE_BYTE / 1024)} KB. Ridurla e riprovare.`);
      return;
    }

    const lettore = new FileReader();
    lettore.onload = () => {
      // `readAsDataURL` produce sempre una stringa, ma il tipo ammette anche un
      // ArrayBuffer: convertirlo con String() darebbe «[object ArrayBuffer]» dentro un
      // attributo `src`, cioè un logo rotto invece di un errore.
      if (typeof lettore.result === 'string') setLogo(lettore.result);
      else setErrore('Non è stato possibile leggere il file.');
    };
    lettore.onerror = () => setErrore('Non è stato possibile leggere il file.');
    lettore.readAsDataURL(file);
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
        Logo dello studio
      </span>

      {/* Il valore vero viaggia qui: il campo file non fa parte dell'invio. */}
      <input type="hidden" name="logo" value={logo} />

      <div className="flex flex-wrap items-center gap-4">
        {logo === '' ? (
          <div className="flex h-16 w-32 items-center justify-center rounded border border-dashed border-bordo-forte text-xs text-testo-debole">
            nessun logo
          </div>
        ) : (
          // Data URI locale: non c'è nulla da ottimizzare, e `next/image` richiederebbe un
          // dominio noto. (Il commento di disabilitazione che stava qui nominava una regola
          // non caricata in questa configurazione, ed era lui a far fallire il lint.)
          <img
            src={logo}
            alt="Logo attualmente impostato"
            className="h-16 w-32 rounded border border-bordo object-contain p-1"
          />
        )}

        <div className="space-y-2">
          <input
            type="file"
            accept={TIPI_AMMESSI.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) carica(file);
            }}
            className="block text-sm text-testo-tenue file:mr-3 file:rounded file:border-0 file:bg-azione file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-azione-testo hover:file:opacity-90"
          />
          {logo !== '' && (
            <button
              type="button"
              onClick={() => setLogo('')}
              className="text-xs text-testo-tenue underline hover:text-testo"
            >
              Rimuovi il logo
            </button>
          )}
        </div>
      </div>

      {errore !== null && <p className="mt-2 text-sm text-critico">{errore}</p>}

      <p className="mt-2 text-xs leading-relaxed text-testo-debole">
        Compare in testa a ogni report consegnato al cliente, accanto alla denominazione e al numero RUI.
        Massimo {Math.round(LIMITE_BYTE / 1024)} KB.
      </p>
    </div>
  );
}
