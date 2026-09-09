import type { AnalisiDto } from '@/lib/api';
import { annoDiNascitaDaCodiceFiscale } from '@aegis/core';

/**
 * Chi va verificato per l'adeguata verifica, e con quale anno di nascita.
 *
 * Sta in un modulo suo, senza `'use client'`, perché lo chiama la **pagina**, che è un
 * componente server. Viveva accanto al componente della schermata, e il collaudo su
 * browser lo ha rifiutato con «Attempted to call personeDaVerificare() from the server but
 * personeDaVerificare is on the client»: una funzione pura esportata da un modulo cliente
 * non è chiamabile dal server, per quanto pura sia.
 *
 * I titolari effettivi entrano per obbligo di legge; i rappresentanti legali perché sono
 * chi firma per l'impresa. L'anno di nascita si ricava dal codice fiscale quando c'è: è la
 * sola cosa che separa due omonimi, e senza di essa il massimo che il prodotto può dire su
 * un riscontro è «possibile».
 */
export interface PersonaDaVerificare {
  readonly nome: string;
  readonly ruolo: string;
  readonly annoNascita?: number;
}

export function personeDaVerificare(analisi: AnalisiDto, annoDiRiferimento: number): PersonaDaVerificare[] {
  const viste = new Set<string>();
  const elenco: PersonaDaVerificare[] = [];

  const aggiungi = (nome: string, ruolo: string, codiceFiscale: string | null): void => {
    const chiave = nome.trim().toLowerCase();
    if (chiave === '' || viste.has(chiave)) return;
    viste.add(chiave);
    const anno =
      codiceFiscale === null ? null : annoDiNascitaDaCodiceFiscale(codiceFiscale, annoDiRiferimento);
    elenco.push({ nome: nome.trim(), ruolo, ...(anno === null ? {} : { annoNascita: anno }) });
  };

  for (const t of analisi.titolareEffettivo.titolari) {
    aggiungi(t.nominativo, 'titolare effettivo', t.codiceFiscale);
  }
  for (const c of analisi.assetto.cariche) {
    if (!c.isRappresentanteLegale) continue;
    aggiungi(c.nominativo, 'rappresentante legale', c.codiceFiscale);
  }
  return elenco;
}
