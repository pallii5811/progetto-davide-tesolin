/**
 * Property Risk, come lo definisce il foglio «Veezco_Analisi Rischio.xlsx».
 *
 *   Property Risk     = 30% × rischio dell'attività + 20% × tipo di sito + 50% × pericoli naturali
 *   Pericoli naturali = 50% × pericolo massimo + 50% × pericolo medio
 *
 * Tre punteggi da 1 a 7, pesati. I pesi, le tabelle dell'attività e del tipo di sito vengono
 * dal foglio (`tabelle-veezco.ts`), non da qui.
 *
 * I PUNTEGGI DEI PERICOLI NON VENGONO DAL FOGLIO, E LO SI DICE. Il foglio rinvia a una tabella
 * «Natural_Hazard_Risk» che nel file non c'è, e ne indica le fonti: ISPRA e INGV. Al suo posto,
 * per decisione di Simone del 14/09/2026, le classi ufficiali convertite a gradini uguali:
 *
 *   terremoto  zona sismica del comune (Protezione Civile)   4 → 1 · 3 → 3 · 2 → 5 · 1 → 7
 *   alluvione  ISPRA IdroGEO, dato del comune                bassa → 1 · media → 4 · alta → 7
 *   frana      ISPRA IdroGEO, dato del comune                bassa → 1 · media → 4 · alta → 7
 *
 * L'alluvione è il dato comunale e non la classe ISPRA sul punto della sede: misurata il
 * 14/09/2026, la lettura sul punto non rispondeva in venti secondi su quattro punti di prova su
 * sei, delta del Po compreso. Il pericolo medio è la media dei tre, come dice la formula scritta
 * nel foglio. Se uno dei tre manca — comune fuori dagli archivi — la voce resta non calcolabile,
 * e con lei il Property dell'ubicazione: nessun pericolo si stima dagli altri due.
 *
 * I conti si fanno in centesimi di punto, arrotondando ogni passaggio come viene stampato: il
 * pericolo medio, i pericoli naturali e ciascun contributo. Chi rifà il conto con i numeri della
 * scheda trova lo stesso totale, invece di uno che differisce di un centesimo.
 */

import type { TipoUnitaLocale } from '../company/profile.js';
import type { ExposureLevel } from '../risk/geo.js';
import { livelloFrana, livelloIdraulico } from '../risk/idrogeo.js';
import type { IndicatoriIdrogeo } from '../risk/idrogeo.js';
import { PESI_PROPERTY, RISCHIO_ATTIVITA, RISCHIO_TIPO_DI_SITO } from './tabelle-veezco.js';
import type { RigaAttivita } from './tabelle-veezco.js';

/** Una riga del calcolo: il punteggio da 1 a 7, il peso del foglio, e quanto porta al totale. */
export interface VoceDiCalcolo {
  readonly voce: string;
  /** Da 1 a 7. `null` dove non si può calcolare: mai uno zero al suo posto. */
  readonly punteggio: number | null;
  readonly peso: number;
  /** Punteggio × peso, al centesimo; `null` se manca il punteggio. */
  readonly contributo: number | null;
  /** Da dove viene il punteggio, detto per esteso. */
  readonly dettaglio: string;
}

export interface UbicazionePerProperty {
  readonly id: string;
  readonly etichetta: string;
  readonly tipo: TipoUnitaLocale | null;
  /** Zona sismica ufficiale del comune, da 1 a 4; `null` se il comune non è classificato. */
  readonly zonaSismica: 1 | 2 | 3 | 4 | null;
  /** Indicatori ISPRA IdroGEO del comune; `null` se il comune non è nell'archivio. */
  readonly indicatoriIdrogeo: IndicatoriIdrogeo | null;
}

/**
 * I punteggi da 1 a 7 di una sede, uno per voce: quelli che il popup mostra come lancette.
 *
 * Sono gli stessi numeri delle voci, non un secondo calcolo: `attivita` è il punteggio della voce
 * Attività, `pericoliNaturali` quello della voce Pericoli naturali. Nella slide di Luca l'attività si
 * chiama «Rischio evento fiamme o esplosione», che è la definizione del foglio: «intrinsic fire,
 * explosion and process hazard of the activity».
 */
export interface PunteggiUbicazione {
  readonly attivita: number | null;
  readonly tipoDiSito: number | null;
  readonly terremoto: number | null;
  readonly alluvione: number | null;
  readonly frana: number | null;
  readonly pericoliNaturali: number | null;
}

/** Da dove viene ciascun pericolo, in poche parole: la didascalia sotto la sua lancetta. */
export interface DidascaliePericoli {
  readonly terremoto: string;
  readonly alluvione: string;
  readonly frana: string;
}

export interface PropertyUbicazione {
  readonly id: string;
  readonly etichetta: string;
  readonly voci: readonly VoceDiCalcolo[];
  /** Somma dei contributi; `null` se anche una sola voce manca. */
  readonly punteggio: number | null;
  readonly punteggi: PunteggiUbicazione;
  readonly didascalie: DidascaliePericoli;
}

export interface PropertyRisk {
  readonly formula: string;
  readonly formulaPericoliNaturali: string;
  /** Come le classi dei pericoli diventano punteggi: la tabella che nel foglio manca. */
  readonly scalaPericoliNaturali: string;
  readonly divisioneAteco: string | null;
  readonly titoloDivisione: string | null;
  /** Il punteggio dell'ubicazione più esposta, da 1 a 7. */
  readonly punteggio: number | null;
  /** Perché il punteggio manca, in una frase; `null` quando c'è. */
  readonly motivoNonCalcolabile: string | null;
  readonly ubicazioneDiRiferimento: string | null;
  readonly ubicazioni: readonly PropertyUbicazione[];
  readonly note: readonly string[];
}

const percentuale = (peso: number): string => `${Math.round(peso * 100)}%`;

export const FORMULA_PROPERTY =
  `Property Risk = ${percentuale(PESI_PROPERTY.attivita)} × rischio dell’attività + ` +
  `${percentuale(PESI_PROPERTY.tipoDiSito)} × tipo di sito + ` +
  `${percentuale(PESI_PROPERTY.pericoliNaturali)} × pericoli naturali`;

/** Alla lettera dal foglio: «50% × max hazard + 50% × average hazard». */
export const FORMULA_PERICOLI_NATURALI =
  'Pericoli naturali = 50% × pericolo massimo + 50% × pericolo medio';

/** Decisione di Simone del 14/09/2026, al posto della tabella «Natural_Hazard_Risk». */
export const PUNTEGGIO_ZONA_SISMICA: Readonly<Record<1 | 2 | 3 | 4, number>> = { 4: 1, 3: 3, 2: 5, 1: 7 };
export const PUNTEGGIO_LIVELLO_ISPRA: Readonly<Record<ExposureLevel, number>> = {
  bassa: 1,
  media: 4,
  alta: 7,
};

export const SCALA_PERICOLI_NATURALI =
  'Punteggi dei pericoli: terremoto per zona sismica 4 → 1, 3 → 3, 2 → 5, 1 → 7; ' +
  'alluvione e frana, pericolosità ISPRA del comune: bassa → 1, media → 4, alta → 7';

/** Le fasce del foglio, in italiano. */
const FASCIA: Readonly<Record<string, string>> = {
  'Very Low': 'molto bassa',
  Low: 'bassa',
  'Low-Medium': 'medio-bassa',
  Medium: 'media',
  'Medium-High': 'medio-alta',
  High: 'alta',
  'Very High': 'molto alta',
};

/*
  Il tipo di sito come lo conosce questo prodotto, portato sul vocabolario del foglio.

  Solo i quattro tipi che hanno una destinazione d'uso fisica. Sede legale, sede operativa e
  «altro» sono classificazioni amministrative — il foglio le chiama «Sede secondaria» e
  «Unknown / Other», senza punteggio, e prescrive per loro di usare l'attività. È anche il caso
  di quasi ogni impresa vera: il registro dichiara solo SSL e UL (vedi `normalizzaTipoUnitaLocale`
  nel mappatore), mai stabilimento o magazzino.

  «magazzino» qui comprende anche il deposito, che il mappatore non distingue e il foglio
  valuta un punto in meno: il dettaglio lo dice.
*/
const TIPO_DEL_FOGLIO: Partial<Record<TipoUnitaLocale, string>> = {
  ufficio: 'Ufficio',
  'punto-vendita': 'Negozio',
  magazzino: 'Magazzino',
  stabilimento: 'Stabilimento',
};

export function tipoDiSitoDelFoglio(
  tipo: TipoUnitaLocale | null,
): { tipo: string; punteggio: number } | null {
  if (tipo === null) return null;
  const nome = TIPO_DEL_FOGLIO[tipo];
  if (nome === undefined) return null;
  const riga = RISCHIO_TIPO_DI_SITO.find((r) => r.tipo === nome);
  return riga === undefined || riga.punteggio === null
    ? null
    : { tipo: riga.tipo, punteggio: riga.punteggio };
}

/** Divisione intera arrotondata a metà per eccesso, per numeratori non negativi. */
function arrotonda(numeratore: number, denominatore: number): number {
  return Math.floor((2 * numeratore + denominatore) / (2 * denominatore));
}

const pesoInPercento = (peso: number): number => Math.round(peso * 100);

/**
 * La formula dei pericoli naturali, come è scritta nel foglio: metà il pericolo massimo, metà
 * il pericolo medio dei tre.
 *
 * Il medio si arrotonda al centesimo PRIMA di entrare nella formula, perché è quello il numero
 * che la scheda stampa: con 6, 2 e 3 il medio stampato è 3,67 e i pericoli 50% × 6 + 50% × 3,67
 * = 4,84, che è il conto di chi legge. Tenere il medio esatto darebbe 4,83, e la scheda
 * mostrerebbe un risultato che non torna con i suoi stessi numeri.
 *
 * Nell'esempio del foglio la cella calcola invece 6 × 50% + 2,5 × 50%: il 2,5 è la media dei due
 * pericoli diversi dal massimo. Simone ha scelto la formula scritta, la media dei tre.
 */
export function pericoliNaturali(
  alluvione: number,
  terremoto: number,
  frana: number,
): { readonly massimo: number; readonly medio: number; readonly punteggio: number } {
  const massimo = Math.max(alluvione, terremoto, frana);
  const medioCentesimi = arrotonda((alluvione + terremoto + frana) * 100, 3);
  const punteggioCentesimi = arrotonda(massimo * 100 * 50 + medioCentesimi * 50, 100);
  return { massimo, medio: medioCentesimi / 100, punteggio: punteggioCentesimi / 100 };
}

/** Con la virgola e senza decimali inutili: «3», «3,67». */
function numero(valore: number): string {
  return Number.isInteger(valore) ? String(valore) : valore.toFixed(2).replace('.', ',');
}

/** Una percentuale come la pubblica ISPRA: un decimale, e nessuno quando è inutile. */
function quota(valore: number): string {
  const arrotondato = Math.round(valore * 10) / 10;
  return `${String(arrotondato).replace('.', ',')} %`;
}

/**
 * Le due quote idrauliche come ISPRA le pubblica: la media comprende l'elevata, e una quota che
 * ISPRA non pubblica si dice invece di stamparla come numero.
 */
function quoteIdrauliche(elevata: number | null, mediaOElevata: number | null): string {
  // Senza imprese in area media non ce ne sono nemmeno in area elevata, che vi è compresa.
  if (mediaOElevata === 0 && (elevata === null || elevata === 0)) {
    return 'senza imprese in area media o elevata';
  }
  if (elevata !== null && mediaOElevata !== null) {
    return `con ${quota(elevata)} delle imprese in area elevata e ${quota(mediaOElevata)} in area media o elevata`;
  }
  if (mediaOElevata !== null) {
    return `con ${quota(mediaOElevata)} delle imprese in area media o elevata; la quota della sola elevata non è pubblicata`;
  }
  if (elevata !== null) {
    return `con ${quota(elevata)} delle imprese in area elevata; la quota in area media non è pubblicata`;
  }
  return 'senza quote di imprese pubblicate';
}

interface Pericoli {
  readonly voce: VoceDiCalcolo;
  /** In centesimi di punto; `null` se la voce non si calcola. */
  readonly contributoCentesimi: number | null;
  readonly punteggi: Pick<PunteggiUbicazione, 'terremoto' | 'alluvione' | 'frana' | 'pericoliNaturali'>;
  readonly didascalie: DidascaliePericoli;
}

function vocePericoli(u: UbicazionePerProperty): Pericoli {
  const peso = PESI_PROPERTY.pericoliNaturali;
  const ind = u.indicatoriIdrogeo;
  const zona = u.zonaSismica;

  const livelloAlluvione = ind === null ? null : livelloIdraulico(ind);
  const livelloFrane = ind === null ? null : livelloFrana(ind);

  /*
    Ogni pericolo ha due frasi: quella lunga, che dice da dove esce il punteggio, e quella breve,
    che basta quando il pericolo compare solo come «disponibile» accanto a uno che manca.

    Le frasi lunghe NON condividono le parole. La prima versione diceva per l'alluvione e per la
    frana «(ISPRA, comune: bassa, 0 % delle imprese in pericolosità elevata…)» con le stesse
    parole, e il collaudo dei rilevatori di testo l'ha fermata: sulla stessa riga la stessa cosa
    detta due volte si legge come una frase fatta con lo stampino. Chi cambia queste frasi faccia
    girare scripts/rilievi-testo-property.ts, che le compone su ogni comune degli archivi.
  */
  const alluvione =
    ind === null || livelloAlluvione === null
      ? null
      : {
          punti: PUNTEGGIO_LIVELLO_ISPRA[livelloAlluvione],
          breve: `alluvione ${PUNTEGGIO_LIVELLO_ISPRA[livelloAlluvione]}`,
          testo:
            `Alluvione ${PUNTEGGIO_LIVELLO_ISPRA[livelloAlluvione]}: pericolosità idraulica ${livelloAlluvione} ` +
            `nel comune secondo ISPRA, ${quoteIdrauliche(ind.impIdrA, ind.impIdrM)}.`,
        };
  const terremoto =
    zona === null
      ? null
      : {
          punti: PUNTEGGIO_ZONA_SISMICA[zona],
          breve: `terremoto ${PUNTEGGIO_ZONA_SISMICA[zona]} (zona sismica ${zona})`,
          testo: `Terremoto ${PUNTEGGIO_ZONA_SISMICA[zona]}: zona sismica ${zona}.`,
        };
  const frana =
    ind === null || livelloFrane === null || ind.impFrnA === null
      ? null
      : {
          punti: PUNTEGGIO_LIVELLO_ISPRA[livelloFrane],
          breve: `frana ${PUNTEGGIO_LIVELLO_ISPRA[livelloFrane]}`,
          testo:
            `Frana ${PUNTEGGIO_LIVELLO_ISPRA[livelloFrane]}: pericolosità da frana ${livelloFrane}, con ` +
            `${quota(ind.impFrnA)} delle imprese dove è elevata o molto elevata.`,
        };

  /*
    Le didascalie sotto le lancette: brevi, e ciascuna con parole sue. Stanno una per lancetta,
    quindi non devono ripetere la frase lunga del dettaglio, che la sezione stampa già.
  */
  const didascalie: DidascaliePericoli = {
    terremoto: zona === null ? 'comune non classificato' : `zona sismica ${zona}`,
    alluvione:
      ind === null
        ? 'comune fuori dall’archivio ISPRA'
        : livelloAlluvione === null
          ? 'quote ISPRA non pubblicate'
          : `pericolosità idraulica ${livelloAlluvione} nel comune`,
    frana:
      ind === null
        ? 'comune fuori dall’archivio ISPRA'
        : livelloFrane === null
          ? 'quota ISPRA non pubblicata'
          : `pericolosità da frana ${livelloFrane} nel comune`,
  };
  const punteggiDisponibili = {
    terremoto: terremoto?.punti ?? null,
    alluvione: alluvione?.punti ?? null,
    frana: frana?.punti ?? null,
  };

  if (alluvione === null || terremoto === null || frana === null) {
    /*
      Frasi separate da un punto, non appese dopo «Non calcolabile:»: due due-punti nella stessa
      frase — «Non calcolabile: alluvione e frana: il comune…» — sono uno dei difetti che i
      rilevatori di testo cercano.
    */
    const mancanti = [
      ...(ind === null ? ['alluvione e frana: il comune non è nell’archivio ISPRA IdroGEO'] : []),
      ...(ind !== null && alluvione === null
        ? ['alluvione: ISPRA non pubblica per questo comune le quote che servono a stabilire il livello']
        : []),
      ...(ind !== null && frana === null
        ? ['frana: ISPRA non pubblica per questo comune la quota di imprese in area da frana']
        : []),
      ...(zona === null ? ['terremoto: il comune non è nella classificazione sismica'] : []),
    ].join('; ');
    const presenti = [alluvione, terremoto, frana]
      .filter((p): p is { punti: number; breve: string; testo: string } => p !== null)
      .map((p) => p.breve);
    return {
      voce: {
        voce: 'Pericoli naturali',
        punteggio: null,
        peso,
        contributo: null,
        dettaglio:
          `Non calcolabile. ${mancanti.charAt(0).toUpperCase()}${mancanti.slice(1)}.` +
          (presenti.length === 0
            ? ''
            : ` ${presenti.length === 1 ? 'Disponibile' : 'Disponibili'}: ${presenti.join(', ')}.`) +
          ' Nessun pericolo si stima dagli altri.',
      },
      contributoCentesimi: null,
      punteggi: { ...punteggiDisponibili, pericoliNaturali: null },
      didascalie,
    };
  }

  const calcolo = pericoliNaturali(alluvione.punti, terremoto.punti, frana.punti);
  const punteggioCentesimi = Math.round(calcolo.punteggio * 100);
  const contributoCentesimi = arrotonda(punteggioCentesimi * pesoInPercento(peso), 100);

  return {
    voce: {
      voce: 'Pericoli naturali',
      punteggio: calcolo.punteggio,
      peso,
      contributo: contributoCentesimi / 100,
      dettaglio:
        `${alluvione.testo} ${terremoto.testo} ${frana.testo} ` +
        `Massimo ${numero(calcolo.massimo)}, medio ${numero(calcolo.medio)}: ` +
        `50% × ${numero(calcolo.massimo)} + 50% × ${numero(calcolo.medio)} = ${numero(calcolo.punteggio)}.`,
    },
    contributoCentesimi,
    punteggi: { ...punteggiDisponibili, pericoliNaturali: calcolo.punteggio },
    didascalie,
  };
}

export function calcolaPropertyRisk(
  divisioneAteco: string | null,
  ubicazioni: readonly UbicazionePerProperty[],
): PropertyRisk {
  const riga: RigaAttivita | null =
    divisioneAteco === null ? null : (RISCHIO_ATTIVITA[divisioneAteco] ?? null);
  const deposito = RISCHIO_TIPO_DI_SITO.find((r) => r.tipo === 'Deposito')?.punteggio ?? null;

  const contributoAttivitaCentesimi =
    riga === null ? null : riga.punteggio * pesoInPercento(PESI_PROPERTY.attivita);
  const voceAttivita: VoceDiCalcolo =
    riga === null || contributoAttivitaCentesimi === null
      ? {
          voce: 'Attività',
          punteggio: null,
          peso: PESI_PROPERTY.attivita,
          contributo: null,
          dettaglio:
            divisioneAteco === null
              ? 'ATECO non disponibile.'
              : `La divisione ATECO ${divisioneAteco} non è nella tabella del foglio, che segue la classificazione ATECO 2025.`,
        }
      : {
          voce: `Attività · ATECO ${divisioneAteco ?? ''}`,
          punteggio: riga.punteggio,
          peso: PESI_PROPERTY.attivita,
          contributo: contributoAttivitaCentesimi / 100,
          dettaglio: `${riga.titolo}, fascia ${FASCIA[riga.fascia] ?? riga.fascia}.`,
        };

  const perUbicazione = ubicazioni.map((u): PropertyUbicazione => {
    const sito = tipoDiSitoDelFoglio(u.tipo);
    const punteggioSito = sito !== null ? sito.punteggio : riga !== null ? riga.punteggio : null;
    const contributoSitoCentesimi =
      punteggioSito === null ? null : punteggioSito * pesoInPercento(PESI_PROPERTY.tipoDiSito);
    const voceSito: VoceDiCalcolo = {
      voce: 'Tipo di sito',
      punteggio: punteggioSito,
      peso: PESI_PROPERTY.tipoDiSito,
      contributo: contributoSitoCentesimi === null ? null : contributoSitoCentesimi / 100,
      dettaglio:
        sito !== null
          ? u.tipo === 'magazzino' && deposito !== null
            ? `${sito.tipo}, che il registro non distingue dal deposito (nel foglio ${deposito}).`
            : `${sito.tipo}.`
          : riga === null
            ? 'Il registro non indica la destinazione d’uso della sede, e senza l’attività manca anche il ripiego previsto dal foglio.'
            : 'Il registro non indica la destinazione d’uso della sede: il foglio prescrive di usare il punteggio dell’attività.',
    };
    const pericoli = vocePericoli(u);

    const contributi = [contributoAttivitaCentesimi, contributoSitoCentesimi, pericoli.contributoCentesimi];
    const completa = contributi.every((c) => c !== null);
    const somma = contributi.reduce<number>((totale, c) => totale + (c ?? 0), 0);
    return {
      id: u.id,
      etichetta: u.etichetta,
      voci: [voceAttivita, voceSito, pericoli.voce],
      punteggio: completa ? somma / 100 : null,
      punteggi: {
        attivita: voceAttivita.punteggio,
        tipoDiSito: voceSito.punteggio,
        ...pericoli.punteggi,
      },
      didascalie: pericoli.didascalie,
    };
  });

  let riferimento: { etichetta: string; punteggio: number } | null = null;
  for (const u of perUbicazione) {
    if (u.punteggio === null) continue;
    if (riferimento === null || u.punteggio > riferimento.punteggio) {
      riferimento = { etichetta: u.etichetta, punteggio: u.punteggio };
    }
  }

  const motivoNonCalcolabile =
    riferimento !== null
      ? null
      : ubicazioni.length === 0
        ? 'Nessuna ubicazione risulta dai dati disponibili'
        : riga === null
          ? 'Senza la divisione ATECO nella tabella del foglio manca il rischio dell’attività'
          : 'Su nessuna ubicazione sono disponibili tutti e tre i pericoli naturali';

  const note = [
    'Il foglio rinvia, per i pericoli naturali, alla tabella «Natural_Hazard_Risk», che nel file non è presente, e ' +
      'ne indica le fonti: ISPRA e INGV. Al suo posto, per decisione del 14/09/2026, i pericoli si leggono dalle ' +
      `fonti ufficiali e diventano punteggi a gradini uguali. ${SCALA_PERICOLI_NATURALI}.`,
    'Alluvione e frana sono il dato del comune, non della singola sede: la quota di imprese del comune in area a ' +
      'pericolosità secondo ISPRA IdroGEO. Dove la decisione pesa, la verifica sull’indirizzo resta necessaria. ' +
      'Bassa, media e alta seguono le soglie di AEGIS sulla quota di imprese: alluvione alta dal 15% in pericolosità ' +
      'elevata o dal 40% fra elevata e media, media dal 3% o dal 15%; frana alta dal 10% in pericolosità elevata o ' +
      'molto elevata, media dal 2%.',
    'Il pericolo medio è la media dei tre pericoli, come dice la formula scritta nel foglio (l’esempio del foglio usa ' +
      'invece la media dei due più bassi). Medio, pericoli naturali e contributi sono arrotondati al centesimo, perché ' +
      'il conto torni con i numeri stampati.',
    'Il rischio dell’attività usa l’ATECO primario dell’impresa per ogni ubicazione, perché il registro non ' +
      'codifica l’attività di ciascuna sede.',
    ...(ubicazioni.length > 1
      ? ['Con più ubicazioni vale per l’impresa il punteggio dell’ubicazione più esposta.']
      : []),
    ...(ubicazioni.length === 0 ? ['Nessuna ubicazione risulta dai dati disponibili.'] : []),
  ];

  return {
    formula: FORMULA_PROPERTY,
    formulaPericoliNaturali: FORMULA_PERICOLI_NATURALI,
    scalaPericoliNaturali: SCALA_PERICOLI_NATURALI,
    divisioneAteco,
    titoloDivisione: riga?.titolo ?? null,
    punteggio: riferimento?.punteggio ?? null,
    motivoNonCalcolabile,
    ubicazioneDiRiferimento: riferimento?.etichetta ?? null,
    ubicazioni: perUbicazione,
    note,
  };
}
