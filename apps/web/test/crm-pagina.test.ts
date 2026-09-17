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

  it('legge il CRM, con stato, nota, contatti e filtri per stato', () => {
    expect(pagina).toContain('leggiCrm()');
    expect(pagina).toContain('<ModificaCrm');
    expect(pagina).toContain('STATI_CRM.map(');
    expect(pagina).toContain('<Contatti azienda={azienda} />');
    // Aprire un'azienda mai analizzata spende: il pulsante lo dice con il suo nome.
    expect(pagina).toContain("{analizzata ? 'Apri' : 'Analizza'}");
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
    expect(modulo).toContain('<span className="sr-only">Stato di {denominazione}</span>');
    expect(modulo).toContain('<span className="sr-only">Nota su {denominazione}</span>');
    expect(modulo).toContain('role="status"');
  });

  it('i componenti di client importano il CRM dal sottopercorso, non l’intero motore', () => {
    // `@aegis/core` porta con sé archivi di migliaia di comuni: in un componente di client
    // finirebbero nel pacchetto che il browser scarica.
    for (const file of ['app/portafoglio/ModificaCrm.tsx', 'app/portafoglio/page.tsx']) {
      expect(leggi(file), file).not.toMatch(/from '@aegis\/core'/);
    }
  });
});
