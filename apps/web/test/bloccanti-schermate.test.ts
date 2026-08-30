/**
 * Corsia 6 dell'audit di consegna: le due schermate che stampano il falso.
 *
 * Il motore è più onesto del documento che produce. Ognuno dei difetti provati qui nasce
 * nella resa — non nel calcolo — e ognuno fa dire all'intermediario, in un fascicolo che
 * firma, una cosa che il motore non ha mai affermato.
 *
 * Due forme di prova, e sono diverse per necessità:
 *
 *  - dove il difetto è una **scala** o una **definizione**, si fa l'aritmetica sulle
 *    risposte reali già registrate in `.sonda` (nessuna chiamata a pagamento è stata
 *    fatta per scrivere questo file). I valori sono anche ricopiati come costanti, con il
 *    nome del file da cui vengono, perché la prova regga anche su una copia del repo che
 *    quelle risposte non le ha;
 *  - dove il difetto è una **frase stampata**, si legge il sorgente della schermata. Non
 *    è un ripiego: l'ambiente di prova è `node`, le due pagine sono componenti server di
 *    Next e non si montano, e la frase esiste solo lì. Si legge il sorgente **senza i
 *    commenti**: la spiegazione di una correzione nomina per forza la cosa corretta, e un
 *    controllo che leggesse anche quelle righe resterebbe rosso per il commento.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const SORGENTI = resolve(RADICE, 'apps/web/src');
const SONDA = resolve(RADICE, '.sonda');

function leggi(relativo: string): string {
  return readFileSync(resolve(SORGENTI, relativo), 'utf8');
}

/**
 * Il codice senza i commenti.
 *
 * Stessa ragione — e stessa forma — di `audit-interfaccia.test.ts`: un commento non
 * arriva a nessuno schermo, e chi lo cerca misura la documentazione invece del prodotto.
 */
function senzaCommenti(sorgente: string): string {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

const REPORT = senzaCommenti(leggi('app/azienda/[id]/report/page.tsx'));
const SCRIVANIA = senzaCommenti(leggi('app/azienda/[id]/page.tsx'));
const INDICATORI = senzaCommenti(leggi('app/azienda/[id]/IndicatoriArchivio.tsx'));

// ─────────────────────────────────────────────────────────────────────────────
// Le due risposte reali, e i numeri che se ne ricavano
// ─────────────────────────────────────────────────────────────────────────────

/**
 * I valori misurati sulle due imprese registrate, con il file di provenienza.
 *
 * Sono ricopiati e non dedotti: `.sonda/` non è versionato, e una prova che sparisce
 * dove i dati non ci sono è una prova che non protegge nessuno. Quando la cartella c'è,
 * il primo controllo del file verifica che queste costanti siano ancora quelle vere — se
 * il fornitore cambiasse scala, si accorgerebbe questo, non il cliente.
 */
const IMPRESE = [
  {
    file: 'prod-IT-full-01528120981.json',
    ebit: -751012,
    ebitDueEserciziPrima: 257340,
    ebitVariation: -3.9184,
    roi: -5.17,
    roaMonetary: -4.01,
    stockDuration: 160.5641,
    totalInventoryTurnover: 160.56,
    inventoryRotation: 2.2421,
  },
  {
    file: 'prod-IT-full-12485671007.json',
    ebit: 1070081,
    ebitDueEserciziPrima: 356098,
    ebitVariation: 2.005,
    roi: -323.28,
    roaMonetary: 44.57,
    stockDuration: 0,
    totalInventoryTurnover: 0,
    inventoryRotation: null,
  },
] as const;

/** Il primo valore numerico che risponde a quel nome, ovunque sia annidato. */
function numero(radice: unknown, chiave: string): number | null {
  let trovato: number | null = null;
  const visita = (nodo: unknown): void => {
    if (trovato !== null || nodo === null || typeof nodo !== 'object') return;
    for (const [k, v] of Object.entries(nodo as Record<string, unknown>)) {
      if (k === chiave && typeof v === 'number') {
        trovato = v;
        return;
      }
      if (v !== null && typeof v === 'object') visita(v);
      if (trovato !== null) return;
    }
  };
  visita(radice);
  return trovato;
}

describe('Le costanti misurate sono ancora quelle che il fornitore risponde', () => {
  for (const impresa of IMPRESE) {
    const percorso = resolve(SONDA, impresa.file);
    it.skipIf(!existsSync(percorso))(`${impresa.file} — le scale non sono cambiate`, () => {
      const risposta: unknown = JSON.parse(readFileSync(percorso, 'utf8'));
      expect(numero(risposta, 'ebitVariation')).toBeCloseTo(impresa.ebitVariation, 4);
      expect(numero(risposta, 'roi')).toBeCloseTo(impresa.roi, 2);
      expect(numero(risposta, 'roaMonetary')).toBeCloseTo(impresa.roaMonetary, 2);
      expect(numero(risposta, 'stockDuration')).toBeCloseTo(impresa.stockDuration, 4);
      expect(numero(risposta, 'totalInventoryTurnover')).toBeCloseTo(impresa.totalInventoryTurnover, 2);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 1 · l'art. 1907 c.c. stampato su una polizza a primo rischio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il motore distingue tre stati — `adeguata`, `insufficiente`, `non-verificabile` — e su
 * una garanzia a primo rischio assoluto scrive, testualmente, che «la regola
 * proporzionale non si applica». Le due schermate leggono il solo booleano
 * `sottoassicurata` e ci costruiscono sopra una frase nuova, che dice l'opposto: che la
 * norma opera, e che il metro è il valore reale del bene.
 *
 * Due falsità in una riga, e su una forma di garanzia che è l'ordinaria del furto. La
 * correzione non è riscrivere meglio la frase: è **non riscriverla**. La frase giusta il
 * motore l'ha già composta, sta in `spiegazione.note`, e cambia da sé con il caso.
 */
describe('Difetto 1 · nessuna schermata cita l’art. 1907 su una garanzia che non vi è soggetta', () => {
  it('il fascicolo stampa la spiegazione del motore, non una frase propria', () => {
    expect(REPORT).not.toMatch(/1907/);
    expect(REPORT).not.toMatch(/ridotto in proporzione/);
    expect(REPORT).not.toMatch(/inferiore al valore reale del bene/);
    expect(REPORT).toMatch(/sottoassicurazione\.spiegazione\.note/);
  });

  it('la scrivania stampa la spiegazione del motore, non una frase propria', () => {
    expect(SCRIVANIA).not.toMatch(/1907/);
    expect(SCRIVANIA).not.toMatch(/Regola proporzionale/);
    expect(SCRIVANIA).toMatch(/sottoassicurazione\.spiegazione\.note/);
  });

  /**
   * Il booleano `sottoassicurata` è una scorciatoia, non il verdetto: è vero **solo** su
   * `insufficiente`, e chi legge lui solo confonde `non-verificabile` con `adeguata`. Su
   * una garanzia a primo rischio senza danno atteso stimato — la forma ordinaria del
   * furto — il motore dice che non sa giudicare il limite, e le due schermate non
   * stampavano nulla: la cautela moriva al confine.
   */
  it('le due schermate leggono i tre stati, non il booleano', () => {
    for (const schermata of [REPORT, SCRIVANIA]) {
      expect(schermata).toMatch(/adeguatezzaDelLimite/);
      expect(schermata).toMatch(/adeguatezzaDelLimite === 'insufficiente'/);
      expect(schermata).not.toMatch(/sottoassicurata === true/);
    }
  });

  it('i tre stati che le schermate devono distinguere sono quelli del DTO', () => {
    const dto = readFileSync(resolve(SORGENTI, 'lib/api.ts'), 'utf8');
    expect(dto).toMatch(/'adeguata' \| 'insufficiente' \| 'non-verificabile'/);
  });

  it('la frase che le due schermate devono stampare esiste già nel motore', () => {
    const motore = readFileSync(resolve(RADICE, 'packages/core/src/coverage/underinsurance.ts'), 'utf8');
    expect(motore).toMatch(/primo rischio assoluto: la regola proporzionale non si applica/);
    expect(motore).toMatch(/senza che operi alcuna riduzione proporzionale/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 2 · il taglio a una nota
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `note.slice(0, 1)` non tiene «la nota più importante»: tiene la **prima**. E la prima,
 * in questi elenchi, è sempre quella incondizionata — la riga scritta a ogni esecuzione,
 * qualunque cosa sia successa. Le condizionali, che sono quelle che avvertono, vengono
 * dopo per costruzione, e vengono scartate tutte.
 *
 * Il secondo controllo prova proprio quel «per costruzione» sul motore, invece di
 * affermarlo: nella base CAT NAT la `.note(` incondizionata precede ogni `.noteIf(`.
 */
describe('Difetto 2 · le note di una somma assicuranda si stampano tutte', () => {
  it('il fascicolo non taglia l’elenco delle note', () => {
    expect(REPORT).not.toMatch(/note\.slice\(/);
  });

  it('nella base CAT NAT la nota incondizionata viene per prima, quindi il taglio scarta gli avvisi', () => {
    const somme = readFileSync(resolve(RADICE, 'packages/core/src/coverage/sums-insured.ts'), 'utf8');
    const corpo = somme.slice(somme.indexOf('function calcolaBaseCatNat'));
    const incondizionata = corpo.indexOf('.note(');
    const condizionale = corpo.indexOf('.noteIf(');
    expect(incondizionata).toBeGreaterThan(-1);
    expect(condizionale).toBeGreaterThan(-1);
    expect(incondizionata).toBeLessThan(condizionale);
    expect(corpo).toMatch(/Somma parziale/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 2/19 · il capitolo CAT NAT non rende mai la spiegazione
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il capitolo dichiara il capitale «determinato sui beni indicati dalla norma» e non
 * rende nulla di ciò che il motore ha scritto: né la riserva sulla sezione ATECO A senza
 * divisione, né quella sulla base non quantificata. È la base su cui, al sinistro, opera
 * la proporzionale: dichiararla determinata quando il motore sa che non lo è è la
 * falsità che costa di più fra quelle di questa corsia.
 */
describe('Difetto 2/19 · il capitolo CAT NAT rende la spiegazione del motore', () => {
  it('stampa le note di catNat e non dichiara «determinato» un capitale che il motore non dichiara tale', () => {
    expect(REPORT).toMatch(/catNat\.spiegazione\.note/);
    expect(REPORT).not.toMatch(/determinato sui beni indicati dalla norma/);
  });

  it('le riserve che il motore scrive esistono e sono quelle che il capitolo deve portare', () => {
    const catnat = readFileSync(resolve(RADICE, 'packages/core/src/coverage/catnat.ts'), 'utf8');
    expect(catnat).toMatch(/Base assicurabile non quantificata/);
    expect(catnat).toMatch(/l’esclusione delle imprese agricole/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 10a · la variazione dell'EBIT è una frazione stampata come percentuale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ebitVariation` non è in punti percentuali: è il rapporto. Lo dimostra la risposta
 * stessa, che porta accanto i due EBIT da cui nasce.
 *
 * Un crollo del 391,84 % esce «−3,92 %» e un EBIT triplicato esce «+2 %»: il secondo è il
 * più pericoloso, perché non sembra un errore — sembra un'impresa ferma.
 */
describe('Difetto 10a · variazione EBIT', () => {
  it('la risposta dimostra che il campo è un rapporto, non una percentuale', () => {
    for (const i of IMPRESE) {
      const rapporto = (i.ebit - i.ebitDueEserciziPrima) / Math.abs(i.ebitDueEserciziPrima);
      expect(rapporto).toBeCloseTo(i.ebitVariation, 3);
      // E non è la stessa cosa: fra le due letture ci sono due ordini di grandezza.
      expect(Math.abs(rapporto * 100 - i.ebitVariation)).toBeGreaterThan(100);
    }
  });

  it('la schermata non stampa il rapporto sulla scala delle percentuali', () => {
    expect(INDICATORI).not.toMatch(/variazioneEbit,\s*'%'/);
    expect(INDICATORI).toMatch(/variazioneEbit,\s*'frazione%'/);
    expect(INDICATORI).toMatch(/frazione%/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 10b · «Rotazione di magazzino» è la durata delle scorte in giorni
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `totalInventoryTurnover` e `stockDuration` sono lo stesso numero, e il fascicolo li
 * stampa a due righe di distanza con due nomi opposti: «Rotazione di magazzino 161»
 * accanto a «Durata delle scorte 161 gg». Una rotazione di 161 volte l'anno su
 * un'impresa con quasi tre milioni di rimanenze è un dato che, letto ad alta voce a un
 * cliente, chiude la conversazione.
 *
 * La rotazione vera il fornitore la manda davvero, si chiama `inventoryRotation` e vale
 * 2,2421 — cioè 360 / 160,5641, l'anno commerciale. Ma **non attraversa il DTO**: quel
 * campo non esiste in `IndicatoriArchivioDto`. Finché non lo espone chi possiede il
 * confine, la sola correzione onesta qui è togliere la riga: il numero che porta è già
 * stampato, giusto e con l'unità giusta, due righe più su.
 */
describe('Difetto 10b · rotazione di magazzino', () => {
  it('la risposta dimostra che il campo è la durata delle scorte, non una rotazione', () => {
    const [prima] = IMPRESE;
    expect(prima.totalInventoryTurnover).toBeCloseTo(prima.stockDuration, 1);
    // 360 giorni: l'anno commerciale del fornitore, non i 365 del calendario.
    expect(prima.inventoryRotation * prima.stockDuration).toBeCloseTo(360, 0);
  });

  it('la schermata non chiama «rotazione» la durata delle scorte', () => {
    expect(INDICATORI).not.toMatch(/'Rotazione di magazzino',\s*dati\.kpi\?\.rotazioneMagazzino/);
  });

  it('la durata delle scorte resta stampata una volta sola, con la sua unità', () => {
    expect(INDICATORI).toMatch(/'Durata delle scorte',\s*dati\.cicloFinanziario\?\.durataScorte,\s*'gg'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 10c · il ROI del fornitore non è il ROI che la piattaforma definisce
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sulla seconda impresa l'EBIT è positivo (1.070.081 €) e il `roi` del fornitore vale
 * −323,28 %: un rapporto con numeratore positivo ed esito negativo ha un denominatore
 * negativo, e il totale attivo non lo è mai. Quindi il numero **non** è
 * `EBIT / Totale attivo` — che è la formula con cui questa stessa piattaforma definisce
 * il ROI, in `packages/core/src/company/indicators.ts`.
 *
 * L'etichetta lo affermava lo stesso, accanto a un ROA monetario di segno opposto. Non
 * si sceglie fra i due e non si sopprime il dato: si degrada l'affermazione a ciò che si
 * sa davvero, cioè che la base di calcolo è del fornitore e non è documentata.
 */
describe('Difetto 10c · il ROI del fornitore', () => {
  it('la risposta dimostra che il denominatore non è il totale attivo', () => {
    const seconda = IMPRESE[1];
    expect(seconda.ebit).toBeGreaterThan(0);
    expect(seconda.roi).toBeLessThan(0);
    // Due indici che dichiarano lo stesso denominatore non possono avere segno opposto.
    expect(Math.sign(seconda.roi)).not.toBe(Math.sign(seconda.roaMonetary));
  });

  it('la piattaforma definisce il ROI come EBIT sul totale attivo, altrove', () => {
    const indici = readFileSync(resolve(RADICE, 'packages/core/src/company/indicators.ts'), 'utf8');
    expect(indici).toMatch(/EBIT \/ Totale attivo/);
  });

  it('la schermata non attribuisce al numero del fornitore la definizione della piattaforma', () => {
    expect(INDICATORI).not.toMatch(/'ROI — rendimento del capitale investito'/);
    expect(INDICATORI).toMatch(/dati\.redditivita\?\.roi/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difetto 19 · «non determinata» dipinta con il colore del rischio basso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il server manda `'non determinata'` per le trentatré province che la tabella sismica
 * non classifica. La conversione a livello di rischio riconosce tre valori e chiude con
 * un ternario: tutto ciò che non è `alta` né `media` diventa `basso`, e prende il verde.
 *
 * A schermo il testo dice «non determinata» e il colore dice «va bene». Vince il colore:
 * è ciò che si legge per primo, e su una tabella di ubicazioni è spesso l'unica cosa che
 * si legge. Un'assenza dipinta di verde è peggio di un'assenza taciuta, perché sembra un
 * accertamento.
 *
 * La funzione vive ora in un modulo proprio per una ragione sola: dentro `page.tsx` —
 * componente server di Next — non si può eseguire, e un controllo che ne legge il
 * sorgente non è un controllo, è una lettura.
 */
describe('Difetto 19 · l’esposizione non determinata non prende il colore del rischio basso', () => {
  it('la conversione restituisce l’assenza come assenza, non come «bassa»', async () => {
    const { livelloTerritoriale } = await import('../src/app/azienda/[id]/esposizione-territoriale.js');
    expect(livelloTerritoriale('alta')).toBe('alto');
    expect(livelloTerritoriale('media')).toBe('moderato');
    expect(livelloTerritoriale('bassa')).toBe('basso');
    expect(livelloTerritoriale('non determinata')).toBeNull();
  });

  it('nessun valore ignoto diventa un livello: solo i tre noti hanno un colore', async () => {
    const { livelloTerritoriale } = await import('../src/app/azienda/[id]/esposizione-territoriale.js');
    for (const ignoto of ['', 'ND99', 'non rilevata', 'sconosciuta', 'ALTA']) {
      expect(livelloTerritoriale(ignoto)).toBeNull();
    }
  });

  it('la tabella delle ubicazioni disegna il badge neutro invece del badge di rischio', () => {
    expect(SCRIVANIA).not.toMatch(/BadgeRischio livello=\{livelloTerritoriale\(/);
    expect(SCRIVANIA).toMatch(/BadgeEsposizione/);
  });
});
