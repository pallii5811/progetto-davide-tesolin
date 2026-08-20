/**
 * Lo storico degli eventi atmosferici.
 *
 * Serve a togliere una discussione dal terreno delle impressioni: «qui non è mai successo
 * niente» è spesso vero solo perché nessuno ha guardato. Le prove qui sotto riguardano le
 * tre cose che rendono questo dato utilizzabile in una perizia invece che in una
 * chiacchiera.
 *
 *  1. **Si contano gli eventi, non le medie.** Il danno lo fa il giorno singolo, non la
 *     precipitazione annua.
 *  2. **Un giorno senza misura non è un giorno a zero.** Trasformare una lacuna
 *     dell'archivio in un'assenza di eventi è il modo più diretto di dire una falsità.
 *  3. **I fenomeni non coperti si dichiarano.** Grandine e fulmini non ci sono, e la
 *     grandine è quella che produce più sinistri sui capannoni.
 */

import { describe, expect, it, vi } from 'vitest';
import { leggiStoricoMeteo } from '../src/territorio/meteo.js';

const OGGI = new Date('2026-08-20T00:00:00Z');

function fetchFinto(risposta: unknown, stato = 200): typeof fetch {
  return vi.fn(async () =>
    Promise.resolve(
      new Response(JSON.stringify(risposta), {
        status: stato,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

/** Una serie con due giorni di pioggia forte in due anni distinti, e una raffica sopra soglia. */
const SERIE = {
  daily: {
    time: ['2020-09-01', '2020-09-02', '2021-10-15', '2022-03-04', '2023-07-19'],
    precipitation_sum: [72.4, 3.1, 118.9, null, 12.0],
    wind_gusts_10m_max: [40, 38, 61, 82.5, 44],
  },
};

describe('Storico degli eventi atmosferici', () => {
  it('conta i giorni oltre soglia e in quanti anni distinti sono capitati', async () => {
    const storico = await leggiStoricoMeteo(45.5, 9.2, { fetchImpl: fetchFinto(SERIE), oggi: OGGI });

    const oltre50 = storico?.soglie.find((s) => s.descrizione.includes('50 mm'));
    expect(oltre50?.giorni).toBe(2);
    /*
      Due giorni ma **due anni diversi**: è la distinzione che conta per chi assicura. Due
      giorni consecutivi sono un evento; due giorni in due anni sono una frequenza.
    */
    expect(oltre50?.anniConEvento).toBe(2);
    expect(oltre50?.massimo).toContain('118.9');

    const oltre100 = storico?.soglie.find((s) => s.descrizione.includes('100 mm'));
    expect(oltre100?.giorni).toBe(1);
  });

  it('un giorno senza misura non conta come giorno senza evento', async () => {
    const conLacuna = {
      daily: {
        time: ['2020-01-01', '2020-01-02'],
        precipitation_sum: [null, null],
        wind_gusts_10m_max: [null, null],
      },
    };

    const storico = await leggiStoricoMeteo(45.5, 9.2, {
      fetchImpl: fetchFinto(conLacuna),
      oggi: OGGI,
    });

    // Nessun evento contato, e nessun massimo inventato: la serie non dice nulla, e va
    // riportata per quello che è.
    expect(storico?.soglie.every((s) => s.giorni === 0)).toBe(true);
    expect(storico?.soglie[0]?.massimo).toContain('0');
  });

  it('dichiara sempre i fenomeni che non copre', async () => {
    const storico = await leggiStoricoMeteo(45.5, 9.2, { fetchImpl: fetchFinto(SERIE), oggi: OGGI });

    /*
      Un capitolo intitolato «eventi atmosferici» che tace di non contenere grandine e
      fulmini fa concludere a chi legge che su quel punto non ne siano mai caduti — cioè
      l'opposto di ciò che i dati dicono, che è nulla.
    */
    const nonCoperti = storico?.fenomeniNonCoperti.join(' ') ?? '';
    expect(nonCoperti).toContain('grandine');
    expect(nonCoperti).toContain('fulmin');
  });

  it('chiede una finestra di dieci anni e si ferma prima di oggi', async () => {
    const chiamata = fetchFinto(SERIE);
    await leggiStoricoMeteo(45.5, 9.2, { fetchImpl: chiamata, oggi: OGGI });

    const url = String((chiamata as unknown as { mock: { calls: [string][] } }).mock.calls[0]?.[0] ?? '');

    /*
      L'archivio di rianalisi è pubblicato con qualche giorno di ritardo: chiedere fino a
      ieri restituirebbe una coda di valori nulli, che verrebbe letta come una serie di
      giorni sereni.
    */
    expect(url).toContain('start_date=2016-');
    expect(url).toContain('end_date=2026-08-15');
  });

  it('una fonte che non risponde non fa cadere nulla', async () => {
    for (const impl of [
      fetchFinto({}, 500),
      fetchFinto({ daily: {} }),
      vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))) as unknown as typeof fetch,
    ]) {
      const storico = await leggiStoricoMeteo(45.5, 9.2, { fetchImpl: impl, oggi: OGGI });
      expect(storico).toBeNull();
    }
  });
});
