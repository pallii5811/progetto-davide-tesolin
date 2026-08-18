'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { chiamaApiConSessione } from '@/lib/chiamata-server';
import { estraiTokenSessione, NOME_COOKIE_SESSIONE } from '@/lib/cookie-sessione';

export interface EsitoAccesso {
  readonly ok: boolean;
  readonly messaggio: string;
  /**
   * L'indirizzo digitato, restituito per ricompilare il campo dopo un tentativo fallito.
   * Non è un dato riservato — la password non torna mai indietro — ed evita di far
   * riscrivere l'indirizzo a chi ha soltanto sbagliato la password.
   */
  readonly email?: string;
}

/**
 * Accesso.
 *
 * La chiamata all'API parte dal server di Next; il cookie che l'API rilascia viene
 * trasferito al browser da qui. Le credenziali non transitano mai per codice di pagina,
 * e il token di sessione resta `httpOnly`: nessuno script può leggerlo.
 */
export async function accedi(_precedente: EsitoAccesso | null, modulo: FormData): Promise<EsitoAccesso> {
  // `FormData.get` può restituire un file: si accettano solo campi testuali.
  const email = campoTestuale(modulo, 'email').trim();
  const password = campoTestuale(modulo, 'password');
  const ritorno = campoTestuale(modulo, 'ritorno');

  if (email === '' || password === '') {
    return { ok: false, messaggio: 'Indicare indirizzo e password.', email };
  }

  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/auth/login', {
      metodo: 'POST',
      corpo: { email, password },
    });
  } catch {
    return {
      ok: false,
      messaggio: 'Servizio non raggiungibile. Verificare che l’API sia avviata.',
      email,
    };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Accesso non riuscito.', email };
  }

  const token = estraiTokenSessione(risposta.headers.getSetCookie());
  if (token === null) {
    return { ok: false, messaggio: 'Il servizio non ha rilasciato una sessione valida.', email };
  }

  const raccolta = await cookies();
  raccolta.set(NOME_COOKIE_SESSIONE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60,
  });

  // Solo percorsi interni: un `ritorno` verso un altro dominio trasformerebbe la pagina
  // di accesso in un trampolino per rinvii verso siti di terzi.
  redirect(ritorno.startsWith('/') && !ritorno.startsWith('//') ? ritorno : '/');
}

export async function esci(): Promise<void> {
  const raccolta = await cookies();
  const sessione = raccolta.get(NOME_COOKIE_SESSIONE);

  if (sessione !== undefined) {
    // Si avvisa l'API perché revochi la sessione: cancellare solo il cookie la
    // lascerebbe valida, e chi ne avesse una copia continuerebbe a usarla.
    await chiamaApiConSessione('/api/auth/logout', { metodo: 'POST' }).catch(() => undefined);
  }

  raccolta.delete(NOME_COOKIE_SESSIONE);
  redirect('/accedi');
}

function campoTestuale(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}
