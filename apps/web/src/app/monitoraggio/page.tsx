import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';
import { leggiMonitoraggio } from '@/lib/api';
import type { EventoMonitoraggioDto } from '@/lib/api';
import { Scheda, ServizioNonRaggiungibile } from '@/components/ui';
import { BottoneAggiorna } from './BottoneAggiorna';
import { segnaGestito } from './actions';
import { formattaGiorno } from '@aegis/core/tempo';

export const dynamic = 'force-dynamic';

const ETICHETTE_TIPO: Record<string, string> = {
  'anagrafica-variata': 'Anagrafica',
  'nuova-sede': 'Ubicazione',
  'ateco-variato': 'Attività',
  'salto-dimensionale': 'Dimensione',
  'bilancio-depositato': 'Bilancio',
  'evento-negativo': 'Eventi negativi',
  'procedura-aperta': 'Procedura',
  'score-variato': 'Merito creditizio',
  'polizza-in-scadenza': 'Scadenza',
  'obbligo-normativo': 'Obbligo di legge',
};

export default async function PaginaMonitoraggio({
  searchParams,
}: {
  searchParams: Promise<{ tutti?: string }>;
}) {
  await richiediSessione();
  const { tutti } = await searchParams;
  const mostraTutti = tutti === '1';

  const monitoraggio = await leggiMonitoraggio(mostraTutti).catch(() => null);

  if (monitoraggio === null) {
    return <ServizioNonRaggiungibile titolo="Monitoraggio non disponibile" cosa="la coda degli eventi" />;
  }

  const { eventi, daGestire } = monitoraggio;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Monitoraggio</h1>
          {/*
            QUESTA SCHERMATA DEVE DIRE ANCHE CIÒ CHE NON FA, e prima non lo diceva.

            «Cosa è cambiato nelle aziende seguite» si legge come una sorveglianza continua:
            è così che la parola «monitoraggio» funziona nei prodotti concorrenti, dove un
            protesto iscritto stamattina arriva per posta nel pomeriggio. Qui no, e scoprirlo
            dopo la firma è il modo più veloce di perdere la fiducia di un cliente su tutto
            il resto.

            La verità è a metà e va detta intera: il confronto sulle fotografie già salvate
            è gratuito e coglie tutto ciò che dipende dalla data di oggi — scadenze, termini
            di legge, obblighi che maturano. Un fatto NUOVO del registro, invece, entra solo
            rianalizzando quell'impresa, e quella è una spesa.

            Dichiararlo qui costa tre righe. Non dichiararlo costa il cliente.
          */}
          <p className="max-w-3xl text-sm leading-relaxed text-testo-tenue">
            Cosa è cambiato nelle aziende seguite, e cosa comporta per le loro coperture. Ordinato per
            quanto costa <em>non</em> intervenire: in cima ci sono le situazioni in cui una garanzia già
            pagata potrebbe non indennizzare.
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-testo-debole">
            <strong className="text-testo-tenue">Come funziona:</strong> il confronto è{' '}
            <strong className="text-testo-tenue">a richiesta</strong>, non automatico — nessun controllo
            parte da solo e non viene inviata nessuna comunicazione. «Aggiorna» rilegge le analisi già
            salvate: è gratuito e coglie tutto ciò che dipende dalla data di oggi, come una polizza in
            scadenza o un termine di legge che matura. Un fatto nuovo del registro — un protesto, una
            procedura — compare invece solo{' '}
            <strong className="text-testo-tenue">rianalizzando quell’impresa</strong>, e quella è una spesa.
          </p>
        </div>
        <BottoneAggiorna />
      </div>

      <nav aria-label="Filtri" className="mb-4 flex flex-wrap gap-2">
        <FiltroLink attivo={!mostraTutti} href="/monitoraggio">
          Da gestire ({daGestire})
        </FiltroLink>
        <FiltroLink attivo={mostraTutti} href="/monitoraggio?tutti=1">
          Tutti gli eventi
        </FiltroLink>
      </nav>

      {eventi.length === 0 ? (
        <Scheda className="text-center">
          <p className="text-sm text-testo-tenue">
            {mostraTutti
              ? 'Nessun evento registrato. Il monitoraggio confronta le analisi salvate: serve almeno un’azienda analizzata.'
              : 'Nulla da gestire. Ogni evento rilevato è stato preso in carico.'}
          </p>
        </Scheda>
      ) : (
        <ul className="space-y-3">
          {eventi.map((evento) => (
            <RigaEvento key={evento.id} evento={evento} />
          ))}
        </ul>
      )}
    </>
  );
}

function FiltroLink({
  href,
  attivo,
  children,
}: {
  href: string;
  attivo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={attivo ? 'page' : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        attivo
          ? 'border-marchio bg-azione text-azione-testo'
          : 'border-bordo-forte bg-superficie hover:border-marchio/50'
      }`}
    >
      {children}
    </Link>
  );
}

function RigaEvento({ evento }: { evento: EventoMonitoraggioDto }) {
  const gestito = evento.gestitoIl !== null;

  // Il fatto e la conseguenza arrivano in un solo campo, separati da una riga vuota.
  // `split` li tipizza entrambi come `string`, ma la conseguenza c'è solo se il separatore
  // c'era: si estrae in modo che il tipo lo dichiari, invece di fidarsi.
  const separatore = evento.descrizione.indexOf('\n\n');
  const fatto = separatore === -1 ? evento.descrizione : evento.descrizione.slice(0, separatore);
  const conseguenza = separatore === -1 ? null : evento.descrizione.slice(separatore + 2);

  return (
    <li
      className={`rounded-lg border p-4 ${
        gestito ? 'border-bordo bg-fondo opacity-70' : 'border-bordo bg-superficie'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <BadgeRilevanza rilevanza={evento.rilevanza} />
            <span className="text-xs uppercase tracking-wide text-testo-debole">
              {ETICHETTE_TIPO[evento.tipo] ?? evento.tipo}
            </span>
            {gestito && <span className="text-xs text-basso">gestito</span>}
          </div>

          <p className="font-medium">{evento.titolo}</p>
          <Link
            href={`/azienda/${evento.identificativoAzienda}`}
            className="text-sm text-marchio hover:underline"
          >
            {evento.denominazioneAzienda}
          </Link>
        </div>

        {!gestito && (
          <form action={segnaGestito}>
            <input type="hidden" name="id" value={evento.id} />
            <button
              type="submit"
              className="rounded border border-bordo-forte px-3 py-1.5 text-xs font-medium text-testo-tenue transition hover:text-testo"
            >
              Segna gestito
            </button>
          </form>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-testo-tenue">{fatto}</p>

      {/*
        La conseguenza sulla copertura è la parte che l'intermediario riferisce al cliente:
        sta staccata dal fatto, perché è quella che giustifica la telefonata.
      */}
      {conseguenza !== null && (
        <p className="mt-2 border-l-2 border-alto/50 pl-3 text-sm leading-relaxed">{conseguenza}</p>
      )}

      {evento.azioneSuggerita !== null && (
        <p className="mt-2 text-sm leading-relaxed text-testo">
          <span className="font-medium">Da fare: </span>
          {evento.azioneSuggerita}
        </p>
      )}

      <p className="mt-2 text-xs text-testo-debole">
        Rilevato <time dateTime={evento.rilevatoIl}>{formattaQuando(evento.rilevatoIl)}</time>
      </p>
    </li>
  );
}

/** La rilevanza non misura quanto il fatto è vistoso, ma quanto costa non agire. */
function BadgeRilevanza({ rilevanza }: { rilevanza: number }) {
  const classi =
    rilevanza >= 5
      ? 'border-critico/40 bg-critico-fondo text-critico'
      : rilevanza === 4
        ? 'border-alto/30 bg-alto-fondo text-alto'
        : rilevanza === 3
          ? 'border-rilevante/30 bg-rilevante-fondo text-rilevante'
          : 'border-bordo-forte text-testo-debole';

  const testo =
    rilevanza >= 5 ? 'urgente' : rilevanza === 4 ? 'alta' : rilevanza === 3 ? 'media' : 'informativa';

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${classi}`}>
      {testo}
    </span>
  );
}

function formattaQuando(iso: string): string {
  const quando = new Date(iso);
  const minuti = Math.round((Date.now() - quando.getTime()) / 60_000);

  if (minuti < 2) return 'adesso';
  if (minuti < 60) return `${minuti} minuti fa`;
  if (minuti < 24 * 60) return `${Math.round(minuti / 60)} ore fa`;
  if (minuti < 48 * 60) return 'ieri';
  return formattaGiorno(quando);
}
