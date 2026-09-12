/**
 * Genera la tabella di esposizione per divisione ATECO dal CSV di riferimento.
 *
 *   npx tsx scripts/genera-esposizione-settoriale.ts
 *
 * Legge `packages/core/src/risk/data/esposizione-settoriale.csv` e scrive il modulo
 * TypeScript che il motore importa. Il CSV sta in git, versionato e leggibile in un diff:
 * se domani i punteggi cambiano si vede quale riga si è mossa, il che con un foglio di
 * calcolo binario non succede.
 *
 * ── DA DOVE VIENE IL DATO, E COSA NON È ──────────────────────────────────────
 *
 * Dal modello di rischio di un intermediario assicurativo, ricevuto il 12/09/2026. Copre
 * tutte e 87 le divisioni ATECO 2025 con un punteggio da 1 a 7 per il rischio incendio e
 * quattro punteggi per il rischio cyber.
 *
 * **Non sono misure di sinistrosità.** Il foglio d'origine cita `istat.it` come fonte di
 * ogni riga, ma ISTAT pubblica la CLASSIFICAZIONE delle attività, non la loro pericolosità:
 * i punteggi sono giudizio esperto. È legittimo e si usa in assunzione tutti i giorni, ma
 * va detto — un'etichetta che promette una misura dove c'è un giudizio è il modo più rapido
 * di far credere a un numero più di quanto valga.
 *
 * L'unica riga dichiaratamente calibrata su dati esterni è l'attrattività per l'attaccante,
 * che il foglio dice tarata sulle rilevazioni settoriali ENISA.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RADICE = process.cwd();
const SORGENTE = join(RADICE, 'packages', 'core', 'src', 'risk', 'data', 'esposizione-settoriale.csv');
const USCITA = join(RADICE, 'packages', 'core', 'src', 'risk', 'data', 'esposizione-settoriale.ts');

interface Riga {
  readonly divisione: string;
  readonly denominazione: string;
  readonly incendio: number;
  readonly dipendenzaDigitale: number;
  readonly sensibilitaDati: number;
  readonly esposizioneTransazioni: number;
  readonly attrattivitaAttacco: number;
}

function numero(valore: string | undefined, dove: string): number {
  const n = Number((valore ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 1 || n > 7) {
    throw new Error(`${dove}: «${valore ?? ''}» non è un punteggio da 1 a 7`);
  }
  return n;
}

const righe: Riga[] = readFileSync(SORGENTE, 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter((r) => r.trim() !== '')
  .map((riga, i) => {
    const campi = riga.split(';');
    const divisione = (campi[0] ?? '').trim();
    // La divisione è un IDENTIFICATORE, non un numero: «01» e «1» non sono la stessa cosa,
    // e convertirla perderebbe lo zero iniziale su otto divisioni su ottantasette.
    if (!/^[0-9]{2}$/.test(divisione))
      throw new Error(`riga ${i + 2}: divisione «${divisione}» non a due cifre`);
    return {
      divisione,
      denominazione: (campi[1] ?? '').trim(),
      incendio: numero(campi[2], `riga ${i + 2} incendio`),
      dipendenzaDigitale: numero(campi[3], `riga ${i + 2} dipendenza`),
      sensibilitaDati: numero(campi[4], `riga ${i + 2} sensibilità`),
      esposizioneTransazioni: numero(campi[5], `riga ${i + 2} transazioni`),
      attrattivitaAttacco: numero(campi[6], `riga ${i + 2} attrattività`),
    };
  });

const chiavi = new Set(righe.map((r) => r.divisione));
if (chiavi.size !== righe.length) throw new Error('divisioni ripetute nel CSV');

const corpo = righe
  .map(
    (r) =>
      `  '${r.divisione}': { incendio: ${r.incendio}, dipendenzaDigitale: ${r.dipendenzaDigitale}, ` +
      `sensibilitaDati: ${r.sensibilitaDati}, esposizioneTransazioni: ${r.esposizioneTransazioni}, ` +
      `attrattivitaAttacco: ${r.attrattivitaAttacco} }, // ${r.denominazione.replace(/\s+/g, ' ')}`,
  )
  .join('\n');

const contenuto = `/**
 * Generato da scripts/genera-esposizione-settoriale.ts — non editare a mano.
 * Sorgente: packages/core/src/risk/data/esposizione-settoriale.csv (${righe.length} divisioni ATECO 2025)
 *
 * Punteggi di GIUDIZIO ESPERTO da 1 a 7, non misure di sinistrosità. Vedi l'intestazione
 * dello script generatore per la provenienza e per ciò che questi numeri non sono.
 */

export interface EsposizioneSettoriale {
  /** Pericolosità intrinseca di incendio ed esplosione dell'attività svolta. */
  readonly incendio: number;
  /** Quanto l'attività dipende da sistemi informatici per continuare a operare. */
  readonly dipendenzaDigitale: number;
  /** Quanto sono sensibili le informazioni che quell'attività tratta di norma. */
  readonly sensibilitaDati: number;
  /** Quanto l'attività è esposta a pagamenti, ordini e trasferimenti digitali. */
  readonly esposizioneTransazioni: number;
  /** Quanto il settore è un bersaglio interessante o remunerativo per un attaccante. */
  readonly attrattivitaAttacco: number;
}

export const ESPOSIZIONE_SETTORIALE: Readonly<Record<string, EsposizioneSettoriale>> = {
${corpo}
};
`;

writeFileSync(USCITA, contenuto, 'utf8');
process.stdout.write(`  ${righe.length} divisioni scritte in ${USCITA}\n`);
