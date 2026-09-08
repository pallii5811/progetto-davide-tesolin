import type { CandidatoDiRiscontro } from '@aegis/core';
import { listeDaiTag } from '@aegis/core';

/**
 * Traduce la risposta del servizio di adeguata verifica in candidati leggibili.
 *
 * La forma non è dedotta dalla documentazione — che di questo endpoint non pubblica lo
 * schema — ma da **una chiamata vera**, autorizzata dal proprietario e registrata in
 * `.sonda/prod-WW-kyc-full-prova-schema.json`. Da quel momento tutto il resto si prova
 * offline, senza spendere: è la stessa disciplina degli altri servizi.
 *
 * Quella chiamata ha insegnato la cosa che conta più dello schema. Cercando un nome sono
 * tornate **due persone diverse**: una nata nel 1952, in liste di sanzioni e politicamente
 * esposta, e una con anni di nascita dedotti fra il 1977 e il 1979, presente solo nella
 * stampa avversa. La fonte non risponde «è lui»: propone candidati, e distinguerli è
 * lavoro dell'intermediario davanti al documento. Qui si traduce, non si conclude.
 */

/** La forma minima che serve leggere. Il resto della risposta si ignora di proposito. */
interface RispostaKyc {
  readonly data?: {
    readonly state?: string;
    readonly entities?: readonly EntitaKyc[];
  };
}

interface EntitaKyc {
  readonly id?: string;
  readonly entity_type?: string;
  readonly tags?: readonly string[];
  readonly names?: readonly {
    readonly full_name?: string;
    readonly first_name?: string;
    readonly last_name?: string;
    readonly primary?: boolean;
  }[];
  readonly birth_dates?: readonly {
    readonly year?: number | null;
    readonly inferred?: boolean;
  }[];
  readonly nationalities?: readonly string[];
  readonly locations?: readonly { readonly country?: string | null }[];
  readonly codes?: readonly { readonly type?: string; readonly value?: string }[];
  readonly last_update?: Readonly<Record<string, string>>;
}

/** Le autorità dietro i codici, per poterle citare nel fascicolo invece di stampare una sigla. */
const AUTORITA: Readonly<Record<string, string>> = {
  ofac_id: 'OFAC (Stati Uniti)',
  eu_id: 'Unione europea',
  un_id: 'Nazioni Unite',
  fcdo_id: 'Regno Unito (FCDO)',
  seco_id: 'Svizzera (SECO)',
};

/**
 * Un nome leggibile da ogni forma in cui la fonte lo scrive.
 *
 * Le voci arrivano in tre modi: `full_name` pieno con i due campi vuoti, oppure
 * `first_name`/`last_name` pieni con `full_name` vuoto, oppure entrambi. Prendere solo il
 * primo perderebbe proprio la voce primaria, che nel campione provato è quella scomposta.
 */
function nomeLeggibile(n: NonNullable<EntitaKyc['names']>[number]): string {
  const pieno = (n.full_name ?? '').trim();
  if (pieno !== '') return pieno;
  return [n.first_name ?? '', n.last_name ?? '']
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

export function mappaCandidati(risposta: unknown): readonly CandidatoDiRiscontro[] {
  const dati = (risposta as RispostaKyc | null)?.data;
  if (dati === undefined) return [];

  /*
    Lo stato conta: il servizio può rispondere prima di aver finito. Un elenco vuoto con
    stato diverso da COMPLETED significa «non ho ancora guardato», che non è «non c'è
    niente» — ed è la regola 3 del progetto, sulla fonte che non ha risposto.
  */
  if ((dati.state ?? '') !== 'COMPLETED') return [];

  return (dati.entities ?? []).map((e): CandidatoDiRiscontro => {
    const nomi = (e.names ?? []).map(nomeLeggibile).filter((n) => n !== '');
    const anni = (e.birth_dates ?? [])
      .filter((b): b is { year: number; inferred?: boolean } => typeof b.year === 'number')
      .map((b) => ({ anno: b.year, dedotto: b.inferred === true }));

    return {
      identificativo: e.id ?? '',
      // «I» è una persona fisica, «O» un ente: cambia chi va identificato e con quale
      // documento, e il fascicolo lo deve dire.
      tipo: e.entity_type === 'O' ? 'ente' : 'persona',
      // Senza duplicati: la stessa persona torna con sei translitterazioni dello stesso nome.
      nomi: [...new Set(nomi)],
      anniDiNascita: anni,
      nazionalita: [...new Set(e.nationalities ?? [])],
      paesi: [...new Set((e.locations ?? []).map((l) => (l.country ?? '').trim()).filter((c) => c !== ''))],
      liste: listeDaiTag(e.tags ?? []),
      riferimenti: (e.codes ?? [])
        .filter((c) => typeof c.type === 'string' && typeof c.value === 'string')
        .map((c) => ({ autorita: AUTORITA[c.type!] ?? c.type!, codice: c.value! })),
      // La data più recente fra quelle che la fonte dichiara per quel soggetto.
      aggiornatoIl:
        Object.values(e.last_update ?? {})
          .filter((v) => typeof v === 'string' && v !== '')
          .sort()
          .pop() ?? null,
    };
  });
}

/** Il corpo della domanda. `query` è un oggetto: una stringa viene rifiutata con un 406. */
export function corpoRichiesta(nome: string, annoDiNascita?: number): unknown {
  return {
    query: {
      name: nome,
      // I campi separati esistono ma la fonte li accetta nulli: si manda ciò che si sa.
      firstName: null,
      lastName: null,
      birthDate: annoDiNascita === undefined ? null : `${annoDiNascita}`,
      entityType: null,
      removeDeceased: null,
    },
  };
}
