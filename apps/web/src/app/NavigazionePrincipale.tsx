'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { eAttiva } from '@/lib/voce-attiva';
import { AttesaDelCollegamento } from '@/components/CollegamentoAzione';
import { IconaCampana, IconaCrm, IconaLente } from './_vetrina/icone';

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
 *
 * Dal redesign del 18/09/2026 le forme sono due, con le stesse voci e lo stesso nome
 * «Principale»: la barra laterale su schermo largo, le pillole sotto l'intestazione su
 * telefono. Il layout ne mostra una sola per volta — l'altra è `display: none`, quindi
 * fuori anche dall'albero di accessibilità — e chi usa un lettore di schermo trova sempre
 * un menu solo.
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
const VOCI: readonly {
  readonly href: string;
  readonly testo: string;
  readonly icona: (p: { className?: string }) => React.ReactNode;
  readonly inArrivo?: true;
}[] = [
  { href: '/prospect', testo: 'Ricerca Clienti', icona: IconaLente },
  { href: '/portafoglio', testo: 'CRM', icona: IconaCrm },
  { href: '/monitoraggio', testo: 'Monitoraggio', icona: IconaCampana, inArrivo: true },
];

export function NavigazionePrincipale({ variante = 'laterale' }: { variante?: 'laterale' | 'barra' }) {
  const percorso = usePathname();
  const laterale = variante === 'laterale';

  return (
    /*
      Su telefono le voci stanno su una riga sola che scorre di lato, invece di andare a capo:
      la terza voce su una seconda riga sembrava un altro menu.
    */
    <nav
      aria-label="Principale"
      className={
        laterale
          ? 'flex flex-col gap-0.5'
          : 'flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      }
    >
      {VOCI.map((voce) => {
        const attiva = eAttiva(percorso, voce.href);
        const Icona = voce.icona;
        /*
          Il segno visibile non è solo il colore: la voce aperta ha un fondo, un'ombra e il
          peso del testo, cioè una differenza di forma che si vede anche senza distinguere i
          colori.
        */
        const classi = laterale
          ? `group flex items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] transition-colors ${
              attiva
                ? 'bg-superficie font-medium text-testo shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-bordo)]'
                : 'text-testo-tenue hover:bg-superficie/70 hover:text-testo'
            }`
          : `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] transition-colors ${
              attiva
                ? 'bg-azione font-medium text-azione-testo'
                : 'border border-bordo bg-superficie text-testo-tenue hover:text-testo'
            }`;
        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-current={attiva ? 'page' : undefined}
            className={classi}
          >
            {laterale && (
              <Icona
                className={`h-[18px] w-[18px] shrink-0 ${attiva ? 'text-marchio' : 'text-testo-debole group-hover:text-testo-tenue'}`}
              />
            )}
            <span>{voce.testo}</span>
            {/* Lo spazio è scritto: senza, il nome e l'etichetta arrivano attaccati a chi legge
                con un lettore di schermo — «Monitoraggioin arrivo». */}
            {voce.inArrivo === true && ' '}
            {voce.inArrivo === true && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${laterale ? 'ml-auto border border-bordo text-testo-debole' : 'border border-current/30'}`}
              >
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
