import { CollegamentoPubblico, CornicePubblica } from '@/components/accesso';
import { utenteCorrente } from '@/lib/api';
import { ModuloConferma } from './ModuloConferma';
import { confermaIndirizzo } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Conferma dell’indirizzo · AEGIS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Il collegamento di conferma, ricevuto per email.
 *
 * Aprire la pagina non conferma niente: serve il pulsante (vedi actions.ts). Il codice resta
 * valido finché non scade, quindi un filtro antivirus che apre il collegamento prima della
 * persona non lo consuma e non conferma al suo posto.
 */
export default async function PaginaConfermaEmail({
  searchParams,
}: {
  searchParams: Promise<{ codice?: string | string[] }>;
}) {
  const { codice } = await searchParams;

  // Dove andare dopo dipende da chi guarda: dentro, al lavoro; fuori, all'accesso.
  const dentro = (await utenteCorrente()).autenticato;
  const piede = (
    <p>
      {dentro ? (
        <CollegamentoPubblico href="/prospect">Vai a Ricerca Clienti</CollegamentoPubblico>
      ) : (
        <CollegamentoPubblico href="/accedi">Accedi</CollegamentoPubblico>
      )}
    </p>
  );

  if (typeof codice !== 'string' || codice.length < 20 || codice.length > 200) {
    return (
      <CornicePubblica titolo="Collegamento incompleto" piede={piede}>
        <p className="text-sm leading-relaxed text-testo-tenue">
          Apri di nuovo il collegamento dall’email: sembra essersi interrotto a metà.
        </p>
      </CornicePubblica>
    );
  }

  return (
    <CornicePubblica
      titolo="Conferma il tuo indirizzo"
      sottotitolo="Se hai creato tu l’account su AEGIS con questo indirizzo, conferma qui. Se non sei stato tu, chiudi la pagina: senza conferma lo studio non viene attivato."
      piede={piede}
    >
      <ModuloConferma azione={confermaIndirizzo} codice={codice} />
    </CornicePubblica>
  );
}
