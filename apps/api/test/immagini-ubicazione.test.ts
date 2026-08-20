/**
 * Le fotografie allegate alle ubicazioni.
 *
 * Un file caricato è la superficie più esposta di tutto il prodotto: arriva da fuori,
 * viene conservato, e finisce nell'attributo `src` di un documento che qualcun altro
 * apre. I presidi che contano sono quattro, e sono tutti qui.
 *
 *  1. **Solo fotografie raster.** Niente SVG — che è un documento, non una fotografia, e
 *     per la facciata di un capannone non serve.
 *  2. **Il tipo dichiarato deve combaciare con il contenuto.** Due campi che dicono cose
 *     diverse sono un campo che mente, e uno dei due finisce nella pagina.
 *  3. **Il peso si misura sui byte veri**, non sul controllo cortese fatto nel browser:
 *     chiunque può chiamare la rotta senza passare dalla pagina.
 *  4. **Un tetto per ubicazione**, perché un report resti stampabile e spedibile.
 */

import { describe, expect, it } from 'vitest';
import { MockCompanyProvider } from '@aegis/providers';
import { buildServer } from '../src/server.js';
import { byteDiDataUri, LIMITE_IMMAGINE_BYTE, MAX_IMMAGINI_PER_UBICAZIONE } from '../src/schemas.js';

const AZIENDA = '03158460174';

/** Un JPEG minimo valido come data URI: contano la forma e il peso, non i pixel. */
function immagineFinta(byteApprossimativi = 900): string {
  const base64 = 'A'.repeat(Math.ceil((byteApprossimativi * 4) / 3 / 4) * 4);
  return `data:image/jpeg;base64,${base64}`;
}

function creaApp() {
  return buildServer({ provider: new MockCompanyProvider() });
}

async function carica(
  app: ReturnType<typeof buildServer>,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const risposta = await app.inject({
    method: 'POST',
    url: `/api/aziende/${AZIENDA}/immagini`,
    payload,
  });
  return { status: risposta.statusCode, body: risposta.json<Record<string, unknown>>() };
}

describe('Immagini delle ubicazioni', () => {
  it('allega una fotografia e la restituisce con la sua didascalia', async () => {
    const app = creaApp();
    const { status, body } = await carica(app, {
      ubicazioneId: 'adro|dellindustria|42',
      didascalia: 'Prospetto nord, copertura in pannello sandwich',
      tipoMime: 'image/jpeg',
      dati: immagineFinta(),
    });

    expect(status).toBe(201);
    expect(body['didascalia']).toBe('Prospetto nord, copertura in pannello sandwich');

    const elenco = await app.inject({ method: 'GET', url: `/api/aziende/${AZIENDA}/immagini` });
    const corpo = elenco.json<{ immagini: { ubicazioneId: string; dimensioneByte: number }[] }>();
    expect(corpo.immagini).toHaveLength(1);
    expect(corpo.immagini[0]?.ubicazioneId).toBe('adro|dellindustria|42');
    // La dimensione registrata è quella del file, non della stringa che l'ha trasportato.
    expect(corpo.immagini[0]?.dimensioneByte).toBeLessThan(immagineFinta().length);

    await app.close();
  });

  it('rifiuta un formato che non è una fotografia', async () => {
    const app = creaApp();

    // L'SVG è il caso che conta: è un documento, può contenere script, e sarebbe l'unico
    // formato «immagine» capace di portare comportamento dentro un fascicolo.
    const { status } = await carica(app, {
      ubicazioneId: 'x',
      didascalia: null,
      tipoMime: 'image/svg+xml',
      dati: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    });

    expect(status).toBe(400);
    await app.close();
  });

  it('rifiuta un contenuto che non è quello dichiarato', async () => {
    const app = creaApp();
    const { status, body } = await carica(app, {
      ubicazioneId: 'x',
      didascalia: null,
      tipoMime: 'image/png',
      dati: immagineFinta(), // dichiara PNG, trasporta JPEG
    });

    expect(status).toBe(400);
    expect(String(body['errore'])).toContain('non corrisponde');
    await app.close();
  });

  it('rifiuta un data URI che non è affatto un’immagine', async () => {
    const app = creaApp();
    const { status } = await carica(app, {
      ubicazioneId: 'x',
      didascalia: null,
      tipoMime: 'image/jpeg',
      dati: 'data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=',
    });

    expect(status).toBe(400);
    await app.close();
  });

  it('misura il peso sui byte decodificati e respinge chi sfora', async () => {
    const app = creaApp();
    const troppoGrande = immagineFinta(LIMITE_IMMAGINE_BYTE + 50_000);

    // La prova vale solo se il calcolo del peso è quello vero: verificarlo qui evita che
    // il collaudo passi per un errore di aritmetica invece che per il presidio.
    expect(byteDiDataUri(troppoGrande)).toBeGreaterThan(LIMITE_IMMAGINE_BYTE);

    const { status, body } = await carica(app, {
      ubicazioneId: 'x',
      didascalia: null,
      tipoMime: 'image/jpeg',
      dati: troppoGrande,
    });

    expect(status).toBe(413);
    expect(String(body['errore'])).toContain('MB');
    await app.close();
  });

  it('non accetta più immagini del tetto per ubicazione', async () => {
    const app = creaApp();

    for (let i = 0; i < MAX_IMMAGINI_PER_UBICAZIONE; i++) {
      const { status } = await carica(app, {
        ubicazioneId: 'stessa',
        didascalia: `scatto ${i}`,
        tipoMime: 'image/jpeg',
        dati: immagineFinta(),
      });
      expect(status).toBe(201);
    }

    const oltre = await carica(app, {
      ubicazioneId: 'stessa',
      didascalia: 'una di troppo',
      tipoMime: 'image/jpeg',
      dati: immagineFinta(),
    });
    expect(oltre.status).toBe(409);

    // Il tetto è **per ubicazione**, non per azienda: un'altra sede deve poter avere le sue.
    const altra = await carica(app, {
      ubicazioneId: 'altra',
      didascalia: null,
      tipoMime: 'image/jpeg',
      dati: immagineFinta(),
    });
    expect(altra.status).toBe(201);

    await app.close();
  });

  it('rimuove un’immagine, e rispondere «non trovata» due volte è corretto', async () => {
    const app = creaApp();
    const { body } = await carica(app, {
      ubicazioneId: 'x',
      didascalia: null,
      tipoMime: 'image/jpeg',
      dati: immagineFinta(),
    });

    const id = String(body['id']);
    const prima = await app.inject({
      method: 'DELETE',
      url: `/api/aziende/${AZIENDA}/immagini/${id}`,
    });
    expect(prima.statusCode).toBe(200);

    const seconda = await app.inject({
      method: 'DELETE',
      url: `/api/aziende/${AZIENDA}/immagini/${id}`,
    });
    expect(seconda.statusCode).toBe(404);

    await app.close();
  });

  it('le fotografie non entrano nel risultato dell’analisi', async () => {
    const app = creaApp();
    await carica(app, {
      ubicazioneId: 'adro|dellindustria|42',
      didascalia: null,
      tipoMime: 'image/jpeg',
      dati: immagineFinta(50_000),
    });

    const analisi = await app.inject({
      method: 'POST',
      url: `/api/aziende/${AZIENDA}/analisi`,
      payload: {},
    });

    /*
      È il vincolo che giustifica l'intera struttura: l'analisi si esegue e si congela di
      continuo, e se le immagini vi entrassero verrebbero trasportate a ogni calcolo e
      duplicate in archivio a ogni congelamento. Qui si misura che non succeda.
    */
    expect(analisi.body).not.toContain('data:image/jpeg');

    await app.close();
  });
});
