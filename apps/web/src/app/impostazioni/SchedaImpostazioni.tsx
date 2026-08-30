'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Una scheda delle impostazioni, e se è quella aperta.
 *
 * L'impalcatura del bordo attivo era già scritta — `border-b-2 border-transparent` — e non
 * veniva mai colorata: sette schede identiche fra loro, nessuna che dicesse quale si sta
 * guardando, e per chi usa un lettore di schermo sette collegamenti indistinguibili.
 *
 * Sta in un file di client perché il percorso corrente si legge solo lì: il layout delle
 * impostazioni gira sul server e riceve i figli già risolti.
 *
 * Il confronto è **esatto**. Nessuna di queste schede ha sottopagine, e un confronto per
 * prefisso accenderebbe «Il tuo accesso» — che sta su `/impostazioni` — insieme a ogni
 * altra, perché tutte cominciano così.
 */
export function SchedaImpostazioni({ href, children }: { href: string; children: React.ReactNode }) {
  const attiva = usePathname() === href;

  return (
    <Link
      href={href}
      aria-current={attiva ? 'page' : undefined}
      className={
        attiva
          ? '-mb-px shrink-0 whitespace-nowrap rounded-t border-b-2 border-marchio px-3 py-2 text-sm font-medium text-testo'
          : '-mb-px shrink-0 whitespace-nowrap rounded-t border-b-2 border-transparent px-3 py-2 text-sm text-testo-tenue transition hover:border-bordo-forte hover:text-testo'
      }
    >
      {children}
    </Link>
  );
}
