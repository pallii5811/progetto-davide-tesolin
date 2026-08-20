'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoImmagine {
  readonly ok: boolean;
  readonly messaggio: string;
}

/**
 * Caricamento di una fotografia di ubicazione.
 *
 * Passa dal server di Next come tutte le altre scritture: l'indirizzo dell'API e il
 * cookie di sessione non finiscono nel bundle, e non serve aprire CORS.
 *
 * Il file arriva già convertito in data URI dal browser, dove il file c'è. La
 * validazione vera — formato, peso, quante ce ne sono già — sta **nell'API**: questo è
 * un passaggio di consegne, non un controllo.
 */
export async function caricaImmagineAzione(
  identificativo: string,
  immagine: {
    readonly ubicazioneId: string;
    readonly didascalia: string | null;
    readonly tipoMime: string;
    readonly dati: string;
  },
): Promise<EsitoImmagine> {
  try {
    const risposta = await chiamaApiConSessione(
      `/api/aziende/${encodeURIComponent(identificativo)}/immagini`,
      { metodo: 'POST', corpo: immagine },
    );

    if (!risposta.ok) {
      const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
      return { ok: false, messaggio: corpo.errore ?? `Errore ${risposta.status}` };
    }

    revalidatePath(`/azienda/${identificativo}`);
    revalidatePath(`/azienda/${identificativo}/report`);
    return { ok: true, messaggio: 'Immagine allegata.' };
  } catch (errore) {
    return {
      ok: false,
      messaggio: errore instanceof Error ? errore.message : 'Impossibile contattare il servizio',
    };
  }
}

export async function rimuoviImmagineAzione(
  identificativo: string,
  immagineId: string,
): Promise<EsitoImmagine> {
  try {
    const risposta = await chiamaApiConSessione(
      `/api/aziende/${encodeURIComponent(identificativo)}/immagini/${encodeURIComponent(immagineId)}`,
      { metodo: 'DELETE' },
    );

    if (!risposta.ok) {
      const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
      return { ok: false, messaggio: corpo.errore ?? `Errore ${risposta.status}` };
    }

    revalidatePath(`/azienda/${identificativo}`);
    revalidatePath(`/azienda/${identificativo}/report`);
    return { ok: true, messaggio: 'Immagine rimossa.' };
  } catch (errore) {
    return {
      ok: false,
      messaggio: errore instanceof Error ? errore.message : 'Impossibile contattare il servizio',
    };
  }
}
