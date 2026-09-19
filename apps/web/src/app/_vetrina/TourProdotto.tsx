'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconaCampana, IconaCrm, IconaLente, IconaLucchetto, IconaScudo } from './icone';
import { OMBRA_FINESTRA } from './pezzi';
import { SCHERMATE } from './schermate';

/**
 * Il giro del prodotto in apertura: la finestra di AEGIS che passa da sola da una schermata
 * all'altra, nell'ordine in cui le usa un agente — Ricerca Clienti, CRM, scheda azienda, dati di
 * intervista, report. Richiesta di Simone del 19/09/2026: «vorrei che lo mettessi animato… che nel
 * mockup ci siano tutte le varie schermate che vede l'utente… tutto il flusso utente».
 *
 * Come si comporta, e perché:
 * - avanza da solo ogni {@link DURATA} millisecondi, e la prima schermata resta un po' di più
 *   ({@link PRIMA_DURATA}): chi arriva legge prima il titolo, poi guarda la finestra;
 * - sopra la finestra ci sono i passi, veri pulsanti: un clic porta a quella schermata. Il passo
 *   aperto ha una barra che si riempie, così si vede quanto manca al successivo;
 * - si ferma quando il mouse è sulla finestra o sui passi, quando il fuoco è su un pulsante, quando
 *   la finestra esce dallo schermo, e con il pulsante di pausa. Un contenuto che si muove da solo
 *   per più di cinque secondi deve potersi fermare (WCAG 2.2.2);
 * - chi ha chiesto al sistema meno movimento non vede niente muoversi da solo: nessun avanzamento
 *   automatico e nessuna dissolvenza, e i passi restano cliccabili.
 *
 * La finestra è un'illustrazione con dati di esempio, fuori dall'albero di accessibilità; i passi
 * no, perché sono comandi. L'avanzamento è misurato a ogni fotogramma e scritto direttamente sulla
 * barra: nessun nuovo disegno di React sessanta volte al secondo.
 */

/** Quanto resta aperta ogni schermata. */
const DURATA = 5600;
/** La prima schermata, all'arrivo sulla pagina. */
const PRIMA_DURATA = 9000;

const VOCI_MENU = [
  { chiave: 'ricerca', testo: 'Ricerca Clienti', Icona: IconaLente },
  { chiave: 'crm', testo: 'CRM', Icona: IconaCrm },
  { chiave: 'monitoraggio', testo: 'Monitoraggio', Icona: IconaCampana },
] as const;

export function TourProdotto() {
  const [passo, setPasso] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const [sospeso, setSospeso] = useState(false);
  const [visibile, setVisibile] = useState(false);
  const [menoMovimento, setMenoMovimento] = useState(false);
  const [primoGiro, setPrimoGiro] = useState(true);

  const radice = useRef<HTMLDivElement | null>(null);
  const barra = useRef<HTMLSpanElement | null>(null);
  const trascorso = useRef(0);

  // Chi ha chiesto meno movimento: letto dal sistema, e seguito se cambia mentre la pagina è aperta.
  useEffect(() => {
    const domanda = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aggiorna = () => setMenoMovimento(domanda.matches);
    aggiorna();
    domanda.addEventListener('change', aggiorna);
    return () => domanda.removeEventListener('change', aggiorna);
  }, []);

  // Fuori dallo schermo il giro si ferma: nessuno lo guarda, e al ritorno riprende da dov'era.
  useEffect(() => {
    const elemento = radice.current;
    if (elemento === null) return;
    const osservatore = new IntersectionObserver(([voce]) => setVisibile(voce?.isIntersecting === true), {
      threshold: 0.25,
    });
    osservatore.observe(elemento);
    return () => osservatore.disconnect();
  }, []);

  const avanti = useCallback(() => {
    trascorso.current = 0;
    setPrimoGiro(false);
    setPasso((p) => (p + 1) % SCHERMATE.length);
  }, []);

  const inMoto = !inPausa && !sospeso && visibile && !menoMovimento;

  useEffect(() => {
    if (!inMoto) return;
    const durata = primoGiro ? PRIMA_DURATA : DURATA;
    let ultimo = performance.now();
    let fotogramma = 0;
    const passa = (adesso: number) => {
      trascorso.current += adesso - ultimo;
      ultimo = adesso;
      const quota = Math.min(1, trascorso.current / durata);
      if (barra.current !== null) barra.current.style.transform = `scaleX(${quota})`;
      if (quota >= 1) {
        avanti();
        return;
      }
      fotogramma = requestAnimationFrame(passa);
    };
    fotogramma = requestAnimationFrame(passa);
    return () => cancelAnimationFrame(fotogramma);
  }, [inMoto, passo, primoGiro, avanti]);

  const vaiA = (indice: number) => {
    trascorso.current = 0;
    setPrimoGiro(false);
    setPasso(indice);
  };

  /*
    Su telefono i passi scorrono di lato: quando il giro avanza da solo, quello aperto va portato in
    vista. Si sposta solo la riga dei passi, con scrollTo sul suo contenitore: scrollIntoView
    muoverebbe anche la pagina, sotto il dito di chi sta leggendo.
  */
  const gruppo = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const riga = gruppo.current;
    const bottone = riga?.children[passo];
    if (riga === null || !(bottone instanceof HTMLElement)) return;
    const centro = bottone.offsetLeft + bottone.offsetWidth / 2 - riga.clientWidth / 2;
    riga.scrollTo({ left: Math.max(0, centro), behavior: menoMovimento ? 'auto' : 'smooth' });
  }, [passo, menoMovimento]);

  const attiva = SCHERMATE[passo] ?? SCHERMATE[0];

  return (
    <div ref={radice}>
      {/* ── I passi: comandi veri, fuori dall'illustrazione ── */}
      <div
        className="mb-4 flex items-center justify-center gap-2"
        onMouseEnter={() => setSospeso(true)}
        onMouseLeave={() => setSospeso(false)}
        onFocus={() => setSospeso(true)}
        onBlur={() => setSospeso(false)}
      >
        <div
          ref={gruppo}
          role="group"
          aria-label="Le schermate di AEGIS"
          className="relative flex min-w-0 gap-1 overflow-x-auto rounded-full border border-vetrina-linea bg-white/80 p-1 shadow-[0_8px_24px_-16px_rgba(16,24,40,0.3)] backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SCHERMATE.map((schermata, i) => {
            const aperta = i === passo;
            return (
              <button
                key={schermata.chiave}
                type="button"
                aria-pressed={aperta}
                onClick={() => vaiA(i)}
                className={`relative shrink-0 overflow-hidden whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu ${
                  aperta
                    ? 'bg-vetrina-inchiostro font-medium text-white'
                    : 'text-vetrina-grigio hover:text-vetrina-inchiostro'
                }`}
              >
                <span className="mr-1.5 tabular-nums opacity-70">{i + 1}</span>
                {schermata.nome}
                {aperta && !menoMovimento && (
                  <span
                    ref={barra}
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-white/70"
                    style={{ transform: 'scaleX(0)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {!menoMovimento && (
          <button
            type="button"
            onClick={() => setInPausa((p) => !p)}
            aria-label={
              inPausa ? 'Riprendi il giro delle schermate' : 'Metti in pausa il giro delle schermate'
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-vetrina-linea bg-white text-vetrina-inchiostro shadow-[0_8px_24px_-16px_rgba(16,24,40,0.3)] transition hover:border-vetrina-inchiostro/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu"
          >
            {inPausa ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
                <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
                <rect x="7" y="5.5" width="3.5" height="13" rx="1" />
                <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* ── La finestra ── */}
      <div
        aria-hidden="true"
        onMouseEnter={() => setSospeso(true)}
        onMouseLeave={() => setSospeso(false)}
        className={`relative overflow-hidden rounded-[28px] border border-vetrina-linea bg-white ${OMBRA_FINESTRA}`}
      >
        {/* La cornice: tre punti e il nome della schermata aperta. */}
        <div className="flex items-center gap-3 border-b border-vetrina-linea bg-vetrina-carta px-4 py-2.5 sm:px-5">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full bg-vetrina-linea" />
            ))}
          </span>
          <span className="mx-auto inline-flex items-center gap-1.5 rounded-lg border border-vetrina-linea bg-white px-3 py-1 text-[11.5px] font-medium text-vetrina-grigio">
            <IconaLucchetto className="h-3 w-3" />
            AEGIS · {attiva.nome}
          </span>
          <span className="w-[42px]" />
        </div>

        <div className="flex h-[500px] sm:h-[520px] lg:h-[540px]">
          {/* La barra laterale del prodotto, con la voce del percorso in evidenza. */}
          <aside className="hidden w-[210px] shrink-0 flex-col border-r border-vetrina-linea bg-vetrina-carta/60 p-3 md:flex">
            <div className="mb-5 flex items-center gap-2 px-1.5 pt-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vetrina-inchiostro text-white">
                <IconaScudo className="h-4 w-4" />
              </span>
              <span className="text-[14px] font-semibold tracking-[-0.02em]">AEGIS</span>
            </div>
            <div className="space-y-0.5">
              {VOCI_MENU.map(({ chiave, testo, Icona }) => {
                const accesa = chiave === attiva.voce;
                return (
                  <div
                    key={chiave}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-300 ${
                      accesa
                        ? 'bg-white font-medium shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-vetrina-linea)]'
                        : 'text-vetrina-inchiostro'
                    }`}
                  >
                    <Icona className={`h-4 w-4 ${accesa ? 'text-vetrina-blu' : 'text-vetrina-grigio'}`} />
                    <span className="truncate">{testo}</span>
                    {chiave === 'monitoraggio' && (
                      <span className="ml-auto rounded-full border border-vetrina-linea px-1.5 text-[10px] text-vetrina-grigio">
                        in arrivo
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-auto flex items-center gap-2 rounded-xl border border-vetrina-linea bg-white p-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-vetrina-blu/10 text-[11px] font-semibold text-vetrina-blu">
                LA
              </span>
              <span className="truncate text-[12px] font-medium">La tua agenzia</span>
            </div>
          </aside>

          {/* Le schermate, una sopra l'altra: se ne vede una, quella del passo aperto. */}
          <div className="relative min-w-0 flex-1 bg-vetrina-carta/40">
            {SCHERMATE.map(({ chiave, Schermata }, i) => (
              <div
                key={chiave}
                data-attivo={i === passo ? 'si' : 'no'}
                className="tour-schermata absolute inset-0 overflow-hidden p-4 sm:p-6"
              >
                <Schermata />
              </div>
            ))}
            {/* La finestra continua sotto: sfuma nel bianco invece di tagliarsi. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
