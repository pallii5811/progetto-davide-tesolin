'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoMonitoraggio {
  readonly ok: boolean;
  readonly messaggio: string;
}

/**
 * Riesecuzione del monitoraggio.
 *
 * Non interroga il provider e non costa nulla: lavora sulle fotografie già salvate.
 * Va comunque rieseguito ogni giorno, perché scadenze e obblighi di legge dipendono dalla
 * data odierna — una polizza che scade fra cinquantanove giorni non è un fatto nuovo, è
 * un fatto che oggi è diventato urgente.
 */
export async function aggiornaMonitoraggio(): Promise<EsitoMonitoraggio> {
  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/monitoraggio/esegui', { metodo: 'POST', corpo: {} });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Aggiornamento non riuscito.' };
  }

  const esito = (await risposta.json()) as {
    aziendeEsaminate: number;
    eventiNuovi: number;
  };

  revalidatePath('/monitoraggio');

  return {
    ok: true,
    messaggio:
      esito.eventiNuovi === 0
        ? `${esito.aziendeEsaminate} aziende esaminate: nessuna novità.`
        : `${esito.aziendeEsaminate} aziende esaminate, ${esito.eventiNuovi} ${esito.eventiNuovi === 1 ? 'nuovo evento' : 'nuovi eventi'}.`,
  };
}

export async function segnaGestito(modulo: FormData): Promise<void> {
  const id = modulo.get('id');
  if (typeof id !== 'string' || id === '') return;

  await chiamaApiConSessione(`/api/monitoraggio/${encodeURIComponent(id)}/gestito`, {
    metodo: 'POST',
    corpo: {},
  }).catch(() => undefined);

  revalidatePath('/monitoraggio');
}
