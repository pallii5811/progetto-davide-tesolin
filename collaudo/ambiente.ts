import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Radice del repository, ancorata a questo file e non alla cartella di lavoro. */
const RADICE = fileURLToPath(new URL('..', import.meta.url));

/**
 * Porte diverse da quelle di sviluppo: il collaudo non deve interferire con un servizio
 * che qualcuno sta usando, né trovarne uno già avviato e credere di averlo lanciato lui.
 */
export const PORTA_API = 3101;
export const PORTA_WEB = 3100;

export const INDIRIZZO_API = `http://127.0.0.1:${PORTA_API}`;
export const INDIRIZZO_WEB = `http://127.0.0.1:${PORTA_WEB}`;

/** Archivio dedicato, azzerato a ogni esecuzione. Mai quello di sviluppo. */
export const CARTELLA_DATI = resolve(RADICE, '.collaudo-dati');

/**
 * Le credenziali dell'ambiente di collaudo devono superare le stesse regole che il
 * prodotto impone agli utenti veri — niente parole facilmente indovinabili, «aegis»
 * compresa. Un ambiente predisposto in uno stato che il prodotto non permetterebbe
 * collauda qualcosa che nella realtà non esiste.
 */
export const AMMINISTRATORE = {
  email: 'collaudo@studio.local',
  password: 'ombrello-lucido-quarantatre',
  nome: 'Amministratore',
} as const;
