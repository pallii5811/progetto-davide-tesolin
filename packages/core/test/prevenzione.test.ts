/**
 * Prevenzione raccomandata.
 *
 * È l'unico trattamento ISO 31000 che riduce il rischio invece di spostarlo, e l'unico che
 * un broker può proporre senza vendere nulla. Il criterio di inclusione è severo per una
 * ragione precisa: una raccomandazione che non sposta il livello è rumore, e il rumore fa
 * ignorare anche quelle che contano.
 */

import { describe, expect, it } from 'vitest';
import { demoCompanyProfile } from '../src/fixtures/demo.js';
import { analyzeCompany } from '../src/assessment/analyze.js';
import { riskLevelRank } from '../src/risk/assessment.js';
import { DATI_DICHIARATI_VUOTI } from '../src/company/profile.js';

const ASOF = new Date('2026-06-15T00:00:00Z');

function analisi() {
  return analyzeCompany(demoCompanyProfile(), [], ASOF);
}

describe('Cosa entra e cosa resta fuori', () => {
  it('produce raccomandazioni su un’azienda reale', () => {
    const a = analisi();
    expect(a.prevenzione.length).toBeGreaterThan(0);
  });

  it('non raccomanda nulla per i rischi già contenuti', () => {
    const a = analisi();

    // Proporre un impianto di spegnimento per abbassare un rischio già basso è il modo
    // più rapido per far smettere un imprenditore di ascoltare.
    for (const r of a.prevenzione) {
      expect(riskLevelRank(r.livelloAttuale), r.etichettaRischio).toBeGreaterThanOrEqual(
        riskLevelRank('rilevante'),
      );
    }
  });

  it('ogni misura sposta davvero il livello', () => {
    for (const r of analisi().prevenzione) {
      expect(r.gradiniGuadagnati, r.misura).toBeGreaterThan(0);
      expect(riskLevelRank(r.livelloConLaMisura)).toBeLessThan(riskLevelRank(r.livelloAttuale));
    }
  });

  it('non ripropone misure già in essere', () => {
    const a = analisi();

    // La fixture dichiara l'impianto antincendio presente: raccomandarlo sarebbe dire al
    // cliente di comprare ciò che ha già.
    const ripetute = a.prevenzione.filter((r) => r.rischio === 'incendio-fabbricati');
    for (const r of ripetute) {
      expect(r.misura).not.toMatch(/impianto di rilevazione e spegnimento/i);
    }
  });
});

describe('Onestà della raccomandazione', () => {
  /*
    Questa prova non verificava niente, in due modi sovrapposti.

    Filtrava le raccomandazioni con `accertataAssente === false` e poi, su ciascuna,
    controllava `typeof === 'boolean'`. Ma sulla fixture quel filtro restituisce **zero**
    elementi: il questionario è compilato, ogni controllo ha un verdetto esplicito, e
    `accertataAssente` vale `true` su tutte e sei le raccomandazioni. Il corpo del ciclo
    non è mai stato eseguito una volta. E se lo fosse stato, avrebbe verificato che un
    campo dichiarato `boolean` nel tipo sia un `boolean`: vero per costruzione.

    La distinzione che il titolo promette ha due stati, e una prova che ne esercita uno
    solo non la sta verificando. Qui si esercitano entrambi.
  */
  it('distingue «non c’è» da «non l’abbiamo chiesto»', () => {
    // Stato 1 — questionario compilato: l'assenza della protezione è **constatata**.
    const conQuestionario = analisi();
    expect(conQuestionario.prevenzione.length).toBeGreaterThan(0);
    for (const r of conQuestionario.prevenzione) {
      expect(r.accertataAssente, `${r.etichettaRischio}: assenza constatata, non ignota`).toBe(true);
    }

    /*
      Stato 2 — prima visita, questionario ancora vuoto.

      È il caso normale, non quello limite: alla prima visita non è stato chiesto ancora
      niente. Lì l'assenza non è constatata, è ignota, e la raccomandazione deve uscire con
      `accertataAssente === false` — «verificare che non ci sia già, prima di proporre di
      comprarlo».
    */
    const primaVisita = analyzeCompany(
      { ...demoCompanyProfile(), datiDichiarati: DATI_DICHIARATI_VUOTI },
      [],
      ASOF,
    );

    expect(
      primaVisita.prevenzione.length,
      'a questionario vuoto il piano di prevenzione esce VUOTO: i controlli su dato ignoto ' +
        'finiscono fra gli «applicati» e non vengono più raccomandati. È la prima visita, ' +
        'cioè esattamente quando il piano serve.',
    ).toBeGreaterThan(0);

    for (const r of primaVisita.prevenzione) {
      expect(r.accertataAssente, `${r.etichettaRischio}: assenza ignota, non constatata`).toBe(false);
    }
  });

  it('la misura è scritta come si propone, non come si constata', () => {
    for (const r of analisi().prevenzione) {
      // Il `rationale` dice «dichiarato presente»; la misura dice cosa fare.
      expect(r.misura, r.etichettaRischio).toMatch(/^(Installare|Adottare|Certificare)/);
      expect(r.misura.length).toBeGreaterThan(60);
    }
  });
});

describe('Ordinamento', () => {
  it('mette per prima la misura che rende di più', () => {
    const prevenzione = analisi().prevenzione;
    const guadagni = prevenzione.map((r) => r.gradiniGuadagnati);

    expect([...guadagni].sort((a, b) => b - a)).toEqual(guadagni);
  });

  it('è deterministico: due analisi danno lo stesso piano', () => {
    const prima = analisi().prevenzione.map((r) => `${r.rischio}|${r.misura}`);
    const seconda = analisi().prevenzione.map((r) => `${r.rischio}|${r.misura}`);

    // Un piano che cambia ordine a ogni esecuzione rende impossibile il confronto storico.
    expect(seconda).toEqual(prima);
  });
});

describe('Coerenza con il motore dei rischi', () => {
  it('il livello con la misura è calcolato con la stessa scala del motore', () => {
    const a = analisi();

    for (const r of a.prevenzione) {
      const rischio = a.rischi.risks.find((x) => x.definition.id === r.rischio);
      expect(rischio, r.rischio).toBeDefined();
      // Il livello di partenza è quello residuo del motore, non un ricalcolo parallelo:
      // due implementazioni della stessa scala divergerebbero, e a divergere sarebbe il
      // numero che si mette per iscritto al cliente.
      expect(r.livelloAttuale).toBe(rischio?.residualLevel);
    }
  });
});
