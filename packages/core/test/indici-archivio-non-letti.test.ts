import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  INDICATORI_FORNITORE_VUOTI,
  analyzeCompany,
  demoCompanyProfile,
  indicatoriDaArchivio,
} from '../src/index.js';
import type { CompanyProfile, IndicatoriFornitore } from '../src/index.js';

/**
 * Due indici comprati, stampati, e dichiarati «da rilevare in intervista».
 *
 * IL RECLAMO era una pagina intera incollata, e questa volta la contraddizione stava fra
 * due sue sezioni distanti mezzo schermo:
 *
 *   Andamento e marginalità     «Margine EBITDA 7,94 %»
 *   Solidità patrimoniale       «Copertura delle immobilizzazioni 3,05»
 *
 *   Merito creditizio · Redditività · peso 14 %   **non valutabile**
 *                                                 «EBITDA margin: da rilevare in intervista»
 *   Merito creditizio · Solidità patrimoniale     «Copertura immobilizzazioni: da rilevare»
 *
 * È la stessa famiglia del patrimonio netto: il dato era pagato, era a schermo, e il motore
 * diceva di non averlo. Qui costava un fattore intero su sette — il quattordici per cento
 * di un punteggio che decide quanto credito l'intermediario consiglia di concedere.
 *
 * LE DUE PROVE CHE HANNO AUTORIZZATO LA MAPPATURA. Un indice non è lo stesso indice perché
 * ha lo stesso nome, e nessuno dei due si è preso sulla fiducia:
 *
 *   · `ebitdaMargin` vale 7,94 % e l'EBITDA 343.989 €, quindi il denominatore è
 *     4.332.355 €. I ricavi sono 3.959.368 €: non è quello. Il ROS dello stesso archivio,
 *     4,32 %, per quel denominatore restituisce l'EBIT stampato accanto, 187.148 €. Due
 *     indici indipendenti chiudono sullo stesso valore della produzione, che è il
 *     denominatore della piattaforma.
 *
 *   · `tassoCoperturaImmobilizzazioni` aveva un gemello insidioso, `indiceMargineDiStruttura`
 *     (1,39). Dal margine di struttura le immobilizzazioni sono 519.284 €; il margine
 *     secondario porta le fonti durevoli a 1.584.990 €, e il rapporto fa 3,05 — il primo.
 *     Il secondo è patrimonio netto su immobilizzazioni, e avrebbe dimezzato il fattore.
 */
describe('Gli indici che l’archivio ha già calcolato arrivano al motore', () => {
  /** I numeri di COMINOTTI S.R.L., esercizio 2025, come li pubblica l'archivio. */
  const archivio: IndicatoriFornitore = {
    ...INDICATORI_FORNITORE_VUOTI,
    redditivita: {
      ...(INDICATORI_FORNITORE_VUOTI.redditivita ?? { roi: null, ros: null, roaMonetario: null }),
      roe: 1.18,
    },
    solidita: {
      acidTest: 0.53,
      currentRatio: 1.37,
      coperturaCapitaleCircolante: 0.29,
      tassoCoperturaImmobilizzazioni: 3.05,
      margineDiStruttura: 200_484,
      indiceMargineDiStruttura: 1.39,
      margineDiStrutturaSecondario: 1_065_706,
    },
    kpi: {
      rotazioneDebiti: 1.09,
      oneriFinanziariSuEbitda: 0.4,
      rotazioneMagazzino: null,
      marginePercentualeEbitda: 7.94,
      patrimonioSuTotaleAttivo: 0.14,
    },
  } as IndicatoriFornitore;

  it('il margine EBITDA e la copertura delle immobilizzazioni non restano vuoti', () => {
    const ind = indicatoriDaArchivio(archivio);

    expect(ind, 'con questi indici il registro ha qualcosa da dire').not.toBeNull();
    expect(ind?.ebitdaMargin).toBeCloseTo(0.0794, 4);
    expect(ind?.coperturaImmobilizzazioni).toBe(3.05);
  });

  it('la percentuale dell’archivio diventa il rapporto della piattaforma', () => {
    /*
      La conversione è il punto in cui questa correzione poteva diventare peggiore del
      difetto. L'archivio scrive 7,94 e la piattaforma legge rapporti: senza dividere per
      cento il margine varrebbe 794 %, i punti di interpolazione si fermano a 0,30 e il
      fattore uscirebbe 100/100 su un'impresa che margina l'otto per cento.

      Il ROE è la prova indipendente che l'unità è quella: 1,18 sull'impresa vera è
      l'utile d'esercizio (8.485 €) sul patrimonio netto (719.768 €), cioè l'1,18 PER
      CENTO. Stampato senza conversione uscirebbe «118,0 %».
    */
    const ind = indicatoriDaArchivio(archivio);

    expect(ind?.roe).toBeCloseTo(0.0118, 4);
    expect(ind?.ebitdaMargin, 'mai il numero nudo dell’archivio').not.toBeCloseTo(7.94, 2);
  });

  it('i rapporti che l’archivio pubblica già come rapporti non si toccano', () => {
    // La scheda li stampa senza il segno di percentuale, ed è da lì che si vede: dividerli
    // per cento sarebbe l'errore speculare, e altrettanto silenzioso.
    const ind = indicatoriDaArchivio(archivio);

    expect(ind?.coperturaImmobilizzazioni).toBe(3.05);
    expect(ind?.currentRatio).toBe(1.37);
    expect(ind?.quickRatio).toBe(0.53);
  });

  it('il fattore redditività smette di essere «non valutabile»', () => {
    /*
      Sul percorso di produzione, non su una scorciatoia: lo schema CEE dettagliato non si
      compra mai — il servizio dedicato costa cinque euro ed è dichiarato non verificato —
      quindi `bilanci` è vuoto e l'unica fonte di indici è l'archivio. È esattamente la
      condizione in cui il fattore usciva «non valutabile».
    */
    const base = demoCompanyProfile();
    const profilo: CompanyProfile = { ...base, bilanci: [], indicatoriFornitore: archivio };
    const analisi = analyzeCompany(profilo, [], DEMO_AS_OF);

    const redditivita = analisi.creditScore.value.factors.find((f) => f.key === 'redditivita');
    expect(redditivita, 'il fattore deve esserci').toBeDefined();
    expect(redditivita?.score, 'con il margine EBITDA il fattore è calcolabile').not.toBeNull();

    // 7,94 % cade fra i punti (0,05 → 50) e (0,10 → 70): il fattore vale circa 62.
    expect(redditivita?.score ?? 0).toBeGreaterThan(55);
    expect(redditivita?.score ?? 0).toBeLessThan(70);
    expect(redditivita?.rationale).not.toMatch(/non calcolabil/i);
  });

  it('il gemello sbagliato non viene scelto', () => {
    /*
      `indiceMargineDiStruttura` vale 1,39 ed è patrimonio netto su immobilizzazioni: la
      piattaforma calcola invece (patrimonio netto + passivo consolidato) su
      immobilizzazioni. Prendere quello che somiglia di più al nome avrebbe dimezzato il
      fattore di solidità, in silenzio e su ogni impresa.
    */
    const ind = indicatoriDaArchivio(archivio);
    expect(ind?.coperturaImmobilizzazioni).not.toBe(1.39);
  });
});
