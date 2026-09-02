/**
 * Assetto proprietario e gruppo: chi comanda, chi risponde, chi manca.
 *
 * È la sezione che un'analisi assicurativa seria non può saltare, e che quasi nessun
 * documento di adeguatezza contiene. Tre cose che cambiano la proposta:
 *
 *  - **chi controlla** decide se esiste un gruppo. Il controllo societario fa scattare la
 *    presunzione di direzione e coordinamento (art. 2497-sexies c.c.) e con essa la
 *    responsabilità della capogruppo e dei suoi amministratori verso i soci e i creditori
 *    della controllata (art. 2497 c.c.): una D&O intestata alla sola controllata lascia
 *    scoperto proprio chi decide;
 *  - **quanto è concentrata la proprietà** dice se l'impresa ha una persona chiave. Un
 *    socio unico persona fisica che amministra è, in fatto, l'impresa: la sua assenza
 *    improvvisa è un rischio patrimoniale, non un dispiacere;
 *  - **quale società sta sopra** è a sua volta un'impresa da analizzare. La partita IVA
 *    del socio societario è nel dato: consente di risalire la catena senza chiederla.
 *
 * Sulle **cariche** questo modulo è deliberatamente prudente. L'anagrafica estesa del
 * fornitore non le contiene: al posto di dedurle si dichiara che mancano e si producono
 * le domande da fare. Un amministratore inventato è peggio di un amministratore ignoto.
 */

import type { Assetti, Carica, Socio } from '../company/profile.js';
import type { CompanyFacts } from '../company/facts.js';
import type { Confidence } from '../shared/provenance.js';
import { normaResponsabilitaAmministratori } from './norme.js';
import { traduciDescrizioneArchivio } from '../shared/traduzioni-archivio.js';

/**
 * Soglia di controllo: **maggioranza** dei voti esercitabili in assemblea ordinaria
 * (art. 2359, comma 1, n. 1 c.c.). Il confronto è a esclusione, non a inclusione: metà
 * esatta del capitale non è la maggioranza: due soci al 50% non hanno né l'uno né
 * l'altro il controllo, e chiamarlo controllo significherebbe attribuire a uno dei due
 * un potere che in assemblea non ha.
 */
const SOGLIA_CONTROLLO = 50;

/** Tolleranza sulle quote dichiarate: 33,33 + 33,33 + 33,34 è una compagine paritetica. */
const TOLLERANZA_PARITA = 0.5;

/**
 * Quota oltre la quale un socio persona fisica è, di fatto, l'impresa.
 *
 * Sotto un terzo, la perdita del socio è un problema di governance; sopra i due terzi
 * l'impresa non ha né i voti né, di norma, le competenze per proseguire senza di lui.
 */
const SOGLIA_PERSONA_CHIAVE = 66;

export type TipoControllo =
  | 'socio-unico-persona-fisica'
  | 'controllo-societario'
  | 'maggioranza-persona-fisica'
  | 'compagine-paritetica'
  | 'compagine-frammentata'
  | 'non-disponibile';

export interface SocioDiRilievo {
  readonly denominazione: string;
  readonly codiceFiscale: string | null;
  readonly tipo: 'persona-fisica' | 'persona-giuridica';
  readonly quotaPercentuale: number | null;
}

/**
 * La società che sta sopra.
 *
 * `partitaIva` è valorizzata quando il fornitore restituisce il codice fiscale del socio
 * societario — che per le società coincide con la partita IVA. È ciò che rende la
 * capogruppo **analizzabile con un clic** invece che una riga di testo.
 */
export interface Capogruppo {
  readonly denominazione: string;
  readonly partitaIva: string | null;
  readonly quotaPercentuale: number | null;
  readonly controlloDiDiritto: boolean;
}

/**
 * Chi, uscendo di scena, fermerebbe l'impresa.
 *
 * Prima era un socio e basta: `personeChiave` filtrava la compagine per quota ≥ 66%, e un
 * **amministratore non socio** — cioè il caso più frequente nelle imprese che hanno
 * separato proprietà e gestione — non compariva da nessuna parte. Le cariche c'erano,
 * comprate con il profilo completo, e servivano solo ad accendere un booleano.
 *
 * `motivo` non è ornamentale: distingue chi comanda perché **possiede** da chi comanda
 * perché è stato **nominato**, e senza quella distinzione la frase che ne esce dice a un
 * amministratore senza quote che «detiene la quasi totalità del capitale».
 */
export interface PersonaChiave {
  readonly denominazione: string;
  readonly codiceFiscale: string | null;
  /** `null` per chi è persona chiave in virtù della sola carica. */
  readonly quotaPercentuale: number | null;
  readonly ruolo: string | null;
  readonly rappresentanteLegale: boolean;
  readonly eta: number | null;
  readonly motivo: 'quota' | 'carica' | 'quota-e-carica';
}

export interface ImplicazioneAssicurativa {
  readonly titolo: string;
  readonly conseguenza: string;
  readonly azione: string;
  readonly riferimento: string | null;
}

export interface AssettoProprietario {
  readonly tipoControllo: TipoControllo;
  readonly tipoControlloEtichetta: string;
  readonly numeroSoci: number;
  readonly soci: readonly SocioDiRilievo[];
  /** Quota del primo socio. `null` se le quote non sono dichiarate. */
  readonly quotaPrimoSocio: number | null;
  /** `true` se le quote note coprono almeno il 99%: sotto, la compagine è incompleta. */
  readonly compagineCompleta: boolean;
  readonly capogruppo: Capogruppo | null;
  /** Presunzione ex art. 2497-sexies c.c. in presenza di controllo societario. */
  readonly soggettaADirezioneECoordinamento: boolean;
  /** Persone la cui uscita bloccherebbe l'impresa: per quota, per carica, o per entrambe. */
  readonly personeChiave: readonly PersonaChiave[];
  readonly caricheDisponibili: boolean;
  /** Le cariche acquisite, per intero. Vuoto finché non si compra il profilo completo. */
  readonly cariche: readonly Carica[];
  readonly implicazioni: readonly ImplicazioneAssicurativa[];
  /** Ciò che il fornitore non dice e va chiesto in intervista. */
  readonly domande: readonly string[];
  readonly confidenza: Confidence;
}

const ETICHETTE: Record<TipoControllo, string> = {
  'socio-unico-persona-fisica': 'Socio unico persona fisica',
  'controllo-societario': 'Controllata da società',
  'maggioranza-persona-fisica': 'Maggioranza in capo a una persona fisica',
  'compagine-paritetica': 'Compagine paritetica',
  'compagine-frammentata': 'Compagine frammentata',
  'non-disponibile': 'Assetto non disponibile',
};

/**
 * La quota come si legge ad alta voce: virgola decimale, e nessuno zero inutile.
 *
 * `66` resta «66», `66.5` diventa «66,5». Non si arrotonda all'intero: una quota è un
 * dato del registro, e mostrarne una diversa da quella della tabella dei soci
 * riaprirebbe la contraddizione che questa funzione serve a chiudere.
 */
function formattaQuota(quota: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(quota);
}

/** Ordina per quota decrescente; i soci senza quota nota restano in fondo. */
function perQuota(a: Socio, b: Socio): number {
  return (b.quotaPercentuale ?? -1) - (a.quotaPercentuale ?? -1);
}

/**
 * Le quote arrivano in due convenzioni: `100` e `1`.
 *
 * Il livello di acquisizione le normalizza già in frazione quando riconosce il formato,
 * ma un valore ≤ 1 può essere tanto «100%» quanto «1%». Si sceglie la lettura in
 * percentuale solo quando l'intera compagine è coerente con essa, perché una quota
 * dell'1% letta come 100% trasformerebbe un socio di minoranza in un controllante.
 */
function quotePercentuali(soci: readonly Socio[]): readonly (number | null)[] {
  const valori = soci.map((s) => s.quotaPercentuale);
  const noti = valori.filter((q): q is number => q !== null);
  if (noti.length === 0) return valori;

  const somma = noti.reduce((t, q) => t + q, 0);
  // Se sommano a circa 1, sono frazioni: si riportano in percentuale.
  const sonoFrazioni = somma > 0 && somma <= 1.01 && noti.every((q) => q <= 1);
  return valori.map((q) => (q === null ? null : sonoFrazioni ? q * 100 : q));
}

export function analizzaAssetto(
  assetti: Assetti | null,
  facts: Pick<CompanyFacts, 'formaGiuridica' | 'addetti'>,
): AssettoProprietario {
  const soci = [...(assetti?.soci ?? [])].sort(perQuota);
  const quote = quotePercentuali(soci);

  const conQuota: SocioDiRilievo[] = soci.map((s, i) => ({
    denominazione: s.denominazione,
    codiceFiscale: s.codiceFiscale,
    tipo: s.tipo,
    quotaPercentuale: quote[i] ?? null,
  }));

  const primo = conQuota[0] ?? null;
  const quotaPrimo = primo?.quotaPercentuale ?? null;
  const sommaNote = conQuota.reduce((t, s) => t + (s.quotaPercentuale ?? 0), 0);

  // Il socio societario che controlla: è lui a definire l'esistenza del gruppo.
  const controllanteSocietaria =
    conQuota.find((s) => s.tipo === 'persona-giuridica' && (s.quotaPercentuale ?? 0) > SOGLIA_CONTROLLO) ??
    null;

  // Un unico socio societario **senza quota dichiarata** è comunque il controllante: nessun
  // altro può esserlo, e ignorarlo perché manca la percentuale nasconderebbe un gruppo.
  //
  // Diverso è il caso di una quota dichiarata e minoritaria: se il dato dice «30%», dice
  // anche che il restante 70% è di qualcun altro, e chiamare controllante quel socio
  // significherebbe contraddire il dato invece di integrarlo.
  const unicoSocioSocietario =
    conQuota.length === 1 &&
    conQuota[0]?.tipo === 'persona-giuridica' &&
    conQuota[0].quotaPercentuale === null
      ? conQuota[0]
      : null;

  const capo = controllanteSocietaria ?? unicoSocioSocietario;

  const capogruppo: Capogruppo | null =
    capo === null
      ? null
      : {
          denominazione: capo.denominazione,
          // Per le società il codice fiscale coincide con la partita IVA: è la chiave
          // con cui questa piattaforma identifica un'impresa, quindi la capogruppo
          // diventa a sua volta analizzabile.
          partitaIva: capo.codiceFiscale,
          quotaPercentuale: capo.quotaPercentuale,
          controlloDiDiritto: (capo.quotaPercentuale ?? 0) > SOGLIA_CONTROLLO,
        };

  const compagineCompleta = sommaNote >= 99;
  const tipoControllo = determinaTipo(conQuota, capogruppo, quotaPrimo, compagineCompleta);

  const cariche = assetti?.cariche ?? [];
  const personeChiave = componiPersoneChiave(conQuota, cariche);
  const caricheDisponibili = cariche.length > 0;

  return {
    tipoControllo,
    tipoControlloEtichetta: ETICHETTE[tipoControllo],
    numeroSoci: conQuota.length,
    soci: conQuota,
    quotaPrimoSocio: quotaPrimo,
    compagineCompleta,
    capogruppo,
    soggettaADirezioneECoordinamento: capogruppo !== null,
    personeChiave,
    caricheDisponibili,
    cariche,
    implicazioni: implicazioni(tipoControllo, capogruppo, personeChiave, facts),
    domande: domande(conQuota, capogruppo, caricheDisponibili, sommaNote),
    // La compagine incompleta abbassa la fiducia: si sta ragionando su una parte.
    confidenza:
      conQuota.length === 0 ? 'bassa' : sommaNote >= 99 ? 'alta' : sommaNote > 0 ? 'media' : 'bassa',
  };
}

/**
 * Unisce i due lati del potere: le quote e le cariche.
 *
 * La deduplica è la parte delicata. La stessa persona compare spesso in entrambi gli
 * elenchi — il socio unico che amministra è la forma più comune di impresa italiana — e
 * senza unirli la scheda stamperebbe due volte lo stesso nome, con due chiavi identiche
 * nell'elenco e una frase che ripete «MARIO ROSSI, MARIO ROSSI detiene…».
 *
 * Il confronto è sul **codice fiscale quando c'è su entrambi i lati**, perché è ciò che
 * identifica una persona; e il codice fiscale si confronta come stringa, mai convertito.
 * In sua assenza si ripiega sul nominativo normalizzato: «ROSSI GIOVANNI» fra i soci e
 * «Giovanni Rossi» fra le cariche sono la stessa persona per un lettore e due per un
 * database — ma due omonimi con codici fiscali diversi restano due persone.
 */
function componiPersoneChiave(
  soci: readonly SocioDiRilievo[],
  cariche: readonly Carica[],
): readonly PersonaChiave[] {
  const perNome = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, ' ');
  // Un nominativo si normalizza anche nell'ordine: «ROSSI MARIO» e «MARIO ROSSI» sono
  // la stessa persona, e il registro non è coerente su quale dei due usa.
  const chiaveNome = (s: string): string => perNome(s).split(' ').sort().join(' ');

  const esiti: PersonaChiave[] = [];
  const indicePerCf = new Map<string, number>();
  const indicePerNome = new Map<string, number>();

  const posizione = (codiceFiscale: string | null, denominazione: string): number | undefined => {
    if (codiceFiscale !== null) {
      const perCf = indicePerCf.get(codiceFiscale.toUpperCase());
      if (perCf !== undefined) return perCf;
    }

    const perNomeTrovato = indicePerNome.get(chiaveNome(denominazione));
    if (perNomeTrovato === undefined) return undefined;

    /*
      Il nome vale solo dove il codice fiscale non può parlare.

      Se **entrambi** hanno un codice fiscale e sono arrivati fin qui, quei codici sono
      diversi: sono due persone omonime, e fonderle attribuirebbe a una la carica
      dell'altra — su un documento che dice chi è assicurato dalla D&O.
    */
    const candidato = esiti[perNomeTrovato];
    if (codiceFiscale !== null && candidato?.codiceFiscale != null) return undefined;

    return perNomeTrovato;
  };

  const registra = (p: PersonaChiave): void => {
    const i = esiti.length;
    esiti.push(p);
    if (p.codiceFiscale !== null) indicePerCf.set(p.codiceFiscale.toUpperCase(), i);
    indicePerNome.set(chiaveNome(p.denominazione), i);
  };

  // I soci che, da soli, hanno i voti per decidere.
  for (const s of soci) {
    if (s.tipo !== 'persona-fisica') continue;
    if ((s.quotaPercentuale ?? 0) < SOGLIA_PERSONA_CHIAVE) continue;
    registra({
      denominazione: s.denominazione,
      codiceFiscale: s.codiceFiscale,
      quotaPercentuale: s.quotaPercentuale,
      ruolo: null,
      rappresentanteLegale: false,
      eta: null,
      motivo: 'quota',
    });
  }

  /*
    Chi ha la rappresentanza legale.

    Si usa il booleano che il fornitore dichiara, non una regex sul testo del ruolo: in
    questo prodotto esistevano già due letture divergenti di «chi rappresenta» — una per
    regex nell'anagrafica estesa e una per booleano nel profilo completo — e aggiungerne
    una terza nel dominio avrebbe reso il concetto indistinguibile da caso a caso.

    Un sindaco o un procuratore non entrano: rispondono, ma la loro uscita non ferma
    l'impresa.
  */
  for (const c of cariche) {
    if (!c.isRappresentanteLegale) continue;

    const gia = posizione(c.codiceFiscale, c.nominativo);
    if (gia !== undefined) {
      const p = esiti[gia];
      if (p === undefined) continue;
      esiti[gia] = {
        ...p,
        codiceFiscale: p.codiceFiscale ?? c.codiceFiscale,
        ruolo: c.ruolo,
        rappresentanteLegale: true,
        eta: c.eta,
        motivo: p.motivo === 'quota' ? 'quota-e-carica' : p.motivo,
      };
      continue;
    }

    registra({
      denominazione: c.nominativo,
      codiceFiscale: c.codiceFiscale,
      quotaPercentuale: null,
      ruolo: c.ruolo,
      rappresentanteLegale: true,
      eta: c.eta,
      motivo: 'carica',
    });
  }

  return esiti;
}

function determinaTipo(
  soci: readonly SocioDiRilievo[],
  capogruppo: Capogruppo | null,
  quotaPrimo: number | null,
  compagineCompleta: boolean,
): TipoControllo {
  if (soci.length === 0) return 'non-disponibile';
  if (capogruppo !== null) return 'controllo-societario';

  // «Socio unico» è un'affermazione, non una constatazione sul numero di righe ricevute:
  // un solo socio noto al 30% significa che il 70% è di altri che il fornitore non ha
  // elencato. Si dichiara socio unico quando le quote lo confermano, oppure quando non
  // ce ne sono affatto — nel qual caso la confidenza è già bassa e lo si dice altrove.
  if (soci.length === 1 && (quotaPrimo === null || compagineCompleta)) {
    return 'socio-unico-persona-fisica';
  }
  if (quotaPrimo === null) return 'compagine-frammentata';
  if (quotaPrimo > SOGLIA_CONTROLLO) return 'maggioranza-persona-fisica';

  // Paritetica è cosa diversa da frammentata: si guarda se i primi due sono **pari**,
  // non se sono in pochi. 40-35-25 non produce stallo, produce una maggioranza mobile;
  // 50-50 e 33-33-33 sì, e sono i due casi che bloccano le decisioni.
  const secondo = soci[1]?.quotaPercentuale ?? null;
  if (secondo !== null && Math.abs(quotaPrimo - secondo) < TOLLERANZA_PARITA) {
    return 'compagine-paritetica';
  }

  return 'compagine-frammentata';
}

function implicazioni(
  tipo: TipoControllo,
  capogruppo: Capogruppo | null,
  personeChiave: readonly PersonaChiave[],
  facts: Pick<CompanyFacts, 'formaGiuridica' | 'addetti'>,
): readonly ImplicazioneAssicurativa[] {
  const esiti: ImplicazioneAssicurativa[] = [];

  if (capogruppo !== null) {
    esiti.push({
      titolo: 'Responsabilità da direzione e coordinamento',
      conseguenza: `La partecipazione di controllo di ${capogruppo.denominazione} fa presumere l’esercizio di direzione e coordinamento: la capogruppo e i suoi amministratori rispondono verso i soci e i creditori di questa società.`,
      azione:
        'Verificare che la D&O sia estesa alle società del gruppo e agli incarichi ricoperti in esse (outside directorship), oppure stipularla a livello di capogruppo.',
      riferimento: 'Artt. 2497 e 2497-sexies c.c.',
    });
    esiti.push({
      titolo: 'Esposizione da valutare a livello di gruppo',
      conseguenza:
        'Sinistri e responsabilità delle società collegate possono erodere lo stesso massimale e coinvolgere gli stessi patrimoni.',
      azione:
        'Analizzare anche la controllante e le altre società del gruppo prima di dimensionare i massimali.',
      riferimento: null,
    });
  }

  /*
    Tre frasi, non una — e la quota si dice, non si aggettiva.

    La formulazione unica diceva «detiene la quasi totalità del capitale», e sarebbe
    diventata falsa nel momento stesso in cui le persone chiave hanno cominciato a
    comprendere gli amministratori: un amministratore delegato senza quote non detiene
    niente.

    Restava falsa anche per chi le quote le ha. La soglia di persona chiave è il 66%:
    «quasi totalità» veniva detto a chi ne detiene esattamente due terzi, **una riga sotto
    il 66% stampato nella tabella dei soci**. Chi legge vede i due numeri insieme, e il
    superlativo li contraddice. Il valore c'è: si scrive quello, come ovunque in questo
    prodotto — frammenti fissi più i valori del dato.
  */
  for (const p of personeChiave) {
    const detiene =
      p.quotaPercentuale === null
        ? // Non capita per i motivi `quota`, dove la soglia è stata superata su un numero.
          // Se capitasse, meglio una frase vera e vaga che una percentuale inventata.
          'detiene una partecipazione di controllo'
        : `detiene il ${formattaQuota(p.quotaPercentuale)}% del capitale`;

    const perche =
      p.motivo === 'quota'
        ? detiene
        : p.motivo === 'carica'
          ? // La carica arriva in inglese dall'archivio («chairman of board of directors»):
            // si stampa tradotta, come nel riquadro delle cariche, non grezza.
            `ha la rappresentanza legale${p.ruolo === null ? '' : ` (${(traduciDescrizioneArchivio(p.ruolo) ?? p.ruolo).toLowerCase()})`}`
          : `${detiene} e ne ha la rappresentanza legale`;

    esiti.push({
      titolo: `Persona chiave — ${p.denominazione}`,
      conseguenza: `${p.denominazione} ${perche}: la sua assenza improvvisa blocca le decisioni sociali e, di norma, i rapporti commerciali e bancari.`,
      azione:
        'Proporre una copertura key man commisurata al margine perso in un esercizio, e verificare l’esistenza di patti successori o di continuità.',
      riferimento: null,
    });
  }

  if (tipo === 'compagine-paritetica') {
    esiti.push({
      titolo: 'Rischio di stallo decisionale',
      conseguenza:
        'Nessun socio dispone della maggioranza: il disaccordo fra i soci può paralizzare le decisioni, compresa la gestione di un sinistro rilevante.',
      azione:
        'Verificare l’esistenza di clausole di risoluzione dello stallo e valutare una copertura sulle controversie fra soci.',
      riferimento: null,
    });
  }

  /*
    La norma non è la stessa per tutte le società di capitali.

    Qui c'era «Artt. 2392 ss. c.c.» per srl, srls, spa, sapa e cooperativa insieme: sono
    le norme della S.p.A. Su una S.r.l. — la forma della quasi totalità del portafoglio —
    la responsabilità degli amministratori è retta dall'art. 2476 c.c.
  */
  const normaAmministratori = normaResponsabilitaAmministratori(facts.formaGiuridica);

  if (normaAmministratori !== null) {
    esiti.push({
      titolo: 'Responsabilità personale degli amministratori',
      conseguenza:
        'Gli amministratori rispondono con il patrimonio personale verso la società, i creditori sociali e i terzi, anche per omessa istituzione di assetti organizzativi adeguati.',
      azione:
        'Verificare la presenza e i massimali della D&O, e l’estensione alla responsabilità per crisi d’impresa.',
      riferimento: `${normaAmministratori} · art. 2086 c.c.`,
    });
  }

  return esiti;
}

function domande(
  soci: readonly SocioDiRilievo[],
  capogruppo: Capogruppo | null,
  caricheDisponibili: boolean,
  sommaQuote: number,
): readonly string[] {
  const elenco: string[] = [];

  if (!caricheDisponibili) {
    // Il fornitore non restituisce le cariche a questo livello di acquisizione: si chiede,
    // non si deduce. Un amministratore ipotizzato finirebbe su un documento contrattuale.
    elenco.push(
      'Chi sono gli amministratori e chi ha la rappresentanza legale? La carica determina chi è assicurato dalla D&O.',
    );
  }

  if (soci.length === 0) {
    elenco.push('Qual è la compagine sociale? Nessun socio risulta dai dati camerali disponibili.');
  } else if (sommaQuote > 0 && sommaQuote < 99) {
    elenco.push(
      `Le quote note coprono il ${Math.round(sommaQuote)}% del capitale: a chi fa capo la parte restante?`,
    );
  }

  if (capogruppo !== null) {
    elenco.push(
      `Esiste una D&O di gruppo stipulata da ${capogruppo.denominazione}, o ogni società ha la propria?`,
    );
  }

  elenco.push(
    'Vi sono soci o amministratori con cariche in altre società? Le responsabilità assunte altrove rientrano nella copertura solo se dichiarate.',
  );

  return elenco;
}
