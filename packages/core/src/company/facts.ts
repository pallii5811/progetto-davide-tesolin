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
import { QUOTA_SERVIZI_VARIABILE_DEFAULT, conPatrimonioNettoAutorevole } from './financials.js';
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
  /**
   * Se l'impresa esporta, secondo l'intervista o — quando l'intervista tace — l'archivio.
   *
   * La quota sul fatturato e il fatto stesso di esportare sono due domande diverse, e il
   * prodotto ne aveva una sola. Il risultato, su una scheda dove l'archivio dichiarava i
   * mercati: la voce «Export» del dimensionamento diceva «da rilevare in intervista»
   * accanto a un riquadro che stampava «Paesi di esportazione: Unione Europea, Altri
   * Paesi». Il dato era pagato, era a schermo, e il motore non lo guardava.
   */
  readonly esportatore: boolean | null;
  /** I mercati di destinazione come li dichiara l'archivio, testuali e non normalizzati. */
  readonly paesiExportArchivio: string | null;
  readonly trattaDatiPersonali: boolean | null;
  readonly trattaDatiParticolari: boolean | null;
  readonly haEcommerce: boolean | null;
  readonly haModello231: boolean | null;
  readonly lavoraInCantiere: boolean | null;
  readonly produceBeniFinali: boolean | null;
  readonly trasportaMerciProprie: boolean | null;
  readonly concentrazionePrimoCliente: number | null;

  // Governance
  /**
   * Quanti amministratori risultano in carica.
   *
   * `null` — e non zero — quando l'assetto societario non è stato acquisito. Le cariche
   * arrivano solo con il profilo completo: sotto quel livello `cariche` è un array vuoto
   * perché nessuno le ha chieste, non perché la società non abbia amministratori.
   *
   * La differenza si leggeva in un documento di adeguatezza: il ragionamento sul
   * massimale D&O stampava «Amministratori in carica: 0» su ogni analisi non
   * approfondita. Zero amministratori è un'affermazione impossibile su una società
   * attiva, ed era un buco travestito da misura.
   */
  readonly numeroAmministratori: number | null;
  readonly numeroSoci: number;
  readonly haSociPersonaGiuridica: boolean;
  /**
   * Appartenenza a un gruppo, in qualunque posizione.
   *
   * Non basta guardare `controllante` e `controllate`: l'anagrafica camerale non
   * dichiara quasi mai una capogruppo in modo esplicito, ma **elenca i soci**. Una
   * società che possiede la maggioranza delle quote è la capogruppo, che lo dica un
   * campo dedicato o no — ed è il presupposto della responsabilità da direzione e
   * coordinamento. Dedurlo dal solo campo esplicito lasciava fuori praticamente
   * tutte le controllate reali.
   *
   * **Non usarlo per attribuire la responsabilità ex art. 2497 c.c.**: quella grava su
   * chi la direzione la esercita, non su chi la subisce. Per quello ci sono i due fatti
   * qui sotto.
   */
  readonly appartieneAGruppo: boolean;
  /**
   * L'impresa **esercita** direzione e coordinamento: ha società controllate.
   *
   * È il presupposto soggettivo dell'art. 2497 c.c., che pone la responsabilità in capo
   * a chi dirige verso i soci e i creditori delle dirette. Tenerlo distinto dal fatto
   * speculare non è pignoleria: fusi in un unico booleano, il prodotto diceva alla
   * controllata — cioè alla parte che la norma protegge — di esserne responsabile.
   */
  readonly esercitaDirezioneECoordinamento: boolean;
  /**
   * L'impresa **subisce** direzione e coordinamento: qualcuno la controlla.
   *
   * Qui gli amministratori rispondono solo se hanno preso parte al fatto lesivo
   * (art. 2497, comma 2, c.c.), e il tema assicurativo è l'estensione della D&O di
   * gruppo, non una responsabilità propria.
   */
  readonly soggettaADirezioneECoordinamento: boolean;
  /** Quota del socio di controllo, se dichiarata. */
  readonly quotaSocioDiControllo: number | null;
}

/**
 * Il Nord America dentro l'elenco dei mercati dell'archivio.
 *
 * Restituisce `true` o `null`, **mai** `false`. «UNIONE EUROPEA, ALTRI PAESI» — la
 * risposta che l'archivio dà più spesso — non esclude gli Stati Uniti: «altri paesi» li
 * comprende senza nominarli. Leggere quel silenzio come una negazione toglierebbe due
 * gradini di massimale a un'impresa che là ci spedisce davvero, ed è il modo esatto in
 * cui una polizza si scopre insufficiente il giorno del sinistro.
 *
 * I confini di parola servono: senza, «USA» aggancia «CAUSA» e «USATO».
 */
function usaCanadaDaiMercati(paesi: string | null): true | null {
  if (paesi === null) return null;
  const nominato =
    /\b(STATI UNITI|U\.?S\.?A\.?|CANADA|AMERICA DEL NORD|NORD ?AMERICA|AMERICA SETTENTRIONALE)\b/.test(
      paesi.toUpperCase(),
    );
  return nominato ? true : null;
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
  const qualifiche = profile.indicatoriFornitore.qualifiche;

  const paesiExportArchivio = qualifiche?.paesiExport ?? null;
  // «Esporta» e «quanto esporta» sono due domande: l'archivio risponde alla prima, e da
  // un elenco di mercati l'esportazione si deduce anche quando la casella tace.
  const esportatoreArchivio = qualifiche?.esportatore ?? (paesiExportArchivio === null ? null : true);

  // Gerarchia delle fonti: bilancio dettagliato → bilancio sintetico → anagrafica.
  // I dati di intervista prevalgono sempre sul numero di addetti, perché il broker
  // conosce la situazione odierna mentre il bilancio fotografa il 31 dicembre.
  /*
    Il patrimonio netto passa dalla fonte che sa dimostrarsi anche QUI, e non solo dove si
    calcolano gli indicatori.

    Correggerlo nel solo `analyze` lasciava in piedi metà del difetto, nella metà che
    nessuno guarda: da `facts.patrimonioNetto` passano la regola che confronta i crediti
    verso clienti con il patrimonio — che con 8.485 € invece di 719.768 € si accende su
    ogni impresa — l'incidenza stampata nel dimensionamento del fido clienti, e il valore
    che il monitoraggio confronta di mese in mese.
  */
  const sintetico = conPatrimonioNettoAutorevole(
    profile.bilanciSintetici[0]?.value ?? null,
    profile.indicatoriFornitore.aggregati?.patrimonioNetto ?? null,
  );

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

  /*
    Le due posizioni nel gruppo, tenute separate.

    Chi ha controllate esercita la direzione; chi ha una controllante — o un socio
    societario di controllo, che nell'anagrafica camerale è il modo in cui il gruppo si
    manifesta quasi sempre — la subisce. Una società può essere entrambe le cose: è la
    holding intermedia, e allora rispondono entrambi i fatti.
  */
  /*
    Il margine di contribuzione dai costi variabili dichiarati.

    Ricavi meno materie prime meno la quota variabile dei servizi — la stessa formula che
    la riclassificazione applica al bilancio CEE, con la stessa quota. Si calcola solo se
    **entrambe** le voci di costo sono state rilevate: con una sola, il margine uscirebbe
    gonfiato, e un capitale di business interruption gonfiato è un premio che il cliente
    paga per niente.
  */
  const dic = dichiarati.bilancio;
  const margineDichiarato =
    fatturato !== null && dic.costiMateriePrime !== null && dic.costiServizi !== null
      ? Money.max(
          Money.ZERO,
          Money.subtract(
            fatturato,
            Money.add(
              dic.costiMateriePrime,
              Money.multiply(dic.costiServizi, QUOTA_SERVIZI_VARIABILE_DEFAULT),
            ),
          ),
        )
      : null;

  /*
    Impianti e attrezzature arrivano come voce unica dall'intervista.

    Il bilancio CEE le tiene separate (B-II-2 e B-II-3) e il motore le somma comunque:
    qui la somma è già fatta da chi ha letto il documento, e si attribuisce alla voce
    impianti lasciando `null` le attrezzature — che è la lettura onesta, perché nessuno
    ha dichiarato quanto valga ciascuna delle due.
  */
  const impiantiDichiarati = dic.impiantiAlCostoStorico === true ? null : dic.impiantiEAttrezzature;

  const esercitaDirezione = (assetti?.controllate.length ?? 0) > 0;
  const soggettaADirezione =
    (assetti?.controllante ?? null) !== null || controlloSocietario(assetti?.soci ?? []) !== null;

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
    margineDiContribuzione: bilancio?.ce.margineDiContribuzione ?? margineDichiarato,
    costoDelPersonale: bilancio?.ce.costoDelPersonale ?? sintetico?.costoDelPersonale ?? null,
    /*
      Il registro prima, il dichiarato dopo, l'assenza in fondo.

      Queste cinque voci arrivano dallo schema CEE dettagliato, che è un servizio a parte
      e in produzione non si compra quasi mai: senza, contenuto, scorte, danni indiretti e
      fido clienti restano tutti «non determinabile» — su ogni impresa reale, mentre il
      documento dimostrativo li mostra tutti.

      Ma quelle voci stanno nel bilancio depositato che l'imprenditore porta
      all'appuntamento: si leggono dal suo documento e si rilevano in intervista, senza
      comprare nulla. Il dichiarato è un **ripiego**, mai un sostituto: se il bilancio
      dettagliato c'è, vince lui.
    */
    creditiVersoClienti:
      bilancio?.origine.attivo.creditiVersoClienti ?? dichiarati.bilancio.creditiVersoClienti,
    rimanenze: bilancio?.sp.rimanenze ?? dichiarati.bilancio.rimanenze,

    valoreImmobiliNetto: bilancio?.origine.attivo.terreniEFabbricati ?? null,
    valoreImpiantiNetto: bilancio?.origine.attivo.impiantiEMacchinario ?? impiantiDichiarati,
    valoreAttrezzatureNetto: bilancio?.origine.attivo.attrezzature ?? null,
    costoStoricoImmobilizzazioni:
      bilancio?.origine.attivo.costoStoricoImmobilizzazioniMateriali ??
      (dichiarati.bilancio.impiantiAlCostoStorico === true
        ? dichiarati.bilancio.impiantiEAttrezzature
        : null),
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
    // L'intervista prevale, com'è giusto: chi ha parlato con l'imprenditore sa più
    // dell'archivio. Ma quando non ha chiesto, l'archivio ha già risposto ed è pagato.
    esportaUsaCanada: dichiarati.esportaVersoUsaCanada ?? usaCanadaDaiMercati(paesiExportArchivio),
    esportatore:
      dichiarati.quotaExportPercentuale === null
        ? esportatoreArchivio
        : dichiarati.quotaExportPercentuale > 0,
    paesiExportArchivio,
    trattaDatiPersonali: dichiarati.trattaDatiPersonali,
    trattaDatiParticolari: dichiarati.trattaDatiParticolari,
    haEcommerce: dichiarati.haSitoEcommerce,
    haModello231: dichiarati.haModello231,
    lavoraInCantiere: dichiarati.lavoraInCantiere,
    produceBeniFinali: dichiarati.produceBeniFinali,
    trasportaMerciProprie: dichiarati.trasportaMerciProprie,
    concentrazionePrimoCliente: dichiarati.concentrazionePrimoCliente,

    numeroAmministratori: assetti === null ? null : assetti.cariche.length,
    numeroSoci: assetti?.soci.length ?? 0,
    haSociPersonaGiuridica: assetti?.soci.some((s) => s.tipo === 'persona-giuridica') ?? false,
    appartieneAGruppo: esercitaDirezione || soggettaADirezione,
    esercitaDirezioneECoordinamento: esercitaDirezione,
    soggettaADirezioneECoordinamento: soggettaADirezione,
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
 *  - una società la cui quota dichiarata supera la maggioranza (controllo di diritto,
 *    art. 2359, comma 1, n. 1 c.c.);
 *  - **oppure** l'unico socio, quando è una società **e la quota non è dichiarata**: un
 *    socio solo possiede per definizione l'intero capitale, e ignorarlo perché manca la
 *    percentuale nasconderebbe un gruppo.
 *
 * Il secondo criterio non è un dettaglio: nelle risposte reali la quota è spesso assente
 * proprio nelle società interamente controllate, cioè nei casi che contano di più.
 *
 * **Il confronto è a esclusione**, come in `governance/assetto.ts`. L'art. 2359 chiede la
 * *maggioranza* dei voti esercitabili in assemblea ordinaria, e metà esatta non è la
 * maggioranza: in una joint venture 50/50 nessuno dei due controlla. Qui c'era `>= 50`
 * mentre il modulo di governance aveva già `> 50`: due letture della stessa norma nello
 * stesso prodotto, e quella sbagliata faceva nascere un gruppo dove non c'era — con
 * appresso l'affermazione sulla responsabilità da direzione e coordinamento.
 *
 * ## La seconda divergenza, e perché era la più grave
 *
 * Il secondo criterio qui non guardava la quota: bastava che il socio fosse unico e
 * societario. Su una quota **dichiarata minoritaria** — il dato dice 30%, e dicendolo dice
 * anche che il restante 70% è di qualcun altro che l'anagrafica non ha elencato — questo
 * modulo rispondeva «controllante» mentre `assetto.ts:186` rispondeva «no», e lo motivava
 * per iscritto. Due moduli dello stesso prodotto davano risposta opposta alla stessa
 * domanda giuridica; e da qui, non da lì, l'art. 2497 c.c. entrava nel fascicolo come
 * fatto accertato.
 *
 * Vince la lettura di `assetto.ts`: contraddire il dato è peggio che integrarlo.
 */
function controlloSocietario(soci: readonly Socio[]): Socio | null {
  const societari = soci.filter((s) => s.tipo === 'persona-giuridica');
  if (societari.length === 0) return null;

  const maggioritario = societari.find((s) => quotaInPercentuale(s.quotaPercentuale, soci) > 50);
  if (maggioritario !== undefined) return maggioritario;

  const unico = soci.length === 1 ? (societari[0] ?? null) : null;
  return unico !== null && unico.quotaPercentuale === null ? unico : null;
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
