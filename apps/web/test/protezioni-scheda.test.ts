import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * La scheda azienda dal 13/09/2026, richiesta da Simone.
 *
 * In testa Property Risk, Business Interruption e Cyber Risk, calcolati con il foglio
 * «Veezco_Analisi Rischio.xlsx»; subito sotto il profilo aziendale, com'era; al posto
 * dell'analisi assicurativa di prima le tre sezioni con la formula in chiaro. Il report per il
 * cliente non cambia.
 */
const SORGENTI = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'apps/web/src');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');
const senzaCommenti = (sorgente: string): string =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const PAGINA = senzaCommenti(leggi('app/azienda/[id]/page.tsx'));
const PROTEZIONI = senzaCommenti(leggi('app/azienda/[id]/ProtezioniVeezco.tsx'));

describe('In testa le tre protezioni', () => {
  it('i tre riquadri prendono il posto di score, fido, patrimonio ed esposizione', () => {
    expect(PAGINA).toContain('<RiquadriProtezioni protezioni={analisi.protezioni} />');
    for (const etichetta of [
      'Score di credito',
      'Fido consigliato',
      'Patrimonio esposto',
      'Esposizione non assicurata',
    ]) {
      expect(PAGINA, etichetta).not.toContain(`etichetta="${etichetta}"`);
    }
    for (const etichetta of ['Property Risk', 'Business Interruption', 'Cyber Risk']) {
      expect(PROTEZIONI, etichetta).toContain(`etichetta="${etichetta}"`);
    }
  });

  it('niente avviso dell’intervista, niente avviso CAT NAT', () => {
    for (const testo of [
      'Intervista non ancora compilata',
      'Intervista compilata al',
      'Obbligo assicurativo catastrofale',
      'Obbligo CAT NAT in scadenza',
    ]) {
      expect(PAGINA, testo).not.toContain(testo);
    }
  });
});

describe('Sotto, il profilo aziendale e le tre protezioni', () => {
  it('le sezioni assicurative di prima non si disegnano più', () => {
    for (const id of [
      'piano',
      'rischi',
      'matrice',
      'somme',
      'danno-massimo',
      'ritenzione',
      'prevenzione',
    ]) {
      expect(PAGINA, id).not.toContain(`id="${id}"`);
    }
    for (const componente of ['VoceGap', 'VoceRischio', 'MatriceRischi']) {
      expect(PAGINA, componente).not.toContain(componente);
    }
    expect(PAGINA).toContain('<SezioniProtezioni protezioni={analisi.protezioni} />');
  });

  it('il profilo aziendale resta', () => {
    expect(PAGINA).toContain('<RecordCamerale');
    for (const id of ['record-camerale', 'ubicazioni', 'assetto', 'credito', 'bilancio']) {
      expect(PAGINA, id).toContain(`id="${id}"`);
    }
    expect(PAGINA).toContain('<EventiNegativi');
  });

  it('il menu punta alle tre sezioni, e le tre sezioni esistono anche senza il calcolo', () => {
    for (const id of ['property-risk', 'business-interruption', 'cyber-risk']) {
      expect(PAGINA, `voce di menu ${id}`).toContain(`id: '${id}'`);
      expect(PROTEZIONI, `sezione ${id}`).toContain(`id="${id}"`);
    }
    expect(PAGINA).not.toMatch(/id: '(piano|rischi|somme|danno-massimo|ritenzione|prevenzione)'/);
  });

  it('la formula sta in testa alla sezione e in chiaro, non in un blocco da aprire', () => {
    expect(PROTEZIONI).toContain('Come è stato calcolato');
    expect(PROTEZIONI).not.toContain('<details');
    for (const corpo of [
      'function CorpoProperty',
      'function CorpoBusinessInterruption',
      'function CorpoCyber',
    ]) {
      const inizio = PROTEZIONI.indexOf(corpo);
      const formula = PROTEZIONI.indexOf('<ComeEStatoCalcolato', inizio);
      const risultato = PROTEZIONI.search(/<TabellaVoci|<table/);
      expect(inizio, corpo).toBeGreaterThan(-1);
      expect(formula, `${corpo}: la formula non c’è`).toBeGreaterThan(inizio);
      const risultatoDelCorpo = PROTEZIONI.slice(inizio).search(/<TabellaVoci|<table/) + inizio;
      expect(risultato).toBeGreaterThan(-1);
      expect(formula, `${corpo}: la formula viene dopo il risultato`).toBeLessThan(risultatoDelCorpo);
    }
  });

  it('i numeri si scrivono con la virgola', () => {
    expect(PROTEZIONI).not.toMatch(/toFixed\(/);
  });
});
