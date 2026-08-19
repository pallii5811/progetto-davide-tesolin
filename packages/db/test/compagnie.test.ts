/**
 * Compagnie e solidità.
 *
 * Il rischio di controparte è il punto cieco della consulenza assicurativa: si analizza
 * minuziosamente il rischio del cliente e poi lo si trasferisce a un soggetto la cui
 * solidità nessuno ha guardato. Una polizza è una promessa di pagamento futura, e vale
 * quanto vale chi la sottoscrive.
 *
 * I dati sono condivisi fra tutti gli intermediari, e deve essere così: il solvency ratio
 * è un fatto pubblico, non un'informazione di portafoglio.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicaSchemaTollerante,
  connetti,
  elencoSolidita,
  eliminaCompagnia,
  salvaSolidita,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';

const GENERALE = {
  denominazione: 'COMPAGNIA GENERALE S.P.A.',
  gruppo: 'Gruppo Generale',
  codiceIvass: '1.00001',
  solvencyRatio: 2.6,
  quotaTier1Unrestricted: 0.92,
  fondiPropriCentesimi: 5_000_000_000_00,
  scrCentesimi: 1_900_000_000_00,
  premiLordiCentesimi: 3_000_000_000_00,
  reclamiAnno: 1200,
  ratingAgenzia: 'S&P',
  ratingValore: 'A',
  fonte: 'SFCR 2025',
};

describe('Anagrafe delle compagnie', () => {
  let connessione: Connessione;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  it('salva i dati di solidità e li rilegge', async () => {
    await salvaSolidita(connessione.db, { ...GENERALE, anno: 2025 });

    const elenco = await elencoSolidita(connessione.db);
    const trovata = elenco.find((c) => c.denominazione === GENERALE.denominazione);

    expect(trovata?.solvencyRatio).toBe(2.6);
    expect(trovata?.quotaTier1Unrestricted).toBe(0.92);
    // `numeric` e `bigint` tornano come stringhe dal driver: se non li si converte, il
    // motore riceve testo e il punteggio diventa `NaN` senza che nessuno sollevi.
    expect(typeof trovata?.solvencyRatio).toBe('number');
    expect(typeof trovata?.fondiPropriCentesimi).toBe('number');
  });

  it('aggiorna l’esercizio già presente invece di duplicarlo', async () => {
    await salvaSolidita(connessione.db, { ...GENERALE, anno: 2025, solvencyRatio: 2.9 });

    const elenco = await elencoSolidita(connessione.db);
    const righe = elenco.filter((c) => c.denominazione === GENERALE.denominazione);

    // Una compagnia, un esercizio: il ridepositare la SFCR corregge il dato, non ne
    // aggiunge una seconda versione che nessuno saprebbe quale scegliere.
    expect(righe).toHaveLength(1);
    expect(righe[0]?.solvencyRatio).toBe(2.9);
  });

  it('con più esercizi restituisce il più recente', async () => {
    await salvaSolidita(connessione.db, { ...GENERALE, anno: 2024, solvencyRatio: 2.1 });

    const elenco = await elencoSolidita(connessione.db);
    const trovata = elenco.find((c) => c.denominazione === GENERALE.denominazione);

    // Il 2024 esiste in archivio e serve allo storico, ma ciò che conta per una proposta
    // di oggi è l'ultimo dato pubblicato.
    expect(trovata?.anno).toBe(2025);
    expect(trovata?.solvencyRatio).toBe(2.9);
  });

  it('non crea una seconda compagnia con la stessa denominazione', async () => {
    await salvaSolidita(connessione.db, {
      ...GENERALE,
      anno: 2023,
      fonte: 'SFCR 2023',
    });

    const elenco = await elencoSolidita(connessione.db);
    expect(elenco.filter((c) => c.denominazione === GENERALE.denominazione)).toHaveLength(1);
  });

  it('eliminando la compagnia spariscono anche i suoi esercizi', async () => {
    const id = await salvaSolidita(connessione.db, {
      ...GENERALE,
      denominazione: 'COMPAGNIA DA RIMUOVERE S.P.A.',
      anno: 2025,
    });

    await eliminaCompagnia(connessione.db, id);

    const elenco = await elencoSolidita(connessione.db);
    expect(elenco.some((c) => c.denominazione === 'COMPAGNIA DA RIMUOVERE S.P.A.')).toBe(false);
  });
});
