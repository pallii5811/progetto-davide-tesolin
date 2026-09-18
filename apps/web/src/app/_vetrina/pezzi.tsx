import { IconaFreccia } from './icone';

/**
 * I mattoni della vetrina: pulsanti, tessere d'icona, carte fluttuanti, anelli, reticolo a punti.
 *
 * I collegamenti sono `<a>` e non `Link` di Next, di proposito: la vetrina ha un layout suo
 * (vedi layout.tsx), e una navigazione lato client verso /accedi conserverebbe quello — la
 * pagina di accesso arriverebbe senza intestazione e senza la dichiarazione IVASS. Un
 * caricamento pieno fa ripartire il layout dal server, com'è giusto fra due facce diverse.
 *
 * Tutti con la tavolozza fissa `vetrina-*` di globals.css: la vetrina resta chiara anche con il
 * sistema in tema scuro, e i colori del prodotto — che cambiano col tema — qui non entrano, così
 * nessun testo si ritrova chiaro su un fondo chiaro.
 */

/** Toni delle tessere d'icona: il fondo tenue e il tratto pieno dello stesso colore. */
export const TONI = {
  blu: 'bg-vetrina-blu/10 text-vetrina-blu',
  arancio: 'bg-vetrina-arancio/12 text-vetrina-arancio',
  magenta: 'bg-vetrina-magenta/10 text-vetrina-magenta',
  petrolio: 'bg-vetrina-petrolio/10 text-vetrina-petrolio',
  neutro: 'bg-vetrina-velo text-vetrina-grigio',
} as const;

export type Tono = keyof typeof TONI;

export function Pulsante({
  href,
  children,
  variante = 'pieno',
  grande = false,
}: {
  href: string;
  children: React.ReactNode;
  variante?: 'pieno' | 'chiaro' | 'inverso';
  grande?: boolean;
}) {
  const stile =
    variante === 'pieno'
      ? 'bg-vetrina-inchiostro text-white hover:bg-vetrina-inchiostro/85'
      : variante === 'inverso'
        ? 'bg-white text-vetrina-inchiostro hover:bg-white/90'
        : 'border border-vetrina-linea bg-white text-vetrina-inchiostro hover:border-vetrina-inchiostro/30';
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full font-medium tracking-[-0.01em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu ${
        grande ? 'h-12 px-6 text-[15.5px]' : 'h-10 px-5 text-[14.5px]'
      } ${stile}`}
    >
      {children}
      {variante !== 'chiaro' && (
        <IconaFreccia className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </a>
  );
}

/** Un collegamento testuale con la freccia, come «Inizia oggi stesso →» di Clay. */
export function CollegamentoFreccia({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-vetrina-inchiostro underline-offset-4 hover:underline"
    >
      {children}
      <IconaFreccia className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </a>
  );
}

export function Tessera({
  tono = 'neutro',
  grande = false,
  children,
}: {
  tono?: Tono;
  grande?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        grande ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl'
      } ${TONI[tono]}`}
    >
      {children}
    </span>
  );
}

/**
 * La carta di un segnale: tessera, titolo, riga sotto. È il mattone delle illustrazioni, come le
 * notifiche che fluttuano sulle pagine di Clay.
 */
export function CartaSegnale({
  icona,
  tono,
  titolo,
  sotto,
  sbiadita = false,
  className = '',
}: {
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  sotto: string;
  sbiadita?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_32px_-14px_rgba(16,24,40,0.18)] ${
        sbiadita ? 'opacity-60' : ''
      } ${className}`}
    >
      <Tessera tono={tono}>{icona}</Tessera>
      <div className="min-w-0 pr-1">
        <p className="truncate text-[14.5px] font-medium leading-tight text-vetrina-inchiostro">{titolo}</p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-vetrina-grigio">{sotto}</p>
      </div>
    </div>
  );
}

/** Una carta fantasma: due barre grigie al posto del testo, per dare profondità alle illustrazioni. */
export function CartaFantasma({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white/80 px-3.5 py-3 ${className}`}
    >
      <span className="h-10 w-10 shrink-0 rounded-xl bg-vetrina-velo" />
      <span className="flex flex-col gap-1.5">
        <span className="h-2 w-24 rounded-full bg-vetrina-linea" />
        <span className="h-2 w-16 rounded-full bg-vetrina-linea/70" />
      </span>
    </div>
  );
}

/** Il colore di un punteggio da 1 a 7: dal verde al rosso, fisso come il resto della vetrina. */
export function colorePunteggio(valore: number): string {
  if (valore < 2.5) return 'oklch(0.62 0.15 150)';
  if (valore < 3.5) return 'oklch(0.72 0.15 110)';
  if (valore < 4.5) return 'oklch(0.72 0.16 75)';
  if (valore < 5.5) return 'oklch(0.66 0.18 45)';
  return 'oklch(0.58 0.2 25)';
}

const RAGGIO = 26;
const CIRCONFERENZA = Math.round(2 * Math.PI * RAGGIO * 100) / 100;

/**
 * Un anello da 1 a 7, come i cerchi della scheda. Il numero è quello che il prodotto mostrerebbe;
 * la lunghezza dell'arco è arrotondata al centesimo perché server e browser la scrivano uguale.
 */
export function Anello({
  valore,
  testo,
  dimensione = 64,
}: {
  valore: number;
  testo: string;
  dimensione?: number;
}) {
  const pieno = Math.round(((CIRCONFERENZA * Math.min(7, valore)) / 7) * 100) / 100;
  return (
    <svg viewBox="0 0 64 64" width={dimensione} height={dimensione} aria-hidden="true" className="shrink-0">
      <circle
        cx="32"
        cy="32"
        r={RAGGIO}
        fill="none"
        strokeWidth="7"
        style={{ stroke: 'oklch(0.93 0.005 85)' }}
      />
      <circle
        cx="32"
        cy="32"
        r={RAGGIO}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${pieno} ${CIRCONFERENZA}`}
        transform="rotate(-90 32 32)"
        style={{ stroke: colorePunteggio(valore) }}
      />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        style={{ fill: 'oklch(0.17 0.01 265)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {testo}
      </text>
    </svg>
  );
}

/** Il reticolo a punti dei riquadri illustrati. */
export const PUNTINI =
  'bg-[radial-gradient(circle,_var(--color-vetrina-linea)_1px,_transparent_1.3px)] [background-size:16px_16px]';

/** L'ombra delle finestre di prodotto: vicina e morbida, poi lunga e diffusa. */
export const OMBRA_FINESTRA =
  'shadow-[0_1px_2px_rgba(16,24,40,0.05),0_24px_64px_-24px_rgba(16,24,40,0.25)]';
