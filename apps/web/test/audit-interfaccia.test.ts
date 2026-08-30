/**
 * I difetti dell'interfaccia trovati dall'audit di consegna, uno per uno.
 *
 * Ogni blocco qui sotto nomina il numero del reperto e prova la cosa che l'audit ha
 * misurato — non una parafrasi comoda. Dove il difetto è nel **CSS emesso** si compila il
 * foglio vero col motore vero, perché il sorgente sembrava giusto e non lo era; dove è in
 * una **frase** si prova la funzione che la compone; dove è una **regola di disciplina**
 * che nessuna funzione può portare da sola — un colore tolto in trentaquattro punti, un
 * comando da sviluppatore mostrato al broker — si legge il sorgente, che è l'unico posto
 * in cui quella regola esiste.
 *
 * I moduli nuovi si importano con `await import` dentro il singolo controllo: se non
 * esistono ancora, fallisce **quel** controllo e non la raccolta dell'intero file. Serve
 * a vedere il rosso di ciascuno separatamente, che è l'unico rosso che informa.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const SORGENTI = resolve(RADICE, 'apps/web/src');
const CSS = resolve(SORGENTI, 'app/globals.css');

function leggi(relativo: string): string {
  return readFileSync(resolve(SORGENTI, relativo), 'utf8');
}

function fileSorgente(cartella: string = SORGENTI): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) return fileSorgente(percorso);
    return ['.ts', '.tsx'].includes(extname(nome)) ? [percorso] : [];
  });
}

/** Il percorso come si legge in un messaggio d'errore: separatori uniformi. */
function relativo(percorso: string): string {
  return percorso.slice(SORGENTI.length + 1).replace(/\\/g, '/');
}

/**
 * Il codice senza i commenti.
 *
 * Serve dove il controllo riguarda **ciò che il prodotto fa o mostra**, non ciò che il
 * file racconta: la spiegazione di una correzione nomina per forza la cosa corretta —
 * «qui c'era la porta 3001», «"attenzione" non è la gravità "rilevante"» — e un controllo
 * che leggesse anche quelle righe diventerebbe rosso proprio per la spiegazione. Non è un
 * addolcimento: un commento non arriva a nessuno schermo.
 *
 * Le stringhe restano, e devono restare: quasi tutto ciò che si cerca qui è una stringa.
 */
function senzaCommenti(sorgente: string): string {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// 25 · Il tema chiaro non viene mai prodotto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tailwind v4 **appiattisce** `@theme` fuori da `@media`: un blocco del tema annidato in
 * una media query non produce la media query, produce le sue variabili in `:root`. Con la
 * tavolozza chiara scritta per prima e quella scura annidata, ciò che esce è la scura,
 * sempre, e le trentadue righe chiare sono codice morto.
 *
 * Leggere il sorgente non basta: il sorgente sembra giusto. Si compila.
 */
async function compilaCss(): Promise<string> {
  const risultato = await postcss([tailwind()]).process(readFileSync(CSS, 'utf8'), { from: CSS });
  return risultato.css;
}

/**
 * Il valore di una variabile nel blocco di primo livello e in quello del tema scuro.
 *
 * Si cammina l'albero invece di cercare con un'espressione regolare: `@media print`
 * ridefinisce le stesse variabili e una ricerca testuale le confonderebbe con le altre.
 */
async function tavolozze(): Promise<{
  chiara: Map<string, string>;
  scura: Map<string, string>;
}> {
  const albero = postcss.parse(await compilaCss());
  const chiara = new Map<string, string>();
  const scura = new Map<string, string>();

  albero.walkDecls((decl) => {
    if (!decl.prop.startsWith('--color-')) return;
    let dentroScuro = false;
    let dentroAltraMedia = false;
    // Si risale la catena dei contenitori a mano: `parent` cambia tipo a ogni livello, e
    // ciò che interessa è una sola cosa — dentro quale media query si trova la riga.
    let nodo: unknown = decl.parent;
    for (let passi = 0; nodo !== undefined && nodo !== null && passi < 10; passi += 1) {
      const contenitore = nodo as { type?: string; name?: string; params?: string; parent?: unknown };
      if (contenitore.type === 'atrule' && contenitore.name === 'media') {
        if (/prefers-color-scheme:\s*dark/.test(contenitore.params ?? '')) dentroScuro = true;
        else dentroAltraMedia = true;
      }
      nodo = contenitore.parent;
    }
    if (dentroAltraMedia) return;
    (dentroScuro ? scura : chiara).set(decl.prop, decl.value.trim());
  });

  return { chiara, scura };
}

describe('25 · il tema chiaro esiste nel CSS emesso', () => {
  it('il CSS compilato contiene la media query del tema scuro', async () => {
    const css = await compilaCss();
    const occorrenze = (css.match(/prefers-color-scheme/g) ?? []).length;
    expect(
      occorrenze,
      'zero occorrenze di prefers-color-scheme nel CSS emesso: la tavolozza chiara non ' +
        'viene mai prodotta e il ramo «chiaro» del collaudo misura gli stessi pixel di quello scuro',
    ).toBeGreaterThan(0);
  });

  it('le due tavolozze sono distinte e quella di primo livello è la chiara', async () => {
    const { chiara, scura } = await tavolozze();

    // Il fondo chiaro è quasi bianco (L alta), quello scuro quasi nero (L bassa): è la
    // distinzione che si può misurare senza fidarsi di come sono scritte le righe.
    const fondoChiaro = chiara.get('--color-fondo');
    const fondoScuro = scura.get('--color-fondo');

    expect(fondoChiaro, 'nessun --color-fondo al primo livello').toBeDefined();
    expect(fondoScuro, 'nessun --color-fondo nel blocco prefers-color-scheme: dark').toBeDefined();

    expect(
      luminosita(fondoChiaro ?? ''),
      `il fondo di primo livello è ${fondoChiaro}: è la tavolozza scura, non la chiara`,
    ).toBeGreaterThan(0.8);
    expect(luminosita(fondoScuro ?? ''), `il fondo scuro è ${fondoScuro}`).toBeLessThan(0.4);
  });

  it('ogni variabile del tema scuro ha una gemella chiara, e nessuna coincide', async () => {
    const { chiara, scura } = await tavolozze();

    /*
      Prima di confrontare le due tavolozze si controlla che ce ne siano due.

      Senza queste due righe il controllo era verde sul codice difettoso, e lo era per la
      ragione peggiore: con lo at-theme annidato dentro la media query la tavolozza scura
      usciva VUOTA, quindi «nessuna orfana» e «nessuna coincidente» erano vere di un
      insieme vuoto. Provato: sul sorgente di prima della correzione questo controllo
      passava mentre gli altri due dello stesso blocco fallivano. Un verdetto verde per
      assenza di informazione e' esattamente cio' che la regola 2h vieta.
    */
    expect(scura.size, 'la tavolozza scura e vuota: non c e nulla da confrontare').toBeGreaterThan(20);
    expect(
      chiara.size,
      'la tavolozza chiara ha meno voci della scura: qualche colore vive in un tema solo',
    ).toBeGreaterThanOrEqual(scura.size);

    const orfane = [...scura.keys()].filter((nome) => !chiara.has(nome));
    expect(orfane, `variabili scure senza gemella chiara: ${orfane.join(', ')}`).toEqual([]);

    const identiche = [...scura.entries()].filter(([nome, valore]) => chiara.get(nome) === valore);
    expect(
      identiche.map(([n]) => n),
      'variabili con lo stesso valore nei due temi: una delle due tavolozze non esiste davvero',
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 74 · Il contorno di focus
// ─────────────────────────────────────────────────────────────────────────────

describe('74 · il focus da tastiera si vede', () => {
  it('nessun file toglie il contorno nativo del focus', () => {
    const colpevoli = fileSorgente()
      .filter((percorso) => /(?:^|\s|:)outline-none\b/.test(readFileSync(percorso, 'utf8')))
      .map(relativo);

    expect(
      colpevoli,
      'outline-none toglie il contorno nativo anche a chi naviga da tastiera; ' +
        'l’anello che lo sostituiva sta a opacità 0,25/0,40, sotto la soglia 3:1 (WCAG 2.2 §2.4.11)',
    ).toEqual([]);
  });

  it('il foglio di stile definisce un contorno per :focus-visible', () => {
    const foglio = readFileSync(CSS, 'utf8');
    expect(foglio, 'nessuna regola :focus-visible in globals.css').toMatch(/:focus-visible\s*\{/);
    expect(foglio.replace(/\s+/g, ' ')).toMatch(/:focus-visible \{[^}]*outline:[^};]*solid/);
  });

  it('il colore del contorno supera 3:1 sul fondo, in entrambi i temi', async () => {
    const { chiara, scura } = await tavolozze();

    for (const [nome, tavolozza] of [
      ['chiaro', chiara],
      ['scuro', scura],
    ] as const) {
      const marchio = tavolozza.get('--color-marchio');
      const fondo = tavolozza.get('--color-fondo');
      const superficie = tavolozza.get('--color-superficie');
      expect(marchio, `tema ${nome}: manca --color-marchio`).toBeDefined();

      for (const [dove, sotto] of [
        ['fondo', fondo],
        ['superficie', superficie],
      ] as const) {
        const rapporto = contrasto(marchio ?? '', sotto ?? '');
        expect(
          rapporto,
          `tema ${nome}: il contorno di focus su ${dove} dà ${rapporto.toFixed(2)}:1, sotto il 3:1 di WCAG 2.2 §2.4.11`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  /*
    La controprova: la funzione di contrasto deve dare i numeri che il foglio di stile
    dichiara di aver misurato. Senza questo, un errore nella conversione oklch→sRGB
    farebbe passare il controllo qui sopra per la ragione sbagliata.
  */
  it('la misura del contrasto riproduce i valori dichiarati in globals.css', () => {
    // «ora 5,06:1» — testo-debole chiaro su bianco.
    expect(contrasto('oklch(0.54 0.01 260)', 'oklch(1 0 0)')).toBeCloseTo(5.06, 2);
    // «0,6 dava 4,22:1, 0,66 dà 5,36:1» — testo-debole scuro sulla superficie scura.
    expect(contrasto('oklch(0.6 0.012 260)', 'oklch(0.235 0.014 260)')).toBeCloseTo(4.22, 2);
    expect(contrasto('oklch(0.66 0.012 260)', 'oklch(0.235 0.014 260)')).toBeCloseTo(5.36, 2);
    // E il caso limite che non dipende da nessuna dichiarazione: bianco su nero.
    expect(contrasto('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 76 · «attenzione» non è la gravità «rilevante»
// ─────────────────────────────────────────────────────────────────────────────

describe('76 · il tono «attenzione» usa il proprio token', () => {
  it('Avviso e Metrica non disegnano la gravità «rilevante» al posto della riserva', () => {
    const ui = senzaCommenti(leggi('components/ui.tsx'));
    const blocchiAttenzione = [...ui.matchAll(/'attenzione'([\s\S]{0,220}?)(?:\n\s*\n|\);)/g)]
      .map((m) => m[1] ?? '')
      .join('\n');

    expect(
      blocchiAttenzione,
      'il ramo «attenzione» nomina ancora il token della gravità «rilevante»: ' +
        'i due modi convivono nella stessa schermata',
    ).not.toMatch(/rilevante/);
    expect(blocchiAttenzione, 'il ramo «attenzione» non usa il token --color-attenzione').toMatch(
      /attenzione-fondo|text-attenzione|border-attenzione/,
    );
  });

  /*
    Guardia contro una ricaduta, NON la prova del reperto 76 — e va detto, perche' un
    controllo scambiato per quello che non e' vale meno di nessun controllo.

    Il token --color-attenzione esisteva gia' prima di questa correzione, quindi questo
    blocco e' verde anche sul codice difettoso: misurato, e' uno dei due soli su
    quarantadue che non diventano rossi riportando i sorgenti a prima. Cio' che prova e'
    l'altra meta' della storia — che in Tailwind v4 una classe senza variabile in at-theme
    non produce un byte di CSS, e le nove classi «attenzione» erano rimaste senza colore.
    La prova del 76 e' il controllo qui sopra, che rosso lo diventa.
  */
  it('il compilatore genera davvero le classi «attenzione» usate da Avviso', async () => {
    const css = await compilaCss();
    for (const classe of ['bg-attenzione-fondo', 'text-attenzione']) {
      expect(css, `${classe} non compare nel CSS compilato`).toContain(`.${classe}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 75 · Dove ci si trova
// ─────────────────────────────────────────────────────────────────────────────

describe('75 · la navigazione dice dove ci si trova', () => {
  it('aria-current compare nella navigazione principale e nelle schede delle impostazioni', () => {
    const conAriaCurrent = fileSorgente()
      .filter((percorso) => readFileSync(percorso, 'utf8').includes('aria-current'))
      .map(relativo);

    expect(
      conAriaCurrent.includes('app/NavigazionePrincipale.tsx'),
      `nessuna voce del menu principale porta aria-current (file che lo usano: ${conAriaCurrent.join(', ')})`,
    ).toBe(true);

    expect(
      conAriaCurrent.includes('app/impostazioni/SchedaImpostazioni.tsx'),
      'nessuna delle sette schede delle impostazioni dice quale è aperta',
    ).toBe(true);

    // Il menu resta montato nel layout: un componente che nessuno rende non segna nulla.
    expect(leggi('app/layout.tsx')).toMatch(/<NavigazionePrincipale\s*\/>/);
    expect(leggi('app/impostazioni/layout.tsx')).toMatch(/SchedaImpostazioni/);
  });

  it('la radice non risulta aperta su ogni pagina', async () => {
    const { eAttiva } = await import('../src/lib/voce-attiva.js');

    // Con un confronto per prefisso «Ricerca» sarebbe la voce corrente ovunque, perché
    // ogni percorso comincia per `/`: due voci correnti sono peggio di nessuna.
    expect(eAttiva('/portafoglio', '/')).toBe(false);
    expect(eAttiva('/', '/')).toBe(true);
    expect(eAttiva('/portafoglio', '/portafoglio')).toBe(true);
    expect(eAttiva('/portafoglio/importa', '/portafoglio')).toBe(true);
    // `/prospect` non è dentro `/pros`: il confronto è per segmento, non per lettere.
    expect(eAttiva('/prospetto', '/prospect')).toBe(false);
    expect(eAttiva(null, '/')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 26 · 27 · Messaggi da sviluppatore mostrati al broker
// ─────────────────────────────────────────────────────────────────────────────

describe('26 e 27 · nessun comando da sviluppatore, e nessuna porta inventata', () => {
  it('ogni schermata che nomina un comando npm lo mostra solo fuori produzione', () => {
    const senzaGuardia = fileSorgente()
      .filter((percorso) => {
        const sorgente = readFileSync(percorso, 'utf8');
        return sorgente.includes('npm run dev') && !sorgente.includes('NODE_ENV');
      })
      .map(relativo);

    expect(
      senzaGuardia,
      'l’installazione consegnata parte da systemd: «avviare il backend con npm run dev:api» ' +
        'manda l’intermediario a lanciare un comando che non ha',
    ).toEqual([]);
  });

  it('nessun messaggio nomina una porta fissa', () => {
    const consentiti = ['lib/api.ts', 'lib/chiamata-server.ts'];
    const colpevoli = fileSorgente()
      .filter((percorso) => !consentiti.includes(relativo(percorso)))
      .filter((percorso) => /\b3001\b/.test(senzaCommenti(readFileSync(percorso, 'utf8'))))
      .map(relativo);

    expect(
      colpevoli,
      'la porta è configurabile con AEGIS_API_URL: nominarne una fissa manda a cercare il guasto nel posto sbagliato',
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 28 · Il token del cliente nella barra dell'indirizzo
// ─────────────────────────────────────────────────────────────────────────────

describe('28 · il questionario del cliente non porta al login con il suo token', () => {
  it('l’editor del dossier non costruisce da sé alcun indirizzo /azienda/', () => {
    const editor = leggi('app/azienda/[id]/dati/EditorDossier.tsx');
    expect(
      editor,
      'sul percorso del cliente `identificativo` È il token: /azienda/<token> rinvia al login ' +
        'con il token nel parametro `ritorno`, quindi nella barra dell’indirizzo, nella cronologia e nel referrer',
    ).not.toMatch(/\/azienda\/\$\{/);
  });

  /*
    Le due rotte si guardano INSIEME, e nessuna delle due basta da sola.

    Cercare solo l'assenza sul percorso del cliente era verde anche prima della
    correzione, quando la proprieta' non esisteva affatto: il difetto era che l'editor si
    costruiva l'indirizzo da se'. Un controllo che passa sul codice rotto non e' un
    controllo, quindi qui si chiede anche il verso positivo — la rotta interna DEVE
    passare il collegamento. Cosi' la coppia distingue le tre situazioni: il collegamento
    solo dove l'utente e' l'intermediario, mai dove e' il cliente, e la proprieta' viva.
  */
  it('il collegamento all’analisi esiste sulla rotta interna e non su quella del cliente', () => {
    const cliente = senzaCommenti(leggi('app/questionario/[token]/page.tsx'));
    expect(
      cliente,
      'sul percorso pubblico l’identificativo È il token: passargli un collegamento ' +
        'all’analisi lo rimette nella barra dell’indirizzo, nella cronologia e nel referrer',
    ).not.toMatch(/collegamentoAnalisi/);

    const interna = senzaCommenti(leggi('app/azienda/[id]/dati/page.tsx')).replace(/\s+/g, ' ');
    expect(
      interna,
      'nessuna rotta passa più il collegamento: la proprietà è morta e il controllo qui ' +
        'sopra passerebbe per assenza, non per merito',
    ).toMatch(/collegamentoAnalisi=\{`\/azienda\/\$\{id\}`\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17 · Il report rilancia l'analisi senza i parametri di acquisto
// ─────────────────────────────────────────────────────────────────────────────

describe('17 · il report vede ciò che è stato pagato', () => {
  const report = () => leggi('app/azienda/[id]/report/page.tsx');

  /*
    Senza commenti, qui e nei due controlli che seguono.

    La spiegazione della correzione, in cima al file, nomina per forza la cosa corretta e
    ne cita la forma difettosa. Leggere anche quelle righe significa cercare la prova nel
    racconto invece che nel codice, ed e' il modo in cui un controllo smette di poter
    fallire — misurato altrove in questo stesso file, sul capitolo CAT NAT.
  */
  it('il report accetta i parametri di acquisto', () => {
    expect(
      senzaCommenti(report()),
      'searchParams del report conosce solo `escludi` e `profondita`',
    ).toMatch(/searchParams:\s*Promise<\{[^}]*approfondita\?[^}]*negativita\?/s);
  });

  it('e li passa all’analisi, invece di rilanciarla nuda', () => {
    const sorgente = senzaCommenti(report()).replace(/\s+/g, ' ');

    expect(
      sorgente,
      'analizzaAzienda(id) senza opzioni: le cariche pagate risultano non acquisite, ' +
        'le unità locali spariscono dal capitolo ubicazioni',
    ).toMatch(/analizzaAzienda\(\s*id,\s*\{/);

    /*
      E le opzioni devono venire dall'indirizzo, non da due costanti. Passare
      { approfondita: false } soddisferebbe la forma e ricostruirebbe il difetto intero.
    */
    expect(sorgente, 'i due livelli non sono letti dai parametri della richiesta').toMatch(
      /approfondita = parametri\.approfondita === '1'/,
    );
    expect(sorgente).toMatch(/conNegativita = parametri\.negativita === '1'/);
  });

  it('il collegamento al report porta con sé i parametri di acquisto', () => {
    const scheda = leggi('app/azienda/[id]/page.tsx').replace(/\s+/g, ' ');
    expect(
      scheda,
      'il pulsante «Report per il cliente» punta a /report nudo: da lì l’analisi riparte senza acquisti',
    ).not.toMatch(/href=\{`\/azienda\/\$\{identificativo\}\/report`\}/);
  });

  it('score e fido portano nel report la stessa riserva della scheda', () => {
    expect(
      senzaCommenti(report()),
      'la scheda dichiara «provvisorio: protesti e procedure non verificati» e il report no',
    ).toMatch(/eventiNegativi\s*[!=]==\s*null/);
    expect(senzaCommenti(report()), 'la riserva non compare in nessuna frase del report').toMatch(
      /provvisor/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18 · Le descrizioni in inglese nel documento consegnato
// ─────────────────────────────────────────────────────────────────────────────

describe('18 · le descrizioni dell’archivio si leggono in italiano', () => {
  it('le voci previste si traducono da un elenco fisso', async () => {
    const { traduciDescrizioneArchivio } = await import('../src/lib/traduzioni-archivio.js');

    expect(traduciDescrizioneArchivio('Chairman of board of directors')).toBe(
      'presidente del consiglio di amministrazione',
    );
    expect(traduciDescrizioneArchivio('Permanent auditor')).toBe('sindaco effettivo');
    expect(traduciDescrizioneArchivio('Small enterprise')).toBe('piccola impresa');
    expect(traduciDescrizioneArchivio('Local units')).toBe('unità locale');
  });

  it('una voce non prevista resta grezza: non si inventa una traduzione', async () => {
    const { traduciDescrizioneArchivio } = await import('../src/lib/traduzioni-archivio.js');

    expect(traduciDescrizioneArchivio('Grand poobah of the realm')).toBe('Grand poobah of the realm');
    expect(traduciDescrizioneArchivio('')).toBe('');
    expect(traduciDescrizioneArchivio(null)).toBeNull();
  });

  it('«Managing director» non diventa «amministratore delegato»: il registro lo usa per due cariche', async () => {
    const { traduciDescrizioneArchivio } = await import('../src/lib/traduzioni-archivio.js');

    // AUN è l'amministratore unico, COD il delegato, e la descrizione inglese è la stessa
    // per entrambi. Senza il `code` si dice ciò che è vero di tutti e due.
    expect(traduciDescrizioneArchivio('Managing director')).toBe('amministratore');
  });

  it('il report e la scheda azienda non stampano il ruolo grezzo', () => {
    for (const file of ['app/azienda/[id]/report/page.tsx', 'app/azienda/[id]/page.tsx']) {
      const sorgente = leggi(file).replace(/\s+/g, ' ');
      expect(
        sorgente,
        `${file}: il ruolo della carica arriva a schermo così come lo manda il fornitore`,
      ).not.toMatch(/\{c\.ruolo\}|c\.ruolo\.toLowerCase\(\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19 · «Si acquistano con l'analisi approfondita», detto a chi l'ha pagata
// ─────────────────────────────────────────────────────────────────────────────

describe('19 · non si propone di comprare ciò che è già comprato', () => {
  it('la nota sui campi mancanti cambia quando l’approfondimento è già stato acquistato', async () => {
    const { notaCampiMancanti } = await import('../src/lib/nota-campi-mancanti.js');

    const nonComprata = notaCampiMancanti(['Settore RAE', 'NACE'], false);
    expect(nonComprata).not.toBeNull();
    expect(nonComprata ?? '').toMatch(/analisi approfondita/);

    const giaComprata = notaCampiMancanti(['Settore RAE', 'NACE'], true);
    expect(giaComprata).not.toBeNull();
    expect(
      giaComprata ?? '',
      'l’approfondimento è già stato pagato: proporne l’acquisto è una richiesta di denaro per nulla',
    ).not.toMatch(/analisi approfondita/);
  });

  it('senza campi mancanti non c’è nota da mostrare', async () => {
    const { notaCampiMancanti } = await import('../src/lib/nota-campi-mancanti.js');
    expect(notaCampiMancanti([], false)).toBeNull();
    expect(notaCampiMancanti([], true)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22 · «Nessun campo è obbligatorio», e poi lo scarto silenzioso
// ─────────────────────────────────────────────────────────────────────────────

describe('22 · nulla viene scartato in silenzio', () => {
  const polizza = (patch: Record<string, unknown> = {}) => ({
    id: 'p1',
    coverage: 'incendio',
    compagnia: 'Compagnia S.p.A.',
    numeroPolizza: null,
    sommaAssicurataEuro: null,
    massimaleEuro: null,
    franchigiaEuro: null,
    premioAnnuoEuro: null,
    dataEffetto: '2026-01-01',
    dataScadenza: '2027-01-01',
    formaGaranzia: null,
    ...patch,
  });

  it('una polizza senza compagnia viene nominata, non buttata', async () => {
    const { righeIncomplete } = await import('../src/lib/dossier-incompleto.js');

    const mancanti = righeIncomplete([], [polizza({ compagnia: '  ' })]);
    expect(
      mancanti.length,
      'la polizza incompleta veniva scartata in silenzio, e a valle il piano ' +
        'proponeva di attivare una garanzia che il cliente ha già',
    ).toBe(1);
    expect(mancanti[0]?.cosa).toMatch(/polizza/i);
    expect(mancanti[0]?.mancano.join(' ')).toMatch(/compagnia/i);
  });

  it('una polizza senza date viene nominata con tutte le sue mancanze', async () => {
    const { righeIncomplete } = await import('../src/lib/dossier-incompleto.js');

    const mancanti = righeIncomplete([], [polizza({ dataEffetto: '', dataScadenza: '' })]);
    expect(mancanti).toHaveLength(1);
    expect(mancanti[0]?.mancano).toHaveLength(2);
  });

  it('un immobile senza descrizione viene nominato', async () => {
    const { righeIncomplete } = await import('../src/lib/dossier-incompleto.js');

    const mancanti = righeIncomplete([{ descrizione: '' }], []);
    expect(mancanti).toHaveLength(1);
    expect(mancanti[0]?.cosa).toMatch(/immobile/i);
  });

  it('ciò che è completo non produce alcun rilievo', async () => {
    const { righeIncomplete } = await import('../src/lib/dossier-incompleto.js');
    expect(righeIncomplete([{ descrizione: 'Capannone' }], [polizza()])).toEqual([]);
  });

  it('la promessa fatta al cliente dice ciò che vale davvero', () => {
    const pagina = senzaCommenti(leggi('app/questionario/[token]/page.tsx'));

    expect(
      pagina,
      '«Nessun campo è obbligatorio» non è vero per le righe di polizza e di immobile: ' +
        'senza compagnia, date o descrizione venivano scartate, e il cliente leggeva «Risposte inviate. Grazie»',
    ).not.toMatch(/Nessun campo è obbligatorio/);

    expect(pagina, 'la promessa non nomina l’eccezione che la riguarda').toMatch(/polizza/i);
    expect(pagina).toMatch(/immobile/i);
  });

  it('l’editor si ferma invece di scartare, e non filtra più in silenzio', () => {
    const editor = senzaCommenti(leggi('app/azienda/[id]/dati/EditorDossier.tsx'));
    expect(editor, 'la validazione non passa dal modulo condiviso').toMatch(/righeIncomplete\(/);

    /*
      Chiamarlo non basta: il difetto era lo scarto SILENZIOSO, quindi cio' che conta e'
      che il salvataggio si FERMI. Calcolare le righe incomplete e proseguire lo stesso
      lascerebbe il cliente con «Risposte inviate. Grazie» davanti a una polizza persa.
    */
    expect(
      editor.replace(/\s+/g, ' '),
      'le righe incomplete sono calcolate e il salvataggio prosegue lo stesso',
    ).toMatch(/if \(incomplete\.length > 0\) \{.{0,160}?return;/);
    expect(
      editor.replace(/\s+/g, ' '),
      'il filtro silenzioso sulle polizze è ancora al suo posto',
    ).not.toMatch(/polizze\.filter\(\s*\(p\)\s*=>\s*p\.compagnia/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23 · «Il collegamento non è più attivo», detto a ogni riavvio del servizio
// ─────────────────────────────────────────────────────────────────────────────

describe('23 · un servizio giù non è un collegamento revocato', () => {
  it('la classificazione distingue i tre casi', async () => {
    const { esitoApertura } = await import('../src/lib/esito-questionario.js');

    expect(esitoApertura(200)).toBe('aperto');
    expect(esitoApertura(404)).toBe('non-valido');
    expect(esitoApertura(410)).toBe('non-valido');
    expect(esitoApertura(401)).toBe('non-valido');

    expect(
      esitoApertura(null),
      'nessuna risposta significa servizio irraggiungibile, non token revocato: ' +
        'succede a ogni riavvio, e il cliente legge che il suo collegamento è morto',
    ).toBe('servizio-non-raggiungibile');
    expect(esitoApertura(503)).toBe('servizio-non-raggiungibile');
    expect(esitoApertura(500)).toBe('servizio-non-raggiungibile');
  });

  it('la pagina del questionario usa la classificazione', () => {
    const pagina = senzaCommenti(leggi('app/questionario/[token]/page.tsx')).replace(/\s+/g, ' ');

    // La chiamata, non il nome: la riga di import soddisfa una ricerca del solo nome.
    expect(pagina, 'esitoApertura è importato e mai chiamato').toMatch(/esitoApertura\(/);

    /*
      E il codice di stato ci deve arrivare davvero. Passandogli sempre null si tornerebbe
      al difetto per un'altra strada: ogni esito diventerebbe «servizio irraggiungibile»,
      e un token davvero revocato smetterebbe di essere riconosciuto.
    */
    expect(pagina, 'a esitoApertura non arriva il codice di stato della risposta').toMatch(
      /esitoApertura\([^)]*status/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24 · Il portafoglio colora di verde ciò che la scheda dichiara provvisorio
// ─────────────────────────────────────────────────────────────────────────────

describe('24 · il portafoglio non emette un verdetto che non può sostenere', () => {
  it('lo score in elenco non viene colorato come se fosse verificato', () => {
    const portafoglio = leggi('app/portafoglio/page.tsx');
    const funzione = portafoglio.slice(portafoglio.indexOf('function PunteggioCredito'));
    const corpo = funzione.slice(0, funzione.indexOf('\nfunction '));

    expect(
      corpo,
      'la proiezione di portafoglio non porta la confidenza del credito: colorare di verde ' +
        'uno score che la scheda della stessa azienda dichiara «provvisorio» è un verdetto senza misura',
    ).not.toMatch(/text-basso|text-critico|text-rilevante/);
  });

  it('e l’elenco dichiara dove sta il verdetto', () => {
    expect(leggi('app/portafoglio/page.tsx')).toMatch(/provvisor/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 44 · Il capitolo CAT NAT non dice contro cosa assicurarsi
// ─────────────────────────────────────────────────────────────────────────────

describe('44 · il capitolo CAT NAT stampa gli eventi coperti', () => {
  /*
    Si legge il report SENZA i commenti, ed e' la differenza fra un controllo e un'ombra.

    La prima stesura cercava eventiCoperti nel sorgente grezzo. Ma la spiegazione della
    correzione, tre righe sopra il codice, NOMINA la cosa corretta — «eventiCoperti veniva
    calcolato dal motore, spedito al frontend e mai stampato» — e quel commento da solo
    bastava a far passare il controllo. Provato togliendo le quattro righe di JSX e
    lasciando il commento: il controllo restava verde. Un capitolo che non dice piu' contro
    cosa assicurarsi sarebbe tornato in produzione senza che nulla diventasse rosso.
  */
  it('eventiCoperti arriva sulla carta', () => {
    const report = senzaCommenti(leggi('app/azienda/[id]/report/page.tsx')).replace(/\s+/g, ' ');

    expect(
      report,
      'eventiCoperti è calcolato, spedito e mai stampato: il capitolo dice quali beni ' +
        'assicurare e non contro cosa',
    ).toMatch(/catNat\.eventiCoperti\.map\(/);

    // E la lista ha un'intestazione: un elenco puntato senza titolo non dice di che parla.
    expect(report, 'gli eventi arrivano in pagina senza dire che cosa sono').toMatch(/Eventi contro cui/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 73 · Il report senza intestazione dello studio, e senza dirlo
// ─────────────────────────────────────────────────────────────────────────────

describe('73 · il documento dell’art. 58 dichiara quando non è intestato', () => {
  it('l’avviso nomina ciò che manca, e tace quando non manca nulla', async () => {
    const { avvisoIntestazione } = await import('../src/lib/avviso-intestazione.js');

    const completo = {
      denominazione: 'Studio Rossi',
      numeroRui: 'B000123456',
      partitaIva: null,
      indirizzo: null,
      email: null,
      telefono: null,
      logo: null,
    };

    expect(avvisoIntestazione(completo)).toBeNull();

    const senzaStudio = avvisoIntestazione(null);
    expect(senzaStudio, 'senza anagrafica il documento esce anonimo e non lo dice').not.toBeNull();
    expect(senzaStudio ?? '').toMatch(/RUI/);

    const senzaRui = avvisoIntestazione({ ...completo, numeroRui: null });
    expect(senzaRui, 'il numero RUI è ciò che l’art. 58 chiede: la sua assenza va detta').not.toBeNull();
    expect(senzaRui ?? '').toMatch(/RUI/);

    const senzaNome = avvisoIntestazione({ ...completo, denominazione: '   ' });
    expect(senzaNome).not.toBeNull();
  });

  /*
    Si cerca la CHIAMATA e la resa, non il nome. La riga di import basta a soddisfare una
    ricerca del solo nome, e un import inutilizzato non cambia un pixel del documento.
  */
  it('il report mostra l’avviso', () => {
    const report = senzaCommenti(leggi('app/azienda/[id]/report/page.tsx')).replace(/\s+/g, ' ');
    expect(report, 'avvisoIntestazione non viene mai chiamato').toMatch(/avvisoIntestazione\(studio\)/);
    expect(
      report,
      'l’avviso è calcolato e mai reso: il documento esce anonimo senza dirlo, ' +
        'ed è lo stesso difetto di eventiCoperti un capitolo più in là',
    ).toMatch(/rilievoIntestazione !== null &&/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 63 · Il prezzo unitario del prospect scritto a mano
// ─────────────────────────────────────────────────────────────────────────────

describe('63 · il prezzo per riga si ricava dal totale del fornitore', () => {
  it('si divide il costo dichiarato per le righe, e l’assenza resta assenza', async () => {
    const { centesimiPerRiga } = await import('../src/lib/prezzo-prospect.js');

    expect(centesimiPerRiga(25, 5)).toBe(5);
    expect(centesimiPerRiga(0, 0), 'senza righe non c’è un prezzo unitario da mostrare').toBeNull();
    expect(centesimiPerRiga(30, 0)).toBeNull();
  });

  it('la pagina non scrive più il prezzo unitario a mano accanto al totale', () => {
    expect(
      senzaCommenti(leggi('app/prospect/page.tsx')),
      'un prezzo scritto a mano accanto a un totale che arriva dal fornitore è un prezzo che diverge',
    ).not.toMatch(/\d+\s*centesimi ad azienda/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 72 · «Servizio non raggiungibile» quando il denaro è già stato speso
// ─────────────────────────────────────────────────────────────────────────────

describe('72 · un’importazione interrotta non si dichiara mai avvenuta', () => {
  it('solo un rifiuto di connessione prova che nulla è partito', async () => {
    const { nullaEPartito } = await import('../src/lib/errore-rete.js');

    const rifiutata = new TypeError('fetch failed');
    (rifiutata as { cause?: unknown }).cause = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(nullaEPartito(rifiutata)).toBe(true);

    const cadutaAMeta = new TypeError('fetch failed');
    (cadutaAMeta as { cause?: unknown }).cause = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
    });
    expect(
      nullaEPartito(cadutaAMeta),
      'la connessione è caduta dopo la partenza: le aziende possono essere state acquisite e pagate',
    ).toBe(false);

    expect(nullaEPartito(new TypeError('fetch failed'))).toBe(false);
    expect(nullaEPartito('qualcosa')).toBe(false);
  });

  it('l’azione che spende usa la distinzione', () => {
    const azioni = leggi('app/portafoglio/importa/actions.ts');
    const esegui = azioni.slice(azioni.indexOf('export async function eseguiImportazione'));
    expect(
      esegui,
      'il ramo di errore diceva «Servizio non raggiungibile» anche quando il denaro era già stato speso',
    ).toMatch(/nullaEPartito/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Colore: conversione oklch → sRGB, per misurare invece di stimare
// ─────────────────────────────────────────────────────────────────────────────

/** Le tre componenti sRGB lineari di un colore `oklch(L C H)`. */
function srgbLineare(colore: string): [number, number, number] {
  const trovati = colore.match(/-?\d*\.?\d+/g);
  if (trovati === null || trovati.length < 3) {
    throw new Error(`colore non riconosciuto: ${colore}`);
  }
  const L = Number(trovati[0]);
  const C = Number(trovati[1]);
  const Hgradi = Number(trovati[2]);

  const h = (Hgradi * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Luminanza relativa WCAG, da 0 (nero) a 1 (bianco). */
function luminosita(colore: string): number {
  const [r, g, b] = srgbLineare(colore);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG fra due colori. */
function contrasto(primo: string, secondo: string): number {
  const a = luminosita(primo);
  const b = luminosita(secondo);
  const chiaro = Math.max(a, b);
  const scuro = Math.min(a, b);
  return (chiaro + 0.05) / (scuro + 0.05);
}
