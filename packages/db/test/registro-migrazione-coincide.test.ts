import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sqlRegistroInalterabile } from '../src/registro.js';

/**
 * La migrazione del registro coincide con il codice che la genera.
 *
 * Lo schema di questo prodotto vive in due posti: le migrazioni, che girano in produzione,
 * e il DDL in `client.ts`, che gira nei collaudi. Un registro inalterabile che vale in un
 * posto solo è un registro che un giorno diverge in silenzio, e la divergenza si scopre
 * dove costa di più: davanti a un ispettore.
 *
 * Qui non si divide sul punto e virgola come nel collaudo delle policy: i corpi plpgsql ne
 * contengono a decine, e spezzarli darebbe frammenti che non sono istruzioni. Si divide sul
 * marcatore che drizzle usa per separarle, che è l'unica cosa che le separa davvero.
 */
const radice = fileURLToPath(new URL('../../..', import.meta.url));
const leggi = (percorso: string): string => readFileSync(`${radice}/${percorso}`, 'utf8');

const istruzioniDelFile = (contenuto: string): string[] =>
  contenuto
    .split('--> statement-breakpoint')
    // L'intestazione è fatta di righe che cominciano per «--» e non è un'istruzione.
    .map((pezzo) =>
      pezzo
        .split('\n')
        .filter((riga) => !riga.trimStart().startsWith('--'))
        .join('\n')
        .trim()
        .replace(/;$/, '')
        .trim(),
    )
    .filter((s) => s.length > 0);

describe('La migrazione del registro coincide con il generatore', () => {
  it('ogni istruzione del generatore sta nel file, e il file non ne ha altre', () => {
    const daFile = istruzioniDelFile(leggi('packages/db/migrazioni/0011_registro_inalterabile.sql'));
    const daGeneratore = [...sqlRegistroInalterabile()];

    expect(daFile, 'rigenerare con: npx tsx scripts/genera-migrazione-registro.ts').toEqual(daGeneratore);
  });

  it('la migrazione è registrata nel diario che drizzle applica', () => {
    const diario = JSON.parse(leggi('packages/db/migrazioni/meta/_journal.json')) as {
      entries: { tag: string }[];
    };
    expect(diario.entries.map((e) => e.tag)).toContain('0011_registro_inalterabile');
  });

  it('il divieto viene installato prima del trigger che scrive', () => {
    /*
      Ciò che protegge va prima di ciò che scrive. È la regola pagata con un file SQL di
      373 righe che si fermò a metà: le partizioni furono create, il blocco che le proteggeva
      no, e l'editor disse «Success». Qui l'ordine è una proprietà verificabile.
    */
    const istruzioni = [...sqlRegistroInalterabile()];
    const divieto = istruzioni.findIndex((s) => s.includes('CREATE TRIGGER audit_log_niente_modifiche'));
    const scrittura = istruzioni.findIndex((s) => s.includes('CREATE TRIGGER audit_log_catena'));

    expect(divieto).toBeGreaterThanOrEqual(0);
    expect(scrittura).toBeGreaterThan(divieto);
  });

  it('la verifica è l’ultima: è il pezzo che serve solo dopo che tutto il resto esiste', () => {
    const istruzioni = [...sqlRegistroInalterabile()];
    expect(istruzioni[istruzioni.length - 1]).toContain('verifica_catena_audit');
  });
});
