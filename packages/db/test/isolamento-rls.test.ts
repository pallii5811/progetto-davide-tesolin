/**
 * L'isolamento fra intermediari, misurato invece che dichiarato.
 *
 * In `rls.ts` c'erano policy corrette per undici tabelle, e per settimane nessuno ha
 * potuto applicarle: diciannove punti del servizio interrogavano la connessione grezza
 * senza `app.tenant_id`, e con le policy attive `current_setting` torna vuoto e ogni riga
 * sparisce. Il caso peggiore era `utenti`, letta per email *prima* di sapere di quale
 * studio si tratti: con la policy attiva nessuno sarebbe più entrato, senza un errore che
 * lo spiegasse.
 *
 * Il 02/09/2026 quei diciannove sono arrivati a zero — ognuno avvolto in `conTenant`, o in
 * `conPiattaforma` con la ragione scritta — e le policy sono state accese con la migrazione
 * `0010_isolamento_rls`. Questo collaudo tiene fermi quattro fatti, tutti rilevati leggendo
 * il codice e non fidandosi di un elenco scritto a mano:
 *
 *  1. nessuna tabella con `tenant_id` può restare fuori dalle policy senza una ragione
 *     scritta — un'esclusione senza motivo è indistinguibile da una dimenticanza;
 *  2. nessuna chiamata raggiunge una tabella protetta senza dichiarare lo studio o la
 *     piattaforma: con le policy attive restituirebbe zero righe, e si ferma qui prima;
 *  3. ciò che gira per la piattaforma è esattamente l'insieme dichiarato, con la ragione;
 *  4. la migrazione applicata in produzione è quella che il generatore produce: una policy
 *     corretta nel codice e diversa nel file sarebbe una sicurezza che esiste in un posto
 *     solo.
 *
 * L'isolamento in sé — lo studio A non vede le righe di B — non si può provare qui: su
 * PGlite l'utente è superuser e le policy sono inerti per costruzione di PostgreSQL. Sta
 * in `isolamento-due-studi.test.ts`, che gira su un PostgreSQL vero quando gliene si dà
 * uno.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ESCLUSIONI_MOTIVATE, TABELLE_MULTI_TENANT, sqlAbilitaRls } from '../src/rls.js';

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
/*
  Il 02/09/2026 l'elenco è arrivato a zero e le policy sono state accese (migrazione
  0010_isolamento_rls). Da allora questo collaudo non tiene un debito: tiene un divieto.
  Una chiamata nuova che raggiunge una tabella protetta senza `conTenant` né
  `conPiattaforma` non è «da aggiungere all'elenco» — con le policy attive restituirebbe
  zero righe in produzione, e la suite deve fermarsi prima.
*/
const AGGIRAMENTI_NOTI: readonly string[] = [];

/**
 * Le funzioni che possono girare per la piattaforma, cioè attraverso tutti gli studi.
 *
 * Ognuna con la sua ragione, perché un ambito «piattaforma» che cresce senza ragione
 * scritta è la stessa cosa di un `where` dimenticato. Il collaudo legge il codice e
 * pretende che ciò che sta dentro `conPiattaforma` sia esattamente questo insieme.
 */
const PER_PIATTAFORMA: Readonly<Record<string, string>> = {
  trovaUtentePerEmail:
    'l’accesso e il controllo di unicità dell’indirizzo avvengono PRIMA di sapere lo studio: è l’indirizzo a dirlo',
  elencoStudi:
    'l’elenco degli studi con il numero dei collaboratori di ciascuno: per disegno attraversa gli studi',
  spesaComplessiva: 'la spesa dell’intera piattaforma verso il fornitore dati',
  spesaOdiernaComplessiva:
    'il tetto giornaliero di piattaforma si confronta con la spesa di tutti gli studi',
  contaUtenti:
    'all’avvio, per sapere se esiste già un utente qualunque prima di creare il primo amministratore',
};

describe('Il debito di isolamento è zero, e resta zero', () => {
  it('nessun punto raggiunge una tabella protetta fuori da conTenant o conPiattaforma', () => {
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

    /*
      Punti di chiamata sulla connessione grezza, in ogni file che ne tiene una.

      Prima si leggeva solo `server.ts`. Ma la connessione grezza la tengono anche l'avvio
      — che crea il primo amministratore — e lo script che reimposta una password da riga
      di comando: con le policy attive sarebbero stati i primi a rompersi, e il collaudo
      non li guardava.
    */
    const dovePassaLaConnessione: readonly (readonly [string, RegExp, RegExp])[] = [
      [
        'apps/api/src/server.ts',
        /(\w+)\s*\(\s*(?:persistenza|risolto|archivio)\.db\b/,
        /^\s*(?:persistenza|risolto|archivio)\.db,?\s*$/,
      ],
      ['apps/api/src/avvio.ts', /(\w+)\s*\(\s*persistenza\.db\b/, /^\s*persistenza\.db,?\s*$/],
      ['scripts/reimposta-password.ts', /(\w+)\s*\(\s*db\b/, /^\s*db,?\s*$/],
    ];

    const trovati = new Set<string>();
    for (const [file, sullaRiga, spezzata] of dovePassaLaConnessione) {
      const righe = leggi(file).split(/\r?\n/);
      righe.forEach((riga, i) => {
        let nome = sullaRiga.exec(riga)?.[1];
        if (nome === undefined && spezzata.test(riga)) {
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
        if (tocca.length > 0) trovati.add(`${nome} (${file})`);
      });
    }

    const nuovi = [...trovati].filter((n) => !AGGIRAMENTI_NOTI.includes(n)).sort();
    expect(
      nuovi,
      `chiamate che raggiungono tabelle protette senza conTenant né conPiattaforma: ${nuovi.join(', ')}.\n` +
        'Con le policy attive restituirebbero zero righe in produzione. Avvolgerle in conTenant, ' +
        'oppure — se attraversano gli studi per disegno — in conPiattaforma, aggiungendole a ' +
        'PER_PIATTAFORMA con la ragione.',
    ).toEqual([]);
  });

  /*
    L'ambito «piattaforma» è un elenco chiuso, letto dal codice.

    Ogni `conPiattaforma(...)` nel servizio e negli script viene aperto e si guarda quali
    funzioni chiama sulla transazione. L'insieme deve coincidere con PER_PIATTAFORMA: una
    funzione in più è una deroga entrata senza ragione, una in meno è una ragione rimasta
    scritta per niente — e il conto smette di essere vero.
  */
  it('ciò che gira per la piattaforma è esattamente ciò che è dichiarato, con la ragione', () => {
    const file = ['apps/api/src/server.ts', 'apps/api/src/avvio.ts', 'scripts/reimposta-password.ts'];
    const dentroPiattaforma = new Set<string>();

    for (const f of file) {
      const testo = leggi(f);
      for (const m of testo.matchAll(/conPiattaforma\s*\(/g)) {
        // Il blocco: dalla parentesi aperta fino a quella che la chiude, contando le
        // parentesi. Un'espressione regolare non sa contarle, e un blocco lungo
        // sfuggirebbe a una finestra di caratteri fissa.
        let profondita = 0;
        let fine = m.index + m[0].length - 1;
        for (let i = fine; i < testo.length; i += 1) {
          if (testo[i] === '(') profondita += 1;
          if (testo[i] === ')') {
            profondita -= 1;
            if (profondita === 0) {
              fine = i;
              break;
            }
          }
        }
        const blocco = testo.slice(m.index, fine + 1);
        for (const chiamata of blocco.matchAll(/(\w+)\s*\(\s*tx\b/g)) dentroPiattaforma.add(chiamata[1]!);
      }
    }

    const dichiarate = new Set(Object.keys(PER_PIATTAFORMA));
    const nonDichiarate = [...dentroPiattaforma].filter((n) => !dichiarate.has(n)).sort();
    const senzaUso = [...dichiarate].filter((n) => !dentroPiattaforma.has(n)).sort();

    expect(
      nonDichiarate,
      `funzioni eseguite per la piattaforma senza una ragione scritta: ${nonDichiarate.join(', ')}`,
    ).toEqual([]);
    expect(
      senzaUso,
      `ragioni scritte per funzioni che non girano più per la piattaforma: ${senzaUso.join(', ')}`,
    ).toEqual([]);
    expect(
      Object.values(PER_PIATTAFORMA).every((r) => r.length > 40),
      'ogni funzione per la piattaforma porta una ragione che si possa leggere',
    ).toBe(true);
  });
});

/**
 * La migrazione è il generatore, istruzione per istruzione.
 *
 * `0010_isolamento_rls.sql` è scritta da `scripts/genera-migrazione-rls.ts` a partire da
 * `sqlAbilitaRls()`. Se qualcuno tocca una delle due senza rigenerare l'altra — una tabella
 * aggiunta all'elenco, la condizione di accesso cambiata — la produzione applicherebbe una
 * policy diversa da quella che il codice descrive, e nessun altro collaudo lo vedrebbe.
 */
describe('La migrazione delle policy coincide con il generatore', () => {
  const normalizza = (sql: string): string[] =>
    sql
      .split('--> statement-breakpoint')
      .join('\n')
      .split(';')
      .map((s) =>
        s
          .replace(/--[^\n]*/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((s) => s.length > 0);

  it('ogni istruzione del generatore sta nel file, e il file non ne ha altre', () => {
    const daFile = normalizza(leggi('packages/db/migrazioni/0010_isolamento_rls.sql'));
    const daGeneratore = normalizza(sqlAbilitaRls());

    expect(daFile, 'rigenerare con: npx tsx scripts/genera-migrazione-rls.ts').toEqual(daGeneratore);
    // Undici tabelle × (enable, force, drop, create): un conto che si può rifare a mente.
    expect(daGeneratore.length).toBe(TABELLE_MULTI_TENANT.length * 4);
  });

  it('la migrazione è registrata nel diario che drizzle applica', () => {
    const diario = JSON.parse(leggi('packages/db/migrazioni/meta/_journal.json')) as {
      entries: { tag: string }[];
    };
    expect(diario.entries.map((e) => e.tag)).toContain('0010_isolamento_rls');
  });
});
