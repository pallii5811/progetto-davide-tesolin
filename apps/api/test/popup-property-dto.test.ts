import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile } from '@aegis/core';
import { presentAnalysis } from '../src/presenter.js';

/**
 * I punteggi del popup del Property attraversano il confine, in tutte e due le direzioni.
 *
 * Il test sulle protezioni confronta i campi di primo livello di ciascun gruppo, ma le sedi del
 * Property viaggiano dentro un elenco e quel confronto non ci arriva. Un campo che l'API manda e il
 * frontend non dichiara non si vede; uno che il frontend dichiara e l'API non manda arriva
 * `undefined` dove il compilatore lo crede valorizzato — e una lancetta disegnata su `undefined`
 * finisce appoggiata sull'1.
 */
const dto = presentAnalysis(analyzeCompany(demoCompanyProfile(), [], DEMO_AS_OF));
const sedi = dto.protezioni.property.ubicazioni;

const sorgente = readFileSync(
  fileURLToPath(new URL('../../web/src/lib/api.ts', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/** I campi dichiarati da `PropertyUbicazioneDto`: quelli di primo livello e quelli dentro `punteggi`. */
function campiDichiarati(): { sede: string[]; punteggi: string[]; didascalie: string[] } {
  const inizio = sorgente.indexOf('export interface PropertyUbicazioneDto {');
  if (inizio === -1) throw new Error('PropertyUbicazioneDto non è dichiarato nel frontend');
  const blocco = sorgente.slice(inizio, sorgente.indexOf('\n}\n', inizio));

  const sede = [...blocco.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!);
  const punteggiInizio = blocco.indexOf('  punteggi: {');
  const punteggiBlocco = blocco.slice(punteggiInizio, blocco.indexOf('\n  };', punteggiInizio));
  const punteggi = [...punteggiBlocco.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]!);
  const didascalieRiga = /^ {2}didascalie: \{([^}]*)\};$/m.exec(blocco)?.[1] ?? '';
  const didascalie = [...didascalieRiga.matchAll(/(\w+):/g)].map((m) => m[1]!);
  return { sede, punteggi, didascalie };
}

describe('Le sedi del Property nel DTO', () => {
  it('API e frontend dichiarano gli stessi campi per ogni sede, punteggi e didascalie compresi', () => {
    const dichiarati = campiDichiarati();
    expect(sedi.length).toBeGreaterThan(0);

    for (const s of sedi) {
      expect(Object.keys(s).sort(), s.etichetta).toEqual([...dichiarati.sede].sort());
      expect(Object.keys(s.punteggi).sort(), `${s.etichetta}: punteggi`).toEqual(
        [...dichiarati.punteggi].sort(),
      );
      expect(Object.keys(s.didascalie).sort(), `${s.etichetta}: didascalie`).toEqual(
        [...dichiarati.didascalie].sort(),
      );
    }
  });

  it('i punteggi della sede sono quelli delle sue voci', () => {
    for (const s of sedi) {
      const [attivita, sito, pericoli] = s.voci;
      expect(s.punteggi.attivita, s.etichetta).toBe(attivita?.punteggio);
      expect(s.punteggi.tipoDiSito, s.etichetta).toBe(sito?.punteggio);
      expect(s.punteggi.pericoliNaturali, s.etichetta).toBe(pericoli?.punteggio);
    }
  });

  it('un punteggio assente esce null, mai zero', () => {
    for (const s of sedi) {
      for (const [voce, valore] of Object.entries(s.punteggi)) {
        expect(valore === null || (valore >= 1 && valore <= 7), `${s.etichetta}: ${voce} = ${valore}`).toBe(
          true,
        );
      }
    }
  });
});
