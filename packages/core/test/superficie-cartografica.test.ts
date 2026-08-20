/**
 * Il capitale sui fabbricati quando l'intervista non ha misurato.
 *
 * Era il caso più frequente e il peggio servito: senza superfici dichiarate si saltava
 * direttamente al valore netto contabile, cioè a un numero già decurtato dagli ammortamenti
 * e che comprende il terreno — una base che sottostima proprio dove la sottoassicurazione
 * fa più male.
 *
 * L'impronta a terra dei fabbricati da cartografia è una base peggiore di un rilievo e
 * molto migliore di quella. Le prove qui sotto misurano le tre cose che la rendono
 * accettabile: che **non scavalchi mai** una misura vera, che dichiari i propri limiti, e
 * che non venga spacciata per un rilievo con una confidenza che non ha.
 */

import { describe, expect, it } from 'vitest';
import { computeSumsInsured, COSTO_RICOSTRUZIONE_EUR_MQ } from '../src/coverage/sums-insured.js';
import { deriveFacts } from '../src/company/facts.js';
import { demoCompanyProfile } from '../src/fixtures/demo.js';
import type { ImmobileDichiarato } from '../src/company/profile.js';

/** Data fissa: i fatti dipendono dall'età dell'impresa, e una prova non deve invecchiare. */
const AS_OF = new Date('2026-08-20T00:00:00Z');

function fatti() {
  return deriveFacts(demoCompanyProfile(), null, AS_OF);
}

const IMMOBILE_MISURATO: ImmobileDichiarato = {
  descrizione: 'Capannone',
  superficieMq: 2000,
  titolo: 'proprieta',
  tipologiaCostruttiva: 'prefabbricato',
  annoCostruzione: 2005,
  presenzaImpiantoAntincendio: true,
  presenzaAllarme: true,
  indirizzo: null,
};

describe('Superficie dei fabbricati da cartografia', () => {
  it('non viene usata quando l’intervista ha misurato', () => {
    const conRilievo = computeSumsInsured(fatti(), null, [IMMOBILE_MISURATO], {
      superficieCartograficaMq: 5000,
    });

    /*
      Chi ha fatto il sopralluogo ha misurato il fabbricato; la cartografia disegna
      l'impronta a terra e ignora i piani. La seconda non deve mai scavalcare la prima,
      nemmeno quando è più grande — anzi: soprattutto quando è più grande, perché il numero
      risultante sarebbe più alto e sembrerebbe più prudente.
    */
    expect(conRilievo.fabbricati.explanation.formula).toContain('superficie mq × costo');
    expect(conRilievo.fabbricati.confidence).toBe('alta');
    // 2.000 m² × 750 €/m² (prefabbricato) = 1.500.000 €.
    expect(conRilievo.fabbricati.value).toBe(2000 * COSTO_RICOSTRUZIONE_EUR_MQ.prefabbricato * 100);
  });

  it('entra in gioco solo senza superfici dichiarate, e lo dichiara', () => {
    const senzaRilievo = computeSumsInsured(fatti(), null, [], {
      superficieCartograficaMq: 1500,
      costoRicostruzioneEuroMq: 1000,
    });

    expect(senzaRilievo.fabbricati.value).toBe(1500 * 1000 * 100);
    expect(senzaRilievo.fabbricati.explanation.formula).toContain('cartografia');

    /*
      Confidenza media e non alta: è una superficie vera ma della grandezza sbagliata —
      coperta invece che sviluppata. Dichiararlo è ciò che impedisce di scambiarla per un
      rilievo, e di smettere di chiedere i metri quadri in intervista.
    */
    expect(senzaRilievo.fabbricati.confidence).toBe('media');

    const note = senzaRilievo.fabbricati.explanation.notes.join(' ');
    expect(note).toContain('non è stata rilevata in intervista');
    expect(note).toContain('più piani');
  });

  it('senza superfici e senza cartografia resta il ripiego dal bilancio', () => {
    // Il comportamento di prima non deve cambiare: la cartografia si **aggiunge** alla
    // catena dei ripieghi, non la sostituisce.
    const senzaNulla = computeSumsInsured(fatti(), null, [], {});
    expect(senzaNulla.fabbricati.explanation.formula ?? '').not.toContain('cartografia');
  });

  it('una superficie cartografica nulla non produce una stima a zero', () => {
    // Zero non è una superficie: è un dato assente scritto male, e produrrebbe un capitale
    // di 0 € — cioè il consiglio più assurdo che un software assicurativo possa dare.
    const conZero = computeSumsInsured(fatti(), null, [], { superficieCartograficaMq: 0 });
    expect(conZero.fabbricati.explanation.formula ?? '').not.toContain('cartografia');
  });
});
