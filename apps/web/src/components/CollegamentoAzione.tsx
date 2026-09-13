'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Rotella } from './Rotella';

/**
 * Un collegamento con l'aspetto di un pulsante, che mostra di aver ricevuto il clic.
 *
 * ── PERCHÉ NON BASTAVA `loading.tsx` ─────────────────────────────────────────
 *
 * La scheda un segno d'attesa ce l'ha, ma compare solo entrando nella rotta. «Analisi
 * approfondita» porta alla STESSA pagina con «?approfondita=1»: Next la ricarica dentro una
 * transizione, e React tiene a schermo la versione vecchia finché la nuova non è pronta.
 * Nessuno scheletro, nessun cambiamento — e il tempo è quello in cui il server compra.
 *
 * `useLinkStatus` dice se la navigazione partita da QUESTO collegamento è in corso, e la
 * rotella compare solo lì: non sugli altri pulsanti della riga, che non sono stati premuti.
 *
 * ── IL SECONDO CLIC ──────────────────────────────────────────────────────────
 *
 * Mentre la pagina arriva il collegamento non accetta altri clic: la classe `has-[…]` spegne
 * i puntatori quando dentro c'è la rotella. Su «Verifica protesti e procedure» un secondo
 * clic partito prima che il primo abbia registrato l'acquisto è una seconda richiesta al
 * fornitore.
 *
 * Il collegamento resta un collegamento vero: senza JavaScript funziona, si apre in una
 * nuova scheda con il tasto centrale, e l'indirizzo resta condivisibile.
 */
type Proprieta = Omit<ComponentProps<typeof Link>, 'children' | 'className'> & {
  children: ReactNode;
  className?: string | undefined;
  /** Ciò che sente chi usa un lettore di schermo mentre la pagina arriva. */
  inAttesa?: string | undefined;
};

export function CollegamentoAzione({
  children,
  className = '',
  inAttesa = 'Caricamento in corso',
  ...resto
}: Proprieta) {
  return (
    <Link
      {...resto}
      className={`inline-flex items-center gap-1.5 has-[[data-rotella]]:pointer-events-none has-[[data-rotella]]:opacity-80 ${className}`}
    >
      <StatoDelCollegamento inAttesa={inAttesa}>{children}</StatoDelCollegamento>
    </Link>
  );
}

function StatoDelCollegamento({ children, inAttesa }: { children: ReactNode; inAttesa: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending && <Rotella />}
      <span>{children}</span>
      {pending && (
        <span role="status" className="sr-only">
          {inAttesa}
        </span>
      )}
    </>
  );
}

/**
 * La sola rotella, per i collegamenti che non hanno l'aspetto di un pulsante: le voci del
 * menu e le schede delle impostazioni. Va messa DENTRO il collegamento, perché
 * `useLinkStatus` legge il collegamento che la contiene.
 */
export function AttesaDelCollegamento() {
  const { pending } = useLinkStatus();
  return pending ? <Rotella className="ml-1.5 h-3 w-3 align-[-1px]" /> : null;
}
