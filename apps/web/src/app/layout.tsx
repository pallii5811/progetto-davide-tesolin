import type { Metadata } from 'next';
import Link from 'next/link';
import { autenticazioneRichiesta, utenteCorrente } from '@/lib/api';
import type { UtenteCorrente } from '@/lib/api';
import { esci } from './accedi/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'AEGIS · Credit & Insurance Risk Intelligence',
  description:
    'Analisi integrata del merito creditizio e dei rischi assicurativi d’impresa per intermediari.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Senza autenticazione attiva (dimostrazione locale) la navigazione resta visibile e
  // non si mostra alcuna identità: non c'è nessuno da mostrare.
  const richiesta = await autenticazioneRichiesta();
  const utente: UtenteCorrente = richiesta ? await utenteCorrente() : { autenticato: true };
  const dentro = utente.autenticato;

  return (
    <html lang="it">
      <body className="min-h-screen">
        <header className="no-print border-b border-bordo bg-superficie">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="text-lg font-bold tracking-tight text-marchio">AEGIS</span>
              <span className="hidden text-xs text-testo-debole sm:inline">
                Credit &amp; Insurance Risk Intelligence
              </span>
            </Link>

            {dentro && (
              <div className="flex items-center gap-5">
                <nav aria-label="Principale" className="flex gap-5 text-sm text-testo-tenue">
                  <Link
                    href="/"
                    className="rounded hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
                  >
                    Ricerca
                  </Link>
                  <Link
                    href="/prospect"
                    className="rounded hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
                  >
                    Nuovi clienti
                  </Link>
                  <Link
                    href="/portafoglio"
                    className="rounded hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
                  >
                    Portafoglio
                  </Link>
                  <Link
                    href="/monitoraggio"
                    className="rounded hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
                  >
                    Monitoraggio
                  </Link>
                  <Link
                    href="/catalogo"
                    className="rounded hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
                  >
                    Catalogo rischi
                  </Link>
                </nav>

                {richiesta && (
                  <div className="flex items-center gap-3 border-l border-bordo pl-5">
                    <Link
                      href="/impostazioni"
                      title={utente.email}
                      className="rounded text-xs text-testo-debole underline-offset-2 hover:text-testo hover:underline focus:outline-none focus:ring-2 focus:ring-marchio/40"
                    >
                      {utente.nome}
                    </Link>
                    <form action={esci}>
                      <button
                        type="submit"
                        className="rounded text-xs text-testo-tenue underline-offset-2 hover:text-testo hover:underline focus:outline-none focus:ring-2 focus:ring-marchio/40"
                      >
                        Esci
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

        <footer className="no-print mt-16 border-t border-bordo py-6">
          <p className="mx-auto max-w-7xl px-6 text-xs text-testo-debole">
            Le valutazioni prodotte sono elaborazioni statistiche a supporto della consulenza, non
            costituiscono consulenza finanziaria né garanzia di solvibilità. Ogni proposta assicurativa
            resta soggetta alla valutazione dell&apos;intermediario ai sensi del Reg. IVASS 40/2018.
          </p>
        </footer>
      </body>
    </html>
  );
}
