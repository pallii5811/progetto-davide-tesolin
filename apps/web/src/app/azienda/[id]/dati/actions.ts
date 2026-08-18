'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoSalvataggio {
  ok: boolean;
  messaggio: string;
  completezza?: { percentuale: number; livello: string };
}

/**
 * Salvataggio dei dati di intervista tramite Server Action.
 *
 * Passa dal server di Next e non dal browser: l'indirizzo dell'API e le sue credenziali
 * non finiscono mai nel bundle, e non serve esporre CORS al mondo. In cambio si perde la
 * possibilità di salvare offline — accettabile per uno strumento che vive in ufficio.
 */
export async function salvaDossier(
  identificativo: string,
  payload: { datiDichiarati?: unknown; polizze?: unknown },
): Promise<EsitoSalvataggio> {
  try {
    const risposta = await chiamaApiConSessione(
      `/api/aziende/${encodeURIComponent(identificativo)}/dossier`,
      { metodo: 'PUT', corpo: payload },
    );

    const corpo = (await risposta.json()) as {
      errore?: string;
      dettagli?: { path: (string | number)[]; message: string }[];
      completezza?: { percentuale: number; livello: string };
    };

    if (!risposta.ok) {
      // Gli errori di validazione arrivano dal confine API: si mostrano campo per campo,
      // non come «errore generico», altrimenti l'utente non sa cosa correggere.
      const dettaglio =
        corpo.dettagli === undefined
          ? (corpo.errore ?? `Errore ${risposta.status}`)
          : corpo.dettagli.map((d) => `${d.path.join('.')}: ${d.message}`).join(' · ');
      return { ok: false, messaggio: dettaglio };
    }

    revalidatePath(`/azienda/${identificativo}`);
    revalidatePath(`/azienda/${identificativo}/dati`);

    return {
      ok: true,
      messaggio: 'Dati salvati. L’analisi è stata aggiornata.',
      ...(corpo.completezza === undefined ? {} : { completezza: corpo.completezza }),
    };
  } catch (errore) {
    return {
      ok: false,
      messaggio: errore instanceof Error ? errore.message : 'Impossibile contattare il servizio di analisi',
    };
  }
}
