'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';
import type { StatoCrm } from '@aegis/core/crm';

export interface EsitoCrm {
  ok: boolean;
  messaggio: string;
}

/**
 * Stato e nota di un'azienda del CRM, salvati separatamente.
 *
 * Fino al 19/09/2026 erano un modulo solo con il pulsante «Salva»: per cambiare uno stato dopo
 * una telefonata servivano due gesti, moltiplicati per ogni riga. Ora lo stato si salva al
 * cambio — è una scelta fra cinque, non un testo da comporre — e la nota resta con il suo
 * pulsante, perché mentre si scrive un salvataggio automatico sarebbe un salvataggio a metà.
 *
 * Entrambe passano dal server di Next: l'indirizzo dell'API e le credenziali non finiscono nel
 * bundle. L'API accetta un campo alla volta e non tocca l'altro, quindi cambiare stato non
 * cancella la nota.
 */
async function patchCrm(identificativo: string, corpo: Record<string, unknown>): Promise<EsitoCrm> {
  try {
    const risposta = await chiamaApiConSessione(`/api/crm/${encodeURIComponent(identificativo)}`, {
      metodo: 'PATCH',
      corpo,
    });

    if (!risposta.ok) {
      const dettagli = (await risposta.json().catch(() => ({}))) as { errore?: string };
      return {
        ok: false,
        messaggio:
          risposta.status === 403
            ? 'Il ruolo in sola lettura non consente modifiche.'
            : (dettagli.errore ?? `Salvataggio non riuscito (errore ${risposta.status}).`),
      };
    }

    revalidatePath('/portafoglio');
    return { ok: true, messaggio: 'Salvato.' };
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile: la modifica non è stata salvata.' };
  }
}

export async function cambiaStatoCrm(identificativo: string, stato: StatoCrm): Promise<EsitoCrm> {
  return patchCrm(identificativo, { stato });
}

/** Una nota svuotata è «nessuna nota»: l'API la salva così. */
export async function salvaNotaCrm(identificativo: string, nota: string): Promise<EsitoCrm> {
  return patchCrm(identificativo, { nota });
}
