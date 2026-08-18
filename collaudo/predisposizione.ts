/**
 * Predisposizione dell'ambiente di collaudo.
 *
 * Gira **prima** che i servizi si avviino, su un archivio dedicato che viene azzerato a
 * ogni esecuzione: un collaudo che dipende da dati lasciati in giro dalla volta precedente
 * non dimostra nulla.
 *
 * Crea l'amministratore con una password nota. Il prodotto non viene toccato: al suo
 * avvio `predisponiPrimoAccesso` troverà un utente già presente e non farà nulla, che è
 * esattamente il comportamento previsto su un archivio non vuoto.
 */

import { rmSync } from 'node:fs';
import { applicaSchemaTollerante, assicuraTenantPredefinito, connetti, creaUtente } from '@aegis/db';
import { derivaPassword, verificaRequisitiPassword } from '../apps/api/src/auth.js';
import { AMMINISTRATORE, CARTELLA_DATI } from './ambiente.js';

export default async function predisponi(): Promise<void> {
  // Le credenziali di collaudo passano dalle regole del prodotto. Senza questo controllo
  // si può predisporre un utente con una password che il prodotto rifiuterebbe, e il
  // collaudo fallisce più tardi in un punto che non c'entra nulla — com'è già successo.
  const requisiti = verificaRequisitiPassword(AMMINISTRATORE.password);
  if (!requisiti.valida) {
    throw new Error(`Password di collaudo non conforme: ${requisiti.problemi.join(' ')}`);
  }

  rmSync(CARTELLA_DATI, { recursive: true, force: true });

  const connessione = await connetti({ cartellaDati: CARTELLA_DATI });
  try {
    await applicaSchemaTollerante(connessione);

    const tenantId = await assicuraTenantPredefinito(connessione.db, 'Studio di collaudo');
    await creaUtente(connessione.db, {
      tenantId,
      email: AMMINISTRATORE.email,
      nome: 'Amministratore',
      passwordHash: await derivaPassword(AMMINISTRATORE.password),
      ruolo: 'amministratore',
    });
  } finally {
    // PGlite ammette un solo scrittore: senza questa chiusura l'API non riuscirebbe
    // ad aprire l'archivio, e il collaudo fallirebbe per una ragione che non c'entra.
    await connessione.chiudi();
  }
}
