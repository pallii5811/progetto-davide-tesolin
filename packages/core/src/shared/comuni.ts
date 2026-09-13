/**
 * I comuni italiani, e come si trova quello che una persona sta scrivendo.
 *
 * Serve alla ricerca di nuovi clienti, dove la città è l'unico filtro obbligatorio. Il
 * fornitore filtra per comune con il **codice catastale** (`townCode`, per esempio `B157`
 * per Brescia), non con il nome: i nomi non sono unici — Livo esiste in provincia di Como e
 * in quella di Trento — e si scrivono in più modi. Il codice catastale identifica un
 * comune e uno solo, e non cambia quando una provincia viene riordinata.
 *
 * I dati stanno in `comuni-italiani-dati.ts`, generato dall'elenco ISTAT: qui c'è solo la
 * logica, perché sia leggibile e si possa mettere alla prova.
 */

import { FONTE_COMUNI, RIGHE_COMUNI } from './comuni-italiani-dati.js';

export { FONTE_COMUNI };

export interface ComuneItaliano {
  readonly nome: string;
  /** Sigla automobilistica della provincia, es. `BS`. */
  readonly sigla: string;
  /** Codice catastale (Belfiore), es. `B157`: la chiave con cui il fornitore filtra. */
  readonly codiceCatastale: string;
  /** Denominazione ufficiale nell'altra lingua, dove esiste: `Bozen` per Bolzano. */
  readonly nomeAltraLingua: string | null;
}

export const COMUNI_ITALIANI: readonly ComuneItaliano[] = RIGHE_COMUNI.map(
  ([nome, sigla, codiceCatastale, altraLingua]) => ({
    nome,
    sigla,
    codiceCatastale,
    nomeAltraLingua: altraLingua ?? null,
  }),
);

const PER_CODICE: ReadonlyMap<string, ComuneItaliano> = new Map(
  COMUNI_ITALIANI.map((comune) => [comune.codiceCatastale, comune]),
);

/** Il comune di quel codice catastale, o `null` se il codice non esiste. */
export function comunePerCodiceCatastale(codice: string | null | undefined): ComuneItaliano | null {
  if (codice === null || codice === undefined) return null;
  return PER_CODICE.get(codice.trim().toUpperCase()) ?? null;
}

/**
 * Come si scrive un comune a una persona: sempre con la sigla.
 *
 * Senza, le cinque coppie di omonimi — Samone, Livo, Peglio, Castro, San Teodoro — sarebbero
 * due righe identiche nel selettore, e scegliere quella giusta diventerebbe un tiro a sorte.
 */
export function etichettaComune(comune: ComuneItaliano): string {
  return `${comune.nome} (${comune.sigla})`;
}

/**
 * Il testo ridotto a ciò che conta per confrontarlo: niente accenti, maiuscole, apostrofi,
 * trattini o parentesi.
 *
 * Chi cerca Forlì scrive «forli», chi cerca Sant'Angelo scrive «sant angelo» o
 * «santangelo»: tutte forme dello stesso nome, e nessuna deve restare senza risposta.
 */
export function normalizzaNomeComune(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface ComuneIndicizzato {
  readonly comune: ComuneItaliano;
  /** Nome, nome nell'altra lingua ed etichetta con la sigla, normalizzati. */
  readonly chiavi: readonly string[];
  readonly compatte: readonly string[];
  readonly parole: readonly string[];
  readonly etichetta: string;
}

let indice: readonly ComuneIndicizzato[] | null = null;

/**
 * L'indice si costruisce alla prima ricerca, non al caricamento del modulo: chi apre la
 * pagina senza toccare il campo della città non deve pagare ottomila normalizzazioni.
 */
function indiceDeiComuni(): readonly ComuneIndicizzato[] {
  indice ??= COMUNI_ITALIANI.map((comune) => {
    const nomi = [comune.nome, ...(comune.nomeAltraLingua === null ? [] : [comune.nomeAltraLingua])].map(
      normalizzaNomeComune,
    );
    const etichetta = normalizzaNomeComune(etichettaComune(comune));
    const chiavi = [...nomi, etichetta];
    return {
      comune,
      chiavi,
      compatte: chiavi.map((c) => c.replaceAll(' ', '')),
      parole: nomi.flatMap((n) => n.split(' ')),
      etichetta,
    };
  });
  return indice;
}

/**
 * I comuni che corrispondono a ciò che si sta scrivendo, dal più probabile.
 *
 * L'ordine è quello in cui una persona se li aspetta:
 * 1. il nome scritto per intero — «roma» dà Roma prima di Romano di Lombardia;
 * 2. i nomi che cominciano così;
 * 3. i nomi in cui una parola comincia così — «emilia» trova Reggio nell'Emilia;
 * 4. i nomi che lo contengono, anche senza spazi e apostrofi.
 *
 * A parità, il nome più corto prima, poi l'ordine alfabetico: è stabile, quindi la stessa
 * ricerca dà sempre lo stesso elenco.
 */
export function cercaComuni(testo: string, massimo = 10): readonly ComuneItaliano[] {
  const cercato = normalizzaNomeComune(testo);
  if (cercato === '' || massimo <= 0) return [];
  const compatto = cercato.replaceAll(' ', '');

  const trovati: { voce: ComuneIndicizzato; grado: number }[] = [];
  for (const voce of indiceDeiComuni()) {
    let grado: number;
    if (voce.chiavi.includes(cercato) || voce.compatte.includes(compatto)) grado = 0;
    else if (voce.chiavi.some((c) => c.startsWith(cercato))) grado = 1;
    else if (voce.parole.some((p) => p.startsWith(cercato))) grado = 2;
    else if (voce.compatte.some((c) => c.includes(compatto))) grado = 3;
    else continue;
    trovati.push({ voce, grado });
  }

  trovati.sort(
    (a, b) =>
      a.grado - b.grado ||
      a.voce.comune.nome.length - b.voce.comune.nome.length ||
      a.voce.comune.nome.localeCompare(b.voce.comune.nome, 'it') ||
      a.voce.comune.sigla.localeCompare(b.voce.comune.sigla, 'it'),
  );

  return trovati.slice(0, massimo).map((t) => t.voce.comune);
}

/**
 * Il comune che il testo indica **senza ambiguità**, o `null`.
 *
 * Vale l'etichetta completa («Livo (TN)») oppure un nome che appartiene a un comune solo
 * («brescia», «Forli»). Un nome condiviso da due comuni non indica nessuno dei due: si
 * sceglie dall'elenco, non si indovina — cercare le aziende di Livo in provincia di Como
 * credendo di cercare quelle di Trento è un elenco pagato per niente.
 */
export function comuneDaTesto(testo: string): ComuneItaliano | null {
  const cercato = normalizzaNomeComune(testo);
  if (cercato === '') return null;

  const perEtichetta = indiceDeiComuni().filter((v) => v.etichetta === cercato);
  if (perEtichetta.length === 1) return perEtichetta[0]?.comune ?? null;

  const perNome = indiceDeiComuni().filter((v) => v.chiavi.includes(cercato));
  return perNome.length === 1 ? (perNome[0]?.comune ?? null) : null;
}
