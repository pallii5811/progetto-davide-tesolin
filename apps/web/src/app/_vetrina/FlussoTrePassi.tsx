import {
  IconaArchivio,
  IconaDocumento,
  IconaGrafico,
  IconaLente,
  IconaPalazzo,
  IconaScudo,
  IconaSpunta,
} from './icone';
import { PUNTINI, Tessera } from './pezzi';
import type { Tono } from './pezzi';

/**
 * «Dalla ricerca al report, in tre passi», come lo schema di clay.com/signals.
 *
 * Richiesta di Simone del 19/09/2026: «questa sezione nella homepage non mi piace, voglio che
 * diventi così come clay, al top del top del design». Nello schema di Clay a sinistra c'è la
 * catena — quello che il prodotto fa, un passo sotto l'altro, collegato da linee tratteggiate —
 * e a destra dove finisce ogni cosa, con l'etichetta sulla linea che ci porta.
 *
 * Qui a sinistra ci sono i tre passi di AEGIS con i filtri e le fonti vere; a destra le tre cose
 * che restano all'agente: le aziende nel CRM, i punteggi sulla scheda, il report per il cliente.
 * Ogni pastiglia è un campo o una fonte che esiste davvero nel prodotto — i filtri della Ricerca
 * Clienti, le quattro fonti dei dati, i capitoli del report.
 *
 * Lo schema è decorativo: i testi dei tre passi restano sotto, dove si leggono anche con un
 * lettore di schermo.
 */

function Pastiglia({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg border border-vetrina-linea bg-white px-2.5 py-1 text-[12.5px] font-medium text-vetrina-inchiostro shadow-[0_1px_1px_rgba(16,24,40,0.03)]">
      {children}
    </span>
  );
}

/** Un nodo della catena: la tessera con l'icona, il titolo, e sotto le pastiglie. */
function Nodo({
  numero,
  icona,
  tono,
  titolo,
  sotto,
  pastiglie,
}: {
  numero?: number;
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  sotto?: string;
  pastiglie?: readonly string[];
}) {
  return (
    <div className="rounded-[22px] border border-vetrina-linea bg-vetrina-velo/70 p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white px-4 py-3.5">
        <Tessera tono={tono}>{icona}</Tessera>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em]">{titolo}</p>
          {sotto !== undefined && <p className="mt-0.5 text-[13px] text-vetrina-grigio">{sotto}</p>}
        </div>
        {numero !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vetrina-inchiostro text-[12px] font-semibold text-white">
            {numero}
          </span>
        )}
      </div>
      {pastiglie !== undefined && (
        <div className="flex flex-wrap gap-2 px-1.5 pb-1 pt-2.5">
          {pastiglie.map((p) => (
            <Pastiglia key={p}>{p}</Pastiglia>
          ))}
        </div>
      )}
    </div>
  );
}

/** Le linee tratteggiate fra un nodo e il successivo, con la punta in basso. */
function Discese() {
  return (
    <div className="flex h-9 items-stretch justify-center gap-6 sm:gap-10">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="relative w-px border-l border-dashed border-vetrina-grigio/45">
          <span className="absolute -bottom-px -left-[3.5px] h-[7px] w-[7px] rotate-45 border-b border-r border-vetrina-grigio/60" />
        </span>
      ))}
    </div>
  );
}

/**
 * Dove finisce quel passo: la linea tratteggiata con l'etichetta sopra, e la carta di arrivo.
 * Su schermo stretto la linea diventa verticale, sopra la carta.
 */
function Arrivo({
  etichetta,
  icona,
  tono,
  titolo,
  sotto,
  esito,
}: {
  etichetta: string;
  icona: React.ReactNode;
  tono: Tono;
  titolo: string;
  sotto: string;
  esito: string;
}) {
  return (
    <div className="relative lg:pl-[8.5rem]">
      {/* La linea orizzontale con l'etichetta sopra, come «Send to your CRM» da Clay. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 hidden w-[8.5rem] -translate-y-1/2 pr-3 lg:block"
      >
        <span className="block pb-1.5 text-center text-[12.5px] leading-tight text-vetrina-grigio">
          {etichetta}
        </span>
        <span className="relative block border-t border-dashed border-vetrina-grigio/45">
          <span className="absolute -right-px -top-[4px] h-[7px] w-[7px] rotate-45 border-r border-t border-vetrina-grigio/60" />
        </span>
      </span>

      {/* Su telefono e tablet: la stessa etichetta sopra una linea che scende. */}
      <div aria-hidden="true" className="flex flex-col items-center pb-2 lg:hidden">
        <span className="rounded-full border border-vetrina-linea bg-white px-2.5 py-0.5 text-[12px] text-vetrina-grigio">
          {etichetta}
        </span>
        <span className="relative mt-1 h-5 border-l border-dashed border-vetrina-grigio/45">
          <span className="absolute -bottom-px -left-[3.5px] h-[7px] w-[7px] rotate-45 border-b border-r border-vetrina-grigio/60" />
        </span>
      </div>

      <div className="rounded-[22px] border border-vetrina-linea bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_36px_-28px_rgba(16,24,40,0.35)]">
        <div className="flex items-center gap-3">
          <Tessera tono={tono}>{icona}</Tessera>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em]">{titolo}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-vetrina-grigio">{sotto}</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-vetrina-velo px-3 py-2 text-[12.5px] text-vetrina-inchiostro">
          <IconaSpunta className="h-4 w-4 shrink-0 text-[oklch(0.5_0.13_150)]" />
          {esito}
        </p>
      </div>
    </div>
  );
}

export function FlussoTrePassi() {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[32px] border border-vetrina-linea bg-vetrina-carta p-4 sm:p-7 lg:p-10 ${PUNTINI}`}
    >
      <div className="grid gap-y-7 lg:grid-cols-2 lg:gap-x-4">
        <div>
          <Nodo
            numero={1}
            icona={<IconaLente />}
            tono="neutro"
            titolo="Cerchi le aziende"
            sotto="Ricerca Clienti, su tutti i comuni italiani"
            pastiglie={['Città', 'Codice ATECO', 'Dipendenti', 'Fatturato', 'Forma giuridica', 'Socio']}
          />
          <Discese />
          <Nodo
            numero={2}
            icona={<IconaPalazzo />}
            tono="blu"
            titolo="AEGIS analizza l’azienda"
            sotto="Quattro fonti ufficiali, una scheda sola"
            pastiglie={['Registro Imprese', 'ISPRA IdroGEO', 'Protezione Civile', 'Bilanci depositati']}
          />
          <Discese />
          <Nodo
            numero={3}
            icona={<IconaDocumento />}
            tono="magenta"
            titolo="Prepari il report"
            sotto="I capitoli che l’intermediario consegna"
            pastiglie={['Sintesi', 'Capitali da assicurare', 'Coperture proposte', 'Obbligo CAT NAT']}
          />
        </div>

        <div className="flex flex-col justify-between gap-7 lg:gap-4">
          <Arrivo
            etichetta="Nel tuo CRM"
            icona={<IconaArchivio />}
            tono="magenta"
            titolo="Le aziende restano tue"
            sotto="Stato, nota e contatti di ognuna"
            esito="L’elenco entra nel CRM, e non lo ricompri"
          />
          <Arrivo
            etichetta="Sulla scheda"
            icona={<IconaGrafico />}
            tono="petrolio"
            titolo="Tre punteggi di rischio"
            sotto="Property, Business Interruption, Cyber"
            esito="Da 1 a 7, sede per sede, con l’obbligo CAT NAT"
          />
          <Arrivo
            etichetta="Al cliente"
            icona={<IconaScudo />}
            tono="arancio"
            titolo="Il report con il tuo nome"
            sotto="Intestazione, RUI, richieste ed esigenze"
            esito="Lo stampi o lo salvi in PDF"
          />
        </div>
      </div>
    </div>
  );
}
