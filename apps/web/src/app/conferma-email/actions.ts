'use server';

import { chiamaApiPubblica } from '@/lib/chiamata-server';

export interface EsitoConferma {
  readonly ok: boolean;
  readonly messaggio: string;
}

/**
 * Conferma l'indirizzo con il codice ricevuto — solo quando la persona preme il pulsante.
 *
 * Fino alla revisione di sicurezza del 18/09/2026 la conferma partiva all'apertura della
 * pagina. I filtri antivirus delle caselle aziendali aprono i collegamenti prima della persona:
 * chi registrava l'indirizzo di un altro se lo trovava «confermato» senza che il titolare
 * avesse fatto nulla. Un filtro scarica la pagina; non preme i pulsanti.
 */
export async function confermaIndirizzo(
  _precedente: EsitoConferma | null,
  modulo: FormData,
): Promise<EsitoConferma> {
  const valore = modulo.get('codice');
  const codice = typeof valore === 'string' ? valore : '';
  if (codice.length < 20 || codice.length > 200) {
    return { ok: false, messaggio: 'Il collegamento è incompleto: aprilo di nuovo dall’email.' };
  }
  try {
    const risposta = await chiamaApiPubblica('/api/auth/conferma-email', { codice });
    if (risposta.ok) {
      return {
        ok: true,
        messaggio:
          'Indirizzo confermato: da ora è quello del tuo account, e da qui passano i collegamenti per la password.',
      };
    }
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Conferma non riuscita.' };
  } catch {
    return { ok: false, messaggio: 'Il servizio non risponde. Riprova fra qualche minuto.' };
  }
}
