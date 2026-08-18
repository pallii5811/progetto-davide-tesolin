/**
 * Esecuzione del monitoraggio sul portafoglio.
 *
 * Il motore che decide *cosa* è un evento sta nel dominio ed è puro. Qui c'è solo il
 * contorno: leggere le fotografie dal database, chiamare il motore, accodare ciò che
 * emerge. La separazione serve a poter collaudare il giudizio assicurativo senza database
 * e senza rete — che è la parte difficile da verificare.
 */

import { rilevaEventi } from '@aegis/core';
import type { EventoMonitoraggio, StatoSorvegliato } from '@aegis/core';
import { accodaEventi, statiDaConfrontare } from '@aegis/db';
import type { NuovoEvento } from '@aegis/db';
import type { Database } from '@aegis/db';

export interface EsitoMonitoraggio {
  readonly aziendeEsaminate: number;
  readonly eventiRilevati: number;
  readonly eventiNuovi: number;
}

/**
 * Confronta, per ogni azienda del portafoglio, le due fotografie più recenti.
 *
 * Va eseguito anche quando nulla è cambiato nei dati: scadenze e obblighi di legge
 * dipendono dalla data odierna, non da una variazione. Una polizza che scade fra
 * cinquantanove giorni non è un fatto nuovo — è un fatto che oggi è diventato urgente.
 */
export async function eseguiMonitoraggio(
  db: Database,
  tenantId: string,
  asOf: Date = new Date(),
): Promise<EsitoMonitoraggio> {
  const stati = await statiDaConfrontare(db, tenantId);

  const daAccodare: NuovoEvento[] = [];
  let rilevati = 0;

  for (const riga of stati) {
    const corrente = riga.corrente as StatoSorvegliato | null;
    if (corrente === null) continue;

    const precedente = riga.precedente as StatoSorvegliato | null;
    const eventi = rilevaEventi(precedente, corrente, { asOf });
    rilevati += eventi.length;

    for (const evento of eventi) {
      daAccodare.push(aNuovoEvento(evento, riga.aziendaId, tenantId));
    }
  }

  const nuovi = await accodaEventi(db, daAccodare);

  return { aziendeEsaminate: stati.length, eventiRilevati: rilevati, eventiNuovi: nuovi };
}

/**
 * Traduce un evento di dominio in una riga di coda.
 *
 * La conseguenza assicurativa viene unita alla descrizione invece di finire in una colonna
 * propria: è la parte che l'intermediario riferisce al cliente, e separarla dal fatto la
 * renderebbe più facile da ignorare.
 */
function aNuovoEvento(evento: EventoMonitoraggio, aziendaId: string, tenantId: string): NuovoEvento {
  return {
    aziendaId,
    tenantId,
    // I due elenchi di tipi coincidono: il dominio li definisce, lo schema li rispecchia,
    // e il compilatore verifica qui che non abbiano preso strade diverse.
    tipo: evento.tipo,
    titolo: evento.titolo,
    descrizione: `${evento.descrizione}\n\n${evento.conseguenza}`,
    rilevanza: evento.rilevanza,
    azioneSuggerita: evento.azioneSuggerita,
    valorePrecedente: evento.valorePrecedente,
    valoreNuovo: evento.valoreNuovo,
  };
}
