'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';

export interface RigaScartataDto {
  riga: number;
  contenuto: string;
  motivo: string;
}

export interface AnteprimaDto {
  righeLette: number;
  duplicati: number;
  separatore: string;
  giaPresenti: { partitaIva: string; denominazione: string | null }[];
  daAcquisire: { riga: number; partitaIva: string; denominazione: string | null }[];
  totaleDaAcquisire: number;
  scartate: RigaScartataDto[];
  totaleScartate: number;
  costoStimatoCentesimi: number;
  costoUnitarioCentesimi: number;
  massimoPerImportazione: number;
  oltreIlMassimo: boolean;
}

export interface EsitoAnteprima {
  readonly ok: boolean;
  readonly messaggio: string;
  readonly anteprima?: AnteprimaDto;
  /** Rimandato indietro per essere importato senza doverlo incollare di nuovo. */
  readonly contenuto?: string;
}

export interface EsitoImportazione {
  readonly ok: boolean;
  readonly messaggio: string;
}

/**
 * Anteprima: cosa succederebbe e quanto costerebbe.
 *
 * Passaggio separato per una ragione sola: un'importazione che parte da sola su
 * quattrocento aziende brucia quaranta euro prima che chiunque possa fermarla.
 */
export async function anteprimaImportazione(
  _precedente: EsitoAnteprima | null,
  modulo: FormData,
): Promise<EsitoAnteprima> {
  const contenuto = campoTestuale(modulo, 'contenuto').trim();
  if (contenuto === '') {
    return { ok: false, messaggio: 'Incollare l’elenco o caricare un file.' };
  }

  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/portafoglio/importa/anteprima', {
      metodo: 'POST',
      corpo: { contenuto },
    });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Lettura non riuscita.' };
  }

  /*
    Una risposta 200 con corpo troncato esiste: sotto carico, o su una connessione che
    cade a metà, `json()` solleva «Unexpected end of JSON input» — un errore di analisi
    sintattica che arriva all'utente come una schermata rotta, mentre il fatto è
    semplicemente che la risposta non è arrivata intera. Va detto in italiano.
  */
  const anteprima = await leggiJson<AnteprimaDto>(risposta);
  if (anteprima === null) {
    return { ok: false, messaggio: 'Risposta incompleta dal servizio: riprovare.' };
  }

  return { ok: true, messaggio: '', anteprima, contenuto };
}

export async function eseguiImportazione(
  _precedente: EsitoImportazione | null,
  modulo: FormData,
): Promise<EsitoImportazione> {
  const contenuto = campoTestuale(modulo, 'contenuto');
  if (contenuto === '') return { ok: false, messaggio: 'Nulla da importare.' };

  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/portafoglio/importa', {
      metodo: 'POST',
      corpo: { contenuto },
    });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Importazione non riuscita.' };
  }

  const esito = await leggiJson<{
    acquisite: number;
    fallite: { partitaIva: string; motivo: string }[];
    costoEffettivoCentesimi: number;
    giaPresenti: number;
  }>(risposta);

  if (esito === null) {
    // Qui l'ambiguità è seria: l'importazione può essere andata a buon fine sul
    // servizio e aver perso solo la risposta. Si dice all'utente di controllare invece
    // di dichiarare un fallimento che potrebbe non esserci stato.
    return {
      ok: false,
      messaggio:
        'Risposta incompleta dal servizio. Controllare il portafoglio prima di ripetere l’importazione: le aziende potrebbero essere già state acquisite.',
    };
  }

  revalidatePath('/portafoglio');

  const parti = [
    `${esito.acquisite} ${esito.acquisite === 1 ? 'azienda presa in carico' : 'aziende prese in carico'}`,
  ];
  if (esito.giaPresenti > 0) parti.push(`${esito.giaPresenti} già in portafoglio`);
  if (esito.fallite.length > 0) {
    // Le mancate acquisizioni si nominano una per una: «alcune non sono riuscite» non
    // permette a nessuno di rimediare.
    parti.push(`non riuscite: ${esito.fallite.map((f) => `${f.partitaIva} (${f.motivo})`).join(', ')}`);
  }
  parti.push(`costo effettivo ${formattaEuro(esito.costoEffettivoCentesimi)}`);

  return { ok: true, messaggio: `${parti.join(' · ')}.` };
}

function campoTestuale(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore : '';
}

function formattaEuro(centesimi: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(centesimi / 100);
}

/**
 * Legge il corpo JSON di una risposta riuscita, tollerando che non arrivi intero.
 *
 * Restituisce `null` invece di sollevare: il chiamante sa cosa stava facendo e può
 * scrivere un messaggio che significhi qualcosa per chi lo legge.
 */
async function leggiJson<T>(risposta: Response): Promise<T | null> {
  try {
    return (await risposta.json()) as T;
  } catch {
    return null;
  }
}
