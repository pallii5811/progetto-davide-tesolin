import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * La pagina CRM (17/09/2026, «AEGIS - cambi.pptx», slide 3).
 *
 * «Questa pagina deve essere un CRM non un tracker assicurativo. Non abbiamo la maggior parte
 * dei dati per poter dire cosa è coperto e cosa no», e «Togli importa elenco clienti». Qui si
 * presidia che nessun dato assicurativo torni sulla pagina per sbaglio, e che la pagina legga il
 * CRM e non il portafoglio assicurativo. Il comportamento lo provano i collaudi nel browser.
 */

const SORGENTI = fileURLToPath(new URL('../src/', import.meta.url));
const leggi = (percorso: string): string => readFileSync(join(SORGENTI, percorso), 'utf8');

function senzaCommenti(testo: string): string {
  return testo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('La pagina CRM', () => {
  const pagina = senzaCommenti(leggi('app/portafoglio/page.tsx'));

  it('si chiama CRM e dice cosa contiene', () => {
    expect(pagina).toMatch(/<h1[^>]*>CRM<\/h1>/);
    expect(pagina).toContain('ordinate per priorità di intervento.');
  });

  it('non mostra nessun dato assicurativo', () => {
    for (const tolto of [
      'CAT NAT',
      'Coperture da attivare',
      'Esposizione complessiva',
      'Esposizione non assicurata',
      'Prossima azione',
      'azionePrioritaria',
      'coperturaAssente',
      'catNatConforme',
      'non censita',
      'Importa elenco clienti',
      '/portafoglio/importa',
      'leggiPortafoglio',
    ]) {
      expect(pagina, tolto).not.toContain(tolto);
    }
  });

  it('legge il CRM e ne disegna i filtri per stato', () => {
    expect(pagina).toContain('leggiCrm()');
    expect(pagina).toContain('STATI_CRM.map(');
    expect(pagina).toContain('<ElencoCrm');
  });

  /*
    Dal 19/09/2026 le righe stanno in un componente di client (la ricerca filtra senza andare al
    server). Le promesse restano le stesse, e si misurano dov'è finito il codice.
  */
  it('l’elenco porta contatti, stato, nota e i tre punteggi', () => {
    const elenco = senzaCommenti(leggi('app/portafoglio/ElencoCrm.tsx'));

    expect(elenco).toContain('<ModificaCrm');
    expect(elenco).toContain('<Contatti azienda={azienda} />');
    expect(elenco).toContain('<Punteggi azienda={azienda} />');
    // Aprire un'azienda mai analizzata spende: il pulsante lo dice con il suo nome.
    expect(elenco).toContain("{analizzata ? 'Apri' : 'Analizza'}");

    // Il telefono chiesto il 19/09/2026, come collegamento che il telefono compone.
    expect(elenco, 'il telefono non è un collegamento tel:').toContain('tel:');
    // I punteggi sono gli stessi cerchi della scheda, non un secondo disegno.
    expect(elenco).toContain("from '../azienda/[id]/Cerchio'");
    for (const campo of ['propertyRisk', 'biPunteggio', 'biPerditaGiornalieraCentesimi', 'cyberRisk']) {
      expect(elenco, campo).toContain(`azienda.${campo}`);
    }
  });

  it('il file esportato viene dal CRM, non dal portafoglio assicurativo', () => {
    const rotta = senzaCommenti(leggi('app/portafoglio/esporta/route.ts'));
    expect(rotta).toContain("'/api/crm/esporta'");
    expect(rotta).not.toContain('/api/portafoglio/esporta');
  });

  it('stato e nota si salvano con un’azione che passa dal server, e il ruolo in sola lettura lo sa', () => {
    const azioni = leggi('app/portafoglio/actions.ts');
    expect(azioni.startsWith("'use server';")).toBe(true);
    expect(azioni).toContain("metodo: 'PATCH'");
    expect(azioni).toContain("revalidatePath('/portafoglio')");
    expect(azioni).toContain('sola lettura');

    const modulo = senzaCommenti(leggi('app/portafoglio/ModificaCrm.tsx'));
    // Il menu degli stati viene dal dominio, non da un elenco scritto qui.
    expect(modulo).toContain("from '@aegis/core/crm'");
    /*
      Le etichette AVVOLGONO il campo invece di agganciarlo per identificativo: la pagina disegna
      ogni azienda due volte — riga e scheda da telefono — e due identificativi uguali facevano
      puntare l'etichetta al campo nascosto, che nessuno può usare.
    */
    expect(modulo, 'un’etichetta agganciata per id: su due copie punta a quella nascosta').not.toMatch(
      /htmlFor=/,
    );
    expect(modulo).toContain('<span className="sr-only">Stato di {denominazione}</span>');
    expect(modulo).toContain('<span className="sr-only">Nota su {denominazione}</span>');
    expect(modulo).toContain('role="status"');
  });

  it('i componenti di client importano il CRM dal sottopercorso, non l’intero motore', () => {
    // `@aegis/core` porta con sé archivi di migliaia di comuni: in un componente di client
    // finirebbero nel pacchetto che il browser scarica.
    for (const file of [
      'app/portafoglio/ModificaCrm.tsx',
      'app/portafoglio/ElencoCrm.tsx',
      'app/portafoglio/page.tsx',
    ]) {
      expect(leggi(file), file).not.toMatch(/from '@aegis\/core'/);
    }
  });
});
