import { describe, expect, it } from 'vitest';
import { RISK_RULES, risolviRationale } from '../src/risk/rules.js';
import { assessRisks } from '../src/risk/engine.js';
import type { CompanyFacts } from '../src/company/facts.js';

/**
 * Una regola non afferma ciò che nessuno ha verificato.
 *
 * IL RECLAMO, letto sulla scheda di un fabbricante di serrature che in cantiere non ci
 * mette piede:
 *
 *   «Lavorazioni in cantiere: settore a più elevata incidenza infortunistica. (da verificare)»
 *   «Canale e-commerce attivo: superficie di attacco esposta su internet. (da verificare)»
 *   «Gli immobili sono di proprietà: il danno colpisce il patrimonio aziendale. (da verificare)»
 *   «Oltre il 40% del fatturato su un solo cliente. (da verificare)»
 *
 * Nessuno di quei fatti era stato rilevato. Il motore lo sapeva — marcava `suDatoIgnoto` e
 * azzerava i delta — ma la frase restava al presente indicativo e la riserva arrivava in
 * coda, fra parentesi.
 *
 * **La parentesi non salva la frase.** Arriva dopo l'affermazione, e l'intermediario che
 * legge quella riga al telefono l'ha già pronunciata: ha appena detto a un fabbricante di
 * serrature che lavora in cantiere. Da lì in poi tutto il resto del documento vale meno,
 * comprese le righe esatte — che sono la maggioranza.
 *
 * Misurato prima della correzione con `scripts/quali-affermano-sullignoto.ts`: **32 regole
 * su 68** si accendono su un fatto non rilevato, e tutte e 32 lo affermavano.
 */

/*
  IL PROFILO SU CUI SI MISURA, e perché questo e non un altro.

  È la forma che la produzione produce sempre: il registro ha risposto — denominazione,
  forma giuridica, ATECO, addetti, anzianità — e l'intervista non è stata compilata. È lo
  stato in cui si trova ogni impresa appena cercata, cioè quello in cui l'intermediario
  guarda la scheda per la prima volta e decide se fidarsi.

  Non si azzera anche l'ATECO: verrebbero ignote altre trenta regole che in produzione non
  lo sono mai, perché il codice arriva dal registro insieme al nome. Farle passare da qui
  sarebbe lavoro su un percorso che non gira.
*/
const REGISTRO_SENZA_INTERVISTA = {
  denominazione: 'IMPRESA DI PROVA S.R.L.',
  formaGiuridica: 'srl',
  statoAttivita: 'attiva',
  responsabilitaIllimitata: false,
  proceduraAperta: false,
  anniDiAttivita: 30,
  ateco: null,
  atecoSezione: 'C',
  atecoDivisione: '25',
  atecoSecondari: [],
  dimensione: 'piccola',
  addetti: 18,
  fatturato: null,
  totaleAttivo: null,
  patrimonioNetto: null,
  ebitda: null,
  margineDiContribuzione: null,
  costoDelPersonale: null,
  creditiVersoClienti: null,
  rimanenze: null,
  valoreImmobiliNetto: null,
  valoreImpiantiNetto: null,
  valoreAttrezzatureNetto: null,
  costoStoricoImmobilizzazioni: null,
  superficieTotaleMq: null,
  possiedeImmobili: null,
  numeroUnitaLocali: null,
  provinceOperative: [],
  haImpiantoAntincendio: null,
  haAllarme: null,
  certificazioni: [],
  numeroVeicoli: null,
  haDipendenti: true,
  quotaExport: null,
  esportaUsaCanada: null,
  esportatore: null,
  paesiExportArchivio: null,
  trattaDatiPersonali: null,
  trattaDatiParticolari: null,
  haEcommerce: null,
  haModello231: null,
  lavoraInCantiere: null,
  produceBeniFinali: null,
  trasportaMerciProprie: null,
  concentrazionePrimoCliente: null,
  numeroAmministratori: 2,
  numeroSoci: 2,
  haSociPersonaGiuridica: false,
  appartieneAGruppo: false,
  esercitaDirezioneECoordinamento: false,
  soggettaADirezioneECoordinamento: false,
  quotaSocioDiControllo: null,
} as unknown as CompanyFacts;

const QUANDO = new Date('2026-09-01T00:00:00Z');

const siAccendonoSullIgnoto = RISK_RULES.filter((r) => {
  try {
    return r.when(REGISTRO_SENZA_INTERVISTA) === 'ignoto';
  } catch {
    return false;
  }
});

describe('Nessuna regola afferma un fatto che nessuno ha verificato', () => {
  it('ce ne sono, e sono tante: la prova non gira a vuoto', () => {
    // Se un domani il profilo qui sopra smettesse di produrre regole ignote — un campo
    // riempito per sbaglio, un predicato cambiato — le prove sotto diventerebbero verdi
    // senza guardare niente. È il modo in cui un presidio muore restando in piedi.
    expect(siAccendonoSullIgnoto.length).toBeGreaterThan(20);
  });

  it('ognuna porta la sua formulazione condizionale, o è un controllo che il motore scarta', () => {
    const senza = siAccendonoSullIgnoto
      .filter((r) => r.kind !== 'controllo')
      .filter((r) => !('rationaleSeIgnoto' in r) || r.rationaleSeIgnoto === undefined)
      .map((r) => r.id);

    expect(senza, senza.join(' · ')).toEqual([]);
  });

  /*
    L'esenzione dei controlli non si concede sulla fiducia: si dimostra.

    `assessRisks` scarta la regola di controllo quando il verdetto è ignoto, prima di
    applicarla — un controllo su dato ignoto non è un controllo in essere. Se quella riga
    sparisse, nove protezioni mai dichiarate tornerebbero sulla scheda precedute da
    «controllo in essere:», e la prova qui sopra le lascerebbe passare.
  */
  it('e l’esenzione dei controlli è vera: il motore non ne applica nessuno su dato ignoto', () => {
    const controlliIgnoti = siAccendonoSullIgnoto.filter((r) => r.kind === 'controllo');
    expect(
      controlliIgnoti.length,
      'ce ne devono essere, altrimenti non si sta provando nulla',
    ).toBeGreaterThan(0);

    const analisi = assessRisks(REGISTRO_SENZA_INTERVISTA, QUANDO);
    const applicati = analisi.risks.flatMap((r) => r.controlRules);

    expect(applicati.filter((c) => c.suDatoIgnoto)).toEqual([]);
  });

  /*
    Il ripiego con la parentesi resta nel motore per le regole che non hanno ancora la
    loro forma condizionale: dichiarare la riserva tardi è meno peggio che non dichiararla.
    Ma su questo profilo non deve accendersi mai — se si accende, una regola nuova è
    entrata senza la sua forma condizionale e la prova sopra l'ha mancata.
  */
  it('sulla scheda non compare nessuna riserva appiccicata in coda', () => {
    const analisi = assessRisks(REGISTRO_SENZA_INTERVISTA, QUANDO);
    const frasi = analisi.risks.flatMap((r) => [
      ...r.identificationRules,
      ...r.modulationRules,
      ...r.controlRules,
    ]);

    const conParentesi = frasi
      .filter((f) => /\((da verificare|dato da confermare)\)/.test(f.rationale))
      .map((f) => `${f.ruleId}: ${f.rationale}`);

    expect(conParentesi, conParentesi.join(' · ')).toEqual([]);
  });

  /*
    E la forma condizionale dev'essere davvero un'altra frase, non la stessa ricopiata.

    Senza questa prova la correzione si potrebbe soddisfare incollando il testo
    all'indicativo dentro il campo nuovo: il presidio sopra diventerebbe verde e la scheda
    direbbe esattamente quello che diceva prima.
  */
  it('la forma condizionale non è l’indicativo ricopiato', () => {
    const uguali = siAccendonoSullIgnoto
      .filter((r) => r.kind !== 'controllo')
      .filter((r) => {
        const seIgnoto = 'rationaleSeIgnoto' in r ? r.rationaleSeIgnoto : undefined;
        if (seIgnoto === undefined) return false;
        return (
          risolviRationale(seIgnoto, REGISTRO_SENZA_INTERVISTA) ===
          risolviRationale(r.rationale, REGISTRO_SENZA_INTERVISTA)
        );
      })
      .map((r) => r.id);

    expect(uguali, uguali.join(' · ')).toEqual([]);
  });

  /*
    Le tre righe da cui è nato tutto, verificate una per una sul motore.

    Non sostituiscono i controlli sopra — che valgono per ogni regola, anche quelle che
    verranno — ma sono l'unico modo di provare che il reclamo è stato chiuso davvero e non
    solo strutturalmente.
  */
  it('le frasi del reclamo non escono più al presente indicativo', () => {
    const analisi = assessRisks(REGISTRO_SENZA_INTERVISTA, QUANDO);
    const tutte = analisi.risks
      .flatMap((r) => [...r.identificationRules, ...r.modulationRules])
      .map((r) => r.rationale)
      .join(' ');

    expect(tutte).not.toContain('Lavorazioni in cantiere:');
    expect(tutte).not.toContain('Canale e-commerce attivo:');
    expect(tutte).not.toContain('Gli immobili sono di proprietà:');
    expect(tutte).not.toContain('Oltre il 40% del fatturato su un solo cliente');

    // E ciò che le sostituisce dice la stessa cosa, al condizionale e con la fonte.
    expect(tutte).toContain('Da accertare se l’impresa svolge lavorazioni in cantiere');
    expect(tutte).toContain('Da accertare se esiste un canale e-commerce');
    expect(tutte).toContain('Il titolo di godimento degli immobili non è stato rilevato');
  });
});
