'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoCrm {
  ok: boolean;
  messaggio: string;
}

/**
 * Salva lo stato e la nota di un'azienda del CRM.
 *
 * Passa dal server di Next come ogni altra modifica: l'indirizzo dell'API e le credenziali non
 * finiscono nel bundle. Stato e nota viaggiano insieme perché stanno nello stesso modulo, e
 * una nota lasciata vuota è «nessuna nota»: l'API la salva così.
 */
export async function salvaCrm(
  identificativo: string,
  _precedente: EsitoCrm | null,
  dati: FormData,
): Promise<EsitoCrm> {
  const stato = dati.get('stato');
  const nota = dati.get('nota');

  try {
    const risposta = await chiamaApiConSessione(`/api/crm/${encodeURIComponent(identificativo)}`, {
      metodo: 'PATCH',
      corpo: {
        stato: typeof stato === 'string' ? stato : undefined,
        nota: typeof nota === 'string' ? nota : null,
      },
    });

    if (!risposta.ok) {
      const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
      return {
        ok: false,
        messaggio:
          risposta.status === 403
            ? 'Il ruolo in sola lettura non consente modifiche.'
            : (corpo.errore ?? `Salvataggio non riuscito (errore ${risposta.status}).`),
      };
    }

    revalidatePath('/portafoglio');
    return { ok: true, messaggio: 'Salvato.' };
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile: la modifica non è stata salvata.' };
  }
}
