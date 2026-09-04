/**
 * Cercare un'azienda che si ha già non deve costare nulla.
 *
 * È il difetto più fastidioso del nostro modello rispetto a Creditsafe: da loro cercare è
 * gratis e illimitato, da noi ogni ricerca compra un'anagrafica da dieci centesimi. Un
 * broker che digita tre volte il nome sbagliato prima di trovare il cliente giusto ha speso
 * trenta centesimi per arrivare a un'azienda che aveva già in casa.
 *
 * Le due proprietà che contano, e sono in tensione fra loro:
 *
 *  - **chi cerca una cosa che ha già non paga**;
 *  - **l'archivio consultato è il proprio**. Le risposte comprate si condividono fra gli
 *    studi — sono dati pubblici pagati con un contratto unico — ma l'elenco di chi si segue
 *    no: sapere quali aziende un altro studio ha analizzato significa sapere chi sono i suoi
 *    clienti e chi sta cercando di acquisire.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creaPersistenza } from '../src/persistenza.js';
import type { Persistenza } from '../src/persistenza.js';
import { cercaAziendeInArchivio } from '@aegis/db';

describe('Ricerca fra le aziende già in archivio', () => {
  let persistenza: Persistenza;
  let studioA: string;
  let studioB: string;

  beforeAll(async () => {
    persistenza = await creaPersistenza({ denominazioneTenant: 'Studio A' });
    studioA = persistenza.tenantPredefinito;

    const { schema, assicuraAzienda } = await import('@aegis/db');
    const creati = await persistenza.db
      .insert(schema.tenants)
      .values({ denominazione: 'Studio B' })
      .returning({ id: schema.tenants.id });
    studioB = creati[0]!.id;

    await assicuraAzienda(persistenza.db, studioA, {
      partitaIva: '02413390390',
      codiceFiscale: null,
      denominazione: 'MECCANICA BRESCIANA S.R.L.',
      providerId: '02413390390',
      provincia: 'BS',
      atecoPrimario: '25.62.00',
    });
  }, 60_000);

  afterAll(async () => {
    await persistenza.chiudi();
  });

  it('un segnaposto — la riga che si chiama come la propria partita IVA — non è una trovata', async () => {
    // Lo crea chi dell'azienda conosce solo la partita IVA (invito al questionario, foto):
    // la ricerca lo restituiva come «Trovata nel suo archivio», con la partita IVA al posto
    // del nome. Si passa al fornitore finché un'analisi non porta il nome vero.
    const { assicuraAzienda } = await import('@aegis/db');
    const segnaposto = {
      partitaIva: '03158460174',
      codiceFiscale: null,
      denominazione: '03158460174',
      providerId: '03158460174',
      provincia: null,
      atecoPrimario: null,
    };
    await assicuraAzienda(persistenza.db, studioA, segnaposto);
    expect(await cercaAziendeInArchivio(persistenza.db, studioA, { partitaIva: '03158460174' })).toEqual(
      [],
    );

    await assicuraAzienda(persistenza.db, studioA, {
      ...segnaposto,
      denominazione: 'OFFICINE DI PROVA S.R.L.',
    });
    const trovate = await cercaAziendeInArchivio(persistenza.db, studioA, { partitaIva: '03158460174' });
    expect(trovate.map((t) => t.denominazione)).toEqual(['OFFICINE DI PROVA S.R.L.']);
  });

  it('trova per partita IVA senza toccare il fornitore', async () => {
    const trovate = await cercaAziendeInArchivio(persistenza.db, studioA, {
      partitaIva: '02413390390',
    });

    expect(trovate).toHaveLength(1);
    expect(trovate[0]?.denominazione).toBe('MECCANICA BRESCIANA S.R.L.');
  });

  it('trova per pezzo di denominazione, senza badare alle maiuscole', async () => {
    /*
      Le denominazioni camerali sono tutte in maiuscolo e nessuno le digita così. Cercare
      «meccanica» e non trovare «MECCANICA BRESCIANA S.R.L.» farebbe concludere che
      l'azienda non c'è — e si pagherebbe una ricerca per riscoprirlo.
    */
    const trovate = await cercaAziendeInArchivio(persistenza.db, studioA, {
      denominazione: 'meccanica',
    });

    expect(trovate).toHaveLength(1);
  });

  it('non mostra a uno studio le aziende di un altro', async () => {
    const daB = await cercaAziendeInArchivio(persistenza.db, studioB, {
      partitaIva: '02413390390',
    });

    /*
      La riga è la stessa azienda, e il dato è pubblico: ma l'elenco di chi si segue è
      informazione commerciale. Se lo Studio B vedesse comparire i clienti dello Studio A
      saprebbe chi seguono e chi stanno acquisendo — e il risparmio non vale quel prezzo.
    */
    expect(daB).toHaveLength(0);
  });

  it('senza criteri non restituisce l’intero archivio', async () => {
    // Un criterio vuoto che restituisse tutto trasformerebbe una ricerca in un'esportazione
    // del portafoglio, e da una rotta che non è quella dell'esportazione.
    expect(await cercaAziendeInArchivio(persistenza.db, studioA, {})).toHaveLength(0);
    expect(await cercaAziendeInArchivio(persistenza.db, studioA, { denominazione: '   ' })).toHaveLength(0);
  });

  it('un’azienda mai vista non risulta, e la ricerca a pagamento resta necessaria', async () => {
    const trovate = await cercaAziendeInArchivio(persistenza.db, studioA, {
      partitaIva: '12485671007',
    });

    expect(trovate).toHaveLength(0);
  });
});
