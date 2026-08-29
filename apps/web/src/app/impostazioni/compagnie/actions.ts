'use server';

import { revalidatePath } from 'next/cache';
import { chiamaApiConSessione } from '@/lib/chiamata-server';
import { componentiDelGiorno } from '@aegis/core/tempo';

export interface EsitoCensimento {
  readonly ok: boolean;
  readonly messaggio: string;
}

/**
 * Valore testuale di un campo.
 *
 * `FormData.get` può restituire un file: stringificarlo produrrebbe «[object Object]»
 * dentro un dato di bilancio, senza che nulla sollevi.
 */
function campoTestuale(modulo: FormData, nome: string): string {
  const valore = modulo.get(nome);
  return typeof valore === 'string' ? valore.trim() : '';
}

/** Numero facoltativo: il campo lasciato in bianco è «non dichiarato», non zero. */
function numero(modulo: FormData, campo: string): number | undefined {
  const grezzo = campoTestuale(modulo, campo).replace(',', '.');
  if (grezzo === '') return undefined;
  const valore = Number(grezzo);
  return Number.isFinite(valore) ? valore : undefined;
}

function testo(modulo: FormData, campo: string): string | undefined {
  const valore = campoTestuale(modulo, campo);
  return valore === '' ? undefined : valore;
}

/**
 * Censisce una compagnia con i dati della sua SFCR.
 *
 * Il solvency ratio si inserisce come **percentuale** — 260 — perché è così che è scritto
 * nei documenti che l'intermediario ha davanti; il dominio lavora in rapporto, e la
 * conversione avviene qui, una volta sola.
 */
export async function censisciCompagnia(
  _precedente: EsitoCensimento | null,
  modulo: FormData,
): Promise<EsitoCensimento> {
  const denominazione = campoTestuale(modulo, 'denominazione');
  if (denominazione === '') return { ok: false, messaggio: 'La denominazione è obbligatoria.' };

  const solvencyPercentuale = numero(modulo, 'solvencyRatio');

  let risposta: Response;
  try {
    risposta = await chiamaApiConSessione('/api/compagnie', {
      metodo: 'POST',
      corpo: {
        denominazione,
        gruppo: testo(modulo, 'gruppo'),
        codiceIvass: testo(modulo, 'codiceIvass'),
        anno: numero(modulo, 'anno') ?? componentiDelGiorno(new Date()).anno - 1,
        solvencyRatio: solvencyPercentuale === undefined ? undefined : solvencyPercentuale / 100,
        quotaTier1Unrestricted:
          numero(modulo, 'quotaTier1') === undefined ? undefined : numero(modulo, 'quotaTier1')! / 100,
        fondiPropriEuro: numero(modulo, 'fondiPropri'),
        scrEuro: numero(modulo, 'scr'),
        premiLordiEuro: numero(modulo, 'premiLordi'),
        reclamiAnno: numero(modulo, 'reclami'),
        ratingAgenzia: testo(modulo, 'ratingAgenzia'),
        ratingValore: testo(modulo, 'ratingValore'),
        fonte: testo(modulo, 'fonte') ?? 'SFCR',
      },
    });
  } catch {
    return { ok: false, messaggio: 'Servizio non raggiungibile.' };
  }

  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
    return { ok: false, messaggio: corpo.errore ?? 'Censimento non riuscito.' };
  }

  revalidatePath('/impostazioni/compagnie');
  return { ok: true, messaggio: `${denominazione} censita.` };
}
