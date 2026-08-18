/**
 * Caricamento del file `.env`.
 *
 * Chi mette il token in `.env` si aspetta che il servizio lo usi: doverlo ricordare un
 * comando diverso è una trappola, e il sintomo — «nessuna chiave configurata» a fronte di
 * un file che la contiene — fa cercare il guasto nel posto sbagliato.
 *
 * Due scelte deliberate:
 *
 *  - il percorso è **ancorato alla posizione di questo file**, non alla cartella di lavoro:
 *    `npm run dev:api` dalla radice e `npm run dev` dentro `apps/api` hanno cartelle correnti
 *    diverse, e un percorso relativo funzionerebbe solo in uno dei due casi;
 *  - le variabili **già presenti nell'ambiente vincono** su quelle del file. È ciò che
 *    permette di forzare la modalità dimostrativa senza toccare la configurazione, e in
 *    produzione impedisce a un `.env` dimenticato di scavalcare le variabili del servizio.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Radice del repository, ancorata a questo file: vale sia da `src/` sia da `dist/`. */
const RADICE = fileURLToPath(new URL('../../..', import.meta.url));

export function caricaEnv(percorso = resolve(RADICE, '.env')): { caricate: number; da: string | null } {
  if (!existsSync(percorso)) return { caricate: 0, da: null };

  let caricate = 0;
  for (const riga of readFileSync(percorso, 'utf8').split(/\r?\n/)) {
    const pulita = riga.trim();
    if (pulita === '' || pulita.startsWith('#')) continue;

    const separatore = pulita.indexOf('=');
    if (separatore <= 0) continue;

    const chiave = pulita.slice(0, separatore).trim();
    if (chiave in process.env) continue;

    // Le virgolette attorno al valore sono una convenzione della shell, non parte del dato.
    const valore = pulita
      .slice(separatore + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');

    process.env[chiave] = valore;
    caricate++;
  }

  return { caricate, da: percorso };
}
