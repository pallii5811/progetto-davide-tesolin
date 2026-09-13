/**
 * I difetti di GALENO S.R.L. che stanno a schermo, uno per uno.
 *
 * Poliambulatorio a Leno, 13/09/2026. Nessuno cambiava un numero: cambiava come il numero si
 * legge, e in tre casi la lettura naturale era il contrario del vero.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codiceAteco, coperturaSuInteressiNetti, elencoIndirizzi } from '../src/lib/archivio-leggibile.js';
import { etichetteDelGruppo } from '../src/lib/etichette-ubicazioni.js';

const SORGENTI = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'apps/web/src');
const leggi = (relativo: string): string => readFileSync(resolve(SORGENTI, relativo), 'utf8');

describe('Il codice ATECO secondario si scrive con i punti', () => {
  it('«821909» diventa «82.19.09», come il primario accanto', () => {
    expect(codiceAteco('821909')).toBe('82.19.09');
    expect(codiceAteco('8622')).toBe('86.22');
    expect(codiceAteco('821')).toBe('82.1');
  });

  it('una forma non numerica resta com’è, e l’assenza resta assenza', () => {
    expect(codiceAteco('82.19.09')).toBe('82.19.09');
    expect(codiceAteco(null)).toBeNull();
  });
});

describe('Più indirizzi di posta si separano come si scrive', () => {
  it('«info@…,segreteria@…» prende lo spazio', () => {
    expect(elencoIndirizzi('info@poliambulatoriogaleno.it,segreteria@poliambulatoriogaleno.it')).toBe(
      'info@poliambulatoriogaleno.it, segreteria@poliambulatoriogaleno.it',
    );
  });

  it('un indirizzo solo non cambia, e un campo vuoto è un’assenza', () => {
    expect(elencoIndirizzi('pec@pec.gruppored.net')).toBe('pec@pec.gruppored.net');
    expect(elencoIndirizzi(' , ')).toBeNull();
  });
});

describe('La copertura degli interessi netti negativa non si legge contro la soglia', () => {
  it('GALENO: EBITDA positivo e rapporto −440 sono proventi finanziari netti', () => {
    expect(coperturaSuInteressiNetti(-440, 1_069_104)).toContain('proventi finanziari netti');
  });

  it('con il margine negativo o ignoto il numero resta com’è', () => {
    expect(coperturaSuInteressiNetti(-3.2, -209_451)).toBeNull();
    expect(coperturaSuInteressiNetti(-3.2, null)).toBeNull();
  });

  it('un rapporto positivo non cambia', () => {
    expect(coperturaSuInteressiNetti(9.75, 139_088)).toBeNull();
  });

  it('la scheda la usa sulle due righe degli interessi netti', () => {
    const sorgente = leggi('app/azienda/[id]/IndicatoriArchivio.tsx');
    expect(sorgente).toContain("'netti:ebitda'");
    expect(sorgente).toContain("'netti:ebit'");
    expect(sorgente).toContain('coperturaSuInteressiNetti(');
  });
});

describe('Le ubicazioni: quale riga è quale, e le due quote dell’alluvione', () => {
  const elenco = [
    { id: 'leno|badia85', etichetta: 'Sede legale — VIA BADIA 85, LENO (BS)' },
    { id: 'cremona|tonani25', etichetta: 'Unità locale — VIA AMEDEO TONANI 25, CREMONA (CR)' },
  ];

  it('ogni riga del raggruppamento incendio nomina le sue ubicazioni', () => {
    expect(etichetteDelGruppo(['cremona|tonani25'], elenco)).toEqual([
      'Unità locale — VIA AMEDEO TONANI 25, CREMONA (CR)',
    ]);
    // Una per riga, non unite: unite ripetevano la via e raddoppiavano i due-punti.
    expect(etichetteDelGruppo(['leno|badia85', 'cremona|tonani25'], elenco)).toHaveLength(2);
    expect(etichetteDelGruppo(['sconosciuta'], elenco)).toEqual([]);
  });

  it('la scheda stampa le etichette e, per l’alluvione, anche la quota media', () => {
    const pagina = leggi('app/azienda/[id]/page.tsx');
    expect(pagina).toContain('etichetteDelGruppo(c.ubicazioni, ubicazioni.elenco).map(');
    expect(pagina).toContain('u.indicatoriIdrogeo.impreseIdraulicaMedia');
  });
});
