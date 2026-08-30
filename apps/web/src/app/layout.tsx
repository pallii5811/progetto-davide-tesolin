import type { Metadata } from 'next';
import Link from 'next/link';
import { autenticazioneRichiesta, utenteCorrente } from '@/lib/api';
import type { UtenteCorrente } from '@/lib/api';
import { esci } from './accedi/actions';
import { NavigazionePrincipale } from './NavigazionePrincipale';
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

            {/*
              Su telefono la barra va a capo, non fuori schermo.

              Il contenitore esterno aveva `flex-wrap` e questo no: a 390 pixel il menu
              arrivava a 550, e **ogni pagina del prodotto** scorreva in orizzontale di
              centosessanta pixel. Non se n'era accorto nessuno perché l'unico collaudo
              che lo misurava girava senza accesso, quindi misurava nove volte il modulo
              di accesso, dove la barra non c'è.
            */}
            {dentro && (
              <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                <NavigazionePrincipale />

                {richiesta && (
                  <div className="flex items-center gap-3 border-l border-bordo pl-5">
                    <Link
                      href="/impostazioni"
                      title={utente.email}
                      className="rounded text-xs text-testo-debole underline-offset-2 hover:text-testo hover:underline"
                    >
                      {utente.nome}
                    </Link>
                    <form action={esci}>
                      <button
                        type="submit"
                        className="rounded text-xs text-testo-tenue underline-offset-2 hover:text-testo hover:underline"
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
