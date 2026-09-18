import { redirect } from 'next/navigation';
import { CollegamentoPubblico, CornicePubblica, ServizioAssente } from '@/components/accesso';
import { statoAccesso, utenteCorrente } from '@/lib/api';
import { ModuloRegistrazione } from './ModuloRegistrazione';
import { registrati } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Crea il tuo account · AEGIS' };

/**
 * La registrazione di uno studio (richiesta di Simone del 18/09/2026).
 *
 * Chi è già dentro va a Ricerca Clienti: un secondo account dallo stesso browser è quasi
 * sempre un errore. Dove la registrazione non funziona — dimostrazione senza archivio —
 * lo si dice, invece di far compilare un modulo destinato a fallire.
 */
export default async function PaginaRegistrazione() {
  const stato = await statoAccesso();
  if (!stato.raggiungibile) return <ServizioAssente />;
  if (!stato.autenticazioneRichiesta) redirect('/prospect');
  if ((await utenteCorrente()).autenticato) redirect('/prospect');

  const piede = (
    <p>
      Hai già un account? <CollegamentoPubblico href="/accedi">Accedi</CollegamentoPubblico>
    </p>
  );

  if (!stato.registrazioneAperta) {
    return (
      <CornicePubblica titolo="Registrazione non disponibile" piede={piede}>
        <p className="text-sm leading-relaxed text-testo-tenue">
          Su questa installazione gli account li apre l’amministratore della piattaforma.
        </p>
      </CornicePubblica>
    );
  }

  return (
    <CornicePubblica
      titolo="Crea il tuo account"
      sottotitolo="Per intermediari assicurativi iscritti al RUI."
      piede={piede}
      larga
    >
      <ModuloRegistrazione azione={registrati} />
    </CornicePubblica>
  );
}
