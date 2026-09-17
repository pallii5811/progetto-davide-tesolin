'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { eAttiva } from '@/lib/voce-attiva';
import { AttesaDelCollegamento } from '@/components/CollegamentoAzione';

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
/*
  Tre voci, e la terza dichiara di non essere pronta.

  «Ricerca» non c'è più dal 13/09/2026: la ricerca per partita IVA vive dentro «Ricerca
  Clienti», come sezione a parte, e «/» rinvia lì. «Nuovi clienti» si chiama «Ricerca
  Clienti» e «Portafoglio» si chiama «CRM» dal 17/09/2026 («AEGIS - cambi.pptx»). Catalogo
  rischi e Importa elenco clienti restano tolti: i loro indirizzi rinviano al CRM
  (next.config.mjs), così un segnalibro non finisce su un 404.

  Monitoraggio è tornato il 18/09/2026, su richiesta di Simone, come voce con l'etichetta «in
  arrivo»: la pagina dice cosa farà e che oggi non lo fa. L'etichetta sta DENTRO il collegamento,
  quindi chi usa un lettore di schermo la sente insieme al nome — «Monitoraggio in arrivo» — e
  non scopre solo dopo il clic che la funzione non c'è.
*/
const VOCI: readonly { readonly href: string; readonly testo: string; readonly inArrivo?: true }[] = [
  { href: '/prospect', testo: 'Ricerca Clienti' },
  { href: '/portafoglio', testo: 'CRM' },
  { href: '/monitoraggio', testo: 'Monitoraggio', inArrivo: true },
];

export function NavigazionePrincipale() {
  const percorso = usePathname();

  return (
    // `flex-wrap`: a 390 pixel le voci del menu non stavano su una riga, e senza andavano
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
            {/* Lo spazio è scritto: senza, il nome e l'etichetta arrivano attaccati a chi legge
                con un lettore di schermo — «Monitoraggioin arrivo». */}
            {voce.inArrivo === true && ' '}
            {voce.inArrivo === true && (
              <span className="ml-1.5 rounded-full border border-bordo px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-testo-tenue">
                in arrivo
              </span>
            )}
            <AttesaDelCollegamento />
          </Link>
        );
      })}
    </nav>
  );
}
