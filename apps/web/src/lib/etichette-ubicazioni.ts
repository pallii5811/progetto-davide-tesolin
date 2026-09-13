/**
 * A quali ubicazioni si riferisce una riga del raggruppamento.
 *
 * «Un solo incendio, cosa raggiunge» elencava i motivi e basta. Su GALENO S.R.L. erano quattro
 * righe, tre identiche — «Coordinate non rilevate: l'ubicazione è contata come complesso a sé» —
 * e nessuna diceva quale ubicazione. Chi deve decidere dove fare il sopralluogo non poteva
 * collegare la riga all'indirizzo.
 *
 * Restituisce un'etichetta per ubicazione, non una frase unica. La prima versione le univa
 * con «·» davanti al motivo, e sull'azienda dimostrativa il controllo dei testi resi l'ha
 * trovata: due indirizzi della stessa via sulla stessa riga, e due due-punti di seguito
 * («…Adro (BS): 3 ubicazioni entro 200 m: …»). Una riga per ubicazione si legge, e non
 * ripete niente.
 */
export function etichetteDelGruppo(
  ids: readonly string[],
  elenco: readonly { id: string; etichetta: string }[],
): readonly string[] {
  return ids
    .map((id) => elenco.find((u) => u.id === id)?.etichetta)
    .filter((e): e is string => e !== undefined);
}
