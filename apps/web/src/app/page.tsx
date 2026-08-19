import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { INDIRIZZO_API, cercaAziende, statoServizio } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PaginaRicerca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; piva?: string; provincia?: string }>;
}) {
  await richiediSessione();
  const parametri = await searchParams;
  const haCriteri = (parametri.q ?? '').trim() !== '' || (parametri.piva ?? '').trim() !== '';

  const stato = await statoServizio().catch(() => null);

  let risultati: Awaited<ReturnType<typeof cercaAziende>> | null = null;
  let errore: string | null = null;

  if (haCriteri) {
    try {
      risultati = await cercaAziende({
        ...(parametri.q === undefined ? {} : { denominazione: parametri.q }),
        ...(parametri.piva === undefined ? {} : { partitaIva: parametri.piva }),
        ...(parametri.provincia === undefined ? {} : { provincia: parametri.provincia }),
      });
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Analisi integrata di un&apos;azienda</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Da una partita IVA: profilo camerale, merito creditizio, registro dei rischi ISO 31000, somme
          assicurande calcolate dal bilancio, verifica dell&apos;obbligo catastrofale e piano d&apos;azione
          sulle coperture.
        </p>
      </div>

      {/*
        Due messaggi diversi per lo stesso guasto, perché i lettori sono due.
        In sviluppo serve l'indirizzo che non risponde e il comando per riavviare; in
        esercizio quel testo direbbe a un intermediario di lanciare comandi che non può
        lanciare, facendo sembrare rotto il prodotto invece del servizio.
      */}
      {stato === null && (
        <div className="mb-6">
          {process.env.NODE_ENV === 'production' ? (
            <Avviso tono="critico" titolo="Servizio momentaneamente non disponibile">
              Non è al momento possibile interrogare gli archivi. I dati già acquisiti restano
              consultabili dal portafoglio. Se la situazione persiste, segnalarlo all&apos;assistenza.
            </Avviso>
          ) : (
            <Avviso tono="critico" titolo="Servizio API non raggiungibile">
              Nessuna risposta da <code className="font-mono">{INDIRIZZO_API}</code>. Avviare il
              servizio con <code className="font-mono">npm run dev:api</code>, oppure indicare
              l&apos;indirizzo corretto nella variabile{' '}
              <code className="font-mono">AEGIS_API_URL</code>.
            </Avviso>
          )}
        </div>
      )}

      {/*
        La modalità va dichiarata in entrambi i versi. Sapere di essere in dimostrativo
        evita di prendere per buoni dei numeri inventati; sapere di essere sui dati reali
        evita di scoprire a fine mese quanto è costato provare.
      */}
      {stato !== null && !stato.datiReali && (
        <div className="mb-6">
          <Avviso tono="informativo" titolo="Modalità dimostrativa">
            La piattaforma sta usando dati dimostrativi coerenti e non consuma credito: servono a
            provare il percorso, non a fondare una proposta. Il collegamento agli archivi reali si
            attiva dalle impostazioni.
          </Avviso>
        </div>
      )}

      {stato !== null && stato.datiReali && (
        <div className="mb-6">
          <Avviso tono="attenzione" titolo="Dati reali — ogni analisi consuma credito">
            Ogni analisi interroga gli archivi camerali e consuma credito:{' '}
            <strong>
              {(stato.costoAnalisiCentesimi / 100).toFixed(2).replace('.', ',')} € per analisi
            </strong>
            , {(stato.costoAnalisiApprofonditaCentesimi / 100).toFixed(2).replace('.', ',')} € se
            approfondita. Le aziende già in portafoglio non vengono riacquistate, e la ricerca per
            provincia conta i risultati senza costo prima di scaricarne uno.
            {process.env.NODE_ENV !== 'production' && (
              <>
                {' '}
                Per provare senza spendere: <code className="font-mono">npm run dev:api:demo</code>.
              </>
            )}
          </Avviso>
        </div>
      )}

      <Scheda className="mb-8">
        <form method="get" className="grid gap-4 sm:grid-cols-[2fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
              Denominazione
            </span>
            <input
              type="text"
              name="q"
              defaultValue={parametri.q ?? ''}
              placeholder="Ragione sociale, anche parziale"
              className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
              Partita IVA
            </span>
            <input
              type="text"
              name="piva"
              inputMode="numeric"
              defaultValue={parametri.piva ?? ''}
              placeholder="11 cifre"
              className="tabular w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio"
            />
          </label>

          <button
            type="submit"
            className="self-end rounded bg-azione px-5 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90"
          >
            Cerca
          </button>
        </form>

        <p className="mt-3 text-xs text-testo-debole">
          Esempi in modalità dimostrativa: <code className="font-mono">03158460174</code> (meccanica,
          Brescia) · <code className="font-mono">02657870644</code> (costruzioni, Avellino) ·{' '}
          <code className="font-mono">02413390390</code> (logistica, Ravenna)
        </p>
      </Scheda>

      {errore !== null && (
        <Avviso tono="attenzione" titolo="Ricerca non eseguita">
          {errore}
        </Avviso>
      )}

      {risultati !== null && risultati.risultati.length === 0 && (
        <p className="text-sm text-testo-tenue">Nessuna azienda trovata con questi criteri.</p>
      )}

      {risultati !== null && risultati.risultati.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-bordo">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
              <tr>
                <th className="px-4 py-2.5 font-medium">Denominazione</th>
                <th className="px-4 py-2.5 font-medium">Partita IVA</th>
                <th className="px-4 py-2.5 font-medium">Sede</th>
                <th className="px-4 py-2.5 font-medium">ATECO</th>
                <th className="px-4 py-2.5 font-medium">Stato</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {risultati.risultati.map((azienda) => (
                <tr key={azienda.providerId} className="border-t border-bordo bg-superficie">
                  <td className="px-4 py-3 font-medium">{azienda.denominazione}</td>
                  <td className="tabular px-4 py-3 text-testo-tenue">{azienda.partitaIva ?? '—'}</td>
                  <td className="px-4 py-3 text-testo-tenue">
                    {azienda.comune ?? '—'}
                    {azienda.provincia !== null && ` (${azienda.provincia})`}
                  </td>
                  <td className="tabular px-4 py-3 text-testo-tenue">{azienda.ateco ?? '—'}</td>
                  {/*
                    Lo stato camerale prima dell'analisi: analizzare un'impresa cessata
                    spende credito per un profilo che non serve a nessun preventivo.
                  */}
                  <td className="px-4 py-3">
                    {azienda.statoAttivita === 'attiva' ? (
                      <span className="text-testo-tenue">Attiva</span>
                    ) : (
                      <span className="rounded bg-critico/15 px-2 py-0.5 text-xs font-medium capitalize text-critico">
                        {azienda.statoAttivita.replace('-', ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/azienda/${azienda.providerId}`}
                      className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
                    >
                      Analizza
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        La ricerca per denominazione usa l'elenco camerale, che non porta il settore.
        Dirlo solo quando manca davvero: una nota che compare sempre non viene più letta.
      */}
      {risultati !== null && risultati.risultati.some((a) => a.ateco === null) && (
        <p className="mt-3 text-xs text-testo-debole">
          Il settore delle aziende senza ATECO viene acquisito con l&apos;analisi.
        </p>
      )}
    </>
  );
}
