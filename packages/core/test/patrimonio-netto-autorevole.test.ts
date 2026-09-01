import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  INDICATORI_FORNITORE_VUOTI,
  analyzeCompany,
  demoCompanyProfile,
  deriveFacts,
} from '../src/index.js';
import { Money } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';

/**
 * Due patrimoni netti dallo stesso fornitore, e il prodotto usava quello sbagliato.
 *
 * IL CASO REALE, misurato il 01/09/2026 sulle risposte in produzione di COMINOTTI S.R.L.,
 * esercizio 2025:
 *
 *   anagrafica estesa  `balanceSheets.last.netWorth`        8.485 €
 *   profilo completo   `ecofin.netWorth`                  719.768 €
 *
 * Il secondo si verifica da sé: diviso per il totale attivo (5.261.580 €) riproduce
 * `capitalizationDegree` — 0,1368 — che l'archivio pubblica a parte, alla quarta cifra. Il
 * primo no, e coincide con l'utile d'esercizio (ROE 1,18% × 719.768 = 8.493).
 *
 * QUANTO COSTAVA, sulla scheda che l'intermediario aveva davanti:
 *
 *   limite patrimoniale     1.697 €   invece di 143.954 €
 *   equity ratio               0,2%   invece di      13,7%
 *   indice di indebitamento    619×   invece di       6,3×
 *
 * e in fondo «Fido consigliato: 0 €», che è la raccomandazione più severa che questo
 * prodotto sappia dare, su un'impresa attiva da trentaquattro anni. Nessuno dei pezzi era
 * sbagliato preso da solo: si vedeva solo mettendo la pagina intera davanti agli occhi.
 */
describe('Il patrimonio netto viene dalla fonte che sa dimostrarlo', () => {
  const PN_SBAGLIATO_EURO = 8_485;
  const PN_ARCHIVIO_EURO = 719_768;
  const ATTIVO_EURO = 5_261_580;

  const profiloCon = (patrimonioNettoArchivio: number | null): CompanyProfile => {
    const base = demoCompanyProfile();
    const sintetico = base.bilanciSintetici[0];
    if (sintetico === undefined) throw new Error('la fixture non ha bilanci sintetici');

    return {
      ...base,
      // Il percorso di produzione: lo schema CEE dettagliato non si compra mai.
      bilanci: [],
      bilanciSintetici: [
        {
          ...sintetico,
          value: {
            ...sintetico.value,
            patrimonioNetto: Money.euro(PN_SBAGLIATO_EURO),
            totaleAttivo: Money.euro(ATTIVO_EURO),
          },
        },
      ],
      indicatoriFornitore: {
        ...INDICATORI_FORNITORE_VUOTI,
        aggregati: patrimonioNettoArchivio === null ? null : { patrimonioNetto: patrimonioNettoArchivio },
      },
    };
  };

  it('con il profilo completo, il fido si dimensiona sul patrimonio dell’archivio', () => {
    const analisi = analyzeCompany(profiloCon(PN_ARCHIVIO_EURO), [], DEMO_AS_OF);
    const limite = analisi.creditLimit.value.limitePatrimoniale;

    expect(limite, 'il limite patrimoniale deve essere calcolabile').not.toBeNull();
    // Il vincolo è il 20% del patrimonio netto: 143.953,60 € su 719.768 €.
    expect(Money.toEuro(limite ?? Money.ZERO)).toBeCloseTo(PN_ARCHIVIO_EURO * 0.2, 0);
  });

  it('senza il profilo completo resta quello che si ha, e non si inventa niente', () => {
    /*
      Il rovescio, e senza questa prova la correzione sarebbe una scorciatoia: chi ha
      comprato la sola anagrafica estesa non ha una seconda fonte da preferire. Il numero
      resta quello, e a dichiararlo è il livello dei dati economici che la scheda stampa.
    */
    const analisi = analyzeCompany(profiloCon(null), [], DEMO_AS_OF);
    const limite = analisi.creditLimit.value.limitePatrimoniale;

    expect(Money.toEuro(limite ?? Money.ZERO)).toBeCloseTo(PN_SBAGLIATO_EURO * 0.2, 0);
  });

  it('la differenza fra le due fonti si vede nel fido, non solo negli indici', () => {
    // Ottantaquattro volte: è la misura del difetto, e il motivo per cui una prova
    // sull'uguaglianza dei due numeri non sarebbe bastata a farlo notare.
    const conArchivio = analyzeCompany(profiloCon(PN_ARCHIVIO_EURO), [], DEMO_AS_OF);
    const senza = analyzeCompany(profiloCon(null), [], DEMO_AS_OF);

    const euroDi = (a: typeof conArchivio): number =>
      Money.toEuro(a.creditLimit.value.limitePatrimoniale ?? Money.ZERO);

    expect(euroDi(conArchivio) / Math.max(euroDi(senza), 1)).toBeGreaterThan(50);
  });

  /*
    La metà del difetto che stavo per lasciare in piedi.

    La correzione era stata messa dove si calcolano gli indicatori, e da lì arrivano il
    fido e l'equity ratio: i due numeri che avevo guardato. Ma `deriveFacts` legge il
    bilancio sintetico per conto suo, e da `facts.patrimonioNetto` passano altre tre cose:

      · la regola che accende il rischio di credito quando i crediti verso clienti
        superano il patrimonio — con 8.485 € si accende su qualunque impresa
      · l'incidenza dei crediti sul patrimonio, stampata nel dimensionamento del fido
      · il valore che il monitoraggio confronta di mese in mese

    Nessuna delle tre si vedeva dai numeri che avevo verificato. Per questo la correzione
    sta in `financials.ts` e la usano entrambi i percorsi: una sola fonte, un solo numero.
  */
  it('il patrimonio corretto arriva anche ai fatti, non solo agli indicatori', () => {
    const conArchivio = deriveFacts(profiloCon(PN_ARCHIVIO_EURO), null, DEMO_AS_OF);
    const senza = deriveFacts(profiloCon(null), null, DEMO_AS_OF);

    expect(Money.toEuro(conArchivio.patrimonioNetto ?? Money.ZERO)).toBe(PN_ARCHIVIO_EURO);
    expect(Money.toEuro(senza.patrimonioNetto ?? Money.ZERO)).toBe(PN_SBAGLIATO_EURO);
  });
});
