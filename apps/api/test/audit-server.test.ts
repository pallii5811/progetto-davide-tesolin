/**
 * I difetti della corsia «database e API» dell'audit di consegna.
 *
 * Ogni blocco porta il numero del reperto. Tutti sono stati visti **rossi** sul codice
 * non corretto prima di scrivere la correzione: un controllo che non ha mai fallito non
 * è un controllo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { creaUtente, elencoPortafoglio, schema, statiDaConfrontare } from '@aegis/db';
import type { Database } from '@aegis/db';
import { statoSorvegliato, rilevaEventi, Money } from '@aegis/core';
import type { CompanyAnalysis, StatoSorvegliato } from '@aegis/core';
import {
  MemoryCostLedger,
  MockCompanyProvider,
  OPENAPI_DEFAULT_CONFIG,
  conPrezzi,
  costoAnalisi,
  prezziDaConfigurazione,
} from '@aegis/providers';
import type { CompanyDataProvider, CriteriProspezione, FetchLevel, SearchCriteria } from '@aegis/providers';
import type { FastifyInstance } from 'fastify';
import { registraCosto } from '@aegis/db';
import { RegistroPerRichiesta } from '../src/costi-richiesta.js';
import { derivaPassword } from '../src/auth.js';
import { buildServer } from '../src/server.js';
import type { Persistenza } from '../src/persistenza.js';
import {
  accedi,
  creaUtenteDiProva,
  PASSWORD_DI_PROVA,
  persistenzaDiProva,
  serverDiProva,
} from './aiuti.js';

const EMAIL = 'audit@studio.it';

/** Partite IVA con carattere di controllo valido: il prodotto rifiuta le altre. */
const PIVA = [
  '12345678903',
  '12345678937',
  '12345678978',
  '12345679018',
  '12345679042',
  '12345679083',
  '12345679125',
  '12345679158',
  '12345679190',
  '12345679232',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 1 — «Esposizione complessiva» del portafoglio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un database che risponde come `postgres.js`.
 *
 * `elencoPortafoglio` legge con `db.execute`, cioè fuori dalla mappatura di Drizzle: i
 * tipi delle colonne non vengono applicati e il driver decide da solo. `postgres.js` non
 * ha un convertitore per l'OID 20 (`int8`) e restituisce la **stringa**; PGlite la
 * converte. Perciò l'archivio di sviluppo non può far comparire il difetto, e serve un
 * doppio del driver di produzione.
 */
function dbCheRispondeComePostgresJs(righe: readonly Record<string, unknown>[]): Database {
  return {
    execute: () => Promise.resolve(righe),
  } as unknown as Database;
}

describe('Reperto 1 · gli importi del portafoglio sono numeri, non stringhe', () => {
  const riga = (piva: string, esposizione: string): Record<string, unknown> => ({
    partita_iva: piva,
    denominazione: `Impresa ${piva}`,
    provincia: 'BS',
    ateco_primario: '25.62.00',
    score_credito: 70,
    classe_credito: 'B',
    stato_cat_nat: 'adempiente',
    copertura_assente: 2,
    copertura_da_quantificare: '1',
    rischi_critici: 3,
    esposizione_non_assicurata_centesimi: esposizione,
    azione_prioritaria: 'Quotare la CAT NAT',
    completezza: '0.5000',
    creata_il: '2026-08-30T10:00:00.000Z',
  });

  it('converte il bigint che il driver restituisce come stringa', async () => {
    const voci = await elencoPortafoglio(
      dbCheRispondeComePostgresJs([riga(PIVA[0], '150000'), riga(PIVA[1], '230000')]),
      'tenant-di-prova',
    );

    for (const voce of voci) {
      expect(typeof voce.esposizioneNonAssicurataCentesimi).toBe('number');
    }
    expect(voci[0]?.esposizioneNonAssicurataCentesimi).toBe(150_000);
    expect(voci[1]?.esposizioneNonAssicurataCentesimi).toBe(230_000);
  });

  it('la somma del portafoglio resta una somma', async () => {
    const voci = await elencoPortafoglio(
      dbCheRispondeComePostgresJs([riga(PIVA[0], '150000'), riga(PIVA[1], '230000')]),
      'tenant-di-prova',
    );

    // `0 + '150000' + '230000'` fa `'0150000230000'`, che diviso 100 dà 1.500.002.300 €.
    const somma = voci.reduce((acc, v) => acc + (v.esposizioneNonAssicurataCentesimi ?? 0), 0);
    expect(somma).toBe(380_000);
  });

  it('l’assenza resta assenza: un importo nullo non diventa zero', async () => {
    const voci = await elencoPortafoglio(
      dbCheRispondeComePostgresJs([{ ...riga(PIVA[0], '0'), esposizione_non_assicurata_centesimi: null }]),
      'tenant-di-prova',
    );

    expect(voci[0]?.esposizioneNonAssicurataCentesimi).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 12 — «3 nuove unità locali aperte» che nessuno ha aperto
// ─────────────────────────────────────────────────────────────────────────────

function analisiFinta(unitaLocali: number | null): CompanyAnalysis {
  const profilo = {
    anagrafica: {
      value: {
        formaGiuridicaDescrizione: 'Società a responsabilità limitata',
        statoAttivita: 'attiva',
        sedeLegale: { via: 'Via dell’Industria', civico: '42', comune: 'Ravenna' },
      },
    },
    eventiNegativi: null,
    unitaLocali: unitaLocali === null ? null : { value: Array.from({ length: unitaLocali }) },
  };

  return {
    asOf: new Date('2026-08-30T10:00:00Z'),
    profile: profilo,
    facts: {
      denominazione: 'Adriatica Logistica S.r.l.',
      ateco: '52.10.10',
      addetti: 35,
      fatturato: Money.euro(4_800_000),
      patrimonioNetto: Money.euro(2_560_000),
      numeroUnitaLocali: unitaLocali,
    },
    dimensione: { value: 'piccola' },
    bilancio: { anno: 2024 },
    sintesi: { scoreCredito: 76, classeCredito: 'B' },
    catNat: { value: { status: 'adempiente' } },
    gap: { gaps: [] },
  } as unknown as CompanyAnalysis;
}

function statoDiProva(modifiche: Partial<StatoSorvegliato> = {}): StatoSorvegliato {
  return {
    osservatoIl: '2026-08-30T10:00:00.000Z',
    denominazione: 'Adriatica Logistica S.r.l.',
    formaGiuridica: 'Società a responsabilità limitata',
    attiva: true,
    ateco: '52.10.10',
    indirizzoSedeLegale: 'Via dell’Industria 42, Ravenna',
    numeroUnitaLocali: 1,
    dimensione: 'piccola',
    addetti: 35,
    fatturato: Money.euro(4_800_000),
    annoUltimoBilancio: 2024,
    patrimonioNetto: Money.euro(2_560_000),
    scoreCredito: 76,
    classeCredito: 'B',
    proceduraConcorsualeAperta: false,
    eventiNegativiPresenti: false,
    statoCatNat: 'adempiente',
    capitaliRaccomandati: {},
    polizze: [],
    ...modifiche,
  };
}

describe('Reperto 12 · unità locali non acquisite non sono unità locali assenti', () => {
  it('senza il capitolo delle unità locali la fotografia dice «non lo so», non «zero»', () => {
    expect(statoSorvegliato(analisiFinta(null), []).numeroUnitaLocali).toBeNull();
    expect(statoSorvegliato(analisiFinta(3), []).numeroUnitaLocali).toBe(3);
  });

  it('non annuncia aperture quando a cambiare è il livello di acquisto', () => {
    const eventi = rilevaEventi(
      statoDiProva({ numeroUnitaLocali: null }),
      statoDiProva({ numeroUnitaLocali: 3 }),
      { asOf: new Date('2026-08-30T10:00:00Z') },
    );

    expect(eventi.filter((e) => e.tipo === 'nuova-sede')).toEqual([]);
  });

  it('un’apertura vera resta segnalata', () => {
    const eventi = rilevaEventi(
      statoDiProva({ numeroUnitaLocali: 1 }),
      statoDiProva({ numeroUnitaLocali: 3 }),
      { asOf: new Date('2026-08-30T10:00:00Z') },
    );

    expect(eventi.filter((e) => e.tipo === 'nuova-sede')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 71 — cinque aperture di pagina spingono via il termine di paragone
// ─────────────────────────────────────────────────────────────────────────────

describe('Reperto 71 · il monitoraggio confronta con l’ultima fotografia DIVERSA', () => {
  let persistenza: Persistenza;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio monitoraggio');
  }, 90_000);

  afterEach(async () => {
    await persistenza.chiudi();
  });

  it('quattro riletture identiche non nascondono la fotografia precedente', async () => {
    const { assicuraAzienda, salvaAnalisi, salvaSnapshot } = await import('@aegis/db');
    const tenantId = persistenza.tenantPredefinito;
    const aziendaId = await assicuraAzienda(persistenza.db, tenantId, {
      partitaIva: PIVA[0],
      codiceFiscale: null,
      denominazione: 'Sorvegliata S.r.l.',
      providerId: PIVA[0],
      provincia: 'BS',
      atecoPrimario: '25.62.00',
    });

    const registra = async (marcatore: string): Promise<void> => {
      const snapshotId = await salvaSnapshot(persistenza.db, {
        aziendaId,
        tenantId,
        provider: 'prova',
        livello: 'base',
        profilo: {},
        osservatoIl: new Date('2026-01-01T00:00:00Z'),
        costoCentesimi: 0,
      });
      await salvaAnalisi(persistenza.db, {
        aziendaId,
        tenantId,
        snapshotId,
        asOf: new Date('2026-01-01T00:00:00Z'),
        scoreCredito: 70,
        classeCredito: 'B',
        fidoConsigliatoCentesimi: null,
        patrimonioEspostoCentesimi: null,
        esposizioneNonAssicurataCentesimi: null,
        rischiCritici: 0,
        coperturaAssente: 0,
        statoCatNat: 'adempiente',
        risultato: { azioniPrioritarie: [] },
        statoSorvegliato: { marcatore },
        versioneCore: '0.1.0',
        versioneCatalogoRischi: '2026.1',
        versioneRegole: '2026.1',
        gap: [],
      });
    };

    await registra('prima');
    // Quattro aperture di pagina in un quarto d'ora: la fotografia non cambia, ma ogni
    // apertura ne scrive una nuova.
    for (let i = 0; i < 4; i++) await registra('seconda');

    const stati = await statiDaConfrontare(persistenza.db, tenantId);
    expect(stati).toHaveLength(1);
    expect((stati[0]?.corrente as { marcatore: string }).marcatore).toBe('seconda');
    // Confrontando le sole ultime due, «precedente» sarebbe di nuovo «seconda» e la
    // variazione sparirebbe dalla coda di lavoro.
    expect((stati[0]?.precedente as { marcatore: string } | null)?.marcatore).toBe('prima');
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperti 5, 33, 34, 35, 45, 70 — sul servizio
// ─────────────────────────────────────────────────────────────────────────────

/** Un fornitore che, a differenza di quello dimostrativo, dichiara di aver speso. */
class ProviderCheSpende implements CompanyDataProvider {
  readonly name = 'Fornitore di prova';
  readonly #interno = new MockCompanyProvider();

  constructor(
    private readonly registro: RegistroPerRichiesta,
    private readonly costoCentesimi: number,
  ) {}

  search(criteri: SearchCriteria) {
    return this.#interno.search(criteri);
  }

  cercaProspect(criteri: CriteriProspezione, opzioni?: { readonly soloConteggio?: boolean | undefined }) {
    return this.#interno.cercaProspect(criteri, opzioni);
  }

  async fetchProfile(
    identificativo: string,
    livello: FetchLevel,
    opzioni?: { readonly conEventiNegativi?: boolean | undefined },
  ) {
    const profilo = await this.#interno.fetchProfile(identificativo, livello, opzioni);
    this.registro.record({
      provider: 'Fornitore di prova',
      service: 'anagraficaEstesa',
      costoStimatoCentesimi: this.costoCentesimi,
      cacheHit: false,
      timestamp: new Date(),
      riferimento: identificativo,
    });
    return profilo;
  }
}

describe('Reperto 5 · l’archivio non sa se l’impresa è ancora attiva', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio archivio');
    await creaUtenteDiProva(persistenza, EMAIL);
    app = serverDiProva(persistenza);
    cookie = await accedi(app, EMAIL);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('non dichiara «attiva» un’impresa ritrovata in archivio', async () => {
    const { assicuraAzienda } = await import('@aegis/db');
    await assicuraAzienda(persistenza.db, persistenza.tenantPredefinito, {
      partitaIva: PIVA[0],
      codiceFiscale: null,
      denominazione: 'MECCANICA BRESCIANA S.R.L.',
      providerId: PIVA[0],
      provincia: 'BS',
      atecoPrimario: '25.62.00',
    });

    const risposta = await app.inject({
      method: 'GET',
      url: `/api/aziende/ricerca?partitaIva=${PIVA[0]}`,
      headers: { cookie },
    });

    expect(risposta.statusCode).toBe(200);
    const corpo = risposta.json<{
      daArchivio: boolean;
      risultati: readonly { attiva: boolean | null; statoAttivita: string | null }[];
    }>();

    expect(corpo.daArchivio).toBe(true);
    // La tabella `aziende` non ha una colonna di stato e la query non la seleziona: il
    // bollino verde era un'affermazione che nessun dato sosteneva.
    expect(corpo.risultati[0]?.statoAttivita).toBeNull();
    expect(corpo.risultati[0]?.attiva).toBeNull();
  }, 90_000);
});

describe('Reperto 33 · il ruolo in sola lettura può consultare e cambiarsi la password', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio sola lettura');
    await creaUtente(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      email: 'lettura@studio.it',
      nome: 'Chi legge soltanto',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'sola-lettura',
    });
    app = serverDiProva(persistenza);
    cookie = await accedi(app, 'lettura@studio.it');
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('può aprire un’azienda, che è tutto ciò che il ruolo promette', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[0]}/analisi`,
      headers: { cookie },
      payload: {},
    });

    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('può cambiarsi la password', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie },
      payload: { corrente: PASSWORD_DI_PROVA, nuova: 'un-altra-frase-lunga' },
    });

    expect(risposta.statusCode).toBe(200);
  }, 90_000);

  it('non può comprare gli approfondimenti a pagamento', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[1]}/analisi`,
      headers: { cookie },
      payload: { approfondita: true },
    });

    expect(risposta.statusCode).toBe(403);
    // Il rifiuto deve dire **perché**: prima arrivava dalla guardia sul verbo HTTP, che
    // rifiutava allo stesso modo la consultazione e l'acquisto.
    expect(risposta.json<{ errore: string }>().errore).toMatch(/approfond/i);
  }, 90_000);

  it('continua a non poter modificare il dossier', async () => {
    const risposta = await app.inject({
      method: 'PUT',
      url: `/api/aziende/${PIVA[0]}/dossier`,
      headers: { cookie },
      payload: { datiDichiarati: { numeroDipendenti: 10 } },
    });

    expect(risposta.statusCode).toBe(403);
  }, 90_000);
});

describe('Reperto 34 · chi dimentica la password rientra dallo studio, non dal terminale', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio password');
    await creaUtente(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      email: 'capo@studio.it',
      nome: 'Amministratore',
      passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
      ruolo: 'amministratore',
    });
    await creaUtenteDiProva(persistenza, 'smemorato@studio.it');
    app = serverDiProva(persistenza);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('l’amministratore reimposta la password di un collaboratore', async () => {
    const cookie = await accedi(app, 'capo@studio.it');
    const { elencoUtenti } = await import('@aegis/db');
    const utenti = await elencoUtenti(persistenza.db, persistenza.tenantPredefinito);
    const smemorato = utenti.find((u) => u.email === 'smemorato@studio.it');
    expect(smemorato).toBeDefined();

    const risposta = await app.inject({
      method: 'POST',
      url: `/api/utenti/${smemorato!.id}/reimposta-password`,
      headers: { cookie },
      payload: {},
    });

    expect(risposta.statusCode).toBe(200);
    const nuova = risposta.json<{ passwordIniziale: string }>().passwordIniziale;
    expect(typeof nuova).toBe('string');

    // La prova che serve: con quella password si rientra davvero.
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'smemorato@studio.it', password: nuova },
    });
    expect(accesso.statusCode).toBe(200);
  }, 120_000);

  it('un collaboratore non può reimpostare la password di un altro', async () => {
    const cookie = await accedi(app, 'smemorato@studio.it');
    const { elencoUtenti } = await import('@aegis/db');
    const utenti = await elencoUtenti(persistenza.db, persistenza.tenantPredefinito);
    const capo = utenti.find((u) => u.email === 'capo@studio.it');

    const risposta = await app.inject({
      method: 'POST',
      url: `/api/utenti/${capo!.id}/reimposta-password`,
      headers: { cookie },
      payload: {},
    });

    expect(risposta.statusCode).toBe(403);
  }, 120_000);
});

describe('Reperto 35 · il tetto ferma la spesa, non la consultazione di ciò che è già pagato', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    persistenza = await persistenzaDiProva('Studio al tetto');
    await creaUtenteDiProva(persistenza, EMAIL);
    app = serverDiProva(persistenza);
    cookie = await accedi(app, EMAIL);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('un’azienda già in archivio si riapre anche a tetto raggiunto', async () => {
    const prima = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[0]}/analisi`,
      headers: { cookie },
      payload: {},
    });
    expect(prima.statusCode).toBe(200);

    await registraCosto(persistenza.db, {
      tenantId: persistenza.tenantPredefinito,
      aziendaId: null,
      provider: 'OpenAPI.com',
      servizio: 'IT-advanced',
      costoCentesimi: 5_000,
      servitoDaCache: false,
    });

    // Il tetto si legge alla costruzione del servizio: serve un'istanza nuova.
    await app.close();
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '1';
    app = serverDiProva(persistenza);
    cookie = await accedi(app, EMAIL);

    const dopo = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[0]}/analisi`,
      headers: { cookie },
      payload: {},
    });
    expect(dopo.statusCode).toBe(200);

    // Un'impresa mai vista costa: quella resta fuori.
    const nuova = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[5]}/analisi`,
      headers: { cookie },
      payload: {},
    });
    expect(nuova.statusCode).toBe(429);
  }, 180_000);
});

describe('Reperto 45 · l’audit trail registra CHI', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;
  let utenteId: string;

  beforeEach(async () => {
    persistenza = await persistenzaDiProva('Studio a verbale');
    utenteId = await creaUtenteDiProva(persistenza, EMAIL);
    app = serverDiProva(persistenza);
    cookie = await accedi(app, EMAIL);
  }, 90_000);

  afterEach(async () => {
    await app.close();
    await persistenza.chiudi();
  });

  it('l’analisi porta il nome di chi l’ha eseguita, nel registro e nella riga', async () => {
    const risposta = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[0]}/analisi`,
      headers: { cookie },
      payload: {},
    });
    expect(risposta.statusCode).toBe(200);

    const registro = await persistenza.db
      .select({ utenteId: schema.auditLog.utenteId, azione: schema.auditLog.azione })
      .from(schema.auditLog);

    const eseguita = registro.find((r) => r.azione === 'analisi.eseguita');
    expect(eseguita).toBeDefined();
    // `DOMINIO.md` lo vende come conformità IVASS: un registro senza autore non risponde
    // alla sola domanda che un'ispezione pone.
    expect(eseguita?.utenteId).toBe(utenteId);

    const analisi = await persistenza.db
      .select({ eseguitaDa: schema.analisi.eseguitaDa })
      .from(schema.analisi);
    expect(analisi[0]?.eseguitaDa).toBe(utenteId);
  }, 120_000);

  it('il dossier porta il nome di chi l’ha aggiornato', async () => {
    const risposta = await app.inject({
      method: 'PUT',
      url: `/api/aziende/${PIVA[0]}/dossier`,
      headers: { cookie },
      payload: { datiDichiarati: { numeroDipendenti: 12 } },
    });
    expect(risposta.statusCode).toBe(200);

    const dossier = await persistenza.db
      .select({ aggiornatoDa: schema.dossier.aggiornatoDa })
      .from(schema.dossier);
    expect(dossier[0]?.aggiornatoDa).toBe(utenteId);
  }, 120_000);

  it('il questionario compilato dal cliente NON attribuisce l’aggiornamento a un utente', async () => {
    const invito = await app.inject({
      method: 'POST',
      url: `/api/aziende/${PIVA[1]}/questionario/invito`,
      headers: { cookie },
      payload: {},
    });
    expect(invito.statusCode).toBe(201);
    const token = invito.json<{ token: string }>().token;

    const salvataggio = await app.inject({
      method: 'PUT',
      url: `/api/questionario/${token}`,
      payload: { datiDichiarati: { numeroDipendenti: 8 } },
    });
    expect(salvataggio.statusCode).toBe(200);

    const righe = await persistenza.db
      .select({ utenteId: schema.auditLog.utenteId, azione: schema.auditLog.azione })
      .from(schema.auditLog);
    const compilato = righe.find((r) => r.azione === 'questionario.compilato-dal-cliente');
    expect(compilato).toBeDefined();
    // Chi ha compilato è il cliente, non un collaboratore dello studio: attribuirglielo
    // sarebbe peggio che lasciarlo vuoto.
    expect(compilato?.utenteId).toBeNull();
  }, 120_000);
});

describe('Reperto 56 · il prezzo mostrato prima di spendere è quello del contratto', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env['AEGIS_PREZZI_CENTESIMI'] = 'anagraficaEstesa=3,profiloCompleto=9,eventiNegativi=6';
    persistenza = await persistenzaDiProva('Studio a contratto');
    app = serverDiProva(persistenza);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_PREZZI_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('dichiara il prezzo del contratto, non quello del listino pubblico', async () => {
    const daContratto = conPrezzi(
      OPENAPI_DEFAULT_CONFIG,
      prezziDaConfigurazione('anagraficaEstesa=3,profiloCompleto=9,eventiNegativi=6'),
    );

    // Il controllo deve poter fallire: se i due numeri coincidessero non proverebbe nulla.
    expect(costoAnalisi('completo', daContratto)).not.toBe(costoAnalisi('completo'));

    const risposta = await app.inject({ method: 'GET', url: '/health' });
    const corpo = risposta.json<{
      costoAnalisiCentesimi: number;
      costoAnalisiApprofonditaCentesimi: number;
    }>();

    expect(corpo.costoAnalisiCentesimi).toBe(costoAnalisi('completo', daContratto));
    expect(corpo.costoAnalisiApprofonditaCentesimi).toBe(costoAnalisi('profondito', daContratto));
  }, 90_000);
});

describe('Reperto 70 · il tetto si controlla a ogni azienda, non una volta per file', () => {
  let persistenza: Persistenza;
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    // Tre analisi da dieci centesimi e il tetto è superato.
    process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'] = '25';
    persistenza = await persistenzaDiProva('Studio importazione');
    await creaUtenteDiProva(persistenza, EMAIL);

    const registro = new RegistroPerRichiesta(new MemoryCostLedger());
    app = buildServer({ provider: new ProviderCheSpende(registro, 10), persistenza });
    cookie = await accedi(app, EMAIL);
  }, 90_000);

  afterEach(async () => {
    delete process.env['AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI'];
    await app.close();
    await persistenza.chiudi();
  });

  it('si ferma quando il tetto viene raggiunto durante l’importazione', async () => {
    const contenuto = ['P.IVA;Denominazione', ...PIVA.map((p, i) => `${p};Impresa ${i}`)].join('\n');

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/portafoglio/importa',
      headers: { cookie },
      payload: { contenuto },
    });

    expect(risposta.statusCode).toBe(200);
    const esito = risposta.json<{
      acquisite: number;
      fallite: readonly { partitaIva: string; motivo: string }[];
      interrottaPerTetto: boolean;
    }>();

    // Dieci aziende a dieci centesimi sono un euro su un tetto da venticinque centesimi:
    // controllare una volta sola prima del ciclo lascia passare l'intero file.
    expect(esito.acquisite).toBeLessThan(PIVA.length);
    expect(esito.acquisite).toBeLessThanOrEqual(3);
    expect(esito.interrottaPerTetto).toBe(true);
    // Ciò che è rimasto fuori si dichiara, non sparisce in silenzio.
    expect(esito.fallite.length).toBe(PIVA.length - esito.acquisite);
  }, 180_000);

  it('la spesa registrata non sfonda il tetto di più di un’analisi', async () => {
    const contenuto = ['P.IVA;Denominazione', ...PIVA.map((p, i) => `${p};Impresa ${i}`)].join('\n');

    await app.inject({
      method: 'POST',
      url: '/api/portafoglio/importa',
      headers: { cookie },
      payload: { contenuto },
    });

    const righe = await persistenza.db.execute(
      sql`SELECT COALESCE(SUM(costo_centesimi), 0)::int AS speso FROM registro_costi_dati WHERE servito_da_cache = false`,
    );
    const riga = (Array.isArray(righe) ? righe : (righe as { rows: { speso: number }[] }).rows)[0];

    // Le spese si annotavano solo alla fine del ciclo: il tetto da 25 centesimi vedeva
    // sempre zero, e un euro intero passava. Lo sforamento ammesso è quello di
    // un'operazione sola, non quello dell'intero file.
    expect(Number(riga?.speso)).toBeLessThanOrEqual(25 + 10);
  }, 180_000);
});
