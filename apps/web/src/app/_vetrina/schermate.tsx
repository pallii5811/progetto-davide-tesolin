import { IconaDocumento, IconaEuro, IconaLucchetto, IconaPalazzo, IconaSisma, IconaSpunta } from './icone';
import { Etichetta, Tessera, colorePunteggio } from './pezzi';
import type { ToneEtichetta } from './pezzi';

/**
 * Le cinque schermate del giro in apertura (TourProdotto.tsx): il percorso di chi usa AEGIS, dalla
 * ricerca al report. Richieste di Simone del 19/09/2026: «nel mockup ci siano tutte le varie
 * schermate che vede l'utente, nella scheda aziendale, nel CRM… tutto il flusso utente», e poi «il
 * cursore del mouse che clicca i vari tasti e il mockup fa vedere le altre schermate».
 *
 * Ogni schermata ricalca quella vera, con le sue etichette: i campi e i pulsanti di Ricerca Clienti
 * (prospect/page.tsx), le colonne e gli stati del CRM (portafoglio/page.tsx, core/portfolio/crm.ts),
 * la scheda (azienda/[id]/page.tsx), i dati di intervista con la barra di salvataggio
 * (azienda/[id]/dati) e il report (azienda/[id]/report). Le aziende e i valori sono di esempio, gli
 * stessi delle altre illustrazioni: Logistica Orobia a Dello (BS), media impresa, 19,8 milioni.
 *
 * Due tipi di movimento, e non si confondono:
 * - quello che succede quando una schermata si apre (i pezzi che entrano, la barra che sale, gli
 *   anelli che si riempiono) è CSS, classi `tour-*` in globals.css con il ritardo in `--r`;
 * - quello che succede perché il cursore ha cliccato (il conteggio, la riga scelta, la risposta, il
 *   salvataggio, il PDF) arriva da fuori, come `segni`: il copione di TourProdotto li accende.
 * I pulsanti che il cursore deve raggiungere portano `data-bersaglio`, e il giro misura dove sono.
 */

type Stile = React.CSSProperties & Record<`--${string}`, string>;

/** Ciò che il cursore ha già fatto in questa schermata. */
export type Segni = ReadonlySet<string>;

/**
 * Il ritardo di un elemento che entra, in millisecondi. Scalato al 60 % il 19/09/2026 («deve essere
 * tutto più veloce tra una schermata e l'altra»): i numeri scritti nelle schermate restano leggibili
 * come proporzioni, il fattore decide il passo.
 */
const r = (ms: number): Stile => ({ '--r': `${Math.round(ms * 0.6)}ms` });

/** Le transizioni dei cambi dovuti a un clic; ferme per chi ha chiesto meno movimento. */
const CAMBIO = 'transition-all duration-300 ease-out motion-reduce:transition-none';

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

/** Un pulsante della finestra: quando il cursore lo preme diventa pieno per un attimo. */
function Pulsante({
  bersaglio,
  premuto,
  pieno = false,
  children,
  className = '',
}: {
  bersaglio?: string | undefined;
  premuto: boolean;
  pieno?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const acceso = pieno || premuto;
  return (
    <span
      data-bersaglio={bersaglio}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${CAMBIO} ${
        acceso
          ? 'border-vetrina-inchiostro bg-vetrina-inchiostro text-white'
          : 'border-vetrina-linea bg-white text-vetrina-inchiostro'
      } ${premuto ? 'scale-[0.97]' : ''} ${className}`}
    >
      {children}
    </span>
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
  ['Fatturato max.', 'nessun limite'],
  ['Forma giuridica', 'Tutte le forme'],
  ['Numero di aziende', '5'],
] as const;

export function SchermataRicerca({ segni }: { segni: Segni }) {
  const contato = segni.has('contato');
  return (
    <div className="space-y-4">
      <Titolo testo="Trova nuove aziende" sotto="Cerca le imprese che corrispondono ai tuoi criteri." />
      <Carta className="p-4" ritardo={80}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-4">
          {CAMPI_RICERCA.map(([etichetta, valore], i) => (
            <div key={etichetta} className={`min-w-0 ${i >= 4 ? 'hidden lg:block' : ''}`}>
              <p className="truncate text-[11px] font-medium text-vetrina-grigio">{etichetta}</p>
              <div
                className={`tour-entra mt-1 truncate rounded-lg border border-vetrina-linea bg-white px-2.5 py-1.5 text-[12.5px] ${
                  valore === 'nessun limite' ? 'text-vetrina-grigio' : ''
                }`}
                style={r(200 + i * 80)}
              >
                {valore}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pulsante bersaglio="conta" premuto={contato}>
            Conta Aziende
            <span className={`font-normal ${contato ? 'text-white/80' : 'text-vetrina-grigio'}`}>
              non consuma crediti
            </span>
          </Pulsante>
          <Pulsante bersaglio="crea-elenco" premuto={segni.has('elenco')} pieno>
            Crea Elenco
          </Pulsante>
        </div>
      </Carta>
      {/* Il risultato del conteggio: arriva solo quando il cursore ha premuto «Conta Aziende». */}
      <div
        className={`flex items-center justify-between gap-4 rounded-2xl border border-vetrina-linea bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${CAMBIO} ${
          contato ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        <div>
          <p className="text-[26px] font-semibold leading-none tracking-[-0.04em]">38</p>
          <p className="mt-1 text-[12.5px] text-vetrina-grigio">aziende corrispondono ai criteri</p>
        </div>
        <p className="hidden text-right text-[12px] text-vetrina-grigio sm:block">
          L’elenco si chiede con{' '}
          <strong className="font-semibold text-vetrina-inchiostro">Crea Elenco</strong>, qui sopra.
        </p>
      </div>
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

export function SchermataCrm({ segni }: { segni: Segni }) {
  const scelta = segni.has('riga');
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
            data-bersaglio={riga.scelta === true ? 'riga-orobia' : undefined}
            className={`tour-entra grid grid-cols-[1.6fr_1fr] items-center gap-3 border-b border-vetrina-linea px-4 py-2.5 last:border-b-0 sm:grid-cols-[1.6fr_0.9fr_1.2fr] ${
              riga.scelta === true && scelta
                ? 'bg-[oklch(0.96_0.02_262)] shadow-[inset_3px_0_0_var(--color-vetrina-blu)]'
                : ''
            }`}
            style={r(260 + i * 80)}
          >
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium">{riga.nome}</p>
              <p className="truncate text-[11px] text-vetrina-grigio">{riga.dove}</p>
            </div>
            <p className="hidden truncate text-[11.5px] text-vetrina-blu sm:block">Telefono · PEC · Sito</p>
            <div className="flex min-w-0 items-center gap-2">
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

export function SchermataScheda({ segni }: { segni: Segni }) {
  return (
    <div className="space-y-3.5">
      <IntestazioneAzienda premutoIntervista={false} />
      <SchedeAzienda
        aperta={0}
        premuta={segni.has('profilo') ? 4 : null}
        bersaglio={{ indice: 4, nome: 'tab-profilo' }}
      />
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
              <AnelloTour valore={c.valore} testo={c.testo} dimensione={72} ritardo={360 + i * 90} />
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
// Intestazione e schede dell'azienda, comuni alla scheda e ai dati camerali
// ─────────────────────────────────────────────────────────────────────────────

const SCHEDE_AZIENDA = [
  'Property Risk',
  'Business Interruption',
  'Cyber Risk',
  'Eventi negativi',
  'Profilo dell’impresa',
] as const;

/** Nome, stato e riga dell'azienda, con i due pulsanti della scheda vera. */
function IntestazioneAzienda({
  bersaglioIntervista,
  premutoIntervista,
}: {
  bersaglioIntervista?: string | undefined;
  premutoIntervista: boolean;
}) {
  return (
    <div className="tour-entra flex flex-wrap items-center justify-between gap-3" style={r(0)}>
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
      <div className="flex items-center gap-2">
        <Pulsante bersaglio={bersaglioIntervista} premuto={premutoIntervista}>
          Dati di intervista
        </Pulsante>
        <Pulsante premuto={false} pieno className="hidden lg:inline-flex">
          <IconaDocumento className="h-3.5 w-3.5" />
          Report per il cliente
        </Pulsante>
      </div>
    </div>
  );
}

/**
 * L'indice delle sezioni della scheda. `aperta` è quella che si sta leggendo; `premuta` è quella
 * su cui il cursore ha appena cliccato, e si accende prima che la schermata cambi.
 */
function SchedeAzienda({
  aperta,
  premuta = null,
  bersaglio,
}: {
  aperta: number;
  premuta?: number | null;
  bersaglio?: { indice: number; nome: string };
}) {
  return (
    <div
      className="tour-entra flex gap-1 overflow-hidden rounded-full border border-vetrina-linea bg-vetrina-carta p-1 text-[11.5px]"
      style={r(80)}
    >
      {SCHEDE_AZIENDA.map((v, i) => {
        const accesa = i === aperta || i === premuta;
        return (
          <span
            key={v}
            data-bersaglio={bersaglio?.indice === i ? bersaglio.nome : undefined}
            className={`shrink-0 rounded-full px-2.5 py-1 ${CAMBIO} ${
              accesa
                ? 'bg-white font-medium text-vetrina-inchiostro shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-vetrina-linea)]'
                : 'text-vetrina-grigio'
            }`}
          >
            {v}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Dati camerali (la scheda aperta su «Profilo dell'impresa»)
// ─────────────────────────────────────────────────────────────────────────────

/*
  Richiesta di Simone del 19/09/2026: «una schermata dove si vedono tutti i dati camerali». Sono le
  voci della scheda vera sotto «Profilo dell'impresa»: il record camerale, i bilanci sintetici che
  l'anagrafica porta sempre, soci e titolari effettivi, e gli indicatori che il Registro Imprese
  calcola, che arrivano con l'analisi approfondita (IndicatoriArchivio.tsx). Numeri uguali a quelli
  della finestra «Visura e bilancio» più in basso (SchedaRegistro.tsx).
*/
const RECORD_CAMERALE = [
  ['Forma giuridica', 'Società per azioni'],
  ['Camera di commercio', 'Brescia'],
  ['Costituita il', '12/03/1998'],
  ['Capitale versato', '1.200.000 €'],
  ['Addetti', '118'],
  ['Fatturato dichiarato', '19.800.000 €'],
  ['Unità locali', '3'],
  ['PEC', 'orobia@pec.example'],
] as const;

const BILANCI_SINTETICI = [
  { anno: 2022, fatturato: 17.1, patrimonio: '4.890.000 €', dipendenti: '104' },
  { anno: 2023, fatturato: 18.7, patrimonio: '5.410.000 €', dipendenti: '112' },
  { anno: 2024, fatturato: 19.8, patrimonio: '6.150.000 €', dipendenti: '118' },
] as const;

const INDICATORI = [
  ['Margine EBITDA', '11,9 %'],
  ['ROE', '13,7 %'],
  ['Leva finanziaria', '2,67'],
  ['Patrimonio su totale attivo', '0,38'],
] as const;

export function SchermataProfilo({ segni }: { segni: Segni }) {
  return (
    <div className="space-y-3">
      <IntestazioneAzienda
        bersaglioIntervista="dati-intervista"
        premutoIntervista={segni.has('intervista')}
      />
      <SchedeAzienda aperta={4} />
      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <div className="min-w-0 space-y-3">
          <Carta className="p-3.5" ritardo={140}>
            <p className="flex items-center justify-between text-[12.5px] font-semibold">
              Record camerale
              <span className="text-[10.5px] font-normal text-vetrina-grigio">Registro Imprese</span>
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
              {RECORD_CAMERALE.map(([voce, valore], i) => (
                <div key={voce} className="tour-entra min-w-0" style={r(220 + i * 45)}>
                  <dt className="truncate text-[10.5px] text-vetrina-grigio">{voce}</dt>
                  <dd className="truncate text-[12px] font-medium tabular-nums">{valore}</dd>
                </div>
              ))}
            </dl>
          </Carta>
          <Carta className="p-3.5" ritardo={260}>
            <p className="flex items-center justify-between text-[12.5px] font-semibold">
              Bilanci depositati
              <span className="text-[10.5px] font-normal text-vetrina-grigio">Fatturato per esercizio</span>
            </p>
            <div className="mt-2 grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <div className="flex h-[92px] items-end justify-around gap-2 rounded-lg bg-vetrina-carta px-2 pb-1.5 pt-2">
                {BILANCI_SINTETICI.map((b, i) => (
                  <div key={b.anno} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={`tour-cresce w-full max-w-[22px] rounded-t ${b.anno === 2024 ? 'bg-vetrina-blu' : 'bg-vetrina-blu/35'}`}
                      style={
                        {
                          height: `${Math.round((b.fatturato / 19.8) * 58)}px`,
                          '--r': `${320 + i * 90}ms`,
                        } as Stile
                      }
                    />
                    <span className="text-[9.5px] tabular-nums text-vetrina-grigio">{b.anno}</span>
                  </div>
                ))}
              </div>
              <div className="min-w-0 divide-y divide-vetrina-linea overflow-hidden rounded-lg border border-vetrina-linea text-[11.5px] tabular-nums">
                {[...BILANCI_SINTETICI].reverse().map((b) => (
                  <div key={b.anno} className="grid grid-cols-[0.6fr_1fr_1.1fr_0.5fr] gap-2 px-2.5 py-1.5">
                    <span className="font-medium">{b.anno}</span>
                    <span className="truncate">{b.fatturato.toLocaleString('it-IT')} mln</span>
                    <span className="truncate text-vetrina-grigio">PN {b.patrimonio}</span>
                    <span className="text-right text-vetrina-grigio">{b.dipendenti}</span>
                  </div>
                ))}
              </div>
            </div>
          </Carta>
        </div>
        <div className="hidden min-w-0 space-y-3 lg:block">
          <Carta className="p-3.5" ritardo={200}>
            <p className="text-[12.5px] font-semibold">Soci e titolari effettivi</p>
            <div className="mt-2 space-y-1.5">
              {[
                ['Persona fisica', '70 %'],
                ['Persona fisica', '30 %'],
              ].map(([nome, quota], i) => (
                <div
                  key={quota}
                  className="tour-entra flex items-center gap-2 rounded-lg border border-vetrina-linea px-2.5 py-1.5"
                  style={r(300 + i * 80)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium">{nome}</span>
                    <span className="block text-[10px] text-vetrina-grigio">
                      socio · titolare effettivo
                    </span>
                  </span>
                  <span className="text-[11.5px] font-semibold tabular-nums">{quota}</span>
                </div>
              ))}
            </div>
          </Carta>
          <Carta className="p-3.5" ritardo={280}>
            <p className="text-[12.5px] font-semibold">Indicatori di bilancio</p>
            <div className="mt-1.5 divide-y divide-vetrina-linea">
              {INDICATORI.map(([voce, valore], i) => (
                <div
                  key={voce}
                  className="tour-entra flex justify-between gap-2 py-1 text-[11.5px]"
                  style={r(380 + i * 60)}
                >
                  <span className="truncate text-vetrina-grigio">{voce}</span>
                  <span className="font-semibold tabular-nums">{valore}</span>
                </div>
              ))}
            </div>
          </Carta>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Dati di intervista
// ─────────────────────────────────────────────────────────────────────────────

export function SchermataIntervista({ segni }: { segni: Segni }) {
  const no = segni.has('no');
  const salvato = segni.has('salvato');
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
            Completezza dell’analisi: <span className="tabular-nums">{salvato ? '47%' : '41%'}</span>
          </p>
          <p className="text-[11px] text-vetrina-grigio">{salvato ? '8 campi su 17' : '7 campi su 17'}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-vetrina-velo">
          <div
            className="tour-riempie h-full rounded-full bg-vetrina-blu"
            style={{ '--fino': salvato ? '47%' : '41%', '--r': salvato ? '0ms' : '200ms' } as Stile}
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
              style={r(450 + i * 100)}
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
      <Carta className="p-4" ritardo={240}>
        <p className="text-[13px] font-semibold">Attività e mercati</p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium text-vetrina-grigio">Esporta verso USA o Canada</p>
            <div className="mt-1 flex gap-1 rounded-lg border border-vetrina-linea bg-vetrina-carta p-0.5 text-[12px]">
              <span className="flex-1 rounded-md py-1 text-center text-vetrina-grigio">Sì</span>
              <span
                data-bersaglio="scelta-no"
                className={`flex-1 rounded-md py-1 text-center ${CAMBIO} ${
                  no ? 'bg-vetrina-inchiostro font-medium text-white' : 'text-vetrina-grigio'
                }`}
              >
                No
              </span>
              <span
                className={`flex-1 rounded-md py-1 text-center ${CAMBIO} ${
                  no ? 'text-vetrina-grigio' : 'bg-vetrina-inchiostro font-medium text-white'
                }`}
              >
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
      </Carta>
      {/* La barra di salvataggio, come quella fissa in fondo alla pagina vera. */}
      <div
        className="tour-entra flex items-center justify-end gap-2 rounded-2xl border border-vetrina-linea bg-white/90 px-4 py-2.5"
        style={r(380)}
      >
        <span className="mr-auto text-[11.5px] text-vetrina-grigio">
          {salvato ? 'Salvato: l’analisi è stata ricalcolata.' : 'Modifiche da salvare'}
        </span>
        <Pulsante premuto={false}>Vedi l’analisi</Pulsante>
        <Pulsante bersaglio="salva" premuto={salvato} pieno>
          {salvato && <IconaSpunta className="h-3.5 w-3.5" />}
          Salva e ricalcola
        </Pulsante>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Report per il cliente
// ─────────────────────────────────────────────────────────────────────────────

const CAPITOLI = [
  'Sintesi per la direzione',
  'Richieste ed esigenze rilevate',
  'Determinazione dei capitali da assicurare',
  'Coperture proposte e motivazione dell’adeguatezza',
  'Obbligo assicurativo contro le calamità naturali',
  'Limiti e avvertenze',
] as const;

export function SchermataReport({ segni }: { segni: Segni }) {
  const pdf = segni.has('pdf');
  return (
    <div className="relative space-y-3.5">
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
          <Pulsante bersaglio="stampa" premuto={pdf} pieno>
            Stampa o salva in PDF
          </Pulsante>
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
              className={`tour-entra flex items-center gap-2.5 rounded-lg px-2 py-1 text-[12px] ${
                i === 4 ? 'bg-[oklch(0.96_0.02_262)] shadow-[inset_3px_0_0_var(--color-vetrina-blu)]' : ''
              }`}
              style={r(300 + i * 110)}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-vetrina-velo text-[10.5px] font-semibold text-vetrina-grigio">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{capitolo}</span>
              {i === 4 ? (
                <span className="hidden items-center gap-1 sm:flex">
                  <IconaSisma className="h-3.5 w-3.5 text-vetrina-magenta" />
                  <Etichetta tono="ambra">soggetta</Etichetta>
                </span>
              ) : (
                <span className="h-1.5 w-12 shrink-0 rounded-full bg-vetrina-linea" />
              )}
            </li>
          ))}
        </ol>
      </div>
      {/* Dopo il clic su «Stampa o salva in PDF»: il documento è pronto da mandare. */}
      <div
        className={`absolute right-0 top-10 flex items-center gap-2.5 rounded-xl border border-vetrina-linea bg-white px-3.5 py-2.5 shadow-[0_18px_36px_-16px_rgba(16,24,40,0.35)] ${CAMBIO} ${
          pdf ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
        }`}
      >
        <Tessera tono="blu">
          <IconaDocumento />
        </Tessera>
        <div>
          <p className="text-[12.5px] font-semibold">Report pronto</p>
          <p className="text-[11px] text-vetrina-grigio">PDF da consegnare al cliente</p>
        </div>
      </div>
    </div>
  );
}

/** Le cinque schermate in ordine, con il nome che la cornice della finestra mostra. */
export const SCHERMATE = [
  { chiave: 'ricerca', nome: 'Ricerca Clienti', Schermata: SchermataRicerca, voce: 'ricerca' },
  { chiave: 'crm', nome: 'CRM', Schermata: SchermataCrm, voce: 'crm' },
  { chiave: 'scheda', nome: 'Scheda azienda', Schermata: SchermataScheda, voce: 'crm' },
  { chiave: 'profilo', nome: 'Dati camerali', Schermata: SchermataProfilo, voce: 'crm' },
  { chiave: 'intervista', nome: 'Dati di intervista', Schermata: SchermataIntervista, voce: 'crm' },
  { chiave: 'report', nome: 'Report per il cliente', Schermata: SchermataReport, voce: 'crm' },
] as const;
