import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/**
 * Ciò che si paga si vede.
 *
 * IL DIFETTO, DETTO PIÙ VOLTE DAL PROPRIETARIO DEL PRODOTTO e corretto ogni volta a mano:
 * un dato comprato dall'archivio camerale, mappato nel dominio, serializzato verso il
 * client — e mai reso da nessuna schermata. Contati il 31/08/2026: **quindici campi su
 * centoventicinque**, fra cui i paesi di esportazione (che il questionario chiedeva
 * all'intermediario mentre il registro li aveva già mandati), la percentuale di operai
 * nel riquadro che si intitola «pesa su RC lavoratori», l'anno a cui il fatturato si
 * riferisce, quattro indici di credito e il consenso al contatto commerciale.
 *
 * Nessuno di quei difetti era visibile leggendo il codice: ogni pezzo, preso da solo, era
 * corretto. Mancava solo l'ultimo passo, e mancava in silenzio.
 *
 * Questa prova è il presidio che impedisce il prossimo. Aggiungere un campo a
 * `IndicatoriFornitore` senza mostrarlo da qualche parte fa diventare rossa la suite.
 *
 * COSA NON GARANTISCE, perché un controllo che non dichiara i propri limiti è peggio di
 * nessun controllo: cerca il NOME del campo nel testo delle schermate. Un campo reso da un
 * ciclo su `Object.entries` risulterebbe non mostrato pur essendolo, e un campo nominato in
 * un commento risulterebbe mostrato senza esserlo. Non prova che il dato sia reso BENE:
 * prova che qualcuno lo ha guardato.
 */

const RADICE = resolve(import.meta.dirname, '..', '..', '..');
const TIPO = join(RADICE, 'packages', 'core', 'src', 'company', 'indicatori-fornitore.ts');
const SCHERMATE = join(RADICE, 'apps', 'web', 'src');

function tuttiIFile(cartella: string): string[] {
  const fuori: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) fuori.push(...tuttiIFile(percorso));
    else if (['.ts', '.tsx'].includes(extname(voce))) fuori.push(percorso);
  }
  return fuori;
}

/** Il contratto HTTP è escluso: dichiarare un campo non è mostrarlo. */
const testoDelleSchermate = tuttiIFile(SCHERMATE)
  .filter((f) => !f.endsWith(join('lib', 'api.ts')))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

function campiDelDominio(): readonly string[] {
  const sorgente = readFileSync(TIPO, 'utf8');
  const fuori: string[] = [];
  for (const riga of sorgente.split(/\r?\n/)) {
    const campo = /^readonly ([a-zA-Z0-9]+)\??:/.exec(riga.trim());
    if (campo?.[1] !== undefined) fuori.push(campo[1]);
  }
  return fuori;
}

describe('Nessun dato comprato resta invisibile', () => {
  const campi = campiDelDominio();

  it('il tipo si legge davvero: senza questo, le prove sotto girerebbero su zero campi', () => {
    // La forma del difetto che questa prova esiste per evitare, applicata a sé stessa.
    expect(campi.length).toBeGreaterThan(100);
  });

  it('ogni campo degli indicatori d’archivio è nominato da almeno una schermata', () => {
    const invisibili = campi.filter((c) => !new RegExp(`\\b${c}\\b`).test(testoDelleSchermate));

    expect(
      invisibili,
      invisibili.length === 0
        ? ''
        : `${invisibili.length} campi sono comprati dall’archivio, portati fino al client e mai ` +
            `mostrati: ${invisibili.join(', ')}. Renderli in una schermata, oppure — se davvero non ` +
            'servono a un intermediario — toglierli dal modello, così nessuno paga per trasportarli.',
    ).toEqual([]);
  });
});
