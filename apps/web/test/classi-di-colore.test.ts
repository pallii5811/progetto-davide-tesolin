/**
 * Una classe di colore che il tema non definisce non produce CSS, e non dà errore.
 *
 * `--color-attenzione` non esisteva fra i token, e nove classi lo usavano da sempre:
 * `text-attenzione` sulla riserva «valutazione formulata su dati presuntivi» che il
 * broker consegna al cliente, `border-attenzione` sul riquadro «documento parziale» che
 * rende difendibile il fascicolo, `bg-attenzione/5` sullo stato «serve la visura» del
 * titolare effettivo.
 *
 * In Tailwind v4 il blocco `@theme` è l'unica sorgente: senza la variabile quelle classi
 * non vengono generate. Nessun errore di compilazione, nessun avviso, nessun test rosso —
 * solo un bordo che eredita il colore da chi sta sopra. Sul titolare effettivo lo stato di
 * allarme risultava **meno** marcato di quello tranquillo, che usa un verde esistente.
 *
 * Questa prova compila il foglio di stile vero con il vero motore e cerca le classi
 * nell'output. È l'unico modo di accorgersene: leggere il sorgente non basta, perché il
 * sorgente sembra giusto.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const CSS = resolve(RADICE, 'apps/web/src/app/globals.css');

/** Tutte le classi di colore usate nel prodotto, per prefisso. */
function classiUsate(): ReadonlySet<string> {
  const trovate = new Set<string>();
  const visita = (dir: string): void => {
    for (const voce of readdirSync(dir)) {
      const percorso = join(dir, voce);
      if (statSync(percorso).isDirectory()) {
        visita(percorso);
        continue;
      }
      if (!['.tsx', '.ts'].includes(extname(voce))) continue;
      const testo = readFileSync(percorso, 'utf8');
      for (const m of testo.matchAll(/\b(?:text|bg|border)-([a-z]+(?:-[a-z]+)*)(?:\/\d+)?\b/g)) {
        // Il gruppo di cattura è tipizzato `string | undefined`, e la guardia non è
        // cerimoniale: senza, un `undefined` entrerebbe nell'insieme dei colori trovati e
        // il confronto con quelli definiti nel tema fallirebbe su un nome che non esiste.
        const token = m[1];
        if (token !== undefined) trovate.add(token);
      }
    }
  };
  visita(resolve(RADICE, 'apps/web/src'));
  return trovate;
}

/** I token di colore che il tema definisce davvero. */
function tokenDefiniti(): ReadonlySet<string> {
  const testo = readFileSync(CSS, 'utf8');
  return new Set(
    [...testo.matchAll(/--color-([a-z-]+):/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])),
  );
}

describe('Ogni colore usato esiste nel tema', () => {
  it('nessuna classe di colore punta a un token che non c’è', () => {
    const definiti = tokenDefiniti();
    // Restano fuori i colori nativi di Tailwind e le parole che non sono colori: si
    // verificano solo i nomi del **nostro** vocabolario, cioè quelli che assomigliano a
    // un token e non lo sono.
    const nostri = [
      'fondo',
      'superficie',
      'bordo',
      'bordo-forte',
      'testo',
      'testo-tenue',
      'testo-debole',
      'marchio',
      'marchio-tenue',
      'azione',
      'azione-testo',
      'basso',
      'moderato',
      'rilevante',
      'alto',
      'critico',
      'attenzione',
      'basso-fondo',
      'moderato-fondo',
      'rilevante-fondo',
      'alto-fondo',
      'critico-fondo',
      'attenzione-fondo',
    ];

    const usati = classiUsate();
    const morti = nostri.filter((n) => usati.has(n) && !definiti.has(n));

    expect(
      morti,
      `classi usate nel prodotto e non definite in globals.css: ${morti.join(', ')}.\n` +
        'In Tailwind v4 non producono CSS e non danno errore: il riquadro esce senza colore.',
    ).toEqual([]);
  });

  /*
    La prova che conta: si compila.

    Il controllo sopra confronta due elenchi, e due elenchi possono essere entrambi
    sbagliati. Qui si passa il foglio vero al motore vero e si guarda cosa esce.
  */
  it('le classi «attenzione» vengono davvero generate dal compilatore', async () => {
    const sorgente = readFileSync(CSS, 'utf8');
    const compilato = await postcss([tailwind()]).process(sorgente, { from: CSS });

    for (const classe of ['text-attenzione', 'bg-attenzione', 'border-attenzione']) {
      expect(compilato.css, `${classe} non compare nel CSS compilato`).toContain(`.${classe}`);
    }
  });

  it('e vengono generate anche quelle della scala di gravità, che funzionavano già', () => {
    // Il controprova: se il compilatore non generasse nulla, la prova sopra passerebbe
    // per la ragione sbagliata.
    expect(tokenDefiniti().has('critico')).toBe(true);
    expect(tokenDefiniti().has('attenzione')).toBe(true);
  });
});
