/**
 * Ispezione dell'archivio di collaudo.
 *
 * Strumento diagnostico: dice chi c'è dentro l'archivio che il collaudo usa. Serve quando
 * l'accesso fallisce e occorre distinguere «utente assente» da «password sbagliata».
 *
 *   npx tsx scripts/ispeziona-collaudo.ts
 */

import { sql } from 'drizzle-orm';
import { connetti } from '@aegis/db';

const c = await connetti({ cartellaDati: '.collaudo-dati' });
try {
  const r = await c.db.execute<{ email: string; ruolo: string }>(sql`SELECT email, ruolo FROM utenti`);
  const righe = (r as { rows?: unknown[] }).rows ?? r;
  console.log('utenti:', JSON.stringify(righe));
} catch (e) {
  console.log('lettura fallita:', e instanceof Error ? e.message : e);
} finally {
  await c.chiudi();
}
