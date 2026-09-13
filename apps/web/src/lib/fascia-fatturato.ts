/**
 * La fascia di fatturato come la legge un intermediario.
 *
 * L'archivio la manda come «1000000 - 4999999», e la scheda la stampava così: sette cifre
 * senza separatori e senza valuta, in un riquadro dove ogni altro importo è scritto
 * «4.020.193 €». Si riformatta solo la forma riconosciuta — due interi separati da un
 * trattino — e qualunque altra resta com'è arrivata: una fascia reinterpretata male è
 * peggio di una fascia scritta brutta.
 */
export function fasciaDiFatturato(testo: string | null): string | null {
  if (testo === null) return null;
  const estremi = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(testo);
  if (estremi === null) return testo;
  const euro = (cifre: string): string => `${new Intl.NumberFormat('it-IT').format(Number(cifre))} €`;
  return `da ${euro(estremi[1] ?? '')} a ${euro(estremi[2] ?? '')}`;
}
