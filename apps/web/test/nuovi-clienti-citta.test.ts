import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ricerca Clienti: città facoltativa, testi del documento, niente più pagina «Ricerca».
 *
 * Richiesta di Simone del 13/09/2026: la città al posto della provincia, con tutti i comuni e
 * la ricerca per nome; la pagina «Ricerca» tolta, e la ricerca per partita IVA come sezione a
 * parte. Cambi del 17/09/2026 («AEGIS - cambi.pptx», slide 1 e 2): la città non è più
 * obbligatoria, i testi e i pulsanti cambiano nome, spariscono il richiamo dell'elenco di
 * ventiquattro ore e l'avviso «Dati reali», e la ricerca singola è solo per partita IVA.
 *
 * Il comportamento lo provano i collaudi nel browser (`collaudo/prospect.spec.ts`); qui si
 * presidiano i punti che, tornando indietro per sbaglio, riaprirebbero una spesa, un testo
 * tolto o una pagina che non esiste più — e che un collaudo nel browser vedrebbe solo girando.
 */

const SORGENTI = fileURLToPath(new URL('../src/', import.meta.url));

function leggi(percorso: string): string {
  return readFileSync(join(SORGENTI, percorso), 'utf8');
}

function senzaCommenti(testo: string): string {
  return testo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function fileTsx(cartella = SORGENTI, raccolti: string[] = []): string[] {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) fileTsx(percorso, raccolti);
    else if (percorso.endsWith('.tsx')) raccolti.push(percorso);
  }
  return raccolti;
}

describe('Ricerca Clienti: la città', () => {
  const pagina = senzaCommenti(leggi('app/prospect/page.tsx'));
  const selettore = senzaCommenti(leggi('app/prospect/SelettoreComune.tsx'));

  it('la città prende il posto della provincia nel modulo', () => {
    expect(pagina).toContain('<SelettoreComune codiceIniziale={criteri.comune} />');
    expect(pagina).not.toMatch(/nome="provincia"/);
    expect(pagina).not.toMatch(/etichetta="Provincia"/);
  });

  it('la ricerca parte solo se è descritta un’impresa e la città, se c’è, è riconosciuta', () => {
    const chiamata = pagina.indexOf('await cercaProspect(');
    expect(chiamata).toBeGreaterThan(-1);
    expect(pagina.indexOf('await cercaProspect(', chiamata + 1), 'una seconda chiamata').toBe(-1);
    const guardia = pagina.lastIndexOf('if (haDescrittoUnImpresa && !cittaNonRiconosciuta) {', chiamata);
    expect(guardia, 'la ricerca non è protetta dai due controlli').toBeGreaterThan(-1);
    expect(pagina.slice(guardia, chiamata)).not.toContain('}');
    // Forma giuridica e numero di aziende arrivano già compilati: non descrivono un'impresa.
    expect(pagina).toContain(
      "const SOLO_PREDEFINITI: readonly string[] = ['formaGiuridicaCodice', 'limite'];",
    );
  });

  it('la città non è obbligatoria, ma un testo scritto e non scelto non parte', () => {
    expect(selettore).toMatch(
      /<input type="hidden" name="comune" value=\{scelto\?\.codiceCatastale \?\? ''\} \/>/,
    );
    // Il campo visibile non ha nome: un testo scritto a metà non deve arrivare al servizio.
    const campoVisibile = selettore.slice(
      selettore.indexOf('role="combobox"') - 200,
      selettore.indexOf('role="combobox"') + 200,
    );
    expect(campoVisibile).not.toMatch(/\bname=/);
    expect(selettore).not.toMatch(/\brequired\b/);
    expect(selettore).not.toMatch(/Obbligatoria/);
    // Vuoto è valido; scritto ma non scelto no, e il browser non invia il modulo.
    expect(selettore).toContain(
      "scelto !== null || testo.trim() === '' ? '' : 'Scegli la città dall’elenco dei comuni.'",
    );
  });
});

describe('Ricerca Clienti: i testi del documento del 17/09/2026', () => {
  const pagina = senzaCommenti(leggi('app/prospect/page.tsx'));

  it('titolo, descrizione ed etichette', () => {
    expect(pagina).toContain('Trova nuove aziende');
    expect(pagina).toContain('Cerca le imprese che corrispondono ai tuoi criteri.');
    for (const etichetta of [
      'Dipendenti min.',
      'Dipendenti max.',
      'Fatturato min.',
      'Fatturato max.',
      'Ragione Sociale',
      'Codice Fiscale Socio',
    ]) {
      expect(pagina, etichetta).toContain(`etichetta="${etichetta}"`);
    }
    expect(senzaCommenti(leggi('app/prospect/SelettoreLotto.tsx'))).toContain('Numero di aziende');
    expect(pagina).toContain('nota="Inserisci il codice senza punti"');
    expect(pagina).toContain('nota="Trova le società partecipate dalla stessa persona."');
    expect(pagina).toContain(
      'Per le ditte individuali alcuni dati finanziari potrebbero non essere disponibili.',
    );
  });

  it('i pulsanti si chiamano «Conta Aziende» e «Crea Elenco»', () => {
    expect(pagina).toContain(
      'Conta Aziende <span className="text-testo-debole">non consuma crediti</span>',
    );
    expect(pagina).toContain('<BottoneElenco etichetta="Crea Elenco" />');
    for (const vecchio of ['Quante sono?', 'Dammi l’elenco', "Dammi l'elenco", 'Dammi l&apos;elenco']) {
      expect(pagina, vecchio).not.toContain(vecchio);
    }
  });

  it('i testi tolti non ci sono più', () => {
    for (const tolto of [
      'Ricerca di nuovi clienti',
      'Dati reali — ogni analisi consuma credito',
      'è obbligatoria',
      'Min dipendenti',
      'Fatturato da (€)',
      'Denominazione contiene',
      'nella città scelta',
      '<UltimoElenco',
    ]) {
      expect(pagina, tolto).not.toContain(tolto);
    }
    // Il richiamo di ventiquattro ore non esiste più come componente.
    expect(leggi('app/prospect/UltimoElenco.tsx')).not.toMatch(/export function UltimoElenco\b/);
  });

  it('la dichiarazione in fondo a ogni pagina ha le parole del documento, e una volta sola', () => {
    const testoDi = (sorgente: string) => senzaCommenti(sorgente).replace(/\s+/g, ' ');
    const layout = testoDi(leggi('app/layout.tsx'));
    expect(layout).toContain(
      'Le valutazioni fornite sono elaborazioni statistiche a supporto dell’analisi e non costituiscono consulenza finanziaria né garanzia di solvibilità. Le eventuali proposte assicurative sono soggette alla valutazione dell’intermediario secondo la normativa IVASS applicabile.',
    );
    expect(layout).not.toContain('Le valutazioni prodotte');
    // Nel piè di pagina comune, non una seconda volta dentro la pagina.
    expect(pagina).not.toContain('elaborazioni statistiche');
  });

  it('il confronto con l’elenco già comprato usa gli stessi nomi dei campi', () => {
    const ultimoElenco = leggi('app/prospect/UltimoElenco.tsx');
    expect(ultimoElenco).toContain("addettiMin: 'dipendenti min.'");
    expect(ultimoElenco).toContain("addettiMax: 'dipendenti max.'");
    expect(ultimoElenco).toContain("comune: 'città'");
    expect(ultimoElenco).toContain("limite: 'numero di aziende'");
    expect(ultimoElenco).not.toContain("provincia: 'provincia'");
    // Non promette più che rifarlo sia gratis: lo era solo per ventiquattro ore.
    expect(senzaCommenti(ultimoElenco)).not.toMatch(/non consuma credito|ventiquattro/);
  });
});

describe('La ricerca di una singola azienda, solo per partita IVA', () => {
  it('la sezione sta in Ricerca Clienti, con il suo titolo', () => {
    const pagina = senzaCommenti(leggi('app/prospect/page.tsx'));
    expect(pagina).toContain('id="ricerca-azienda"');
    expect(pagina).toContain('Cerca una singola azienda');
    expect(pagina).toContain('Cerca per Partita IVA.');
    expect(pagina).toContain('<ModuloRicerca');
    expect(pagina.indexOf('id="ricerca-azienda"')).toBeLessThan(pagina.indexOf('<ModuloRicerca'));
    expect(pagina).not.toMatch(/parametri\['q'\]/);
  });

  it('il modulo non ha più il campo della ragione sociale', () => {
    const modulo = senzaCommenti(leggi('app/prospect/ModuloRicerca.tsx'));
    expect(modulo).not.toMatch(/name="q"|Denominazione|Ragione sociale/);
    expect(modulo).toContain('name="piva"');
    expect(modulo).toContain('router.push(`/prospect?${parametri.toString()}`, { scroll: false })');
    expect(modulo).not.toMatch(/router\.push\(`\/\?/);
  });
});

describe('La pagina «Ricerca» non c’è più', () => {
  it('il menu principale non la offre', () => {
    const menu = senzaCommenti(leggi('app/NavigazionePrincipale.tsx'));
    expect(menu).not.toMatch(/href: '\/'/);
    expect(menu).not.toContain("testo: 'Ricerca'");
    // Dal redesign ogni voce porta anche la sua icona, dopo il testo.
    expect(menu).toContain("{ href: '/prospect', testo: 'Ricerca Clienti',");
  });

  it('«/» rinvia a Ricerca Clienti portando con sé solo la partita IVA', () => {
    const radice = senzaCommenti(leggi('app/page.tsx'));
    expect(radice).toMatch(/redirect\(/);
    expect(radice).toContain("for (const chiave of ['piva'])");
    // Il parametro che spende non deve mai attraversare il rinvio.
    expect(radice).not.toContain('scarica');
    expect(radice).not.toMatch(/<form|ModuloRicerca|cercaAziende/);
  });

  it('nessun collegamento dell’interfaccia porta più a «/»', () => {
    const colpevoli = fileTsx()
      .filter((percorso) => /href=(?:"\/"|\{'\/'\}|\{"\/"\})/.test(readFileSync(percorso, 'utf8')))
      .map((percorso) => relative(SORGENTI, percorso));
    expect(colpevoli).toEqual([]);
  });
});
