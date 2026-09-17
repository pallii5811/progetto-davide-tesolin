import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nuovi clienti per città, e niente più pagina «Ricerca».
 *
 * Richiesta di Simone del 13/09/2026: la città al posto della provincia, con tutti i comuni
 * e la ricerca per nome; tutti gli altri filtri facoltativi; «Min dipendenti» e «Max
 * dipendenti» al posto di «Addetti da/a»; la pagina «Ricerca» tolta, e la ricerca per
 * partita IVA come sezione a parte di «Nuovi clienti».
 *
 * Il comportamento lo provano i collaudi nel browser (`collaudo/prospect.spec.ts`); qui si
 * presidiano i punti che, tornando indietro per sbaglio, riaprirebbero una spesa o una
 * pagina che non esiste più — e che un collaudo nel browser vedrebbe solo girando.
 */

const SORGENTI = fileURLToPath(new URL('../src/', import.meta.url));

function leggi(percorso: string): string {
  return readFileSync(join(SORGENTI, percorso), 'utf8');
}

function senzaCommenti(testo: string): string {
  return testo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function fileTsx(cartella = SORGENTI, raccolti: string[] = []): string[] {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) fileTsx(percorso, raccolti);
    else if (percorso.endsWith('.tsx')) raccolti.push(percorso);
  }
  return raccolti;
}

describe('Nuovi clienti: la città', () => {
  const pagina = senzaCommenti(leggi('app/prospect/page.tsx'));
  const selettore = senzaCommenti(leggi('app/prospect/SelettoreComune.tsx'));

  it('la città prende il posto della provincia nel modulo', () => {
    expect(pagina).toContain('<SelettoreComune codiceIniziale={criteri.comune} />');
    expect(pagina).not.toMatch(/nome="provincia"/);
    expect(pagina).not.toMatch(/etichetta="Provincia"/);
  });

  it('senza una città valida non parte nessuna ricerca a pagamento né conteggio', () => {
    // La chiamata al servizio sta dentro il controllo sulla città, e in nessun altro posto.
    const chiamata = pagina.indexOf('await cercaProspect(');
    expect(chiamata).toBeGreaterThan(-1);
    expect(pagina.indexOf('await cercaProspect(', chiamata + 1), 'una seconda chiamata').toBe(-1);
    const guardia = pagina.lastIndexOf('if (comuneScelto !== null) {', chiamata);
    expect(guardia, 'la ricerca non è protetta dal controllo sulla città').toBeGreaterThan(-1);
    expect(pagina.slice(guardia, chiamata)).not.toContain('}');
  });

  it('al modulo arriva il codice catastale in un campo nascosto, e il testo scritto no', () => {
    expect(selettore).toMatch(
      /<input type="hidden" name="comune" value=\{scelto\?\.codiceCatastale \?\? ''\} \/>/,
    );
    // Il campo visibile non ha nome: un testo scritto a metà non deve arrivare al servizio.
    const campoVisibile = selettore.slice(
      selettore.indexOf('role="combobox"') - 200,
      selettore.indexOf('role="combobox"') + 200,
    );
    expect(campoVisibile).not.toMatch(/\bname=/);
    // Finché la città non è scelta il campo non è valido, e il browser non invia il modulo.
    expect(selettore).toContain('setCustomValidity(');
    expect(selettore).toMatch(/\brequired\b/);
  });

  it('i dipendenti si chiamano «Min dipendenti» e «Max dipendenti»', () => {
    expect(pagina).toContain('etichetta="Min dipendenti"');
    expect(pagina).toContain('etichetta="Max dipendenti"');
    expect(pagina).not.toMatch(/Addetti da|Addetti a"/);

    const ultimoElenco = leggi('app/prospect/UltimoElenco.tsx');
    expect(ultimoElenco).toContain("addettiMin: 'min dipendenti'");
    expect(ultimoElenco).toContain("addettiMax: 'max dipendenti'");
    expect(ultimoElenco).toContain("comune: 'città'");
    expect(ultimoElenco).not.toContain("provincia: 'provincia'");
  });
});

describe('La pagina «Ricerca» non c’è più', () => {
  it('il menu principale non la offre', () => {
    const menu = senzaCommenti(leggi('app/NavigazionePrincipale.tsx'));
    expect(menu).not.toMatch(/href: '\/'/);
    expect(menu).not.toContain("testo: 'Ricerca'");
    expect(menu).toContain("{ href: '/prospect', testo: 'Ricerca Clienti' }");
  });

  it('«/» rinvia a Nuovi clienti portando con sé solo i parametri della ricerca per partita IVA', () => {
    const radice = senzaCommenti(leggi('app/page.tsx'));
    expect(radice).toMatch(/redirect\(/);
    expect(radice).toContain("for (const chiave of ['q', 'piva'])");
    // Il parametro che spende non deve mai attraversare il rinvio.
    expect(radice).not.toContain('scarica');
    expect(radice).not.toMatch(/<form|ModuloRicerca|cercaAziende/);
  });

  it('la ricerca per partita IVA è una sezione di Nuovi clienti, e il suo modulo resta lì', () => {
    const pagina = senzaCommenti(leggi('app/prospect/page.tsx'));
    expect(pagina).toContain('id="ricerca-azienda"');
    expect(pagina).toContain('<ModuloRicerca');
    expect(pagina.indexOf('id="ricerca-azienda"')).toBeLessThan(pagina.indexOf('<ModuloRicerca'));

    const modulo = senzaCommenti(leggi('app/prospect/ModuloRicerca.tsx'));
    expect(modulo).toContain('router.push(`/prospect?${parametri.toString()}`, { scroll: false })');
    expect(modulo).not.toMatch(/router\.push\(`\/\?/);
  });

  it('nessun collegamento dell’interfaccia porta più a «/»', () => {
    const colpevoli = fileTsx()
      .filter((percorso) => /href=(?:"\/"|\{'\/'\}|\{"\/"\})/.test(readFileSync(percorso, 'utf8')))
      .map((percorso) => relative(SORGENTI, percorso));
    expect(colpevoli).toEqual([]);
  });
});
