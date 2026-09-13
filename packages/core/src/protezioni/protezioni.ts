/**
 * Le tre protezioni del foglio «Veezco_Analisi Rischio.xlsx»: Property, Business Interruption
 * e Cyber Risk. La quarta del foglio, Liability, vi è segnata «pending» e non entra.
 *
 * Qui si raccolgono soltanto i dati dell'impresa e si passano ai tre calcoli: ciascuno sta nel
 * suo modulo, con la formula, e nessuno ha regole proprie oltre a quelle del foglio.
 */

import type { CompanyFacts } from '../company/facts.js';
import type { AnalisiUbicazioni } from '../company/ubicazioni.js';
import { calcolaBusinessInterruption } from './business-interruption.js';
import type { BusinessInterruption } from './business-interruption.js';
import { calcolaCyberRisk } from './cyber-risk.js';
import type { CyberRisk } from './cyber-risk.js';
import { calcolaPropertyRisk } from './property-risk.js';
import type { PropertyRisk } from './property-risk.js';
import { FOGLIO_VEEZCO } from './tabelle-veezco.js';

export interface Protezioni {
  readonly fonte: string;
  readonly property: PropertyRisk;
  readonly businessInterruption: BusinessInterruption;
  readonly cyber: CyberRisk;
}

export function calcolaProtezioni(facts: CompanyFacts, ubicazioni: AnalisiUbicazioni): Protezioni {
  const property = calcolaPropertyRisk(
    facts.atecoDivisione,
    ubicazioni.ubicazioni.map((u) => ({
      id: u.id,
      etichetta: u.etichetta,
      tipo: u.tipo,
      sismica: u.esposizione.sismica,
      idraulica: u.esposizione.idraulica,
      frane: u.esposizione.frane ?? null,
    })),
  );

  return {
    fonte: FOGLIO_VEEZCO,
    property,
    businessInterruption: calcolaBusinessInterruption(
      property,
      facts.margineDiContribuzione,
      facts.fatturato,
    ),
    cyber: calcolaCyberRisk(facts.atecoDivisione),
  };
}
