'use server';

import { chiamaApiPubblica } from '@/lib/chiamata-server';

export interface EsitoRichiesta {
  /** `inviata`: la risposta sempre uguale, esista o no l'indirizzo. `errore`: il servizio ha rifiutato. */
  readonly stato: 'inviata' | 'errore';
  readonly messaggio: string;
  readonly email: string;
}

/**
 * Chiede il collegamento per una nuova password.
 *
 * L'API risponde allo stesso modo per un indirizzo registrato e per uno sconosciuto, e questa
 * azione non aggiunge niente di suo: dire «indirizzo non trovato» qui rimetterebbe in piazza
 * ciò che l'API ha avuto cura di non dire.
 */
export async function chiediNuovaPassword(
  _precedente: EsitoRichiesta | null,
  modulo: FormData,
): Promise<EsitoRichiesta> {
  const valore = modulo.get('email');
  const email = typeof valore === 'string' ? valore.trim() : '';
  if (email === '') return { stato: 'errore', messaggio: 'Indicare l’indirizzo email.', email };

  try {
    const risposta = await chiamaApiPubblica('/api/auth/password-dimenticata', { email });
    const corpo = (await risposta.json().catch(() => ({}))) as { messaggio?: string; errore?: string };
    if (!risposta.ok) {
      return { stato: 'errore', messaggio: corpo.errore ?? 'Richiesta non riuscita.', email };
    }
    return {
      stato: 'inviata',
      messaggio:
        corpo.messaggio ??
        'Se l’indirizzo è registrato, riceverai un’email con il collegamento per scegliere una nuova password.',
      email,
    };
  } catch {
    return { stato: 'errore', messaggio: 'Il servizio non risponde. Riprova fra qualche minuto.', email };
  }
}
