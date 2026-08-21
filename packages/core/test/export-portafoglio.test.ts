/**
 * L'esportazione del portafoglio.
 *
 * Un CSV è il formato in cui i difetti restano invisibili finché qualcuno non apre il
 * file — e quel qualcuno è il broker, davanti a un collega. Le prove che contano non
 * riguardano la felicità del caso normale ma le quattro cose che rendono un file
 * inutilizzabile in Italia: il separatore, la codifica, i decimali, e le celle che
 * contengono proprio il carattere che separa le colonne.
 */

import { describe, expect, it } from 'vitest';
import {
  applicaFiltroPortafoglio,
  esportaPortafoglioCsv,
  nomeFileEsportazione,
} from '../src/portfolio/export.js';
import type { VoceEsportabile } from '../src/portfolio/export.js';

function voce(modifiche: Partial<VoceEsportabile> = {}): VoceEsportabile {
  return {
    identificativo: '03158460174',
    denominazione: 'MECCANICA BRESCIANA S.R.L.',
    partitaIva: '03158460174',
    provincia: 'BS',
    atecoDescrizione: 'Fabbricazione di parti meccaniche',
    scoreCredito: 62,
    classeCredito: 'BBB',
    statoCatNat: 'inadempiente',
    catNatConforme: false,
    coperturaAssente: 3,
    coperturaDaQuantificare: 1,
    rischiCritici: 2,
    esposizioneNonAssicurataCentesimi: 145_678_900,
    completezza: 0.62,
    azionePrioritaria: 'Attivare la copertura catastrofale entro il termine di legge',
    analizzataIl: new Date('2026-08-20T09:30:00Z'),
    ...modifiche,
  };
}

describe('Esportazione del portafoglio', () => {
  it('usa il punto e virgola e il BOM, come vuole Excel italiano', () => {
    const csv = esportaPortafoglioCsv([voce()]);

    // Il BOM: senza, Excel legge l'UTF-8 come ANSI e ogni accento di una ragione sociale
    // italiana diventa illeggibile alla prima riga.
    expect(csv.startsWith('﻿')).toBe(true);

    const intestazione = csv.replace('﻿', '').split('\r\n')[0] ?? '';
    expect(intestazione).toContain('";"');
    expect(csv).toContain('\r\n');
  });

  it('scrive gli importi con la virgola decimale', () => {
    const csv = esportaPortafoglioCsv([voce({ esposizioneNonAssicurataCentesimi: 145_678_900 })]);

    // Con il punto, Excel italiano tiene la cella come testo e la somma non si può fare:
    // il numero è lì, ma non è un numero.
    expect(csv).toContain('"1456789,00"');
    expect(csv).not.toContain('"1456789.00"');
  });

  it('non spezza una riga quando la denominazione contiene il separatore', () => {
    const csv = esportaPortafoglioCsv([
      voce({ denominazione: 'ROSSI; BIANCHI & C. S.N.C. "LA FERRAMENTA"' }),
    ]);

    const righe = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(righe).toHaveLength(2);
    // Le virgolette interne si raddoppiano, come vuole lo standard.
    expect(righe[1]).toContain('""LA FERRAMENTA""');
  });

  it('conserva gli zeri iniziali della partita IVA nel file', () => {
    /*
      Excel li mangia comunque all'apertura, perché tratta la cella come un numero: è lo
      stesso guasto che la presa in carico corregge in entrata, e non dipende da come il
      file è scritto. Quello che deve valere è che **il file** li contenga: ogni lettore
      rispettoso dello standard legge il valore intero, e il giro di ritorno da qui li
      ricostruisce contando le cifre.
    */
    const csv = esportaPortafoglioCsv([voce({ partitaIva: '00743110157' })]);
    expect(csv).toContain('"00743110157"');
  });

  it('neutralizza le celle che Excel interpreterebbe come formule', () => {
    /*
      Una denominazione che comincia con `=` o `+` arriva da un elenco caricato da terzi.
      Excel la eseguirebbe come formula: è la via con cui un foglio di calcolo fa qualcosa
      che nessuno ha scritto. L'apostrofo la dichiara testo.
    */
    const csv = esportaPortafoglioCsv([voce({ denominazione: '=SOMMA(A1:A9)' })]);
    expect(csv).toContain(`"'=SOMMA(A1:A9)"`);
  });

  it('non scrive un’inadempienza che non ha accertato', () => {
    /*
      Diceva «DA SANARE (inadempiente)»: un'inadempienza a un obbligo di legge scritta
      accanto al nome di un cliente, in un file che esce dalla piattaforma e si rilegge
      fuori contesto — in una casella di posta, in un foglio condiviso.

      La piattaforma quell'inadempienza non l'ha accertata: sa soltanto che fra le
      coperture censite non ce n'è una catastrofale, e censite lo sono solo se qualcuno le
      ha inserite. Chi apre il file deve trovarci cosa fare, non un'accusa.
    */
    const conforme = esportaPortafoglioCsv([voce({ catNatConforme: true, statoCatNat: 'adempiente' })]);
    const no = esportaPortafoglioCsv([voce({ catNatConforme: false, statoCatNat: 'inadempiente' })]);

    expect(conforme).toContain('"conforme"');
    expect(no).toContain('non censita');
    expect(no, 'nessuna parola che affermi un accertamento mai fatto').not.toContain('inadempiente');
    expect(no).not.toContain('DA SANARE');
  });

  it('tiene distinte le coperture assenti da quelle da quantificare', () => {
    const csv = esportaPortafoglioCsv([voce({ coperturaAssente: 3, coperturaDaQuantificare: 1 })]);
    const intestazione = csv.replace('﻿', '').split('\r\n')[0] ?? '';

    /*
      Sommarle farebbe sparire dalla lista le posizioni da chiarire per prime: una
      copertura senza capitale determinabile non è assente, è **ignota**, e le due cose
      portano a decisioni opposte.
    */
    expect(intestazione).toContain('Coperture da attivare');
    expect(intestazione).toContain('Coperture da quantificare');
  });

  it('esporta l’intestazione anche quando non c’è nessuna riga', () => {
    // Un file completamente vuoto sembra un guasto; uno con le sole intestazioni dice
    // «il filtro non ha trovato nulla», che è un'informazione.
    const csv = esportaPortafoglioCsv([]);
    expect(csv.replace('﻿', '').trimEnd().split('\r\n')).toHaveLength(1);
    expect(csv).toContain('Denominazione');
  });

  it('il filtro è lo stesso per la pagina e per il file', () => {
    const voci = [
      voce({ identificativo: 'a', catNatConforme: false, coperturaAssente: 0 }),
      voce({ identificativo: 'b', catNatConforme: true, coperturaAssente: 2 }),
      voce({ identificativo: 'c', catNatConforme: true, coperturaAssente: 0 }),
    ];

    expect(applicaFiltroPortafoglio(voci, 'catnat').map((v) => v.identificativo)).toEqual(['a']);
    expect(applicaFiltroPortafoglio(voci, 'scoperte').map((v) => v.identificativo)).toEqual(['b']);
    // Un filtro sconosciuto non deve restituire il vuoto: mostrerebbe un portafoglio
    // svuotato invece di un parametro sbagliato.
    expect(applicaFiltroPortafoglio(voci, 'inventato')).toHaveLength(3);
    expect(applicaFiltroPortafoglio(voci, undefined)).toHaveLength(3);
  });

  it('il nome del file porta la data e il filtro, senza caratteri vietati', () => {
    const nome = nomeFileEsportazione(new Date('2026-08-20T10:00:00Z'), 'catnat');
    expect(nome).toBe('portafoglio-catnat-2026-08-20.csv');
    expect(nome).not.toMatch(/[\\/:*?"<>|]/);

    expect(nomeFileEsportazione(new Date('2026-08-20T10:00:00Z'))).toBe('portafoglio-2026-08-20.csv');
  });
});
