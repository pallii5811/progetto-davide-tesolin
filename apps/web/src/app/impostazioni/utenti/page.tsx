import { richiediSessione } from '@/lib/sessione';
import { leggiUtenti } from '@/lib/api';
import { Avviso, ServizioNonRaggiungibile } from '@/components/ui';
import { GestioneUtenti } from './GestioneUtenti';

export const dynamic = 'force-dynamic';

export default async function PaginaUtenti() {
  const utente = await richiediSessione();

  // Secondo strato: l'API rifiuta comunque, ma una pagina che si apre e poi non mostra
  // nulla lascia credere a un guasto invece che a un permesso mancante.
  if (utente.ruolo !== 'amministratore') {
    return (
      <Avviso tono="informativo" titolo="Riservato agli amministratori">
        La gestione degli utenti dello studio è accessibile solo a chi ha ruolo di amministratore. Chiedi a
        un amministratore di modificare il tuo ruolo, se ti serve.
      </Avviso>
    );
  }

  const elenco = await leggiUtenti().catch(() => null);

  if (elenco === null) {
    return (
      <ServizioNonRaggiungibile titolo="Servizio non raggiungibile" cosa="l’elenco dei collaboratori" />
    );
  }

  return <GestioneUtenti utenti={elenco.utenti} />;
}
