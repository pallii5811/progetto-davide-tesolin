import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { statoAccesso, utenteCorrente } from '@/lib/api';
import { INTESTAZIONE_PERCORSO, INTESTAZIONE_VETRINA } from '@/lib/vetrina';
import type { UtenteCorrente } from '@/lib/api';
import { esci } from './accedi/actions';
import { NavigazionePrincipale } from './NavigazionePrincipale';
import { AvvisiAccount } from './AvvisiAccount';
import { BottoneInvio } from '@/components/BottoneInvio';
import './globals.css';

export const metadata: Metadata = {
  title: 'AEGIS · Credit & Insurance Risk Intelligence',
  description:
    'Analisi integrata del merito creditizio e dei rischi assicurativi d’impresa per intermediari.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
    La vetrina (la radice senza sessione, vedi middleware.ts) porta menu, piè di pagina e
    dichiarazione IVASS suoi: qui riceve solo il documento. E nessuna chiamata all'API: la pagina
    pubblica deve aprirsi anche se l'API è ferma, e non c'è un utente da chiedere.
    Dalla vetrina si esce solo con collegamenti a pagina intera (app/_vetrina/pezzi.tsx): il
    layout non si conserva fra le due facce, e ogni pagina del prodotto lo riceve completo.
  */
  const intestazioni = await headers();
  if (intestazioni.get(INTESTAZIONE_VETRINA) === '1') {
    return (
      <html lang="it" style={{ colorScheme: 'light' }}>
        <body className="min-h-screen bg-vetrina-carta">{children}</body>
      </html>
    );
  }

  // Senza autenticazione attiva (dimostrazione locale) la navigazione resta visibile e
  // non si mostra alcuna identità: non c'è nessuno da mostrare.
  const stato = await statoAccesso();
  const richiesta = stato.autenticazioneRichiesta;
  const utente: UtenteCorrente = richiesta ? await utenteCorrente() : { autenticato: true };
  const dentro = utente.autenticato;
  // Sulla pagina che conferma l'indirizzo l'avviso «conferma il tuo indirizzo» sarebbe già vecchio.
  const percorso = intestazioni.get(INTESTAZIONE_PERCORSO) ?? '';

  return (
    <html lang="it">
      <body className="min-h-screen">
        <header className="no-print border-b border-bordo bg-superficie">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <Link href="/prospect" className="flex items-baseline gap-2.5">
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
                      <BottoneInvio className="rounded text-xs text-testo-tenue underline-offset-2 hover:text-testo hover:underline">
                        Esci
                      </BottoneInvio>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {dentro && richiesta && (
          <AvvisiAccount
            acquistiAbilitati={utente.acquistiAbilitati !== false}
            emailDaConfermare={
              stato.postaAttiva && utente.emailVerificata === false && percorso !== '/conferma-email'
            }
            email={utente.email}
          />
        )}

        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

        {/*
          Con le parole di Simone del 17/09/2026 («AEGIS - cambi.pptx», slide 2), al posto di «Le
          valutazioni prodotte… ai sensi del Reg. IVASS 40/2018». Il report per il cliente ha la
          sua informativa, con gli articoli del Regolamento: questa riga non si stampa.
        */}
        <footer className="no-print mt-16 border-t border-bordo py-6">
          <p className="mx-auto max-w-7xl px-6 text-xs text-testo-debole">
            Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono
            consulenza finanziaria né garanzia di solvibilità. Le eventuali proposte assicurative sono
            soggette alla valutazione dell’intermediario secondo la normativa IVASS applicabile.
          </p>
        </footer>
      </body>
    </html>
  );
}
