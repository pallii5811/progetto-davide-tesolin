/**
 * I costi si imputano a chi li ha causati.
 *
 * Il registro dei costi è un oggetto solo, condiviso da tutto il servizio, e i suoi eventi
 * non portano scritto chi li ha generati. Finché lavora un intermediario per volta non si
 * nota; con due richieste in volo insieme le spese dell'uno finiscono addebitate all'altro,
 * e il guasto si scopre leggendo un consuntivo sbagliato — cioè troppo tardi.
 *
 * Questi test presidiano la separazione anche nel caso peggiore: due operazioni
 * **intrecciate**, che è ciò che accade davvero quando un'importazione massiva gira mentre
 * qualcun altro analizza un'azienda.
 */

import { describe, expect, it } from 'vitest';
import { MemoryCostLedger } from '@aegis/providers';
import { RegistroPerRichiesta, conCostiDellaRichiesta, costoDegliEventi } from '../src/costi-richiesta.js';

function evento(servizio: string, costoCentesimi: number, cacheHit = false) {
  return {
    provider: 'Prova',
    service: servizio,
    costoStimatoCentesimi: costoCentesimi,
    cacheHit,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    riferimento: null,
  };
}

const attesa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Costi imputati alla richiesta', () => {
  it('raccoglie solo gli eventi dell’operazione in corso', async () => {
    const registro = new RegistroPerRichiesta(new MemoryCostLedger());

    const { eventi } = await conCostiDellaRichiesta(async () => {
      registro.record(evento('analisi', 10));
      registro.record(evento('negativita', 45));
    });

    expect(eventi).toHaveLength(2);
    expect(costoDegliEventi(eventi)).toBe(55);
  });

  it('non mescola due operazioni intrecciate', async () => {
    const registro = new RegistroPerRichiesta(new MemoryCostLedger());

    // Le due operazioni si alternano davvero: la prima cede il controllo a metà, ed è
    // esattamente il momento in cui un registro condiviso attribuirebbe male le spese.
    const primaOperazione = conCostiDellaRichiesta(async () => {
      registro.record(evento('studio-uno', 10));
      await attesa(20);
      registro.record(evento('studio-uno', 10));
    });

    const secondaOperazione = conCostiDellaRichiesta(async () => {
      await attesa(5);
      registro.record(evento('studio-due', 100));
    });

    const [uno, due] = await Promise.all([primaOperazione, secondaOperazione]);

    expect(costoDegliEventi(uno.eventi)).toBe(20);
    expect(costoDegliEventi(due.eventi)).toBe(100);
    expect(uno.eventi.every((e) => e.service === 'studio-uno')).toBe(true);
    expect(due.eventi.every((e) => e.service === 'studio-due')).toBe(true);
  });

  it('continua ad alimentare il registro complessivo del servizio', async () => {
    const globale = new MemoryCostLedger();
    const registro = new RegistroPerRichiesta(globale);

    await conCostiDellaRichiesta(async () => {
      registro.record(evento('analisi', 10));
    });
    registro.record(evento('fuori-richiesta', 5));

    // Le statistiche globali continuano a valere: il contenitore per richiesta si
    // aggiunge, non sostituisce.
    expect(globale.totaleCentesimi()).toBe(15);
  });

  it('non addebita ciò che è stato servito dalla cache', async () => {
    const registro = new RegistroPerRichiesta(new MemoryCostLedger());

    const { eventi } = await conCostiDellaRichiesta(async () => {
      registro.record(evento('analisi', 10));
      registro.record(evento('analisi', 10, true));
    });

    // Il risparmio della cache è reale: addebitarlo farebbe pagare due volte un dato
    // acquistato una volta sola.
    expect(costoDegliEventi(eventi)).toBe(10);
  });

  it('fuori da un’operazione non raccoglie nulla, e non solleva', () => {
    const globale = new MemoryCostLedger();
    const registro = new RegistroPerRichiesta(globale);

    // Un evento generato da un compito di fondo — il monitoraggio periodico — non ha una
    // richiesta a cui appartenere: deve finire nelle statistiche senza far cadere nulla.
    expect(() => registro.record(evento('monitoraggio', 10))).not.toThrow();
    expect(globale.totaleCentesimi()).toBe(10);
  });
});
