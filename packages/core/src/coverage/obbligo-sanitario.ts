import type { CompanyFacts } from '../company/facts.js';

/**
 * Chi è tenuto all'obbligo assicurativo della L. 24/2017, e a quale titolo.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * GALENO S.R.L., poliambulatorio a Leno. La motivazione della responsabilità professionale
 * diceva già che la copertura della responsabilità verso terzi e verso i prestatori d'opera
 * «è imposta dalla legge», e la stessa garanzia stava in fondo al piano d'azione, «alla
 * prossima revisione», senza il segno dell'obbligo. RCT e RCO — proprio le due coperture che
 * l'art. 10 c. 1 impone alla struttura — non lo nominavano affatto.
 *
 * ── IL PERIMETRO ─────────────────────────────────────────────────────────────
 *
 * Divisione 86 (assistenza sanitaria) e 87 (assistenza sociale residenziale, cioè le
 * strutture sociosanitarie). La 88 resta fuori: l'assistenza sociale non residenziale non è
 * di per sé una struttura sociosanitaria, e attribuirle l'obbligo sarebbe inventarlo.
 *
 * Nella 86 la ditta individuale è il professionista sanitario — art. 10 c. 2, obbligata la
 * sola responsabilità per la propria attività — e ogni altra forma è la struttura (c. 1).
 * L'archivio non dice se la struttura sia autorizzata: chi usa questo verdetto lo dichiara.
 */
export type TitoloObbligoSanitario = 'struttura' | 'professionista';

export function titoloObbligoSanitario(facts: CompanyFacts): TitoloObbligoSanitario | null {
  if (facts.atecoDivisione === '87') return 'struttura';
  if (facts.atecoDivisione !== '86') return null;
  return facts.formaGiuridica === 'ditta-individuale' ? 'professionista' : 'struttura';
}

/**
 * Il massimale minimo per sinistro che il D.M. 15/12/2023 n. 232 impone alla polizza.
 *
 * Art. 4, in vigore dal 16/03/2024, letto sul testo in Gazzetta; il massimale per anno non
 * può essere inferiore al triplo di quello per sinistro. La classe dipende da ciò che la
 * struttura fa — chirurgia, ortopedia, anestesia, parto, odontoiatria — e l'archivio lo dice
 * solo in parte, con il codice ATECO. Dove il codice non basta si applica la classe più alta
 * plausibile e la nota dice quale varrebbe altrimenti: un massimale consigliato sopra il
 * minimo si ridimensiona in intervista, uno sotto il minimo è una polizza che non adempie.
 */
export interface MinimoSanitario {
  readonly euroPerSinistro: number;
  readonly riferimento: string;
  readonly nota: string;
}

export function minimoSanitarioPerSinistro(facts: CompanyFacts): MinimoSanitario | null {
  const titolo = titoloObbligoSanitario(facts);
  if (titolo === null) return null;
  const codice = facts.ateco ?? '';

  if (titolo === 'professionista') {
    return {
      euroPerSinistro: 1_000_000,
      riferimento: 'D.M. 232/2023, art. 4, c. 2, lett. a)',
      nota:
        'Esercente la professione sanitaria: se svolge anche attività chirurgica, ortopedica, ' +
        'anestesiologica o parto il minimo per sinistro sale a 2 M€ (lett. b).',
    };
  }
  if (codice.startsWith('86.10')) {
    return {
      euroPerSinistro: 5_000_000,
      riferimento: 'D.M. 232/2023, art. 4, c. 1, lett. c)',
      nota:
        'Ospedale o casa di cura: il minimo di 5 M€ per sinistro vale per chi svolge anche attività ' +
        'chirurgica, ortopedica, anestesiologica o parto; senza, è 2 M€ (lett. b). Si applica il più ' +
        'alto finché l’attività non è confermata in intervista.',
    };
  }
  if (codice.startsWith('86.23')) {
    return {
      euroPerSinistro: 2_000_000,
      riferimento: 'D.M. 232/2023, art. 4, c. 1, lett. b)',
      nota:
        'Attività odontoiatrica: minimo di 2 M€ per sinistro; 5 M€ se la struttura svolge anche ' +
        'attività chirurgica, ortopedica, anestesiologica o parto (lett. c).',
    };
  }
  if (facts.atecoDivisione === '87') {
    return {
      euroPerSinistro: 2_000_000,
      riferimento: 'D.M. 232/2023, art. 4, c. 1, lett. b)',
      nota: 'Struttura sociosanitaria residenziale: minimo di 2 M€ per sinistro.',
    };
  }
  return {
    euroPerSinistro: 1_000_000,
    riferimento: 'D.M. 232/2023, art. 4, c. 1, lett. a)',
    nota:
      'Struttura ambulatoriale: minimo di 1 M€ per sinistro. Sale a 2 M€ se esegue attività ' +
      'odontoiatrica o prestazioni erogabili solo in ambulatori protetti (lett. b), e a 5 M€ se ' +
      'svolge attività chirurgica, ortopedica, anestesiologica o parto (lett. c): da confermare in ' +
      'intervista.',
  };
}
