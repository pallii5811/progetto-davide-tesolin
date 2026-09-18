'use server';

import { redirect } from 'next/navigation';
import { chiamaApiPubblica } from '@/lib/chiamata-server';

export interface EsitoNuovaPassword {
  readonly messaggio: string;
  /** `password` se va corretta la password; `codice` se è il collegamento a non valere più. */
  readonly problema: 'password' | 'codice' | 'servizio';
}

function campo(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}

/**
 * Sceglie la nuova password con il codice ricevuto per email.
 *
 * Nessuna sessione si apre qui: l'API chiude tutte quelle esistenti, e si rientra dalla
 * pagina di accesso con la password nuova. È un passaggio in più di proposito — chi ha appena
 * ripreso il controllo dell'account lo conferma usando la credenziale che ha scelto.
 */
export async function scegliNuovaPassword(
  _precedente: EsitoNuovaPassword | null,
  modulo: FormData,
): Promise<EsitoNuovaPassword> {
  const codice = campo(modulo, 'codice');
  const password = campo(modulo, 'password');
  if (password !== campo(modulo, 'ripetiPassword')) {
    return { messaggio: 'Le due password non coincidono.', problema: 'password' };
  }

  let risposta: Response;
  try {
    risposta = await chiamaApiPubblica('/api/auth/nuova-password', { codice, password });
  } catch {
    return { messaggio: 'Il servizio non risponde. Riprova fra qualche minuto.', problema: 'servizio' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string; campo?: string };
    return {
      messaggio: corpo.errore ?? 'Non è stato possibile cambiare la password.',
      problema: corpo.campo === 'password' ? 'password' : risposta.status === 429 ? 'servizio' : 'codice',
    };
  }

  redirect('/accedi?password=aggiornata');
}
