/**
 * Lo schema di calcolo del margine di contribuzione.
 *
 * Serve a una cosa sola: farsi verificare. È il documento che l'imprenditore porta al
 * proprio commercialista, e il capitale della garanzia danni indiretti nasce da lì.
 *
 * Il presidio è quindi la **quadratura**: la somma delle righe deve fare esattamente il
 * margine dichiarato. Uno schema che non torna con il proprio totale è peggio di nessuno
 * schema — chi lo verifica trova una differenza, non sa quale dei due numeri credere, e
 * smette di fidarsi dell'intero documento.
 *
 * È già successo, ed è la ragione per cui questo file esiste: la prima versione
 * riimplementava la formula invece di derivarla dal risultato, sbagliava il segno della
 * variazione delle rimanenze, e bastava cambiare un parametro perché lo schema smettesse
 * di quadrare senza che nulla lo segnalasse.
 */

import { describe, expect, it } from 'vitest';
import { demoCompanyProfile } from '../src/fixtures/demo.js';
import { reclassify } from '../src/company/financials.js';
import { componiSchemaMargine } from '../src/company/schema-margine.js';
import { Money } from '../src/shared/money.js';

const BILANCIO = demoCompanyProfile().bilanci[0]!.value;

describe('Schema del margine di contribuzione', () => {
  it.each([undefined, 0.2, 0.4, 0.6, 0.9, 1])('quadra con quota servizi variabile %s', (quota) => {
    /*
        La quadratura deve reggere a **qualunque** parametrizzazione, non solo a quella
        predefinita. La quota dei servizi variabili è una scelta dell'intermediario e
        cambia da settore a settore: se lo schema torna solo con il valore di fabbrica,
        mentirà su ogni analisi tarata.
      */
    const bilancio = reclassify(BILANCIO, quota === undefined ? {} : { quotaServiziVariabile: quota });
    const schema = componiSchemaMargine(bilancio);

    const somma = schema.righe.reduce((totale, r) => totale + Money.toEuro(r.effetto), 0);

    expect(somma).toBe(Money.toEuro(schema.margineDiContribuzione));
  });

  it('la quota dei servizi rispecchia quella davvero applicata', () => {
    const bilancio = reclassify(BILANCIO, { quotaServiziVariabile: 0.35 });
    const servizi = bilancio.origine.contoEconomico.costiServizi;
    const riga = componiSchemaMargine(bilancio).righe.find((r) => r.voce.includes('servizi'));

    expect(riga?.quotaVariabile).toBeCloseTo(0.35, 4);
    // E l'effetto è coerente con la quota dichiarata: la riga non può dire una cosa e
    // sottrarne un'altra.
    expect(Money.toEuro(riga!.effetto)).toBeCloseTo(-Money.toEuro(servizi) * 0.35, 0);
  });

  it('i consumi sommano la variazione delle rimanenze, non la sottraggono', () => {
    /*
      La variazione porta già il proprio segno contabile: negativa quando il magazzino
      cresce, perché quella parte è stata acquistata e non consumata. Invertirla gonfiava i
      consumi e sballava lo schema di settantamila euro su un bilancio da sei milioni —
      una differenza abbastanza piccola da non saltare all'occhio e abbastanza grande da
      far perdere la discussione con un commercialista.
    */
    const bilancio = reclassify(BILANCIO);
    const c = bilancio.origine.contoEconomico;
    const riga = componiSchemaMargine(bilancio).righe.find((r) => r.voce.includes('Materie prime'));

    expect(Money.toEuro(riga!.importoDiBilancio)).toBe(
      Money.toEuro(c.costiMateriePrime) + Money.toEuro(c.variazioneRimanenzeMateriePrime),
    );
  });

  it('il personale non riduce mai il margine', () => {
    // È il costo che resta dovuto a stabilimento fermo, ed è precisamente ciò che la
    // garanzia danni indiretti deve coprire: trattarlo come variabile azzererebbe la
    // ragione stessa della copertura.
    const riga = componiSchemaMargine(reclassify(BILANCIO)).righe.find((r) => r.voce.includes('personale'));

    expect(riga?.quotaVariabile).toBe(0);
    expect(Money.toEuro(riga!.effetto)).toBe(0);
  });

  it('ogni riga dice perché è lì', () => {
    // Uno schema senza motivazioni è un elenco di numeri: chi lo verifica non può
    // discuterlo, e una scelta che non si può discutere non si può nemmeno difendere.
    for (const riga of componiSchemaMargine(reclassify(BILANCIO)).righe) {
      expect(riga.motivazione.length, `«${riga.voce}» non spiega perché`).toBeGreaterThan(30);
    }
  });
});
