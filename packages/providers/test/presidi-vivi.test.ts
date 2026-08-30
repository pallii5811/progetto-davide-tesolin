/**
 * I presidi che dichiaravano di proteggere qualcosa e non giravano.
 *
 * Un presidio morto è peggio di nessun presidio: rassicura. Questo file tiene in vita i
 * due che stavano nel livello provider — la sorveglianza sui campi nuovi e la lettura
 * degli indicatori di presenza — e per ciascuno verifica **la cosa che dovrebbe prendere**,
 * non la forma della funzione.
 *
 * Regola di scrittura, imparata sui quattro presidi che passavano sempre: una prova che
 * gira su un insieme vuoto, o su una fixture costruita perché non possa fallire, non è una
 * prova. Ogni caso qui sotto è stato visto **rosso** prima della correzione.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPI_NOTI } from '../src/openapi/campi-noti.js';
import { SCARTATI_A_RAGION_VEDUTA, SorveglianzaCampi } from '../src/openapi/sorveglianza-campi.js';
import { mappaNegativita, soloIndicatori } from '../src/openapi/negativita.js';

const OSSERVATO = new Date('2026-08-29T10:00:00Z');

// ─────────────────────────────────────────────────────────────────────────────
// SorveglianzaCampi — il presidio che non era mai stato istanziato, nemmeno qui.
// ─────────────────────────────────────────────────────────────────────────────

describe('Sorveglianza sui campi nuovi: sa davvero riconoscerne uno', () => {
  it('segnala il campo che nessun lettore conosce, e una volta sola', () => {
    const s = new SorveglianzaCampi(['companyName', 'vatCode']);

    const primi = s.esamina('IT-advanced', {
      companyName: 'ALFA S.R.L.',
      vatCode: '01528120981',
      nuovoCampoDelFornitore: 'valore',
    });

    expect(primi.map((c) => c.percorso)).toEqual(['nuovoCampoDelFornitore']);

    // Un campo ignoto su mille analisi è una notizia sola: ripeterla la seppellisce.
    const secondi = s.esamina('IT-advanced', { nuovoCampoDelFornitore: 'altro valore' });
    expect(secondi).toEqual([]);
    expect(s.elenco()).toHaveLength(1);
  });

  it('non segnala ciò che è letto, né ciò che è scartato con motivo scritto', () => {
    const s = new SorveglianzaCampi(['companyName']);
    const nuovi = s.esamina('IT-advanced', { companyName: 'ALFA', id: 'opaco', success: true });
    expect(nuovi).toEqual([]);
  });

  it('guarda ogni elemento degli array, non solo il primo', () => {
    // Due protesti possono avere campi diversi — uno levato e uno no — e fermarsi al
    // primo è esattamente il modo di non accorgersi del secondo.
    const s = new SorveglianzaCampi(['data_protesto']);
    const nuovi = s.esamina('IT-negativita', {
      protesti: [
        { data_protesto: '2024-01-01' },
        { data_protesto: '2024-02-01', data_revoca: '2024-06-01' },
      ],
    });
    expect(nuovi.map((c) => c.percorso)).toEqual(['protesti.data_revoca']);
  });

  /*
    Il buco vero, e il motivo per cui questa prova esiste.

    L'appartenenza all'elenco degli scartati era verificata con `in`, che percorre la
    **catena dei prototipi**: `'constructor' in { … }` risponde `true` su qualunque oggetto
    letterale. Un campo che il fornitore chiamasse `constructor`, `toString`, `valueOf` o
    `hasOwnProperty` veniva quindi trattato come «scartato a ragion veduta» — cioè taciuto,
    con la motivazione di un altro campo.

    È il difetto peggiore per un presidio: non sbaglia rumorosamente, tace.
  */
  it('non scambia un metodo del prototipo per un campo scartato con cognizione', () => {
    const s = new SorveglianzaCampi(['companyName']);
    const nuovi = s.esamina('IT-full', {
      companyName: 'ALFA',
      constructor: 'un valore che il fornitore manda',
      toString: 'idem',
      valueOf: 'idem',
    });

    expect(nuovi.map((c) => c.percorso).sort()).toEqual(['constructor', 'toString', 'valueOf']);
  });

  it('ogni campo scartato porta il motivo per cui lo è', () => {
    // Senza motivazioni l'elenco torna a essere una lista di sviste.
    for (const [campo, motivo] of Object.entries(SCARTATI_A_RAGION_VEDUTA)) {
      expect(motivo.length, `«${campo}» è scartato senza spiegare perché`).toBeGreaterThan(20);
    }
  });
});

/**
 * La sorveglianza messa a girare sulle risposte **vere**.
 *
 * Finora la classe non era mai stata istanziata in nessun punto del repo, test compresi:
 * il presidio esisteva come testo. Qui gira sulle risposte registrate, con l'elenco dei
 * campi noti che il prodotto legge davvero — cioè esattamente la configurazione che
 * dovrebbe avere in produzione.
 */
describe('La sorveglianza gira sulle risposte registrate', () => {
  const SONDA = join(process.cwd(), '.sonda');

  const risposte = [
    'prod-IT-advanced-10354890963.json',
    'prod-IT-full-01528120981.json',
    'prod-IT-negativita-10354890963.json',
  ];

  it('non esplode e produce un elenco leggibile su ogni risposta reale', () => {
    if (!existsSync(SONDA)) return;

    const s = new SorveglianzaCampi(CAMPI_NOTI);
    for (const file of risposte) {
      const percorso = join(SONDA, file);
      if (!existsSync(percorso)) continue;
      s.esamina(file, JSON.parse(readFileSync(percorso, 'utf8')), OSSERVATO);
    }

    // Ogni segnalazione dev'essere utilizzabile da chi la legge: percorso, servizio,
    // esempio troncato. Un registro di voci vuote non si guarda una seconda volta.
    for (const campo of s.elenco()) {
      expect(campo.percorso.length).toBeGreaterThan(0);
      expect(campo.servizio.length).toBeGreaterThan(0);
      expect(campo.esempio.length).toBeLessThanOrEqual(60);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// soloIndicatori — due implementazioni della stessa domanda, e la viva era la debole.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `soloIndicatori` leggeva le tre grafie (`presenzaProtesti`, `hasProtests`, `protests`);
 * `mappaNegativita` ne rileggeva **una sola** per conto proprio. Erano due implementazioni
 * della stessa domanda, e quella esportata — con tutti i suoi test verdi — non aveva
 * chiamanti applicativi: viva era la più debole.
 *
 * È lo schema che il progetto ha già pagato con `classificaProcedura`, dieci righe più giù
 * nello stesso file: «due copie della stessa regola sono due regole».
 */
describe('Gli indicatori di presenza si leggono in un punto solo', () => {
  const conBuco = (chiavi: Record<string, unknown>): unknown => ({
    data: { protesti: null, pregiudizievoli: null, procedure: null, ...chiavi },
  });

  it('la grafia verificata è riconosciuta da entrambe le letture', () => {
    const risposta = conBuco({ presenzaProtesti: true, presenzaPregiudizievoli: true });

    expect(soloIndicatori(risposta)).toEqual({
      presenti: true,
      quali: ['protesti', 'pregiudizievoli'],
    });
    expect(mappaNegativita(risposta, OSSERVATO).value.presenzaDichiarataSenzaDettaglio).toEqual([
      'protesti',
      'pregiudizievoli',
    ]);
  });

  /*
    La divergenza, misurata.

    Su `hasProtests` la funzione esportata rispondeva «protesti dichiarati» e il mappatore
    che alimenta lo score rispondeva **niente**: `presenzaDichiarataSenzaDettaglio` usciva
    vuoto, cioè «il registro non ha dichiarato nulla». Su un'impresa protestata è il
    certificato di buona salute che questo prodotto esiste per non firmare.
  */
  it('e anche il ripiego: nessuna delle due grafie sfugge al mappatore che alimenta lo score', () => {
    const risposta = conBuco({ hasProtests: true, hasProcedures: true });

    expect(soloIndicatori(risposta)).toEqual({
      presenti: true,
      quali: ['protesti', 'procedure concorsuali'],
    });
    expect(mappaNegativita(risposta, OSSERVATO).value.presenzaDichiarataSenzaDettaglio).toEqual([
      'protesti',
      'procedure',
    ]);
  });

  it('le due letture non divergono su nessuna delle grafie previste', () => {
    const NOMI: Readonly<Record<string, string>> = {
      protesti: 'protesti',
      pregiudizievoli: 'pregiudizievoli',
      'procedure concorsuali': 'procedure',
    };

    for (const grafie of [
      { presenzaProtesti: true },
      { hasProtests: true },
      { presenzaPregiudizievoli: true },
      { hasPrejudicials: true },
      { presenzaProcedure: true },
      { hasProcedures: true },
      { presenzaProtesti: true, hasPrejudicials: true, presenzaProcedure: true },
    ]) {
      const risposta = conBuco(grafie);
      const attesi = (soloIndicatori(risposta)?.quali ?? []).map((q) => NOMI[q] ?? q);

      expect(
        [...mappaNegativita(risposta, OSSERVATO).value.presenzaDichiarataSenzaDettaglio],
        JSON.stringify(grafie),
      ).toEqual(attesi);
    }
  });

  it('quando il dettaglio c’è, nessuna delle due segnala una discordanza', () => {
    // La discordanza va segnalata solo quando esiste: dichiararla sempre la renderebbe
    // rumore, e chi legge smetterebbe di guardarla proprio quando conta.
    const risposta = {
      data: {
        hasProtests: true,
        protesti: [{ data_protesto: '2024-03-15', importo_protesto: 12_400 }],
        pregiudizievoli: null,
        procedure: null,
      },
    };

    const esito = mappaNegativita(risposta, OSSERVATO).value;
    expect(esito.protesti).toHaveLength(1);
    expect(esito.presenzaDichiarataSenzaDettaglio).toEqual([]);
  });

  it('senza alcun indicatore non inventa una dichiarazione', () => {
    expect(soloIndicatori({ data: { altro: 1 } })).toBeNull();
    expect(
      mappaNegativita({ data: { altro: 1 } }, OSSERVATO).value.presenzaDichiarataSenzaDettaglio,
    ).toEqual([]);
  });
});
