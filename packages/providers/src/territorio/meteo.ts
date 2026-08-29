/**
 * Dieci anni di eventi atmosferici sul punto dell'ubicazione.
 *
 * Serve a togliere una discussione dal terreno delle impressioni. «Qui non è mai successo
 * niente» è la frase con cui si rinuncia a una garanzia allagamento, ed è spesso vera solo
 * perché nessuno ha guardato: *sette anni su dieci con almeno un giorno oltre i cinquanta
 * millimetri* è un fatto, e cambia la conversazione.
 *
 * ## La fonte, e i suoi due limiti
 *
 * **Open-Meteo**, archivio di rianalisi ERA5. Non richiede chiave, copre dal 1940, ha
 * risoluzione oraria e giornaliera.
 *
 * **Primo limite: non copre grandine né fulmini.** Sono due dei quattro fenomeni che un
 * assicuratore vorrebbe, e la grandine è quello che produce più sinistri sui capannoni. Il
 * dato che manca viene **dichiarato nel risultato** e stampato nel report: un capitolo
 * intitolato «storico degli eventi atmosferici» che tace di non contenerli farebbe
 * concludere che su quel punto non ne siano mai caduti.
 *
 * **Secondo limite: la licenza.** L'uso è gratuito per scopi non commerciali; un prodotto
 * venduto richiede un abbonamento. Per questo la raccolta è **spenta di default** e si
 * accende da configurazione — chi la accende sa cosa sta accettando. È anche il motivo per
 * cui l'indirizzo di base è configurabile: con l'abbonamento cambia dominio.
 *
 * ## Perché soglie e non medie
 *
 * Una media di precipitazione annua non dice niente a chi assicura: il danno lo fa
 * l'evento singolo. Contano quante volte si è superata una soglia, in quanti anni distinti
 * è successo, e qual è stato il valore peggiore — che è anche l'unico modo onesto di dare
 * una probabilità empirica senza costruire un modello che non abbiamo.
 */

import type { Cache } from '../http.js';
import type { StoricoMeteo, SogliaSuperata } from '@aegis/core';
import { FUSO_ORARIO } from '@aegis/core/tempo';

const OPEN_METEO_PREDEFINITO = 'https://archive-api.open-meteo.com/v1/archive';

/** Dieci anni: abbastanza per contare gli anni con evento, e non troppo per il servizio. */
const ANNI_DI_STORIA = 10;

/**
 * Le soglie, scelte per quello che significano in polizza e non per eleganza statistica.
 *
 *  - **50 mm di pioggia in un giorno** è la soglia oltre la quale la rete di scolo urbana
 *    va in crisi: è il livello a cui gli allagamenti da fognatura diventano probabili.
 *  - **100 mm** è l'evento che i piani di protezione civile trattano come eccezionale.
 *  - **75 km/h di raffica** è il vento che scoperchia i pannelli di copertura e ribalta le
 *    scaffalature esterne; sopra i 100 km/h si parla di danni strutturali.
 */
const SOGLIE = [
  { campo: 'pioggia', valore: 50, descrizione: 'Pioggia oltre 50 mm in un giorno', unita: 'mm' },
  { campo: 'pioggia', valore: 100, descrizione: 'Pioggia oltre 100 mm in un giorno', unita: 'mm' },
  { campo: 'raffica', valore: 75, descrizione: 'Raffiche oltre 75 km/h', unita: 'km/h' },
  { campo: 'raffica', valore: 100, descrizione: 'Raffiche oltre 100 km/h', unita: 'km/h' },
] as const;

const NON_COPERTI = [
  'grandine (nessun archivio pubblico gratuito con copertura italiana)',
  'fulminazioni (dato commerciale, reti di rilevamento private)',
];

export interface MeteoOptions {
  readonly baseUrl?: string | undefined;
  readonly cache?: Cache | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
  /** Data di riferimento: iniettabile perché una prova non deve invecchiare. */
  readonly oggi?: Date | undefined;
}

const TTL_SECONDI = 30 * 24 * 60 * 60;

interface RispostaOpenMeteo {
  readonly daily?: {
    readonly time?: readonly string[];
    readonly precipitation_sum?: readonly (number | null)[];
    readonly wind_gusts_10m_max?: readonly (number | null)[];
  };
}

/**
 * Legge lo storico e lo riduce a poche soglie.
 *
 * **Non solleva**: come il resto del contesto territoriale, è un arricchimento. Una fonte
 * lenta o assente costa una sezione, mai il documento.
 */
export async function leggiStoricoMeteo(
  latitudine: number,
  longitudine: number,
  options: MeteoOptions = {},
): Promise<StoricoMeteo | null> {
  const richiesta = options.fetchImpl ?? fetch;
  const oggi = options.oggi ?? new Date();

  /*
    L'archivio di rianalisi è pubblicato con qualche giorno di ritardo: chiedere fino a
    ieri restituirebbe una coda di valori nulli. Cinque giorni indietro è il margine che
    evita di scambiare un ritardo di pubblicazione per una serie di giorni asciutti.
  */
  const fine = new Date(oggi.getTime() - 5 * 86_400_000);
  const inizio = new Date(fine.getTime() - ANNI_DI_STORIA * 365.25 * 86_400_000);
  const dal = giorno(inizio);
  const al = giorno(fine);

  const chiave = `meteo:${latitudine.toFixed(3)}:${longitudine.toFixed(3)}:${al}`;
  const memorizzato = await options.cache?.get(chiave);
  if (memorizzato !== undefined && memorizzato.expiresAt > Date.now()) {
    return memorizzato.value as StoricoMeteo;
  }

  const url =
    `${options.baseUrl ?? OPEN_METEO_PREDEFINITO}` +
    `?latitude=${latitudine.toFixed(4)}&longitude=${longitudine.toFixed(4)}` +
    `&start_date=${dal}&end_date=${al}` +
    `&daily=precipitation_sum,wind_gusts_10m_max&timezone=${encodeURIComponent(FUSO_ORARIO)}`;

  try {
    const risposta = await richiesta(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
    if (!risposta.ok) return null;

    const dati = (await risposta.json()) as RispostaOpenMeteo;
    const storico = riduci(dati, dal, al);
    if (storico === null) return null;

    await options.cache?.set(chiave, { value: storico, expiresAt: Date.now() + TTL_SECONDI * 1000 });
    return storico;
  } catch {
    return null;
  }
}

function riduci(dati: RispostaOpenMeteo, dal: string, al: string): StoricoMeteo | null {
  /*
    Il controllo è su `undefined`, non con `Array.isArray`.

    Su un tipo già dichiarato `readonly string[] | undefined`, `Array.isArray` allarga la
    variabile ad `any[]` invece di restringerla: si perdono i tipi proprio nel punto in cui
    si sta leggendo una risposta esterna, che è dove servono di più.
  */
  const giorni = dati.daily?.time;
  if (giorni === undefined || giorni.length === 0) return null;

  const pioggia = dati.daily?.precipitation_sum ?? [];
  const raffica = dati.daily?.wind_gusts_10m_max ?? [];

  const soglie: SogliaSuperata[] = [];

  for (const s of SOGLIE) {
    const serie = s.campo === 'pioggia' ? pioggia : raffica;
    const anniConEvento = new Set<string>();
    let conteggio = 0;
    let massimo = 0;

    for (let i = 0; i < giorni.length; i++) {
      const valore = serie[i];
      // `null` è un giorno senza misura, non un giorno a zero: saltarlo è l'unico modo di
      // non trasformare una lacuna dell'archivio in un'assenza di eventi.
      if (typeof valore !== 'number') continue;

      if (valore > massimo) massimo = valore;
      if (valore >= s.valore) {
        conteggio += 1;
        anniConEvento.add(giorni[i]?.slice(0, 4) ?? '');
      }
    }

    soglie.push({
      descrizione: s.descrizione,
      giorni: conteggio,
      anniConEvento: anniConEvento.size,
      massimo: `${Math.round(massimo * 10) / 10} ${s.unita}`,
    });
  }

  return {
    anni: ANNI_DI_STORIA,
    dal,
    al,
    soglie,
    fonte: 'Open-Meteo · rianalisi ERA5',
    fenomeniNonCoperti: NON_COPERTI,
  };
}

function giorno(d: Date): string {
  return d.toISOString().slice(0, 10);
}
