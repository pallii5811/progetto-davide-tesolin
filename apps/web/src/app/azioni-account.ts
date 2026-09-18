'use server';

import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface EsitoReinvio {
  readonly ok: boolean;
  readonly messaggio: string;
}

/** Un nuovo collegamento di conferma, per chi non ha ricevuto il primo o l'ha lasciato scadere. */
export async function reinviaConferma(_precedente: EsitoReinvio | null): Promise<EsitoReinvio> {
  try {
    const risposta = await chiamaApiConSessione('/api/auth/conferma-email/invia', { metodo: 'POST' });
    const corpo = (await risposta.json().catch(() => ({}))) as {
      errore?: string;
      giaConfermata?: boolean;
    };
    if (!risposta.ok) return { ok: false, messaggio: corpo.errore ?? 'Invio non riuscito.' };
    return corpo.giaConfermata === true
      ? { ok: true, messaggio: 'L’indirizzo risulta già confermato.' }
      : { ok: true, messaggio: 'Inviata. Controlla anche la posta indesiderata.' };
  } catch {
    return { ok: false, messaggio: 'Il servizio non risponde. Riprova fra qualche minuto.' };
  }
}
