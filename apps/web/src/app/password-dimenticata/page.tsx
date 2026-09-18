import { redirect } from 'next/navigation';
import { CollegamentoPubblico, CornicePubblica, ServizioAssente } from '@/components/accesso';
import { statoAccesso, utenteCorrente } from '@/lib/api';
import { ModuloPasswordDimenticata } from './ModuloPasswordDimenticata';
import { chiediNuovaPassword } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Password dimenticata · AEGIS' };

export default async function PaginaPasswordDimenticata() {
  const stato = await statoAccesso();
  if (!stato.raggiungibile) return <ServizioAssente />;
  if (!stato.autenticazioneRichiesta) redirect('/prospect');
  if ((await utenteCorrente()).autenticato) redirect('/impostazioni');

  const piede = (
    <p>
      Ti è tornata in mente? <CollegamentoPubblico href="/accedi">Accedi</CollegamentoPubblico>
    </p>
  );

  // Senza posta non si finge di spedire: si dice a chi rivolgersi.
  if (!stato.postaAttiva) {
    return (
      <CornicePubblica titolo="Password dimenticata" piede={piede}>
        <p className="text-sm leading-relaxed text-testo-tenue">
          Chiedi all’amministratore del tuo studio: da Impostazioni › Utenti può reimpostarla e darti la
          nuova. Il recupero via email non è ancora attivo su questa installazione.
        </p>
      </CornicePubblica>
    );
  }

  return (
    <CornicePubblica
      titolo="Password dimenticata"
      sottotitolo="Scrivi l’indirizzo con cui accedi: ti mandiamo un collegamento per sceglierne una nuova. Vale 60 minuti."
      piede={piede}
    >
      <ModuloPasswordDimenticata azione={chiediNuovaPassword} />
    </CornicePubblica>
  );
}
