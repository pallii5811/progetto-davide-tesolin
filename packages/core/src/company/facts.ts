/**
 * Fatti aziendali — la vista piatta su cui ragiona il motore delle regole.
 *
 * Le regole di rischio non devono conoscere la struttura del profilo, i bilanci o le
 * sezioni del provider: devono poter chiedere «questa azienda ha dipendenti?»,
 * «tratta dati personali?», «quanti metri quadri di fabbricati?».
 *
 * Ogni fatto è `null` quando è ignoto. La distinzione fra «no» e «non lo so» è
 * fondamentale: un rischio non si esclude perché manca il dato, si segnala come
 * *da verificare*.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import type { AtecoCode } from '../shared/identifiers.js';
import { atecoDivision, atecoSection } from '../shared/identifiers.js';
import type { BilancioRiclassificato } from './financials.js';
import type { CompanyProfile, FormaGiuridica, Socio, StatoAttivita } from './profile.js';
import { FORME_A_RESPONSABILITA_ILLIMITATA, anniDiAttivita, haProceduraAperta } from './profile.js';
import type { CompanySize } from './size.js';
import { classifySize } from './size.js';

export interface CompanyFacts {
  // Identità e stato
  readonly denominazione: string;
  readonly formaGiuridica: FormaGiuridica;
  readonly statoAttivita: StatoAttivita;
  readonly responsabilitaIllimitata: boolean;
  readonly proceduraAperta: boolean;
  readonly anniDiAttivita: number | null;

  // Attività
  readonly ateco: AtecoCode | null;
  readonly atecoSezione: string | null;
  readonly atecoDivisione: string | null;
  readonly atecoSecondari: readonly AtecoCode[];

  // Dimensione
  readonly dimensione: CompanySize;
  readonly addetti: number | null;
  readonly fatturato: Euro | null;
  readonly totaleAttivo: Euro | null;
  readonly patrimonioNetto: Euro | null;
  readonly ebitda: Euro | null;
  readonly margineDiContribuzione: Euro | null;
  readonly costoDelPersonale: Euro | null;
  readonly creditiVersoClienti: Euro | null;
  readonly rimanenze: Euro | null;

  // Patrimonio fisico
  readonly valoreImmobiliNetto: Euro | null;
  readonly valoreImpiantiNetto: Euro | null;
  readonly valoreAttrezzatureNetto: Euro | null;
  readonly costoStoricoImmobilizzazioni: Euro | null;
  readonly superficieTotaleMq: number | null;
  readonly possiedeImmobili: boolean | null;
  readonly numeroUnitaLocali: number | null;
  readonly provinceOperative: readonly string[];
  /** Misure di protezione dichiarate: `null` se il questionario non è stato compilato. */
  readonly haImpiantoAntincendio: boolean | null;
  readonly haAllarme: boolean | null;
  readonly certificazioni: readonly string[];

  // Esposizioni dichiarate
  readonly numeroVeicoli: number | null;
  readonly haDipendenti: boolean | null;
  readonly quotaExport: number | null;
  readonly esportaUsaCanada: boolean | null;
  readonly trattaDatiPersonali: boolean | null;
  readonly trattaDatiParticolari: boolean | null;
  readonly haEcommerce: boolean | null;
  readonly haModello231: boolean | null;
  readonly lavoraInCantiere: boolean | null;
  readonly produceBeniFinali: boolean | null;
  readonly trasportaMerciProprie: boolean | null;
  readonly concentrazionePrimoCliente: number | null;

  // Governance
  readonly numeroAmministratori: number;
  readonly numeroSoci: number;
  readonly haSociPersonaGiuridica: boolean;
  /**
   * Appartenenza a un gruppo.
   *
   * Non basta guardare `controllante` e `controllate`: l'anagrafica camerale non
   * dichiara quasi mai una capogruppo in modo esplicito, ma **elenca i soci**. Una
   * società che possiede la maggioranza delle quote è la capogruppo, che lo dica un
   * campo dedicato o no — ed è il presupposto della responsabilità da direzione e
   * coordinamento. Dedurlo dal solo campo esplicito lasciava fuori praticamente
   * tutte le controllate reali.
   */
  readonly appartieneAGruppo: boolean;
  /** Quota del socio di controllo, se dichiarata. */
  readonly quotaSocioDiControllo: number | null;
}

export function deriveFacts(
  profile: CompanyProfile,
  bilancio: BilancioRiclassificato | null,
  asOf: Date,
): CompanyFacts {
  const a = profile.anagrafica.value;
  const dichiarati = profile.datiDichiarati;
  const assetti = profile.assetti?.value ?? null;
  const unitaLocali = profile.unitaLocali?.value ?? null;

  // Gerarchia delle fonti: bilancio dettagliato → bilancio sintetico → anagrafica.
  // I dati di intervista prevalgono sempre sul numero di addetti, perché il broker
  // conosce la situazione odierna mentre il bilancio fotografa il 31 dicembre.
  const sintetico = profile.bilanciSintetici[0]?.value ?? null;

  const fatturato = bilancio?.ce.ricavi ?? sintetico?.fatturato ?? a.fatturatoDichiarato ?? null;
  const addetti =
    dichiarati.numeroDipendenti ??
    bilancio?.numeroDipendenti ??
    sintetico?.dipendenti ??
    a.numeroAddetti ??
    null;
  const totaleAttivo = bilancio?.sp.totaleAttivo ?? sintetico?.totaleAttivo ?? null;

  const dimensione = classifySize({ addetti, fatturato, totaleAttivo }).value;

  const superficieTotaleMq = sommaSuperfici(dichiarati.immobili.map((i) => i.superficieMq));
  const possiedeImmobili = derivePossiedeImmobili(profile, bilancio);

  const province = new Set<string>();
  if (a.sedeLegale !== null) province.add(a.sedeLegale.provincia);
  for (const u of unitaLocali ?? []) province.add(u.indirizzo.provincia);
  for (const i of dichiarati.immobili) {
    if (i.indirizzo !== null) province.add(i.indirizzo.provincia);
  }

  const veicoliDaBilancio = null; // il bilancio non isola i veicoli: resta un dato dichiarato

  return {
    denominazione: profile.identity.denominazione,
    formaGiuridica: a.formaGiuridica,
    statoAttivita: a.statoAttivita,
    responsabilitaIllimitata: FORME_A_RESPONSABILITA_ILLIMITATA.includes(a.formaGiuridica),
    proceduraAperta: haProceduraAperta(profile),
    anniDiAttivita: anniDiAttivita(profile, asOf),

    ateco: a.atecoPrimario,
    atecoSezione: a.atecoPrimario === null ? null : atecoSection(a.atecoPrimario),
    atecoDivisione: a.atecoPrimario === null ? null : atecoDivision(a.atecoPrimario),
    atecoSecondari: a.atecoSecondari,

    dimensione,
    addetti,
    fatturato,
    totaleAttivo,
    patrimonioNetto: bilancio?.sp.patrimonioNetto ?? sintetico?.patrimonioNetto ?? null,
    ebitda: bilancio?.ce.ebitda ?? null,
    margineDiContribuzione: bilancio?.ce.margineDiContribuzione ?? null,
    costoDelPersonale: bilancio?.ce.costoDelPersonale ?? sintetico?.costoDelPersonale ?? null,
    creditiVersoClienti: bilancio?.origine.attivo.creditiVersoClienti ?? null,
    rimanenze: bilancio?.sp.rimanenze ?? null,

    valoreImmobiliNetto: bilancio?.origine.attivo.terreniEFabbricati ?? null,
    valoreImpiantiNetto: bilancio?.origine.attivo.impiantiEMacchinario ?? null,
    valoreAttrezzatureNetto: bilancio?.origine.attivo.attrezzature ?? null,
    costoStoricoImmobilizzazioni: bilancio?.origine.attivo.costoStoricoImmobilizzazioniMateriali ?? null,
    superficieTotaleMq,
    possiedeImmobili,
    numeroUnitaLocali: unitaLocali === null ? null : unitaLocali.length,
    provinceOperative: [...province],
    haImpiantoAntincendio: anyDeclared(dichiarati.immobili.map((i) => i.presenzaImpiantoAntincendio)),
    haAllarme: anyDeclared(dichiarati.immobili.map((i) => i.presenzaAllarme)),
    certificazioni: dichiarati.certificazioni,

    numeroVeicoli: dichiarati.numeroVeicoli ?? veicoliDaBilancio,
    haDipendenti: addetti === null ? null : addetti > 0,
    quotaExport: dichiarati.quotaExportPercentuale,
    esportaUsaCanada: dichiarati.esportaVersoUsaCanada,
    trattaDatiPersonali: dichiarati.trattaDatiPersonali,
    trattaDatiParticolari: dichiarati.trattaDatiParticolari,
    haEcommerce: dichiarati.haSitoEcommerce,
    haModello231: dichiarati.haModello231,
    lavoraInCantiere: dichiarati.lavoraInCantiere,
    produceBeniFinali: dichiarati.produceBeniFinali,
    trasportaMerciProprie: dichiarati.trasportaMerciProprie,
    concentrazionePrimoCliente: dichiarati.concentrazionePrimoCliente,

    numeroAmministratori: assetti?.cariche.length ?? 0,
    numeroSoci: assetti?.soci.length ?? 0,
    haSociPersonaGiuridica: assetti?.soci.some((s) => s.tipo === 'persona-giuridica') ?? false,
    appartieneAGruppo:
      (assetti?.controllante ?? null) !== null ||
      (assetti?.controllate.length ?? 0) > 0 ||
      controlloSocietario(assetti?.soci ?? []) !== null,
    quotaSocioDiControllo: quotaDiControllo(assetti?.soci ?? []),
  };
}

/**
 * `true` se almeno un immobile dichiara la misura, `false` se tutti la negano,
 * `null` se nessuno l'ha dichiarata (nessun immobile censito o campo non compilato).
 */
function anyDeclared(values: readonly (boolean | null)[]): boolean | null {
  const defined = values.filter((v): v is boolean => v !== null);
  if (defined.length === 0) return null;
  return defined.some((v) => v);
}

function sommaSuperfici(values: readonly (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length === 0) return null;
  return defined.reduce((sum, v) => sum + v, 0);
}

/**
 * L'azienda possiede immobili? Il dato dichiarato prevale; in sua assenza si deduce
 * dalla voce B.II.1 del bilancio, che accoglie solo i fabbricati di proprietà
 * (quelli in locazione non sono iscritti all'attivo).
 */
function derivePossiedeImmobili(
  profile: CompanyProfile,
  bilancio: BilancioRiclassificato | null,
): boolean | null {
  const dichiarati = profile.datiDichiarati.immobili;
  if (dichiarati.length > 0) {
    return dichiarati.some(
      (i) => i.titolo === 'proprieta' || i.titolo === 'leasing' || i.titolo === 'misto',
    );
  }
  if (bilancio === null) return null;
  return Money.isPositive(bilancio.origine.attivo.terreniEFabbricati);
}

/**
 * Il socio societario che detiene il controllo, se c'è.
 *
 * Due criteri, entrambi necessari perché il dato reale è irregolare:
 *
 *  - una società con quota dichiarata pari o superiore alla maggioranza (controllo di
 *    diritto, art. 2359 c.c.);
 *  - **oppure** l'unico socio, quando è una società: la percentuale può mancare, ma un
 *    socio solo possiede per definizione l'intero capitale.
 *
 * Il secondo criterio non è un dettaglio: nelle risposte reali la quota è spesso assente
 * proprio nelle società interamente controllate, cioè nei casi che contano di più.
 */
function controlloSocietario(soci: readonly Socio[]): Socio | null {
  const societari = soci.filter((s) => s.tipo === 'persona-giuridica');
  if (societari.length === 0) return null;

  const maggioritario = societari.find((s) => quotaInPercentuale(s.quotaPercentuale, soci) >= 50);
  if (maggioritario !== undefined) return maggioritario;

  return soci.length === 1 ? (societari[0] ?? null) : null;
}

/** Quota del socio di controllo in percentuale, `null` se non dichiarata o assente. */
function quotaDiControllo(soci: readonly Socio[]): number | null {
  const controllante = controlloSocietario(soci);
  if (controllante === null || controllante.quotaPercentuale === null) return null;
  return quotaInPercentuale(controllante.quotaPercentuale, soci);
}

/**
 * Normalizza una quota che può arrivare come frazione (`1`) o come percentuale (`100`).
 *
 * La scelta si fa sull'intera compagine, non sul singolo valore: un `1` isolato è
 * ambiguo, ma una compagine che somma a `1` è fatta di frazioni. Sbagliare qui
 * trasformerebbe un socio all'1% in un controllante totalitario.
 */
function quotaInPercentuale(quota: number | null, soci: readonly Socio[]): number {
  if (quota === null) return 0;
  const noti = soci.map((s) => s.quotaPercentuale).filter((q): q is number => q !== null);
  const somma = noti.reduce((t, q) => t + q, 0);
  const sonoFrazioni = somma > 0 && somma <= 1.01 && noti.every((q) => q <= 1);
  return sonoFrazioni ? quota * 100 : quota;
}
