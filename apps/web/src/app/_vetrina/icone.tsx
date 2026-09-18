/**
 * Le icone della vetrina, disegnate qui: nessuna libreria in più per una manciata di tratti.
 *
 * Tutte sullo stesso reticolo — 24 × 24, tratto 1,75, estremi arrotondati — perché accanto
 * l'una all'altra si leggano come una famiglia. Decorative: il testo accanto dice già cosa sono,
 * quindi restano fuori dall'albero di accessibilità.
 */

type Proprieta = { readonly className?: string };

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
    <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const IconaLente = (p: Proprieta) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Svg>
);

export const IconaLuogo = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" />
    <circle cx="12" cy="11" r="2.2" />
  </Svg>
);

export const IconaOnde = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M3 10c2 0 2-2 4.5-2S10 10 12 10s2-2 4.5-2S19 10 21 10" />
    <path d="M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2S19 15 21 15" />
    <path d="M3 20c2 0 2-2 4.5-2S10 20 12 20s2-2 4.5-2S19 20 21 20" />
  </Svg>
);

export const IconaFiamma = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M12 3c1 3.2 5 5.4 5 10.2A5 5 0 017 13.2c0-2 .9-3.5 2-4.6 0 2 .9 3.1 2 3.1 0-3-1-5.6 1-8.7z" />
  </Svg>
);

export const IconaSisma = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M3 12h3l2-5 3 10 2-8 2 5 2-2h4" />
  </Svg>
);

export const IconaFrana = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M3 19l6-9 4 5 3-4 5 8H3z" />
  </Svg>
);

export const IconaFermo = (p: Proprieta) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 9v6M14 9v6" />
  </Svg>
);

export const IconaLucchetto = (p: Proprieta) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9.5" rx="2.2" />
    <path d="M8 11V8a4 4 0 118 0v3" />
  </Svg>
);

export const IconaDocumento = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Svg>
);

export const IconaPalazzo = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M4 21V6l8-3 8 3v15" />
    <path d="M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4M3 21h18" />
  </Svg>
);

export const IconaPersone = (p: Proprieta) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 14.3c2.6.2 4.5 1.8 4.5 4.2" />
  </Svg>
);

export const IconaFiltro = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" />
  </Svg>
);

export const IconaEuro = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M17 7.5A6 6 0 1017 16.5" />
    <path d="M5 10.5h8M5 13.5h8" />
  </Svg>
);

export const IconaFreccia = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconaSpunta = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </Svg>
);

export const IconaArchivio = (p: Proprieta) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
    <path d="M5 5.5v13c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-13" />
    <path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" />
  </Svg>
);

export const IconaCampana = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M6 16v-5a6 6 0 1112 0v5l1.8 2H4.2L6 16z" />
    <path d="M10 20.5a2 2 0 004 0" />
  </Svg>
);

export const IconaChip = (p: Proprieta) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.8" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </Svg>
);

export const IconaIngranaggio = (p: Proprieta) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" />
  </Svg>
);

export const IconaGrafico = (p: Proprieta) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V7M17 16v-8" />
  </Svg>
);

export const IconaCrm = (p: Proprieta) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M3.5 9h17M9 9v11" />
  </Svg>
);
