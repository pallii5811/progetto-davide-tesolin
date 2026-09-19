'use client';

import { useId, useRef, useState } from 'react';
import {
  IconaCampana,
  IconaCollegamento,
  IconaDocumento,
  IconaDomanda,
  IconaElenco,
  IconaGrafico,
  IconaLivelli,
  IconaPalazzo,
  IconaPersone,
  IconaScudo,
  IconaSpunta,
  IconaTabella,
} from './icone';

/**
 * «Il resto di quello che fa AEGIS»: le funzioni senza un pannello loro, divise in tre linguette.
 *
 * Richiesta di Simone del 19/09/2026, con la schermata di superhuman.com: una fila di linguette
 * con l'icona, e sotto tre schede con una grande icona smaltata, il titolo in due pesi e due righe
 * di testo. In più, in fondo a ogni scheda, il pezzo di interfaccia che la funzione mostra davvero:
 * le etichette sono quelle del prodotto.
 *
 * Le sei funzioni di prima («Con il cliente», «In agenzia») e tre del report («Nel report»), tutte
 * verificate sul codice:
 * - «Cosa chiedere per primo» e i pesi +10, +9, +8 di company/completeness.ts;
 * - il collegamento del questionario, con «Revoca» (dati/CollegamentoQuestionario.tsx);
 * - protesti, pregiudizievoli e procedure concorsuali, a richiesta (azienda/[id]/page.tsx);
 * - i livelli Sintetico, Motivato, Approfondito e «Le esclusioni sono dichiarate nel documento»
 *   (report/SelezioneRischi.tsx);
 * - le «Polizze in essere» del dossier, riportate nel report con compagnia, capitale e scadenza;
 * - i quattro ruoli di impostazioni/utenti, il punteggio «/100» con le fasce delle compagnie
 *   (carrier: 85 molto solida, 55 adeguata) e il nome del file CSV (portfolio/crm.ts).
 *
 * Le linguette seguono lo schema ARIA delle schede: frecce, Inizio e Fine spostano la scelta, e le
 * schede entrano con un breve movimento solo dopo un clic, mai al caricamento (axe misura il
 * contrasto a pagina appena aperta).
 */

/*
  Le icone grandi: smalto colorato che sfuma dall'alto, un riflesso nella metà superiore, un bordo
  di luce interno e un'ombra del loro colore, come le icone delle app nella pagina di Superhuman.
  Classi scritte per intero, perché Tailwind le trovi nei sorgenti.
*/
const SMALTI = {
  arancio:
    'bg-gradient-to-b from-[oklch(0.8_0.13_62)] to-[oklch(0.64_0.18_40)] shadow-[0_12px_24px_-10px_oklch(0.6_0.17_42/0.7)]',
  rosa: 'bg-gradient-to-b from-[oklch(0.76_0.14_355)] to-[oklch(0.56_0.2_348)] shadow-[0_12px_24px_-10px_oklch(0.52_0.2_348/0.7)]',
  ambra:
    'bg-gradient-to-b from-[oklch(0.82_0.14_85)] to-[oklch(0.66_0.16_62)] shadow-[0_12px_24px_-10px_oklch(0.62_0.15_62/0.7)]',
  viola:
    'bg-gradient-to-b from-[oklch(0.74_0.13_295)] to-[oklch(0.52_0.19_287)] shadow-[0_12px_24px_-10px_oklch(0.48_0.19_287/0.7)]',
  menta:
    'bg-gradient-to-b from-[oklch(0.8_0.11_172)] to-[oklch(0.58_0.12_190)] shadow-[0_12px_24px_-10px_oklch(0.54_0.12_190/0.7)]',
  blu: 'bg-gradient-to-b from-[oklch(0.74_0.12_252)] to-[oklch(0.5_0.17_262)] shadow-[0_12px_24px_-10px_oklch(0.46_0.17_262/0.7)]',
  petrolio:
    'bg-gradient-to-b from-[oklch(0.7_0.09_212)] to-[oklch(0.46_0.09_222)] shadow-[0_12px_24px_-10px_oklch(0.42_0.09_222/0.7)]',
  verde:
    'bg-gradient-to-b from-[oklch(0.8_0.13_148)] to-[oklch(0.58_0.14_156)] shadow-[0_12px_24px_-10px_oklch(0.54_0.14_156/0.7)]',
  grafite:
    'bg-gradient-to-b from-[oklch(0.52_0.02_265)] to-[oklch(0.26_0.015_265)] shadow-[0_12px_24px_-10px_rgba(16,24,40,0.6)]',
} as const;

function IconaSmaltata({ smalto, children }: { smalto: keyof typeof SMALTI; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`relative flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-white ring-1 ring-inset ring-white/25 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${SMALTI[smalto]}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
      <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-black/10" />
      <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)] [&>svg]:h-[28px] [&>svg]:w-[28px]">
        {children}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I pezzi di interfaccia in fondo alle schede
// ─────────────────────────────────────────────────────────────────────────────

/** Il riquadro bianco che li contiene, come una finestrella del prodotto. */
function Pezzo({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-vetrina-linea bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-16px_rgba(16,24,40,0.25)]"
    >
      {children}
    </div>
  );
}

function PezzoDomande() {
  return (
    <Pezzo>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-vetrina-grigio">
        Cosa chiedere per primo
      </p>
      <ol className="mt-2 space-y-1.5">
        {[
          ['+10', 'Superficie degli immobili (mq)'],
          ['+9', 'Quota di export e mercati di destinazione'],
          ['+8', 'Numero di dipendenti'],
        ].map(([peso, voce]) => (
          <li key={voce} className="flex items-start gap-2 text-[12px]">
            <span className="w-9 shrink-0 rounded-full border border-vetrina-linea bg-vetrina-carta py-px text-center text-[11px] font-semibold tabular-nums text-vetrina-grigio">
              {peso}
            </span>
            {/* A capo e non troncata: «Quota di export e mercati di destinazione» a 360 pixel non ci sta. */}
            <span className="min-w-0 pt-px font-medium leading-snug text-vetrina-inchiostro">{voce}</span>
          </li>
        ))}
      </ol>
    </Pezzo>
  );
}

function PezzoQuestionario() {
  return (
    <Pezzo>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_150)] text-[oklch(0.45_0.12_150)] ring-1 ring-inset ring-[oklch(0.45_0.12_150/0.15)]">
          <IconaCollegamento className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-vetrina-inchiostro">Collegamento attivo</p>
          <p className="text-[11px] leading-snug text-vetrina-grigio">
            Ultima compilazione: 18 settembre 2026 alle ore 18:42.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2 text-[11.5px]">
        <span className="rounded-full border border-vetrina-linea px-2.5 py-1 text-vetrina-inchiostro">
          Genera un nuovo collegamento
        </span>
        <span className="rounded-full border border-vetrina-linea px-2.5 py-1 text-vetrina-grigio">
          Revoca
        </span>
      </div>
    </Pezzo>
  );
}

function PezzoProtesti() {
  return (
    <Pezzo>
      <ul className="space-y-1.5 text-[12px]">
        {['Nessun protesto', 'Nessuna pregiudizievole', 'Nessuna procedura concorsuale'].map((voce) => (
          <li key={voce} className="flex items-center gap-2 font-medium text-vetrina-inchiostro">
            <IconaSpunta className="h-4 w-4 shrink-0 text-[oklch(0.5_0.13_150)]" />
            {voce}
          </li>
        ))}
      </ul>
    </Pezzo>
  );
}

function PezzoLivelli() {
  return (
    <Pezzo>
      <p className="text-[11px] text-vetrina-grigio">Dettaglio:</p>
      <div className="mt-1.5 flex gap-0.5 rounded-full border border-vetrina-linea bg-vetrina-carta p-0.5 text-[12px]">
        <span className="flex-1 rounded-full px-2 py-1 text-center text-vetrina-grigio">Sintetico</span>
        <span className="flex-1 rounded-full bg-vetrina-inchiostro px-2 py-1 text-center font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.2)]">
          Motivato
        </span>
        <span className="flex-1 rounded-full px-2 py-1 text-center text-vetrina-grigio">Approfondito</span>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-vetrina-grigio">
        Con il perché di ogni valutazione.
      </p>
    </Pezzo>
  );
}

function Casella({ spuntata }: { spuntata: boolean }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] ${
        spuntata ? 'bg-vetrina-blu text-white' : 'border border-vetrina-grigio/60 bg-white'
      }`}
    >
      {spuntata && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2l2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function PezzoSelezione() {
  return (
    <Pezzo>
      <ul className="space-y-1.5 text-[12px]">
        {[
          ['Incendio di fabbricati e contenuto', true],
          ['Alluvione, inondazione, frana', true],
          ['Responsabilità civile verso terzi', false],
        ].map(([voce, dentro]) => (
          <li key={String(voce)} className="flex items-center gap-2">
            <Casella spuntata={dentro === true} />
            <span
              className={`truncate ${dentro === true ? 'font-medium text-vetrina-inchiostro' : 'text-vetrina-grigio'}`}
            >
              {voce}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-vetrina-linea pt-2 text-[11px] leading-snug text-vetrina-grigio">
        2 rischi su 3. Le esclusioni sono dichiarate nel documento.
      </p>
    </Pezzo>
  );
}

function PezzoPolizze() {
  return (
    <Pezzo>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-vetrina-grigio">
        Coperture attualmente in essere
      </p>
      {[
        ['Incendio ed eventi complementari', 'Compagnia A', '1,8 mln €'],
        ['RCT — Responsabilità civile verso terzi', 'Compagnia B', '2 mln €'],
      ].map(([garanzia, compagnia, capitale]) => (
        <div
          key={garanzia}
          className="flex items-start justify-between gap-3 border-b border-vetrina-linea py-2 last:border-b-0 last:pb-0"
        >
          <span className="min-w-0">
            <span className="block text-[12px] font-medium leading-snug text-vetrina-inchiostro">
              {garanzia}
            </span>
            <span className="block text-[11px] tabular-nums text-vetrina-grigio">
              {compagnia} · scade il 31/03/2027
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-vetrina-inchiostro">
            {capitale}
          </span>
        </div>
      ))}
    </Pezzo>
  );
}

function PezzoRuoli() {
  return (
    <Pezzo>
      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        {['Amministratore', 'Broker', 'Assistente', 'Sola lettura'].map((ruolo, i) => (
          <span
            key={ruolo}
            className={`rounded-full px-2.5 py-1 ${
              i === 0
                ? 'bg-vetrina-inchiostro font-medium text-white'
                : 'border border-vetrina-linea bg-vetrina-carta text-vetrina-inchiostro'
            }`}
          >
            {ruolo}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-snug text-vetrina-grigio">
        Tutto, compresa la gestione degli utenti dello studio.
      </p>
    </Pezzo>
  );
}

function PezzoCompagnie() {
  return (
    <Pezzo>
      {[
        { nome: 'Compagnia A', punteggio: 88, fascia: 'Molto solida', tono: 'verde' },
        { nome: 'Compagnia B', punteggio: 61, fascia: 'Adeguata', tono: 'ambra' },
      ].map((c) => (
        <div key={c.nome} className="py-1.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate font-medium text-vetrina-inchiostro">{c.nome}</span>
            <span
              className={`shrink-0 text-[11.5px] font-medium tabular-nums ${
                c.tono === 'verde' ? 'text-[oklch(0.45_0.12_150)]' : 'text-[oklch(0.48_0.13_65)]'
              }`}
            >
              {c.punteggio}/100 · {c.fascia}
            </span>
          </div>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-vetrina-velo">
            <span
              className={`block h-full rounded-full ${
                c.tono === 'verde' ? 'bg-[oklch(0.62_0.15_150)]' : 'bg-[oklch(0.72_0.16_75)]'
              }`}
              style={{ width: `${c.punteggio}%` }}
            />
          </span>
        </div>
      ))}
    </Pezzo>
  );
}

function PezzoCsv() {
  return (
    <Pezzo>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_150)] text-[oklch(0.45_0.12_150)] ring-1 ring-inset ring-[oklch(0.45_0.12_150/0.15)]">
          <IconaTabella className="h-4 w-4" />
        </span>
        <p className="min-w-0 break-all font-mono text-[11.5px] leading-snug text-vetrina-inchiostro">
          crm-in-trattativa-2026-09-19.csv
        </p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-vetrina-grigio">
        <span>Filtro: in trattativa</span>
        <span className="shrink-0 rounded-full bg-vetrina-inchiostro px-2.5 py-1 font-medium text-white">
          Esporta in CSV
        </span>
      </div>
    </Pezzo>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le linguette
// ─────────────────────────────────────────────────────────────────────────────

interface Scheda {
  readonly icona: React.ReactNode;
  readonly smalto: keyof typeof SMALTI;
  /** Il titolo in due pesi: la parte in grassetto e il seguito, come «Perfect your writing with Grammarly». */
  readonly forte: string;
  readonly seguito: string;
  readonly testo: string;
  readonly pezzo: React.ReactNode;
}

const GRUPPI: readonly {
  readonly nome: string;
  readonly icona: React.ReactNode;
  readonly schede: readonly Scheda[];
}[] = [
  {
    nome: 'Con il cliente',
    icona: <IconaPersone className="h-[18px] w-[18px]" />,
    schede: [
      {
        icona: <IconaDomanda />,
        smalto: 'arancio',
        forte: 'Cosa chiedere',
        seguito: 'in ordine di importanza',
        testo:
          'AEGIS mette in fila le domande da fare al cliente, a partire da quelle che spostano di più il risultato: superfici, export, numero di dipendenti.',
        pezzo: <PezzoDomande />,
      },
      {
        icona: <IconaCollegamento />,
        smalto: 'rosa',
        forte: 'Il questionario',
        seguito: 'lo compila il cliente',
        testo:
          'Gli mandi un link e scorte, veicoli e lavori in cantiere li scrive lui. Le risposte finiscono nella scheda senza ricopiare niente, e il link lo disattivi quando vuoi.',
        pezzo: <PezzoQuestionario />,
      },
      {
        icona: <IconaCampana />,
        smalto: 'ambra',
        forte: 'Protesti e procedure',
        seguito: 'a richiesta',
        testo:
          'Prima di lavorare un’azienda verifichi, a richiesta, protesti, pregiudizievoli e procedure concorsuali.',
        pezzo: <PezzoProtesti />,
      },
    ],
  },
  {
    nome: 'Nel report',
    icona: <IconaDocumento className="h-[18px] w-[18px]" />,
    schede: [
      {
        icona: <IconaLivelli />,
        smalto: 'viola',
        forte: 'Tre livelli',
        seguito: 'di dettaglio',
        testo:
          'Sintetico per una revisione rapida, motivato con il perché di ogni valutazione, approfondito con i controlli attesi e i riferimenti normativi. L’analisi è la stessa: cambia quanto ne finisce sulla carta.',
        pezzo: <PezzoLivelli />,
      },
      {
        icona: <IconaElenco />,
        smalto: 'menta',
        forte: 'Scegli i rischi',
        seguito: 'da portare',
        testo:
          'Vai dal cliente per la parte property? Togli dalla copia la RC, che vedrete il mese dopo. I rischi esclusi sono elencati nel documento, e la valutazione resta intera.',
        pezzo: <PezzoSelezione />,
      },
      {
        icona: <IconaScudo />,
        smalto: 'blu',
        forte: 'Le polizze',
        seguito: 'che ha già',
        testo:
          'Inserisci le polizze in essere: il report le elenca con compagnia, capitale e scadenza, e segnala quando il capitale non basta.',
        pezzo: <PezzoPolizze />,
      },
    ],
  },
  {
    nome: 'In agenzia',
    icona: <IconaPalazzo className="h-[18px] w-[18px]" />,
    schede: [
      {
        icona: <IconaPersone />,
        smalto: 'petrolio',
        forte: 'Tutta l’agenzia',
        seguito: 'sullo stesso account',
        testo:
          'Quattro ruoli, dal titolare a chi deve solo consultare: ognuno vede e fa quello che gli spetta. Ogni agenzia vede solo i propri clienti.',
        pezzo: <PezzoRuoli />,
      },
      {
        icona: <IconaGrafico />,
        smalto: 'verde',
        forte: 'Le compagnie',
        seguito: 'a confronto',
        testo:
          'Riporti i dati della SFCR delle compagnie con cui lavori e ne confronti la solidità. Ti serve quando il cliente chiede perché proprio quella.',
        pezzo: <PezzoCompagnie />,
      },
      {
        icona: <IconaTabella />,
        smalto: 'grafite',
        forte: 'Il CRM',
        seguito: 'in un file',
        testo: 'Esporti le aziende del CRM in CSV, con il filtro che stai guardando, e lo apri in Excel.',
        pezzo: <PezzoCsv />,
      },
    ],
  },
];

export function SchedeFunzioni() {
  const base = useId();
  const [attivo, setAttivo] = useState(0);
  // Il movimento d'entrata solo dopo una scelta: al caricamento le schede sono già ferme.
  const [scelto, setScelto] = useState(false);
  const linguette = useRef<(HTMLButtonElement | null)[]>([]);

  const scegli = (indice: number, fuoco: boolean) => {
    setAttivo(indice);
    setScelto(true);
    if (fuoco) linguette.current[indice]?.focus();
  };

  const tasto = (evento: React.KeyboardEvent, indice: number) => {
    const n = GRUPPI.length;
    const destinazioni: Record<string, number> = {
      ArrowRight: (indice + 1) % n,
      ArrowLeft: (indice - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const prossimo = destinazioni[evento.key];
    if (prossimo === undefined) return;
    evento.preventDefault();
    scegli(prossimo, true);
  };

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Le altre funzioni"
        className="grid grid-cols-3 border-b border-vetrina-linea"
      >
        {GRUPPI.map((gruppo, i) => {
          const selezionata = i === attivo;
          return (
            <button
              key={gruppo.nome}
              ref={(el) => {
                linguette.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-linguetta-${i}`}
              aria-selected={selezionata}
              aria-controls={`${base}-pannello-${i}`}
              tabIndex={selezionata ? 0 : -1}
              onClick={() => scegli(i, false)}
              onKeyDown={(evento) => tasto(evento, i)}
              className={`relative -mb-px flex items-center justify-center gap-2 whitespace-nowrap px-2 pb-4 pt-2 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vetrina-blu sm:text-[17px] ${
                selezionata
                  ? 'font-medium text-vetrina-inchiostro'
                  : 'text-vetrina-grigio hover:text-vetrina-inchiostro'
              }`}
            >
              <span className="hidden sm:inline-flex">{gruppo.icona}</span>
              {gruppo.nome}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-vetrina-inchiostro transition-transform duration-300 motion-reduce:transition-none ${
                  selezionata ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          );
        })}
      </div>

      {GRUPPI.map((gruppo, i) => (
        <div
          key={gruppo.nome}
          role="tabpanel"
          id={`${base}-pannello-${i}`}
          aria-labelledby={`${base}-linguetta-${i}`}
          hidden={i !== attivo}
          tabIndex={0}
          className="rounded-3xl pt-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vetrina-blu"
        >
          <ul className="grid gap-5 lg:grid-cols-3">
            {gruppo.schede.map((scheda, j) => (
              <li
                // La chiave cambia con la scelta, così il movimento d'entrata riparte a ogni clic.
                key={`${scheda.forte}-${scelto ? attivo : 'fermo'}`}
                className={`group flex min-w-0 flex-col rounded-[24px] md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-center md:gap-x-10 lg:flex lg:flex-col lg:items-stretch bg-[oklch(0.955_0.007_80)] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_0_0_1px_rgba(16,24,40,0.04)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_0_0_1px_rgba(16,24,40,0.05),0_20px_40px_-24px_rgba(16,24,40,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-8 ${
                  scelto ? 'vetrina-scheda-entra' : ''
                }`}
                style={scelto ? { animationDelay: `${j * 70}ms` } : undefined}
              >
                <div>
                  <IconaSmaltata smalto={scheda.smalto}>{scheda.icona}</IconaSmaltata>
                  <h3 className="mt-7 text-[21px] leading-[1.22] tracking-[-0.025em] text-vetrina-inchiostro sm:text-[22px]">
                    <span className="block font-semibold">{scheda.forte}</span>
                    <span className="block font-normal">{scheda.seguito}</span>
                  </h3>
                  <p className="mt-3 text-pretty text-[15px] leading-[1.6] text-vetrina-grigio">
                    {scheda.testo}
                  </p>
                </div>
                <div className="mt-6 md:mt-0 lg:mt-auto lg:pt-6">{scheda.pezzo}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
