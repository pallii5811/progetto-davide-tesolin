'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';
import { estraiTokenSessione, NOME_COOKIE_SESSIONE } from '@/lib/cookie-sessione';

export interface Esito {
  readonly ok: boolean;
  readonly messaggio: string;
  /**
   * Presente una sola volta, subito dopo la creazione di un utente. Non viene salvata
   * da nessuna parte: se l'amministratore non la annota, va rigenerata.
   */
  readonly passwordIniziale?: string;
}

/**
 * Chiamata all'API dal server di Next, con la sessione dell'utente collegato.
 *
 * Restituisce anche la risposta grezza perché il cambio password rilascia un cookie
 * nuovo che va trasferito al browser: perderlo significherebbe buttare fuori l'utente
 * un istante dopo avergli fatto cambiare la password.
 */
async function chiamaApi(
  percorso: string,
  init: { metodo: 'POST' | 'PUT' | 'PATCH'; corpo?: unknown },
): Promise<{ risposta: Response; corpo: { errore?: string; passwordIniziale?: string } }> {
  const risposta = await chiamaApiConSessione(percorso, {
    metodo: init.metodo,
    corpo: init.corpo ?? {},
  });

  const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string; passwordIniziale?: string };
  return { risposta, corpo };
}

function campoTestuale(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}

// ── Utenti ───────────────────────────────────────────────────────────────────

export async function creaUtenteAzione(_precedente: Esito | null, modulo: FormData): Promise<Esito> {
  const email = campoTestuale(modulo, 'email').trim().toLowerCase();
  const nome = campoTestuale(modulo, 'nome').trim();
  const ruolo = campoTestuale(modulo, 'ruolo');

  if (email === '' || nome === '') {
    return { ok: false, messaggio: 'Indicare nome e indirizzo di posta.' };
  }

  let esito: Awaited<ReturnType<typeof chiamaApi>>;
  try {
    esito = await chiamaApi('/api/utenti', { metodo: 'POST', corpo: { email, nome, ruolo } });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!esito.risposta.ok) {
    return { ok: false, messaggio: esito.corpo.errore ?? 'Creazione non riuscita.' };
  }

  revalidatePath('/impostazioni/utenti');
  return {
    ok: true,
    messaggio: `${nome} può ora accedere con ${email}.`,
    ...(esito.corpo.passwordIniziale === undefined
      ? {}
      : { passwordIniziale: esito.corpo.passwordIniziale }),
  };
}

/**
 * Tutte le operazioni su un utente passano da qui, distinte dal campo `operazione`.
 *
 * Un'unica azione per riga, e quindi un unico stato di esito: con due azioni separate il
 * messaggio della prima resterebbe a schermo dopo la seconda, e l'utente leggerebbe la
 * conferma di un'operazione mentre ne guarda un'altra.
 */
export async function gestisciUtenteAzione(_precedente: Esito | null, modulo: FormData): Promise<Esito> {
  const id = campoTestuale(modulo, 'id');
  const operazione = campoTestuale(modulo, 'operazione');

  if (id === '') return { ok: false, messaggio: 'Utente non indicato.' };

  if (operazione === 'revoca') {
    return eseguí(`/api/utenti/${encodeURIComponent(id)}/revoca-sessioni`, 'POST', undefined, {
      riuscito: 'Sessioni chiuse: dovrà accedere di nuovo.',
      fallito: 'Revoca non riuscita.',
    });
  }

  const ruolo = campoTestuale(modulo, 'ruolo');
  const attivo = campoTestuale(modulo, 'attivo');

  const modifiche: Record<string, unknown> = {};
  if (ruolo !== '') modifiche['ruolo'] = ruolo;
  if (attivo !== '') modifiche['attivo'] = attivo === 'true';

  if (Object.keys(modifiche).length === 0) {
    return { ok: false, messaggio: 'Nessuna modifica da applicare.' };
  }

  return eseguí(`/api/utenti/${encodeURIComponent(id)}`, 'PATCH', modifiche, {
    riuscito:
      attivo === 'false'
        ? 'Utente sospeso: le sue sessioni sono state chiuse subito.'
        : attivo === 'true'
          ? 'Utente riattivato.'
          : 'Ruolo aggiornato.',
    fallito: 'Modifica non riuscita.',
  });
}

async function eseguí(
  percorso: string,
  metodo: 'POST' | 'PATCH',
  corpo: unknown,
  messaggi: { riuscito: string; fallito: string },
): Promise<Esito> {
  let esito: Awaited<ReturnType<typeof chiamaApi>>;
  try {
    esito = await chiamaApi(percorso, corpo === undefined ? { metodo } : { metodo, corpo });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!esito.risposta.ok) {
    return { ok: false, messaggio: esito.corpo.errore ?? messaggi.fallito };
  }

  revalidatePath('/impostazioni/utenti');
  return { ok: true, messaggio: messaggi.riuscito };
}

// ── Password personale ───────────────────────────────────────────────────────

export async function cambiaPasswordAzione(_precedente: Esito | null, modulo: FormData): Promise<Esito> {
  const corrente = campoTestuale(modulo, 'corrente');
  const nuova = campoTestuale(modulo, 'nuova');
  const conferma = campoTestuale(modulo, 'conferma');

  if (corrente === '' || nuova === '') {
    return { ok: false, messaggio: 'Compilare tutti i campi.' };
  }
  // Verificata qui prima di partire: un errore di battitura non merita un giro sull'API,
  // e soprattutto non deve poter cambiare la password in qualcosa che non si ricorda.
  if (nuova !== conferma) {
    return { ok: false, messaggio: 'La nuova password e la conferma non coincidono.' };
  }

  let esito: Awaited<ReturnType<typeof chiamaApi>>;
  try {
    esito = await chiamaApi('/api/auth/password', { metodo: 'POST', corpo: { corrente, nuova } });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!esito.risposta.ok) {
    return { ok: false, messaggio: esito.corpo.errore ?? 'Cambio non riuscito.' };
  }

  // L'API ha revocato tutte le sessioni e ne ha aperta una nuova: senza trasferire il
  // cookie, chi ha appena cambiato password si ritroverebbe scollegato.
  const token = estraiTokenSessione(esito.risposta.headers.getSetCookie());
  if (token !== null) {
    const raccolta = await cookies();
    raccolta.set(NOME_COOKIE_SESSIONE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60,
    });
  }

  return {
    ok: true,
    messaggio: 'Password aggiornata. Gli altri dispositivi collegati sono stati scollegati.',
  };
}

// ── Anagrafica dello studio ──────────────────────────────────────────────────

/**
 * I dati che intestano i documenti consegnati al contraente.
 *
 * I campi vuoti vengono inviati come stringa vuota e non omessi: è così che si **cancella**
 * un recapito sbagliato. Ometterli significherebbe «non toccare», e un numero RUI errato
 * resterebbe sui report per sempre.
 */
export async function salvaStudioAzione(_precedente: Esito | null, modulo: FormData): Promise<Esito> {
  const denominazione = campoTestuale(modulo, 'denominazione').trim();
  if (denominazione.length < 2) {
    return { ok: false, messaggio: 'Indicare la denominazione dello studio.' };
  }

  const corpo = {
    denominazione,
    numeroRui: campoTestuale(modulo, 'numeroRui').trim(),
    partitaIva: campoTestuale(modulo, 'partitaIva').trim(),
    indirizzo: campoTestuale(modulo, 'indirizzo').trim(),
    email: campoTestuale(modulo, 'email').trim(),
    telefono: campoTestuale(modulo, 'telefono').trim(),
  };

  let esito: Awaited<ReturnType<typeof chiamaApi>>;
  try {
    esito = await chiamaApi('/api/studio', { metodo: 'PUT', corpo });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!esito.risposta.ok) {
    return { ok: false, messaggio: esito.corpo.errore ?? 'Salvataggio non riuscito.' };
  }

  // Il report è la ragione per cui questi dati esistono: va ricalcolato subito.
  revalidatePath('/impostazioni/studio');
  return { ok: true, messaggio: 'Anagrafica aggiornata: comparirà in testa ai report.' };
}
