/**
 * Ogni pulsante che fa partire qualcosa mostra di averlo fatto partire.
 *
 * Sulla scheda di RED GROUP S.R.L. «Analisi approfondita» restava immobile per alcuni
 * secondi mentre il server comprava e ricalcolava, e l'intermediario ha ricaricato la pagina
 * credendo che il tasto non andasse. Il difetto non era di quel tasto: nessun collegamento
 * con l'aspetto di un pulsante mostrava un'attesa, e metà dei pulsanti di invio nemmeno.
 *
 * Una regola di disciplina così non la porta nessuna funzione: la porta il sorgente, e qui
 * si legge il sorgente. Chi aggiunge domani un pulsante nudo vede questa prova diventare
 * rossa con il nome del suo file.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';
import { UBICAZIONI_CON_SUPERFICIE } from '@aegis/core';
import { sottotitoloSomme } from '../src/lib/sottotitolo-somme.js';
import { fasciaDiFatturato } from '../src/lib/fascia-fatturato.js';
import { etichettaPiuEsposta } from '../src/lib/ubicazione-piu-esposta.js';
import { ubicazioniDeiFabbricati } from '../src/lib/nota-patrimonio.js';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const SORGENTI = resolve(RADICE, 'apps/web/src');
const CSS = resolve(SORGENTI, 'app/globals.css');

function fileTsx(cartella: string = SORGENTI): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) return fileTsx(percorso);
    return extname(nome) === '.tsx' ? [percorso] : [];
  });
}

const nome = (percorso: string): string => relative(SORGENTI, percorso).split('\\').join('/');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');

describe('La rotella sta su ogni pulsante', () => {
  it('ogni pulsante di invio sta in un file che mostra la rotella', () => {
    const senza = fileTsx()
      .filter((p) => {
        const sorgente = readFileSync(p, 'utf8');
        return sorgente.includes('type="submit"') && !sorgente.includes('<Rotella');
      })
      .map(nome);
    expect(senza, 'pulsanti di invio senza rotella').toEqual([]);
  });

  it('nessun collegamento con l’aspetto di un pulsante è un Link nudo', () => {
    // Bordo da pulsante, fondo d'azione o pillola di filtro: se ha quell'aspetto, si preme,
    // e chi lo preme deve vedere che ha funzionato.
    const aspettoDiPulsante =
      /<Link\b[^>]*?className=(?:"[^"]*|\{`[^`]*)(bg-azione|rounded border border-bordo-forte|rounded-full border)/;
    const nudi = fileTsx()
      .filter((p) => aspettoDiPulsante.test(readFileSync(p, 'utf8')))
      .map(nome);
    expect(nudi, 'collegamenti-pulsante senza CollegamentoAzione').toEqual([]);
  });

  it('le voci del menu e le schede delle impostazioni hanno la loro attesa', () => {
    for (const file of ['app/NavigazionePrincipale.tsx', 'app/impostazioni/SchedaImpostazioni.tsx']) {
      expect(leggi(file), file).toContain('<AttesaDelCollegamento />');
    }
  });

  it('i due collegamenti che spendono non fanno prefetch', () => {
    const pagina = leggi('app/azienda/[id]/page.tsx');
    for (const parametro of ['?negativita=1', '?approfondita=1']) {
      const href = pagina.indexOf('/azienda/${identificativo}' + parametro);
      expect(href, parametro).toBeGreaterThan(-1);
      const apertura = pagina.lastIndexOf('<CollegamentoAzione', href);
      const chiusura = pagina.indexOf('>\n', href);
      expect(apertura, `${parametro}: non è un CollegamentoAzione`).toBeGreaterThan(-1);
      expect(pagina.slice(apertura, chiusura), parametro).toContain('prefetch={false}');
    }
  });

  it('la classe che spegne il secondo clic esiste davvero nel CSS compilato', async () => {
    // Il sorgente può scrivere una classe che Tailwind non genera: si compila, non si legge.
    const css = (await postcss([tailwind()]).process(readFileSync(CSS, 'utf8'), { from: CSS })).css;
    /*
      La regola esatta, e il suo corpo. La prima versione cercava «data-rotella» seguito entro
      400 caratteri da «pointer-events: none», e la prova a vuoto l'ha trovata verde anche
      senza la classe: bastava la regola accanto, quella dell'opacità, e un'altra utilità
      qualunque più sotto. Un controllo che non diventa rosso togliendo ciò che controlla
      non controlla niente.
    */
    const selettore = ':pointer-events-none:has(:is([data-rotella]))';
    const inizio = css.indexOf(selettore);
    expect(inizio, 'la classe che spegne il secondo clic non è stata generata').toBeGreaterThan(-1);
    expect(css.slice(inizio, css.indexOf('}', inizio))).toMatch(/pointer-events:\s*none/);
    expect(css).toContain('animate-spin');
  });
});

describe('Il sottotitolo delle somme nomina le fonti che ci sono', () => {
  it('RED GROUP: aggregati del registro e intervista vuota', () => {
    const testo = sottotitoloSomme('sintetico', 0);
    expect(testo).toBe(
      'Calcolate dagli aggregati di bilancio del Registro Imprese, senza dati di intervista: dove una voce è stimata, lo dichiara',
    );
    expect(testo).not.toContain('bilancio depositato');
    expect(testo).not.toContain('dati rilevati in intervista');
  });

  it('con bilancio e intervista le nomina entrambe', () => {
    expect(sottotitoloSomme('completo', 0.4)).toContain(
      'dal bilancio depositato e dai dati rilevati in intervista',
    );
  });

  it('senza nulla lo dice', () => {
    expect(sottotitoloSomme('assente', 0)).toMatch(/^Senza dati di bilancio né di intervista/);
  });
});

describe('La fascia di fatturato si legge come un importo', () => {
  it('«1000000 - 4999999» diventa «da 1.000.000 € a 4.999.999 €»', () => {
    expect(fasciaDiFatturato('1000000 - 4999999')).toBe('da 1.000.000 € a 4.999.999 €');
  });

  it('una forma non riconosciuta resta com’è, e l’assenza resta assenza', () => {
    expect(fasciaDiFatturato('oltre 50 milioni')).toBe('oltre 50 milioni');
    expect(fasciaDiFatturato(null)).toBeNull();
  });
});

describe('«Fra le più esposte» si tace quando lo sono tutte', () => {
  it('due su due al primo posto: nessuna etichetta', () => {
    expect(etichettaPiuEsposta(true, 2, 2)).toBeNull();
  });

  it('il resto come prima', () => {
    expect(etichettaPiuEsposta(true, 1, 2)).toBe('la più esposta');
    expect(etichettaPiuEsposta(true, 2, 3)).toBe('fra le più esposte');
    expect(etichettaPiuEsposta(false, 1, 2)).toBeNull();
    expect(etichettaPiuEsposta(true, 1, 1)).toBeNull();
  });
});

describe('Il patrimonio esposto dice su quante ubicazioni poggia', () => {
  const voce = (valore: string) => ({
    spiegazione: {
      titolo: 'Somma assicuranda — Fabbricati',
      formula: null,
      input: [{ etichetta: UBICAZIONI_CON_SUPERFICIE, valore, fonte: null }],
      note: [],
      riferimenti: [],
    },
  });

  it('legge l’input del motore', () => {
    expect(ubicazioniDeiFabbricati(voce('1 su 2'))).toBe('1 ubicazione su 2');
    expect(ubicazioniDeiFabbricati(voce('3 su 5'))).toBe('3 ubicazioni su 5');
  });

  it('senza l’input, o senza la voce, non inventa niente', () => {
    expect(ubicazioniDeiFabbricati(null)).toBeNull();
    expect(
      ubicazioniDeiFabbricati({
        spiegazione: { titolo: '', formula: null, input: [], note: [], riferimenti: [] },
      }),
    ).toBeNull();
  });
});
