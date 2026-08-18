/**
 * Nessuna chiamata all'API senza sessione.
 *
 * Nasce da un guasto reale e silenzioso: due punti del frontend chiamavano l'API con una
 * `fetch` nuda, quindi **anonima**. L'API rispondeva 401, ma il corpo di quel 401 è JSON
 * valido — nessuna eccezione da intercettare. Il risultato: la pagina «Catalogo rischi»
 * andava in errore su un campo mancante, e il salvataggio dell'intervista falliva senza
 * dire perché. Nessun test lo aveva visto, perché la suite gira senza autenticazione.
 *
 * Da qui in avanti tutte le chiamate passano da due soli moduli, che il cookie lo
 * inoltrano sempre. Questo test lo verifica leggendo il codice sorgente: è una regola di
 * architettura, e va fatta rispettare dalla macchina, non dalla buona memoria.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SORGENTI = fileURLToPath(new URL('../src', import.meta.url));

/** Gli unici moduli autorizzati a costruire una chiamata verso l'API. */
const AUTORIZZATI = ['lib\\api.ts', 'lib/api.ts', 'lib\\chiamata-server.ts', 'lib/chiamata-server.ts'];

function fileSorgente(cartella: string): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) return fileSorgente(percorso);
    return /\.(ts|tsx)$/.test(nome) ? [percorso] : [];
  });
}

describe('Disciplina delle chiamate all’API', () => {
  const file = fileSorgente(SORGENTI);

  it('trova i file sorgente del frontend', () => {
    expect(file.length).toBeGreaterThan(10);
  });

  /**
   * Ciò che è vietato è **leggere l'ambiente** per costruirsi l'indirizzo, non nominare
   * la variabile: un messaggio d'errore che dice all'utente quale variabile impostare è
   * utile, e cercare la sola stringa lo vieterebbe insieme al resto.
   *
   * Il controllo copre entrambe le forme d'accesso — `process.env.X` e `process.env['X']`
   * — e in più vieta gli indirizzi scritti a mano, che aggirerebbero la regola senza
   * mai nominare la variabile.
   */
  const LETTURA_AMBIENTE = /process\.env(?:\.AEGIS_API_URL|\[\s*['"]AEGIS_API_URL['"]\s*\])/;
  const INDIRIZZO_A_MANO = /https?:\/\/(?:127\.0\.0\.1|localhost)/;

  it('nessun modulo fuori dai due autorizzati costruisce l’indirizzo dell’API', () => {
    const trasgressori = file
      .filter((percorso) => !AUTORIZZATI.some((consentito) => percorso.endsWith(consentito)))
      .filter((percorso) => {
        const sorgente = readFileSync(percorso, 'utf8');
        return LETTURA_AMBIENTE.test(sorgente) || INDIRIZZO_A_MANO.test(sorgente);
      })
      .map((percorso) => percorso.slice(SORGENTI.length + 1));

    // Chi costruisce l'indirizzo da sé, prima o poi dimentica il cookie.
    expect(trasgressori).toEqual([]);
  });

  it('i moduli autorizzati inoltrano davvero il cookie di sessione', () => {
    for (const consentito of ['lib/api.ts', 'lib/chiamata-server.ts']) {
      const contenuto = readFileSync(join(SORGENTI, consentito), 'utf8');
      expect(contenuto, consentito).toContain('NOME_COOKIE_SESSIONE');
      expect(contenuto, consentito).toMatch(/cookie:\s*`\$\{NOME_COOKIE_SESSIONE\}=/);
    }
  });
});
