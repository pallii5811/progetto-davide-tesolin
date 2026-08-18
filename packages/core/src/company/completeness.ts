/**
 * Completezza dei dati di intervista.
 *
 * Il problema che risolve non è cosmetico. L'analisi funziona anche a questionario vuoto,
 * ma con confidenza bassa: i fabbricati vengono stimati dal valore contabile invece che dai
 * metri quadri, metà dei rischi resta «da verificare», le somme assicurande sono ipotesi.
 *
 * Perché il broker compili il questionario deve vedere **cosa ci guadagna**. Ogni campo qui
 * dichiara quale parte dell'analisi migliora e di quanto pesa. Non è una barra di
 * avanzamento: è un elenco ordinato di ciò che conviene chiedere al cliente per primo.
 */

import type { DatiDichiarati } from './profile.js';
import type { CompanyFacts } from './facts.js';

export type AreaAnalisi = 'somme-assicurande' | 'identificazione-rischi' | 'massimali' | 'conformita';

export const AREA_LABEL: Readonly<Record<AreaAnalisi, string>> = {
  'somme-assicurande': 'Somme assicurande',
  'identificazione-rischi': 'Identificazione dei rischi',
  massimali: 'Dimensionamento dei massimali',
  conformita: 'Verifiche di conformità',
};

export interface CampoIntervista {
  readonly chiave: string;
  readonly etichetta: string;
  /** Peso relativo nel calcolo della completezza. */
  readonly peso: number;
  readonly area: AreaAnalisi;
  /** Cosa migliora concretamente compilandolo. È il testo che convince a chiederlo. */
  readonly beneficio: string;
  readonly compilato: (dati: DatiDichiarati) => boolean;
  /**
   * Se la domanda ha senso per **questa** impresa.
   *
   * Chiedere a uno studio di architettura se trasporta merci proprie non è solo inutile:
   * abbassa la completezza per una risposta che non cambierebbe nulla, e allunga
   * un'intervista che il cliente concede una volta sola. Assente significa «vale per
   * tutti», che è il caso della maggior parte delle domande.
   */
  readonly pertinente?: (facts: CompanyFacts) => boolean;
}

/**
 * Divisione ATECO come numero. `null` quando il codice non è noto: in quel caso la
 * domanda va posta comunque, perché escluderla sarebbe una decisione presa al buio.
 */
function divisione(facts: CompanyFacts): number | null {
  if (facts.atecoDivisione === null) return null;
  const n = Number.parseInt(facts.atecoDivisione, 10);
  return Number.isNaN(n) ? null : n;
}

/** Chi immette prodotti finiti sul mercato o li commercia: risponde del prodotto. */
function immetteProdotti(facts: CompanyFacts): boolean {
  const d = divisione(facts);
  if (d === null) return true;
  // Manifatturiero e agricoltura trasformano, il commercio rivende. I servizi no, e la
  // domanda sulla RC Prodotti non ha oggetto.
  return facts.atecoSezione === 'C' || facts.atecoSezione === 'A' || d === 46 || d === 47;
}

/**
 * Attività che si svolgono, per loro natura, anche presso il cliente o in cantiere.
 *
 * La soglia è tenuta **bassa di proposito**: l'errore di escludere non è simmetrico a
 * quello di includere. Una domanda in più costa venti secondi di intervista; una domanda
 * tolta a torto nasconde un'esposizione RCT che nessuno rileverà più — e il manifatturiero
 * installa e ripara dal cliente quasi quanto chi costruisce.
 */
function operaPressoTerzi(facts: CompanyFacts): boolean {
  const d = divisione(facts);
  if (d === null) return true;
  // Restano fuori solo i settori che lavorano esclusivamente nella propria sede:
  // commercio al dettaglio, ricettività, finanza, immobiliare.
  const soloInSede = d === 47 || d === 55 || d === 56 || (d >= 64 && d <= 68);
  return !soloInSede;
}

/** Chi movimenta merci proprie: senza merci, la domanda non ha oggetto. */
function movimentaMerci(facts: CompanyFacts): boolean {
  const d = divisione(facts);
  if (d === null) return true;
  return (
    facts.atecoSezione === 'C' ||
    facts.atecoSezione === 'A' ||
    facts.atecoSezione === 'F' ||
    (d >= 45 && d <= 53)
  );
}

const CAMPI: readonly CampoIntervista[] = [
  {
    chiave: 'immobili-superficie',
    etichetta: 'Superficie degli immobili (mq)',
    peso: 10,
    area: 'somme-assicurande',
    beneficio:
      'È il singolo dato che più riduce il rischio di sottoassicurazione: senza metri quadri i fabbricati ' +
      'vengono stimati dal valore contabile, già decurtato dagli ammortamenti.',
    compilato: (d) => d.immobili.length > 0 && d.immobili.some((i) => i.superficieMq !== null),
  },
  {
    chiave: 'immobili-tipologia',
    etichetta: 'Tipologia costruttiva degli immobili',
    peso: 4,
    area: 'somme-assicurande',
    beneficio:
      'Determina il costo di ricostruzione al metro quadro: fra prefabbricato e muratura corrono 300 €/mq.',
    compilato: (d) => d.immobili.some((i) => i.tipologiaCostruttiva !== null),
  },
  {
    chiave: 'immobili-titolo',
    etichetta: 'Titolo di occupazione (proprietà o locazione)',
    peso: 4,
    area: 'conformita',
    beneficio:
      'Sui locali in locazione va verificata la ripartizione contrattuale dell’onere assicurativo e la ' +
      'rinuncia alla rivalsa verso il locatore.',
    compilato: (d) => d.immobili.length > 0,
  },
  {
    chiave: 'protezioni',
    etichetta: 'Impianto antincendio e allarme',
    peso: 6,
    area: 'identificazione-rischi',
    beneficio:
      'Sono i controlli che riducono il rischio residuo: senza, incendio e furto restano al livello inerente ' +
      'e la proposta risulta sovradimensionata.',
    compilato: (d) =>
      d.immobili.some((i) => i.presenzaImpiantoAntincendio !== null || i.presenzaAllarme !== null),
  },
  {
    chiave: 'dipendenti',
    etichetta: 'Numero di dipendenti',
    peso: 8,
    area: 'massimali',
    beneficio:
      'Attiva RCO e infortuni, e concorre alla classificazione dimensionale che determina la scadenza CAT NAT.',
    compilato: (d) => d.numeroDipendenti !== null,
  },
  {
    chiave: 'veicoli',
    etichetta: 'Numero di veicoli aziendali',
    peso: 5,
    area: 'identificazione-rischi',
    beneficio: 'Determina se proporre la gestione a libro matricola e le garanzie accessorie sulla flotta.',
    compilato: (d) => d.numeroVeicoli !== null,
  },
  {
    chiave: 'export',
    etichetta: 'Quota di export e mercati di destinazione',
    peso: 9,
    area: 'massimali',
    beneficio:
      'L’export verso USA e Canada raddoppia il massimale RC Prodotti consigliato e impone l’estensione ' +
      'territoriale: ometterlo è l’errore più costoso del questionario.',
    compilato: (d) => d.quotaExportPercentuale !== null || d.esportaVersoUsaCanada !== null,
  },
  {
    chiave: 'dati-personali',
    etichetta: 'Trattamento di dati personali e categorie particolari',
    peso: 7,
    area: 'massimali',
    beneficio: 'Dimensiona il massimale cyber e l’esposizione sanzionatoria GDPR.',
    compilato: (d) => d.trattaDatiPersonali !== null,
  },
  {
    chiave: 'ecommerce',
    etichetta: 'Presenza di canale e-commerce',
    peso: 3,
    area: 'identificazione-rischi',
    beneficio: 'Aumenta la probabilità di violazione dati e raddoppia il massimale cyber consigliato.',
    compilato: (d) => d.haSitoEcommerce !== null,
  },
  {
    chiave: 'modello-231',
    etichetta: 'Adozione del modello 231',
    peso: 4,
    area: 'identificazione-rischi',
    beneficio:
      'Ha efficacia esimente se attuato e vigilato: riduce sensibilmente il rischio residuo da reato dell’ente.',
    compilato: (d) => d.haModello231 !== null,
  },
  {
    chiave: 'certificazioni',
    etichetta: 'Certificazioni di sistema (ISO 9001, 14001, 27001, 45001)',
    peso: 5,
    area: 'identificazione-rischi',
    beneficio:
      'Ogni certificazione è un controllo documentato: abbassa il rischio residuo e dà argomenti in trattativa ' +
      'con la compagnia sul premio.',
    compilato: (d) => d.certificazioni.length > 0,
  },
  {
    chiave: 'concentrazione',
    etichetta: 'Quota di fatturato sul primo cliente',
    peso: 6,
    area: 'identificazione-rischi',
    beneficio:
      'Sopra il 20% il rischio di concentrazione diventa rilevante e giustifica l’assicurazione del credito.',
    compilato: (d) => d.concentrazionePrimoCliente !== null,
  },
  {
    chiave: 'cantiere',
    pertinente: operaPressoTerzi,
    etichetta: 'Lavorazioni presso cantieri o sedi di terzi',
    peso: 6,
    area: 'massimali',
    beneficio: 'Eleva di un gradino il massimale RCT e aggrava probabilità e impatto degli infortuni.',
    compilato: (d) => d.lavoraInCantiere !== null,
  },
  {
    chiave: 'prodotti',
    pertinente: immetteProdotti,
    etichetta: 'Immissione di prodotti finiti sul mercato',
    peso: 5,
    area: 'identificazione-rischi',
    beneficio: 'Attiva la RC Prodotti, che risponde a titolo di responsabilità oggettiva.',
    compilato: (d) => d.produceBeniFinali !== null,
  },
  {
    chiave: 'trasporti',
    pertinente: movimentaMerci,
    etichetta: 'Trasporto di merci proprie',
    peso: 3,
    area: 'identificazione-rischi',
    beneficio:
      'I limiti di responsabilità del vettore sono irrisori rispetto al valore trasportato: senza polizza ' +
      'merci il danno resta all’azienda.',
    compilato: (d) => d.trasportaMerciProprie !== null,
  },
  {
    chiave: 'periodo-indennizzo',
    etichetta: 'Periodo di indennizzo per i danni indiretti',
    peso: 5,
    area: 'somme-assicurande',
    beneficio:
      'Determina il capitale della business interruption. Sotto i 12 mesi si è quasi certamente sottodimensionati: ' +
      'ricostruire un capannone richiede più di un anno.',
    compilato: (d) => d.periodoIndennizzoMesi !== null,
  },
  {
    chiave: 'propensione-rischio',
    etichetta: 'Propensione al rischio del titolare',
    peso: 6,
    area: 'somme-assicurande',
    beneficio:
      'È il primo passo dell’ISO 31000 e una domanda di trenta secondi: dimezza o raddoppia la franchigia ' +
      'proponibile, e senza di essa il trattamento lo decide il motore invece dell’imprenditore.',
    compilato: (d) => d.propensioneAlRischio !== null,
  },
  {
    chiave: 'compartimentazione',
    etichetta: 'Compartimentazione antincendio dei fabbricati',
    peso: 7,
    area: 'somme-assicurande',
    beneficio:
      'È il dato che più abbassa il danno massimo probabile, e con esso il capitale da assicurare: muri e ' +
      'porte REI confinano l’incendio, e un capannone compartimentato non brucia per intero.',
    compilato: (d) => d.immobili.length > 0 && d.immobili.every((i) => i.compartimentazioneRei !== null),
  },
];

export interface CampoMancante {
  readonly chiave: string;
  readonly etichetta: string;
  readonly area: AreaAnalisi;
  readonly beneficio: string;
  readonly peso: number;
}

export interface Completezza {
  /** Quota di completamento, 0-1. */
  readonly percentuale: number;
  readonly punteggio: number;
  readonly punteggioMassimo: number;
  /** Campi mancanti, ordinati per impatto decrescente sull'analisi. */
  readonly mancanti: readonly CampoMancante[];
  readonly compilati: readonly string[];
  /**
   * Livello di affidabilità complessiva dell'analisi, da comunicare all'utente
   * senza fargli calcolare percentuali a mente.
   */
  readonly livello: 'insufficiente' | 'parziale' | 'buona' | 'completa';
}

/**
 * @param facts Se presenti, il questionario si restringe alle domande che hanno senso per
 *   questa impresa: le altre escono anche dal denominatore, altrimenti un'azienda che non
 *   può rispondere resterebbe per sempre sotto il cento per cento.
 */
export function valutaCompletezza(dati: DatiDichiarati, facts?: CompanyFacts): Completezza {
  const campi =
    facts === undefined
      ? CAMPI
      : CAMPI.filter((campo) => campo.pertinente === undefined || campo.pertinente(facts));

  const punteggioMassimo = campi.reduce((sum, campo) => sum + campo.peso, 0);

  const compilati: string[] = [];
  const mancanti: CampoMancante[] = [];
  let punteggio = 0;

  for (const campo of campi) {
    if (safeCheck(campo, dati)) {
      punteggio += campo.peso;
      compilati.push(campo.chiave);
    } else {
      mancanti.push({
        chiave: campo.chiave,
        etichetta: campo.etichetta,
        area: campo.area,
        beneficio: campo.beneficio,
        peso: campo.peso,
      });
    }
  }

  mancanti.sort((a, b) => b.peso - a.peso);
  const percentuale = punteggioMassimo === 0 ? 0 : punteggio / punteggioMassimo;

  return {
    percentuale,
    punteggio,
    punteggioMassimo,
    mancanti,
    compilati,
    livello:
      percentuale >= 0.9
        ? 'completa'
        : percentuale >= 0.65
          ? 'buona'
          : percentuale >= 0.3
            ? 'parziale'
            : 'insufficiente',
  };
}

/** Un predicato difettoso su un campo non deve far fallire il calcolo dell'intero questionario. */
function safeCheck(campo: CampoIntervista, dati: DatiDichiarati): boolean {
  try {
    return campo.compilato(dati);
  } catch {
    return false;
  }
}

export const CAMPI_INTERVISTA = CAMPI;
