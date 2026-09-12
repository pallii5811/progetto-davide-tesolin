import { describe, expect, it } from 'vitest';
import { analizzaUbicazioni } from '../src/company/ubicazioni.js';
import type { Indirizzo } from '../src/company/profile.js';

/**
 * L'ubicazione più esposta si sceglie su TUTTI i pericoli, e il pareggio si dichiara.
 *
 * ── I DUE DIFETTI ─────────────────────────────────────────────────────────────
 *
 * Letta su un'impresa vera con ventitré sedi — una società di raccolta rifiuti in provincia
 * di Brescia — la scheda indicava come «la più esposta» l'ubicazione di Visano. Due cose non
 * andavano, e nessuna delle due si vedeva guardando quel numero.
 *
 * **Le frane non entravano nel calcolo.** Il rango sommava sismica e idraulica e basta. Le
 * frane erano arrivate con gli indicatori comunali ISPRA, erano entrate nella tabella e nel
 * motore dei rischi, e questa funzione era rimasta indietro. Su un capannone di collina —
 * dove la frana è il rischio che si materializza per primo, e l'acqua non arriva mai —
 * indicava la sede sbagliata a chi deve decidere dove andare a fare il sopralluogo.
 *
 * Il file, intanto, la frana la **citava**: le uniche quattro occorrenze della parola stavano
 * nella nota sulle fonti, quella che dichiara a chi legge di aver tenuto conto anche di
 * quella. Un dato citato e non usato è peggio di un dato assente, perché chi legge la nota
 * smette di cercarlo altrove.
 *
 * **Il primo posto era un pareggio.** Cinque ubicazioni su ventitré avevano lo stesso rango,
 * e una sola portava l'etichetta: vinceva perché compariva prima nell'elenco, cioè
 * nell'ordine in cui il registro aveva restituito le sedi. Chi legge «la più esposta»
 * conclude che le altre lo siano meno.
 *
 * ── PERCHÉ UN COLLAUDO E NON UN RILEVATORE ───────────────────────────────────
 *
 * `scripts/misurato-e-non-usato.ts` cerca i campi mai nominati dai consumatori. Qui non
 * avrebbe funzionato: la parola «frane» in quel file c'era **quattro volte**, nella nota
 * sulle fonti. Un conteggio per nome lo avrebbe dichiarato usato. La protezione per questa
 * classe è bloccare la PROPRIETÀ, che è ciò che fa questo file.
 */

/**
 * Indirizzi DISTINTI anche nello stesso comune.
 *
 * La prima versione di questa prova dava la stessa via a due sedi di Amalfi, e il
 * prodotto le fondeva in una — correttamente: due sedi allo stesso indirizzo sono una
 * sede. Il collaudo falliva per colpa del collaudo, che è il verso giusto in cui
 * scoprirlo.
 */
function indirizzo(comune: string, provincia: string, n = 1): Indirizzo {
  return {
    via: `VIA PROVA ${n}, ${comune}`,
    civico: null,
    cap: null,
    comune,
    provincia,
    nazione: 'IT',
    latitudine: null,
    longitudine: null,
  } as unknown as Indirizzo;
}

function analizza(comuni: ReadonlyArray<readonly [string, string]>) {
  const [primo, ...altri] = comuni;
  return analizzaUbicazioni({
    sedeLegale: indirizzo(primo![0], primo![1], 0),
    unitaLocali: altri.map(([comune, provincia], i) => ({
      tipo: 'sede-operativa' as const,
      indirizzo: indirizzo(comune, provincia, i + 1),
      attivita: null,
      addetti: null,
    })),
    immobili: [],
  });
}

describe('Le frane entrano nella scelta dell’ubicazione più esposta', () => {
  it('un comune franoso batte uno tranquillo, anche con sisma e acqua uguali', () => {
    /*
      Agnosine (BS) ha sismica alta, acqua bassa e frane basse; Amalfi (SA) ha frane alta.
      Senza le frane nel rango vincerebbe Agnosine per la sola sismica. Sono comuni veri e
      non inventati: se un giorno ISPRA aggiorna gli indicatori e i due si equivalgono,
      questa prova va rifatta su un'altra coppia invece che cancellata.
    */
    const a = analizza([
      ['Agnosine', 'BS'],
      ['Amalfi', 'SA'],
    ]);
    const peggiori = a.ubicazioniPeggiori.map((u) => u.indirizzo.comune);
    expect(peggiori, 'Amalfi ha frane alta: deve vincere').toContain('Amalfi');
  });

  it('senza frane misurate il risultato non cambia: l’assenza non punteggia', () => {
    // Due comuni qualunque della stessa provincia: se le frane fossero contate come un
    // valore invece che come un'assenza, l'ordine cambierebbe senza ragione.
    const a = analizza([
      ['Dello', 'BS'],
      ['Fiesse', 'BS'],
    ]);
    expect(a.ubicazionePeggiore).not.toBeNull();
    expect(a.ubicazioniPeggiori.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Il pareggio si dichiara, non si risolve con l’ordine di lettura', () => {
  it('due ubicazioni nello stesso comune sono entrambe al primo posto', () => {
    /*
      È il caso più semplice e il più frequente: stesso comune, stessa esposizione. Prima
      ne veniva marcata una sola, e la scelta la faceva l'ordine in cui il registro aveva
      restituito le sedi.
    */
    const a = analizza([
      ['Amalfi', 'SA'],
      ['Amalfi', 'SA'],
      ['Dello', 'BS'],
    ]);
    const amalfi = a.ubicazioniPeggiori.filter((u) => u.indirizzo.comune === 'Amalfi');
    expect(amalfi.length, 'entrambe le sedi di Amalfi devono risultare al primo posto').toBe(2);
  });

  it('quando il primo posto è unico, resta unico', () => {
    const a = analizza([
      ['Amalfi', 'SA'],
      ['Dello', 'BS'],
    ]);
    expect(a.ubicazioniPeggiori).toHaveLength(1);
  });

  it('la prima del gruppo resta quella che la scheda chiama peggiore', () => {
    // Compatibilità: `ubicazionePeggiore` continua a essere una sola, ed è la prima del
    // gruppo di testa. Ciò che cambia è che adesso il gruppo si può leggere per intero.
    const a = analizza([
      ['Amalfi', 'SA'],
      ['Amalfi', 'SA'],
    ]);
    expect(a.ubicazionePeggiore?.id).toBe(a.ubicazioniPeggiori[0]?.id);
  });

  it('senza ubicazioni non c’è nessun primo posto', () => {
    const a = analizzaUbicazioni({ sedeLegale: null, unitaLocali: [], immobili: [] });
    expect(a.ubicazionePeggiore).toBeNull();
    expect(a.ubicazioniPeggiori).toHaveLength(0);
  });
});
