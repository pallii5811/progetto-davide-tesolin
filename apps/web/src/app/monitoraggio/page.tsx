import Link from 'next/link';

/**
 * Monitoraggio: la funzione c'è nel piano, non nel prodotto.
 *
 * Il 17/09/2026 la pagina è stata tolta perché mostrava una sorveglianza che nessuno stava
 * facendo davvero; il 18/09/2026 Simone l'ha voluta di nuovo visibile, dichiarata come in
 * lavorazione, per la presentazione a un cliente.
 *
 * Quindi qui non c'è nessun dato: né un elenco vuoto che sembra «nessun allarme», né un
 * esempio inventato che sembra un allarme vero. Una pagina che dice cosa farà e che oggi non
 * lo fa è onesta; una che mostra una tabella finta davanti a un cliente è una promessa che
 * qualcuno si porta a casa.
 *
 * Non porta nemmeno una data: non ce n'è una decisa, e una data inventata è una promessa
 * come le altre.
 */
export const metadata = { title: 'Monitoraggio · AEGIS' };

export default function PaginaMonitoraggio() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Monitoraggio</h1>
        <span className="rounded-full border border-bordo-forte px-3 py-1 text-xs font-medium uppercase tracking-wide text-testo-debole">
          In arrivo
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-testo-debole">
        Le aziende del CRM sorvegliate nel tempo: quando cambia qualcosa che conta, il cambiamento arriva
        qui invece di aspettare la prossima analisi.
      </p>

      <section className="mt-8 max-w-3xl rounded border border-bordo bg-superficie p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-testo-debole">Che cosa farà</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li>
            Controllerà periodicamente le aziende che hai già analizzato e quelle degli elenchi scaricati.
          </li>
          <li>
            Segnalerà i fatti che cambiano una valutazione: un protesto nuovo, una pregiudizievole, una
            procedura concorsuale aperta, un bilancio depositato, la cessazione dell’attività.
          </li>
          <li>
            Dirà da dove viene ogni segnalazione e quando è stata osservata, come fa la scheda dell’azienda:
            nessun avviso senza la sua fonte.
          </li>
        </ul>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-testo-debole">
          Che cosa non fa oggi
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          Non è attivo: nessuna azienda è sorvegliata in questo momento e in questa pagina non ci sono dati.
          Finché non lo sarà, i cambiamenti si vedono rifacendo l’analisi dalla scheda dell’azienda.
        </p>

        <p className="mt-6 text-sm">
          <Link href="/portafoglio" className="text-marchio underline underline-offset-2">
            Vai al CRM
          </Link>
        </p>
      </section>
    </>
  );
}
