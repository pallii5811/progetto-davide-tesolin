'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Le funzioni del prodotto come in clay.com/signals: i testi scorrono a sinistra, il pannello
 * resta fermo a destra e cambia quando arriva il testo successivo.
 *
 * Richiesta di Simone del 19/09/2026: «il mockup a destra scorre cambiando mockup quando
 * arriva al box di sinistra successivo, come ha fatto Clay… cambia solo quello di destra con
 * le animazioni e gli altri a sinistra sono statici».
 *
 * Com'è fatto:
 * - a sinistra ogni funzione è un blocco alto quasi uno schermo, con il testo al centro; i
 *   blocchi non si muovono né sbiadiscono;
 * - a destra una colonna con il pannello `sticky`, centrato nello schermo. I quattro pannelli
 *   stanno uno sopra l'altro e se ne vede uno: quello del blocco che è salito oltre il 60% dello
 *   schermo. Il cambio è una dissolvenza con le carte che entrano una dopo l'altra (le regole
 *   `.vetrina-scena` in globals.css);
 * - l'imbottitura sopra e sotto il pannello vale mezzo blocco meno mezzo pannello: il pannello
 *   comincia a restare fermo quando il primo testo è a metà schermo, e si stacca quando l'ultimo
 *   l'ha superata. Così testo e pannello sono sempre alla stessa altezza nel momento del cambio.
 *
 * Su schermo stretto non c'è una colonna accanto: ogni testo porta il suo pannello sotto, come
 * prima, e la scena fissa non esiste (`hidden lg:block`). I pannelli sono illustrazioni con dati
 * di esempio, fuori dall'albero di accessibilità (`aria-hidden` in illustrazioni.tsx): averne due
 * copie nel documento non cambia niente per chi usa un lettore di schermo.
 *
 * Senza JavaScript, o prima che parta, si vede il primo pannello: è quello giusto per chi arriva
 * in cima alla sezione. Chi ha chiesto meno movimento vede il cambio senza dissolvenze.
 */
export function ProdottoScorrevole({
  voci,
}: {
  voci: readonly { id: string; testo: ReactNode; pannello: ReactNode }[];
}) {
  const [attivo, setAttivo] = useState(0);
  const blocchi = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let fotogramma = 0;
    const misura = () => {
      fotogramma = 0;
      // Il blocco corrente è l'ultimo il cui inizio ha già passato il 60% dello schermo: il
      // pannello nuovo arriva mentre il suo titolo sale nella metà bassa, come in Clay, e non
      // dopo che lo si è già letto.
      const soglia = window.innerHeight * 0.6;
      let trovato = 0;
      blocchi.current.forEach((blocco, indice) => {
        if (blocco !== null && blocco.getBoundingClientRect().top <= soglia) trovato = indice;
      });
      setAttivo(trovato);
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
  }, []);

  return (
    <div className="[--altezza-blocco:min(86vh,820px)] lg:grid lg:grid-cols-2 lg:gap-16">
      <div>
        {voci.map((voce, indice) => (
          <div
            key={voce.id}
            id={voce.id}
            ref={(elemento) => {
              blocchi.current[indice] = elemento;
            }}
            className="scroll-mt-28 py-14 lg:flex lg:min-h-[var(--altezza-blocco)] lg:flex-col lg:justify-center lg:py-10"
          >
            {voce.testo}
            <div className="mt-10 lg:hidden">{voce.pannello}</div>
          </div>
        ))}
      </div>

      <div className="hidden py-[calc((var(--altezza-blocco)_-_520px)/2)] lg:block">
        <div className="sticky top-[max(6.5rem,calc(50vh_-_260px))]">
          <div className="relative h-[520px]">
            {voci.map((voce, indice) => (
              <div
                key={voce.id}
                data-attivo={indice === attivo ? 'si' : 'no'}
                className="vetrina-scena absolute inset-0"
              >
                {voce.pannello}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
