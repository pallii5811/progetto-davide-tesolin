import { Geist } from 'next/font/google';
import {
  IconaArchivio,
  IconaDocumento,
  IconaFermo,
  IconaLente,
  IconaLucchetto,
  IconaLuogo,
  IconaPersone,
  IconaScudo,
  IconaSpunta,
} from './icone';
import {
  IllustrazioneAnalizza,
  IllustrazioneProponi,
  IllustrazioneTestata,
  IllustrazioneTrova,
  PannelloCrm,
  PannelloCyber,
  PannelloFermo,
  PannelloTerritorio,
  SchemaFlusso,
} from './illustrazioni';
import { CollegamentoFreccia, Pulsante, Tessera } from './pezzi';
import { SchedaRegistro } from './SchedaRegistro';
import type { Tono } from './pezzi';

/**
 * La vetrina di AEGIS: la pagina che vede chi arriva senza aver fatto l'accesso.
 *
 * Richiesta di Simone del 18/09/2026: «una homepage di livello qualitativo estremo… voglio
 * qualcosa così, clay.com/signals», e subito dopo «lo stile di design deve essere così, non anche
 * il contenuto». Dallo stile di Clay: carta calda e inchiostro quasi nero, titoli grandi e stretti,
 * pannelli pieni di colore con carte bianche che fluttuano, riquadri a puntini, pulsanti a
 * pillola. I contenuti sono di AEGIS, e sono solo cose che il prodotto fa davvero.
 *
 * Due regole di contenuto, entrambe pagate altrove:
 * - nessun numero inventato spacciato per risultato: niente clienti, percentuali di successo o
 *   loghi di chi non ci ha scelto. I numeri che compaiono nel testo sono misure (i 7.899 comuni
 *   degli indicatori ISPRA, i giorni degli scenari di fermo) e quelli nelle illustrazioni sono
 *   dichiarati di esempio;
 * - nessuna frase di riempimento: ogni riga dice che cosa fa il prodotto, per chi, con quali dati.
 *
 * Il carattere è Geist, servito da Next insieme alla pagina: nessuna richiesta a terzi mentre
 * si naviga, e nessuna libreria in più nel progetto.
 */

const geist = Geist({ subsets: ['latin'], display: 'swap' });

const LARGHEZZA = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

/** La dichiarazione che il prodotto porta in fondo a ogni pagina (layout.tsx), qui identica. */
const DICHIARAZIONE =
  'Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono consulenza finanziaria né garanzia di solvibilità. Le eventuali proposte assicurative sono soggette alla valutazione dell’intermediario secondo la normativa IVASS applicabile.';

function Marchio() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-vetrina-inchiostro text-white">
        <IconaScudo className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">AEGIS</span>
    </span>
  );
}

function Titolo2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[44px] lg:text-[52px] ${className}`}
    >
      {children}
    </h2>
  );
}

function Paragrafo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-pretty text-[17px] leading-[1.6] text-vetrina-grigio ${className}`}>{children}</p>
  );
}

/** Il riquadro dei fatti accanto a ogni pannello, dove Clay mette la citazione di un cliente. */
function Fatto({ numero, testo, fonte }: { numero: string; testo: string; fonte: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-vetrina-linea bg-white p-6">
      <p className="text-[30px] font-semibold leading-none tracking-[-0.04em]">{numero}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-vetrina-inchiostro">{testo}</p>
      <p className="mt-4 border-t border-vetrina-linea pt-3 text-[13px] text-vetrina-grigio">{fonte}</p>
    </div>
  );
}

function Funzione({
  id,
  icona,
  tono,
  titolo,
  testo,
  fatto,
  pannello,
  invertita = false,
}: {
  id: string;
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  testo: React.ReactNode;
  fatto: { numero: string; testo: string; fonte: string };
  pannello: React.ReactNode;
  invertita?: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-28 items-center gap-10 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <div className={invertita ? 'lg:order-2' : ''}>
        <Tessera tono={tono} grande>
          {icona}
        </Tessera>
        <Titolo2 className="mt-6">{titolo}</Titolo2>
        <Paragrafo className="mt-5 max-w-[520px]">{testo}</Paragrafo>
        <div className="mt-6">
          <CollegamentoFreccia href="/registrati">Prova su un’azienda vera</CollegamentoFreccia>
        </div>
        <div className="max-w-[520px]">
          <Fatto {...fatto} />
        </div>
      </div>
      <div className={invertita ? 'lg:order-1' : ''}>{pannello}</div>
    </div>
  );
}

const FONTI = [
  { nome: 'Registro Imprese', cosa: 'Dati camerali e bilanci' },
  { nome: 'ISPRA IdroGEO', cosa: 'Alluvioni e frane' },
  { nome: 'Protezione Civile', cosa: 'Zone sismiche' },
  { nome: 'ISTAT', cosa: 'Comuni e codici catastali' },
  { nome: 'IVASS', cosa: 'Informativa' },
] as const;

const PASSI = [
  {
    id: 'trova',
    illustrazione: <IllustrazioneTrova />,
    titolo: 'Trova le aziende giuste, senza spendere finché conti.',
    testo:
      'Città, settore ATECO, dipendenti, fatturato, forma giuridica, socio. Il conteggio non consuma crediti: l’elenco lo crei quando i filtri sono quelli giusti, e finisce nel CRM.',
    ancora: '#crm',
  },
  {
    id: 'analizza',
    illustrazione: <IllustrazioneAnalizza />,
    titolo: 'Tre rischi, in cerchi da 1 a 7.',
    testo:
      'Property Risk sede per sede, con incendio e calamità naturali. Business Interruption, con la perdita di ogni giorno di fermo. Cyber Risk del settore.',
    ancora: '#territorio',
  },
  {
    id: 'proponi',
    illustrazione: <IllustrazioneProponi />,
    titolo: 'Un documento da consegnare al cliente.',
    testo:
      'Sintesi per la direzione, capitali da assicurare, coperture proposte e obbligo CAT NAT, con l’informativa IVASS. Pronto da stampare.',
    ancora: '#flusso',
  },
] as const;

const CONFORMITA = [
  {
    icona: <IconaDocumento />,
    tono: 'blu' as const,
    titolo: 'Informativa in ogni documento',
    testo:
      'Il report per il cliente porta l’informativa con i riferimenti al Regolamento IVASS n. 40/2018.',
  },
  {
    icona: <IconaPersone />,
    tono: 'magenta' as const,
    titolo: 'Adeguata verifica',
    testo:
      'Titolare effettivo e verifica antiriciclaggio (D.Lgs. 231/2007), con la decisione registrata e datata.',
  },
  {
    icona: <IconaLucchetto />,
    tono: 'petrolio' as const,
    titolo: 'Dati isolati per studio',
    testo: 'Ogni studio vede solo i propri clienti: l’isolamento sta nel database, non nell’interfaccia.',
  },
  {
    icona: <IconaSpunta />,
    tono: 'arancio' as const,
    titolo: 'Calcoli ripetibili',
    testo:
      'Tabelle dichiarate e dati pubblici, nessun modello linguistico: gli stessi dati danno sempre lo stesso punteggio.',
  },
] as const;

export function Vetrina() {
  return (
    <div
      className={`${geist.className} vetrina-radice min-h-screen bg-vetrina-carta text-vetrina-inchiostro antialiased`}
    >
      {/* ── Novità ───────────────────────────────────────────────────────── */}
      <div className="bg-vetrina-viola text-white">
        <div
          className={`${LARGHEZZA} flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-[13.5px]`}
        >
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em]">
            Novità
          </span>
          <span className="sm:hidden">Stessi filtri, aziende nuove.</span>
          <span className="hidden sm:inline">
            Stessi filtri, aziende nuove: l’elenco successivo parte da dove ti eri fermato.
          </span>
          <a href="#crm" className="font-semibold underline-offset-4 hover:underline">
            Come funziona →
          </a>
        </div>
      </div>

      {/* ── Menu ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 pt-3">
        <div className={LARGHEZZA}>
          <nav
            aria-label="Vetrina"
            className="flex h-16 items-center justify-between rounded-2xl border border-vetrina-linea bg-white/85 px-4 shadow-[0_8px_30px_-18px_rgba(16,24,40,0.25)] backdrop-blur-md sm:px-5"
          >
            <a href="#inizio" aria-label="AEGIS, inizio della pagina" className="rounded-lg">
              <Marchio />
            </a>
            <ul className="hidden items-center gap-8 text-[14.5px] text-vetrina-grigio md:flex">
              {[
                ['#come-funziona', 'Come funziona'],
                ['#prodotto', 'Prodotto'],
                ['#dati', 'Fonti dei dati'],
                ['#conformita', 'Conformità'],
              ].map(([href, testo]) => (
                <li key={href}>
                  <a href={href} className="transition-colors hover:text-vetrina-inchiostro">
                    {testo}
                  </a>
                </li>
              ))}
            </ul>
            {/* Come Clay: chi c’è già entra dal testo, chi arriva ora dal pulsante pieno. */}
            <div className="flex items-center gap-2 sm:gap-4">
              <a
                href="/accedi"
                className="rounded-full px-2 py-1 text-[14.5px] font-medium text-vetrina-inchiostro transition hover:text-vetrina-grigio"
              >
                Accedi
              </a>
              <Pulsante href="/registrati">Crea un account</Pulsante>
            </div>
          </nav>
        </div>
      </header>

      <main id="inizio">
        {/* ── Apertura ───────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-20 pt-16 sm:pt-24">
          {/* Una luce appena percettibile dietro il titolo, come il velo delle pagine di Clay. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,oklch(0.93_0.03_262/0.6),transparent_70%)]"
          />
          <div className={`${LARGHEZZA} relative text-center`}>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-vetrina-linea bg-white text-vetrina-blu shadow-[0_10px_30px_-15px_rgba(16,24,40,0.35)]">
              <IconaScudo className="h-7 w-7" />
            </span>
            <h1 className="mx-auto mt-8 max-w-[1000px] text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-[64px] lg:text-[84px]">
              Il rischio di un’impresa, prima della prima telefonata.
            </h1>
            <p className="mx-auto mt-7 max-w-[760px] text-pretty text-[18px] leading-[1.55] text-vetrina-grigio sm:text-[20px]">
              AEGIS legge il Registro Imprese, gli indicatori di pericolosità ISPRA e la classificazione
              sismica di ogni comune, e ti dice quali aziende contattare e quanto rischiano: incendio,
              calamità naturali, fermo dell’attività, attacchi informatici.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Pulsante href="/registrati" grande>
                Crea il tuo account
              </Pulsante>
              <a
                href="#come-funziona"
                className="inline-flex h-12 items-center rounded-full border border-vetrina-linea bg-white px-6 text-[15.5px] font-medium transition hover:border-vetrina-inchiostro/30"
              >
                Guarda come funziona
              </a>
            </div>
          </div>
          <IllustrazioneTestata />
        </section>

        {/* ── Fonti ──────────────────────────────────────────────────────── */}
        <section
          id="dati"
          aria-labelledby="titolo-fonti"
          className="scroll-mt-28 border-y border-vetrina-linea bg-white/60 py-14"
        >
          <div className={LARGHEZZA}>
            <h2
              id="titolo-fonti"
              className="text-center text-[14px] font-medium uppercase tracking-[0.08em] text-vetrina-grigio"
            >
              I numeri vengono da fonti ufficiali
            </h2>
            <ul className="mt-9 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {FONTI.map((fonte) => (
                <li key={fonte.nome} className="flex flex-col items-center gap-2 text-center">
                  <span className="text-[21px] font-semibold tracking-[-0.03em] text-vetrina-inchiostro/85 sm:text-[23px]">
                    {fonte.nome}
                  </span>
                  <span className="rounded-full bg-vetrina-blu/8 px-2.5 py-0.5 text-[12px] font-medium text-vetrina-blu">
                    {fonte.cosa}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Il Registro Imprese in una scheda ──────────────────────────── */}
        {/*
          Richiesta di Simone del 18/09/2026: una sezione come la finestra di clay.com/signals,
          con i dati camerali e i bilanci che mancavano. Le voci sono quelle della scheda vera
          (vedi SchedaRegistro.tsx); i 21 indici sono quelli che il prodotto calcola.
        */}
        <section
          id="registro"
          aria-labelledby="titolo-registro"
          className="scroll-mt-28 pb-6 pt-24 sm:pt-28"
        >
          <div className={`${LARGHEZZA} text-center`}>
            <span className="inline-flex items-center gap-2 rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[13px] font-medium text-vetrina-grigio">
              <span className="h-1.5 w-1.5 rounded-full bg-vetrina-blu" />
              Dati camerali e bilanci
            </span>
            <h2
              id="titolo-registro"
              className="mx-auto mt-6 max-w-[900px] text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[54px] lg:text-[64px]"
            >
              Tutto il Registro Imprese, in una scheda.
            </h2>
            <Paragrafo className="mx-auto mt-6 max-w-[780px] text-[18px] sm:text-[19px]">
              Il record camerale, l’ultimo bilancio depositato riclassificato con 21 indici, i soci e il
              titolare effettivo, le sedi e le unità locali: AEGIS li legge dal Registro Imprese e li mette
              accanto al rischio di ogni sede.
            </Paragrafo>
          </div>
          <SchedaRegistro />
        </section>

        {/* ── Come funziona ──────────────────────────────────────────────── */}
        <section id="come-funziona" className="scroll-mt-28 py-24 sm:py-28">
          <div className={LARGHEZZA}>
            <Titolo2 className="max-w-[760px]">Come funziona in AEGIS</Titolo2>
            <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
              {PASSI.map((passo) => (
                <article key={passo.id}>
                  {passo.illustrazione}
                  <h3 className="mt-7 text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.03em]">
                    {passo.titolo}
                  </h3>
                  <Paragrafo className="mt-3 text-[16px]">{passo.testo}</Paragrafo>
                  <div className="mt-5">
                    <CollegamentoFreccia href={passo.ancora}>Scopri di più</CollegamentoFreccia>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Le funzioni, una per pannello ──────────────────────────────── */}
        <section id="prodotto" aria-label="Prodotto" className="scroll-mt-28 pb-10">
          <div className={LARGHEZZA}>
            <Funzione
              id="territorio"
              icona={<IconaLuogo className="h-6 w-6" />}
              tono="blu"
              titolo="Il territorio di ogni sede, comune per comune."
              testo="Per ogni ubicazione del Registro Imprese, la quota di imprese del comune in area a pericolosità idraulica e da frana secondo ISPRA, e la zona sismica ufficiale. Senza chiedere niente al cliente."
              fatto={{
                numero: '7.899 comuni',
                testo: 'coperti dagli indicatori ISPRA di pericolosità per alluvioni e frane.',
                fonte: 'ISPRA IdroGEO · Protezione Civile, classificazione sismica di maggio 2025',
              }}
              pannello={<PannelloTerritorio />}
            />
            <Funzione
              id="fermo"
              icona={<IconaFermo className="h-6 w-6" />}
              tono="arancio"
              titolo="Quanto costa un giorno di fermo."
              testo="Dal margine di contribuzione o dal fatturato, la perdita di una giornata e quella di 7, 30 e 90 giorni di interruzione: la cifra da cui parte ogni conversazione sulla Business Interruption."
              fatto={{
                numero: '7 · 30 · 90',
                testo:
                  'giorni di fermo, calcolati dal bilancio dell’impresa e non da una media di settore.',
                fonte: 'Bilanci depositati al Registro Imprese',
              }}
              pannello={<PannelloFermo />}
              invertita
            />
            <Funzione
              id="crm"
              icona={<IconaArchivio className="h-6 w-6" />}
              tono="magenta"
              titolo="Un CRM che non ti fa pagare due volte."
              testo="Ogni elenco che crei entra nel CRM e ci resta, con uno stato e una nota. Ripeti gli stessi filtri e arrivano le aziende successive: quelle che hai già non escono di nuovo."
              fatto={{
                numero: 'Gratis',
                testo:
                  'il conteggio delle aziende che corrispondono ai filtri: si paga solo l’elenco che crei.',
                fonte: 'Ricerca Clienti · tutti i comuni italiani',
              }}
              pannello={<PannelloCrm />}
            />
            <Funzione
              id="cyber"
              icona={<IconaLucchetto className="h-6 w-6" />}
              tono="petrolio"
              titolo="Il rischio informatico del settore."
              testo="Dipendenza digitale, sensibilità dei dati, esposizione alle transazioni, attrattività come bersaglio: quattro voci per ogni settore ATECO, e un punteggio che si spiega da solo."
              fatto={{
                numero: '4 voci',
                testo: 'per ogni divisione ATECO, con il loro peso nel punteggio finale.',
                fonte: 'Classificazione ATECO 2025',
              }}
              pannello={<PannelloCyber />}
              invertita
            />
          </div>
        </section>

        {/* ── Il flusso ──────────────────────────────────────────────────── */}
        <section id="flusso" className="scroll-mt-28 py-20 sm:py-24">
          <div className={LARGHEZZA}>
            <div className="grid items-end gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
              <Titolo2>Dalla partita IVA alla proposta, senza cambiare strumento.</Titolo2>
              <div>
                <Paragrafo>
                  Parti da un’azienda che conosci o da un elenco nuovo: AEGIS ricostruisce le sedi dal
                  Registro Imprese, legge il territorio di ognuna e prepara il documento per il cliente.
                </Paragrafo>
                <div className="mt-6">
                  <Pulsante href="/registrati" grande>
                    Crea il tuo account
                  </Pulsante>
                </div>
              </div>
            </div>
            <div className="mt-12">
              <SchemaFlusso />
            </div>
          </div>
        </section>

        {/* ── Conformità ─────────────────────────────────────────────────── */}
        <section id="conformita" className="scroll-mt-28 py-20 sm:py-24">
          <div className={LARGHEZZA}>
            <Titolo2 className="max-w-[760px]">Fatto per chi risponde all’IVASS.</Titolo2>
            <Paragrafo className="mt-5 max-w-[640px]">
              Uno strumento che un intermediario usa davanti al cliente deve reggere anche davanti a
              un’ispezione.
            </Paragrafo>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CONFORMITA.map((voce) => (
                <li key={voce.titolo} className="rounded-3xl border border-vetrina-linea bg-white p-6">
                  <Tessera tono={voce.tono}>{voce.icona}</Tessera>
                  <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em]">{voce.titolo}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-vetrina-grigio">{voce.testo}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Chiusura ───────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className={LARGHEZZA}>
            <div className="relative overflow-hidden rounded-[36px] bg-vetrina-inchiostro px-6 py-20 text-center text-white sm:px-12 sm:py-28">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_0%,oklch(0.45_0.15_262/0.55),transparent_70%)]"
              />
              <div className="relative">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <IconaLente className="h-7 w-7" />
                </span>
                <p className="mx-auto mt-8 max-w-[820px] text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[56px]">
                  Il prossimo cliente è già nel Registro Imprese.
                </p>
                <p className="mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-white/75">
                  Cercalo per città, settore e dimensione. Il conteggio è gratuito.
                </p>
                <div className="mt-9 flex justify-center">
                  <Pulsante href="/registrati" variante="inverso" grande>
                    Crea il tuo account
                  </Pulsante>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Piè di pagina ────────────────────────────────────────────────── */}
      <footer className="border-t border-vetrina-linea bg-white">
        <div className={`${LARGHEZZA} py-14`}>
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-[360px]">
              <Marchio />
              <p className="mt-4 text-[14.5px] leading-relaxed text-vetrina-grigio">
                Il rischio d’impresa, per intermediari assicurativi.
              </p>
            </div>
            <nav aria-label="Piè di pagina" className="grid grid-cols-2 gap-x-16 gap-y-3 text-[14.5px]">
              <a href="#come-funziona" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Come funziona
              </a>
              <a href="#territorio" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Property Risk
              </a>
              <a href="#fermo" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Business Interruption
              </a>
              <a href="#cyber" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Cyber Risk
              </a>
              <a href="#crm" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                CRM
              </a>
              <a href="/accedi" className="font-medium text-vetrina-inchiostro hover:underline">
                Accedi
              </a>
              <a href="#conformita" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Conformità
              </a>
              <a href="/registrati" className="font-medium text-vetrina-inchiostro hover:underline">
                Crea un account
              </a>
            </nav>
          </div>
          <div className="mt-12 space-y-3 border-t border-vetrina-linea pt-6 text-[12.5px] leading-relaxed text-vetrina-grigio">
            <p>{DICHIARAZIONE}</p>
            <p>Le aziende e i valori nelle illustrazioni di questa pagina sono di esempio.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
