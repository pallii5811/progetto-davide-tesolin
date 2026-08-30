'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { eAttiva } from '@/lib/voce-attiva';

/**
 * Il menu principale, e quale voce è aperta.
 *
 * Le cinque voci erano identiche fra loro in ogni schermata: nessuna diceva dove ci si
 * trovasse, né a chi guarda né a chi ascolta. In tutto il prodotto `aria-current`
 * compariva in due punti, e nessuno dei due era una navigazione — quindi un lettore di
 * schermo annunciava cinque collegamenti indistinguibili, e chi vede doveva dedurre la
 * posizione dal titolo della pagina.
 *
 * È un componente a parte, e di client, perché il percorso corrente si legge solo lì:
 * `layout.tsx` gira sul server e riceve i figli già risolti, senza sapere quale rotta li
 * ha prodotti.
 *
 * `aria-current="page"` e non `aria-current="true"`: è la voce che porta alla **pagina**
 * aperta, e i lettori di schermo lo annunciano come «pagina corrente» invece che come un
 * generico «corrente».
 */
const VOCI: readonly { readonly href: string; readonly testo: string }[] = [
  { href: '/', testo: 'Ricerca' },
  { href: '/prospect', testo: 'Nuovi clienti' },
  { href: '/portafoglio', testo: 'Portafoglio' },
  { href: '/monitoraggio', testo: 'Monitoraggio' },
  { href: '/catalogo', testo: 'Catalogo rischi' },
];

export function NavigazionePrincipale() {
  const percorso = usePathname();

  return (
    // `flex-wrap`: a 390 pixel le cinque voci non stanno su una riga, e senza andavano
    // fuori schermo trascinandosi dietro l'intera pagina.
    <nav aria-label="Principale" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-testo-tenue">
      {VOCI.map((voce) => {
        const attiva = eAttiva(percorso, voce.href);
        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-current={attiva ? 'page' : undefined}
            /*
              Il segno visibile non è solo il colore: chi non distingue il grigio dal nero
              non vedrebbe nulla. Il sottolineato lo rende una differenza di forma.
            */
            className={
              attiva
                ? 'rounded font-medium text-testo underline decoration-marchio decoration-2 underline-offset-4'
                : 'rounded hover:text-testo'
            }
          >
            {voce.testo}
          </Link>
        );
      })}
    </nav>
  );
}
