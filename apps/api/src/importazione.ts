/**
 * Presa in carico massiva di un portafoglio.
 *
 * Due passaggi distinti, e la distinzione non è formale: **prima si dice quanto costa,
 * poi si spende**. Un'importazione che parte da sola su quattrocento aziende brucia
 * quaranta euro di credito prima che chiunque possa fermarla, e l'intermediario scopre la
 * cifra a cose fatte.
 */

import { leggiPortafoglioCsv } from '@aegis/core';
import type { RigaImportata, RigaScartata } from '@aegis/core';

export interface AnteprimaImportazione {
  readonly righeLette: number;
  readonly scartate: readonly RigaScartata[];
  readonly duplicati: number;
  readonly separatore: string;
  /** Già presenti in portafoglio: non si riacquistano. */
  readonly giaPresenti: readonly { partitaIva: string; denominazione: string | null }[];
  readonly daAcquisire: readonly RigaImportata[];
  readonly costoStimatoCentesimi: number;
}

export interface EsitoImportazione {
  readonly acquisite: number;
  readonly fallite: readonly { partitaIva: string; motivo: string }[];
  readonly costoEffettivoCentesimi: number;
}

/**
 * Cosa succederebbe, e quanto costerebbe. Non tocca nulla e non spende nulla.
 *
 * Le aziende già in portafoglio vengono escluse dal conteggio: rianalizzarle avrebbe un
 * senso, ma non è ciò che si intende premendo «importa», e farlo pagare due volte lo
 * stesso dato è il modo più rapido per perdere la fiducia di chi tiene d'occhio il credito.
 */
export function preparaImportazione(
  contenuto: string,
  identificativiPresenti: ReadonlySet<string>,
  costoUnitarioCentesimi: number,
): AnteprimaImportazione {
  const lettura = leggiPortafoglioCsv(contenuto);

  const giaPresenti: { partitaIva: string; denominazione: string | null }[] = [];
  const daAcquisire: RigaImportata[] = [];

  for (const riga of lettura.righe) {
    if (identificativiPresenti.has(riga.partitaIva)) {
      giaPresenti.push({ partitaIva: riga.partitaIva, denominazione: riga.denominazione });
    } else {
      daAcquisire.push(riga);
    }
  }

  return {
    righeLette: lettura.righe.length,
    scartate: lettura.scartate,
    duplicati: lettura.duplicati,
    separatore: lettura.separatore === '\t' ? 'tabulazione' : lettura.separatore,
    giaPresenti,
    daAcquisire,
    costoStimatoCentesimi: daAcquisire.length * costoUnitarioCentesimi,
  };
}

/**
 * Tetto di aziende per singola importazione.
 *
 * Non è un limite tecnico: è una difesa contro il file sbagliato. Caricare per errore
 * l'anagrafica completa di un gestionale, diecimila righe, significherebbe mille euro di
 * chiamate. Oltre il tetto si chiede di procedere a scaglioni, il che costringe a guardare
 * cosa si sta importando.
 */
export const MASSIMO_PER_IMPORTAZIONE = 250;
