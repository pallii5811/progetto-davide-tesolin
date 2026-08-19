'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoApertura {
  readonly ok: boolean;
  readonly messaggio: string;
  /**
   * La password iniziale, mostrata **una sola volta**.
   *
   * Non viene conservata da nessuna parte in chiaro: chi apre lo studio la legge qui e la
   * consegna al cliente. Ricaricando la pagina sparisce, ed è il comportamento voluto.
   */
  readonly passwordIniziale?: string;
  readonly email?: string;
}

function campo(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore.trim() : '';
}

export async function apriStudio(
  _precedente: EsitoApertura | null,
  modulo: FormData,
): Promise<EsitoApertura> {
  const denominazione = campo(modulo, 'denominazione');
  const nome = campo(modulo, 'nome');
  const email = campo(modulo, 'email');

  if (denominazione === '' || nome === '' || email === '') {
    return { ok: false, messaggio: 'Denominazione, referente e indirizzo sono obbligatori.' };
  }

  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/studi', {
      metodo: 'POST',
      corpo: { denominazione, nome, email },
    });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Apertura non riuscita.' };
  }

  const corpo = (await risposta.json()) as { passwordIniziale: string; email: string };
  revalidatePath('/impostazioni/studi');
  return {
    ok: true,
    messaggio: `${denominazione} aperto.`,
    passwordIniziale: corpo.passwordIniziale,
    email: corpo.email,
  };
}

/** Sospende o riattiva uno studio: i dati restano, gli accessi no. */
export async function cambiaAttivita(id: string, attivo: boolean): Promise<void> {
  await chiamaApiConSessione(`/api/studi/${id}`, { metodo: 'PATCH', corpo: { attivo } });
  revalidatePath('/impostazioni/studi');
}
