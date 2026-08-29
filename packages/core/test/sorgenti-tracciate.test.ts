/**
 * Nessun file sorgente può restare fuori dal repository.
 *
 * È successo, e per mesi: la regola `coverage/` nel `.gitignore` — quella che ogni
 * progetto JavaScript ha, per escludere i rapporti di copertura dei test — non era
 * ancorata alla radice, e valeva a ogni profondità. Ha inghiottito
 * `packages/core/src/coverage/`: tassonomia delle garanzie, gap analysis, somme
 * assicurande, CAT NAT, sottoassicurazione. Ottomila righe, cinquantuno esportazioni,
 * importate da sette file. Il cuore assicurativo del prodotto.
 *
 * Nessun segnale lo diceva. `git status` mostra i file **non tracciati**, non quelli
 * **ignorati**: il progetto appariva pulito a ogni sguardo. Il difetto è emerso solo
 * provando a compilare su un'altra macchina, dove il codice arrivava da git e quella
 * cartella non c'era.
 *
 * Le conseguenze erano due, e la seconda è peggiore della prima: nessun clone del
 * repository poteva compilare, e quel codice esisteva su **un solo disco**. Un guasto
 * hardware e sarebbe sparito.
 *
 * Questo collaudo chiede a git stesso quali file sotto una cartella `src/` risultino
 * ignorati. Se una regola nuova ne inghiotte altri, qui diventa rosso — prima che
 * qualcuno lo scopra rifacendo il lavoro.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));

describe('Il repository contiene tutto il codice', () => {
  it('nessun file sotto una cartella src/ è escluso dal versionamento', () => {
    /*
      `--others --ignored --exclude-standard` elenca i file presenti sul disco che git
      ignora deliberatamente. È l'unico modo di vederli: non compaiono in `git status`,
      ed è esattamente ciò che ha reso il guasto invisibile.
    */
    const uscita = execFileSync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'packages', 'apps'],
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );

    const ignorati = uscita
      .split(/\r?\n/)
      .filter((r) => r !== '')
      // Ciò che è giusto ignorare: dipendenze, prodotti della compilazione, cache.
      .filter((r) => !r.includes('node_modules/'))
      .filter((r) => !/(^|\/)dist\//.test(r))
      .filter((r) => !/(^|\/)\.next\//.test(r))
      .filter((r) => !/\.tsbuildinfo$/.test(r))
      .filter((r) => !/\.log$/.test(r))
      // Solo il codice sorgente: un file dentro `src/` non è mai un artefatto.
      .filter((r) => /(^|\/)src\//.test(r));

    expect(
      ignorati,
      'questi file sorgente esistono sul disco ma git li ignora, quindi non sono in ' +
        'nessun commit e non arriverebbero su un altro computer:\n  ' +
        ignorati.join('\n  ') +
        '\n\nControllare con  git check-ignore -v <file>  quale regola li esclude, e ' +
        'ancorarla (una barra iniziale la limita alla radice).',
    ).toEqual([]);
  });

  it('il dominio delle coperture è versionato', () => {
    /*
      Verifica nominale del caso concreto: se qualcuno «semplificasse» la regola del
      `.gitignore` tornando a `coverage/`, il collaudo sopra lo prenderebbe comunque — ma
      questo dice subito quale cartella guardare.
    */
    const tracciati = execFileSync('git', ['ls-files', '--', 'packages/core/src/coverage'], {
      cwd: RADICE,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter((r) => r !== '');

    expect(
      tracciati.length,
      'packages/core/src/coverage/ contiene il dominio assicurativo (tassonomia, gap, ' +
        'somme assicurande, CAT NAT) e deve essere versionato per intero',
    ).toBeGreaterThanOrEqual(8);
  });
});
