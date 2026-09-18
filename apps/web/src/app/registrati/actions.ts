'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { chiamaApiPubblica } from '@/lib/chiamata-server';
import { estraiTokenSessione, NOME_COOKIE_SESSIONE } from '@/lib/cookie-sessione';

/** I campi del modulo, nell'ordine in cui compaiono. La password non torna mai indietro. */
export type CampoRegistrazione = 'nome' | 'email' | 'password' | 'denominazione' | 'numeroRui';

export interface EsitoRegistrazione {
  readonly ok: false;
  readonly messaggio: string;
  /** Il campo da correggere, se l'errore ne riguarda uno: il messaggio va sotto di lui. */
  readonly campo: CampoRegistrazione | null;
  /** Quello che era stato scritto, per non farlo riscrivere. Mai la password. */
  readonly valori: Partial<Record<Exclude<CampoRegistrazione, 'password'>, string>>;
}

const CAMPI: readonly CampoRegistrazione[] = ['nome', 'email', 'password', 'denominazione', 'numeroRui'];

function campo(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}

/**
 * Registrazione di uno studio (decisioni di Simone del 18/09/2026).
 *
 * Stesso percorso dell'accesso: la chiamata parte dal server di Next, e il cookie che l'API
 * rilascia passa al browser da qui, `httpOnly`. Chi si registra è già dentro alla fine: niente
 * secondo modulo da compilare con la password appena scelta.
 */
export async function registrati(
  _precedente: EsitoRegistrazione | null,
  modulo: FormData,
): Promise<EsitoRegistrazione> {
  const dati = {
    nome: campo(modulo, 'nome').trim(),
    email: campo(modulo, 'email').trim(),
    password: campo(modulo, 'password'),
    denominazione: campo(modulo, 'denominazione').trim(),
    numeroRui: campo(modulo, 'numeroRui').trim(),
  };
  const valori = {
    nome: dati.nome,
    email: dati.email,
    denominazione: dati.denominazione,
    numeroRui: dati.numeroRui,
  };

  const ripeti = campo(modulo, 'ripetiPassword');
  if (ripeti !== dati.password) {
    return { ok: false, messaggio: 'Le due password non coincidono.', campo: 'password', valori };
  }

  let risposta: Response;
  try {
    risposta = await chiamaApiPubblica('/api/auth/registrazione', dati);
  } catch {
    return {
      ok: false,
      messaggio: 'Il servizio non risponde. Riprova fra qualche minuto.',
      campo: null,
      valori,
    };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string; campo?: string | null };
    const campoErrato = CAMPI.find((c) => c === corpo.campo) ?? null;
    return {
      ok: false,
      messaggio: corpo.errore ?? 'Registrazione non riuscita.',
      campo: campoErrato,
      valori,
    };
  }

  const token = estraiTokenSessione(risposta.headers.getSetCookie());
  if (token !== null) {
    const raccolta = await cookies();
    raccolta.set(NOME_COOKIE_SESSIONE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60,
    });
    redirect('/prospect?benvenuto=1');
  }

  // Lo studio c'è, ma la sessione non è arrivata: si entra dalla pagina di accesso.
  redirect('/accedi?registrato=1');
}
