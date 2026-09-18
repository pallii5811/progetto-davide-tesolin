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
const PER_SEDE = senzaCommenti(leggi('app/azienda/[id]/PropertyPerSede.tsx'));
const CERCHIO = senzaCommenti(leggi('app/azienda/[id]/Cerchio.tsx'));

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
    // Dal 18/09/2026 le ubicazioni stanno dentro: il componente si apre e si chiude.
    expect(PAGINA).toContain('<SezioniProtezioni protezioni={analisi.protezioni}>');
  });

  it('il profilo aziendale resta', () => {
    expect(PAGINA).toContain('<RecordCamerale');
    for (const id of ['record-camerale', 'ubicazioni', 'assetto', 'bilancio']) {
      expect(PAGINA, id).toContain(`id="${id}"`);
    }
    expect(PAGINA).toContain('<EventiNegativi');
  });

  /*
    Merito creditizio e fido consigliato tolti dalla scheda il 18/09/2026, su richiesta di Simone:
    la scheda serve all'assicuratore. Il motore li calcola ancora — il report li usa — ma qui non
    si disegnano, e nemmeno la nota sugli aggregati di bilancio che parlava di Altman e di score.
  */
  it('merito creditizio, fido e nota sui dati non si disegnano', () => {
    for (const tolto of [
      'id="credito"',
      "id: 'credito'",
      'Merito creditizio',
      'Fido commerciale consigliato',
      'LivelloDeiDati',
      'Analisi condotta sugli aggregati sintetici',
    ]) {
      expect(PAGINA, tolto).not.toContain(tolto);
    }
  });

  it('le ubicazioni stanno dentro il Property Risk', () => {
    const apertura = PAGINA.indexOf('<SezioniProtezioni protezioni={analisi.protezioni}>');
    const ubicazioni = PAGINA.indexOf('id="ubicazioni"');
    const chiusura = PAGINA.indexOf('</SezioniProtezioni>');
    expect(apertura).toBeGreaterThan(-1);
    expect(ubicazioni).toBeGreaterThan(apertura);
    expect(chiusura).toBeGreaterThan(ubicazioni);
    expect(PAGINA).not.toContain("id: 'ubicazioni'");
  });

  it('il menu punta alle tre sezioni, e le tre sezioni esistono anche senza il calcolo', () => {
    for (const id of ['property-risk', 'business-interruption', 'cyber-risk']) {
      expect(PAGINA, `voce di menu ${id}`).toContain(`id: '${id}'`);
      expect(PROTEZIONI, `sezione ${id}`).toContain(`id="${id}"`);
    }
    expect(PAGINA).not.toMatch(/id: '(piano|rischi|somme|danno-massimo|ritenzione|prevenzione)'/);
  });

  /*
    Il 18/09/2026, in due passi: prima via le formule in blu, poi le tabelle di voci, pesi e
    contributi con una frase per voce. Al loro posto un cerchio da 1 a 7 per ogni rischio, come
    nella slide di Luca. Qui si pretende che le formule e le note del motore non tornino, e che ogni
    protezione abbia il suo cerchio.
  */
  it('niente formule né note: ogni protezione ha il suo cerchio', () => {
    expect(PROTEZIONI).not.toContain('Come è stato calcolato');
    expect(PROTEZIONI).not.toContain('ComeEStatoCalcolato');
    expect(PROTEZIONI).not.toMatch(/property\.formula|formulaPericoliNaturali|bi\.formule|cyber\.formula/);
    expect(PROTEZIONI).not.toMatch(/<Note\b|\.note\}/);
    expect(PROTEZIONI).toContain('<PropertyPerSede property={protezioni.property} />');
    for (const corpo of ['function CorpoBusinessInterruption', 'function CorpoCyber']) {
      const inizio = PROTEZIONI.indexOf(corpo);
      expect(inizio, corpo).toBeGreaterThan(-1);
      expect(PROTEZIONI.indexOf('<Cerchio', inizio), `${corpo}: il cerchio non c’è`).toBeGreaterThan(
        inizio,
      );
    }
    // Il Property di una sede: incendio, calamità naturali e punteggio complessivo.
    for (const etichetta of ['Rischio incendio', 'Calamità naturali', 'Overall Risk Score']) {
      expect(PER_SEDE, etichetta).toContain(`etichetta="${etichetta}"`);
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
  it('ogni pericolo naturale ha il suo numero accanto al cerchio', () => {
    for (const pericolo of ['sede.punteggi.alluvione', 'sede.punteggi.terremoto', 'sede.punteggi.frana']) {
      expect(PER_SEDE, pericolo).toContain(pericolo);
    }
  });

  it('un punteggio con i decimali si stampa al centesimo, non arrotondato all’intero', () => {
    // 50% × 7 + 50% × 3,67 = 5,34: stampato «5» il cerchio direbbe un rischio che non è quello.
    expect(CERCHIO).toContain('decimali ?? (Number.isInteger(valore) ? 0 : 2)');
    // Il Cyber esce dal motore a un decimale: il cerchio lo scrive come il riquadro in testa.
    expect(PROTEZIONI).toContain('etichetta="Cyber Risk" grande decimali={1}');
    // Senza punteggio il cerchio non si riempie: un settimo pieno direbbe «rischio minimo».
    expect(CERCHIO).toContain('{limitato !== null && (');
  });

  it('senza Property il riquadro dice il motivo del motore, non più la tabella mancante', () => {
    expect(PROTEZIONI).toContain('property.motivoNonCalcolabile');
    expect(PROTEZIONI).not.toContain('Manca nel foglio la tabella');
  });
});
