import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, computeSumsInsured, demoCompanyProfile, deriveFacts } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';

/**
 * I mercati di esportazione erano comprati, erano a schermo, e il motore non li guardava.
 *
 * SULLA SCHEDA che l'intermediario aveva davanti, a due sezioni di distanza:
 *
 *   riquadro dell'archivio     «Paesi di esportazione: Unione Europea, Altri Paesi»
 *   dimensionamento RC Prodotti «Export: da rilevare in intervista»
 *   rischio RC Prodotto         un'ipotesi su USA e Canada, chiusa da «(da verificare)»
 *
 * Il primo viene dal profilo completo, che costa 0,30 € ed era stato pagato. Gli altri due
 * dichiaravano di non sapere ciò che la stessa pagina stampava.
 *
 * `deriveFacts` leggeva le sole risposte dell'intervista: `quotaExportPercentuale` e
 * `esportaVersoUsaCanada`. Le due qualifiche dell'archivio — `esportatore` e `paesiExport`
 * — non avevano nessun campo in `CompanyFacts` in cui atterrare, quindi nessuna regola
 * poteva leggerle: non era una svista di scrittura, era un dato senza porta d'ingresso.
 *
 * IL CONFINE CHE QUESTA PROVA PRESIDIA è dove il difetto potrebbe diventare peggiore del
 * silenzio. «Unione Europea, Altri Paesi» **non** è una risposta sugli Stati Uniti: «altri
 * paesi» li comprende senza nominarli. Dedurne un `false` toglierebbe due gradini di
 * massimale — il salto più grande che questo motore faccia — a un'impresa che là ci
 * spedisce davvero, e il conto arriverebbe il giorno del sinistro.
 */
describe('Le esportazioni dichiarate all’archivio entrano nell’analisi', () => {
  /** Il percorso vero: l'intervista non ha chiesto nulla sull'export, l'archivio sì. */
  const senzaIntervista = (paesiExport: string | null, esportatore: boolean | null) => {
    const base = demoCompanyProfile();
    const profilo: CompanyProfile = {
      ...base,
      datiDichiarati: {
        ...base.datiDichiarati,
        quotaExportPercentuale: null,
        esportaVersoUsaCanada: null,
      },
      indicatoriFornitore: {
        ...base.indicatoriFornitore,
        qualifiche:
          base.indicatoriFornitore.qualifiche === null
            ? null
            : { ...base.indicatoriFornitore.qualifiche, paesiExport, esportatore },
      },
    };
    return deriveFacts(profilo, null, DEMO_AS_OF);
  };

  it('l’impresa risulta esportatrice, e i mercati arrivano ai fatti', () => {
    const f = senzaIntervista('UNIONE EUROPEA, ALTRI PAESI', true);

    expect(f.esportatore).toBe(true);
    expect(f.paesiExportArchivio).toBe('UNIONE EUROPEA, ALTRI PAESI');
  });

  it('un elenco di mercati vale come risposta anche se la casella «esportatore» tace', () => {
    expect(senzaIntervista('UNIONE EUROPEA, ALTRI PAESI', null).esportatore).toBe(true);
  });

  it('«altri paesi» non è una risposta sugli Stati Uniti: resta ignoto, mai negato', () => {
    // Il caso che costerebbe di più: `false` qui significa massimale RC Prodotti abbassato
    // di due gradini su un'impresa che esporta in Nord America senza averlo dichiarato.
    expect(senzaIntervista('UNIONE EUROPEA, ALTRI PAESI', true).esportaUsaCanada).toBeNull();
    expect(senzaIntervista('UNIONE EUROPEA', true).esportaUsaCanada).toBeNull();
    expect(senzaIntervista(null, true).esportaUsaCanada).toBeNull();
  });

  it('quando il Nord America è nominato, il fatto è accertato', () => {
    expect(senzaIntervista('UNIONE EUROPEA, STATI UNITI', true).esportaUsaCanada).toBe(true);
    expect(senzaIntervista('CANADA, MESSICO', true).esportaUsaCanada).toBe(true);
    expect(senzaIntervista('AMERICA DEL NORD', true).esportaUsaCanada).toBe(true);
  });

  it('«USA» dentro un’altra parola non è il Nord America', () => {
    // Il campo dell'archivio è testo libero: senza confini di parola «USA» aggancia
    // «USATE», e un macchinario di seconda mano diventerebbe un'esportazione oltreoceano
    // con due gradini di massimale in più.
    expect(
      senzaIntervista('ESPORTAZIONE DI MACCHINARI USATI VERSO PAESI TERZI', true).esportaUsaCanada,
    ).toBeNull();
  });

  it('l’intervista prevale sull’archivio, in entrambe le direzioni', () => {
    // Chi ha parlato con l'imprenditore sa più dell'archivio, e il «no» esplicito è un
    // dato: non va sovrascritto da un elenco che nomina il Canada per altre ragioni.
    const base = demoCompanyProfile();
    const conNo: CompanyProfile = {
      ...base,
      datiDichiarati: { ...base.datiDichiarati, esportaVersoUsaCanada: false },
      indicatoriFornitore: {
        ...base.indicatoriFornitore,
        qualifiche:
          base.indicatoriFornitore.qualifiche === null
            ? null
            : { ...base.indicatoriFornitore.qualifiche, paesiExport: 'CANADA' },
      },
    };
    expect(deriveFacts(conNo, null, DEMO_AS_OF).esportaUsaCanada).toBe(false);
  });

  it('il dimensionamento della RC Prodotti smette di dire «da rilevare» ciò che sa', () => {
    const f = senzaIntervista('UNIONE EUROPEA, ALTRI PAESI', true);
    const somme = computeSumsInsured(f, null, []);
    const voce = somme.massimaleRcProdotti.explanation.inputs.find((i) => i.label === 'Export');

    expect(voce, 'la voce Export deve esserci').toBeDefined();
    expect(voce?.value).toContain('unione europea, altri paesi');
    // Ciò che manca davvero resta chiesto, ed è una cosa sola: la quota sul fatturato.
    expect(voce?.value).toContain('quota sul fatturato da rilevare');
  });

  it('senza archivio e senza intervista la voce resta quella di prima', () => {
    const f = senzaIntervista(null, null);
    const somme = computeSumsInsured(f, null, []);
    const voce = somme.massimaleRcProdotti.explanation.inputs.find((i) => i.label === 'Export');

    expect(voce?.value).toBe('da rilevare in intervista');
  });
});
