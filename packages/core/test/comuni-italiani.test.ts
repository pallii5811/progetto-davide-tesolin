import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMUNI_ITALIANI,
  FONTE_COMUNI,
  comuneDaTesto,
  comunePerCodiceCatastale,
  cercaComuni,
  etichettaComune,
  normalizzaNomeComune,
} from '../src/shared/comuni.js';

/**
 * La città della ricerca di nuovi clienti.
 *
 * È l'unico filtro obbligatorio, e il fornitore la riceve come codice catastale: un codice
 * sbagliato non dà errore, cerca le aziende di un altro comune e le fa pagare lo stesso.
 */
describe('Elenco dei comuni italiani', () => {
  it('è l’elenco ISTAT completo, con un codice catastale unico per comune', () => {
    expect(FONTE_COMUNI).toContain('ISTAT');
    // Il file del 21/02/2026 ne conta 7.894: un numero molto diverso è un elenco sbagliato.
    expect(COMUNI_ITALIANI.length).toBe(7894);

    const codici = new Set(COMUNI_ITALIANI.map((c) => c.codiceCatastale));
    expect(codici.size).toBe(COMUNI_ITALIANI.length);
    for (const comune of COMUNI_ITALIANI) {
      expect(comune.codiceCatastale, comune.nome).toMatch(/^[A-Z]\d{3}$/);
      expect(comune.sigla, comune.nome).toMatch(/^[A-Z]{2}$/);
      expect(comune.nome.trim(), comune.codiceCatastale).not.toBe('');
    }
  });

  it('i codici corrispondono ai comuni giusti', () => {
    // Verificati sull'elenco ISTAT e, per Roma, sull'esempio della specifica del fornitore.
    expect(comunePerCodiceCatastale('H501')).toMatchObject({ nome: 'Roma', sigla: 'RM' });
    expect(comunePerCodiceCatastale('B157')).toMatchObject({ nome: 'Brescia', sigla: 'BS' });
    expect(comunePerCodiceCatastale('A060')).toMatchObject({ nome: 'Adro', sigla: 'BS' });
    expect(comunePerCodiceCatastale('F672')).toMatchObject({ nome: 'Monticelli Brusati', sigla: 'BS' });
    expect(comunePerCodiceCatastale('A952')).toMatchObject({ nome: 'Bolzano', nomeAltraLingua: 'Bozen' });
  });

  it('un codice si legge anche minuscolo, e uno inesistente non indica nessun comune', () => {
    expect(comunePerCodiceCatastale(' b157 ')?.nome).toBe('Brescia');
    expect(comunePerCodiceCatastale('Z999')).toBeNull();
    expect(comunePerCodiceCatastale('')).toBeNull();
    expect(comunePerCodiceCatastale(null)).toBeNull();
    expect(comunePerCodiceCatastale(undefined)).toBeNull();
  });

  it('l’etichetta porta sempre la sigla, perché i nomi non sono unici', () => {
    const livo = COMUNI_ITALIANI.filter((c) => c.nome === 'Livo').map(etichettaComune);
    expect(livo.sort()).toEqual(['Livo (CO)', 'Livo (TN)']);
  });
});

describe('Cercare un comune mentre si scrive', () => {
  it('ignora accenti, maiuscole, apostrofi e trattini', () => {
    expect(normalizzaNomeComune("  Sant'Angelo  a CUPOLO ")).toBe('sant angelo a cupolo');
    expect(normalizzaNomeComune('Forlì')).toBe('forli');
    expect(cercaComuni('forli')[0]).toMatchObject({ nome: 'Forlì', sigla: 'FC' });
    expect(cercaComuni('FORLÌ')[0]?.nome).toBe('Forlì');
  });

  it('toglie anche l’accento in mezzo al nome, non solo quello in fondo', () => {
    /*
      Un accento in fondo al nome sparirebbe comunque, trasformato in spazio e poi tagliato:
      per questo la prova a vuoto che toglieva la rimozione degli accenti era rimasta verde.
      In mezzo al nome no — «Châtillon» diventerebbe «cha tillon» — e chi scrive «chatillon»
      non vedrebbe riconosciuto il comune.
    */
    expect(normalizzaNomeComune('Châtillon')).toBe('chatillon');
    expect(comuneDaTesto('chatillon')?.codiceCatastale).toBe('C294');
    expect(comuneDaTesto('Fenis')?.codiceCatastale).toBe('D537');
  });

  it('trova un nome con l’apostrofo anche scritto tutto attaccato', () => {
    expect(cercaComuni('santangeloacupolo').map((c) => c.nome)).toContain("Sant'Angelo a Cupolo");
    expect(cercaComuni('sant angelo a cupolo')[0]?.nome).toBe("Sant'Angelo a Cupolo");
  });

  it('il nome scritto per intero viene prima dei nomi che lo contengono', () => {
    const roma = cercaComuni('roma');
    expect(roma[0]).toMatchObject({ nome: 'Roma', sigla: 'RM' });
    expect(roma.length).toBeGreaterThan(1);
  });

  it('trova anche una parola in mezzo al nome', () => {
    expect(cercaComuni('emilia', 50).map((c) => c.nome)).toContain("Reggio nell'Emilia");
  });

  it('mostra entrambi i comuni omonimi, distinti dalla sigla', () => {
    const livo = cercaComuni('livo')
      .filter((c) => c.nome === 'Livo')
      .map((c) => c.sigla);
    expect(livo.sort()).toEqual(['CO', 'TN']);
  });

  it('trova il nome nell’altra lingua', () => {
    expect(cercaComuni('bozen')[0]?.nome).toBe('Bolzano');
  });

  it('riconosce l’etichetta scelta dall’elenco', () => {
    expect(cercaComuni('Brescia (BS)')[0]?.codiceCatastale).toBe('B157');
  });

  it('non propone niente per un testo vuoto, e rispetta il massimo', () => {
    expect(cercaComuni('')).toEqual([]);
    expect(cercaComuni('   ')).toEqual([]);
    expect(cercaComuni('san', 7)).toHaveLength(7);
    expect(cercaComuni('xyzqwv')).toEqual([]);
  });
});

describe('Quale comune indica un testo, senza ambiguità', () => {
  it('un nome che appartiene a un solo comune lo indica', () => {
    expect(comuneDaTesto('brescia')?.codiceCatastale).toBe('B157');
    expect(comuneDaTesto('Forli')?.codiceCatastale).toBe('D704');
    expect(comuneDaTesto('Roma')?.codiceCatastale).toBe('H501');
  });

  it('l’etichetta completa indica il comune anche quando il nome è condiviso', () => {
    expect(comuneDaTesto('Livo (TN)')?.codiceCatastale).toBe('E624');
    expect(comuneDaTesto('Livo (CO)')?.codiceCatastale).toBe('E623');
  });

  it('un nome condiviso da due comuni, o un nome a metà, non ne indica nessuno', () => {
    expect(comuneDaTesto('Livo')).toBeNull();
    expect(comuneDaTesto('Rom')).toBeNull();
    expect(comuneDaTesto('')).toBeNull();
  });
});

describe('Il sorgente dei comuni', () => {
  it('non contiene segni combinanti invisibili al posto delle sequenze scritte in chiaro', () => {
    /*
      È successo scrivendo questo modulo: la classe dei segni combinanti, pensata come
      sequenza ASCII, è arrivata sul disco come due caratteri invisibili veri. Funzionava, ma
      una riga che nessuno può leggere è una riga che un editor può rompere senza che si veda
      — la stessa forma della regola 2c, con un carattere diverso.
    */
    const sorgente = readFileSync(new URL('../src/shared/comuni.ts', import.meta.url), 'utf8');
    const invisibili = [...sorgente]
      .map((c) => c.codePointAt(0) ?? 0)
      .filter((n) => n >= 0x300 && n <= 0x36f)
      .map((n) => n.toString(16));
    expect(invisibili).toEqual([]);
  });
});
