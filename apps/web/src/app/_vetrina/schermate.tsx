import { IconaDocumento, IconaEuro, IconaLucchetto, IconaPalazzo, IconaSisma } from './icone';
import { Etichetta, Tessera, colorePunteggio } from './pezzi';
import type { ToneEtichetta } from './pezzi';

/**
 * Le cinque schermate del giro in apertura (TourProdotto.tsx): il percorso di chi usa AEGIS, dalla
 * ricerca al report. Richiesta di Simone del 19/09/2026: «nel mockup ci siano tutte le varie
 * schermate che vede l'utente, nella scheda aziendale, nel CRM… tutto il flusso utente».
 *
 * Ogni schermata ricalca quella vera, con le sue etichette: i campi e i pulsanti di Ricerca Clienti
 * (prospect/page.tsx), le colonne e gli stati del CRM (portafoglio/page.tsx, core/portfolio/crm.ts),
 * la scheda (azienda/[id]/page.tsx), i dati di intervista (azienda/[id]/dati) e il report
 * (azienda/[id]/report). Le aziende e i valori sono di esempio, gli stessi delle altre
 * illustrazioni: Logistica Orobia a Dello (BS), media impresa, fatturato 19,8 milioni.
 *
 * Le animazioni interne sono classi CSS (globals.css, «Il giro del prodotto»): partono quando la
 * schermata diventa quella attiva, ognuna col suo ritardo in `--r`, e per chi ha chiesto meno
 * movimento non partono affatto — lo stato finale compare subito.
 */

type Stile = React.CSSProperties & Record<`--${string}`, string>;

/** Il ritardo di un elemento che entra, in millisecondi. */
const r = (ms: number): Stile => ({ '--r': `${ms}ms` });

function Titolo({ testo, sotto }: { testo: string; sotto: string }) {
  return (
    <div className="tour-entra" style={r(0)}>
      <p className="text-[19px] font-semibold tracking-[-0.03em] sm:text-[21px]">{testo}</p>
      <p className="mt-0.5 text-[12.5px] text-vetrina-grigio">{sotto}</p>
    </div>
  );
}

function Carta({
  children,
  className = '',
  ritardo = 0,
}: {
  children: React.ReactNode;
  className?: string;
  ritardo?: number;
}) {
  return (
    <div
      className={`tour-entra rounded-2xl border border-vetrina-linea bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
      style={r(ritardo)}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Ricerca Clienti
// ─────────────────────────────────────────────────────────────────────────────

const CAMPI_RICERCA = [
  ['Città', 'Brescia (BS)'],
  ['Codice ATECO', '5210'],
  ['Dipendenti min.', '20'],
  ['Dipendenti max.', '250'],
  ['Fatturato min.', '2000000'],
  ['Fatturato max.', ''],
  ['Forma giuridica', 'Tutte le forme'],
  ['Numero di aziende', '5'],
] as const;

export function SchermataRicerca() {
  return (
    <div className="space-y-4">
      <Titolo testo="Trova nuove aziende" sotto="Cerca le imprese che corrispondono ai tuoi criteri." />
      <Carta className="p-4" ritardo={80}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-4">
          {CAMPI_RICERCA.map(([etichetta, valore], i) => (
            <div key={etichetta} className={`min-w-0 ${i >= 4 ? 'hidden lg:block' : ''}`}>
              <p className="truncate text-[11px] font-medium text-vetrina-grigio">{etichetta}</p>
              <div
                className="tour-entra mt-1 truncate rounded-lg border border-vetrina-linea bg-white px-2.5 py-1.5 text-[12.5px]"
                style={r(220 + i * 90)}
              >
                {valore === '' ? <span className="text-vetrina-grigio">nessun limite</span> : valore}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="tour-premuto inline-flex items-center gap-1.5 rounded-full border border-vetrina-linea bg-white px-3.5 py-1.5 text-[12.5px] font-medium"
            style={r(1150)}
          >
            Conta Aziende{' '}
            <span className="tour-premuto-nota font-normal text-vetrina-grigio">non consuma crediti</span>
          </span>
          <span className="rounded-full bg-vetrina-inchiostro px-3.5 py-1.5 text-[12.5px] font-medium text-white">
            Crea Elenco
          </span>
        </div>
      </Carta>
      <Carta className="flex items-center justify-between gap-4 p-4" ritardo={1500}>
        <div>
          <p className="text-[26px] font-semibold leading-none tracking-[-0.04em]">38</p>
          <p className="mt-1 text-[12.5px] text-vetrina-grigio">aziende corrispondono ai criteri</p>
        </div>
        <p className="hidden text-right text-[12px] text-vetrina-grigio sm:block">
          L’elenco si chiede con{' '}
          <strong className="font-semibold text-vetrina-inchiostro">Crea Elenco</strong>, qui sopra.
        </p>
      </Carta>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · CRM
// ─────────────────────────────────────────────────────────────────────────────

const RIGHE_CRM: readonly {
  nome: string;
  dove: string;
  stato: string;
  tono: ToneEtichetta;
  nota: string;
  scelta?: true;
}[] = [
  {
    nome: 'Nordvalle Meccanica S.r.l.',
    dove: 'Bergamo · 28',
    stato: 'In trattativa',
    tono: 'ambra',
    nota: 'Sopralluogo lunedì',
  },
  {
    nome: 'Logistica Orobia S.p.A.',
    dove: 'Dello · 52',
    stato: 'Da contattare',
    tono: 'neutro',
    nota: 'Dall’elenco Brescia · ATECO 52',
    scelta: true,
  },
  {
    nome: 'Tessiture Serio S.r.l.',
    dove: 'Alzano Lombardo · 13',
    stato: 'Da contattare',
    tono: 'neutro',
    nota: '',
  },
  {
    nome: 'Galvanica Brembana S.r.l.',
    dove: 'Treviolo · 25',
    stato: 'Contattata',
    tono: 'neutro',
    nota: 'Richiamare a ottobre',
  },
  {
    nome: 'Carpenterie Alte Valli S.r.l.',
    dove: 'Seriate · 25',
    stato: 'Cliente',
    tono: 'verde',
    nota: 'Rinnovo a marzo',
  },
];

export function SchermataCrm() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Titolo testo="CRM" sotto="Le aziende analizzate e quelle degli elenchi, in ordine di priorità." />
        <span
          className="tour-entra hidden shrink-0 rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[12px] sm:inline"
          style={r(60)}
        >
          Esporta in CSV
        </span>
      </div>
      <div className="tour-entra flex gap-1.5 overflow-hidden text-[12px]" style={r(120)}>
        {['Tutte (5)', 'Da contattare (2)', 'Contattata (1)', 'In trattativa (1)', 'Cliente (1)'].map(
          (f, i) => (
            <span
              key={f}
              className={`shrink-0 rounded-full px-3 py-1 ${
                i === 0
                  ? 'bg-vetrina-inchiostro font-medium text-white'
                  : 'border border-vetrina-linea bg-white text-vetrina-grigio'
              }`}
            >
              {f}
            </span>
          ),
        )}
      </div>
      <Carta className="overflow-hidden" ritardo={200}>
        <div className="grid grid-cols-[1.6fr_1fr] gap-3 border-b border-vetrina-linea bg-vetrina-carta px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.05em] text-vetrina-grigio sm:grid-cols-[1.6fr_0.9fr_1.2fr]">
          <span>Azienda</span>
          <span className="hidden sm:block">Contatti</span>
          <span>Stato e nota</span>
        </div>
        {RIGHE_CRM.map((riga, i) => (
          <div
            key={riga.nome}
            className="tour-entra relative grid grid-cols-[1.6fr_1fr] items-center gap-3 border-b border-vetrina-linea px-4 py-2.5 last:border-b-0 sm:grid-cols-[1.6fr_0.9fr_1.2fr]"
            style={r(300 + i * 90)}
          >
            {riga.scelta === true && (
              <span className="tour-evidenzia pointer-events-none absolute inset-0" style={r(1500)} />
            )}
            <div className="relative min-w-0">
              <p className="truncate text-[12.5px] font-medium">{riga.nome}</p>
              <p className="truncate text-[11px] text-vetrina-grigio">{riga.dove}</p>
            </div>
            <p className="relative hidden truncate text-[11.5px] text-vetrina-blu sm:block">
              Telefono · PEC · Sito
            </p>
            <div className="relative flex min-w-0 items-center gap-2">
              <Etichetta tono={riga.tono}>{riga.stato}</Etichetta>
              <span className="hidden truncate text-[11.5px] text-vetrina-grigio sm:inline">
                {riga.nota}
              </span>
            </div>
          </div>
        ))}
      </Carta>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Scheda azienda
// ─────────────────────────────────────────────────────────────────────────────

/** Un anello che si riempie quando la schermata diventa attiva (`tour-anello` in globals.css). */
function AnelloTour({
  valore,
  testo,
  dimensione,
  ritardo,
}: {
  valore: number;
  testo: string;
  dimensione: number;
  ritardo: number;
}) {
  const resto = Math.round((100 - (Math.min(7, valore) / 7) * 100) * 100) / 100;
  return (
    <svg viewBox="0 0 64 64" width={dimensione} height={dimensione} aria-hidden="true" className="shrink-0">
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        strokeWidth="7"
        style={{ stroke: 'oklch(0.93 0.005 85)' }}
      />
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100 100"
        transform="rotate(-90 32 32)"
        className="tour-anello"
        style={{ stroke: colorePunteggio(valore), '--resto': `${resto}px`, '--r': `${ritardo}ms` } as Stile}
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

function Rischio({
  titolo,
  valore,
  sotto,
  segno,
  ritardo,
}: {
  titolo: string;
  valore: string;
  sotto: string;
  segno: React.ReactNode;
  ritardo: number;
}) {
  return (
    <Carta className="p-3.5" ritardo={ritardo}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] text-vetrina-grigio">{titolo}</p>
          <p className="mt-0.5 truncate text-[18px] font-semibold tracking-[-0.03em] tabular-nums">
            {valore}
          </p>
        </div>
        {segno}
      </div>
      <p className="mt-1.5 line-clamp-1 text-[11.5px] text-vetrina-grigio">{sotto}</p>
    </Carta>
  );
}

export function SchermataScheda() {
  return (
    <div className="space-y-3.5">
      <div className="tour-entra flex items-center justify-between gap-3" style={r(0)}>
        <div className="flex min-w-0 items-center gap-3">
          <Tessera tono="blu">
            <IconaPalazzo />
          </Tessera>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.025em]">
              <span className="truncate">Logistica Orobia S.p.A.</span>
              <Etichetta tono="verde">attiva</Etichetta>
            </p>
            <p className="truncate text-[11.5px] text-vetrina-grigio">
              Dello (BS) · 52.10 Magazzinaggio e custodia · Media impresa · 118 dipendenti
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-vetrina-inchiostro px-3 py-1.5 text-[12px] font-medium text-white lg:inline-flex">
          <IconaDocumento className="h-3.5 w-3.5" />
          Report per il cliente
        </span>
      </div>
      <div
        className="tour-entra flex gap-1 overflow-hidden rounded-full border border-vetrina-linea bg-vetrina-carta p-1 text-[11.5px]"
        style={r(80)}
      >
        {[
          'Property Risk',
          'Business Interruption',
          'Cyber Risk',
          'Eventi negativi',
          'Profilo dell’impresa',
        ].map((v, i) => (
          <span
            key={v}
            className={`shrink-0 rounded-full px-2.5 py-1 ${
              i === 0
                ? 'bg-white font-medium shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-vetrina-linea)]'
                : 'text-vetrina-grigio'
            }`}
          >
            {v}
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Rischio
          titolo="Property Risk"
          valore="5,17 su 7"
          sotto="Ubicazione più esposta: sede legale"
          ritardo={180}
          segno={
            <Tessera tono="blu">
              <IconaPalazzo />
            </Tessera>
          }
        />
        <Rischio
          titolo="Business Interruption"
          valore="54.246,58 € al giorno"
          sotto="30 giorni di fermo: 1.627.397,40 €"
          ritardo={260}
          segno={
            <Tessera tono="arancio">
              <IconaEuro />
            </Tessera>
          }
        />
        <Rischio
          titolo="Cyber Risk"
          valore="5,1 su 7"
          sotto="ATECO 52 · magazzinaggio"
          ritardo={340}
          segno={
            <Tessera tono="petrolio">
              <IconaLucchetto />
            </Tessera>
          }
        />
      </div>
      <div className="hidden gap-3 md:grid md:grid-cols-3">
        {[
          { titolo: 'Rischio incendio', valore: 5, testo: '5', righe: null },
          {
            titolo: 'Calamità naturali',
            valore: 5.34,
            testo: '5,34',
            righe: [
              ['Alluvione', '7/7'],
              ['Sisma', '3/7'],
              ['Frana', '1/7'],
            ],
          },
          { titolo: 'Overall Risk Score', valore: 5.17, testo: '5,17', righe: null },
        ].map((c, i) => (
          <Carta
            key={c.titolo}
            className={`flex flex-col items-center px-3 pb-3 pt-3 ${i === 2 ? 'border-vetrina-blu/40' : ''}`}
            ritardo={420 + i * 90}
          >
            <p className="text-[11.5px] font-semibold">{c.titolo}</p>
            <div className="mt-1.5">
              <AnelloTour valore={c.valore} testo={c.testo} dimensione={72} ritardo={600 + i * 150} />
            </div>
            {c.righe === null ? (
              <p className="mt-1.5 text-center text-[11px] text-vetrina-grigio">
                {i === 0 ? 'Dal tipo di attività e di edificio' : 'Property Risk di questa sede'}
              </p>
            ) : (
              <div className="mt-1 w-full divide-y divide-vetrina-linea text-[11px]">
                {c.righe.map(([voce, v]) => (
                  <div key={voce} className="flex justify-between py-0.5">
                    <span className="text-vetrina-grigio">{voce}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </Carta>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Dati di intervista
// ─────────────────────────────────────────────────────────────────────────────

export function SchermataIntervista() {
  return (
    <div className="space-y-3.5">
      <div className="tour-entra" style={r(0)}>
        <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-vetrina-blu">
          ← Logistica Orobia S.p.A.
        </p>
        <p className="mt-1 text-[19px] font-semibold tracking-[-0.03em] sm:text-[21px]">
          Dati di intervista
        </p>
        <p className="mt-0.5 text-[12.5px] text-vetrina-grigio">Ciò che il bilancio non può dire.</p>
      </div>
      <Carta className="p-4" ritardo={100}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12.5px] font-semibold">
            Completezza dell’analisi: <span className="tabular-nums">41%</span>
          </p>
          <p className="text-[11px] text-vetrina-grigio">7 campi su 17</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-vetrina-velo">
          <div
            className="tour-riempie h-full rounded-full bg-vetrina-blu"
            style={{ '--fino': '41%', '--r': '350ms' } as Stile}
          />
        </div>
        <p className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.05em] text-vetrina-grigio">
          Cosa chiedere per primo
        </p>
        <div className="mt-1.5 space-y-1.5">
          {[
            ['+10', 'Superficie degli immobili (mq)', 'Somme assicurande'],
            ['+9', 'Quota di export e mercati di destinazione', 'Dimensionamento dei massimali'],
            ['+7', 'Trattamento di dati personali', 'Dimensionamento dei massimali'],
          ].map(([peso, voce, dove], i) => (
            <div
              key={voce}
              className="tour-entra flex items-center gap-2.5 text-[12px]"
              style={r(500 + i * 110)}
            >
              <span className="shrink-0 rounded-full border border-vetrina-linea bg-vetrina-carta px-1.5 text-[10.5px] font-semibold tabular-nums text-vetrina-grigio">
                {peso}
              </span>
              <span className="min-w-0 truncate font-medium">{voce}</span>
              <span className="hidden shrink-0 text-[11px] text-vetrina-grigio sm:inline">· {dove}</span>
            </div>
          ))}
        </div>
      </Carta>
      <Carta className="p-4" ritardo={260}>
        <p className="text-[13px] font-semibold">Attività e mercati</p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium text-vetrina-grigio">Esporta verso USA o Canada</p>
            <div className="mt-1 flex gap-1 rounded-lg border border-vetrina-linea bg-vetrina-carta p-0.5 text-[12px]">
              <span className="flex-1 rounded-md py-1 text-center text-vetrina-grigio">Sì</span>
              <span className="tour-scegli flex-1 rounded-md py-1 text-center" style={r(1500)}>
                No
              </span>
              <span className="tour-lascia flex-1 rounded-md py-1 text-center" style={r(1500)}>
                Non so
              </span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-vetrina-grigio">Quota di export</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex-1 rounded-lg border border-vetrina-linea bg-white px-2.5 py-1 text-[12.5px] tabular-nums">
                12
              </span>
              <span className="text-[12px] text-vetrina-grigio">%</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-vetrina-linea pt-3">
          <p className="text-[11.5px] text-vetrina-grigio">Far compilare al cliente</p>
          <span className="rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[12px] font-medium">
            Genera collegamento
          </span>
        </div>
      </Carta>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Report per il cliente
// ─────────────────────────────────────────────────────────────────────────────

const CAPITOLI = [
  'Sintesi per la direzione',
  'Richieste ed esigenze rilevate',
  'Determinazione dei capitali da assicurare',
  'Coperture proposte e motivazione dell’adeguatezza',
  'Obbligo assicurativo contro le calamità naturali',
  'Limiti e avvertenze',
] as const;

export function SchermataReport() {
  return (
    <div className="space-y-3.5">
      <div className="tour-entra flex flex-wrap items-center justify-between gap-2" style={r(0)}>
        <p className="text-[12px] text-vetrina-blu">← Torna all’analisi</p>
        <div className="flex items-center gap-2">
          <span className="hidden gap-0.5 rounded-full border border-vetrina-linea bg-vetrina-carta p-0.5 text-[11.5px] sm:flex">
            <span className="rounded-full px-2.5 py-0.5 text-vetrina-grigio">Sintetico</span>
            <span className="rounded-full bg-vetrina-inchiostro px-2.5 py-0.5 font-medium text-white">
              Motivato
            </span>
            <span className="rounded-full px-2.5 py-0.5 text-vetrina-grigio">Approfondito</span>
          </span>
          <span className="rounded-full bg-vetrina-inchiostro px-3 py-1 text-[12px] font-medium text-white">
            Stampa o salva in PDF
          </span>
        </div>
      </div>
      {/* Il foglio: bianco, con l'ombra di un documento, e l'intestazione dell'agenzia in cima. */}
      <div
        className="tour-entra mx-auto max-w-[620px] rounded-xl border border-vetrina-linea bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_24px_48px_-24px_rgba(16,24,40,0.3)] sm:px-7 sm:py-5"
        style={r(120)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-vetrina-linea pb-2.5">
          <span className="flex items-center gap-2 text-[11.5px] font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-vetrina-blu text-[10px] text-white">
              A
            </span>
            La tua agenzia
          </span>
          <span className="text-[10.5px] tabular-nums text-vetrina-grigio">RUI A•••••••••</span>
        </div>
        <p className="mt-3 text-[9.5px] font-medium uppercase tracking-[0.12em] text-vetrina-grigio">
          Analisi dei rischi e verifica delle coperture assicurative
        </p>
        <p className="mt-1 text-[18px] font-bold tracking-[-0.03em]">LOGISTICA OROBIA S.P.A.</p>
        <p className="text-[10.5px] text-vetrina-grigio">Metodologia ISO 31000:2018</p>
        <ol className="mt-3 space-y-1.5">
          {CAPITOLI.map((capitolo, i) => (
            <li
              key={capitolo}
              className="tour-entra relative flex items-center gap-2.5 overflow-hidden rounded-lg px-2 py-1 text-[12px]"
              style={r(300 + i * 120)}
            >
              {i === 4 && (
                <span className="tour-evidenzia pointer-events-none absolute inset-0" style={r(1600)} />
              )}
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-vetrina-velo text-[10.5px] font-semibold text-vetrina-grigio">
                {i + 1}
              </span>
              <span className="relative min-w-0 flex-1 truncate">{capitolo}</span>
              {i === 4 ? (
                <span className="relative hidden items-center gap-1 sm:flex">
                  <IconaSisma className="h-3.5 w-3.5 text-vetrina-magenta" />
                  <Etichetta tono="ambra">soggetta</Etichetta>
                </span>
              ) : (
                <span className="relative h-1.5 w-12 shrink-0 rounded-full bg-vetrina-linea" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Le cinque schermate in ordine, con il nome che la cornice della finestra mostra. */
export const SCHERMATE = [
  { chiave: 'ricerca', nome: 'Ricerca Clienti', Schermata: SchermataRicerca, voce: 'ricerca' },
  { chiave: 'crm', nome: 'CRM', Schermata: SchermataCrm, voce: 'crm' },
  { chiave: 'scheda', nome: 'Scheda azienda', Schermata: SchermataScheda, voce: 'crm' },
  { chiave: 'intervista', nome: 'Dati di intervista', Schermata: SchermataIntervista, voce: 'crm' },
  { chiave: 'report', nome: 'Report per il cliente', Schermata: SchermataReport, voce: 'crm' },
] as const;
