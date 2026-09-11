import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nessuna sostituzione di comando dentro un heredoc non quotato.
 *
 * ── PERCHÉ ────────────────────────────────────────────────────────────────────
 *
 * Un heredoc il cui delimitatore non è quotato espande le variabili — ed è quasi sempre il
 * motivo per cui lo si scrive così. Insieme alle variabili, però, espande anche la
 * **sostituzione di comando**: qualunque cosa stia fra apici inversi, o dentro un
 * `$(...)`, viene ESEGUITA, e il suo risultato prende il posto del testo.
 *
 * Il 12/09/2026, installando il prodotto su una macchina nuova dopo che il fornitore di
 * prima aveva spento la vecchia, `deploy/02-database.sh` generava il file dei segreti con
 * un heredoc non quotato — necessario, perché la password del database deve espandersi.
 * Dentro, un COMMENTO citava un comando fra apici inversi. Bash lo ha eseguito: il comando
 * è fallito con «.env: No such file or directory» — un errore che in mezzo a
 * un'installazione sembra un guasto grave — e nel file generato è finita la frase
 *
 *     «leggono con  prima di applicare le migrazioni»
 *
 * con un buco al posto di ciò che spiegava. Chi avesse aperto quel file avrebbe letto
 * un'istruzione monca su come si compila la configurazione di produzione.
 *
 * Quella volta non è successo niente, perché il comando citato non faceva nulla. Ma è stata
 * fortuna: quello script gira **come root** e genera i segreti della macchina.
 *
 * È la stessa forma di un difetto che questo lavoro ha già pagato altrove — un carattere
 * che dentro un testo sembra decorazione e per l'interprete è sintassi — e la stessa forma
 * del collaudo che gli sta accanto: un comando che nessuno pensa a lanciare, lanciato da
 * solo a ogni esecuzione. Vedi `niente-caratteri-di-controllo.test.ts`.
 *
 * ── COSA SI AMMETTE ──────────────────────────────────────────────────────────
 *
 * Le variabili — `$NOME`, `${NOME}` — sono il motivo per cui il delimitatore non è quotato,
 * e restano. Si vieta soltanto ciò che ESEGUE: apici inversi e `$(`.
 *
 * Se un heredoc deve davvero contenere l'uno o l'altro, la risposta non è un'eccezione qui:
 * è quotare il delimitatore (`<<'FINE'`) quando non servono espansioni, o scrivere il testo
 * senza quei caratteri quando si tratta di un commento — che è il caso di gran lunga più
 * frequente, perché nessuno cita codice per farlo eseguire.
 *
 * ── LIMITE DICHIARATO ────────────────────────────────────────────────────────
 *
 * Il riconoscimento è per riga, non è un parser di shell: un `<<` che compare dentro una
 * stringa, o un heredoc aperto e chiuso sulla stessa riga, possono confonderlo. Sbaglia
 * dichiarando un heredoc dove non c'è — cioè in eccesso, mai in difetto — e questo è il
 * verso giusto in cui sbagliare per un controllo che protegge.
 */

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const SALTA = new Set(['node_modules', '.git', 'dist', '.next', 'test-results', '.sonda', 'coverage']);

function copioni(cartella: string, raccolti: string[] = []): string[] {
  for (const voce of readdirSync(cartella)) {
    if (SALTA.has(voce)) continue;
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) copioni(percorso, raccolti);
    else if (voce.endsWith('.sh')) raccolti.push(percorso);
  }
  return raccolti;
}

interface Rilievo {
  readonly file: string;
  readonly riga: number;
  readonly delimitatore: string;
  readonly testo: string;
}

/**
 * Gli heredoc con delimitatore NON quotato, e cosa contengono.
 *
 * `<<FINE` espande; `<<'FINE'`, `<<"FINE"` e `<<\FINE` no — e sono già al sicuro.
 */
function sostituzioniNeiHeredoc(percorso: string): Rilievo[] {
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  const rilievi: Rilievo[] = [];
  let dentro: { delimitatore: string } | null = null;

  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i] ?? '';

    if (dentro !== null) {
      if (riga.trim() === dentro.delimitatore) {
        dentro = null;
        continue;
      }
      // Un dollaro o un apice inverso PRECEDUTO da barra rovesciata è già disinnescato:
      // chi lo ha scritto sapeva cosa stava facendo, ed è la via d'uscita documentata.
      const esegue = /(^|[^\\])`/.test(riga) || /(^|[^\\])\$\(/.test(riga);
      if (esegue) {
        rilievi.push({
          file: relative(RADICE, percorso).replace(/\\/g, '/'),
          riga: i + 1,
          delimitatore: dentro.delimitatore,
          testo: riga.trim(),
        });
      }
      continue;
    }

    /*
      I confini attorno ai due minori non sono pignoleria: `<<<` è una here-STRING, non un
      heredoc, e contiene due minori consecutivi. Senza il confine il riconoscimento
      partiva dal SECONDO, leggeva la parola che seguiva come delimitatore, e da lì in poi
      considerava heredoc tutto il resto del file: dieci rilievi in `deploy/rassegna.sh`,
      dove `<<<` è la freccia che indica un guasto in una riga stampata a schermo.
    */
    const apertura = /(^|[^<])<<-?(?!<)\s*(\\?)(['"]?)([A-Za-z_][A-Za-z0-9_]*)\3/.exec(riga);
    if (apertura !== null) {
      const barra = apertura[2] ?? '';
      const virgolette = apertura[3] ?? '';
      const nome = apertura[4] ?? '';
      // Quotato in qualunque forma: non espande niente, non c'è pericolo.
      if (virgolette === '' && barra === '') dentro = { delimitatore: nome };
    }
  }

  return rilievi;
}

describe('Nessuna sostituzione di comando dentro un heredoc non quotato', () => {
  const files = copioni(RADICE);

  it('trova qualcosa da guardare: se non ci fossero copioni, il verde sarebbe vuoto', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('nessuno script di installazione esegue ciò che credeva di citare', () => {
    const rilievi = files.flatMap(sostituzioniNeiHeredoc);
    const racconto = rilievi
      .map((r) => `  ${r.file}:${r.riga} (heredoc ${r.delimitatore})\n    ${r.testo}`)
      .join('\n');

    expect(
      rilievi,
      rilievi.length === 0
        ? ''
        : `\n\nQuesto testo verrebbe ESEGUITO invece che scritto:\n${racconto}\n\n` +
            'Rimedio: quotare il delimitatore, oppure scrivere il testo senza apici inversi.\n',
    ).toEqual([]);
  });
});
