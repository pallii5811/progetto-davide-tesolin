'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';
import { nullaEPartito } from '@/lib/errore-rete';

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
  } catch (errore) {
    /*
      Qui c'era «Servizio non raggiungibile», su ogni eccezione.

      Questa azione **spende**: fino a duecentocinquanta anagrafiche a dieci centesimi
      l'una. Una connessione che cade a metà — il servizio riavviato mentre gira, un
      proxy che chiude la presa — arriva a questo `catch` dopo che la richiesta è stata
      inviata e le aziende sono state acquisite e pagate. Dichiarare che non è successo
      niente porta a rilanciare l'importazione, e a pagarla due volte.

      Solo un rifiuto di connessione prova che nulla è partito. Negli altri casi si dice
      ciò che si sa, che è poco: controllare prima di ripetere. È la stessa risposta che
      questa azione dà già quando la risposta arriva troncata, qualche riga più sotto.
    */
    if (nullaEPartito(errore)) {
      return { ok: false, messaggio: 'Servizio non raggiungibile: nessuna azienda è stata acquisita.' };
    }
    return {
      ok: false,
      messaggio:
        'Collegamento interrotto durante l’importazione. Non è possibile stabilire quante aziende siano state acquisite: controllare il portafoglio prima di ripetere l’operazione, per non pagarle due volte.',
    };
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
