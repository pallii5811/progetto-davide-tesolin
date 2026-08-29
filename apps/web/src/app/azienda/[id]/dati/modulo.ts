/**
 * Dal dossier al modulo, e viceversa.
 *
 * Vive in un file suo perché lo **stesso questionario ha due porte**: quella
 * dell'intermediario e quella del cliente che riceve il collegamento. Due copie di questa
 * mappatura divergerebbero al primo campo aggiunto, e a divergere sarebbe ciò che una
 * delle due parti vede — cioè un questionario che chiede cose diverse a seconda di chi lo
 * apre.
 */

import type { DatiForm, ImmobileForm, PolizzaForm } from './EditorDossier';

const BILANCIO_VUOTO = {
  anno: null,
  rimanenzeEuro: null,
  creditiVersoClientiEuro: null,
  impiantiEAttrezzatureEuro: null,
  impiantiAlCostoStorico: null,
  costiMateriePrimeEuro: null,
  costiServiziEuro: null,
} as const;

export const DATI_VUOTI: DatiForm = {
  bilancio: { ...BILANCIO_VUOTO },
  immobili: [],
  numeroVeicoli: null,
  numeroDipendenti: null,
  quotaExportPercentuale: null,
  esportaVersoUsaCanada: null,
  trattaDatiPersonali: null,
  trattaDatiParticolari: null,
  haSitoEcommerce: null,
  haModello231: null,
  certificazioni: [],
  concentrazionePrimoCliente: null,
  lavoraInCantiere: null,
  produceBeniFinali: null,
  trasportaMerciProprie: null,
  periodoIndennizzoMesi: null,
  propensioneAlRischio: null,
};

const PROPENSIONI_VALIDE = ['prudente', 'equilibrata', 'incline-a-ritenere'] as const;

const TITOLI_VALIDI = ['proprieta', 'locazione', 'comodato', 'leasing', 'misto'] as const;
const TIPOLOGIE_VALIDE = [
  'muratura',
  'cemento-armato',
  'prefabbricato',
  'acciaio',
  'legno',
  'misto',
] as const;

/**
 * Precompila il modulo con quanto già noto.
 *
 * I dati salvati prevalgono; in loro assenza si usa ciò che l'analisi ha già dedotto, così
 * che si confermi invece di ridigitare. `addettiNoti` è `null` sul percorso del cliente,
 * che l'analisi non la vede.
 */
export function unisciDati(salvati: Record<string, unknown> | null, addettiNoti: number | null): DatiForm {
  const base: DatiForm = { ...DATI_VUOTI, numeroDipendenti: addettiNoti };

  if (salvati === null) return base;

  const immobili = Array.isArray(salvati['immobili'])
    ? (salvati['immobili'] as Record<string, unknown>[]).map((i): ImmobileForm => ({
        descrizione: testoOrVuoto(i['descrizione']),
        superficieMq: numeroOrNull(i['superficieMq']),
        titolo: unoDi(i['titolo'], TITOLI_VALIDI) ?? 'proprieta',
        tipologiaCostruttiva: unoDi(i['tipologiaCostruttiva'], TIPOLOGIE_VALIDE),
        annoCostruzione: numeroOrNull(i['annoCostruzione']),
        presenzaImpiantoAntincendio: booleanOrNull(i['presenzaImpiantoAntincendio']),
        presenzaAllarme: booleanOrNull(i['presenzaAllarme']),
        /*
          Le due protezioni che il modulo non chiedeva.

          Non era solo una domanda mancante: `unisciDati` ricostruisce il dossier da un
          elenco chiuso di chiavi, quindi un valore arrivato per altra via veniva
          **cancellato** al primo salvataggio dal modulo. Aggiungerle qui chiude anche
          quella perdita.
        */
        compartimentazioneRei: booleanOrNull(i['compartimentazioneRei']),
        impiantoSprinkler: booleanOrNull(i['impiantoSprinkler']),
      }))
    : [];

  /*
    Le voci di bilancio, dai centesimi dell'archivio agli euro del modulo.

    Come per le polizze: il dominio conserva centesimi, il modulo mostra euro. Un campo
    non compilato resta `null` e non diventa zero — uno zero sulle rimanenze produrrebbe
    «attività senza magazzino» su un'impresa che il magazzino ce l'ha.
  */
  const bilancioSalvato =
    typeof salvati['bilancio'] === 'object' && salvati['bilancio'] !== null
      ? (salvati['bilancio'] as Record<string, unknown>)
      : {};
  const inEuro = (v: unknown): number | null => {
    const centesimi = numeroOrNull(v);
    return centesimi === null ? null : centesimi / 100;
  };

  return {
    ...base,
    bilancio: {
      anno: numeroOrNull(bilancioSalvato['anno']),
      rimanenzeEuro: inEuro(bilancioSalvato['rimanenze']),
      creditiVersoClientiEuro: inEuro(bilancioSalvato['creditiVersoClienti']),
      impiantiEAttrezzatureEuro: inEuro(bilancioSalvato['impiantiEAttrezzature']),
      impiantiAlCostoStorico: booleanOrNull(bilancioSalvato['impiantiAlCostoStorico']),
      costiMateriePrimeEuro: inEuro(bilancioSalvato['costiMateriePrime']),
      costiServiziEuro: inEuro(bilancioSalvato['costiServizi']),
    },
    immobili,
    numeroVeicoli: numeroOrNull(salvati['numeroVeicoli']) ?? base.numeroVeicoli,
    numeroDipendenti: numeroOrNull(salvati['numeroDipendenti']) ?? base.numeroDipendenti,
    quotaExportPercentuale: numeroOrNull(salvati['quotaExportPercentuale']),
    esportaVersoUsaCanada: booleanOrNull(salvati['esportaVersoUsaCanada']),
    trattaDatiPersonali: booleanOrNull(salvati['trattaDatiPersonali']),
    trattaDatiParticolari: booleanOrNull(salvati['trattaDatiParticolari']),
    haSitoEcommerce: booleanOrNull(salvati['haSitoEcommerce']),
    haModello231: booleanOrNull(salvati['haModello231']),
    certificazioni: Array.isArray(salvati['certificazioni']) ? (salvati['certificazioni'] as string[]) : [],
    concentrazionePrimoCliente: numeroOrNull(salvati['concentrazionePrimoCliente']),
    lavoraInCantiere: booleanOrNull(salvati['lavoraInCantiere']),
    produceBeniFinali: booleanOrNull(salvati['produceBeniFinali']),
    trasportaMerciProprie: booleanOrNull(salvati['trasportaMerciProprie']),
    periodoIndennizzoMesi: numeroOrNull(salvati['periodoIndennizzoMesi']),
    propensioneAlRischio: unoDi(salvati['propensioneAlRischio'], PROPENSIONI_VALIDE),
  };
}

/** Gli importi arrivano dal dominio in centesimi e vanno mostrati in euro. */
export function convertiPolizze(
  polizze: readonly {
    id: string;
    coverage: string;
    compagnia: string;
    numeroPolizza: string | null;
    sommaAssicurata: number | null;
    massimale: number | null;
    franchigia: number | null;
    premioAnnuo: number | null;
    dataEffetto: string;
    dataScadenza: string;
    formaGaranzia: string | null;
  }[],
): PolizzaForm[] {
  return polizze.map((p) => ({
    id: p.id,
    coverage: p.coverage,
    compagnia: p.compagnia,
    numeroPolizza: p.numeroPolizza,
    sommaAssicurataEuro: p.sommaAssicurata === null ? null : p.sommaAssicurata / 100,
    massimaleEuro: p.massimale === null ? null : p.massimale / 100,
    franchigiaEuro: p.franchigia === null ? null : p.franchigia / 100,
    premioAnnuoEuro: p.premioAnnuo === null ? null : p.premioAnnuo / 100,
    dataEffetto: p.dataEffetto.slice(0, 10),
    dataScadenza: p.dataScadenza.slice(0, 10),
    formaGaranzia: p.formaGaranzia as PolizzaForm['formaGaranzia'],
  }));
}

/**
 * Verifica invece di asserire.
 *
 * Il dossier arriva come JSON: un `as` direbbe al compilatore «fidati», e un valore
 * legacy o corrotto entrerebbe nel modulo producendo un menu a tendina vuoto senza che
 * nessuno se ne accorga. Qui un valore non riconosciuto diventa `null`, cioè «da rilevare».
 */
function unoDi<T extends string>(valore: unknown, ammessi: readonly T[]): T | null {
  return typeof valore === 'string' && (ammessi as readonly string[]).includes(valore)
    ? (valore as T)
    : null;
}

function testoOrVuoto(valore: unknown): string {
  return typeof valore === 'string' ? valore : '';
}

function numeroOrNull(valore: unknown): number | null {
  return typeof valore === 'number' && Number.isFinite(valore) ? valore : null;
}

function booleanOrNull(valore: unknown): boolean | null {
  return typeof valore === 'boolean' ? valore : null;
}
