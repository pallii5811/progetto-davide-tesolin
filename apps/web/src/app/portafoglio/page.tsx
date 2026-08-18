import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { leggiPortafoglio } from '@/lib/api';
import type { VocePortafoglio } from '@/lib/api';
import { Avviso, Metrica, Scheda } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PaginaPortafoglio({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await richiediSessione();
  const { filtro } = await searchParams;

  const portafoglio = await leggiPortafoglio().catch(() => null);

  if (portafoglio === null) {
    return (
      <Avviso tono="critico" titolo="Servizio non raggiungibile">
        Avviare il backend con <code className="font-mono">npm run dev:api</code>.
      </Avviso>
    );
  }

  if (portafoglio.aziende.length === 0) {
    return (
      <>
        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Portafoglio</h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Qui compaiono le aziende analizzate, ordinate per urgenza di intervento.
        </p>
        <Scheda className="text-center">
          <p className="text-sm text-testo-tenue">Nessuna azienda ancora analizzata.</p>
          <p className="mt-3 text-sm text-testo-tenue">
            <Link href="/portafoglio/importa" className="text-marchio underline">
              Carica l’elenco dei tuoi clienti
            </Link>{' '}
            per prenderli in carico tutti insieme, oppure{' '}
            <Link href="/" className="text-marchio underline">
              cerca la prima azienda
            </Link>
            .
          </p>
        </Scheda>
      </>
    );
  }

  const aziende =
    filtro === 'catnat'
      ? portafoglio.aziende.filter((a) => !a.catNatConforme)
      : filtro === 'scoperte'
        ? portafoglio.aziende.filter((a) => a.coperturaAssente > 0)
        : portafoglio.aziende;

  const { riepilogo } = portafoglio;
  const quotaNonConformi =
    riepilogo.totale === 0 ? 0 : Math.round((riepilogo.nonConformiCatNat / riepilogo.totale) * 100);

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Portafoglio</h1>
        <Link
          href="/portafoglio/importa"
          className="rounded border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
        >
          Importa elenco clienti
        </Link>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Ordinato per urgenza: prima le posizioni non conformi a un obbligo di legge, poi per esposizione
        patrimoniale scoperta. Non è un cruscotto da guardare, è una lista di telefonate da fare.
      </p>

      {/*
        Due colonne già sullo schermo più stretto: incolonnate una sotto l'altra, le
        quattro sintesi occupano l'intera altezza del telefono e spingono sotto la piega
        proprio la lista di lavoro, che è la ragione per cui si apre questa pagina.
      */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etichetta="Aziende analizzate" valore={String(riepilogo.totale)} />
        <Metrica
          etichetta="Non conformi CAT NAT"
          valore={String(riepilogo.nonConformiCatNat)}
          nota={`${quotaNonConformi}% del portafoglio · obbligo di legge`}
          tono={riepilogo.nonConformiCatNat > 0 ? 'critico' : 'positivo'}
        />
        <Metrica
          etichetta="Coperture da attivare"
          valore={String(riepilogo.coperturaAssenteTotale)}
          nota="Somma delle garanzie assenti"
        />
        <Metrica
          etichetta="Esposizione complessiva"
          valore={new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          }).format(riepilogo.esposizioneComplessivaEuro)}
          nota="Patrimonio non assicurato dei clienti seguiti"
          tono="attenzione"
        />
      </div>

      <nav aria-label="Filtri" className="mb-4 flex flex-wrap gap-2">
        {[
          { chiave: undefined, testo: `Tutte (${portafoglio.aziende.length})` },
          {
            chiave: 'catnat',
            testo: `Non conformi CAT NAT (${riepilogo.nonConformiCatNat})`,
          },
          {
            chiave: 'scoperte',
            testo: `Con coperture assenti (${portafoglio.aziende.filter((a) => a.coperturaAssente > 0).length})`,
          },
        ].map((voce) => {
          const attivo = filtro === voce.chiave;
          return (
            <Link
              key={voce.testo}
              href={voce.chiave === undefined ? '/portafoglio' : `/portafoglio?filtro=${voce.chiave}`}
              aria-current={attivo ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                attivo
                  ? 'border-marchio bg-marchio text-white'
                  : 'border-bordo-forte bg-superficie hover:border-marchio/50'
              }`}
            >
              {voce.testo}
            </Link>
          );
        })}
      </nav>

      {/*
        Su schermo stretto la tabella diventa un elenco di schede.
        Lo scorrimento orizzontale non basta: il broker che apre il portafoglio in azienda,
        davanti al cliente, vedrebbe azienda e score e niente altro — né lo stato CAT NAT,
        né l'esposizione, né il comando per aprire la posizione — senza alcun indizio che
        ci sia dell'altro fuori dallo schermo.
      */}
      <ul className="space-y-2 md:hidden">
        {aziende.map((azienda) => (
          <li key={azienda.identificativo} className="rounded-lg border border-bordo bg-superficie p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{azienda.denominazione}</p>
                <p className="text-xs text-testo-debole">
                  {azienda.provincia ?? '—'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
                </p>
              </div>
              <StatoCatNat azienda={azienda} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-testo-debole">Score</dt>
                <dd>
                  <PunteggioCredito azienda={azienda} />
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-testo-debole">Esposizione scoperta</dt>
                <dd className="tabular font-medium">{esposizione(azienda)}</dd>
              </div>
            </dl>

            {azienda.azionePrioritaria !== null && (
              <p className="mt-3 border-l-2 border-marchio/40 pl-2 text-xs leading-relaxed text-testo-tenue">
                {azienda.azionePrioritaria}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-testo-debole">
                Dati di intervista {Math.round(azienda.completezza * 100)}%
                {azienda.coperturaAssente > 0 && ` · ${azienda.coperturaAssente} coperture assenti`}
              </span>
              <Link
                href={`/azienda/${azienda.identificativo}`}
                className="rounded bg-marchio px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Apri
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-bordo md:block">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">
            Aziende in portafoglio con stato di conformità ed esposizione non assicurata
          </caption>
          <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Azienda
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Score
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                CAT NAT
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Esposizione scoperta
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Prossima azione
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {aziende.map((azienda) => (
              <tr key={azienda.identificativo} className="border-t border-bordo bg-superficie align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{azienda.denominazione}</p>
                  <p className="text-xs text-testo-debole">
                    {azienda.provincia ?? '—'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
                  </p>
                  <p className="mt-0.5 text-xs text-testo-debole">
                    Dati di intervista {Math.round(azienda.completezza * 100)}%
                  </p>
                </td>

                <td className="px-4 py-3">
                  <PunteggioCredito azienda={azienda} />
                </td>

                <td className="px-4 py-3">
                  <StatoCatNat azienda={azienda} />
                </td>

                <td className="tabular px-4 py-3 text-right font-medium">
                  {esposizione(azienda)}
                  {azienda.coperturaAssente > 0 && (
                    <span className="block text-xs font-normal text-testo-debole">
                      {azienda.coperturaAssente} coperture assenti
                    </span>
                  )}
                </td>

                <td className="max-w-xs px-4 py-3 text-xs leading-relaxed text-testo-tenue">
                  {azienda.azionePrioritaria ?? '—'}
                </td>

                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/azienda/${azienda.identificativo}`}
                    className="rounded bg-marchio px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Apri
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aziende.length === 0 && (
        <p className="mt-4 text-sm text-testo-tenue">Nessuna azienda corrisponde al filtro scelto.</p>
      )}
    </>
  );
}

/**
 * I due frammenti condivisi fra la tabella e le schede.
 *
 * Scritti una volta sola: due impaginazioni della stessa informazione che divergono sono
 * peggio di una sola impaginazione imperfetta — il broker vedrebbe numeri diversi a
 * seconda dello schermo, e non saprebbe a quale credere.
 */
/**
 * L'esposizione scoperta, con la distinzione fra «zero» e «ignoto».
 *
 * Su un'azienda che deposita il bilancio in forma abbreviata nessun capitale è ricavabile:
 * la somma delle esposizioni quantificate vale legittimamente zero, ma stampare «0 €» in
 * una lista di lavoro fa saltare proprio le posizioni da lavorare per prime.
 */
function esposizione(azienda: VocePortafoglio): string {
  return azienda.esposizioneNonAssicurata.euro === 0 && azienda.coperturaDaQuantificare > 0
    ? 'da quantificare'
    : azienda.esposizioneNonAssicurata.formattato;
}

function PunteggioCredito({ azienda }: { azienda: VocePortafoglio }) {
  const colore =
    azienda.scoreCredito >= 65
      ? 'text-basso'
      : azienda.scoreCredito >= 50
        ? 'text-rilevante'
        : 'text-critico';

  return (
    <>
      <span className={`tabular font-semibold ${colore}`}>{azienda.scoreCredito}</span>
      <span className="ml-1 text-xs text-testo-debole">{azienda.classeCredito}</span>
    </>
  );
}

function StatoCatNat({ azienda }: { azienda: VocePortafoglio }) {
  if (azienda.catNatConforme) {
    return (
      <span className="rounded border border-basso/30 bg-basso-fondo px-1.5 py-0.5 text-xs font-medium text-basso">
        conforme
      </span>
    );
  }

  return (
    <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium text-critico">
      {azienda.statoCatNat}
    </span>
  );
}
