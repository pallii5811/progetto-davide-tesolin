import { Geist } from 'next/font/google';
import {
  IconaArchivio,
  IconaCampana,
  IconaDocumento,
  IconaFermo,
  IconaGrafico,
  IconaIngranaggio,
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
  MiniPartitaIva,
  MiniSoci,
  PannelloCatNat,
  PannelloCrm,
  PannelloCyber,
  PannelloFermo,
  PannelloTerritorio,
} from './illustrazioni';
import { CollegamentoFreccia, Pulsante, Tessera } from './pezzi';
import { ProdottoScorrevole } from './ProdottoScorrevole';
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
 * Il testo è stato riscritto il 19/09/2026 («sembra scritto con l'AI… entra nella testa
 * dell'agente assicurativo italiano») e riletto da due parti prima di uscire:
 * - un agente plurimandatario, che ha tolto le formule da brochure e ha chiesto le sue parole
 *   (link, agenzia, titolare, danni indiretti, cumulo, assuntore), la CAT NAT in cima e il lavoro
 *   sul portafoglio che l'agente ha già;
 * - una verifica sul codice, riga per riga, che ha trovato cose già sbagliate nella versione
 *   precedente: il «bilancio riclassificato con 21 indici» (con aziende vere non arriva), le foto di
 *   sopralluogo (il caricamento è stato tolto dalla scheda), l'«informativa IVASS» (il report porta
 *   richieste ed esigenze e i riferimenti agli artt. 58-59, non gli allegati), le unità locali (solo
 *   con l'analisi approfondita), le formule dei punteggi (non più a schermo dal 18/09).
 *
 * Due regole di contenuto, entrambe pagate altrove:
 * - nessun numero inventato spacciato per risultato: niente clienti, percentuali di successo o
 *   loghi di chi non ci ha scelto. I numeri che compaiono nel testo sono misure (i 7.899 comuni
 *   dell'archivio ISPRA, i giorni degli scenari di fermo, i termini di legge) e quelli nelle
 *   illustrazioni sono dichiarati di esempio;
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

/**
 * Il testo di una funzione: la colonna di sinistra della scena che scorre (ProdottoScorrevole.tsx),
 * che ci mette accanto il pannello.
 *
 * Il collegamento dice «Crea il tuo account» e non più «Prova su un'azienda vera»: un account
 * nuovo entra subito, ma gli acquisti — e un'analisi è un acquisto — partono dopo l'attivazione.
 * La promessa di una prova immediata non era mantenibile.
 */
function TestoFunzione({
  icona,
  tono,
  titolo,
  testo,
  fatto,
}: {
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  testo: React.ReactNode;
  fatto: { numero: string; testo: string; fonte: string };
}) {
  return (
    <>
      <Tessera tono={tono} grande>
        {icona}
      </Tessera>
      <Titolo2 className="mt-6">{titolo}</Titolo2>
      <Paragrafo className="mt-5 max-w-[520px]">{testo}</Paragrafo>
      <div className="mt-6">
        <CollegamentoFreccia href="/registrati">Crea il tuo account</CollegamentoFreccia>
      </div>
      <div className="max-w-[520px]">
        <Fatto {...fatto} />
      </div>
    </>
  );
}

/*
  Una legge accanto a quattro fonti di dati: è da lì che vengono i termini e i beni dell'obbligo
  catastrofale, e il titolo della fascia lo dice («dati e regole»). L'IVASS non c'è più: non è una
  fonte di numeri, e i riferimenti al Regolamento hanno la loro sezione.
*/
const FONTI = [
  { nome: 'Registro Imprese', cosa: 'Visure e bilanci' },
  { nome: 'ISPRA IdroGEO', cosa: 'Alluvioni e frane' },
  { nome: 'Protezione Civile', cosa: 'Zone sismiche' },
  { nome: 'ISTAT', cosa: 'Comuni e codici catastali' },
  { nome: 'L. 213/2023', cosa: 'Obbligo CAT NAT' },
] as const;

const PASSI = [
  {
    id: 'trova',
    illustrazione: <IllustrazioneTrova />,
    titolo: 'Trova le aziende da chiamare.',
    testo:
      'Filtra per città, codice ATECO, dipendenti, fatturato e forma giuridica. Sapere quante sono è gratis. Quando il filtro ti convince crei l’elenco, e le aziende entrano nel tuo CRM.',
    ancora: '#crm',
  },
  {
    id: 'analizza',
    illustrazione: <IllustrazioneAnalizza />,
    titolo: 'Vedi quanto rischiano.',
    testo:
      'Tre punteggi da 1 a 7, dove 7 è il rischio più alto: danni ai beni sede per sede (Property), fermo dell’attività (Business Interruption) e cyber del settore. In più l’obbligo CAT NAT, con la sua scadenza.',
    ancora: '#territorio',
  },
  {
    id: 'proponi',
    illustrazione: <IllustrazioneProponi />,
    titolo: 'Consegna il report.',
    testo:
      'Sintesi per il titolare, capitali da assicurare, coperture da proporre con il loro perché, obbligo CAT NAT. Lo stampi o lo mandi in PDF, con l’intestazione della tua agenzia.',
    ancora: '#conformita',
  },
] as const;

/*
  I riferimenti normativi sono quelli che il report porta davvero (report/page.tsx): richieste ed
  esigenze all'art. 58, la motivazione dell'adeguatezza, l'intestazione con il RUI. Il decreto
  antiriciclaggio non si cita: i suoi obblighi riguardano chi lavora i rami vita, e un agente danni
  che lo legge qui penserebbe a un errore.
*/
const CONFORMITA = [
  {
    icona: <IconaDocumento />,
    tono: 'blu' as const,
    titolo: 'Intestazione e RUI',
    testo:
      'Il report esce con il logo, il nome della tua agenzia e il numero di iscrizione al RUI. Lo stampi o lo salvi in PDF.',
  },
  {
    icona: <IconaSpunta />,
    tono: 'arancio' as const,
    titolo: 'Richieste ed esigenze',
    testo: 'Le esigenze del cliente e il perché di ogni copertura proposta, nero su bianco nel report.',
  },
  {
    icona: <IconaPersone />,
    tono: 'magenta' as const,
    titolo: 'Controlli su soci e titolare effettivo',
    testo:
      'Titolare effettivo ricavato dai soci e controllo su sanzioni internazionali, persone politicamente esposte e notizie negative. La tua decisione resta registrata con la data.',
  },
  {
    icona: <IconaGrafico />,
    tono: 'petrolio' as const,
    titolo: 'Ogni numero ha la sua fonte',
    testo:
      'Ogni punteggio mostra le voci da cui nasce, e nel report ogni capitale dice come è stato calcolato. Se il cliente o l’assuntore chiedono da dove viene, la risposta è lì.',
  },
] as const;

/*
  Le funzioni che non hanno un pannello loro, ognuna verificata sul prodotto: l'ordine delle
  domande per peso (completeness.ts: superfici 10, export 9, dipendenti 8), il link revocabile del
  questionario, la verifica a richiesta di protesti e procedure, i quattro ruoli e l'isolamento per
  studio, la solidità delle compagnie dalla SFCR inserita a mano, l'esportazione del CRM in CSV.
*/
const FUNZIONI = [
  {
    icona: <IconaSpunta />,
    tono: 'arancio' as const,
    titolo: 'Cosa chiedere, in ordine di importanza',
    testo:
      'AEGIS mette in fila le domande da fare al cliente, a partire da quelle che spostano di più il risultato: superfici, export, numero di dipendenti.',
  },
  {
    icona: <IconaDocumento />,
    tono: 'magenta' as const,
    titolo: 'Il questionario lo compila il cliente',
    testo:
      'Gli mandi un link e scorte, veicoli e lavori in cantiere li scrive lui. Le risposte finiscono nella scheda senza ricopiare niente, e il link lo disattivi quando vuoi.',
  },
  {
    icona: <IconaCampana />,
    tono: 'arancio' as const,
    titolo: 'Protesti e procedure',
    testo:
      'Prima di lavorare un’azienda verifichi, a richiesta, protesti, pregiudizievoli e procedure concorsuali.',
  },
  {
    icona: <IconaIngranaggio />,
    tono: 'blu' as const,
    titolo: 'Tutta l’agenzia sullo stesso account',
    testo:
      'Quattro ruoli, dal titolare a chi deve solo consultare: ognuno vede e fa quello che gli spetta. Ogni agenzia vede solo i propri clienti.',
  },
  {
    icona: <IconaGrafico />,
    tono: 'petrolio' as const,
    titolo: 'Le compagnie a confronto',
    testo:
      'Riporti i dati della SFCR delle compagnie con cui lavori e ne confronti la solidità. Ti serve quando il cliente chiede perché proprio quella.',
  },
  {
    icona: <IconaArchivio />,
    tono: 'neutro' as const,
    titolo: 'Il CRM in un file',
    testo: 'Esporti le aziende del CRM in CSV, con il filtro che stai guardando, e lo apri in Excel.',
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
          <span className="sm:hidden">Ricerche ripetute, senza doppioni.</span>
          <span className="hidden sm:inline">
            Rifai la stessa ricerca: l’elenco riparte dalle aziende successive, e chi è già nel CRM non
            ricompare.
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
            {/*
              Da 1024 pixel e non da 768: fra le due larghezze le voci non ci stavano e andavano a
              capo parola per parola («Fonti / dei / dati»). Lì restano marchio, «Accedi» e il
              pulsante; le sezioni sono tutte nel piè di pagina.
            */}
            <ul className="hidden items-center gap-8 whitespace-nowrap text-[14.5px] text-vetrina-grigio lg:flex">
              {[
                ['#come-funziona', 'Come funziona'],
                ['#catnat', 'CAT NAT'],
                ['#prodotto', 'Prodotto'],
                ['#conformita', 'Report'],
                ['#dati', 'Fonti dei dati'],
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
        {/*
          Le due cose che l'agente vuole sapere per prime: AEGIS gli trova i clienti, e gli dà
          qualcosa di concreto da dire. Il sottotitolo dice con quali numeri, e che cosa resta in
          mano al cliente.
        */}
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
            <h1 className="mx-auto mt-8 max-w-[1060px] text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-[64px] lg:text-[80px]">
              Trova le aziende da assicurare e presentati con i loro numeri.
            </h1>
            <p className="mx-auto mt-7 max-w-[780px] text-pretty text-[18px] leading-[1.55] text-vetrina-grigio sm:text-[20px]">
              AEGIS ti trova le aziende della tua zona e, dai dati ufficiali dell’impresa e del suo comune,
              ti dice quanto rischiano le loro sedi, quanto perdono in un giorno di fermo e se sono
              obbligate alla polizza CAT NAT. Al cliente lasci un report con il nome della tua agenzia.
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
              Dati e regole da fonti ufficiali
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

        {/* ── Come funziona ──────────────────────────────────────────────── */}
        <section id="come-funziona" className="scroll-mt-28 py-24 sm:py-28">
          <div className={LARGHEZZA}>
            <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
              <Titolo2>Dalla ricerca al report, in tre passi.</Titolo2>
              <Paragrafo>
                Oggi, per preparare una proposta a un’azienda, apri la visura, il bilancio, le mappe del
                rischio, un foglio di calcolo e un documento da impaginare. In AEGIS è un percorso solo.
              </Paragrafo>
            </div>
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

        {/* ── Visura e bilancio in una scheda ────────────────────────────── */}
        {/*
          Richiesta di Simone del 18/09/2026: una sezione come la finestra di clay.com/signals, con i
          dati camerali e i bilanci. Dal 19/09/2026 sta subito dopo i tre passi, su sua richiesta: la
          scheda si vede prima di arrivare ai rischi. Le voci sono quelle della scheda vera
          (SchedaRegistro.tsx).
        */}
        <section id="registro" aria-labelledby="titolo-registro" className="scroll-mt-28 pb-24 pt-2">
          <div className={`${LARGHEZZA} text-center`}>
            <span className="inline-flex items-center gap-2 rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[13px] font-medium text-vetrina-grigio">
              <span className="h-1.5 w-1.5 rounded-full bg-vetrina-blu" />
              Visura e bilancio
            </span>
            <h2
              id="titolo-registro"
              className="mx-auto mt-6 max-w-[900px] text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[54px] lg:text-[64px]"
            >
              La visura e il bilancio sono già nella scheda.
            </h2>
            <Paragrafo className="mx-auto mt-6 max-w-[780px] text-[18px] sm:text-[19px]">
              Soci e titolari effettivi, addetti, fatturato e sede: quello che cercheresti nella visura
              camerale. Poi i bilanci depositati degli ultimi anni e, con l’analisi approfondita, le unità
              locali e gli indicatori che il Registro Imprese calcola sull’ultimo bilancio.
            </Paragrafo>
          </div>
          <SchedaRegistro />
        </section>

        {/* ── Le funzioni: i testi scorrono, il pannello a destra cambia ─── */}
        {/*
          Richiesta di Simone del 19/09/2026, come la sezione dei segnali di clay.com: i testi a
          sinistra restano fermi, il pannello a destra resta sullo schermo e cambia quando arriva
          il testo successivo. La CAT NAT viene prima: è il motivo più concreto per chiamare
          un'azienda oggi.
        */}
        <section id="prodotto" aria-label="Prodotto" className="scroll-mt-28 pb-10">
          <div className={LARGHEZZA}>
            <ProdottoScorrevole
              voci={[
                {
                  id: 'catnat',
                  testo: (
                    <TestoFunzione
                      icona={<IconaScudo className="h-6 w-6" />}
                      tono="magenta"
                      titolo="Polizza CAT NAT: chi è obbligato e da che cifra partire."
                      testo="La legge 213/2023 obbliga le imprese ad assicurare fabbricati, impianti e attrezzature contro terremoto, alluvione e frana, e per quasi tutte il termine è già passato. AEGIS ti dice se l’azienda è obbligata, qual era la sua scadenza e una stima del valore dei beni da coprire. Chi non è in regola se lo ritrova quando chiede contributi pubblici: è il motivo più concreto che hai per chiamarla domani mattina."
                      fatto={{
                        numero: '31 dicembre 2025',
                        testo:
                          'la scadenza per le piccole e micro imprese. Per le medie era il 1° ottobre 2025, per le grandi il 31 marzo 2025. Turismo, ristorazione e pesca hanno avuto proroghe.',
                        fonte: 'L. 213/2023 · D.L. 39/2025 · DM MEF-MIMIT n. 18/2025',
                      }}
                    />
                  ),
                  pannello: <PannelloCatNat />,
                },
                {
                  id: 'territorio',
                  testo: (
                    <TestoFunzione
                      icona={<IconaLuogo className="h-6 w-6" />}
                      tono="blu"
                      titolo="Terremoto, alluvione e frana, sede per sede."
                      testo="Per la sede legale e, con l’analisi approfondita, per tutte le unità locali, AEGIS ti dice quanto il comune è esposto ad alluvioni e frane secondo ISPRA e in che zona sismica si trova. E ti segnala i cumuli: le sedi entro 200 metri, che un incendio prende insieme, e quelle nello stesso comune, che un terremoto o un’alluvione colpisce insieme."
                      fatto={{
                        numero: '7.899 comuni',
                        testo: 'nell’archivio ISPRA IdroGEO di pericolosità per alluvioni e frane.',
                        fonte: 'ISPRA IdroGEO · Protezione Civile, classificazione sismica di maggio 2025',
                      }}
                    />
                  ),
                  pannello: <PannelloTerritorio />,
                },
                {
                  id: 'fermo',
                  testo: (
                    <TestoFunzione
                      icona={<IconaFermo className="h-6 w-6" />}
                      tono="arancio"
                      titolo="Quanto perde se si ferma un giorno."
                      testo="Dal bilancio depositato AEGIS stima quanto costa all’azienda un giorno di fermo, e poi 7, 30 e 90 giorni: sul fatturato, oppure sul margine se lo inserisci con il cliente. Con quella cifra davanti, l’imprenditore capisce da solo perché gli serve la garanzia danni indiretti."
                      fatto={{
                        numero: '7 · 30 · 90',
                        testo: 'giorni di fermo, stimati sul bilancio di quell’impresa.',
                        fonte: 'Bilanci depositati al Registro Imprese',
                      }}
                    />
                  ),
                  pannello: <PannelloFermo />,
                },
                {
                  id: 'cyber',
                  testo: (
                    <TestoFunzione
                      icona={<IconaLucchetto className="h-6 w-6" />}
                      tono="petrolio"
                      titolo="Il rischio cyber, spiegato voce per voce."
                      testo="Il punteggio parte dal settore ATECO dell’azienda e pesa quattro voci: quanto dipende dal digitale, quanti dati sensibili tratta, quante transazioni gestisce e quanto il settore è preso di mira. Al cliente lo spieghi una voce alla volta."
                      fatto={{
                        numero: '4 voci',
                        testo: 'per ogni divisione ATECO, da 1 a 7 ciascuna.',
                        fonte: 'Tabella di settore AEGIS, divisioni ATECO 2025',
                      }}
                    />
                  ),
                  pannello: <PannelloCyber />,
                },
                {
                  id: 'crm',
                  testo: (
                    <TestoFunzione
                      icona={<IconaArchivio className="h-6 w-6" />}
                      tono="magenta"
                      titolo="Rifai la ricerca e arrivano aziende nuove."
                      testo="Ogni elenco che crei resta nel CRM. Per ogni azienda segni a che punto sei (da contattare, contattata, in trattativa, cliente, non interessata) e aggiungi una nota. Se rifai la stessa ricerca l’elenco riparte dalle successive: quelle già comprate con quei filtri non le paghi due volte, e chi è già nel CRM non ricompare."
                      fatto={{
                        numero: 'Gratis',
                        testo:
                          'sapere quante aziende corrispondono ai filtri. Nella ricerca spendi crediti solo quando crei l’elenco.',
                        fonte: 'Ricerca Clienti · tutti i comuni italiani',
                      }}
                    />
                  ),
                  pannello: <PannelloCrm />,
                },
              ]}
            />
          </div>
        </section>

        {/* ── Il portafoglio che l'agente ha già ─────────────────────────── */}
        {/*
          Le telefonate più facili sono a chi conosce già l'agente: la ricerca per socio e quella per
          partita IVA, che prima stavano fra le schede piccole a due terzi della pagina.
        */}
        <section
          id="clienti-attuali"
          aria-labelledby="titolo-clienti"
          className="scroll-mt-28 py-20 sm:py-24"
        >
          <div className={LARGHEZZA}>
            <h2
              id="titolo-clienti"
              className="max-w-[760px] text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[44px] lg:text-[52px]"
            >
              Parti dai clienti che hai già.
            </h2>
            <Paragrafo className="mt-5 max-w-[620px]">
              Le telefonate più facili sono quelle a chi ti conosce. AEGIS ti trova cosa proporre a chi è
              già in portafoglio.
            </Paragrafo>
            <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <article className="min-w-0 rounded-[28px] border border-vetrina-linea bg-white p-6 sm:p-8">
                <MiniSoci />
                <div className="mt-7 flex items-start gap-4">
                  <Tessera tono="blu">
                    <IconaPersone />
                  </Tessera>
                  <div>
                    <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em]">
                      Le altre società del titolare
                    </h3>
                    <p className="mt-2 text-[15.5px] leading-relaxed text-vetrina-grigio">
                      Metti il codice fiscale di un socio e vedi tutte le società in cui ha una
                      partecipazione. Sono aziende nuove, con una persona che ti conosce già.
                    </p>
                  </div>
                </div>
              </article>
              <article className="min-w-0 rounded-[28px] border border-vetrina-linea bg-white p-6 sm:p-8">
                <MiniPartitaIva />
                <div className="mt-7 flex items-start gap-4">
                  <Tessera tono="neutro">
                    <IconaLente />
                  </Tessera>
                  <div>
                    <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em]">
                      Un cliente che hai già in portafoglio
                    </h3>
                    <p className="mt-2 text-[15.5px] leading-relaxed text-vetrina-grigio">
                      Scrivi la partita IVA e vedi quanto rischiano le sue sedi e se è obbligato alla CAT
                      NAT. Se oggi gli fai solo le auto, hai un motivo per riparlargli del resto.
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ── Il report e le carte IVASS ─────────────────────────────────── */}
        <section id="conformita" className="scroll-mt-28 py-20 sm:py-24">
          <div className={LARGHEZZA}>
            <Titolo2 className="max-w-[760px]">Le carte IVASS sono già nel report.</Titolo2>
            <Paragrafo className="mt-5 max-w-[680px]">
              Intestazione con il numero RUI, richieste ed esigenze del cliente e motivazione di ogni
              copertura proposta, con i riferimenti agli articoli 58 e 59 del Regolamento IVASS n. 40/2018.
              Se arriva un’ispezione, ogni capitale dice da dove viene.
            </Paragrafo>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CONFORMITA.map((voce) => (
                <li key={voce.titolo} className="rounded-3xl border border-vetrina-linea bg-white p-6">
                  <Tessera tono={voce.tono}>{voce.icona}</Tessera>
                  <h3 className="mt-5 text-[18px] font-semibold leading-snug tracking-[-0.02em]">
                    {voce.titolo}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-vetrina-grigio">{voce.testo}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Tutte le altre funzioni ────────────────────────────────────── */}
        <section id="funzioni" aria-labelledby="titolo-funzioni" className="scroll-mt-28 pb-20 sm:pb-24">
          <div className={LARGHEZZA}>
            <h2
              id="titolo-funzioni"
              className="max-w-[820px] text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[44px] lg:text-[52px]"
            >
              Il resto di quello che fa AEGIS.
            </h2>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FUNZIONI.map((voce) => (
                <li key={voce.titolo} className="rounded-3xl border border-vetrina-linea bg-white p-6">
                  <Tessera tono={voce.tono}>{voce.icona}</Tessera>
                  <h3 className="mt-5 text-[18px] font-semibold leading-snug tracking-[-0.02em]">
                    {voce.titolo}
                  </h3>
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
                  Cercalo per città, settore e dimensione. Sapere quante aziende corrispondono ai filtri è
                  gratis.
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
                Per agenti e broker che lavorano i rami danni con le aziende.
              </p>
            </div>
            <nav aria-label="Piè di pagina" className="grid grid-cols-2 gap-x-16 gap-y-3 text-[14.5px]">
              <a href="#come-funziona" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Come funziona
              </a>
              <a href="#catnat" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Obbligo CAT NAT
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
              <a href="#clienti-attuali" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Clienti che hai già
              </a>
              <a href="#conformita" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Report e IVASS
              </a>
              <a href="#funzioni" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Tutte le funzioni
              </a>
              <a href="#dati" className="text-vetrina-grigio hover:text-vetrina-inchiostro">
                Fonti dei dati
              </a>
              <a href="/accedi" className="font-medium text-vetrina-inchiostro hover:underline">
                Accedi
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
