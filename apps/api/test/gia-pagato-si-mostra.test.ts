import { describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import type { CompanyDataProvider, FetchLevel } from '@aegis/providers';
import { buildServer } from '../src/server.js';

/**
 * Il dato già pagato si mostra, senza chiedere di ricliccare.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * L'approfondimento comprato resta in archivio trenta giorni. Per tutto quel tempo il
 * pulsante diceva «già acquistata» — e la scheda, senza il parametro nell'indirizzo,
 * costruiva l'analisi ORDINARIA. Su COMINOTTI, il 10/09/2026: «Score di credito: non
 * determinabile», «Fido consigliato: non determinabile», su un'impresa il cui profilo
 * completo era in casa e non costava niente.
 *
 * Il prodotto nascondeva un dato che il cliente aveva già comprato, e chiedeva un clic per
 * mostrarlo — un clic che a occhio costava trenta centesimi, e che quindi nessuno faceva.
 *
 * ── LA PROPRIETÀ CHE VA TENUTA FERMA ─────────────────────────────────────────
 *
 * Il parametro nell'indirizzo serve a COMPRARE. Ciò che è già in archivio si mostra
 * comunque. Sono due cose diverse, e per un anno sono state la stessa.
 *
 * Con il contrario ben visibile: quando NON è in archivio, l'approfondimento resta un
 * acquisto esplicito e non parte da solo. Fosse il contrario, ogni apertura di scheda
 * costerebbe cinque volte il dovuto.
 */

/** Un provider che dichiara cosa ha già in archivio e registra a che livello è stato letto. */
class ProviderConArchivio implements CompanyDataProvider {
  readonly name = 'Prova';
  readonly #base = new MockCompanyProvider();
  readonly #gia: { approfondimento: boolean; eventiNegativi: boolean };
  livelliChiesti: FetchLevel[] = [];
  negativitaChieste = 0;

  constructor(gia: { approfondimento: boolean; eventiNegativi: boolean }) {
    this.#gia = gia;
  }

  search = (c: Parameters<CompanyDataProvider['search']>[0]) => this.#base.search(c);
  cercaProspect = (c: Parameters<CompanyDataProvider['cercaProspect']>[0]) => this.#base.cercaProspect(c);
  screeningPersona = () => this.#base.screeningPersona();

  acquistoSenzaSpesa(_identificativo: string, cosa: 'approfondimento' | 'eventi-negativi') {
    return Promise.resolve(
      cosa === 'approfondimento' ? this.#gia.approfondimento : this.#gia.eventiNegativi,
    );
  }

  fetchProfile(
    identificativo: string,
    livello: FetchLevel,
    opzioni: { readonly conEventiNegativi?: boolean | undefined } = {},
  ) {
    this.livelliChiesti.push(livello);
    if (opzioni.conEventiNegativi === true) this.negativitaChieste += 1;
    return this.#base.fetchProfile(identificativo, livello, opzioni);
  }
}

const AZIENDA = '03158460174';

async function analizza(provider: ProviderConArchivio, corpo: Record<string, unknown> = {}) {
  const app = buildServer({ provider, autenticazione: false });
  try {
    const risposta = await app.inject({
      method: 'POST',
      url: `/api/aziende/${AZIENDA}/analisi`,
      payload: corpo,
    });
    return { stato: risposta.statusCode, corpo: risposta.json<Record<string, unknown>>() };
  } finally {
    await app.close();
  }
}

describe('L’approfondimento già in archivio si mostra da solo', () => {
  it('senza chiederlo, se è già pagato, la scheda legge il profilo completo', async () => {
    const provider = new ProviderConArchivio({ approfondimento: true, eventiNegativi: false });
    const { stato, corpo } = await analizza(provider);

    expect(stato).toBe(200);
    expect(provider.livelliChiesti, 'doveva leggere il profilo completo, non quello ordinario').toContain(
      'profondito',
    );
    expect(corpo['livelloMostrato']).toMatchObject({ approfondita: true });
  }, 30_000);

  it('e la scheda lo dichiara, così i pulsanti non offrono ciò che è già a schermo', async () => {
    const provider = new ProviderConArchivio({ approfondimento: true, eventiNegativi: true });
    const { corpo } = await analizza(provider);

    expect(corpo['livelloMostrato']).toMatchObject({ approfondita: true, eventiNegativi: true });
    expect(corpo['senzaSpesa']).toMatchObject({ approfondimento: true, eventiNegativi: true });
  }, 30_000);

  it('quando NON è in archivio non parte da solo: resta un acquisto esplicito', async () => {
    /*
      È il contrario che protegge il portafoglio: se l'approfondimento partisse comunque,
      ogni apertura di scheda costerebbe cinque volte l'analisi ordinaria, e nessuno se ne
      accorgerebbe fino alla fattura.
    */
    const provider = new ProviderConArchivio({ approfondimento: false, eventiNegativi: false });
    const { corpo } = await analizza(provider);

    expect(provider.livelliChiesti).not.toContain('profondito');
    expect(provider.negativitaChieste).toBe(0);
    expect(corpo['livelloMostrato']).toMatchObject({ approfondita: false, eventiNegativi: false });
  }, 30_000);

  it('chiesto esplicitamente, si compra anche se non è in archivio', async () => {
    const provider = new ProviderConArchivio({ approfondimento: false, eventiNegativi: false });
    await analizza(provider, { approfondita: true, eventiNegativi: true });

    expect(provider.livelliChiesti).toContain('profondito');
    expect(provider.negativitaChieste).toBe(1);
  }, 30_000);
});
