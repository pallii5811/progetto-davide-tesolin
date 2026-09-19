'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconaCampana, IconaCrm, IconaLente, IconaLucchetto, IconaScudo } from './icone';
import { OMBRA_FINESTRA } from './pezzi';
import { SCHERMATE } from './schermate';

/**
 * Il giro del prodotto in apertura: un piccolo film di AEGIS. Il cursore si muove da solo, clicca i
 * pulsanti, e ogni clic porta avanti il lavoro — il conteggio, l'elenco, l'azienda nel CRM, la
 * scheda, i dati di intervista, il report — come lo farebbe un agente.
 *
 * Richieste di Simone del 19/09/2026: prima «tutte le varie schermate che vede l'utente… tutto il
 * flusso utente», poi, vista la prima versione con i passi da cliccare, «volevo proprio il mockup
 * che si animava cambiando schermate… in automatico… il cursore del mouse che clicca i vari tasti».
 *
 * Com'è fatto:
 * - un copione ({@link COPIONE}) di azioni semplici — mostra una schermata, sposta il cursore su un
 *   pulsante, clicca, aspetta — eseguito una dopo l'altra con un timer, all'infinito;
 * - il cursore va dove il pulsante è davvero: la posizione si misura sul pulsante (`data-bersaglio`
 *   in schermate.tsx) nel momento in cui ci si deve andare, quindi resta giusta a ogni larghezza;
 * - un clic accende un «segno» (conteggio fatto, riga scelta, risposta data, salvato, PDF) che la
 *   schermata disegna; cambiando schermata i segni ripartono da zero;
 * - il film parte da solo e non si ferma sotto il mouse: si ferma fuori dallo schermo, con la
 *   scheda del browser nascosta e con il pulsante di pausa, che serve perché un contenuto che si
 *   muove da solo per più di cinque secondi deve potersi fermare (WCAG 2.2.2);
 * - la prima azione aspetta qualche secondo: chi arriva legge prima il titolo;
 * - chi ha chiesto meno movimento non vede il cursore né il film: vede le schermate a riposo, già
 *   compilate, e sceglie lui quale guardare con i passi sotto la finestra.
 *
 * La finestra è un'illustrazione con dati di esempio, fuori dall'albero di accessibilità; i passi e
 * la pausa no, perché sono comandi.
 */

type Azione =
  | { readonly tipo: 'schermata'; readonly indice: number; readonly ms: number }
  | { readonly tipo: 'muovi'; readonly bersaglio: string; readonly ms: number }
  | { readonly tipo: 'clic'; readonly segno?: string; readonly ms: number }
  | { readonly tipo: 'attendi'; readonly ms: number };

/**
 * Il film, un'azione dopo l'altra. `ms` è quanto si aspetta prima della successiva. Accorciato il
 * 19/09/2026 («deve essere tutto più veloce tra una schermata e l'altra»): un giro intero dura una
 * ventina di secondi per sei schermate.
 */
const COPIONE: readonly Azione[] = [
  // Ricerca Clienti: si conta, poi si crea l'elenco.
  { tipo: 'schermata', indice: 0, ms: 900 },
  { tipo: 'muovi', bersaglio: 'conta', ms: 650 },
  { tipo: 'clic', segno: 'contato', ms: 1000 },
  { tipo: 'muovi', bersaglio: 'crea-elenco', ms: 600 },
  { tipo: 'clic', segno: 'elenco', ms: 380 },
  // CRM: l'elenco è arrivato, si apre l'azienda.
  { tipo: 'schermata', indice: 1, ms: 800 },
  { tipo: 'muovi', bersaglio: 'riga-orobia', ms: 650 },
  { tipo: 'clic', segno: 'riga', ms: 420 },
  // La scheda: i tre rischi e i cerchi che si riempiono, poi il profilo dell'impresa.
  { tipo: 'schermata', indice: 2, ms: 1500 },
  { tipo: 'muovi', bersaglio: 'tab-profilo', ms: 650 },
  { tipo: 'clic', segno: 'profilo', ms: 380 },
  // I dati camerali: record, bilanci, soci, indicatori. Poi i dati di intervista.
  { tipo: 'schermata', indice: 3, ms: 1900 },
  { tipo: 'muovi', bersaglio: 'dati-intervista', ms: 650 },
  { tipo: 'clic', segno: 'intervista', ms: 380 },
  // Dati di intervista: una risposta, e si salva.
  { tipo: 'schermata', indice: 4, ms: 1000 },
  { tipo: 'muovi', bersaglio: 'scelta-no', ms: 600 },
  { tipo: 'clic', segno: 'no', ms: 480 },
  { tipo: 'muovi', bersaglio: 'salva', ms: 600 },
  { tipo: 'clic', segno: 'salvato', ms: 850 },
  // Il report per il cliente, e il PDF.
  { tipo: 'schermata', indice: 5, ms: 1100 },
  { tipo: 'muovi', bersaglio: 'stampa', ms: 650 },
  { tipo: 'clic', segno: 'pdf', ms: 1800 },
];

/** La pausa prima della prima azione, all'arrivo sulla pagina. */
const ATTESA_INIZIALE = 2500;

/** Dove sta il cursore a riposo: in basso a destra della finestra, in percentuale. */
const RIPOSO = { x: 0.82, y: 0.86 };

const VOCI_MENU = [
  { chiave: 'ricerca', testo: 'Ricerca Clienti', Icona: IconaLente },
  { chiave: 'crm', testo: 'CRM', Icona: IconaCrm },
  { chiave: 'monitoraggio', testo: 'Monitoraggio', Icona: IconaCampana },
] as const;

/** Tutti i segni, per mostrare le schermate già compilate a chi non vuole il film. */
const TUTTI_I_SEGNI = new Set(['contato', 'riga', 'no', 'salvato']);

/** Il punto del copione in cui comincia ogni schermata, per saltarci dai passi. */
const INIZIO_SCHERMATA = SCHERMATE.map((_, indice) =>
  COPIONE.findIndex((a) => a.tipo === 'schermata' && a.indice === indice),
);

export function TourProdotto() {
  const [fase, setFase] = useState(0);
  const [schermata, setSchermata] = useState(0);
  const [segni, setSegni] = useState<ReadonlySet<string>>(() => new Set());
  const [cursore, setCursore] = useState<{ x: number; y: number } | null>(null);
  const [clic, setClic] = useState(0);
  const [inPausa, setInPausa] = useState(false);
  const [visibile, setVisibile] = useState(false);
  const [paginaVisibile, setPaginaVisibile] = useState(true);
  const [menoMovimento, setMenoMovimento] = useState(false);
  const [pronto, setPronto] = useState(false);

  const radice = useRef<HTMLDivElement | null>(null);
  const finestra = useRef<HTMLDivElement | null>(null);

  // Chi ha chiesto meno movimento: letto dal sistema, e seguito se cambia a pagina aperta.
  useEffect(() => {
    const domanda = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aggiorna = () => setMenoMovimento(domanda.matches);
    aggiorna();
    domanda.addEventListener('change', aggiorna);
    return () => domanda.removeEventListener('change', aggiorna);
  }, []);

  // Fuori dallo schermo, o con la scheda del browser nascosta, il film si ferma dov'è.
  useEffect(() => {
    const elemento = radice.current;
    if (elemento === null) return;
    const osservatore = new IntersectionObserver(([voce]) => setVisibile(voce?.isIntersecting === true), {
      threshold: 0.2,
    });
    osservatore.observe(elemento);
    const suVisibilita = () => setPaginaVisibile(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', suVisibilita);
    return () => {
      osservatore.disconnect();
      document.removeEventListener('visibilitychange', suVisibilita);
    };
  }, []);

  // L'attesa iniziale: il film parte qualche secondo dopo l'arrivo.
  useEffect(() => {
    const t = window.setTimeout(() => setPronto(true), ATTESA_INIZIALE);
    return () => window.clearTimeout(t);
  }, []);

  /** Il punto di un pulsante, rispetto alla finestra: un filo sotto e a destra del centro. */
  const puntoDi = useCallback((bersaglio: string): { x: number; y: number } | null => {
    const contenitore = finestra.current;
    const elemento = contenitore?.querySelector<HTMLElement>(`[data-bersaglio="${bersaglio}"]`);
    if (contenitore === null || elemento === null || elemento === undefined) return null;
    const c = contenitore.getBoundingClientRect();
    const e = elemento.getBoundingClientRect();
    if (e.width === 0 || e.height === 0) return null;
    return { x: e.left - c.left + e.width * 0.55, y: e.top - c.top + e.height * 0.6 };
  }, []);

  const puntoDiRiposo = useCallback((): { x: number; y: number } | null => {
    const contenitore = finestra.current;
    if (contenitore === null) return null;
    return { x: contenitore.clientWidth * RIPOSO.x, y: contenitore.clientHeight * RIPOSO.y };
  }, []);

  const inMoto = pronto && !inPausa && visibile && paginaVisibile && !menoMovimento;

  // Il regista: esegue l'azione di questa fase e programma la successiva.
  useEffect(() => {
    if (!inMoto) return;
    const azione = COPIONE[fase];
    if (azione === undefined) return;
    if (azione.tipo === 'schermata') {
      setSchermata(azione.indice);
      setSegni(new Set());
      if (azione.indice === 0) setCursore(puntoDiRiposo());
    } else if (azione.tipo === 'muovi') {
      const punto = puntoDi(azione.bersaglio);
      if (punto !== null) setCursore(punto);
    } else if (azione.tipo === 'clic') {
      setClic((c) => c + 1);
      const segno = azione.segno;
      if (segno !== undefined) setSegni((s) => new Set([...s, segno]));
    }
    const t = window.setTimeout(() => setFase((f) => (f + 1) % COPIONE.length), azione.ms);
    return () => window.clearTimeout(t);
  }, [fase, inMoto, puntoDi, puntoDiRiposo]);

  // Il cursore compare a riposo quando il film sta per partire.
  useEffect(() => {
    if (inMoto && cursore === null) setCursore(puntoDiRiposo());
  }, [inMoto, cursore, puntoDiRiposo]);

  const vaiA = (indice: number) => {
    setSchermata(indice);
    setSegni(menoMovimento ? TUTTI_I_SEGNI : new Set());
    setFase(INIZIO_SCHERMATA[indice] ?? 0);
  };

  const segniMostrati = useMemo(() => (menoMovimento ? TUTTI_I_SEGNI : segni), [menoMovimento, segni]);
  const attiva = SCHERMATE[schermata] ?? SCHERMATE[0];

  return (
    <div ref={radice}>
      {/* ── La finestra ── */}
      <div
        ref={finestra}
        aria-hidden="true"
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
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-300 motion-reduce:transition-none ${
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

          {/* Le schermate, una sopra l'altra: se ne vede una. */}
          <div className="relative min-w-0 flex-1 bg-vetrina-carta/40">
            {SCHERMATE.map(({ chiave, Schermata }, i) => (
              <div
                key={chiave}
                data-attivo={i === schermata ? 'si' : 'no'}
                className="tour-schermata absolute inset-0 overflow-hidden p-4 sm:p-6"
              >
                <Schermata segni={i === schermata ? segniMostrati : new Set<string>()} />
              </div>
            ))}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white/90 to-transparent" />
          </div>
        </div>

        {/* Il cursore: si sposta sul pulsante, lo preme, e al clic lascia un'onda. */}
        {!menoMovimento && cursore !== null && (
          <div
            className="tour-cursore pointer-events-none absolute left-0 top-0 z-20"
            style={{ transform: `translate(${Math.round(cursore.x)}px, ${Math.round(cursore.y)}px)` }}
          >
            {clic > 0 && (
              <span key={clic} className="tour-clic absolute -left-4 -top-4 h-8 w-8 rounded-full" />
            )}
            <svg
              key={`freccia-${clic}`}
              viewBox="0 0 24 24"
              className="tour-freccia relative h-6 w-6 drop-shadow-[0_2px_4px_rgba(16,24,40,0.35)]"
            >
              <path
                d="M4.5 2.8 19 13.2l-6.5 1.1 3.7 6.9-2.9 1.5-3.7-6.9-4.9 4.6z"
                fill="#101828"
                stroke="white"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* ── Sotto la finestra: dove siamo nel percorso, e la pausa ── */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <div
          role="group"
          aria-label="Le schermate di AEGIS"
          className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SCHERMATE.map((s, i) => {
            const aperta = i === schermata;
            return (
              <button
                key={s.chiave}
                type="button"
                aria-pressed={aperta}
                onClick={() => vaiA(i)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu motion-reduce:transition-none ${
                  aperta
                    ? 'font-medium text-vetrina-inchiostro'
                    : 'text-vetrina-grigio hover:text-vetrina-inchiostro'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                    aperta ? 'w-6 bg-vetrina-inchiostro' : 'w-1.5 bg-vetrina-linea'
                  }`}
                />
                {s.nome}
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-vetrina-linea bg-white text-vetrina-inchiostro transition hover:border-vetrina-inchiostro/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu"
          >
            {inPausa ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor">
                <rect x="7" y="5.5" width="3.5" height="13" rx="1" />
                <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
