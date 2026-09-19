import { redirect } from 'next/navigation';
import { richiediSessione } from '@/lib/sessione';
import { elencoStudi, statoAccesso } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { BottoneAcquisti } from './BottoneAcquisti';
import { TettoTotale } from './TettoTotale';
import { BottoneAttivita } from './BottoneAttivita';
import { ModuloStudio } from './ModuloStudio';
import { formattaGiorno } from '@aegis/core/tempo';

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

  const [esito, stato] = await Promise.all([elencoStudi().catch(() => null), statoAccesso()]);

  const intestazione = (
    <>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Studi sulla piattaforma</h2>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Ogni studio lavora isolato dagli altri: CRM, clienti e analisi non attraversano il confine, in
        nessuna direzione. Qui si aprono e si sospendono gli accessi, non si guarda dentro.
      </p>
      <p className="-mt-3 mb-6 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Gli studi registrati da soli entrano subito ma non comprano dati finché non attivi i loro acquisti:
        prima controlla il numero RUI sul registro IVASS.
        {stato.postaAttiva
          ? ' L’attivazione si sblocca solo dopo che chi ha aperto lo studio ha confermato la sua email.'
          : ' Le email non sono ancora attive: nessun indirizzo può essere confermato, quindi la verifica del RUI è tutto ciò che hai.'}
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
        <table className="w-full min-w-[58rem] text-sm">
          <caption className="sr-only">
            Studi ospitati, con numero di collaboratori, stato, acquisti e spesa di dati
          </caption>
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
              <th scope="col" className="px-4 py-2.5 font-medium">
                Acquisti
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Spesa dati
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {esito.studi.map((studio) => (
              <tr key={studio.id} className="border-t border-bordo align-middle">
                <td className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {studio.denominazione}
                    {studio.autoRegistrato && (
                      <span className="rounded-full border border-marchio/30 bg-marchio-tenue px-2 py-0.5 text-xs font-normal text-marchio">
                        registrato da sé
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-testo-debole">
                    {studio.numeroRui === null ? 'RUI non indicato' : `RUI n. ${studio.numeroRui}`} · aperto
                    il {formattaGiorno(studio.apertoIl)}
                  </p>
                  {/* Chi ha aperto lo studio, e se la sua email è sua: ciò che si guarda prima di attivare. */}
                  {studio.referente !== null && (
                    <p className="text-xs text-testo-debole">
                      {studio.referente.email} ·{' '}
                      {studio.referente.emailConfermata ? 'email confermata' : 'email da confermare'}
                    </p>
                  )}
                </td>
                <td className="tabular px-4 py-3">{studio.utenti}</td>
                <td className="px-4 py-3">
                  {studio.gestore ? (
                    <span className="rounded-full border border-bordo-forte px-2 py-0.5 text-xs text-testo-tenue">
                      gestore
                    </span>
                  ) : studio.attivo ? (
                    <span className="rounded-full border border-basso/30 bg-basso-fondo px-2 py-0.5 text-xs font-medium text-basso">
                      attivo
                    </span>
                  ) : (
                    <span className="rounded-full border border-critico/40 bg-critico-fondo px-2 py-0.5 text-xs font-medium text-critico">
                      sospeso
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {studio.acquistiAbilitati ? (
                    <span className="text-xs text-testo-tenue">attivi</span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full border border-attenzione/40 bg-attenzione-fondo px-2 py-0.5 text-xs font-medium text-attenzione">
                      in attesa
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {/*
                    Il tetto complessivo si imposta sugli studi clienti (gli account di prova). Il
                    gestore paga la fornitura: per lui la spesa si legge e basta.
                  */}
                  {studio.gestore ? (
                    <span className="tabular text-xs text-testo-tenue">
                      {(studio.spesaTotaleCentesimi / 100).toFixed(2).replace('.', ',')} € spesi
                    </span>
                  ) : (
                    <TettoTotale
                      id={studio.id}
                      denominazione={studio.denominazione}
                      tettoCentesimi={studio.tettoSpesaTotaleCentesimi}
                      spesoCentesimi={studio.spesaTotaleCentesimi}
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Lo studio gestore non si sospende e non si blocca: si chiuderebbe fuori da solo. */}
                  {!studio.gestore && (
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      <BottoneAcquisti
                        id={studio.id}
                        denominazione={studio.denominazione}
                        numeroRui={studio.numeroRui}
                        abilitati={studio.acquistiAbilitati}
                        attesaConferma={
                          stato.postaAttiva &&
                          studio.referente !== null &&
                          !studio.referente.emailConfermata
                        }
                      />
                      <BottoneAttivita
                        id={studio.id}
                        denominazione={studio.denominazione}
                        attivo={studio.attivo}
                      />
                    </span>
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
