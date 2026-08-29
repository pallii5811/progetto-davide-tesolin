/**
 * L'isolamento fra intermediari, misurato invece che dichiarato.
 *
 * In `rls.ts` c'erano policy corrette per dieci tabelle, e nessuno le applicava. La guida
 * di consegna diceva di applicarle. Chi l'avesse fatto avrebbe spento il prodotto: una
 * parte delle rotte interroga ancora la connessione grezza, senza `app.tenant_id`, e con
 * le policy attive `current_setting` torna vuoto e ogni riga sparisce. Il caso peggiore è
 * `utenti`, letta per email *prima* di sapere di quale studio si tratti: con la policy
 * attiva nessuno riesce più ad accedere, e senza un errore che lo spieghi.
 *
 * Questo collaudo tiene fermi due fatti, entrambi rilevati leggendo il codice e non
 * fidandosi di un elenco scritto a mano:
 *
 *  1. nessuna tabella con `tenant_id` può restare fuori dalle policy senza una ragione
 *     scritta — un'esclusione senza motivo è indistinguibile da una dimenticanza;
 *  2. l'elenco dei punti che aggirano `conTenant` non può allungarsi. È debito noto, non
 *     una scoperta da rifare ogni volta.
 *
 * Quando l'elenco al punto 2 sarà vuoto, `sqlAbilitaRls()` potrà diventare una migrazione.
 * Finché non lo è, applicarlo è un guasto, non una messa in sicurezza.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ESCLUSIONI_MOTIVATE, TABELLE_MULTI_TENANT } from '../src/rls.js';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const leggi = (relativo: string): string => readFileSync(resolve(RADICE, relativo), 'utf8');

/** Nome esportato dello schema → nome della tabella. */
function tabellePerExport(): Map<string, string> {
  const schema = leggi('packages/db/src/schema.ts');
  const mappa = new Map<string, string>();
  for (const m of schema.matchAll(/export const (\w+)\s*=\s*pgTable\(\s*\n?\s*'([a-z_]+)'/g)) {
    mappa.set(m[1]!, m[2]!);
  }
  return mappa;
}

describe('Nessuna tabella con tenant_id sfugge in silenzio', () => {
  it('ogni tabella con tenant_id è protetta oppure esclusa con una ragione scritta', () => {
    const schema = leggi('packages/db/src/schema.ts');
    const conTenantId: string[] = [];

    // Il corpo di una definizione va da `pgTable(` alla successiva: dentro si cerca
    // `tenantId`. Grezzo, ma legge la stessa cosa che legge PostgreSQL — la colonna.
    const inizi = [...schema.matchAll(/export const (\w+)\s*=\s*pgTable\(\s*\n?\s*'([a-z_]+)'/g)];
    for (const [k, m] of inizi.entries()) {
      const fine = inizi[k + 1]?.index ?? schema.length;
      if (schema.slice(m.index, fine).includes('tenantId')) conTenantId.push(m[2]!);
    }

    expect(conTenantId.length, 'lo schema deve avere tabelle multi-intermediario').toBeGreaterThan(5);

    const scoperte = conTenantId.filter(
      (t) => !TABELLE_MULTI_TENANT.includes(t) && !(t in ESCLUSIONI_MOTIVATE),
    );

    expect(
      scoperte,
      `tabelle con tenant_id né protette né escluse con motivazione: ${scoperte.join(', ')}.\n` +
        'Aggiungerle a TABELLE_CON_TENANT, oppure a ESCLUSIONI_MOTIVATE spiegando perché.',
    ).toEqual([]);
  });

  it('nessuna esclusione riguarda una tabella che non esiste più', () => {
    const esistenti = new Set(tabellePerExport().values());
    const fantasmi = Object.keys(ESCLUSIONI_MOTIVATE).filter((t) => !esistenti.has(t));
    expect(fantasmi, `esclusioni su tabelle inesistenti: ${fantasmi.join(', ')}`).toEqual([]);
  });
});

/**
 * I punti che oggi raggiungono una tabella protetta senza passare da `conTenant`.
 *
 * Non è un elenco di colpe: alcuni sono inevitabili — l'accesso cerca l'utente per email
 * prima di sapere il tenant — e altri attraversano gli studi per disegno, come l'elenco
 * degli studi o la spesa complessiva della piattaforma. Ma finché uno solo di questi
 * resta, le policy non si possono accendere, ed è questo che l'elenco serve a ricordare.
 */
const AGGIRAMENTI_NOTI: readonly string[] = [
  'aggiornaUtente',
  'assicuraAzienda',
  'cercaAziendeInArchivio',
  'chiaveAzienda',
  'contaAmministratoriAttivi',
  'contaEventiDaGestire',
  'creaUtente',
  'elencoEventi',
  'elencoStudi',
  'elencoUtenti',
  'impostaPassword',
  'registraTentativoAccesso',
  'segnaGestito',
  'spesaComplessiva',
  'spesaOdierna',
  'spesaOdiernaComplessiva',
  'trovaAziendaPerChiave',
  'trovaUtentePerEmail',
  'trovaUtentePerId',
];

describe('Il debito di isolamento non cresce', () => {
  it('nessun nuovo punto raggiunge una tabella protetta fuori da conTenant', () => {
    const exportATabella = tabellePerExport();
    const nomiTabella = new Set(exportATabella.values());

    // Funzione esportata → tabelle che tocca.
    const fonti = [
      ...readdirSync(resolve(RADICE, 'packages/db/src'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `packages/db/src/${f}`),
      'apps/api/src/monitoraggio.ts',
    ];

    const tabellePerFunzione = new Map<string, Set<string>>();
    for (const file of fonti) {
      const testo = leggi(file);
      const inizi = [...testo.matchAll(/export (?:async )?function (\w+)\s*[(<]/g)];
      for (const [k, m] of inizi.entries()) {
        const corpo = testo.slice(m.index, inizi[k + 1]?.index ?? testo.length);
        const tab = tabellePerFunzione.get(m[1]!) ?? new Set<string>();
        for (const s of corpo.matchAll(/schema\.(\w+)/g)) {
          const t = exportATabella.get(s[1]!);
          if (t !== undefined) tab.add(t);
        }
        // SQL grezzo: le tabelle compaiono per nome, non per riferimento allo schema.
        for (const s of corpo.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]+)/g)) {
          if (nomiTabella.has(s[1]!)) tab.add(s[1]!);
        }
        tabellePerFunzione.set(m[1]!, tab);
      }
    }

    // Punti di chiamata sulla connessione grezza.
    const righe = leggi('apps/api/src/server.ts').split(/\r?\n/);
    const trovati = new Set<string>();
    righe.forEach((riga, i) => {
      let nome = /(\w+)\s*\(\s*(?:persistenza|risolto)\.db\b/.exec(riga)?.[1];
      if (nome === undefined && /^\s*(?:persistenza|risolto)\.db,?\s*$/.test(riga)) {
        // Chiamata spezzata su più righe: il nome sta poco sopra.
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const m = /(\w+)\s*\(\s*$/.exec(righe[j]!);
          if (m !== null) {
            nome = m[1];
            break;
          }
        }
      }
      if (nome === undefined) return;
      const tocca = [...(tabellePerFunzione.get(nome) ?? [])].filter((t) =>
        TABELLE_MULTI_TENANT.includes(t),
      );
      if (tocca.length > 0) trovati.add(nome);
    });

    const nuovi = [...trovati].filter((n) => !AGGIRAMENTI_NOTI.includes(n)).sort();
    expect(
      nuovi,
      `nuove chiamate che leggono tabelle protette senza conTenant: ${nuovi.join(', ')}.\n` +
        'Avvolgerle in conTenant, oppure — se attraversano gli studi per disegno — ' +
        'aggiungerle ad AGGIRAMENTI_NOTI spiegando perché nel commento.',
    ).toEqual([]);

    const risolti = AGGIRAMENTI_NOTI.filter((n) => !trovati.has(n)).sort();
    expect(
      risolti,
      `buona notizia: questi punti non aggirano più conTenant — ${risolti.join(', ')}. ` +
        'Toglierli da AGGIRAMENTI_NOTI, così il conto resta vero.',
    ).toEqual([]);
  });
});
