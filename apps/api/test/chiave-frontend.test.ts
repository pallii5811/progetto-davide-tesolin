import { afterEach, describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';

/**
 * L'API si può esporre: una chiave condivisa davanti a tutto.
 *
 * ── PERCHÉ ────────────────────────────────────────────────────────────────────
 *
 * Finché l'API vive dietro `127.0.0.1` la sua difesa è la rete: il firewall chiude la porta
 * 3001 e nessuno da fuori la raggiunge. `deploy/01-macchina.sh` lo dice per esteso, e nello
 * stesso punto avverte che il CORS è `origin: true` con `credentials: true` — cioè che
 * *esporla la trasformerebbe in un problema*.
 *
 * Nel momento in cui il frontend si sposta altrove quella difesa sparisce. Serve un modo
 * per distinguere «la richiesta viene dalle mie pagine» da «la richiesta viene da
 * internet», e il cookie di sessione non basta: le rotte pubbliche — accesso, stato,
 * questionario — non ne hanno uno, e sono proprio quelle su cui si prova una password.
 *
 * ── LE DUE PROPRIETÀ, E LA SECONDA CONTA QUANTO LA PRIMA ─────────────────────
 *
 * 1. Con la chiave configurata, chi non la porta non entra — nemmeno sulle rotte pubbliche.
 * 2. **Senza chiave configurata non cambia niente.** È il caso di oggi, su una macchina
 *    sola: aggiungere un segreto lì non protegge da nulla e aggiunge solo un modo di
 *    sbagliare la configurazione. Se questa seconda proprietà cadesse, l'installazione
 *    esistente smetterebbe di funzionare al primo aggiornamento.
 *
 * ── PERCHÉ 404 E NON 401 ─────────────────────────────────────────────────────
 *
 * A chi ha diritto di parlare con l'API la distinzione non serve; a chi non ce l'ha non si
 * regala l'informazione che dietro quell'indirizzo c'è qualcosa, e che la chiave esiste.
 */

const CHIAVE = 'segreto-di-prova-che-nessuno-indovina';

afterEach(() => {
  delete process.env['AEGIS_CHIAVE_FRONTEND'];
});

function server() {
  return buildServer({ provider: new MockCompanyProvider(), autenticazione: false });
}

describe('Con la chiave configurata, senza chiave non si entra', () => {
  it('una rotta pubblica risponde 404 a chi non porta la chiave', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = CHIAVE;
    const app = server();
    try {
      const risposta = await app.inject({ method: 'GET', url: '/api/auth/stato' });
      expect(risposta.statusCode).toBe(404);
      expect(risposta.body, 'la risposta non deve rivelare che una chiave esiste').not.toContain('chiave');
    } finally {
      await app.close();
    }
  });

  it('una chiave sbagliata vale come nessuna chiave', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = CHIAVE;
    const app = server();
    try {
      const risposta = await app.inject({
        method: 'GET',
        url: '/api/auth/stato',
        headers: { 'x-aegis-frontend': 'segreto-di-prova-che-nessuno-indovin_' },
      });
      expect(risposta.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('una chiave più corta non passa: la lunghezza si confronta prima', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = CHIAVE;
    const app = server();
    try {
      const risposta = await app.inject({
        method: 'GET',
        url: '/api/auth/stato',
        headers: { 'x-aegis-frontend': 'segreto' },
      });
      expect(risposta.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('con la chiave giusta si passa', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = CHIAVE;
    const app = server();
    try {
      const risposta = await app.inject({
        method: 'GET',
        url: '/api/auth/stato',
        headers: { 'x-aegis-frontend': CHIAVE },
      });
      expect(risposta.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('la sonda di vita resta aperta: la interrogano installazione e aggiornamento', async () => {
    process.env['AEGIS_CHIAVE_FRONTEND'] = CHIAVE;
    const app = server();
    try {
      const risposta = await app.inject({ method: 'GET', url: '/health' });
      expect(risposta.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('Senza chiave configurata non cambia niente', () => {
  it('tutto risponde come prima, ed è il caso dell’installazione esistente', async () => {
    const app = server();
    try {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/stato' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('e una chiave mandata per sbaglio non dà fastidio', async () => {
    const app = server();
    try {
      const risposta = await app.inject({
        method: 'GET',
        url: '/api/auth/stato',
        headers: { 'x-aegis-frontend': 'una-chiave-qualunque' },
      });
      expect(risposta.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
