import {
  IconaDocumento,
  IconaGrafico,
  IconaInfo,
  IconaPalazzo,
  IconaPersone,
  IconaSpunta,
  IconaStampante,
} from './icone';

/**
 * «Le carte IVASS sono già nel report»: quattro tessere piene di colore, ciascuna con un pezzo del
 * prodotto che sborda dal bordo.
 *
 * Richiesta di Simone del 19/09/2026, con le schermate di superhuman.com: al posto di quattro carte
 * bianche uguali, tessere grandi e scure con il testo a sinistra e la finestra a destra, una larga
 * e due affiancate. Qui sono quattro: larga, due affiancate, larga a specchio.
 *
 * Ogni finestra usa le parole che il prodotto scrive davvero:
 * - la base di calcolo è quella di sums-insured.ts per le merci («Rimanenze di bilancio ×
 *   coefficiente di picco stagionale», coefficiente 1,3), con i titoli «Somma assicuranda — …»;
 * - l'intestazione è quella di report/page.tsx: logo, denominazione, «RUI n.», la riga «Analisi dei
 *   rischi e verifica delle coperture assicurative», il pulsante «Stampa o salva in PDF»;
 * - il registro dei rischi ha le etichette di risk/taxonomy.ts, punteggi da 1 a 25 con le soglie di
 *   risk/assessment.ts (fino a 12 rilevante, fino a 16 alto), e la motivazione CAT NAT è la frase di
 *   coverage/motivazione.ts;
 * - l'adeguata verifica ha le frasi di compliance/adeguata-verifica.ts e AdeguataVerifica.tsx: «È un
 *   omonimo», «Resta a verbale nel registro delle operazioni», 0,07 € a persona.
 *
 * Nessun nome vero: l'agenzia è «La tua agenzia» con il posto del logo vuoto, il numero RUI è
 * coperto come le partite IVA delle altre illustrazioni, e le persone hanno l'iniziale del cognome.
 * Le finestre sono nascoste ai lettori di schermo; il testo di ogni tessera dice già tutto.
 *
 * Il contrasto è misurato anche qui dentro (axe lo controlla nelle parti nascoste): sui fondi scuri
 * nessun testo scende sotto il bianco al 70%.
 */

type Fondo = 'petrolio' | 'vino' | 'pietra' | 'notte';

/*
  Quattro fondi profondi, un filo desaturati, come le tessere di Superhuman: colore pieno ma mai
  squillante, con una luce dall'alto e un reticolo appena visibile. La pietra è l'unica chiara, e
  rompe la sequenza dei fondi scuri come la tessera grigia della loro pagina.
*/
const FONDI: Record<Fondo, { fondo: string; luce: string; scuro: boolean }> = {
  petrolio: {
    fondo: 'bg-[oklch(0.3_0.052_205)]',
    luce: 'bg-[radial-gradient(90%_80%_at_0%_0%,oklch(0.4_0.07_195/0.9),transparent_65%)]',
    scuro: true,
  },
  vino: {
    fondo: 'bg-[oklch(0.29_0.075_12)]',
    luce: 'bg-[radial-gradient(90%_80%_at_0%_0%,oklch(0.4_0.1_20/0.85),transparent_65%)]',
    scuro: true,
  },
  pietra: {
    fondo: 'bg-[oklch(0.915_0.013_75)]',
    luce: 'bg-[radial-gradient(90%_80%_at_0%_0%,oklch(0.96_0.01_80/0.9),transparent_65%)]',
    scuro: false,
  },
  notte: {
    fondo: 'bg-[oklch(0.27_0.068_272)]',
    luce: 'bg-[radial-gradient(90%_80%_at_100%_0%,oklch(0.38_0.1_275/0.9),transparent_65%)]',
    scuro: true,
  },
};

/** Il reticolo di puntini dei fondi, che sfuma verso il basso. */
const RETICOLO_CHIARO =
  'opacity-[0.14] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]';
const RETICOLO_SCURO =
  'opacity-[0.35] [background-image:radial-gradient(oklch(0.8_0.01_75)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]';

/** L'ombra delle finestre sui fondi colorati: vicina e netta, poi lunga e scura. */
const OMBRA = 'shadow-[0_1px_2px_rgba(16,24,40,0.12),0_24px_60px_-20px_rgba(8,12,24,0.55)]';

function Piastra({
  fondo,
  etichetta,
  icona,
  titolo,
  testo,
  finestra,
  altezzaFinestra,
  larga = false,
  specchio = false,
}: {
  fondo: Fondo;
  etichetta: string;
  icona: React.ReactNode;
  titolo: string;
  testo: string;
  finestra: React.ReactNode;
  /** L'altezza della finestra quando sta sotto il testo, scritta per intero perché Tailwind la trovi. */
  altezzaFinestra: string;
  larga?: boolean;
  specchio?: boolean;
}) {
  const f = FONDI[fondo];
  return (
    <li
      className={`relative isolate grid min-w-0 overflow-hidden rounded-[28px] ${f.fondo} ${
        larga
          ? specchio
            ? 'lg:h-[450px] lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] xl:col-span-2'
            : 'lg:h-[450px] lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:col-span-2'
          : 'sm:grid-cols-2 lg:h-[410px]'
      }`}
    >
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${f.luce}`} />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 ${f.scuro ? RETICOLO_CHIARO : RETICOLO_SCURO}`}
      />

      <div
        className={`flex flex-col justify-center px-7 pb-8 pt-9 sm:px-10 ${larga ? 'lg:px-12' : ''} ${
          specchio ? 'lg:order-2' : ''
        }`}
      >
        <p
          className={`flex items-center gap-2 text-[14px] font-medium ${
            f.scuro ? 'text-white/80' : 'text-vetrina-grigio'
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-lg ${
              f.scuro
                ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15'
                : 'bg-white text-vetrina-inchiostro ring-1 ring-inset ring-vetrina-linea'
            }`}
          >
            {icona}
          </span>
          {etichetta}
        </p>
        <h3
          className={`mt-4 text-balance font-semibold leading-[1.12] tracking-[-0.03em] ${
            larga ? 'text-[26px] sm:text-[30px]' : 'text-[24px] sm:text-[26px]'
          } ${f.scuro ? 'text-white' : 'text-vetrina-inchiostro'}`}
        >
          {titolo}
        </h3>
        <p
          className={`mt-4 max-w-[440px] text-pretty text-[15.5px] leading-[1.6] ${
            f.scuro ? 'text-white/75' : 'text-vetrina-grigio'
          }`}
        >
          {testo}
        </p>
      </div>

      <div
        aria-hidden="true"
        className={`relative min-w-0 ${altezzaFinestra} ${larga ? 'lg:h-auto' : 'sm:h-auto sm:min-h-[340px]'}`}
      >
        {finestra}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ogni numero ha la sua fonte: il capitale con la sua base di calcolo
// ─────────────────────────────────────────────────────────────────────────────

/** Il puntatore del mouse, disegnato: nero con il bordo bianco, come quello di sistema. */
function Puntatore({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] ${className}`}>
      <path
        d="M5 3.2l13.4 8.6-6 1.1 3.4 6.6-2.6 1.3-3.4-6.6L5.4 18.6z"
        fill="oklch(0.17 0.01 265)"
        stroke="white"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
  Le quattro somme come le intitola il report. Merci e scorte: 1,24 mln € di rimanenze × 1,3 =
  1.612.000 €. Gli altri valori sono di esempio, come tutti quelli delle illustrazioni.
*/
const CAPITALI = [
  { voce: 'Fabbricati', valore: '3.180.000 €' },
  { voce: 'Macchinari e attrezzature', valore: '1.940.000 €' },
  { voce: 'Danni indiretti (Business Interruption)', valore: '6.600.000 €' },
  { voce: 'Merci e scorte', valore: '1.612.000 €', fuoco: true },
] as const;

function FinestraFonte() {
  return (
    <div className="absolute inset-0">
      {/*
        Il documento è un vetro sul colore: come il testo che Superhuman lascia intravedere sotto
        il suggerimento, si legge ma resta indietro. Davanti c'è solo la riga che si sta guardando.
      */}
      <div className="absolute bottom-0 left-5 right-0 top-2 overflow-hidden rounded-tl-[22px] bg-white/[0.07] ring-1 ring-white/12 sm:left-8 lg:left-0 lg:top-0 lg:rounded-none lg:ring-0 lg:[box-shadow:inset_1px_0_0_rgba(255,255,255,0.12)]">
        <div className="flex items-center gap-3 border-b border-white/12 px-5 py-3.5 sm:px-7">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white ring-1 ring-inset ring-white/15">
            <IconaDocumento className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-white">Logistica Orobia S.r.l.</p>
            <p className="truncate text-[11.5px] text-white/70">Report per il cliente</p>
          </div>
        </div>

        <div className="px-5 pt-6 sm:px-7">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">Capitolo 5</p>
          {/*
            Fra 1024 e 1279 pixel il documento è stretto e il riquadro della fonte tagliava a metà
            il titolo del capitolo: lì titolo e nota vanno a capo prima del riquadro.
          */}
          <p className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-white lg:max-w-[230px] xl:max-w-none">
            Determinazione dei capitali da assicurare
          </p>
          <p className="mt-1 max-w-[440px] text-[12px] leading-snug text-white/70 lg:max-w-[230px] xl:max-w-[440px]">
            Per ciascuno è indicata la base di calcolo adottata.
          </p>

          <div className="mt-4">
            {CAPITALI.map((c) => (
              <div
                key={c.voce}
                className={`relative flex items-baseline justify-between gap-4 border-b border-white/12 py-2.5 text-[13px] ${
                  'fuoco' in c ? '-mx-2 rounded-lg border-transparent bg-white/10 px-2' : ''
                }`}
              >
                <span className="min-w-0 truncate text-white/75">
                  {/* Fra 1024 e 1279 il prefisso non ci sta: le voci finirebbero sotto il riquadro. */}
                  <span className="hidden sm:inline lg:hidden xl:inline">Somma assicuranda — </span>
                  {c.voce}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    'fuoco' in c
                      ? 'font-semibold text-white underline decoration-[oklch(0.82_0.14_75)] decoration-2 underline-offset-[5px]'
                      : 'text-white/80'
                  }`}
                >
                  {c.valore}
                </span>
                {'fuoco' in c && (
                  <>
                    <Puntatore className="absolute -bottom-3.5 right-5 z-20" />
                    <RiquadroFonte />
                  </>
                )}
              </div>
            ))}
          </div>
          {/* Sotto le somme, le note di calcolo del capitolo: righe, non testo, perché restano indietro. */}
          <div className="mt-4 space-y-2">
            <span className="block h-1.5 w-[88%] rounded-full bg-white/12" />
            <span className="block h-1.5 w-[72%] rounded-full bg-white/12" />
            <span className="block h-1.5 w-[80%] rounded-full bg-white/12" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Il riquadro che si apre sul numero: da dove viene, con che formula e con quali dati. Si apre
 * verso l'alto, sopra le altre somme, come il suggerimento sopra la frase nella pagina di
 * Superhuman: il numero e il puntatore restano scoperti.
 */
function RiquadroFonte() {
  return (
    /*
      Il bordo destro esce di sei pixel dalla riga evidenziata, che a sua volta sborda di otto dal
      margine: così copre per intero le cifre delle somme sopra, invece di lasciarne spuntare gli «€».
    */
    <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-10 sm:left-auto sm:right-[-6px] sm:w-[300px] lg:w-[280px] xl:w-[300px]">
      {/*
        Il bagliore dietro il riquadro, la sola nota calda della tessera: spunta a destra e in basso,
        come la fascia viola dietro il suggerimento di Superhuman, e non sporca il documento a sinistra.
      */}
      <div className="absolute -bottom-3 -right-2 left-12 top-10 -z-10 rounded-3xl bg-gradient-to-br from-[oklch(0.78_0.15_65)] via-[oklch(0.66_0.19_25)] to-[oklch(0.55_0.2_340)] opacity-60 blur-2xl" />
      <div className={`rounded-2xl bg-white p-4 ${OMBRA}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-vetrina-grigio">
            <IconaInfo className="h-3.5 w-3.5" />
            Base di calcolo
          </span>
          <span className="rounded-full bg-[oklch(0.95_0.04_150)] px-2 py-0.5 text-[11px] font-medium text-[oklch(0.42_0.12_150)] ring-1 ring-inset ring-[oklch(0.42_0.12_150/0.15)]">
            dal bilancio
          </span>
        </div>
        <p className="mt-2.5 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-vetrina-inchiostro">
          Somma assicuranda — Merci e scorte
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-vetrina-grigio">
          Rimanenze di bilancio × coefficiente di picco stagionale
        </p>
        <dl className="mt-3 space-y-1.5 rounded-xl bg-vetrina-carta px-3 py-2.5 text-[12.5px] ring-1 ring-inset ring-vetrina-linea">
          <div className="flex justify-between gap-3">
            <dt className="text-vetrina-grigio">Rimanenze al 31/12</dt>
            <dd className="font-medium tabular-nums text-vetrina-inchiostro">1,24 mln €</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-vetrina-grigio">Coefficiente di picco</dt>
            <dd className="font-medium tabular-nums text-vetrina-inchiostro">1,3×</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-vetrina-linea pt-1.5">
            <dt className="font-medium text-vetrina-inchiostro">Capitale</dt>
            <dd className="font-semibold tabular-nums text-vetrina-inchiostro">1.612.000 €</dd>
          </div>
        </dl>
        <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-vetrina-grigio">
          <IconaPalazzo className="h-3.5 w-3.5" />
          Bilancio depositato · Registro Imprese
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intestazione e RUI: la prima pagina del report
// ─────────────────────────────────────────────────────────────────────────────

function FinestraIntestazione() {
  return (
    <div className="absolute inset-0">
      <div
        className={`absolute bottom-0 left-5 right-0 top-2 overflow-hidden rounded-tl-[20px] bg-white sm:left-0 sm:top-10 ${OMBRA}`}
      >
        <div className="px-6 pt-5">
          {/* Il posto del logo, vuoto: il report ci mette quello dell'agenzia. */}
          <div className="flex items-center gap-3 border-b border-vetrina-linea pb-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-vetrina-grigio/50 bg-vetrina-carta text-[9.5px] font-medium leading-tight text-vetrina-grigio">
              il tuo
              <br />
              logo
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold tracking-[-0.01em] text-vetrina-inchiostro">
                La tua agenzia
              </p>
              <p className="truncate text-[11px] tabular-nums text-vetrina-grigio">
                RUI n. A000 ••• ••• · la tua sede
              </p>
            </div>
          </div>
          <p className="mt-4 text-[9.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-vetrina-grigio">
            Analisi dei rischi e verifica delle coperture assicurative
          </p>
          <p className="mt-1.5 text-[21px] font-bold leading-tight tracking-[-0.03em] text-vetrina-inchiostro">
            Logistica Orobia S.r.l.
          </p>
          <p className="mt-1 text-[11.5px] text-vetrina-grigio">
            S.r.l. · sede legale a Dello (BS) · media impresa
          </p>
          <p className="mt-2 text-[10.5px] text-vetrina-grigio">
            Documento generato il 19/09/2026 · metodologia ISO 31000:2018
          </p>

          {/* Il primo capitolo solo dove c'è posto: sotto, il pulsante di stampa coprirebbe le sue righe. */}
          <p className="mt-5 hidden items-center gap-2 text-[12.5px] font-semibold text-vetrina-inchiostro lg:flex">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-vetrina-inchiostro text-[10.5px] text-white">
              1
            </span>
            Sintesi per la direzione
          </p>
          <div className="mt-2.5 hidden space-y-1.5 lg:block">
            <span className="block h-1.5 w-[92%] rounded-full bg-vetrina-linea" />
            <span className="block h-1.5 w-[84%] rounded-full bg-vetrina-linea" />
            <span className="block h-1.5 w-[64%] rounded-full bg-vetrina-linea" />
          </div>
        </div>
      </div>

      <span className="absolute bottom-6 left-9 inline-flex items-center gap-2 rounded-full bg-vetrina-inchiostro px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_12px_28px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:left-4">
        <IconaStampante className="h-4 w-4" />
        Stampa o salva in PDF
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Richieste ed esigenze: il registro dei rischi e la motivazione
// ─────────────────────────────────────────────────────────────────────────────

/*
  Il rischio residuo da 1 a 25, con le soglie del motore: 15 e 16 sono «alto», 12 è «rilevante».
  L'inerente resta nei dati (20, 16, 15): il report lo stampa accanto, qui non ci stava.
*/
const RISCHI = [
  { nome: 'Incendio di fabbricati e contenuto', inerente: 20, residuo: 15, livello: 'Alto' },
  { nome: 'Alluvione, inondazione, frana', inerente: 16, residuo: 16, livello: 'Alto' },
  {
    nome: 'Interruzione dell’attività a seguito di sinistro',
    inerente: 15,
    residuo: 12,
    livello: 'Rilevante',
  },
] as const;

function FinestraEsigenze() {
  return (
    <div className="absolute inset-0">
      <div
        className={`absolute bottom-0 left-5 right-0 top-2 overflow-hidden rounded-tl-[20px] bg-white sm:left-0 sm:top-10 ${OMBRA}`}
      >
        <div className="px-6 pt-5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-vetrina-inchiostro">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-vetrina-inchiostro text-[10.5px] text-white">
              2
            </span>
            Richieste ed esigenze rilevate
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-vetrina-grigio">
            Ai sensi dell’art. 58 del Reg. IVASS n. 40/2018
          </p>

          <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b-2 border-vetrina-inchiostro pb-1.5 text-[10.5px] font-semibold text-vetrina-inchiostro">
            <span>Rischio</span>
            <span className="w-[84px] text-right">Residuo</span>
          </div>
          {RISCHI.map((r) => (
            <div
              key={r.nome}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-vetrina-linea py-2 text-[11.5px]"
            >
              <span className="font-medium leading-snug text-vetrina-inchiostro">{r.nome}</span>
              <span className="flex w-[84px] items-center justify-end gap-1.5">
                <span className="font-semibold tabular-nums text-vetrina-inchiostro">{r.residuo}</span>
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${
                    r.livello === 'Alto'
                      ? 'bg-[oklch(0.95_0.04_25)] text-[oklch(0.5_0.19_25)] ring-[oklch(0.5_0.19_25/0.15)]'
                      : 'bg-[oklch(0.96_0.05_75)] text-[oklch(0.46_0.13_65)] ring-[oklch(0.46_0.13_65/0.15)]'
                  }`}
                >
                  {r.livello}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* La motivazione, in primo piano: è la parte che l'articolo 59 chiede di scrivere. */}
      <div
        className={`absolute bottom-5 left-9 right-4 rounded-2xl bg-white p-4 ring-1 ring-vetrina-linea sm:left-5 ${OMBRA}`}
      >
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-vetrina-grigio">
          Coperture proposte e motivazione
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13px] font-semibold text-vetrina-inchiostro">
            1. Rischi catastrofali (CAT NAT)
          </p>
          <span className="rounded-full bg-[oklch(0.95_0.04_25)] px-2 py-px text-[10.5px] font-medium text-[oklch(0.5_0.19_25)] ring-1 ring-inset ring-[oklch(0.5_0.19_25/0.15)]">
            obbligo di legge
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-vetrina-grigio">
          L’impresa è soggetta all’obbligo assicurativo contro i rischi catastrofali.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Controlli su soci e titolare effettivo: l'adeguata verifica
// ─────────────────────────────────────────────────────────────────────────────

function Scelta({ attiva, children }: { attiva: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-vetrina-inchiostro">
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
          attiva ? 'border-vetrina-blu' : 'border-vetrina-grigio/60'
        }`}
      >
        {attiva && <span className="h-1.5 w-1.5 rounded-full bg-vetrina-blu" />}
      </span>
      {children}
    </span>
  );
}

function FinestraVerifica() {
  return (
    <div className="absolute inset-0">
      <div
        className={`absolute bottom-0 left-5 right-0 top-2 overflow-hidden rounded-tl-[22px] bg-white sm:left-10 sm:top-10 lg:left-0 lg:right-16 lg:rounded-tl-none lg:rounded-tr-[22px] ${OMBRA}`}
      >
        <div className="px-6 pt-5 sm:px-7">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-vetrina-inchiostro">
            Adeguata verifica della clientela
          </p>
          <p className="mt-0.5 text-[11.5px] text-vetrina-grigio">
            Liste di sanzioni, persone politicamente esposte, stampa avversa
          </p>

          <div className="mt-3.5 rounded-xl bg-vetrina-carta p-3.5 ring-1 ring-inset ring-vetrina-linea">
            <p className="text-[12.5px] font-medium text-vetrina-inchiostro">Da verificare: 2 persone</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-vetrina-grigio">
              <li>· Marco R. — titolare effettivo, nato nel 1968</li>
              <li>· Paolo B. — rappresentante legale, nato nel 1974</li>
            </ul>
            <span className="mt-3 inline-flex items-center rounded-full bg-vetrina-inchiostro px-3 py-1.5 text-[11.5px] font-medium text-white">
              Verifica le persone — 0,14 €
            </span>
          </div>

          {/*
            L'esito dell'altra persona, con la conclusione che il motore scrive quando nessun
            candidato compare. Solo da 1280 pixel: più stretto lo coprirebbe il riscontro.
          */}
          <div className="mt-3 hidden max-w-[46%] rounded-xl p-3.5 ring-1 ring-inset ring-vetrina-linea xl:block">
            <p className="text-[12px] font-semibold text-vetrina-inchiostro">
              Paolo B. <span className="font-normal text-vetrina-grigio">· rappresentante legale</span>
            </p>
            <p className="mt-0.5 text-[10.5px] text-vetrina-grigio">verificata il 12/09/2026</p>
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-vetrina-grigio">
              <IconaSpunta className="mt-px h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.13_150)]" />
              Nessun riscontro su liste di sanzioni, persone politicamente esposte o stampa avversa.
            </p>
          </div>
        </div>
      </div>

      {/* Il riscontro, in primo piano: un omonimo escluso da chi ha visto il documento. */}
      <div
        className={`absolute bottom-6 right-4 w-[min(330px,calc(100%-2.5rem))] rounded-2xl bg-white p-4 ring-1 ring-vetrina-linea sm:right-8 lg:right-2 ${OMBRA}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-semibold text-vetrina-inchiostro">Marco R.</p>
          <p className="text-[11px] text-vetrina-grigio">Corrispondenza debole</p>
        </div>
        <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-vetrina-grigio">
          <li>· Il nome corrisponde in parte (50 % delle parole).</li>
          <li>· L’anno di nascita NON coincide: cercato 1968, in lista 1951.</li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          <Scelta attiva={false}>È la stessa persona</Scelta>
          <Scelta attiva>È un omonimo</Scelta>
        </div>
        <p className="mt-3 flex items-start gap-1.5 border-t border-vetrina-linea pt-2.5 text-[11px] leading-snug text-vetrina-grigio">
          <IconaSpunta className="mt-px h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.13_150)]" />
          Decisa il 12/09/2026. Resta a verbale nel registro delle operazioni.
        </p>
      </div>
    </div>
  );
}

export function TessereReport() {
  return (
    <ul className="mt-12 grid gap-5 xl:grid-cols-2">
      <Piastra
        larga
        fondo="petrolio"
        etichetta="Ogni numero ha la sua fonte"
        icona={<IconaGrafico className="h-3.5 w-3.5" />}
        titolo="Ogni capitale dice come è stato calcolato."
        testo="Ogni punteggio mostra le voci da cui nasce, e nel report ogni capitale porta la sua base di calcolo. Se il cliente o l’assuntore chiedono da dove viene, la risposta è lì."
        finestra={<FinestraFonte />}
        altezzaFinestra="h-[430px] sm:h-[440px]"
      />
      <Piastra
        fondo="vino"
        etichetta="Intestazione e RUI"
        icona={<IconaDocumento className="h-3.5 w-3.5" />}
        titolo="Il report esce con il nome della tua agenzia."
        testo="Il logo, la denominazione e il numero di iscrizione al RUI in testa al documento. Lo stampi o lo salvi in PDF."
        finestra={<FinestraIntestazione />}
        altezzaFinestra="h-[340px]"
      />
      <Piastra
        fondo="pietra"
        etichetta="Richieste ed esigenze"
        icona={<IconaSpunta className="h-3.5 w-3.5" />}
        titolo="Le esigenze e il perché, nero su bianco."
        testo="Le esigenze del cliente e il perché di ogni copertura proposta sono scritti nel report, rischio per rischio."
        finestra={<FinestraEsigenze />}
        altezzaFinestra="h-[340px]"
      />
      <Piastra
        larga
        specchio
        altezzaFinestra="h-[480px] sm:h-[430px]"
        fondo="notte"
        etichetta="Controlli su soci e titolare effettivo"
        icona={<IconaPersone className="h-3.5 w-3.5" />}
        titolo="Chi c’è dietro l’azienda, controllato sulle liste."
        testo="Titolare effettivo ricavato dai soci e controllo su sanzioni internazionali, persone politicamente esposte e notizie negative. La tua decisione resta registrata con la data."
        finestra={<FinestraVerifica />}
      />
    </ul>
  );
}
