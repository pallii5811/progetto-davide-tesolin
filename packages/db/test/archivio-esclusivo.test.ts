/**
 * Un archivio, un solo proprietario.
 *
 * Questo test nasce da un danno vero: due avvii sovrapposti del servizio hanno aperto la
 * stessa cartella PGlite e l'hanno resa illeggibile — «Error: Aborted()» — costringendo a
 * mettere da parte l'archivio e ripartire da vuoto.
 *
 * PGlite non è un servizio esterno che arbitra gli accessi: è Postgres compilato *dentro*
 * il processo. Chi apre la cartella scrive sui file, e due scrittori inconsapevoli l'uno
 * dell'altro non producono un conflitto ordinato, producono macerie. Il presidio deve
 * quindi fermare il secondo **prima** dell'apertura, non accorgersene dopo.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connetti } from '../src/index.js';
import type { Connessione } from '../src/index.js';

const LOCK = 'aegis-in-uso.pid';

describe('Apertura esclusiva dell’archivio su disco', () => {
  const daPulire: string[] = [];
  let aperta: Connessione | null = null;

  function cartellaTemporanea(): string {
    const percorso = mkdtempSync(join(tmpdir(), 'aegis-archivio-'));
    daPulire.push(percorso);
    return percorso;
  }

  afterEach(async () => {
    if (aperta !== null) {
      await aperta.chiudi();
      aperta = null;
    }
    for (const percorso of daPulire.splice(0)) {
      rmSync(percorso, { recursive: true, force: true });
    }
  });

  it('rifiuta la seconda apertura della stessa cartella', async () => {
    const cartella = cartellaTemporanea();
    aperta = await connetti({ cartellaDati: cartella });

    // Il messaggio conta quanto il rifiuto: chi lo legge deve capire cosa fare.
    await expect(connetti({ cartellaDati: cartella })).rejects.toThrow(/già aperto/);
  }, 90_000);

  it('libera la cartella alla chiusura, permettendo di riaprirla', async () => {
    const cartella = cartellaTemporanea();

    const prima = await connetti({ cartellaDati: cartella });
    await prima.chiudi();

    // Il presidio non deve trasformarsi in un blocco permanente: un riavvio ordinato
    // del servizio deve ritrovare il proprio archivio.
    aperta = await connetti({ cartellaDati: cartella });
    expect(aperta.tipo).toBe('pglite');
  }, 90_000);

  it('riprende una cartella lasciata da un processo non più vivo', async () => {
    const cartella = cartellaTemporanea();

    // PID inesistente: è ciò che resta dopo un arresto brusco. Bloccare qui vorrebbe dire
    // costringere a cancellare un file a mano per riavviare — e chi cancella file dentro
    // l'archivio prima o poi cancella quello sbagliato.
    writeFileSync(join(cartella, LOCK), '999999', 'utf8');

    aperta = await connetti({ cartellaDati: cartella });
    expect(aperta.tipo).toBe('pglite');
    expect(readFileSync(join(cartella, LOCK), 'utf8').trim()).toBe(String(process.pid));
  }, 90_000);

  it('non lascia presidi in giro per l’archivio in memoria', async () => {
    // Senza cartella non c'è nulla da proteggere: il database vive e muore nel processo.
    const memoria = await connetti();
    expect(memoria.tipo).toBe('pglite');
    await memoria.chiudi();
  }, 90_000);
});
