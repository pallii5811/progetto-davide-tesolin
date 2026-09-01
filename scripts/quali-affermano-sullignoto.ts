/**
 * Quali regole affermano all'indicativo un fatto che nessuno ha verificato.
 *
 * Sulla scheda di COMINOTTI — fabbricante di serrature — si leggeva:
 *
 *   «Lavorazioni in cantiere: settore a più elevata incidenza infortunistica. (da verificare)»
 *   «Canale e-commerce attivo: superficie di attacco esposta su internet. (da verificare)»
 *   «Gli immobili sono di proprietà: il danno colpisce il patrimonio aziendale. (da verificare)»
 *   «Oltre il 40% del fatturato su un solo cliente. (da verificare)»
 *
 * Nessuno di questi fatti è stato rilevato. Il motore lo sa — mette `suDatoIgnoto` e
 * azzera i delta — ma la frase resta scritta al presente indicativo, come se il fatto
 * fosse accertato, e la riserva arriva in coda fra parentesi.
 *
 * Un intermediario che legge quella riga al telefono dice a un fabbricante di serrature
 * che lavora in cantiere. La parentesi non lo salva: è arrivata dopo l'affermazione.
 *
 * Questo script conta il fenomeno invece di stimarlo: valuta ogni regola su un'impresa di
 * cui non si sa nulla, e stampa quelle che si accendono in forma ignota.
 */

import { RISK_RULES, risolviRationale } from '../packages/core/src/risk/rules.js';
import type { CompanyFacts } from '../packages/core/src/company/facts.js';

/** Un'impresa di cui si conosce solo ciò che il registro dà sempre. */
const IGNOTA = {
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

const ignote = RISK_RULES.filter((r) => {
  try {
    return r.when(IGNOTA) === 'ignoto';
  } catch {
    return false;
  }
});

console.log(`\nRegole totali: ${RISK_RULES.length}`);
console.log(`Che si accendono su un fatto NON rilevato: ${ignote.length}\n`);

for (const r of ignote) {
  const testo = risolviRationale(r.rationale, IGNOTA);
  const gia = 'rationaleSeIgnoto' in r && r.rationaleSeIgnoto !== undefined;
  console.log(`${gia ? '✔' : '✗'} ${r.id}`);
  console.log(`   ${testo}`);
}

const senza = ignote.filter((r) => !('rationaleSeIgnoto' in r && r.rationaleSeIgnoto !== undefined));
console.log(`\nSenza formulazione condizionale: ${senza.length} su ${ignote.length}`);
process.exit(0);
