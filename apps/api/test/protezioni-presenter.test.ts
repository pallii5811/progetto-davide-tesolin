import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, analyzeCompany, demoCompanyProfile } from '@aegis/core';
import { presentAnalysis } from '../src/presenter.js';

/**
 * Property, Business Interruption e Cyber Risk attraversano il confine interi.
 *
 * Il motore li calcola e la scheda li stampa; in mezzo c'è il presentatore, che converte gli
 * importi e può perdere per strada un campo o trasformare un'assenza in uno zero. Nessun altro
 * collaudo unitario guarda questo tratto: il collaudo su browser lo attraversa, ma lo vede solo
 * come testo a schermo.
 */
const dto = presentAnalysis(analyzeCompany(demoCompanyProfile(), [], DEMO_AS_OF));
const { protezioni } = dto;

/** I campi di primo livello di ciascun gruppo, come li dichiara `ProtezioniDto` nel frontend. */
function campiDichiarati(): Map<string, Set<string>> {
  const sorgente = readFileSync(
    fileURLToPath(new URL('../../web/src/lib/api.ts', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const inizio = sorgente.indexOf('export interface ProtezioniDto {');
  if (inizio === -1) throw new Error('ProtezioniDto non è dichiarato nel frontend');
  const blocco = sorgente.slice(inizio, sorgente.indexOf('\n}\n', inizio));

  const gruppi = new Map<string, Set<string>>();
  let corrente: string | null = null;
  for (const riga of blocco.split('\n')) {
    const apre = /^ {2}(\w+): \{$/.exec(riga);
    if (apre !== null) {
      corrente = apre[1]!;
      gruppi.set(corrente, new Set());
      continue;
    }
    const semplice = /^ {2}(\w+)\??: [^{]/.exec(riga);
    if (semplice !== null) {
      gruppi.set(semplice[1]!, new Set());
      corrente = null;
      continue;
    }
    if (/^ {2}\};?$/.test(riga)) {
      corrente = null;
      continue;
    }
    const campo = /^ {4}(\w+)\??:/.exec(riga);
    if (campo !== null && corrente !== null) gruppi.get(corrente)!.add(campo[1]!);
  }
  return gruppi;
}

describe('Le protezioni Veezco nel DTO', () => {
  it('arrivano tutte e tre, con il foglio da cui vengono', () => {
    expect(protezioni.fonte).toBe('Veezco_Analisi Rischio.xlsx');
    expect(protezioni.cyber.punteggio).toBe(3.4);
    expect(protezioni.cyber.voci).toHaveLength(4);
    expect(protezioni.property.ubicazioni.length).toBe(dto.ubicazioni.elenco.length);
    expect(protezioni.businessInterruption.formule).toHaveLength(3);
  });

  it('un punteggio che il motore non calcola esce null, non zero', () => {
    expect(protezioni.property.punteggio).toBeNull();
    expect(protezioni.businessInterruption.punteggioFisico).toBeNull();
    const pericoli = protezioni.property.ubicazioni
      .flatMap((u) => u.voci)
      .filter((v) => v.voce === 'Pericoli naturali');
    expect(pericoli.length).toBeGreaterThan(0);
    for (const v of pericoli) {
      expect(v.punteggio).toBeNull();
      expect(v.contributo).toBeNull();
    }
  });

  it('gli importi escono in centesimi, euro e testo, e gli scenari tornano con la giornaliera', () => {
    const giornaliera = protezioni.businessInterruption.perditaGiornaliera;
    expect(giornaliera).not.toBeNull();
    expect(Math.round(giornaliera!.euro * 100)).toBe(giornaliera!.centesimi);
    expect(giornaliera!.formattato).toMatch(/€/);
    for (const s of protezioni.businessInterruption.scenari) {
      expect(s.perdita.centesimi, `${s.giorni} giorni`).toBe(giornaliera!.centesimi * s.giorni);
    }
  });

  /*
    In tutte e due le direzioni. Un campo che l'API manda e il frontend non dichiara arriva e
    non si vede; un campo che il frontend dichiara e l'API non manda arriva `undefined` in un
    punto che il compilatore crede valorizzato. La prima versione guardava solo la prima, e la
    prova a vuoto — togliere `ubicazioneDiRiferimento` dal presentatore — l'ha trovata verde.
  */
  it('API e frontend si dichiarano gli stessi campi, gruppo per gruppo', () => {
    const dichiarati = campiDichiarati();
    const inviati = protezioni as unknown as Record<string, unknown>;

    expect([...dichiarati.keys()].sort()).toEqual(Object.keys(inviati).sort());
    for (const [gruppo, campi] of dichiarati) {
      const valore = inviati[gruppo];
      if (campi.size === 0) continue;
      expect(Object.keys(valore as object).sort(), gruppo).toEqual([...campi].sort());
    }
  });
});
