'use client';

import { useEffect, useState } from 'react';

/**
 * L'indice delle sezioni della scheda, fissato in cima mentre si scorre.
 *
 * Dal redesign del 18/09/2026 dice anche **dove si è**: la voce della sezione che si sta
 * leggendo prende il fondo bianco, come la voce aperta del menu principale. La scheda è
 * lunga — tre rischi, eventi, profilo, bilancio — e a metà pagina, senza un segno, non si
 * sa più in quale parte ci si trovi.
 *
 * La sezione corrente è l'ultima il cui inizio è già passato sotto l'indice. Si misura allo
 * scorrimento, una volta per fotogramma: un osservatore di intersezioni sbaglia proprio sulle
 * sezioni corte, che entrano ed escono dalla fascia osservata senza mai esserne la protagonista.
 *
 * I collegamenti restano ancore normali: funzionano senza JavaScript, e il collaudo che le
 * controlla una per una (collaudo/percorso-completo.spec.ts) le trova com'erano.
 */
export function IndiceSezioni({ sezioni }: { sezioni: readonly { id: string; testo: string }[] }) {
  const [corrente, setCorrente] = useState<string | null>(null);

  useEffect(() => {
    // Qualche pixel oltre l'altezza dell'indice: una sezione appena raggiunta con un clic
    // (scroll-mt-24) risulta già quella corrente.
    const SOGLIA = 120;
    let fotogramma = 0;
    const misura = () => {
      fotogramma = 0;
      let trovata: string | null = null;
      for (const { id } of sezioni) {
        const elemento = document.getElementById(id);
        if (elemento !== null && elemento.getBoundingClientRect().top <= SOGLIA) trovata = id;
      }
      // In fondo alla pagina l'ultima sezione può essere troppo corta per salire fin lassù.
      const inFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const ultima = sezioni.at(-1)?.id ?? null;
      setCorrente(inFondo && trovata !== null ? ultima : trovata);
    };
    const pianifica = () => {
      if (fotogramma === 0) fotogramma = window.requestAnimationFrame(misura);
    };
    misura();
    window.addEventListener('scroll', pianifica, { passive: true });
    window.addEventListener('resize', pianifica);
    return () => {
      window.removeEventListener('scroll', pianifica);
      window.removeEventListener('resize', pianifica);
      if (fotogramma !== 0) window.cancelAnimationFrame(fotogramma);
    };
  }, [sezioni]);

  return (
    <nav
      aria-label="Sezioni dell’analisi"
      className="no-print sticky top-0 z-10 -mx-5 mb-8 border-b border-bordo bg-fondo/90 px-5 py-2.5 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10"
    >
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 text-[13.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sezioni.map((sezione) => {
          const attiva = corrente === sezione.id;
          return (
            <li key={sezione.id} className="shrink-0">
              <a
                href={`#${sezione.id}`}
                aria-current={attiva ? 'location' : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                  attiva
                    ? 'bg-superficie font-medium text-testo shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-bordo)]'
                    : 'text-testo-tenue hover:bg-superficie/70 hover:text-testo'
                }`}
              >
                {sezione.testo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
