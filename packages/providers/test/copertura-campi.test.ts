/**
 * Quanto del record acquistato arriva davvero nel prodotto.
 *
 * È il presidio contro l'errore più costoso e più invisibile che questo software abbia
 * avuto: **si pagava l'intero e se ne usava una parte**. Il profilo completo costa
 * quarantotto centesimi e restituisce duecentotrentadue campi; per un periodo ne venivano
 * letti poco più della metà, e i mancanti erano proprio quelli che a un assicuratore
 * servono di più — indici di redditività e solidità, gare pubbliche, certificazione SOA,
 * import/export, composizione del personale.
 *
 * Nessun collaudo poteva accorgersene, perché tutti verificavano che *ciò che si legge*
 * fosse letto bene. Nessuno confrontava ciò che si **compra** con ciò che si **usa**.
 *
 * Qui il confronto è automatico e gira sulle risposte reali registrate: se un domani il
 * fornitore aggiunge un campo, o qualcuno ne toglie la lettura, il numero scende e questo
 * collaudo lo dice. La soglia è alta di proposito — un prodotto che butta via un quinto
 * di ciò che paga non è pronto da vendere.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Le risposte reali registrate. Assenti sulle macchine che non le hanno: si salta. */
const SONDA = join(process.cwd(), '.sonda');

/**
 * Campi che resteranno **deliberatamente** non letti, con il motivo.
 *
 * Ognuno va giustificato qui: è l'unico modo di distinguere «scartato con cognizione» da
 * «dimenticato». Un elenco che cresce senza motivazioni è il ritorno del difetto.
 */
const SCARTATI_A_RAGION_VEDUTA: Readonly<Record<string, string>> = {
  id: 'identificativo interno del fornitore: opaco, e usarlo come chiave farebbe riacquistare le aziende',
  openapiNumber: 'idem, sulle sedi e sui soci',
  creationTimestamp: 'quando il fornitore ha creato il proprio record: non è un fatto dell’impresa',
  lastUpdateTimestamp: 'sostituito dalla data di aggiornamento leggibile, già letta',
  sdiCodeTimestamp: 'marcatempo di un campo tecnico',
  taxCodeCeasedTimestamp: 'marcatempo: la cessazione del codice fiscale è letta come fatto',
  registryOk: 'flag di coerenza interna del registro IVA del fornitore',
};

function sorgenti(dir: string, acc: string[] = []): string[] {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) sorgenti(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

/**
 * I nomi di campo citati nel codice di mappatura.
 *
 * Misura per eccesso: un campo citato potrebbe essere letto e poi ignorato. Va bene così —
 * significa che ciò che risulta **mancante manca di sicuro**, e il collaudo non produce
 * falsi allarmi.
 */
function campiLetti(): ReadonlySet<string> {
  const codice = sorgenti(join(process.cwd(), 'packages', 'providers', 'src'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  // Le stringhe fra apici singoli: sono la forma con cui i lettori ricevono i nomi.
  // Lo spazio finale è ammesso perché il fornitore ha davvero una chiave che lo contiene.
  return new Set([...codice.matchAll(/'([A-Za-z][A-Za-z0-9_]{2,} ?)'/g)].map((m) => m[1]!));
}

/** Ogni percorso foglia della risposta, con il nome del campo terminale. */
function foglie(valore: unknown, percorso: string, out: Set<string>): void {
  if (valore === null || typeof valore !== 'object') {
    out.add(percorso);
    return;
  }
  if (Array.isArray(valore)) {
    // Un elemento campione basta: la forma è la stessa per tutti.
    if (valore[0] !== undefined) foglie(valore[0], percorso, out);
    return;
  }
  for (const [chiave, v] of Object.entries(valore)) {
    foglie(v, percorso === '' ? chiave : `${percorso}.${chiave}`, out);
  }
}

const INVOLUCRO = new Set(['success', 'message', 'error', 'data']);

function divario(file: string): { totale: number; mancanti: readonly string[] } {
  const raw: unknown = JSON.parse(readFileSync(join(SONDA, file), 'utf8'));
  const letti = campiLetti();

  const percorsi = new Set<string>();
  foglie(raw, '', percorsi);

  const mancanti: string[] = [];
  let totale = 0;

  for (const percorso of percorsi) {
    const segmenti = percorso.split('.');
    const foglia = segmenti[segmenti.length - 1]!;
    if (INVOLUCRO.has(foglia)) continue;
    totale += 1;
    if (letti.has(foglia) || letti.has(`${foglia} `)) continue;
    if (foglia in SCARTATI_A_RAGION_VEDUTA) continue;
    mancanti.push(percorso);
  }

  return { totale, mancanti };
}

const disponibile = existsSync(SONDA);

describe.skipIf(!disponibile)('Copertura dei campi acquistati', () => {
  it('l’anagrafica estesa viene letta per intero', () => {
    const { totale, mancanti } = divario('prod-IT-advanced-12485671007.json');

    expect(totale).toBeGreaterThan(50);
    expect(
      mancanti,
      `campi acquistati e mai letti (${mancanti.length} su ${totale}): ${mancanti.join(', ')}`,
    ).toEqual([]);
  });

  it('il profilo completo viene letto per intero', () => {
    /*
      È il servizio più caro e il più ricco: quarantotto centesimi per duecentotrentadue
      campi, fra cui i quarantotto indici già elaborati, le gare pubbliche e le qualifiche
      d'impresa. È qui che lo spreco pesava di più.
    */
    const { totale, mancanti } = divario('prod-IT-full-12485671007.json');

    expect(totale).toBeGreaterThan(200);
    expect(
      mancanti,
      `campi acquistati e mai letti (${mancanti.length} su ${totale}): ${mancanti.join(', ')}`,
    ).toEqual([]);
  });

  it('ogni campo scartato ha una motivazione scritta', () => {
    // Un elenco di eccezioni senza motivi torna a essere una lista di dimenticanze.
    for (const [campo, motivo] of Object.entries(SCARTATI_A_RAGION_VEDUTA)) {
      expect(motivo.length, `«${campo}» è scartato senza spiegare perché`).toBeGreaterThan(20);
    }
  });
});
