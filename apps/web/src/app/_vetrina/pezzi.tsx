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

/**
 * Toni delle tessere d'icona: un fondo che sfuma dall'alto, un bordo interno dello stesso colore
 * e una riga di luce in cima, come una piastrella smaltata. Dal 19/09/2026: prima era un
 * rettangolo di colore piatto, e accanto a carte con ombre e bordi sembrava un segnaposto.
 */
export const TONI = {
  blu: 'bg-gradient-to-b from-vetrina-blu/14 to-vetrina-blu/6 text-vetrina-blu ring-vetrina-blu/15',
  arancio:
    'bg-gradient-to-b from-vetrina-arancio/18 to-vetrina-arancio/8 text-vetrina-arancio ring-vetrina-arancio/20',
  magenta:
    'bg-gradient-to-b from-vetrina-magenta/14 to-vetrina-magenta/6 text-vetrina-magenta ring-vetrina-magenta/15',
  petrolio:
    'bg-gradient-to-b from-vetrina-petrolio/14 to-vetrina-petrolio/6 text-vetrina-petrolio ring-vetrina-petrolio/15',
  neutro: 'bg-gradient-to-b from-vetrina-velo to-vetrina-carta text-vetrina-grigio ring-vetrina-linea',
} as const;

/**
 * Le tessere grandi, in testa a ogni funzione: piene di colore con l'icona bianca, e un'ombra del
 * loro colore. Sono il primo segno di ogni sezione, e devono vedersi da lontano come le icone di
 * Clay.
 */
const TONI_PIENI = {
  blu: 'bg-gradient-to-br from-[oklch(0.56_0.17_262)] to-vetrina-blu shadow-[0_10px_24px_-10px_oklch(0.42_0.15_262/0.75)]',
  arancio:
    'bg-gradient-to-br from-[oklch(0.7_0.16_52)] to-[oklch(0.58_0.18_40)] shadow-[0_10px_24px_-10px_oklch(0.6_0.17_42/0.75)]',
  magenta:
    'bg-gradient-to-br from-[oklch(0.55_0.2_340)] to-vetrina-magenta shadow-[0_10px_24px_-10px_oklch(0.43_0.19_340/0.75)]',
  petrolio:
    'bg-gradient-to-br from-[oklch(0.55_0.09_205)] to-vetrina-petrolio shadow-[0_10px_24px_-10px_oklch(0.42_0.08_205/0.75)]',
  neutro:
    'bg-gradient-to-br from-[oklch(0.35_0.012_265)] to-vetrina-inchiostro shadow-[0_10px_24px_-10px_rgba(16,24,40,0.6)]',
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
  /*
    Il testo non va a capo: a 390 pixel «Crea un account» nel menu si spezzava su due righe
    dentro la pillola. Sul telefono, e solo nel pulsante piccolo, la freccia si toglie e il
    margine si stringe: senza, il menu non ci stava in larghezza. Sotto i 360 pixel marchio,
    «Accedi» e pulsante non stanno su una riga in nessun modo, e lì il testo torna ad andare a
    capo piuttosto che far scorrere la pagina di lato.
  */
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full font-medium tracking-[-0.01em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu min-[360px]:shrink-0 min-[360px]:whitespace-nowrap ${
        grande
          ? 'h-12 px-6 text-[15.5px]'
          : 'h-10 px-4 text-[14.5px] max-[359px]:h-auto max-[359px]:min-h-10 max-[359px]:py-1.5 max-[359px]:leading-tight sm:px-5'
      } ${stile}`}
    >
      {children}
      {variante !== 'chiaro' && (
        <IconaFreccia
          className={`h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 ${grande ? '' : 'hidden sm:block'}`}
        />
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
  if (grande) {
    return (
      <span
        className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white ${TONI_PIENI[tono]}`}
      >
        {/* La luce in cima alla piastrella: metà superiore appena più chiara. */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
        <span className="relative">{children}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-inset ${TONI[tono]}`}
    >
      {children}
    </span>
  );
}

/** Le etichette di stato delle carte: il colore della gravità, come nella scheda vera. */
const ETICHETTE = {
  rosso: 'bg-[oklch(0.95_0.04_25)] text-[oklch(0.5_0.19_25)] ring-[oklch(0.5_0.19_25/0.15)]',
  ambra: 'bg-[oklch(0.96_0.05_75)] text-[oklch(0.48_0.13_65)] ring-[oklch(0.48_0.13_65/0.15)]',
  verde: 'bg-[oklch(0.95_0.04_150)] text-[oklch(0.45_0.12_150)] ring-[oklch(0.45_0.12_150/0.15)]',
  neutro: 'bg-vetrina-velo text-vetrina-grigio ring-vetrina-linea',
} as const;

export type ToneEtichetta = keyof typeof ETICHETTE;

/** Un'etichetta a pillola: «alta», «scaduto», «in trattativa». */
export function Etichetta({ tono, children }: { tono: ToneEtichetta; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${ETICHETTE[tono]}`}
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
  etichetta,
  sbiadita = false,
  className = '',
}: {
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  sotto: string;
  /** Lo stato a destra, come lo scriverebbe la scheda: «alta», «scaduto», «in trattativa». */
  etichetta?: { testo: string; tono: ToneEtichetta };
  sbiadita?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-vetrina-linea/80 bg-white px-3.5 py-3 shadow-[0_1px_1px_rgba(16,24,40,0.04),0_2px_6px_-2px_rgba(16,24,40,0.06),0_18px_36px_-16px_rgba(16,24,40,0.28)] ${
        sbiadita ? 'opacity-60' : ''
      } ${className}`}
    >
      <Tessera tono={tono}>{icona}</Tessera>
      <div className="min-w-0 flex-1 pr-1">
        <p className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-vetrina-inchiostro">
          {titolo}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-vetrina-grigio">{sotto}</p>
      </div>
      {etichetta !== undefined && <Etichetta tono={etichetta.tono}>{etichetta.testo}</Etichetta>}
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
