/**
 * Quali servizi il token è autorizzato a chiamare.
 *
 * I token di OpenAPI.com sono **per scope, non per account**: avere credito non basta, il
 * singolo servizio va autorizzato dalla console. Un `401 Wrong Token` su un servizio e un
 * `200` su un altro, con lo stesso identico token, è la norma — non un guasto. Chi non lo
 * sa passa il pomeriggio a controllare la chiave.
 *
 * Il costo di questa verifica è **zero**, e non per fortuna: si sonda con una partita IVA
 * formalmente valida ma non attribuita a nessuno. Il rifiuto per scope mancante arriva
 * prima di ogni lavorazione, e un'anagrafica inesistente non viene fatturata. Qualunque
 * risposta diversa da 401 dimostra quindi che l'autorizzazione c'è, senza aver comprato
 * nulla per scoprirlo.
 */

import type { OpenApiConfig, ServiceConfig } from './config.js';

/** P.IVA formalmente valida ma non attribuita: nessuna lavorazione, nessun addebito. */
const IDENTIFICATIVO_INESISTENTE = '00000000000';

export type StatoAutorizzazione = 'autorizzato' | 'non-autorizzato' | 'non-raggiungibile';

export interface EsitoAutorizzazione {
  readonly chiave: string;
  readonly descrizione: string;
  readonly scope: string;
  readonly costoCentesimi: number;
  readonly stato: StatoAutorizzazione;
  readonly dettaglio: string;
}

export interface OpzioniDiagnostica {
  readonly token: string;
  readonly config: OpenApiConfig;
  readonly fetchImpl?: typeof fetch | undefined;
}

async function verifica(
  chiave: string,
  servizio: ServiceConfig,
  baseUrl: string,
  opzioni: OpzioniDiagnostica,
): Promise<EsitoAutorizzazione> {
  const comune = {
    chiave,
    descrizione: servizio.descrizione,
    scope: servizio.scope,
    costoCentesimi: servizio.costoCentesimi,
  };

  const url = `${baseUrl}${servizio.path.replace('{id}', IDENTIFICATIVO_INESISTENTE)}`;
  const esegui = opzioni.fetchImpl ?? globalThis.fetch;

  try {
    const risposta = await esegui(url, {
      headers: { Authorization: `Bearer ${opzioni.token}`, Accept: 'application/json' },
    });

    if (risposta.status === 401 || risposta.status === 403) {
      return {
        ...comune,
        stato: 'non-autorizzato',
        dettaglio: `Il token non comprende lo scope «${servizio.scope}»`,
      };
    }

    return {
      ...comune,
      stato: 'autorizzato',
      dettaglio: `Scope «${servizio.scope}» attivo`,
    };
  } catch (errore) {
    return {
      ...comune,
      stato: 'non-raggiungibile',
      dettaglio: errore instanceof Error ? errore.message : 'Errore di rete',
    };
  }
}

/**
 * Verifica tutti i servizi che l'analisi userebbe.
 *
 * L'ordine dell'elenco è quello del valore per chi analizza, non quello alfabetico: chi
 * legge deve capire in un colpo d'occhio cosa ha e cosa gli manca.
 */
export async function verificaAutorizzazioni(
  opzioni: OpzioniDiagnostica,
): Promise<readonly EsitoAutorizzazione[]> {
  const s = opzioni.config.services;

  const daVerificare: readonly (readonly [string, ServiceConfig, string])[] = [
    ['anagraficaBase', s.anagraficaBase, opzioni.config.baseUrlCompany],
    ['anagraficaEstesa', s.anagraficaEstesa, opzioni.config.baseUrlCompany],
    ['profiloCompleto', s.profiloCompleto, opzioni.config.baseUrlCompany],
    ['eventiNegativi', s.eventiNegativi, opzioni.config.baseUrlRisk],
    ['bilancioDettagliato', s.bilancioDettagliato, opzioni.config.baseUrlCompany],
  ];

  return Promise.all(
    daVerificare.map(([chiave, servizio, baseUrl]) => verifica(chiave, servizio, baseUrl, opzioni)),
  );
}
