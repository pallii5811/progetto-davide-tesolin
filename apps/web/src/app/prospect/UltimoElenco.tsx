'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const CHIAVE = 'aegis:ultimo-elenco-prospect';

/**
 * L'elenco pagato non si perde più premendo «indietro».
 *
 * Il caso è successo davvero: cinquanta centesimi di aziende scaricate, un clic su
 * «Analizza», il tasto indietro del browser — e la schermata di ricerca vuota, senza più
 * traccia di ciò che era stato comprato. La sensazione, legittima, è di aver buttato i
 * soldi.
 *
 * Tecnicamente non erano persi: l'archivio conserva l'elenco per ventiquattro ore e
 * rifare la stessa ricerca non costa nulla. Ma «non è perso, devi solo ricomporre a
 * memoria gli stessi sette filtri» non è una risposta accettabile — e nessuno la
 * conosceva comunque.
 *
 * Qui la ricerca che ha prodotto un acquisto viene ricordata sul dispositivo, e la pagina
 * vuota offre di riaprirla. Sul dispositivo e non sul server perché è una comodità di chi
 * sta lavorando, non un dato dello studio: non ha ragione di finire in un archivio
 * condiviso né di sopravvivere all'utente che l'ha fatta.
 */
export function RicordaElenco({ query, quante }: { query: string; quante: number }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(CHIAVE, JSON.stringify({ query, quante }));
    } catch {
      // Spazio esaurito o archiviazione negata: è una comodità, non un requisito.
    }
  }, [query, quante]);

  return null;
}

export function UltimoElenco() {
  const [ultimo, setUltimo] = useState<{ query: string; quante: number } | null>(null);

  useEffect(() => {
    try {
      const grezzo = window.localStorage.getItem(CHIAVE);
      if (grezzo === null) return;
      const letto: unknown = JSON.parse(grezzo);
      if (
        typeof letto === 'object' &&
        letto !== null &&
        typeof (letto as { query?: unknown }).query === 'string' &&
        typeof (letto as { quante?: unknown }).quante === 'number'
      ) {
        setUltimo(letto as { query: string; quante: number });
      }
    } catch {
      // Contenuto illeggibile: si fa come se non ci fosse.
    }
  }, []);

  if (ultimo === null) return null;

  return (
    <div className="mb-6 rounded-lg border border-bordo bg-superficie p-4">
      <p className="text-sm">
        <strong>Hai già scaricato un elenco</strong> di {ultimo.quante}{' '}
        {ultimo.quante === 1 ? 'azienda' : 'aziende'}.{' '}
        <Link href={`/prospect?${ultimo.query}`} className="text-marchio underline">
          Riaprilo
        </Link>{' '}
        <span className="text-testo-tenue">
          — resta in archivio per ventiquattro ore e riaprirlo non consuma credito.
        </span>
      </p>
    </div>
  );
}
