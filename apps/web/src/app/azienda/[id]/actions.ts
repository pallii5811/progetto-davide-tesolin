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

/** Il valore testuale di un campo. Un file dove serve testo diventa vuoto, non «[object Object]». */
function testo(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}

// ── Adeguata verifica della clientela ────────────────────────────────────────

/**
 * Esegue la verifica sulle persone indicate. E' un acquisto, e il costo e' gia' a schermo.
 *
 * Le persone arrivano dal modulo perche' e' la scheda a sapere chi sono: titolari
 * effettivi e rappresentanti legali sono gia' calcolati e mostrati. L'anno di nascita,
 * quando c'e', viaggia con la domanda: senza, due omonimi restano indistinguibili.
 */
export async function eseguiAdeguataVerificaAzione(
  _precedente: EsitoVerifica | null,
  modulo: FormData,
): Promise<EsitoVerifica> {
  const identificativo = testo(modulo, 'identificativo');
  const grezzo = testo(modulo, 'persone') || '[]';

  let persone: { nome: string; ruolo: string; annoNascita?: number }[];
  try {
    persone = JSON.parse(grezzo) as { nome: string; ruolo: string; annoNascita?: number }[];
  } catch {
    return { ok: false, messaggio: 'Elenco delle persone non leggibile.' };
  }
  if (persone.length === 0) {
    return { ok: false, messaggio: 'Nessuna persona da verificare.' };
  }

  const risposta = await chiamaApiConSessione(
    `/api/aziende/${encodeURIComponent(identificativo)}/adeguata-verifica`,
    { metodo: 'POST', corpo: { persone } },
  );
  const corpo = (await risposta.json().catch(() => ({}))) as {
    errore?: string;
    verificate?: number;
    costoCentesimi?: number;
  };

  if (!risposta.ok) {
    return { ok: false, messaggio: corpo.errore ?? 'Verifica non riuscita.' };
  }

  revalidatePath(`/azienda/${identificativo}`);
  const spesa = ((corpo.costoCentesimi ?? 0) / 100).toFixed(2).replace('.', ',');
  return {
    ok: true,
    messaggio: `${corpo.verificate ?? 0} ${corpo.verificate === 1 ? 'persona verificata' : 'persone verificate'}, ${spesa} \u20ac.`,
  };
}

/**
 * Registra la decisione dell'intermediario su ogni candidato.
 *
 * E' la parte che chiude l'obbligo: la ricerca la fa la macchina, la valutazione la fa una
 * persona, e in ispezione si guarda la seconda. Finisce nel registro delle operazioni, che
 * nessuno puo' riscrivere.
 */
export async function decidiVerificaAzione(
  _precedente: EsitoVerifica | null,
  modulo: FormData,
): Promise<EsitoVerifica> {
  const identificativo = testo(modulo, 'identificativo');
  const verificaId = testo(modulo, 'verificaId');
  const nota = testo(modulo, 'nota').trim();

  const decisioni: Record<string, string> = {};
  for (const [chiave, valore] of modulo.entries()) {
    if (!chiave.startsWith('decisione:')) continue;
    const scelta = typeof valore === 'string' ? valore : '';
    if (scelta === 'confermato' || scelta === 'escluso') {
      decisioni[chiave.slice('decisione:'.length)] = scelta;
    }
  }

  const risposta = await chiamaApiConSessione(
    `/api/adeguata-verifica/${encodeURIComponent(verificaId)}/decisione`,
    { metodo: 'POST', corpo: { decisioni, ...(nota === '' ? {} : { nota }) } },
  );
  const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };

  if (!risposta.ok) {
    return { ok: false, messaggio: corpo.errore ?? 'Decisione non registrata.' };
  }

  revalidatePath(`/azienda/${identificativo}`);
  const quanti = Object.keys(decisioni).length;
  return {
    ok: true,
    messaggio:
      quanti === 0
        ? 'Nessun riscontro da valutare: la verifica resta a verbale.'
        : `Decisione registrata su ${quanti} ${quanti === 1 ? 'riscontro' : 'riscontri'}.`,
  };
}

export interface EsitoVerifica {
  readonly ok: boolean;
  readonly messaggio: string;
}
