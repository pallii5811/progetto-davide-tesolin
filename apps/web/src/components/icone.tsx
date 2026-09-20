/**
 * Le icone del prodotto, disegnate qui come quelle della vetrina: stesso reticolo 24 × 24,
 * tratto 1,75, estremi arrotondati, così le due facce sembrano la stessa mano.
 *
 * Nate per il CRM del 19/09/2026, dove un contatto si riconosce prima dall'icona che dal testo:
 * la cornetta, la busta, il globo. Sono decorative — accanto c'è sempre la parola o il numero —
 * e restano fuori dall'albero di accessibilità.
 */

type Proprieta = { readonly className?: string };

/** Il corpo pieno, come nelle icone della vetrina: peso anche a sedici pixel. */
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
      className={className ?? 'h-4 w-4'}
    >
      {children}
    </svg>
  );
}

export const IconaTelefono = (p: Proprieta) => (
  <Svg {...p}>
    <path
      {...CORPO}
      d="M4.5 5.6c0-.9.7-1.6 1.6-1.6h2c.7 0 1.3.5 1.5 1.2l.6 2.3c.2.6 0 1.3-.5 1.7l-1.2 1a12 12 0 004.3 4.3l1-1.2c.4-.5 1.1-.7 1.7-.5l2.3.6c.7.2 1.2.8 1.2 1.5v2c0 .9-.7 1.6-1.6 1.6C10.7 20.5 4.5 14.3 4.5 5.6z"
    />
    <path d="M4.5 5.6c0-.9.7-1.6 1.6-1.6h2c.7 0 1.3.5 1.5 1.2l.6 2.3c.2.6 0 1.3-.5 1.7l-1.2 1a12 12 0 004.3 4.3l1-1.2c.4-.5 1.1-.7 1.7-.5l2.3.6c.7.2 1.2.8 1.2 1.5v2c0 .9-.7 1.6-1.6 1.6C10.7 20.5 4.5 14.3 4.5 5.6z" />
  </Svg>
);

export const IconaBusta = (p: Proprieta) => (
  <Svg {...p}>
    <rect {...CORPO} x="3" y="5" width="18" height="14" rx="2.5" />
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M4 7l8 5.5L20 7" />
  </Svg>
);

export const IconaGlobo = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z" />
  </Svg>
);

export const IconaMatita = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M4 20v-3.2L15.6 5.2a1.7 1.7 0 012.4 0l1.8 1.8a1.7 1.7 0 010 2.4L8.2 21H4z" />
    <path d="M4 20v-3.2L15.6 5.2a1.7 1.7 0 012.4 0l1.8 1.8a1.7 1.7 0 010 2.4L8.2 21H4z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
);

export const IconaScarica = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M12 3.5v11" />
    <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5" />
    <path d="M4.5 17.5v1.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-1.5" />
  </Svg>
);

export const IconaCerca = (p: Proprieta) => (
  <Svg {...p}>
    <circle {...CORPO} cx="11" cy="11" r="6" />
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Svg>
);

export const IconaNota = (p: Proprieta) => (
  <Svg {...p}>
    <path {...CORPO} d="M5 4.5h14v11.5L14.5 20.5H5z" />
    <path d="M5 4.5h14v11.5L14.5 20.5H5z" />
    <path d="M14.5 20.5V16H19M8.5 9h7M8.5 12.5h4.5" />
  </Svg>
);
