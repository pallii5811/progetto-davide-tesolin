/**
 * Le icone della vetrina, disegnate qui: nessuna libreria in più per una manciata di tratti.
 *
 * Tutte sullo stesso reticolo — 24 × 24, tratto 1,75, estremi arrotondati — perché accanto
 * l'una all'altra si leggano come una famiglia. Decorative: il testo accanto dice già cosa sono,
 * quindi restano fuori dall'albero di accessibilità.
 *
 * Dal 19/09/2026 sono a due toni («migliora la qualità dei mockup e delle icone»): sotto il tratto
 * c'è la sagoma piena dello stesso colore, al 16%. A venti pixel un tratto sottile da solo sembra
 * un filo; con il corpo pieno l'icona ha peso, e resta nitida sia sulle tessere chiare sia su
 * quelle piene, dove il colore è il bianco.
 */

type Proprieta = { readonly className?: string };

/** Il corpo pieno di un'icona: stesso colore del tratto, molto più tenue, senza bordo. */
const CORPO = { fill: 'currentColor', fillOpacity: 0.16, stroke: 'none' } as const;

function Svg({ className, children }: Proprieta & { readonly children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'h-5 w-5'}
    >
      {children}
    </svg>
  );
}

export const IconaScudo = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
    <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const IconaLente = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="11" cy="11" r="6" />
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Svg>
);

export const IconaLuogo = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" />
    <path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" />
    <circle cx="12" cy="11" r="2.2" />
  </Svg>
);

export const IconaOnde = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2S19 15 21 15v5H3z" />
    <path d="M3 10c2 0 2-2 4.5-2S10 10 12 10s2-2 4.5-2S19 10 21 10" />
    <path d="M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2S19 15 21 15" />
    <path d="M3 20c2 0 2-2 4.5-2S10 20 12 20s2-2 4.5-2S19 20 21 20" />
  </Svg>
);

export const IconaFiamma = (p: Proprieta) => (
  <Svg {...p}>
    <path
      {...CORPO}
      d="M12 3c1 3.2 5 5.4 5 10.2A5 5 0 017 13.2c0-2 .9-3.5 2-4.6 0 2 .9 3.1 2 3.1 0-3-1-5.6 1-8.7z"
    />
    <path d="M12 3c1 3.2 5 5.4 5 10.2A5 5 0 017 13.2c0-2 .9-3.5 2-4.6 0 2 .9 3.1 2 3.1 0-3-1-5.6 1-8.7z" />
  </Svg>
);

export const IconaSisma = (p: Proprieta) => (
  <Svg {...p}>
    <rect {...CORPO} x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 12h3l2-5 3 10 2-8 2 5 2-2h4" />
  </Svg>
);

export const IconaFrana = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M3 19l6-9 4 5 3-4 5 8H3z" />
    <path d="M3 19l6-9 4 5 3-4 5 8H3z" />
    <path d="M15 7.5l1.5-1.5M18 9l1.5-.5" />
  </Svg>
);

export const IconaFermo = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 9v6M14 9v6" />
  </Svg>
);

export const IconaLucchetto = (p: Proprieta) => (
  <Svg {...p}>
    <rect {...CORPO} x="5" y="11" width="14" height="9.5" rx="2.2" />
    <rect x="5" y="11" width="14" height="9.5" rx="2.2" />
    <path d="M8 11V8a4 4 0 118 0v3M12 15v2" />
  </Svg>
);

export const IconaDocumento = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M7 3h7l5 5v13H7z" />
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Svg>
);

export const IconaPalazzo = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M4 21V6l8-3 8 3v15z" />
    <path d="M4 21V6l8-3 8 3v15" />
    <path d="M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4M3 21h18" />
  </Svg>
);

export const IconaPersone = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="9" cy="8" r="3" />
    <path {...CORPO} d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2z" />
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 14.3c2.6.2 4.5 1.8 4.5 4.2" />
  </Svg>
);

export const IconaFiltro = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M4 5h16l-6 8v5l-4 2v-7L4 5z" />
    <path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" />
  </Svg>
);

export const IconaEuro = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="12" cy="12" r="9" />
    <path d="M16.5 8.2A5.2 5.2 0 1016.5 15.8" />
    <path d="M6.8 10.8h6.4M6.8 13.2h6.4" />
  </Svg>
);

export const IconaFreccia = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconaSpunta = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="12" cy="12" r="9" />
    <path d="M7.5 12.3l3 3L16.5 9" />
  </Svg>
);

export const IconaArchivio = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M5 5.5v13c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-13c0 1.6-3.1 2.8-7 2.8S5 7.1 5 5.5z" />
    <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
    <path d="M5 5.5v13c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-13" />
    <path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" />
  </Svg>
);

export const IconaCampana = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M6 16v-5a6 6 0 1112 0v5l1.8 2H4.2L6 16z" />
    <path d="M6 16v-5a6 6 0 1112 0v5l1.8 2H4.2L6 16z" />
    <path d="M10 20.5a2 2 0 004 0" />
  </Svg>
);

export const IconaChip = (p: Proprieta) => (
  <Svg {...p}>
    <rect {...CORPO} x="7" y="7" width="10" height="10" rx="1.8" />
    <rect x="7" y="7" width="10" height="10" rx="1.8" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </Svg>
);

/*
  Un ingranaggio vero, a otto denti: prima era un cerchio con otto raggi e si leggeva come un sole.
  I vertici sono calcolati (raggio esterno 9, interno 6,9, dente largo un terzo del passo).
*/
const DENTI =
  'M10.39 5.29 L10.80 3.08 L13.20 3.08 L13.61 5.29 L15.61 6.12 L17.46 4.85 L19.15 6.54 L17.88 8.39 L18.71 10.39 L20.92 10.80 L20.92 13.20 L18.71 13.61 L17.88 15.61 L19.15 17.46 L17.46 19.15 L15.61 17.88 L13.61 18.71 L13.20 20.92 L10.80 20.92 L10.39 18.71 L8.39 17.88 L6.54 19.15 L4.85 17.46 L6.12 15.61 L5.29 13.61 L3.08 13.20 L3.08 10.80 L5.29 10.39 L6.12 8.39 L4.85 6.54 L6.54 4.85 L8.39 6.12 Z';

export const IconaIngranaggio = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d={DENTI} />
    <path d={DENTI} />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const IconaGrafico = (p: Proprieta) => (
  <Svg {...p}>
    <rect {...CORPO} x="5.5" y="11" width="3" height="6" rx="1" />
    <rect {...CORPO} x="10.5" y="6.5" width="3" height="10.5" rx="1" />
    <rect {...CORPO} x="15.5" y="8.5" width="3" height="8.5" rx="1" />
    <path d="M4 20h16" />
    <rect x="5.5" y="11" width="3" height="6" rx="1" />
    <rect x="10.5" y="6.5" width="3" height="10.5" rx="1" />
    <rect x="15.5" y="8.5" width="3" height="8.5" rx="1" />
  </Svg>
);

export const IconaCrm = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M3.5 9h17V6.5A2.5 2.5 0 0018 4H6a2.5 2.5 0 00-2.5 2.5z" />
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M3.5 9h17M9 9v11" />
  </Svg>
);
