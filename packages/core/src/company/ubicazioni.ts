/**
 * Le ubicazioni dell'impresa, una per una.
 *
 * Un'analisi che riduce l'azienda al suo indirizzo di sede legale sbaglia due volte: dice
 * che il rischio territoriale è quello del capoluogo — mentre lo stabilimento sta in un
 * comune diverso — e tratta come un unico sinistro valori che stanno a duecento chilometri.
 *
 * Qui le ubicazioni vengono **raccolte da tutte le fonti** (sede legale camerale, unità
 * locali, immobili rilevati in intervista), deduplicate, e raggruppate in due modi diversi
 * perché due eventi diversi le colpiscono in modo diverso:
 *
 *  - **l'incendio** si propaga per contiguità. Fabbricati entro poche centinaia di metri
 *    sono un unico complesso: il danno massimo si calcola sulla loro somma. Oltre, sono
 *    rischi separati e sommarli gonfia il capitale da assicurare;
 *  - **il terremoto e l'alluvione** colpiscono un territorio. Due capannoni ai lati opposti
 *    dello stesso comune cadono insieme, anche se fra loro non c'è propagazione possibile.
 *
 * È la distinzione che un sottoscrittore fa a mano da sempre, e che una piattaforma che
 * guarda solo la sede legale non può nemmeno porsi.
 */

import type { Indirizzo, ImmobileDichiarato, TipoUnitaLocale, UnitaLocale } from './profile.js';
import { AVVERTENZA_CONTESTO } from './contesto-territoriale.js';
import type { ContestoTerritoriale } from './contesto-territoriale.js';
import { territorialExposure } from '../risk/geo.js';
import type { TerritorialExposure } from '../risk/geo.js';
import type { Confidence } from '../shared/provenance.js';

/**
 * Raggio entro cui due fabbricati fanno parte dello stesso complesso ai fini incendio.
 *
 * Duecento metri è la convenzione prudenziale della pratica assicurativa property: sotto
 * questa distanza la propagazione — diretta, per irraggiamento o per intervento dei
 * soccorsi sull'intera area — è considerata possibile, e i valori si sommano. Non è una
 * norma: è un'ipotesi di lavoro, ed è dichiarata come tale nel risultato perché chi
 * sottoscrive possa sostituirla con la propria.
 */
export const RAGGIO_COMPLESSO_METRI = 200;

export type OrigineUbicazione = 'sede-legale' | 'unita-locale' | 'immobile-rilevato';

export interface Ubicazione {
  /** Chiave stabile ricavata dall'indirizzo normalizzato: serve a deduplicare e a fare da `key`. */
  readonly id: string;
  readonly etichetta: string;
  readonly origini: readonly OrigineUbicazione[];
  readonly tipo: TipoUnitaLocale | null;
  readonly indirizzo: Indirizzo;
  readonly superficieMq: number | null;
  readonly addetti: number | null;
  /** Esposizione territoriale. Oggi risolta a livello provinciale: vedi nota nel risultato. */
  readonly esposizione: TerritorialExposure;
  readonly haCoordinate: boolean;
  /**
   * Il contesto fisico attorno: caserme e attività confinanti.
   *
   * `null` ha due cause che restano volutamente indistinte qui — nessuna coordinata, o
   * fonte non raggiunta. In entrambi i casi l'affermazione da non fare è la stessa:
   * «intorno non c'è niente». Chi mostra il dato dichiara che non è stato osservato.
   */
  readonly contesto: ContestoTerritoriale | null;
}

/** Un gruppo di ubicazioni che un singolo evento può colpire insieme. */
export interface Aggregato {
  readonly ubicazioni: readonly Ubicazione[];
  readonly motivo: string;
}

export interface AnalisiUbicazioni {
  readonly ubicazioni: readonly Ubicazione[];
  /** Gruppi ai fini incendio: contiguità fisica misurata sulle coordinate. */
  readonly complessiIncendio: readonly Aggregato[];
  /** Gruppi ai fini catastrofale: stesso comune, quindi stesso evento. */
  readonly aggregatiTerritoriali: readonly Aggregato[];
  /** `true` se tutti i valori stanno in un solo complesso: nessuna parte è al riparo. */
  readonly unicoComplesso: boolean;
  readonly esposizionePeggiore: TerritorialExposure | null;
  readonly ubicazionePeggiore: Ubicazione | null;
  /** Distanza fra le due ubicazioni più lontane, in chilometri. `null` senza coordinate. */
  readonly distanzaMassimaKm: number | null;
  readonly province: readonly string[];
  readonly comuni: readonly string[];
  readonly domande: readonly string[];
  readonly note: readonly string[];
  readonly confidenza: Confidence;
}

/**
 * Chiave di deduplicazione: stesso indirizzo scritto in modi diversi resta un'ubicazione sola.
 *
 * VIA E CIVICO SI UNISCONO PRIMA DI NORMALIZZARE, e non \u00e8 un dettaglio di stile.
 *
 * Le due fonti scrivono lo stesso indirizzo in due modi: la sede legale arriva da
 * `address`, che tiene il civico nel suo campo, e l'unit\u00e0 locale da `allOffices`, che a
 * volte lo lascia dentro la via \u2014 con la virgola in coda. Con via e civico come segmenti
 * distinti le due chiavi divergono:
 *
 *   agnosine | localitalocfondizonaindustriale | 102     \u2190 sede legale
 *   agnosine | localitalocfondizonaindustriale102 |       \u2190 unit\u00e0 locale
 *
 * e lo stesso capannone diventa due ubicazioni. Sulla scheda di COMINOTTI S.R.L. si
 * leggeva \u00ab3 ubicazioni \u00b7 2 comuni\u00bb mentre il registro, nella stessa pagina, dichiarava
 * \u00abUnit\u00e0 locali: 1\u00bb \u2014 e l'analisi incendio le contava come **due complessi separati**,
 * chiedendo all'intermediario di \u00abconfermare se sorgono nello stesso sito\u00bb due righe che
 * riportavano lo stesso indirizzo carattere per carattere.
 *
 * Unendoli prima, la punteggiatura sparisce insieme al resto e le due chiavi coincidono.
 * Non produce fusioni indebite: `via roma 1` e `via roma 10` restano `roma1` e `roma10`, e
 * un indirizzo senza civico non aggancia quello con il civico \u2014 che \u00e8 il verso prudente.
 */
function chiaveDi(indirizzo: Indirizzo): string {
  const normalizza = (t: string): string =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(via|viale|piazza|corso|strada|largo|vicolo|v\.le|p\.zza)\b/g, '')
      .replace(/[^a-z0-9]/g, '');

  return [normalizza(indirizzo.comune), normalizza(`${indirizzo.via} ${indirizzo.civico ?? ''}`)]
    .filter((p) => p !== '')
    .join('|');
}

function etichettaDi(indirizzo: Indirizzo, origini: readonly OrigineUbicazione[]): string {
  const prefisso = origini.includes('sede-legale')
    ? 'Sede legale'
    : origini.includes('unita-locale')
      ? 'Unità locale'
      : 'Immobile rilevato';
  const civico = indirizzo.civico === null ? '' : ` ${indirizzo.civico}`;
  // Una via arrivata con la virgola in coda non deve raddoppiarla qui: «102,, AGNOSINE».
  const via = indirizzo.via.replace(/[\s,;]+$/u, '');
  return `${prefisso} — ${via}${civico}, ${indirizzo.comune} (${indirizzo.provincia})`;
}

/**
 * Distanza in metri fra due punti (formula dell'emisenoverso).
 *
 * Su distanze di qualche chilometro l'approssimazione sferica sbaglia di pochi metri:
 * irrilevante rispetto alla soglia dei duecento metri, e molto meno costoso di una
 * proiezione geodetica esatta.
 */
export function distanzaMetri(
  a: { latitudine: number; longitudine: number },
  b: { latitudine: number; longitudine: number },
): number {
  const RAGGIO_TERRESTRE_M = 6_371_000;
  const rad = (g: number): number => (g * Math.PI) / 180;

  const dLat = rad(b.latitudine - a.latitudine);
  const dLon = rad(b.longitudine - a.longitudine);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitudine)) * Math.cos(rad(b.latitudine)) * Math.sin(dLon / 2) ** 2;

  return 2 * RAGGIO_TERRESTRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Sorgente {
  readonly indirizzo: Indirizzo;
  readonly origine: OrigineUbicazione;
  readonly tipo?: TipoUnitaLocale | undefined;
  readonly superficieMq?: number | null | undefined;
  readonly addetti?: number | null | undefined;
}

export function analizzaUbicazioni(input: {
  readonly sedeLegale: Indirizzo | null;
  readonly unitaLocali: readonly UnitaLocale[];
  readonly immobili: readonly ImmobileDichiarato[];
  /**
   * Contesto fisico già raccolto, per chiave di ubicazione.
   *
   * Entra dall'esterno perché leggerlo è un'operazione di rete e questo motore è puro.
   * Le chiavi sono gli `id` che questa stessa funzione produce: chi deve raccoglierli la
   * chiama una prima volta senza contesti — è un calcolo, non costa nulla — legge le
   * coordinate che ne escono, e la richiama con la mappa piena.
   */
  readonly contesti?: ReadonlyMap<string, ContestoTerritoriale> | undefined;
  /**
   * Perché alcune letture del contesto non hanno prodotto nulla.
   *
   * Senza questo, una fonte in coda e un vicinato pulito si somigliano troppo: entrambi
   * producono un'ubicazione senza contesto. Dirlo cambia l'azione di chi legge —
   * riprovare, oppure andare a guardare.
   */
  readonly esitoContesto?: { readonly occupate: number; readonly nonRaggiunte: number } | undefined;
}): AnalisiUbicazioni {
  const sorgenti: Sorgente[] = [];

  if (input.sedeLegale !== null) {
    sorgenti.push({ indirizzo: input.sedeLegale, origine: 'sede-legale', tipo: 'sede-legale' });
  }
  for (const u of input.unitaLocali) {
    sorgenti.push({
      indirizzo: u.indirizzo,
      origine: 'unita-locale',
      tipo: u.tipo,
      addetti: u.addetti,
    });
  }
  for (const i of input.immobili) {
    if (i.indirizzo === null) continue;
    sorgenti.push({
      indirizzo: i.indirizzo,
      origine: 'immobile-rilevato',
      superficieMq: i.superficieMq,
    });
  }

  // Deduplicazione: lo stesso stabilimento arriva spesso da due fonti — la visura e
  // l'intervista — e contarlo due volte raddoppierebbe il capitale da assicurare.
  const perChiave = new Map<string, Ubicazione>();
  for (const s of sorgenti) {
    const id = chiaveDi(s.indirizzo);
    if (id === '') continue;

    const esistente = perChiave.get(id);
    const origini = esistente === undefined ? [s.origine] : [...new Set([...esistente.origini, s.origine])];

    perChiave.set(id, {
      id,
      etichetta: etichettaDi(s.indirizzo, origini),
      origini,
      // Il tipo dichiarato dalla visura prevale su quello assente dell'intervista.
      tipo: s.tipo ?? esistente?.tipo ?? null,
      // Fra due scritture dello stesso indirizzo si tiene quella con le coordinate.
      indirizzo: esistente !== undefined && esistente.haCoordinate ? esistente.indirizzo : s.indirizzo,
      superficieMq: s.superficieMq ?? esistente?.superficieMq ?? null,
      addetti: s.addetti ?? esistente?.addetti ?? null,
      esposizione: territorialExposure(s.indirizzo.provincia),
      haCoordinate:
        (esistente?.haCoordinate ?? false) ||
        (s.indirizzo.latitudine !== null && s.indirizzo.longitudine !== null),
      contesto: input.contesti?.get(id) ?? esistente?.contesto ?? null,
    });
  }

  const ubicazioni = [...perChiave.values()];

  return {
    ubicazioni,
    complessiIncendio: raggruppaPerContiguita(ubicazioni),
    aggregatiTerritoriali: raggruppaPerComune(ubicazioni),
    unicoComplesso: raggruppaPerContiguita(ubicazioni).length <= 1,
    ...peggiore(ubicazioni),
    distanzaMassimaKm: distanzaMassima(ubicazioni),
    province: [...new Set(ubicazioni.map((u) => u.indirizzo.provincia.toUpperCase()))],
    comuni: [...new Set(ubicazioni.map((u) => u.indirizzo.comune))],
    domande: domande(ubicazioni),
    note: note(ubicazioni, input.esitoContesto),
    confidenza:
      ubicazioni.length === 0 ? 'bassa' : ubicazioni.every((u) => u.haCoordinate) ? 'alta' : 'media',
  };
}

/**
 * Raggruppa per contiguità fisica, con propagazione transitiva.
 *
 * A dista 150 m da B, B dista 150 m da C: A e C sono nello stesso complesso anche se fra
 * loro ce ne sono 300. È così che si propaga un incendio, e un raggruppamento che
 * confrontasse solo le coppie spezzerebbe in due un capannone lungo.
 */
function raggruppaPerContiguita(ubicazioni: readonly Ubicazione[]): readonly Aggregato[] {
  if (ubicazioni.length === 0) return [];

  const conCoordinate = ubicazioni.filter((u) => u.haCoordinate);
  const senzaCoordinate = ubicazioni.filter((u) => !u.haCoordinate);

  const gruppi: Ubicazione[][] = [];
  const assegnate = new Set<string>();

  for (const u of conCoordinate) {
    if (assegnate.has(u.id)) continue;

    const gruppo: Ubicazione[] = [u];
    assegnate.add(u.id);

    // Coda: ogni nuova ubicazione aggiunta può a sua volta attirarne altre.
    for (let i = 0; i < gruppo.length; i++) {
      const corrente = gruppo[i]!;
      for (const altra of conCoordinate) {
        if (assegnate.has(altra.id)) continue;
        if (vicine(corrente, altra)) {
          gruppo.push(altra);
          assegnate.add(altra.id);
        }
      }
    }
    gruppi.push(gruppo);
  }

  // Senza coordinate non si può dire se sia vicina: resta un complesso a sé, che è
  // l'ipotesi prudente per il conteggio dei complessi ma va dichiarata.
  for (const u of senzaCoordinate) gruppi.push([u]);

  /*
    «Isolata» è il risultato di una misura, e va fatta per poterlo dire.

    Il motivo era uno solo per tutti i gruppi da una ubicazione, e affermava una
    separazione **misurata** anche là dove non c'era nulla da misurare: senza coordinate il
    gruppo singolo nasce dall'ipotesi prudenziale scritta dieci righe più su, non da una
    distanza. In produzione è il caso normale — nessuna unità locale porta coordinate nelle
    risposte registrate — quindi la frase falsa era quella che compariva sempre.

    È la stessa distinzione che `domande` fa già con «considerate separate dalle altre:
    confermare se sorgono nello stesso sito».
  */
  return gruppi.map((g) => ({
    ubicazioni: g,
    motivo:
      g.length > 1
        ? `${g.length} ubicazioni entro ${RAGGIO_COMPLESSO_METRI} m: un incendio può interessarle tutte.`
        : g[0]!.haCoordinate
          ? 'Ubicazione isolata rispetto alle altre note.'
          : 'Coordinate non rilevate: l’ubicazione è contata come complesso a sé per ipotesi prudenziale, non per distanza misurata.',
  }));
}

function vicine(a: Ubicazione, b: Ubicazione): boolean {
  const pa = puntoDi(a);
  const pb = puntoDi(b);
  if (pa === null || pb === null) return false;
  return distanzaMetri(pa, pb) <= RAGGIO_COMPLESSO_METRI;
}

function puntoDi(u: Ubicazione): { latitudine: number; longitudine: number } | null {
  const { latitudine, longitudine } = u.indirizzo;
  return latitudine === null || longitudine === null ? null : { latitudine, longitudine };
}

/** Stesso comune, stesso evento catastrofale: qui la contiguità non c'entra. */
function raggruppaPerComune(ubicazioni: readonly Ubicazione[]): readonly Aggregato[] {
  const perComune = new Map<string, Ubicazione[]>();
  for (const u of ubicazioni) {
    const chiave = `${u.indirizzo.comune.toLowerCase()}|${u.indirizzo.provincia.toUpperCase()}`;
    perComune.set(chiave, [...(perComune.get(chiave) ?? []), u]);
  }

  return [...perComune.values()].map((g) => ({
    ubicazioni: g,
    motivo:
      g.length === 1
        ? `Unica ubicazione nel comune di ${g[0]!.indirizzo.comune}.`
        : `${g.length} ubicazioni nel comune di ${g[0]!.indirizzo.comune}: un sisma o un'alluvione le colpisce insieme.`,
  }));
}

function peggiore(ubicazioni: readonly Ubicazione[]): {
  esposizionePeggiore: TerritorialExposure | null;
  ubicazionePeggiore: Ubicazione | null;
} {
  const rango = (u: Ubicazione): number => {
    // `null` è l'esposizione idraulica non misurata, e vale zero: la tabella conosce solo
    // le province alte, quindi ciò che non vi compare non è alto. L'ordinamento non
    // cambia rispetto al ripiego «media» che c'era prima, perché era uniforme su tutte.
    const punti = (l: 'alta' | 'media' | 'bassa' | null): number =>
      l === 'alta' ? 2 : l === 'media' ? 1 : 0;
    return punti(u.esposizione.sismica) + punti(u.esposizione.idraulica);
  };

  let scelta: Ubicazione | null = null;
  for (const u of ubicazioni) {
    if (scelta === null || rango(u) > rango(scelta)) scelta = u;
  }

  return {
    esposizionePeggiore: scelta?.esposizione ?? null,
    ubicazionePeggiore: scelta,
  };
}

function distanzaMassima(ubicazioni: readonly Ubicazione[]): number | null {
  const punti = ubicazioni
    .map(puntoDi)
    .filter((p): p is { latitudine: number; longitudine: number } => p !== null);
  if (punti.length < 2) return null;

  let massima = 0;
  for (let i = 0; i < punti.length; i++) {
    for (let j = i + 1; j < punti.length; j++) {
      massima = Math.max(massima, distanzaMetri(punti[i]!, punti[j]!));
    }
  }
  return Math.round(massima / 100) / 10;
}

function domande(ubicazioni: readonly Ubicazione[]): readonly string[] {
  const elenco: string[] = [];

  if (ubicazioni.length === 0) {
    elenco.push('Dove si svolge l’attività? Nessuna ubicazione risulta dai dati disponibili.');
    return elenco;
  }

  /*
    La domanda resta, la motivazione no.

    «Senza i metri quadri il capitale fabbricati resta da rilevare» era stampato sulla
    stessa schermata che, tre riquadri più su, dichiarava «Somma assicuranda — Fabbricati
    11.500.000 €». Il capitale c'era, calcolato dall'impronta a terra che la cartografia
    rileva sulle ubicazioni con coordinate: la frase negava un numero che il prodotto
    aveva appena stampato.

    Chiedere la superficie resta giusto — un rilievo vero batte un'impronta, che ignora i
    piani e sottostima ogni edificio a più livelli — ma il motivo per cui la si chiede
    cambia, e il lettore deve sapere quale dei due sta guardando.
  */
  const senzaSuperficie = ubicazioni.filter((u) => u.superficieMq === null);
  if (senzaSuperficie.length > 0) {
    const quante =
      senzaSuperficie.length === 1 ? 'questa ubicazione' : `queste ${senzaSuperficie.length} ubicazioni`;
    const conImpronta = senzaSuperficie.filter(
      (u) => (u.contesto?.fabbricati?.superficieCopertaMq ?? 0) > 0,
    ).length;

    elenco.push(
      conImpronta === 0
        ? `Qual è la superficie di ${quante}? Senza i metri quadri il capitale fabbricati resta da rilevare.`
        : `Qual è la superficie di ${quante}? Su ${conImpronta === 1 ? 'una di esse' : `${conImpronta} di esse`} il capitale fabbricati è stato stimato dall’impronta a terra rilevata da cartografia, che ignora i piani: su un edificio a più livelli sottostima, ed è la sottostima su cui al sinistro opera la regola proporzionale.`,
    );
  }

  const senzaCoordinate = ubicazioni.filter((u) => !u.haCoordinate);
  if (senzaCoordinate.length > 0) {
    elenco.push(
      'Le ubicazioni prive di coordinate sono state considerate separate dalle altre: confermare se sorgono nello stesso sito.',
    );
  }

  if (ubicazioni.length === 1) {
    elenco.push(
      'Esistono depositi, magazzini o cantieri non registrati alla camera di commercio? Un valore fuori dalle ubicazioni note resta scoperto.',
    );
  }

  return elenco;
}

function note(
  ubicazioni: readonly Ubicazione[],
  esitoContesto?: { readonly occupate: number; readonly nonRaggiunte: number },
): readonly string[] {
  const elenco: string[] = [
    // Dichiarare il limite è parte del risultato: chi legge deve sapere quanto è fine la
    // maglia con cui si è misurato, altrimenti attribuisce alla stima una precisione che
    // non ha.
    'La classificazione sismica e idraulica è risolta su base provinciale. La zonazione sismica di legge è comunale: per le imprese in province disomogenee la verifica sul singolo comune resta necessaria.',
  ];

  if (ubicazioni.some((u) => u.haCoordinate)) {
    elenco.push(
      `Le ubicazioni con coordinate note sono state raggruppate per contiguità entro ${RAGGIO_COMPLESSO_METRI} m.`,
    );
  }

  /*
    Il contesto fisico si dichiara due volte, e per due ragioni diverse.

    La prima è la licenza: la fonte è rilasciata con obbligo di attribuzione, e mostrarne
    il contenuto senza citarla è una violazione, non una svista di stile.

    La seconda è più importante per chi legge. Se il contesto è stato osservato su tre
    ubicazioni su cinque, tacere le altre due lascia credere che siano pulite. Un'analisi
    che non distingue «guardato e non c'è niente» da «non guardato» induce esattamente
    l'errore che deve prevenire.
  */
  const osservate = ubicazioni.filter((u) => u.contesto !== null);
  if (osservate.length > 0) {
    const fonti = [...new Set(osservate.map((u) => u.contesto?.fonte ?? ''))].filter((f) => f !== '');
    elenco.push(
      `Contesto fisico (caserme e attività confinanti) rilevato su ${osservate.length} ubicazion${osservate.length === 1 ? 'e' : 'i'} su ${ubicazioni.length}. Fonte: ${fonti.join(', ')}.`,
    );
    elenco.push(AVVERTENZA_CONTESTO);
  }

  const nonOsservate = ubicazioni.length - osservate.length;
  if (osservate.length > 0 && nonOsservate > 0) {
    // «Sulle restanti 1» è la forma che esce ogni volta che le ubicazioni sono due e una
    // sola è stata osservata — cioè il caso più frequente, non un caso limite. Su un
    // documento che va al cliente un accordo sbagliato costa credito quanto un numero.
    elenco.push(
      nonOsservate === 1
        ? "Sulla restante il contesto non è stato osservato: l'assenza di segnalazioni non va letta come assenza di attività confinanti."
        : `Sulle restanti ${nonOsservate} il contesto non è stato osservato: l'assenza di segnalazioni non va letta come assenza di attività confinanti.`,
    );
  }

  /*
    Il motivo del mancato rilevamento, quando si conosce.

    Vale anche — anzi soprattutto — quando **nessuna** ubicazione è stata osservata: è il
    caso in cui il capitolo sparisce del tutto dal report, e senza questa riga il documento
    tacerebbe su un dato che si era deciso di raccogliere.
  */
  if (esitoContesto !== undefined && esitoContesto.occupate > 0) {
    elenco.push(
      `Contesto fisico non rilevato su ${esitoContesto.occupate} ubicazion${esitoContesto.occupate === 1 ? 'e' : 'i'}: la fonte cartografica ha respinto le richieste per limite d'uso. È una coda, non un'assenza di attività — una nuova analisi più tardi lo recupera.`,
    );
  }
  if (esitoContesto !== undefined && esitoContesto.nonRaggiunte > 0) {
    elenco.push(
      `Contesto fisico non rilevato su ${esitoContesto.nonRaggiunte} ubicazion${esitoContesto.nonRaggiunte === 1 ? 'e' : 'i'}: la fonte cartografica non è stata raggiunta.`,
    );
  }

  return elenco;
}
