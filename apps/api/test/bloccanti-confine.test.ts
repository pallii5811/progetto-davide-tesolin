/**
 * I bloccanti della corsia «il confine che perde la cautela».
 *
 * Il motore è più onesto del documento che produce: calcola tre stati e ne consegna uno,
 * conosce dieci campi già pagati e ne dichiara al frontend soltanto una parte, misura
 * «non determinata» e lo fa entrare in un tipo che ammette solo tre livelli misurati.
 * Nessuno di questi difetti è dentro il motore: nascono tutti nel punto in cui il
 * risultato smette di essere un valore di dominio e diventa JSON.
 *
 * Ogni blocco porta il numero del reperto dell'audit di consegna. Tutti sono stati visti
 * ROSSI sul codice non corretto prima di scrivere la correzione: un controllo che non ha
 * mai fallito non è un controllo.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  euro,
  territorialExposure,
  DEMO_AS_OF,
  IDRAULICA_NON_DETERMINATA,
} from '@aegis/core';
import type { CompanyProfile, PolizzaInEssere } from '@aegis/core';
import { presentAnalysis } from '../src/presenter.js';

/** Il contratto che il frontend dichiara di ricevere. È l'altra metà del confine. */
const SORGENTE_DTO_WEB = fileURLToPath(new URL('../../web/src/lib/api.ts', import.meta.url));

function sorgenteDtoWeb(): string {
  return readFileSync(SORGENTE_DTO_WEB, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 1 — presenter.ts:892: il booleano esce, la distinzione resta dentro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tre polizze che il motore giudica in tre modi diversi.
 *
 *  - incendio a **primo rischio** con limite ampio → limite `adeguata`, misurato contro
 *    il danno massimo probabile e non contro il valore dei beni;
 *  - furto-rapina a **primo rischio** senza metro → limite `non-verificabile`: per quella
 *    forma il metro è la perdita attesa in un sinistro, e non è stata stimata;
 *  - RCT, che non è una garanzia a valore, resta fuori.
 *
 * I primi due escono dall'API con lo **stesso** `sottoassicurata: false`.
 */
function analisiConPrimoRischio() {
  const base = demoPolizze();
  const incendio = base.find((p) => p.coverage === 'incendio');
  if (incendio === undefined) throw new Error('La fixture dimostrativa non ha più la polizza incendio');

  const incendioAmpio: PolizzaInEssere = {
    ...incendio,
    sommaAssicurata: euro(6_000_000),
    formaGaranzia: 'primo-rischio-assoluto',
  };
  const furtoSenzaMetro: PolizzaInEssere = {
    ...incendio,
    id: 'pol-furto',
    coverage: 'furto-rapina',
    sommaAssicurata: euro(50_000),
    formaGaranzia: 'primo-rischio-assoluto',
  };

  const polizze = [...base.filter((p) => p.coverage !== 'incendio'), incendioAmpio, furtoSenzaMetro];
  return presentAnalysis(analyzeCompany(demoCompanyProfile(), polizze, DEMO_AS_OF));
}

function sottoassicurazioneDi(dto: ReturnType<typeof presentAnalysis>, copertura: string) {
  const voce = dto.gap.voci.find((v) => v.copertura === copertura);
  if (voce === undefined) throw new Error(`Nessun gap per la copertura ${copertura}`);
  if (voce.sottoassicurazione === null) {
    throw new Error(`La copertura ${copertura} non porta una verifica di sottoassicurazione`);
  }
  return voce.sottoassicurazione;
}

describe('Reperto 1 · la verifica di sottoassicurazione attraversa il confine intera', () => {
  const dto = analisiConPrimoRischio();

  it('dichiara su quale metro il limite è stato giudicato', () => {
    const incendio = sottoassicurazioneDi(dto, 'incendio');

    expect(incendio.adeguatezzaDelLimite).toBe('adeguata');
    // 2.200.000 € è il danno massimo probabile, non i 6.200.000 € di beni: su un primo
    // rischio assoluto è quello il metro, ed è il numero che impedisce di stampare
    // l'art. 1907 c.c. su una forma su cui la proporzionale non opera.
    expect(incendio.riferimentoAdeguatezza?.euro).toBe(2_200_000);
  });

  it('non trasforma «non l’ho potuto giudicare» in «va bene»', () => {
    const furto = sottoassicurazioneDi(dto, 'furto-rapina');

    expect(furto.adeguatezzaDelLimite).toBe('non-verificabile');
    // Nessun metro: l'assenza resta assenza, non diventa il valore dei beni.
    expect(furto.riferimentoAdeguatezza).toBeNull();
  });

  it('distingue due casi che il solo booleano confonde', () => {
    const incendio = sottoassicurazioneDi(dto, 'incendio');
    const furto = sottoassicurazioneDi(dto, 'furto-rapina');

    // È il difetto in una riga: al confine i due casi sono identici.
    expect(incendio.sottoassicurata).toBe(false);
    expect(furto.sottoassicurata).toBe(false);
    // E qui smettono di esserlo.
    expect(incendio.adeguatezzaDelLimite).not.toBe(furto.adeguatezzaDelLimite);
  });

  it('rende riconoscibile la garanzia a valore intero, dove l’art. 1907 c.c. opera davvero', () => {
    // La fixture dimostrativa porta l'incendio a valore a nuovo, sottoassicurato.
    const intera = presentAnalysis(analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF));
    const incendio = sottoassicurazioneDi(intera, 'incendio');

    expect(incendio.sottoassicurata).toBe(true);
    expect(incendio.adeguatezzaDelLimite).toBe('insufficiente');
    // Su una garanzia a valore intero il metro È il valore dei beni: riferimento e
    // capitale raccomandato coincidono, e la riduzione proporzionale si applica.
    const voce = intera.gap.voci.find((v) => v.copertura === 'incendio');
    expect(incendio.riferimentoAdeguatezza?.centesimi).toBe(voce?.capitaleRaccomandato.valore?.centesimi);
  });

  it('su un primo rischio insufficiente il metro NON è il valore dei beni', () => {
    const base = demoPolizze();
    const incendio = base.find((p) => p.coverage === 'incendio');
    if (incendio === undefined) throw new Error('La fixture dimostrativa non ha più la polizza incendio');
    const polizze = [
      ...base.filter((p) => p.coverage !== 'incendio'),
      { ...incendio, formaGaranzia: 'primo-rischio-assoluto' as const },
    ];
    const dtoStretto = presentAnalysis(analyzeCompany(demoCompanyProfile(), polizze, DEMO_AS_OF));
    const verifica = sottoassicurazioneDi(dtoStretto, 'incendio');
    const voce = dtoStretto.gap.voci.find((v) => v.copertura === 'incendio');

    expect(verifica.sottoassicurata).toBe(true);
    expect(verifica.adeguatezzaDelLimite).toBe('insufficiente');
    // Il riferimento è il danno probabile, e sta sotto al capitale raccomandato: è il
    // solo dato che dice al documento di NON invocare la regola proporzionale.
    expect(verifica.riferimentoAdeguatezza?.centesimi).toBeLessThan(
      voce?.capitaleRaccomandato.valore?.centesimi ?? 0,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 19 — api.ts:475: il tipo dichiara tre livelli, il server ne manda un quarto
// ─────────────────────────────────────────────────────────────────────────────

/** L'unione dichiarata dal frontend per un campo dell'elenco ubicazioni. */
function unioneDichiarata(campo: string): string[] {
  const sorgente = sorgenteDtoWeb();
  const riga = new RegExp(`\\n\\s+${campo}: ([^;]+);`).exec(sorgente);
  if (riga === null) throw new Error(`Il DTO del frontend non dichiara ${campo}`);
  return [...riga[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('Reperto 19 · il tipo dell’idraulica dice quello che il server manda', () => {
  /**
   * I soli valori che `territorialExposure` può produrre per l'etichetta idraulica.
   * La tabella conosce le sole province alte; per tutte le altre non ha misurato.
   */
  const VALORI_POSSIBILI = ['alta', IDRAULICA_NON_DETERMINATA];

  it('il motore conferma di produrre esattamente questi due valori', () => {
    const province = ['MI', 'FE', 'BS', 'AL', 'TO', 'RA', 'PD', 'GE'];
    const prodotti = new Set(province.map((p) => territorialExposure(p).idraulicaEtichetta));
    expect([...prodotti].sort()).toEqual([...VALORI_POSSIBILI].sort());
  });

  it('l’API manda «non determinata» su una provincia che la tabella non ha misurato', () => {
    const dto = presentAnalysis(analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF));
    const etichette = new Set(dto.ubicazioni.elenco.map((u) => u.idraulica));
    expect(etichette.has(IDRAULICA_NON_DETERMINATA)).toBe(true);
  });

  it('il tipo del frontend ammette ogni valore che il server manda', () => {
    const dichiarati = unioneDichiarata('idraulica');
    for (const valore of VALORI_POSSIBILI) {
      expect(dichiarati).toContain(valore);
    }
  });

  it('e non ne ammette nessuno che il server non manda', () => {
    // Dichiarare «media» e «bassa» non è un'imprecisione innocua: è ciò che fa dipingere
    // «non determinata» con la classe del rischio basso, cioè affermare una misura bassa
    // dove non c'è stata misura.
    const dichiarati = unioneDichiarata('idraulica');
    expect(dichiarati.sort()).toEqual([...VALORI_POSSIBILI].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 10/«dieci campi pagati» — il DTO degli indicatori è più stretto del modello
// ─────────────────────────────────────────────────────────────────────────────

/**
 * I campi che il DTO del frontend dichiara, gruppo per gruppo.
 *
 * Si legge per gruppi e non per nomi sciolti di proposito: `rotazioneMagazzino` esiste
 * sia in `kpi` sia in `efficienza`, e un controllo che cercasse il solo nome nel file
 * intero dichiarerebbe presente in `efficienza` un campo che sta soltanto in `kpi`.
 * Sarebbe un controllo che non può fallire dove serve.
 */
function campiDichiaratiPerGruppo(): Map<string, Set<string>> {
  const sorgente = sorgenteDtoWeb();
  const inizio = sorgente.indexOf('export interface IndicatoriArchivioDto {');
  if (inizio === -1) throw new Error('IndicatoriArchivioDto non è più dichiarato nel DTO del frontend');
  const blocco = sorgente.slice(inizio, sorgente.indexOf('\n}\n', inizio));

  const gruppi = new Map<string, Set<string>>();
  let corrente: string | null = null;

  for (const riga of blocco.split('\n')) {
    const inLinea = /^ {2}(\w+): \{(.*)\}/.exec(riga);
    if (inLinea !== null) {
      gruppi.set(inLinea[1]!, new Set([...inLinea[2]!.matchAll(/(\w+)\??:/g)].map((m) => m[1]!)));
      corrente = null;
      continue;
    }
    const apre = /^ {2}(\w+): \{$/.exec(riga);
    if (apre !== null) {
      corrente = apre[1]!;
      gruppi.set(corrente, new Set());
      continue;
    }
    if (/^ {2}\}/.test(riga)) {
      corrente = null;
      continue;
    }
    const campo = /^ {4}(\w+)\??:/.exec(riga);
    if (campo !== null && corrente !== null) gruppi.get(corrente)!.add(campo[1]!);
  }
  return gruppi;
}

describe('Indicatori del fornitore · il DTO non taglia ciò che è già pagato', () => {
  const dto = presentAnalysis(analyzeCompany(demoCompanyProfile(), demoPolizze(), DEMO_AS_OF));
  const inviati = dto.indicatoriArchivio as unknown as Record<string, unknown>;
  const dichiarati = campiDichiaratiPerGruppo();

  it('la lettura del DTO trova tutti i gruppi', () => {
    expect(dichiarati.size).toBe(Object.keys(inviati).length);
  });

  it('ogni campo che l’API manda è dichiarato nel gruppo in cui viaggia', () => {
    const mancanti: string[] = [];
    for (const [gruppo, valore] of Object.entries(inviati)) {
      if (valore === null || Array.isArray(valore)) continue;
      const attesi = dichiarati.get(gruppo);
      if (attesi === undefined) {
        mancanti.push(`${gruppo} (gruppo intero)`);
        continue;
      }
      for (const campo of Object.keys(valore as object)) {
        if (!attesi.has(campo)) mancanti.push(`${gruppo}.${campo}`);
      }
    }
    expect(mancanti).toEqual([]);
  });

  it('la quota di operai arriva al riquadro che si intitola «pesa su RC lavoratori»', () => {
    // Il campione manifatturiero della dimostrazione ha il 72% di operai: è il dato che
    // pesa di più su RC lavoratori e infortuni, ed era l'unico della composizione del
    // personale a non essere dichiarato al frontend.
    expect(dichiarati.get('statisticheAddetti')?.has('operai')).toBe(true);
  });

  it('i paesi di export arrivano, perché «esporta: sì» non basta a proporre nulla', () => {
    expect(dichiarati.get('qualifiche')?.has('paesiExport')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reperto 20 — NON CORRETTO: la causa è in packages/core, fuori da questa corsia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * I tre vincoli del fido non calcolabili escono come `0 €`.
 *
 * Questo controllo resta **ROSSO di proposito**. La correzione è `Euro | null` nei tre
 * campi di `CreditLimit` e la caduta dei tre `?? ZERO` in
 * `packages/core/src/credit/credit-limit.ts:174-176`: dentro il presenter il dato è già
 * perduto, e non è recuperabile per deduzione, perché `Money.max(ZERO, …)` produce uno
 * zero **vero** su un patrimonio netto negativo. Zero calcolato e zero mancante arrivano
 * al confine indistinguibili, ed è esattamente la differenza che il documento stampa.
 *
 * `packages/` è fuori dalla corsia: il difetto è dichiarato, non corretto.
 */
describe('Reperto 20 · i vincoli non calcolabili del fido [FUORI CORSIA — resta rosso]', () => {
  it('un vincolo non calcolabile non esce come 0 €', () => {
    // Senza bilancio E senza l'EBITDA dell'archivio camerale: dal 02/09/2026 il vincolo di
    // flusso si calcola anche sui soli dati sintetici, se l'archivio dà l'EBITDA — e la
    // dimostrazione ce l'ha. Qui si vuole il vincolo davvero non calcolabile.
    const demo = demoCompanyProfile();
    const senzaBilancio: CompanyProfile = {
      ...demo,
      bilanci: [],
      indicatoriFornitore: { ...demo.indicatoriFornitore, risultatiOperativi: null },
    };
    const dto = presentAnalysis(analyzeCompany(senzaBilancio, demoPolizze(), DEMO_AS_OF));
    const fido = dto.credito.fido;

    // La contraddizione è dentro lo stesso oggetto: la spiegazione accanto lo dichiara
    // non calcolabile, e il campo porta uno zero.
    const riga = fido.spiegazione.input.find((i) => i.etichetta.startsWith('Limite di flusso'));
    expect(riga?.valore).toBe('non calcolabile');

    expect(fido.limiteFlusso).toBeNull();
  });
});
