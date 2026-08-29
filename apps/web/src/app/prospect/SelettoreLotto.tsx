'use client';

import { useState } from 'react';

/**
 * Quante aziende scaricare, e quanto costa scaricarle.
 *
 * Era una tendina con quattro voci fisse — 10, 25, 50, 100 — e il prezzo scritto dentro
 * ciascuna. Due problemi, entrambi costati soldi veri.
 *
 * Il primo: chi ne vuole cinque, o dodici, non poteva chiederle. Su un servizio che si
 * paga a record, obbligare a comprarne venticinque quando ne servono cinque è un euro e
 * venticinque invece di venticinque centesimi, ogni volta.
 *
 * Il secondo: il prezzo stava scritto nell'etichetta della voce, quindi era un numero
 * fermo. Se il fornitore cambia tariffa, la tendina continua a dichiarare quella vecchia
 * — ed è esattamente il modo in cui su un altro pulsante è rimasto per settimane un
 * «+0,48 €» su un servizio da trenta centesimi.
 *
 * Qui il numero è libero e il prezzo si ricalcola mentre si scrive, dal costo unitario
 * che arriva dal listino del fornitore. Chi preme il pulsante ha appena letto la cifra
 * che sta per spendere.
 */
export function SelettoreLotto({
  valoreIniziale,
  centesimiPerAzienda,
  massimo,
}: {
  valoreIniziale: string;
  /** Costo di un record, dal listino: non si scrive a mano qui dentro. */
  centesimiPerAzienda: number;
  massimo: number;
}) {
  const [quante, setQuante] = useState(valoreIniziale);

  const numero = Number.parseInt(quante, 10);
  const valido = Number.isFinite(numero) && numero >= 1 && numero <= massimo;
  const costo = valido ? (numero * centesimiPerAzienda) / 100 : null;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
        Quante aziende vuoi
      </span>
      <input
        type="number"
        name="limite"
        min={1}
        max={massimo}
        step={1}
        value={quante}
        onChange={(e) => setQuante(e.target.value)}
        className="tabular w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio"
      />
      <span className="mt-1 block text-xs text-testo-tenue">
        {costo === null ? (
          <>Da 1 a {massimo}.</>
        ) : (
          <>
            Costo dell&apos;elenco:{' '}
            <strong className="tabular text-testo">{costo.toFixed(2).replace('.', ',')} €</strong> ·{' '}
            {(centesimiPerAzienda / 100).toFixed(2).replace('.', ',')} € ad azienda
          </>
        )}
      </span>
    </label>
  );
}
