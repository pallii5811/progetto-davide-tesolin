import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  derivaPassword,
  generaPasswordIniziale,
  generaTokenSessione,
  improntaToken,
  verificaPassword,
  verificaRequisitiPassword,
} from '../src/auth.js';
import type { Persistenza } from '../src/persistenza.js';
import {
  accedi,
  creaUtenteDiProva,
  PASSWORD_DI_PROVA,
  persistenzaDiProva,
  serverDiProva,
} from './aiuti.js';

describe('Derivazione delle password', () => {
  it('la stessa password produce impronte diverse (sale casuale)', async () => {
    const a = await derivaPassword('passphrase-identica');
    const b = await derivaPassword('passphrase-identica');
    // Senza sale, due utenti con la stessa password avrebbero la stessa impronta e
    // un archivio rubato si romperebbe una volta sola per tutti.
    expect(a).not.toBe(b);
  });

  it('verifica correttamente la password giusta e rifiuta quella sbagliata', async () => {
    const record = await derivaPassword('passphrase-corretta-123');
    expect(await verificaPassword('passphrase-corretta-123', record)).toBe(true);
    expect(await verificaPassword('passphrase-corretta-124', record)).toBe(false);
    expect(await verificaPassword('', record)).toBe(false);
  });

  it('normalizza la forma Unicode: à composta e à decomposta sono la stessa password', async () => {
    const record = await derivaPassword('passphrase-perché-così̀');
    expect(await verificaPassword('passphrase-perché-così̀'.normalize('NFC'), record)).toBe(true);
  });

  it('non esplode su un record malformato', async () => {
    expect(await verificaPassword('x', 'non-un-record')).toBe(false);
    expect(await verificaPassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(await verificaPassword('x', '')).toBe(false);
  });

  it('i parametri di costo sono nel record, non nel codice', async () => {
    const record = await derivaPassword('qualunque-passphrase');
    expect(record.startsWith('scrypt$32768$8$1$')).toBe(true);
  });
});

describe('Requisiti delle password', () => {
  it('impone una lunghezza minima ragionevole', () => {
    expect(verificaRequisitiPassword('corta').valida).toBe(false);
    expect(verificaRequisitiPassword('passphrase-lunga-a-sufficienza').valida).toBe(true);
  });

  it('rifiuta le parole facilmente indovinabili', () => {
    expect(verificaRequisitiPassword('password12345').valida).toBe(false);
    expect(verificaRequisitiPassword('aegis-broker-2026').valida).toBe(false);
  });

  it('la password iniziale generata soddisfa i requisiti', () => {
    for (let i = 0; i < 20; i++) {
      expect(verificaRequisitiPassword(generaPasswordIniziale()).valida).toBe(true);
    }
  });
});

describe('Token di sessione', () => {
  it('genera token distinti e non banali', () => {
    const token = new Set(Array.from({ length: 200 }, () => generaTokenSessione()));
    expect(token.size).toBe(200);
  });

  it('l’impronta è deterministica e non reversibile per lunghezza', () => {
    const token = generaTokenSessione();
    expect(improntaToken(token)).toBe(improntaToken(token));
    expect(improntaToken(token)).toHaveLength(64);
    expect(improntaToken(token)).not.toContain(token);
  });
});

describe('Accesso e protezione delle rotte', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva();
    await creaUtenteDiProva(persistenza, 'broker@studio.it');
    app = serverDiProva(persistenza);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('senza cookie le rotte protette rispondono 401', async () => {
    const risposta = await app.inject({ method: 'GET', url: '/api/portafoglio' });
    expect(risposta.statusCode).toBe(401);
  });

  it('lo stato del servizio resta pubblico', async () => {
    const risposta = await app.inject({ method: 'GET', url: '/health' });
    expect(risposta.statusCode).toBe(200);
    expect(risposta.json()).toMatchObject({ autenticazione: true });
  });

  it('con credenziali corrette rilascia un cookie di sessione protetto', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'broker@studio.it', password: PASSWORD_DI_PROVA },
    });

    expect(risposta.statusCode).toBe(200);
    const cookie = risposta.cookies[0];
    // `httpOnly` è ciò che rende la sessione illeggibile a uno script iniettato nella pagina.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('con la sessione le rotte protette rispondono', async () => {
    const cookie = await accedi(app, 'broker@studio.it');
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie },
    });
    expect(risposta.statusCode).toBe(200);
  });

  it('non distingue utente inesistente da password errata', async () => {
    const inesistente = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'mai.visto@studio.it', password: 'qualunque-cosa-lunga' },
    });
    const sbagliata = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'broker@studio.it', password: 'password-errata-lunga' },
    });

    // Messaggi identici: distinguerli consentirebbe di enumerare gli indirizzi registrati.
    expect(inesistente.statusCode).toBe(401);
    expect(sbagliata.statusCode).toBe(401);
    expect(inesistente.json()).toEqual(sbagliata.json());
  });

  it('la disconnessione revoca la sessione, che non torna più valida', async () => {
    const cookie = await accedi(app, 'broker@studio.it');

    const uscita = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(uscita.statusCode).toBe(200);

    // È questo che un token autofirmato non può fare: restare valido fino a scadenza
    // anche dopo la disconnessione.
    const dopo = await app.inject({ method: 'GET', url: '/api/portafoglio', headers: { cookie } });
    expect(dopo.statusCode).toBe(401);
  });

  it('la disconnessione funziona anche senza corpo e senza Content-Type JSON', async () => {
    // È il caso reale: un modulo HTML manda `x-www-form-urlencoded`, `fetch` senza corpo
    // non manda nulla. Se la rotta li respinge, l'utente resta collegato credendo di
    // essere uscito — il peggior esito possibile per una funzione di sicurezza.
    const cookie = await accedi(app, 'broker@studio.it');

    const uscita = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: '',
    });

    expect(uscita.statusCode).toBe(200);
    const dopo = await app.inject({ method: 'GET', url: '/api/portafoglio', headers: { cookie } });
    expect(dopo.statusCode).toBe(401);
  });

  it('gli errori con codice proprio non vengono mascherati da un 500', async () => {
    const cookie = await accedi(app, 'broker@studio.it');
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie, 'content-type': 'application/xml' },
      payload: '<niente/>',
    });

    // Il tipo di contenuto non è supportato: deve dirlo, non fingere un guasto interno.
    expect(risposta.statusCode).toBe(415);
  });

  it('un cookie inventato non apre nulla', async () => {
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: 'aegis_sessione=token-inventato-di-sana-pianta' },
    });
    expect(risposta.statusCode).toBe(401);
  });

  it('blocca temporaneamente dopo ripetuti tentativi falliti', async () => {
    await creaUtenteDiProva(persistenza, 'bersaglio@studio.it');

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'bersaglio@studio.it', password: `tentativo-errato-${i}` },
      });
    }

    // Anche con la password corretta: il blocco è temporale, non condizionato all'esito.
    const dopoBlocco = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bersaglio@studio.it', password: PASSWORD_DI_PROVA },
    });
    expect(dopoBlocco.statusCode).toBe(429);
    // Sei verifiche di password in fila, e `scrypt` è lento **per costruzione**: è ciò che
    // rende costoso provare le password a raffica. Sotto carico i cinque secondi di
    // preimpostazione non bastano, e il test cadeva per scadenza invece che nel merito —
    // il tipo di rosso intermittente che insegna a non fidarsi della suite.
  }, 60_000);
});

describe('Isolamento fra intermediari', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookieAlfa: string;
  let cookieBeta: string;

  beforeAll(async () => {
    persistenza = await persistenzaDiProva('Studio Alfa');

    // Due intermediari distinti sullo stesso database: è la situazione reale di un
    // servizio in cloud, ed è quella in cui un `where` dimenticato diventa un incidente.
    const tenantBeta = await creaTenantSecondario(persistenza, 'Studio Beta');

    await creaUtenteDiProva(persistenza, 'alfa@studio.it');
    await creaUtenteDiProva(persistenza, 'beta@studio.it', tenantBeta);

    app = serverDiProva(persistenza);
    cookieAlfa = await accedi(app, 'alfa@studio.it');
    cookieBeta = await accedi(app, 'beta@studio.it');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('il portafoglio di un intermediario non è visibile all’altro', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/aziende/03158460174/analisi',
      headers: { cookie: cookieAlfa },
      payload: { asOf: '2026-08-17T00:00:00Z' },
    });

    const suo = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieAlfa },
    });
    const altrui = await app.inject({
      method: 'GET',
      url: '/api/portafoglio',
      headers: { cookie: cookieBeta },
    });

    expect(suo.json().riepilogo.totale).toBe(1);
    expect(altrui.json().riepilogo.totale).toBe(0);
  });

  it('i dati di intervista non attraversano il confine fra intermediari', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/aziende/02413390390/dossier',
      headers: { cookie: cookieAlfa },
      payload: { datiDichiarati: { numeroVeicoli: 42 } },
    });

    const suo = await app.inject({
      method: 'GET',
      url: '/api/aziende/02413390390/dossier',
      headers: { cookie: cookieAlfa },
    });
    const altrui = await app.inject({
      method: 'GET',
      url: '/api/aziende/02413390390/dossier',
      headers: { cookie: cookieBeta },
    });

    expect(suo.json().datiDichiarati.numeroVeicoli).toBe(42);
    expect(altrui.json().datiDichiarati).toBeNull();
  });

  it('anche il registro costi è separato', async () => {
    // Il provider dimostrativo non consuma credito, quindi il costo si registra a mano:
    // ciò che si vuole provare non è che il mock spenda, ma che la spesa di un
    // intermediario non compaia nel conto di un altro.
    await persistenza
      .perTenant(persistenza.tenantPredefinito)
      .registraCostiDati([
        { provider: 'OpenAPI.com', service: 'IT-advanced', costoStimatoCentesimi: 10, cacheHit: false },
      ]);

    const suo = await app.inject({ method: 'GET', url: '/api/costi', headers: { cookie: cookieAlfa } });
    const altrui = await app.inject({ method: 'GET', url: '/api/costi', headers: { cookie: cookieBeta } });

    expect(suo.json().totaleEuro).toBeCloseTo(0.1, 4);
    expect(altrui.json().chiamate).toBe(0);
  });
});

async function creaTenantSecondario(persistenza: Persistenza, denominazione: string): Promise<string> {
  const { schema } = await import('@aegis/db');
  const creati = await persistenza.db
    .insert(schema.tenants)
    .values({ denominazione })
    .returning({ id: schema.tenants.id });

  const creato = creati[0];
  if (creato === undefined) throw new Error('Creazione del secondo intermediario non riuscita');
  return creato.id;
}
