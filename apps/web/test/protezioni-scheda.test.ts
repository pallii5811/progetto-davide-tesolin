import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * La scheda azienda dal 13/09/2026, richiesta da Simone.
 *
 * In testa Property Risk, Business Interruption e Cyber Risk, calcolati con il foglio
 * «Veezco_Analisi Rischio.xlsx»; al posto dell'analisi assicurativa di prima le tre sezioni con
 * la tabella delle voci. Dal 18/09/2026 le formule in chiaro non si stampano più, e il profilo
 * aziendale sta in fondo alla pagina. Il report per il cliente non cambia.
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

  /*
    Fino al 18/09/2026 ogni sezione si apriva con un riquadro blu di formule, e questo controllo
    pretendeva che ci fosse. Simone, sulla scheda da mostrare a un cliente: «tutte ste formule in
    blu devi toglierle». Ora pretende il contrario, e che il risultato — la tabella delle voci —
    resti: tolte le formule, il conto si rifà dalle tabelle.
  */
  it('le formule non si stampano, le tabelle delle voci restano', () => {
    expect(PROTEZIONI).not.toContain('Come è stato calcolato');
    expect(PROTEZIONI).not.toContain('ComeEStatoCalcolato');
    expect(PROTEZIONI).not.toMatch(/property\.formula|formulaPericoliNaturali|bi\.formule|cyber\.formula/);
    for (const corpo of [
      'function CorpoProperty',
      'function CorpoBusinessInterruption',
      'function CorpoCyber',
    ]) {
      const inizio = PROTEZIONI.indexOf(corpo);
      expect(inizio, corpo).toBeGreaterThan(-1);
      expect(
        PROTEZIONI.slice(inizio).search(/<TabellaVoci|<table/),
        `${corpo}: la tabella non c’è`,
      ).toBeGreaterThan(-1);
    }
  });

  it('i numeri si scrivono con la virgola', () => {
    expect(PROTEZIONI).not.toMatch(/toFixed\(/);
  });
});

/*
  Dal 14/09/2026 il Property si calcola: i pericoli naturali vengono dalle classi ufficiali con la
  scala decisa da Simone, al posto della tabella che nel foglio manca.
*/
describe('Il Property con la scala dei pericoli', () => {
  /*
    La scala stava nel riquadro blu delle formule, tolto il 18/09/2026. Resta scritta nella prima
    nota del Property, che il motore compone con SCALA_PERICOLI_NATURALI (property-risk.ts): chi
    legge «alluvione 7» sotto la tabella trova lì perché vale 7.
  */
  it('la scala dei punteggi resta nelle note del Property', () => {
    expect(PROTEZIONI).toContain('<Note note={property.note} />');
    const motore = readFileSync(
      resolve(SORGENTI, '../../../packages/core/src/protezioni/property-risk.ts'),
      'utf8',
    );
    expect(motore).toMatch(
      /fonti ufficiali e diventano punteggi a gradini uguali\. \$\{SCALA_PERICOLI_NATURALI\}/,
    );
  });

  it('un punteggio con i decimali si stampa al centesimo, non arrotondato all’intero', () => {
    // 50% × 7 + 50% × 3,67 = 5,34: stampato «5» il contributo 2,67 non tornerebbe più.
    expect(PROTEZIONI).toContain("v.punteggio === null ? 'non calcolabile' : punteggioIt(v.punteggio)");
    expect(PROTEZIONI).not.toMatch(/numeroIt\(v\.punteggio, 0\)/);
  });

  it('senza Property il riquadro dice il motivo del motore, non più la tabella mancante', () => {
    expect(PROTEZIONI).toContain('property.motivoNonCalcolabile');
    expect(PROTEZIONI).not.toContain('Manca nel foglio la tabella');
  });
});
