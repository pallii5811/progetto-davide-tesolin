/**
 * Le frasi del Property Risk su ogni comune d'Italia, lette dai rilevatori di testo del collaudo.
 *
 *   npx tsx scripts/rilievi-testo-property.ts
 *
 * Il collaudo su browser legge le frasi delle tre aziende dimostrative. Ma il dettaglio dei
 * pericoli naturali si compone dai numeri del comune — quote ISPRA, zona sismica, punteggi — e
 * una ripetizione o un doppio due-punti può comparire solo con certi numeri: il 14/09/2026 il
 * collaudo ha trovato «imprese in pericolosità elevata» detto due volte nella stessa riga, e
 * «zona 4 → 1 · zona 3 → 3» nella scala. Qui si compongono le frasi per ognuno dei comuni degli
 * archivi, nei quattro casi — tutto disponibile, senza ISPRA, senza zona, senza nessuno dei due —
 * e le si passa agli stessi rilevatori, importati e non copiati.
 *
 * Non spende niente e non tocca la rete. Esce con codice 1 se trova qualcosa.
 */

import { sismicaComunale } from '../packages/core/src/risk/data/sismica-comunale.js';
import { idrogeoComunale } from '../packages/core/src/risk/data/idrogeo-comunale.js';
import { calcolaPropertyRisk } from '../packages/core/src/protezioni/property-risk.js';
import type { UbicazionePerProperty } from '../packages/core/src/protezioni/property-risk.js';
import type { IndicatoriIdrogeo } from '../packages/core/src/risk/idrogeo.js';
import { rilieviSulTesto } from './lib/rilevatori-testo.js';

const zone = sismicaComunale.zone as Readonly<Record<string, 1 | 2 | 3 | 4>>;
const indicatori = idrogeoComunale.livelli as Readonly<Record<string, IndicatoriIdrogeo>>;
const chiavi = [...new Set([...Object.keys(zone), ...Object.keys(indicatori)])].sort();

/** Righe come le rende il browser: ogni testo del calcolo è un blocco a sé. */
function testiDelCalcolo(p: ReturnType<typeof calcolaPropertyRisk>): string[] {
  return [
    p.formula,
    p.formulaPericoliNaturali,
    p.scalaPericoliNaturali,
    ...(p.motivoNonCalcolabile === null ? [] : [p.motivoNonCalcolabile]),
    ...p.note,
    ...p.ubicazioni.flatMap((u) => u.voci.flatMap((v) => [v.voce, v.dettaglio])),
  ];
}

const rilievi = new Map<string, { volte: number; esempio: string }>();
let frasi = 0;

for (const chiave of chiavi) {
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
    for (const divisione of ['25', '52', null]) {
      for (const testo of testiDelCalcolo(calcolaPropertyRisk(divisione, [u]))) {
        frasi += 1;
        for (const r of rilieviSulTesto(testo)) {
          const voce = rilievi.get(r) ?? { volte: 0, esempio: testo };
          voce.volte += 1;
          rilievi.set(r, voce);
        }
      }
    }
  }
}

console.log(`comuni: ${chiavi.length} · frasi lette: ${frasi.toLocaleString('it-IT')}`);
if (rilievi.size === 0) {
  console.log('nessun rilievo');
} else {
  for (const [r, { volte, esempio }] of [...rilievi].sort((a, b) => b[1].volte - a[1].volte)) {
    console.log(`${volte}× ${r}\n    ${esempio.slice(0, 220)}`);
  }
  process.exitCode = 1;
}
