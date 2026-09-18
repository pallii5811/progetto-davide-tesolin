import { redirect } from 'next/navigation';
import { CollegamentoPubblico, CornicePubblica, ServizioAssente } from '@/components/accesso';
import { statoAccesso, utenteCorrente } from '@/lib/api';
import { ModuloAccesso } from './ModuloAccesso';
import { accedi } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Accesso · AEGIS' };

/** I messaggi con cui si arriva qui da un'altra pagina: solo questi, mai testo preso dall'indirizzo. */
const MESSAGGI_DI_ARRIVO: Readonly<Record<string, string>> = {
  aggiornata: 'Password aggiornata: entra con quella nuova.',
  registrato: 'Account creato: entra con la password che hai scelto.',
};

export default async function PaginaAccesso({
  searchParams,
}: {
  searchParams: Promise<{ ritorno?: string; password?: string; registrato?: string }>;
}) {
  const { ritorno, password, registrato } = await searchParams;

  // Chi è già dentro non deve vedere la schermata di accesso: sarebbe solo un vicolo cieco.
  // A «Nuovi clienti» direttamente: «/» rinvia lì, e un rinvio in più è un passaggio che può fermarsi.
  const stato = await statoAccesso();
  if (!stato.raggiungibile) return <ServizioAssente />;
  if (!stato.autenticazioneRichiesta) redirect('/prospect');
  if ((await utenteCorrente()).autenticato) redirect('/prospect');

  const arrivo =
    password === 'aggiornata'
      ? MESSAGGI_DI_ARRIVO['aggiornata']
      : registrato === '1'
        ? MESSAGGI_DI_ARRIVO['registrato']
        : undefined;

  return (
    <CornicePubblica
      titolo="Accesso"
      sottotitolo="Il CRM e i dati di intervista sono riservati al tuo studio."
      piede={
        <>
          {stato.registrazioneAperta && (
            <p>
              Non hai un account?{' '}
              <CollegamentoPubblico href="/registrati">Crea il tuo studio</CollegamentoPubblico>
            </p>
          )}
          {/* Nota per chi installa: in produzione non serve a chi entra, e lo confonderebbe. */}
          {process.env.NODE_ENV !== 'production' && (
            <p className="text-xs leading-relaxed text-testo-debole">
              Al primo avvio il servizio crea un utente amministratore e ne stampa la password nel
              terminale, una sola volta.
            </p>
          )}
        </>
      }
    >
      {arrivo !== undefined && (
        <p
          role="status"
          className="mb-4 rounded border border-basso/30 bg-basso-fondo px-3 py-2 text-sm text-basso"
        >
          {arrivo}
        </p>
      )}

      <ModuloAccesso azione={accedi} ritorno={ritorno ?? ''} />

      <p className="mt-4 text-center text-sm">
        <CollegamentoPubblico href="/password-dimenticata">Password dimenticata?</CollegamentoPubblico>
      </p>
    </CornicePubblica>
  );
}
