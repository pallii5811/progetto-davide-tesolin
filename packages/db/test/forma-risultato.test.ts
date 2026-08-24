/**
 * Le righe di una query grezza, qualunque driver ci sia sotto.
 *
 * Il guasto: il servizio si rifiutava di partire in produzione dichiarando «il database
 * non contiene lo schema di AEGIS» — su un database con diciotto tabelle appena migrate.
 *
 * La causa: `postgres-js`, il driver usato con PostgreSQL, restituisce da `execute()`
 * **direttamente l'array** delle righe. PGlite e node-postgres restituiscono un oggetto
 * con dentro `rows`. Il controllo dello schema leggeva solo `.rows`, trovava `undefined`,
 * e concludeva che la tabella non esistesse.
 *
 * Perché nessun collaudo lo vedeva: in sviluppo si gira su PGlite, e su PGlite quel
 * controllo **non viene nemmeno eseguito** — lì lo schema si crea all'avvio. Il primo
 * avvio su PostgreSQL vero è stato anche la prima esecuzione di quella riga di codice.
 *
 * La forma corretta era già scritta in quattro punti del pacchetto, copiata a mano. Il
 * quinto l'ha sbagliata: è la firma della duplicazione. Ora la funzione è una sola, e qui
 * si prova contro entrambe le forme senza bisogno di un database.
 */

import { describe, expect, it } from 'vitest';
import { righeDi } from '../src/client.js';

describe('righeDi normalizza la risposta dei driver', () => {
  it('postgres-js: il risultato È già l’array delle righe', () => {
    const daPostgresJs = [{ presente: true }, { presente: false }];
    expect(righeDi<{ presente: boolean }>(daPostgresJs)).toEqual([
      { presente: true },
      { presente: false },
    ]);
  });

  it('PGlite e node-postgres: le righe stanno dentro `rows`', () => {
    const daPglite = { rows: [{ presente: true }], fields: [], rowCount: 1 };
    expect(righeDi<{ presente: boolean }>(daPglite)).toEqual([{ presente: true }]);
  });

  it('una query senza risultati dà un elenco vuoto, non un errore', () => {
    expect(righeDi([])).toEqual([]);
    expect(righeDi({ rows: [] })).toEqual([]);
  });

  it('una risposta che non riconosce non fa cadere il servizio', () => {
    /*
      Meglio zero righe che un'eccezione: chi chiama sta già decidendo cosa fare quando
      non trova nulla, e un driver futuro con una terza forma non deve spegnere il
      programma all'avvio.
    */
    expect(righeDi(null)).toEqual([]);
    expect(righeDi(undefined)).toEqual([]);
    expect(righeDi({ qualcosaDaltro: 1 })).toEqual([]);
  });

  it('il caso esatto che bloccava l’avvio', () => {
    /*
      `SELECT to_regclass('public.aziende') IS NOT NULL AS presente` su postgres-js, con
      lo schema applicato. Prima si leggeva `.rows`, si trovava `undefined`, e il servizio
      annunciava che lo schema mancava.
    */
    const rispostaReale = [{ presente: true }];
    const righe = righeDi<{ presente?: boolean }>(rispostaReale);
    expect(righe[0]?.presente).toBe(true);
  });
});
