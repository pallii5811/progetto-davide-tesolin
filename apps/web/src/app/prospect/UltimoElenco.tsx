'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const CHIAVE = 'aegis:ultimo-elenco-prospect';

interface ElencoRicordato {
  readonly query: string;
  readonly quante: number;
}

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
 * Qui la ricerca che ha prodotto un acquisto viene ricordata sul dispositivo, e le pagine
 * che possono riportarci offrono di riaprirla. Sul dispositivo e non sul server perché è
 * una comodità di chi sta lavorando, non un dato dello studio: non ha ragione di finire
 * in un archivio condiviso né di sopravvivere all'utente che l'ha fatta.
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

/**
 * Legge l'elenco ricordato, o `null` se non ce n'è uno leggibile.
 *
 * In un posto solo: due copie di questa lettura divergerebbero, e il giorno in cui
 * cambiasse la forma del dato una delle due pagine smetterebbe di ritrovare l'elenco
 * senza che nessuno se ne accorga.
 */
function useElencoRicordato(): ElencoRicordato | null {
  const [ultimo, setUltimo] = useState<ElencoRicordato | null>(null);

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
        setUltimo(letto as ElencoRicordato);
      }
    } catch {
      // Contenuto illeggibile: si fa come se non ci fosse.
    }
  }, []);

  return ultimo;
}

export function UltimoElenco() {
  const ultimo = useElencoRicordato();
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

/**
 * Il ritorno all'elenco, dalla scheda di un'azienda.
 *
 * Chi vaglia cinque prospect uno dopo l'altro fa cinque volte lo stesso viaggio, e finora
 * l'unica via di ritorno era il tasto «indietro» del browser: chi usava il menu si
 * ritrovava davanti al modulo di ricerca vuoto, con la sensazione di aver perso l'elenco
 * appena pagato. Non l'aveva perso — ma doveva ricomporre i filtri a memoria per
 * riottenerlo, che è quasi la stessa cosa.
 *
 * Riaprire non consuma credito: la stessa ricerca resta in archivio ventiquattro ore.
 * Vale la pena dirlo nel collegamento, perché la domanda «e se mi rifà pagare?» è la
 * ragione per cui uno non ci clicca.
 *
 * Non compare se non c'è nessun elenco ricordato: chi è arrivato qui dalla ricerca per
 * nome non ha un elenco a cui tornare, e un collegamento che riporta altrove è peggio di
 * un collegamento assente.
 */
export function RitornoAllElenco() {
  const ultimo = useElencoRicordato();
  if (ultimo === null) return null;

  return (
    <Link
      href={`/prospect?${ultimo.query}`}
      className="text-xs text-marchio hover:underline"
      title="Riaprire l’elenco non consuma credito: resta in archivio per ventiquattro ore."
    >
      ← Torna all’elenco ({ultimo.quante}{' '}
      {ultimo.quante === 1 ? 'azienda' : 'aziende'})
    </Link>
  );
}
