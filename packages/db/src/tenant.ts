/**
 * Ogni accesso ai dati dichiara per conto di chi avviene.
 *
 * L'isolamento fra intermediari era garantito **solo dal codice**: ogni repository filtra
 * per `tenant_id`, e finché nessuno dimentica un `where` funziona. Le policy di Row Level
 * Security erano scritte in `rls.ts` — il secondo strato, quello che regge quando il primo
 * sbaglia — ma non le applicava nessuno, e soprattutto **l'applicazione non impostava mai
 * `app.tenant_id`**.
 *
 * Le due cose insieme producevano una trappola: la guida di consegna diceva di applicare le
 * policy, e chi l'avesse fatto avrebbe visto il prodotto smettere di funzionare all'istante.
 * Con `app.tenant_id` assente, `current_setting` restituisce vuoto e **ogni query torna zero
 * righe** — su un archivio pieno di dati, senza un errore che spieghi perché.
 *
 * Da qui in avanti ogni operazione per conto di un intermediario passa da `conTenant`, che
 * apre una transazione e ci imposta dentro l'identificativo. `SET LOCAL` e non `SET`: il
 * valore muore con la transazione e non può restare appiccicato a una connessione che il
 * pool riassegna a un altro studio — che sarebbe il modo peggiore di far fallire un
 * isolamento, perché intermittente e invisibile.
 */

import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { sqlImpostaAmbitoPiattaforma, sqlImpostaTenant } from './rls.js';

/**
 * Esegue `azione` dentro una transazione che dichiara di operare **per la piattaforma**,
 * cioè attraverso tutti gli studi.
 *
 * Sono poche operazioni, e tutte per disegno: cercare un utente per indirizzo email
 * prima di sapere a quale studio appartiene — l'accesso, e il controllo che un indirizzo
 * non sia già registrato — l'elenco degli studi con il numero dei loro collaboratori, la
 * spesa complessiva della piattaforma, la creazione del primo amministratore di uno
 * studio nuovo. Con le policy attive nessuna di queste può passare da `conTenant`, perché
 * non c'è un tenant da dichiarare o ce n'è più d'uno.
 *
 * Non è un privilegio sparso: la policy ammette questo ambito solo se lo dichiara la
 * transazione, e il collaudo `isolamento-rls.test.ts` tiene l'elenco esplicito delle
 * funzioni che possono chiamarlo. Una chiamata nuova che non sta in quell'elenco fa
 * fallire la suite — perché un ambito «piattaforma» che cresce in silenzio è la stessa
 * cosa di un `where` dimenticato.
 */
export async function conPiattaforma<T>(db: Database, azione: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(sqlImpostaAmbitoPiattaforma()));
    return azione(tx);
  });
}

/**
 * Esegue `azione` dentro una transazione che dichiara il tenant.
 *
 * Funziona anche senza policy attive: su PGlite l'utente è superuser e la Row Level
 * Security non morde, quindi in sviluppo il comportamento non cambia. È deliberato — il
 * codice si scrive una volta e vale in entrambi gli ambienti, invece di funzionare in
 * sviluppo e scoprire in produzione che qualcosa non era stato collegato.
 */
export async function conTenant<T>(
  db: Database,
  tenantId: string,
  azione: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // `sql.raw` perché `SET LOCAL` non accetta parametri: l'identificativo è già stato
    // validato come UUID da `sqlImpostaTenant`, che solleva su qualunque altra forma.
    await tx.execute(sql.raw(sqlImpostaTenant(tenantId)));
    // La transazione è già un `Database`: drizzle la tipizza come tale, e un'asserzione
    // qui direbbe al compilatore di fidarsi di una cosa che sa già.
    return azione(tx);
  });
}
