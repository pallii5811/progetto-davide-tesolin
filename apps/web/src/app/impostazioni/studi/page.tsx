import { redirect } from 'next/navigation';
import { richiediSessione } from '@/lib/sessione';
import { elencoStudi } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { BottoneAttivita } from './BottoneAttivita';
import { ModuloStudio } from './ModuloStudio';

export const dynamic = 'force-dynamic';

/**
 * Gli studi ospitati sulla piattaforma.
 *
 * Pagina di chi la piattaforma la **gestisce**, non di chi la usa. Mostra quanti
 * collaboratori ha ciascuno studio e se è attivo: mai cosa ci sia nel suo portafoglio.
 * L'isolamento fra intermediari vale anche verso l'alto — chi ospita il servizio non
 * diventa per questo titolare dei dati dei clienti altrui.
 */
export default async function PaginaStudi() {
  const utente = await richiediSessione();
  if (utente.gestorePiattaforma !== true) redirect('/impostazioni');

  const esito = await elencoStudi().catch(() => null);

  const intestazione = (
    <>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Studi sulla piattaforma</h2>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Ogni studio lavora isolato dagli altri: portafoglio, clienti e analisi non attraversano il
        confine, in nessuna direzione. Qui si aprono e si sospendono gli accessi, non si guarda
        dentro.
      </p>
    </>
  );

  if (esito === null) {
    return (
      <>
        {intestazione}
        <Avviso tono="critico" titolo="Elenco non disponibile">
          Il servizio non ha risposto. L&apos;elenco degli studi richiede l&apos;archivio attivo.
        </Avviso>
      </>
    );
  }

  return (
    <>
      {intestazione}

      <div className="mb-6">
        <ModuloStudio />
      </div>

      <Scheda className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Studi ospitati, con numero di collaboratori e stato</caption>
          <thead className="bg-fondo text-left text-xs uppercase tracking-wide text-testo-debole">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Studio
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Collaboratori
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Stato
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {esito.studi.map((studio) => (
              <tr key={studio.id} className="border-t border-bordo align-middle">
                <td className="px-4 py-3">
                  <p className="font-medium">{studio.denominazione}</p>
                  <p className="text-xs text-testo-debole">
                    {studio.numeroRui === null ? 'RUI non indicato' : `RUI n. ${studio.numeroRui}`} ·
                    aperto il {new Date(studio.apertoIl).toLocaleDateString('it-IT')}
                  </p>
                </td>
                <td className="tabular px-4 py-3">{studio.utenti}</td>
                <td className="px-4 py-3">
                  {studio.gestore ? (
                    <span className="rounded border border-bordo-forte px-1.5 py-0.5 text-xs text-testo-tenue">
                      gestore
                    </span>
                  ) : studio.attivo ? (
                    <span className="rounded border border-basso/30 bg-basso-fondo px-1.5 py-0.5 text-xs font-medium text-basso">
                      attivo
                    </span>
                  ) : (
                    <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium text-critico">
                      sospeso
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Lo studio gestore non si sospende: si chiuderebbe fuori da solo. */}
                  {!studio.gestore && (
                    <BottoneAttivita
                      id={studio.id}
                      denominazione={studio.denominazione}
                      attivo={studio.attivo}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scheda>
    </>
  );
}
