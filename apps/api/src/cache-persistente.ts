/**
 * La cache delle risposte comprate, su database.
 *
 * Finché viveva in memoria, ogni riavvio del servizio buttava via tutto ciò che era stato
 * acquistato: rianalizzare la stessa azienda il giorno dopo costava di nuovo cinquantacinque
 * centesimi per dati identici, già presenti in archivio. Bastavano un aggiornamento, un
 * riavvio notturno o un secondo processo a rifare la spesa — e nessuno se ne accorgeva,
 * perché il conto arriva a fine mese e non dice quale euro era evitabile.
 *
 * ## Due strati, e servono entrambi
 *
 * Davanti al database resta una cache in memoria. Non è un'ottimizzazione gratuita: senza,
 * ogni chiamata a un servizio pagherebbe un giro sul database anche quando la stessa
 * risposta è già stata letta un istante prima, e un'analisi ne fa parecchie. Dietro, il
 * database è ciò che rende il dato **definitivamente comprato**.
 *
 * Lo strato di memoria non può servire un dato che il database non ha: si scrive prima
 * sotto e poi sopra, così un riavvio nel mezzo perde al massimo la copia veloce.
 */

import { dimenticaCache, leggiCache, scriviCache } from '@aegis/db';
import type { Database } from '@aegis/db';
import { MemoryCache } from '@aegis/providers';
import type { Cache, CacheEntry } from '@aegis/providers';

export class CachePersistente implements Cache {
  readonly #memoria = new MemoryCache();

  constructor(private readonly db: Database) {}

  async get(chiave: string): Promise<CacheEntry | undefined> {
    const veloce = this.#memoria.get(chiave);
    if (veloce !== undefined) return veloce;

    const riga = await leggiCache(this.db, chiave);
    if (riga === null) return undefined;

    const voce: CacheEntry = { value: riga.valore, expiresAt: riga.scadeIl.getTime() };
    // Ripopola lo strato veloce: la prossima lettura non torna sul database.
    this.#memoria.set(chiave, voce);
    return voce;
  }

  async set(chiave: string, voce: CacheEntry): Promise<void> {
    /*
      Un guasto della cache non deve costare l'analisi.

      Il dato è già stato comprato e la risposta è in mano: se la scrittura fallisce, il
      peggio che può succedere è ricomprarlo la prossima volta. Far cadere qui l'intera
      analisi significherebbe perdere **anche** il dato appena pagato.
    */
    try {
      await scriviCache(this.db, chiave, voce.value, new Date(voce.expiresAt));
    } catch {
      // Silenzio deliberato: vedi sopra.
    }
    this.#memoria.set(chiave, voce);
  }

  async delete(chiave: string): Promise<void> {
    this.#memoria.delete(chiave);
    try {
      await dimenticaCache(this.db, chiave);
    } catch {
      // Vedi `set`.
    }
  }
}
