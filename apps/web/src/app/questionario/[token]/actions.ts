'use server';

import { revalidatePath } from 'next/cache';
import { chiamaQuestionarioPubblico } from '@/lib/chiamata-server';

/**
 * Salvataggio del questionario da parte del **cliente**, senza sessione.
 *
 * È l'unica azione del prodotto che non porta con sé un cookie di autenticazione, e non
 * deve portarlo: chi compila non ha un accesso alla piattaforma. L'autorizzazione è il
 * token nell'indirizzo, e la verifica sta nell'API — che dal token ricava l'azienda e
 * l'intermediario.
 *
 * Per questo non passa da `chiamaApiConSessione` ma da `chiamaQuestionarioPubblico`, che
 * vive nello stesso modulo: la regola del progetto è che l'indirizzo dell'API si
 * costruisca in due soli punti, e vale anche per l'eccezione — una `fetch` sparsa nel
 * frontend prima o poi dimentica il cookie, ed è già successo.
 */

export interface EsitoQuestionario {
  readonly ok: boolean;
  readonly messaggio: string;
  readonly completezza?: { percentuale: number; livello: string };
}

export async function salvaQuestionarioCliente(
  token: string,
  payload: { datiDichiarati?: unknown; polizze?: unknown },
): Promise<EsitoQuestionario> {
  try {
    const risposta = await chiamaQuestionarioPubblico(token, { metodo: 'PUT', corpo: payload });

    const corpo = (await risposta.json().catch(() => ({}))) as {
      errore?: string;
      dettagli?: { path: (string | number)[]; message: string }[];
      completezza?: { percentuale: number; livello: string };
    };

    if (!risposta.ok) {
      if (risposta.status === 404) {
        return {
          ok: false,
          messaggio:
            'Questo collegamento non è più valido. Chiedere al proprio intermediario di inviarne uno nuovo.',
        };
      }
      const dettaglio =
        corpo.dettagli === undefined
          ? (corpo.errore ?? `Errore ${risposta.status}`)
          : corpo.dettagli.map((d) => `${d.path.join('.')}: ${d.message}`).join(' · ');
      return { ok: false, messaggio: dettaglio };
    }

    revalidatePath(`/questionario/${token}`);
    return {
      ok: true,
      messaggio: 'Risposte inviate al suo intermediario. Grazie.',
      ...(corpo.completezza === undefined ? {} : { completezza: corpo.completezza }),
    };
  } catch (errore) {
    return {
      ok: false,
      messaggio: errore instanceof Error ? errore.message : 'Impossibile inviare le risposte',
    };
  }
}
