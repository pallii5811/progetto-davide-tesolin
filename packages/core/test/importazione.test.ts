/**
 * La presa in carico di un portafoglio esistente.
 *
 * I file veri non sono puliti. Questi test sono la raccolta dei modi in cui arrivano
 * davvero: separatori diversi, intestazioni scritte come capita, virgolette, righe vuote,
 * e soprattutto le partite IVA a cui un foglio di calcolo ha mangiato gli zeri iniziali.
 */

import { describe, expect, it } from 'vitest';
import { interpretaPartitaIva, leggiPortafoglioCsv } from '../src/portfolio/import.js';

// Partite IVA reali per struttura e carattere di controllo.
const OPENAPI = '12485671007';
const CON_ZERO_INIZIALE = '00743110157'; // Pirelli & C. — inizia per due zeri

describe('Lettura del file', () => {
  it('legge un elenco di sole partite IVA, senza intestazione', () => {
    const esito = leggiPortafoglioCsv(`${OPENAPI}\n${CON_ZERO_INIZIALE}`);

    expect(esito.intestazioneRiconosciuta).toBe(false);
    expect(esito.righe.map((r) => r.partitaIva)).toEqual([OPENAPI, CON_ZERO_INIZIALE]);
    expect(esito.scartate).toEqual([]);
  });

  it('riconosce l’intestazione comunque sia scritta', () => {
    for (const intestazione of ['Partita IVA', 'P.IVA', 'piva', 'VAT', 'Codice Fiscale']) {
      const esito = leggiPortafoglioCsv(`${intestazione};Denominazione\n${OPENAPI};Openapi S.p.A.`);

      expect(esito.intestazioneRiconosciuta, intestazione).toBe(true);
      expect(esito.righe[0]?.denominazione, intestazione).toBe('Openapi S.p.A.');
    }
  });

  it('usa il punto e virgola, che è ciò che Excel italiano esporta', () => {
    const esito = leggiPortafoglioCsv(`P.IVA;Denominazione\n${OPENAPI};Rossi, Bianchi e C. S.n.c.`);

    expect(esito.separatore).toBe(';');
    // Con la virgola come separatore la denominazione si spezzerebbe in due campi e il
    // file sembrerebbe malformato.
    expect(esito.righe[0]?.denominazione).toBe('Rossi, Bianchi e C. S.n.c.');
  });

  it('legge anche i file separati da virgola o tabulazione', () => {
    expect(leggiPortafoglioCsv(`piva,nome\n${OPENAPI},Alfa`).separatore).toBe(',');
    expect(leggiPortafoglioCsv(`piva\tnome\n${OPENAPI}\tAlfa`).separatore).toBe('\t');
  });

  it('rispetta le virgolette e le virgolette raddoppiate', () => {
    const esito = leggiPortafoglioCsv(`p.iva;denominazione\n${OPENAPI};"Il ""Grande"" Magazzino; S.r.l."`);
    expect(esito.righe[0]?.denominazione).toBe('Il "Grande" Magazzino; S.r.l.');
  });

  it('toglie il BOM che Excel antepone ai file UTF-8', () => {
    // Senza rimuoverlo, la prima intestazione diventa irriconoscibile per un carattere
    // che nessuno vede.
    const esito = leggiPortafoglioCsv(`\uFEFFP.IVA;Denominazione\n${OPENAPI};Openapi`);
    expect(esito.intestazioneRiconosciuta).toBe(true);
  });

  it('ignora le righe vuote e non le conta come errori', () => {
    const esito = leggiPortafoglioCsv(`p.iva\n${OPENAPI}\n\n   \n${CON_ZERO_INIZIALE}\n`);

    expect(esito.righe).toHaveLength(2);
    expect(esito.scartate).toEqual([]);
  });

  it('tiene una sola volta i duplicati, ma li dichiara', () => {
    const esito = leggiPortafoglioCsv(`p.iva\n${OPENAPI}\n${OPENAPI}\nIT ${OPENAPI}`);

    expect(esito.righe).toHaveLength(1);
    expect(esito.duplicati).toBe(2);
  });
});

describe('Partite IVA come arrivano dai fogli di calcolo', () => {
  it('reintegra gli zeri iniziali che Excel ha tolto', () => {
    // È il caso che rende inservibile metà delle esportazioni: trattata come numero,
    // `00743110157` diventa `743110157`. Rifiutarla sarebbe corretto e inutile.
    expect(interpretaPartitaIva('743110157')).toBe(CON_ZERO_INIZIALE);
    expect(interpretaPartitaIva('0743110157')).toBe(CON_ZERO_INIZIALE);
  });

  it('accetta le forme in cui la gente scrive davvero una partita IVA', () => {
    for (const forma of [OPENAPI, `IT${OPENAPI}`, ` ${OPENAPI} `, '12485671007']) {
      expect(interpretaPartitaIva(forma), forma).toBe(OPENAPI);
    }
  });

  it('non tira a indovinare su un carattere di controllo sbagliato', () => {
    // Reintegrare zeri è lecito perché il controllo poi conferma. Correggere una cifra
    // sbagliata no: si assegnerebbe il cliente all'azienda di qualcun altro.
    expect(interpretaPartitaIva('12485671008')).toBeNull();
    expect(interpretaPartitaIva('99999999999')).toBeNull();
  });

  it('rifiuta ciò che non è una partita IVA', () => {
    expect(interpretaPartitaIva('')).toBeNull();
    expect(interpretaPartitaIva('non disponibile')).toBeNull();
    expect(interpretaPartitaIva('123456789012345')).toBeNull();
  });
});

describe('Righe scartate: dire cosa non va, riga per riga', () => {
  it('non rifiuta l’intero file per un refuso in una riga', () => {
    const esito = leggiPortafoglioCsv(
      `p.iva;denominazione\n${OPENAPI};Buona\n;Senza partita IVA\nABC123;Sbagliata\n${CON_ZERO_INIZIALE};Buona anche questa`,
    );

    // Le righe buone passano: rifiutare tutto per la riga 3 costringerebbe a ricominciare.
    expect(esito.righe).toHaveLength(2);
    expect(esito.scartate).toHaveLength(2);
  });

  it('indica il numero di riga del file originale', () => {
    const esito = leggiPortafoglioCsv(`p.iva\n${OPENAPI}\nXXX`);

    // Chi deve correggere apre il foglio e va a quella riga: un indice a partire da zero,
    // o senza contare l'intestazione, lo manderebbe sulla riga sbagliata.
    expect(esito.scartate[0]?.riga).toBe(3);
  });

  it('spiega il motivo in modo azionabile', () => {
    const esito = leggiPortafoglioCsv(
      [
        'p.iva;denominazione',
        ';Cliente di cui non abbiamo la partita IVA',
        'non disponibile;Alfa',
        '123456789012345;Beta',
        '12485671008;Gamma',
      ].join('\n'),
    );

    const motivi = esito.scartate.map((s) => s.motivo);
    expect(motivi).toContain('Partita IVA assente');
    expect(motivi.some((m) => m.includes('caratteri non numerici'))).toBe(true);
    expect(motivi.some((m) => m.includes('undici'))).toBe(true);
    expect(motivi.some((m) => m.includes('Carattere di controllo'))).toBe(true);
  });
});

describe('Un file di esportazione realistico', () => {
  it('regge un’esportazione da gestionale con colonne in più e in disordine', () => {
    const csv = [
      'Codice cliente;Ragione sociale;Partita IVA;Agente;Premio annuo',
      `C-0012;OPENAPI S.P.A.;${OPENAPI};Rossi;1.250,00`,
      `C-0013;PIRELLI & C. S.P.A.;743110157;Bianchi;8.400,00`,
      '',
      `C-0014;CLIENTE SENZA PIVA;;Verdi;0,00`,
    ].join('\r\n');

    const esito = leggiPortafoglioCsv(csv);

    expect(esito.righe).toHaveLength(2);
    expect(esito.righe[0]?.denominazione).toBe('OPENAPI S.P.A.');
    expect(esito.righe[0]?.riferimentoInterno).toBe('C-0012');
    // Anche qui gli zeri mangiati da Excel vengono reintegrati.
    expect(esito.righe[1]?.partitaIva).toBe(CON_ZERO_INIZIALE);
    expect(esito.scartate).toHaveLength(1);
  });
});
