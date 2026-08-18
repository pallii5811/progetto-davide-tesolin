/**
 * Prevenzione raccomandata: le misure che abbasserebbero il rischio, e di quanto.
 *
 * Il motore già tiene conto dei controlli **presenti**, riducendo il rischio residuo. Ma
 * constatare l'assenza di una protezione non è consigliare di installarla: il broker che si
 * limita a proporre una polizza più cara sta vendendo, quello che dice «con questo impianto
 * il rischio scende da alto a moderato, e il premio con lui» sta facendo consulenza.
 *
 * È anche l'unico trattamento ISO 31000 che **riduce il rischio invece di spostarlo**.
 * Trasferire costa un premio ogni anno; ridurre costa una volta sola e resta.
 *
 * Una precisazione che il modello non nasconde: la stima dell'effetto è quella del motore,
 * non una quotazione. Dice di quanto scende il rischio, non di quanto scende il premio —
 * quello lo dice la compagnia, e prometterlo al posto suo sarebbe una promessa altrui.
 */

import { riskLevel, riskLevelRank, riskScore } from './assessment.js';
import type { RiskLevel } from './assessment.js';
import type { AssessedRisk } from './engine.js';
import { RISK_RULES } from './rules.js';
import type { ControlRule } from './rules.js';
import type { CompanyFacts } from '../company/facts.js';

export interface RaccomandazioneDiPrevenzione {
  readonly rischio: string;
  readonly etichettaRischio: string;
  /** La misura, scritta come la si propone a un imprenditore. */
  readonly misura: string;
  readonly livelloAttuale: RiskLevel;
  readonly livelloConLaMisura: RiskLevel;
  /** Quanti gradini di gravità si guadagnano: ordina le raccomandazioni. */
  readonly gradiniGuadagnati: number;
  /**
   * `false` quando la protezione non è stata dichiarata assente ma semplicemente non è
   * stata chiesta: prima di raccomandarla conviene verificarla.
   */
  readonly accertataAssente: boolean;
}

/**
 * Le misure che varrebbe la pena mettere, ordinate per quanto rendono.
 *
 * Si raccomandano solo se il rischio residuo è **almeno rilevante**: proporre un impianto
 * di spegnimento per abbassare un rischio già basso è il modo più rapido per far smettere
 * un imprenditore di ascoltare.
 */
export function raccomandaPrevenzione(
  rischi: readonly AssessedRisk[],
  facts: CompanyFacts,
): readonly RaccomandazioneDiPrevenzione[] {
  const raccomandazioni: RaccomandazioneDiPrevenzione[] = [];

  for (const rischio of rischi) {
    if (riskLevelRank(rischio.residualLevel) < riskLevelRank('rilevante')) continue;

    const applicati = new Set(rischio.controlRules.map((r) => r.ruleId));

    for (const regola of controlliPer(rischio.definition.id)) {
      if (applicati.has(regola.id)) continue;

      // Se il controllo risulta già presente ma non ha inciso, non c'è nulla da proporre.
      const verdetto = regola.when(facts);
      if (verdetto === true) continue;

      const conLaMisura = livelloConControllo(rischio, regola);
      const gradini = riskLevelRank(rischio.residualLevel) - riskLevelRank(conLaMisura);

      // Una misura che non sposta il livello non merita una riga nel documento: sarebbe
      // rumore, e il rumore fa ignorare anche le raccomandazioni che contano.
      if (gradini <= 0) continue;

      raccomandazioni.push({
        rischio: rischio.definition.id,
        etichettaRischio: rischio.definition.label,
        misura: regola.misura,
        livelloAttuale: rischio.residualLevel,
        livelloConLaMisura: conLaMisura,
        gradiniGuadagnati: gradini,
        accertataAssente: verdetto === false,
      });
    }
  }

  // Prima ciò che rende di più; a parità, prima i rischi già più gravi. L'ordinamento è
  // totale e deterministico: due analisi della stessa azienda devono dare lo stesso piano.
  return raccomandazioni.sort((a, b) => {
    if (a.gradiniGuadagnati !== b.gradiniGuadagnati) return b.gradiniGuadagnati - a.gradiniGuadagnati;
    const livelloA = riskLevelRank(a.livelloAttuale);
    const livelloB = riskLevelRank(b.livelloAttuale);
    if (livelloA !== livelloB) return livelloB - livelloA;
    return a.etichettaRischio.localeCompare(b.etichettaRischio, 'it');
  });
}

function controlliPer(riskId: string): readonly ControlRule[] {
  return RISK_RULES.filter((r): r is ControlRule => r.kind === 'controllo' && r.risk === riskId);
}

/**
 * Il livello che il rischio avrebbe con quella misura in più.
 *
 * Si ricalcola con le stesse funzioni del motore, non con una tabella parallela: una
 * seconda implementazione della stessa scala divergerebbe, e a divergere sarebbe proprio
 * il numero che si mette per iscritto al cliente.
 */
function livelloConControllo(rischio: AssessedRisk, regola: ControlRule): RiskLevel {
  const probabilita = clamp(rischio.residualLikelihood + (regola.likelihood ?? 0));
  const impatto = clamp(rischio.residualImpact + (regola.impact ?? 0));
  return riskLevel(riskScore(probabilita as never, impatto as never));
}

/** La scala è 1-5 in entrambe le dimensioni. */
function clamp(valore: number): number {
  return Math.max(1, Math.min(5, valore));
}
