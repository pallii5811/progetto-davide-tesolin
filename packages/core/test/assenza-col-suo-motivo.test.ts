import { describe, expect, it } from 'vitest';
import { MOTIVO_ASSENZA, assenzaDi } from '../src/company/indicators.js';
import { INDICATOR_META } from '../src/company/indicators.js';
import type { FinancialIndicators } from '../src/company/indicators.js';

/**
 * «Da rilevare in intervista» non è una risposta buona per tutto.
 *
 * IL DIFETTO. Il punteggio di merito scriveva quella frase accanto a ogni indice mancante —
 * quattordici volte nello stesso riquadro — e per tre di quegli indici è falsa:
 *
 *   ROI                          l'archivio LO DÀ, ed è stampato dodici righe più su: 4,68 %
 *   Crescita EBITDA              l'archivio dà la variazione, ma su due esercizi
 *   Incidenza oneri sui ricavi   l'archivio dà gli oneri, ma in rapporto all'EBITDA
 *
 * Su tutti e tre il dato è **stato pagato ed è a schermo**. Dire «da rilevare in intervista»
 * manda l'intermediario a chiedere all'impresa una cosa che ha già in mano, e — peggio —
 * nasconde la ragione vera, che non è una mancanza ma una scelta di metodo: un denominatore
 * che l'archivio non documenta, un orizzonte che non combacia con la soglia.
 *
 * È la stessa forma del difetto già corretto sull'export («Export: da rilevare in
 * intervista» accanto a «Paesi di esportazione: Unione Europea, Altri Paesi»), e sarebbe
 * uscita al prossimo ricaricamento esattamente come è uscita quella.
 *
 * PERCHÉ L'AUDITOR NON L'AVEVA PRESA. Il suo quarto controllo confronta l'etichetta vuota
 * con i nomi dei campi valorizzati dell'archivio, e pretende due radici in comune. Ma
 * l'archivio chiama `variazioneMol` ciò che il punteggio chiama «Crescita EBITDA»: zero
 * radici in comune, e il rilievo non nasce. Un controllo che confronta i nomi è cieco ai
 * sinonimi, e i sinonimi qui sono la regola — MOL ed EBITDA sono la stessa cosa in due
 * lingue di mestiere.
 *
 * Questa prova non dipende dai nomi: elenca gli indici per cui la ragione dell'assenza è
 * stata scritta, e pretende che ci sia e che non sia la frase generica.
 */
describe('Un indice che manca dice perché manca', () => {
  it('i tre indici che l’archivio dà in un’altra forma non mandano il broker a chiedere', () => {
    const daArchivio: (keyof FinancialIndicators)[] = ['roi', 'crescitaEbitda', 'incidenzaOneriFinanziari'];

    for (const chiave of daArchivio) {
      const motivo = assenzaDi(chiave);
      expect(motivo, `${chiave} manda ancora in intervista`).not.toContain('da rilevare in intervista');
      expect(motivo, `${chiave} non dice da dove verrebbe il dato`).toMatch(/archivio/i);
    }
  });

  it('e dicono cosa c’è davvero, non solo che manca', () => {
    // Ogni motivo nomina la ragione tecnica: il denominatore, l'orizzonte, la base.
    expect(assenzaDi('roi')).toContain('denominatore');
    expect(assenzaDi('crescitaEbitda')).toContain('due esercizi');
    expect(assenzaDi('incidenzaOneriFinanziari')).toContain('EBITDA');
  });

  /*
    Il rovescio. Gli indici che l'intervista porta DAVVERO devono continuare a dirlo: il
    bilancio depositato è in mano all'impresa, si inserisce senza comprare nulla, ed è la
    riga che convince a compilare il questionario.
  */
  it('gli indici che vengono dal bilancio continuano a mandare in intervista', () => {
    for (const chiave of ['currentRatio', 'quickRatio', 'pfnSuEbitda'] as const) {
      expect(assenzaDi(chiave)).toBe('da rilevare in intervista');
    }
  });

  /*
    E l'elenco delle ragioni non diventa il posto in cui si scrive qualunque cosa: ogni voce
    dev'essere una frase, non un'etichetta, e riferirsi a un indice che esiste davvero.
  */
  it('ogni ragione è una frase, e riguarda un indice che esiste', () => {
    for (const [chiave, motivo] of Object.entries(MOTIVO_ASSENZA)) {
      expect(INDICATOR_META, `${chiave} non è un indice`).toHaveProperty(chiave);
      expect(motivo?.length ?? 0, `${chiave} ha una ragione troppo corta per esserlo`).toBeGreaterThan(40);
    }
  });
});
