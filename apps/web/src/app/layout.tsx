import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { headers } from 'next/headers';
import Link from 'next/link';
import { statoAccesso, utenteCorrente } from '@/lib/api';
import { INTESTAZIONE_PERCORSO, INTESTAZIONE_VETRINA } from '@/lib/vetrina';
import type { UtenteCorrente } from '@/lib/api';
import { esci } from './accedi/actions';
import { NavigazionePrincipale } from './NavigazionePrincipale';
import { AvvisiAccount } from './AvvisiAccount';
import { BottoneInvio } from '@/components/BottoneInvio';
import { SegnoAegis } from '@/components/MarchioAegis';
import './globals.css';

export const metadata: Metadata = {
  title: 'AEGIS · Credit & Insurance Risk Intelligence',
  description:
    'Analisi integrata del merito creditizio e dei rischi assicurativi d’impresa per intermediari.',
};

/*
  Geist per tutto il prodotto, servito da Next insieme alle pagine: nessuna richiesta a terzi
  mentre si lavora. La variabile entra in `--font-sans` (globals.css), quindi ogni testo la
  eredita senza che nessuna pagina debba ricordarsene.
*/
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

/** Il marchio: la tessera con lo scudo e il nome, come nella vetrina. */
function Marchio({ conMotto = true }: { conMotto?: boolean }) {
  return (
    <Link href="/prospect" className="flex items-center gap-2.5 rounded-lg">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-azione text-azione-testo">
        <SegnoAegis className="h-[19px] w-[19px]" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[17px] font-semibold tracking-[-0.03em] text-testo">AEGIS</span>
        {conMotto && (
          <span className="block text-[11.5px] leading-snug text-testo-debole">
            Credit &amp; Insurance Risk Intelligence
          </span>
        )}
      </span>
    </Link>
  );
}

/** Le iniziali per la tessera dell'utente: «Giulia Ferri» → «GF». */
function iniziali(nome: string | undefined): string {
  const parti = (nome ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p !== '');
  return parti
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Chi è collegato, con l'uscita: in fondo alla barra laterale e nell'intestazione su telefono. */
function Utente({ utente, compatto = false }: { utente: UtenteCorrente; compatto?: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 ${compatto ? '' : 'rounded-xl border border-bordo bg-superficie p-2.5'}`}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marchio-tenue text-[12px] font-semibold text-marchio"
      >
        {iniziali(utente.nome)}
      </span>
      <Link
        href="/impostazioni"
        title={utente.email}
        className="min-w-0 flex-1 truncate rounded text-[13.5px] font-medium text-testo underline-offset-2 hover:underline"
      >
        {utente.nome}
      </Link>
      <form action={esci}>
        <BottoneInvio className="rounded-full px-2.5 py-1 text-[12.5px] text-testo-tenue transition-colors hover:bg-fondo hover:text-testo">
          Esci
        </BottoneInvio>
      </form>
    </div>
  );
}

/** La dichiarazione in fondo a ogni pagina. */
function Piede() {
  /*
    Con le parole di Simone del 17/09/2026 («AEGIS - cambi.pptx», slide 2), al posto di «Le
    valutazioni prodotte… ai sensi del Reg. IVASS 40/2018». Il report per il cliente ha la
    sua informativa, con gli articoli del Regolamento: questa riga non si stampa.
  */
  return (
    <footer className="no-print mt-16 border-t border-bordo py-6">
      <p className="mx-auto max-w-[1180px] px-5 text-xs leading-relaxed text-testo-debole sm:px-8 lg:px-10">
        Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono
        consulenza finanziaria né garanzia di solvibilità. Le eventuali proposte assicurative sono soggette
        alla valutazione dell’intermediario secondo la normativa IVASS applicabile.
      </p>
    </footer>
  );
}

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
      <html lang="it" className={geist.variable} style={{ colorScheme: 'light' }}>
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

  const avvisi = dentro && richiesta && (
    <AvvisiAccount
      acquistiAbilitati={utente.acquistiAbilitati !== false}
      emailDaConfermare={
        stato.postaAttiva && utente.emailVerificata === false && percorso !== '/conferma-email'
      }
      email={utente.email}
      creditoProva={utente.creditoProva ?? null}
    />
  );

  /*
    Chi non è dentro — accesso, registrazione, recupero, questionario del cliente — vede solo il
    marchio: nessun menu verso pagine che non può aprire.
  */
  if (!dentro) {
    return (
      <html lang="it" className={geist.variable}>
        <body className="min-h-screen antialiased">
          <header className="no-print border-b border-bordo bg-superficie/80">
            <div className="mx-auto flex max-w-[1180px] items-center px-5 py-3.5 sm:px-8">
              <Marchio />
            </div>
          </header>
          <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">{children}</main>
          <Piede />
        </body>
      </html>
    );
  }

  /*
    Dal redesign del 18/09/2026: barra laterale fissa su schermo largo, come nella finestra
    che la vetrina mostra, e intestazione compatta con il menu a pillole su telefono. Le due
    forme non convivono mai a schermo — una delle due è `display: none` — così il menu
    «Principale» e «Esci» esistono una volta sola per chi usa un lettore di schermo.
    In stampa la griglia si scioglie: il report esce come un documento, senza barre.
  */
  return (
    <html lang="it" className={geist.variable}>
      <body className="min-h-screen antialiased">
        <div className="min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)] print:block">
          <aside
            aria-label="Barra laterale"
            className="no-print sticky top-0 hidden h-screen flex-col border-r border-bordo bg-fondo px-3.5 pb-4 pt-5 lg:flex"
          >
            <div className="px-1.5">
              <Marchio />
            </div>
            <div className="mt-8">
              <NavigazionePrincipale variante="laterale" />
            </div>
            {richiesta && (
              <div className="mt-auto">
                <Utente utente={utente} />
              </div>
            )}
          </aside>

          <div className="flex min-w-0 flex-col">
            {/*
              Non fissa in alto: la scheda azienda ha già il suo indice delle sezioni fissato in
              cima, e due barre sovrapposte su un telefono lascerebbero al contenuto metà schermo.
            */}
            <header className="no-print border-b border-bordo bg-superficie lg:hidden">
              <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3">
                <Marchio conMotto={false} />
                {richiesta && <Utente utente={utente} compatto />}
              </div>
              <div className="pb-3">
                <NavigazionePrincipale variante="barra" />
              </div>
            </header>

            {avvisi}

            <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
              {children}
            </main>

            <Piede />
          </div>
        </div>
      </body>
    </html>
  );
}
