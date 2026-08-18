/**
 * Lo stato di un'azienda, ridotto a ciò che vale la pena sorvegliare.
 *
 * Il monitoraggio non confronta due analisi intere: confronta due fotografie di pochi
 * fatti scelti, quelli che — cambiando — spostano una copertura. Il resto di un'analisi
 * cambia di continuo per motivi che a un assicuratore non dicono nulla.
 *
 * La riduzione è anche ciò che rende il confronto conservabile: due fotografie si
 * archiviano accanto all'analisi, due analisi complete no.
 */

import type { Money as Euro } from '../shared/money.js';
import type { CompanyAnalysis } from '../assessment/analyze.js';
import type { CoverageId } from '../coverage/taxonomy.js';
import type { PolizzaInEssere } from '../coverage/policy.js';
import type { CompanySize } from '../company/size.js';
import { haProceduraAperta } from '../company/profile.js';

export interface PolizzaSorvegliata {
  readonly coverage: CoverageId;
  readonly compagnia: string;
  readonly numeroPolizza: string | null;
  /** ISO 8601, solo data: le scadenze si ragionano a giorni, non a istanti. */
  readonly scadenza: string;
  readonly sommaAssicurata: Euro | null;
  readonly massimale: Euro | null;
}

export interface StatoSorvegliato {
  /** Momento in cui la fotografia è stata scattata. */
  readonly osservatoIl: string;

  readonly denominazione: string;
  readonly formaGiuridica: string;
  readonly attiva: boolean;
  readonly ateco: string | null;
  readonly indirizzoSedeLegale: string | null;
  readonly numeroUnitaLocali: number;

  readonly dimensione: CompanySize;
  readonly addetti: number | null;
  readonly fatturato: Euro | null;

  readonly annoUltimoBilancio: number | null;
  readonly patrimonioNetto: Euro | null;

  readonly scoreCredito: number;
  readonly classeCredito: string;
  readonly proceduraConcorsualeAperta: boolean;
  readonly eventiNegativiPresenti: boolean;

  readonly statoCatNat: 'non-soggetta' | 'in-scadenza' | 'inadempiente' | 'adempiente';

  /**
   * Capitali che l'analisi raccomanda oggi. Servono a rilevare la sottoassicurazione
   * **sopravvenuta**: la polizza non è cambiata, è cambiato il valore di ciò che protegge.
   */
  readonly capitaliRaccomandati: Readonly<Partial<Record<CoverageId, Euro>>>;

  readonly polizze: readonly PolizzaSorvegliata[];
}

/** Riduce un'analisi allo stato sorvegliato. Nessun calcolo nuovo: solo selezione. */
export function statoSorvegliato(
  analisi: CompanyAnalysis,
  polizze: readonly PolizzaInEssere[],
): StatoSorvegliato {
  const anagrafica = analisi.profile.anagrafica.value;
  const sede = anagrafica.sedeLegale;
  const negativi = analisi.profile.eventiNegativi?.value ?? null;

  const capitali: Partial<Record<CoverageId, Euro>> = {};
  for (const gap of analisi.gap.gaps) {
    const raccomandato = gap.capitaleRaccomandato.value;
    if (raccomandato !== null) capitali[gap.definition.id] = raccomandato;
  }

  return {
    osservatoIl: analisi.asOf.toISOString(),

    denominazione: analisi.facts.denominazione,
    formaGiuridica: anagrafica.formaGiuridicaDescrizione,
    attiva: anagrafica.statoAttivita === 'attiva',
    ateco: analisi.facts.ateco,
    indirizzoSedeLegale: sede === null ? null : `${sede.via} ${sede.civico ?? ''}, ${sede.comune}`.trim(),
    numeroUnitaLocali: analisi.profile.unitaLocali?.value.length ?? 0,

    dimensione: analisi.dimensione.value,
    addetti: analisi.facts.addetti,
    fatturato: analisi.facts.fatturato,

    annoUltimoBilancio: analisi.bilancio?.anno ?? null,
    patrimonioNetto: analisi.facts.patrimonioNetto,

    scoreCredito: analisi.sintesi.scoreCredito,
    classeCredito: analisi.sintesi.classeCredito,
    proceduraConcorsualeAperta: haProceduraAperta(analisi.profile),
    // `null` significa «non acquisiti», non «assenti»: senza il dato non si segnala nulla,
    // esattamente come lo score non regala punti per una sezione mai richiesta.
    eventiNegativiPresenti:
      negativi !== null && (negativi.protesti.length > 0 || negativi.pregiudizievoli.length > 0),

    statoCatNat: analisi.catNat.value.status,

    capitaliRaccomandati: capitali,

    polizze: polizze.map((p) => ({
      coverage: p.coverage,
      compagnia: p.compagnia,
      numeroPolizza: p.numeroPolizza,
      scadenza: p.dataScadenza.toISOString().slice(0, 10),
      sommaAssicurata: p.sommaAssicurata,
      massimale: p.massimale,
    })),
  };
}
