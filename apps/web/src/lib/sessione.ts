import { redirect } from 'next/navigation';
import { autenticazioneRichiesta, utenteCorrente } from './api';
import type { UtenteCorrente } from './api';

/**
 * Guardia delle pagine protette.
 *
 * Verificata sul **server**, prima che la pagina venga costruita: un controllo lato client
 * nasconderebbe l'interfaccia senza impedire l'accesso ai dati, e i dati sono la cosa da
 * proteggere. L'API resta comunque protetta per conto suo — questo è il secondo strato,
 * non l'unico.
 *
 * Quando il servizio gira senza persistenza (dimostrazione locale) l'autenticazione non è
 * attiva e la guardia lascia passare: è l'unico modo di far vedere la piattaforma senza
 * prima configurare un database.
 */
export async function richiediSessione(): Promise<UtenteCorrente> {
  const richiesta = await autenticazioneRichiesta();
  if (!richiesta) return { autenticato: true, nome: 'Modalità dimostrativa' };

  const utente = await utenteCorrente();
  if (!utente.autenticato) redirect('/accedi');
  return utente;
}
