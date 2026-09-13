import type { CompanyFacts } from './facts.js';
import { atecoStartsWith } from '../shared/identifiers.js';

/**
 * Se l'impresa fa trasporto su strada, di merci o di persone.
 *
 * TRANSPECIAL S.R.L., 49.41 «Trasporto di merci su strada», dodici dipendenti di cui l'83 %
 * operai: il piano d'azione non conteneva l'RCA. Il rischio «sinistrosità del parco veicoli»
 * partiva da probabilità 4 e impatto 2, restava «moderato» perché il numero di veicoli non era
 * stato rilevato, e un rischio moderato si riduce e non si trasferisce: la copertura
 * obbligatoria dello strumento stesso dell'attività non entrava fra quelle proposte.
 *
 * Gruppi 49.31, 49.32, 49.39 (persone) e 49.41, 49.42 (merci e traslochi), primario o
 * secondario. `null` se l'ATECO non è noto.
 */
const GRUPPI = ['49.31', '49.32', '49.39', '49.41', '49.42'] as const;

export function trasportoSuStrada(facts: CompanyFacts): boolean | null {
  if (facts.ateco === null) return null;
  return [facts.ateco, ...facts.atecoSecondari].some((codice) =>
    GRUPPI.some((g) => atecoStartsWith(codice, g)),
  );
}
