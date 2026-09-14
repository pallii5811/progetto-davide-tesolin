import { describe, expect, it } from 'vitest';
import { rilieviSulTesto } from '../../../scripts/lib/rilevatori-testo.js';
import { sismicaComunale } from '../src/risk/data/sismica-comunale.js';
import { idrogeoComunale } from '../src/risk/data/idrogeo-comunale.js';
import { calcolaPropertyRisk } from '../src/protezioni/property-risk.js';
import type { UbicazionePerProperty } from '../src/protezioni/property-risk.js';
import type { IndicatoriIdrogeo } from '../src/risk/idrogeo.js';

/**
 * Le frasi del Property Risk passano i rilevatori di testo del collaudo.
 *
 * Il dettaglio dei pericoli naturali si compone dai numeri del comune, e un difetto di testo
 * può comparire solo con certi numeri. Il 14/09/2026 il collaudo su browser ha fermato la prima
 * versione: «imprese in pericolosità elevata» detto due volte sulla stessa riga, e «zona 4 → 1 ·
 * zona 3 → 3» nella scala. Il collaudo però legge solo le tre aziende dimostrative.
 *
 * `scripts/rilievi-testo-property.ts` compone le frasi su tutti i comuni degli archivi (trenta
 * secondi); qui un campione scelto per mettere alla prova i numeri — le quote ISPRA più alte e
 * più basse, una zona sismica per tipo, un comune ogni 97 — con gli stessi rilevatori, importati
 * e non copiati.
 */
const zone = sismicaComunale.zone as Readonly<Record<string, 1 | 2 | 3 | 4>>;
const indicatori = idrogeoComunale.livelli as Readonly<Record<string, IndicatoriIdrogeo>>;
const chiavi = Object.keys(indicatori).sort();

function estremi(campo: keyof IndicatoriIdrogeo): string[] {
  // Una quota non pubblicata va in fondo: il campione vuole gli estremi dei dati che ci sono.
  const ordinate = [...chiavi].sort(
    (a, b) => (indicatori[b]![campo] ?? -1) - (indicatori[a]![campo] ?? -1),
  );
  return [...ordinate.slice(0, 5), ...ordinate.slice(-5)];
}

const unoPerZona = ([1, 2, 3, 4] as const).map((z) => Object.keys(zone).find((k) => zone[k] === z)!);

const CAMPIONE = [
  ...new Set([
    ...estremi('impIdrA'),
    ...estremi('impIdrM'),
    ...estremi('impFrnA'),
    ...unoPerZona,
    ...chiavi.filter((_, indice) => indice % 97 === 0),
  ]),
];

describe('Le frasi del Property passano i rilevatori di testo', () => {
  it('nessun rilievo sul campione, con tutti i pericoli, senza ISPRA, senza zona e senza ATECO', () => {
    expect(CAMPIONE.length).toBeGreaterThan(80);

    const rilievi: string[] = [];
    for (const chiave of CAMPIONE) {
      const base: UbicazionePerProperty = {
        id: chiave,
        etichetta: `Sede legale — VIA PROVA 1, ${chiave}`,
        tipo: 'sede-legale',
        zonaSismica: zone[chiave] ?? null,
        indicatoriIdrogeo: indicatori[chiave] ?? null,
      };
      const varianti: UbicazionePerProperty[] = [
        base,
        { ...base, indicatoriIdrogeo: null },
        { ...base, zonaSismica: null },
        { ...base, indicatoriIdrogeo: null, zonaSismica: null },
      ];
      for (const u of varianti) {
        for (const divisione of ['25', null]) {
          const p = calcolaPropertyRisk(divisione, [u]);
          const testi = [
            p.scalaPericoliNaturali,
            ...p.note,
            ...(p.motivoNonCalcolabile === null ? [] : [p.motivoNonCalcolabile]),
            ...p.ubicazioni.flatMap((ubicazione) => ubicazione.voci.map((v) => v.dettaglio)),
          ];
          for (const testo of testi) {
            for (const r of rilieviSulTesto(testo))
              rilievi.push(`${chiave}: ${r} — ${testo.slice(0, 120)}`);
          }
        }
      }
    }

    expect(rilievi).toEqual([]);
  });
});
