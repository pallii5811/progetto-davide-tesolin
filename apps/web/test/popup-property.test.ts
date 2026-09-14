import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Il popup del Property Risk, richiesto da Simone il 14/09/2026 sulla slide di Luca.
 *
 * Cliccando Property Risk si apre una finestra con una lancetta per il totale e quattro per i
 * rischi — fiamme o esplosione, sismica, alluvione, frana — e il tipo di sito in piccolo sotto. Il
 * comportamento nel browser lo prova `collaudo/popup-property.spec.ts`; qui si presidiano i punti
 * che, cambiati per sbaglio, darebbero un numero falso o una finestra che non si chiude.
 */
const SORGENTI = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'apps/web/src');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');
const senzaCommenti = (sorgente: string): string =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const POPUP = senzaCommenti(leggi('app/azienda/[id]/PopupProperty.tsx'));
const PROTEZIONI = senzaCommenti(leggi('app/azienda/[id]/ProtezioniVeezco.tsx'));

describe('Il popup del Property Risk', () => {
  it('si apre dal riquadro in testa e dal pulsante della sezione', () => {
    expect(PROTEZIONI).toContain("import { PopupProperty } from './PopupProperty';");
    expect(PROTEZIONI).toContain('<PopupProperty property={property} innesco="riquadro" />');
    expect(PROTEZIONI).toContain('innesco="pulsante"');
  });

  it('è una finestra nativa: fuoco, Esc e pagina inerte li gestisce il browser', () => {
    expect(POPUP).toContain('<dialog');
    expect(POPUP).toContain('showModal()');
    expect(POPUP).toContain('aria-labelledby={idTitolo}');
    expect(POPUP).toContain('aria-label="Chiudi"');
  });

  it('una lancetta per il totale e una per ciascuno dei quattro rischi della slide', () => {
    expect(POPUP).toContain('<Lancetta valore={sede.punteggio} etichetta="Property Risk" grande />');
    for (const [titolo, campo] of [
      ['Rischio evento fiamme o esplosione', 'attivita'],
      ['Attività sismica', 'terremoto'],
      ['Rischio alluvione', 'alluvione'],
      ['Rischio frana', 'frana'],
    ] as const) {
      const posizione = POPUP.indexOf(`'${titolo}'`);
      expect(posizione, titolo).toBeGreaterThan(-1);
      expect(POPUP.slice(posizione, posizione + 160), titolo).toContain(`sede.punteggi.${campo}`);
    }
    expect(POPUP).toContain('sede.punteggi.tipoDiSito');
  });

  it('senza punteggio la lancetta non disegna l’ago e lo dice a chi non la vede', () => {
    // Un ago appoggiato sull'1 direbbe «rischio minimo»: un'affermazione, non un'assenza.
    expect(POPUP).toMatch(/ago !== null && \(/);
    expect(POPUP).toContain('const ago = valore === null ? null :');
    expect(POPUP).toContain('`${etichetta}: non calcolabile`');
  });

  it('il popup non calcola niente: nessuna somma né peso, solo i punteggi del motore', () => {
    expect(POPUP).not.toMatch(/\*\s*0?\.[235]\b/);
    expect(POPUP).not.toMatch(/Math\.(max|round)\([^)]*punteggi/);
  });

  it('le coordinate delle lancette sono arrotondate, così server e browser disegnano lo stesso', () => {
    // Senza, l'ultima cifra di seno e coseno cambia fra Node e Chrome: errore di idratazione.
    const punto = POPUP.slice(POPUP.indexOf('function punto('), POPUP.indexOf('export function Lancetta'));
    expect(punto).toContain('x: alCentesimo(');
    expect(punto).toContain('y: alCentesimo(');
    expect(POPUP).toContain('Math.round(valore * 100) / 100');
  });

  it('i numeri si scrivono con la virgola', () => {
    expect(POPUP).not.toMatch(/toFixed\(/);
    expect(POPUP).toContain("new Intl.NumberFormat('it-IT'");
  });
});
