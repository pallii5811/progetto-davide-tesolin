/**
 * Cyber Risk, come lo definisce il foglio «Veezco_Analisi Rischio.xlsx».
 *
 *   Cyber Risk = ARROTONDA(30% × dipendenza digitale + 30% × sensibilità dei dati
 *                          + 15% × esposizione alle transazioni + 25% × attrattività; 1)
 *
 * I quattro punteggi, da 1 a 7, sono quelli che il foglio assegna alla divisione ATECO; i pesi
 * vengono dal foglio «CR_Overview». Le definizioni delle quattro voci sono la traduzione della
 * colonna «Definition» dello stesso foglio.
 *
 * L'ARROTONDAMENTO SI FA IN INTERI. Il foglio usa ROUND(…; 1), che sui positivi arrotonda il
 * mezzo per eccesso: 3,35 diventa 3,4 (divisione 25). In virgola mobile 1,2 + 0,6 + 0,3 + 1,25
 * non fa esattamente 3,35, e un arrotondamento su quel numero può dare 3,3. Con i pesi in
 * centesimi la somma è un intero, e il mezzo resta un mezzo. Il collaudo lo verifica su tutte
 * le 87 divisioni contro il valore salvato nel foglio.
 */

import { PESI_CYBER, RISCHIO_CYBER } from './tabelle-veezco.js';
import type { VoceDiCalcolo } from './property-risk.js';

const percentuale = (peso: number): string => `${Math.round(peso * 100)}%`;

export const FORMULA_CYBER =
  `Cyber Risk = arrotondato a un decimale (${percentuale(PESI_CYBER.dipendenzaDigitale)} × dipendenza digitale + ` +
  `${percentuale(PESI_CYBER.sensibilitaDati)} × sensibilità dei dati + ` +
  `${percentuale(PESI_CYBER.esposizioneTransazioni)} × esposizione alle transazioni + ` +
  `${percentuale(PESI_CYBER.attrattivita)} × attrattività come bersaglio)`;

export interface CyberRisk {
  readonly formula: string;
  readonly divisioneAteco: string | null;
  readonly titoloDivisione: string | null;
  readonly voci: readonly VoceDiCalcolo[];
  /** Da 1 a 7, con un decimale. */
  readonly punteggio: number | null;
  readonly note: readonly string[];
}

export function calcolaCyberRisk(divisioneAteco: string | null): CyberRisk {
  const riga = divisioneAteco === null ? null : (RISCHIO_CYBER[divisioneAteco] ?? null);

  if (riga === null) {
    return {
      formula: FORMULA_CYBER,
      divisioneAteco,
      titoloDivisione: null,
      voci: [],
      punteggio: null,
      note: [
        divisioneAteco === null
          ? 'ATECO non disponibile: il Cyber Risk si ricava dalla divisione ATECO, e resta non calcolabile.'
          : `La divisione ATECO ${divisioneAteco} non è nella tabella del foglio, che segue la classificazione ` +
            'ATECO 2025: il Cyber Risk resta non calcolabile.',
      ],
    };
  }

  const componenti: readonly (readonly [string, number, number, string])[] = [
    [
      'Dipendenza digitale',
      riga.dipendenzaDigitale,
      PESI_CYBER.dipendenzaDigitale,
      'Quanto l’attività dipende da informatica, sistemi digitali, cloud, sistemi connessi o canali online per continuare a operare.',
    ],
    [
      'Sensibilità dei dati',
      riga.sensibilitaDati,
      PESI_CYBER.sensibilitaDati,
      'Quanto sono sensibili o di valore le informazioni che le imprese del settore trattano di solito.',
    ],
    [
      'Esposizione alle transazioni',
      riga.esposizioneTransazioni,
      PESI_CYBER.esposizioneTransazioni,
      'Quanto l’attività è esposta a pagamenti digitali, transazioni finanziarie, ordini online, bonifici o altre frodi informatiche.',
    ],
    [
      'Attrattività come bersaglio',
      riga.attrattivita,
      PESI_CYBER.attrattivita,
      'Quanto il settore è appetibile o critico per chi attacca, fra interruzione operativa e incentivi, calibrato sui dati ENISA di settore.',
    ],
  ];

  let sommaInCentesimi = 0;
  for (const [, punteggio, peso] of componenti) sommaInCentesimi += punteggio * Math.round(peso * 100);

  return {
    formula: FORMULA_CYBER,
    divisioneAteco,
    titoloDivisione: riga.titolo,
    voci: componenti.map(([voce, punteggio, peso, dettaglio]) => ({
      voce,
      punteggio,
      peso,
      contributo: punteggio * peso,
      dettaglio,
    })),
    punteggio: Math.round(sommaInCentesimi / 10) / 10,
    note: [
      `I quattro punteggi sono quelli che il foglio assegna alla divisione ATECO ${divisioneAteco ?? ''}, ` +
        'con lo stesso arrotondamento a un decimale.',
    ],
  };
}
