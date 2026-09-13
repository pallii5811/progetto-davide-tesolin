/**
 * Property Risk, come lo definisce il foglio «Veezco_Analisi Rischio.xlsx».
 *
 *   Property Risk = 30% × rischio dell'attività + 20% × tipo di sito + 50% × pericoli naturali
 *
 * Tre punteggi da 1 a 7, pesati. I pesi, le tabelle dell'attività e del tipo di sito vengono
 * dal foglio (`tabelle-veezco.ts`), non da qui.
 *
 * IL TERZO PUNTEGGIO NON SI CALCOLA, E NON PER SCELTA. Il foglio rinvia per i pericoli naturali
 * a una tabella «Natural_Hazard_Risk» che converte alluvione, sisma e frana in punteggi da 1 a 7;
 * nel file quella tabella non c'è, c'è solo un esempio scritto a mano (6, 2, 3). Questo prodotto
 * i pericoli li misura in tre livelli — bassa, media, alta — e tradurli in un numero da 1 a 7
 * sarebbe inventare la parte che pesa di più. Finché la tabella non arriva, la voce resta senza
 * punteggio, il totale resta non calcolabile, e la scheda lo dice: il 50% mancante non si
 * ricava ridistribuendo il peso sulle altre due voci.
 */

import type { TipoUnitaLocale } from '../company/profile.js';
import type { ExposureLevel } from '../risk/geo.js';
import { PESI_PROPERTY, RISCHIO_ATTIVITA, RISCHIO_TIPO_DI_SITO } from './tabelle-veezco.js';
import type { RigaAttivita } from './tabelle-veezco.js';

/** Una riga del calcolo: il punteggio da 1 a 7, il peso del foglio, e quanto porta al totale. */
export interface VoceDiCalcolo {
  readonly voce: string;
  /** Da 1 a 7. `null` dove il foglio non permette di calcolarlo: mai uno zero al suo posto. */
  readonly punteggio: number | null;
  readonly peso: number;
  /** Punteggio × peso; `null` se manca il punteggio. */
  readonly contributo: number | null;
  /** Da dove viene il punteggio, detto per esteso. */
  readonly dettaglio: string;
}

export interface UbicazionePerProperty {
  readonly id: string;
  readonly etichetta: string;
  readonly tipo: TipoUnitaLocale | null;
  readonly sismica: ExposureLevel | null;
  readonly idraulica: ExposureLevel | null;
  readonly frane: ExposureLevel | null;
}

export interface PropertyUbicazione {
  readonly id: string;
  readonly etichetta: string;
  readonly voci: readonly VoceDiCalcolo[];
  /** Somma dei contributi; `null` se anche una sola voce manca. */
  readonly punteggio: number | null;
}

export interface PropertyRisk {
  readonly formula: string;
  readonly formulaPericoliNaturali: string;
  readonly divisioneAteco: string | null;
  readonly titoloDivisione: string | null;
  /** Il punteggio dell'ubicazione più esposta, da 1 a 7. */
  readonly punteggio: number | null;
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

/**
 * La formula dei pericoli naturali, come è scritta nel foglio: metà il pericolo massimo, metà
 * il pericolo medio dei tre.
 *
 * Nell'esempio del foglio (alluvione 6, sisma 2, frana 3) la cella calcola 6 × 50% + 2,5 × 50%:
 * il 2,5 è la media dei due pericoli diversi dal massimo, non dei tre. Qui vale la formula
 * scritta, e la scheda segnala la differenza perché la si chiarisca insieme alla tabella che
 * manca. Oggi non la chiama nessuno: senza quella tabella i tre punteggi non ci sono.
 */
export function pericoliNaturali(alluvione: number, sisma: number, frana: number): number {
  const valori = [alluvione, sisma, frana];
  return 0.5 * Math.max(...valori) + 0.5 * ((alluvione + sisma + frana) / valori.length);
}

const livello = (valore: ExposureLevel | null): string => valore ?? 'non determinata';

export function calcolaPropertyRisk(
  divisioneAteco: string | null,
  ubicazioni: readonly UbicazionePerProperty[],
): PropertyRisk {
  const riga: RigaAttivita | null =
    divisioneAteco === null ? null : (RISCHIO_ATTIVITA[divisioneAteco] ?? null);
  const deposito = RISCHIO_TIPO_DI_SITO.find((r) => r.tipo === 'Deposito')?.punteggio ?? null;

  const voceAttivita: VoceDiCalcolo =
    riga === null
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
          contributo: riga.punteggio * PESI_PROPERTY.attivita,
          dettaglio: `${riga.titolo}, fascia ${FASCIA[riga.fascia] ?? riga.fascia}.`,
        };

  const perUbicazione = ubicazioni.map((u): PropertyUbicazione => {
    const sito = tipoDiSitoDelFoglio(u.tipo);
    const punteggioSito = sito !== null ? sito.punteggio : riga !== null ? riga.punteggio : null;
    const voceSito: VoceDiCalcolo = {
      voce: 'Tipo di sito',
      punteggio: punteggioSito,
      peso: PESI_PROPERTY.tipoDiSito,
      contributo: punteggioSito === null ? null : punteggioSito * PESI_PROPERTY.tipoDiSito,
      dettaglio:
        sito !== null
          ? u.tipo === 'magazzino' && deposito !== null
            ? `${sito.tipo}, che il registro non distingue dal deposito (nel foglio ${deposito}).`
            : `${sito.tipo}.`
          : riga === null
            ? 'Il registro non indica la destinazione d’uso della sede, e senza l’attività manca anche il ripiego previsto dal foglio.'
            : 'Il registro non indica la destinazione d’uso della sede: il foglio prescrive di usare il punteggio dell’attività.',
    };
    const vocePericoli: VoceDiCalcolo = {
      voce: 'Pericoli naturali',
      punteggio: null,
      peso: PESI_PROPERTY.pericoliNaturali,
      contributo: null,
      dettaglio:
        `Alluvione ${livello(u.idraulica)}, sisma ${livello(u.sismica)}, frana ${livello(u.frane)}. ` +
        'Manca nel foglio la tabella che converte questi livelli in punteggio.',
    };

    const voci = [voceAttivita, voceSito, vocePericoli];
    let somma = 0;
    let completa = true;
    for (const v of voci) {
      if (v.contributo === null) completa = false;
      else somma += v.contributo;
    }
    return { id: u.id, etichetta: u.etichetta, voci, punteggio: completa ? somma : null };
  });

  let riferimento: { etichetta: string; punteggio: number } | null = null;
  for (const u of perUbicazione) {
    if (u.punteggio === null) continue;
    if (riferimento === null || u.punteggio > riferimento.punteggio) {
      riferimento = { etichetta: u.etichetta, punteggio: u.punteggio };
    }
  }

  const note = [
    `Per i pericoli naturali il foglio rinvia alla tabella «Natural_Hazard_Risk», che nel file non è presente. ` +
      `Senza di essa manca il ${percentuale(PESI_PROPERTY.pericoliNaturali)} del punteggio, e il Property Risk ` +
      'resta non calcolabile: non viene stimato sulle sole due voci disponibili.',
    'Nell’esempio del foglio il pericolo medio vale 2,5, cioè la media dei due pericoli diversi dal massimo, ' +
      'mentre la formula scritta indica il pericolo medio dei tre: da chiarire insieme alla tabella.',
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
    divisioneAteco,
    titoloDivisione: riga?.titolo ?? null,
    punteggio: riferimento?.punteggio ?? null,
    ubicazioneDiRiferimento: riferimento?.etichetta ?? null,
    ubicazioni: perUbicazione,
    note,
  };
}
