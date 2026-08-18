/**
 * Provider dimostrativo.
 *
 * Non è un ripiego per i test: è ciò che consente di installare, avviare e mostrare
 * l'intera piattaforma **senza credenziali**. Un software che per essere visto richiede
 * prima un contratto con un fornitore di dati non viene mai visto.
 *
 * Genera profili coerenti e deterministici a partire dalla chiave di ricerca, così che
 * la stessa P.IVA restituisca sempre la stessa azienda.
 */

import { DATI_DICHIARATI_VUOTI, demoCompanyProfile, parsePartitaIva } from '@aegis/core';
import type { AtecoCode, CompanyProfile } from '@aegis/core';
import { ProviderError } from './port.js';
import type { CompanyDataProvider, CompanySearchResult, FetchLevel, SearchCriteria } from './port.js';

interface Variante {
  readonly denominazione: string;
  readonly partitaIva: string;
  readonly comune: string;
  readonly provincia: string;
  readonly ateco: string;
  readonly atecoDescrizione: string;
  readonly moltiplicatore: number;
  /**
   * Se `true`, il profilo arriva con i dati di intervista già rilevati.
   *
   * Serve a mostrare entrambi gli stati del prodotto: un cliente già lavorato, con
   * analisi al massimo dell'affidabilità, e due prospetti freschi con il questionario da
   * compilare. Un provider dimostrativo che pre-compila *tutto* nasconderebbe proprio la
   * funzione che distingue la piattaforma.
   */
  readonly conIntervista: boolean;
}

/** Piccolo catalogo di aziende dimostrative, con settori e territori diversi. */
const VARIANTI: readonly Variante[] = [
  {
    denominazione: 'MECCANICA BRESCIANA S.R.L.',
    partitaIva: '03158460174',
    comune: 'Adro',
    provincia: 'BS',
    ateco: '25.62.00',
    atecoDescrizione: 'Lavori di meccanica generale',
    moltiplicatore: 1,
    conIntervista: true,
  },
  {
    denominazione: 'COSTRUZIONI IRPINE S.R.L.',
    partitaIva: '02657870644',
    comune: 'Avellino',
    provincia: 'AV',
    ateco: '41.20.00',
    atecoDescrizione: 'Costruzione di edifici residenziali e non residenziali',
    moltiplicatore: 0.65,
    conIntervista: false,
  },
  {
    denominazione: 'ADRIATICA LOGISTICA S.R.L.',
    partitaIva: '02413390390',
    comune: 'Ravenna',
    provincia: 'RA',
    ateco: '52.10.10',
    atecoDescrizione: 'Magazzini di custodia e deposito',
    moltiplicatore: 1.4,
    conIntervista: false,
  },
];

export class MockCompanyProvider implements CompanyDataProvider {
  readonly name = 'Demo (dati dimostrativi)';

  // Nessun `async`: l'implementazione è sincrona e restituisce una promessa già risolta.
  // Marcarla `async` senza alcun `await` mentirebbe sul suo comportamento.
  search(criteria: SearchCriteria): Promise<readonly CompanySearchResult[]> {
    const termine = (criteria.denominazione ?? '').trim().toLowerCase();
    const piva = criteria.partitaIva === undefined ? null : parsePartitaIva(criteria.partitaIva);

    // P.IVA indicata ma non valida: nessun risultato, non "tutti i risultati".
    if (criteria.partitaIva !== undefined && piva === null) return Promise.resolve([]);

    const risultati = VARIANTI.filter((v) => {
      if (piva !== null) return v.partitaIva === piva;
      if (criteria.provincia !== undefined && v.provincia !== criteria.provincia.toUpperCase())
        return false;
      if (termine === '') return true;
      return v.denominazione.toLowerCase().includes(termine);
    });

    return Promise.resolve(
      risultati.map((v) => ({
        partitaIva: parsePartitaIva(v.partitaIva),
        denominazione: v.denominazione,
        comune: v.comune,
        provincia: v.provincia,
        ateco: v.ateco,
        attiva: true,
        statoAttivita: 'attiva' as const,
        providerId: v.partitaIva,
      })),
    );
  }

  fetchProfile(identifier: string, level: FetchLevel): Promise<CompanyProfile> {
    const normalizzato = identifier.replace(/\s/g, '');
    const variante = VARIANTI.find((v) => v.partitaIva === normalizzato) ?? VARIANTI[0]!;

    const base = demoCompanyProfile();
    const conVariante = applicaVariante(base, variante);

    // I dati di intervista non vengono mai da un provider: sono il lavoro dell'intermediario.
    const profilo = variante.conIntervista
      ? conVariante
      : { ...conVariante, datiDichiarati: DATI_DICHIARATI_VUOTI };

    if (level === 'base') {
      return Promise.resolve({
        ...profilo,
        assetti: null,
        bilanci: [],
        bilanciSintetici: [],
        eventiNegativi: null,
        unitaLocali: null,
      });
    }
    // Come il provider reale: al livello esteso arrivano i bilanci sintetici, non quelli
    // in schema CEE, che sono un prodotto a parte.
    if (level === 'esteso') {
      return Promise.resolve({ ...profilo, bilanci: [], eventiNegativi: null });
    }
    return Promise.resolve(profilo);
  }
}

function applicaVariante(base: CompanyProfile, variante: Variante): CompanyProfile {
  if (variante.moltiplicatore === 1) {
    return base;
  }

  const scala = (value: number): number => Math.round(value * variante.moltiplicatore);

  return {
    ...base,
    identity: {
      ...base.identity,
      denominazione: variante.denominazione,
      partitaIva: parsePartitaIva(variante.partitaIva),
    },
    anagrafica: {
      ...base.anagrafica,
      value: {
        ...base.anagrafica.value,
        atecoPrimario: parseAtecoOrThrow(variante.ateco),
        atecoPrimarioDescrizione: variante.atecoDescrizione,
        numeroAddetti: scala(base.anagrafica.value.numeroAddetti ?? 30),
        sedeLegale:
          base.anagrafica.value.sedeLegale === null
            ? null
            : {
                ...base.anagrafica.value.sedeLegale,
                comune: variante.comune,
                provincia: variante.provincia,
              },
      },
    },
    bilanci: base.bilanci.map((b) => ({
      ...b,
      value: {
        ...b.value,
        contoEconomico: scalaOggetto(b.value.contoEconomico, variante.moltiplicatore),
        attivo: scalaOggetto(b.value.attivo, variante.moltiplicatore),
        passivo: scalaOggetto(b.value.passivo, variante.moltiplicatore),
      },
    })),
  };
}

/** Scala tutte le voci monetarie mantenendo la quadratura del bilancio. */
function scalaOggetto<T extends object>(source: T, fattore: number): T {
  const out: Record<string, unknown> = {};
  for (const [chiave, valore] of Object.entries(source)) {
    out[chiave] = typeof valore === 'number' ? Math.round(valore * fattore) : valore;
  }
  return out as T;
}

function parseAtecoOrThrow(code: string): AtecoCode {
  if (!/^\d{2}(\.\d{2}){0,2}$/.test(code)) {
    throw new ProviderError(`Codice ATECO dimostrativo non valido: ${code}`, 'risposta-non-valida');
  }
  return code as AtecoCode;
}
