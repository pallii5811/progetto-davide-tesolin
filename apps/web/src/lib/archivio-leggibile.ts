/**
 * Tre valori dell'archivio che la scheda stampava come arrivavano, e che letti così ingannavano.
 *
 * Tutti e tre sulla scheda di GALENO S.R.L., poliambulatorio a Leno.
 */

/**
 * Il codice ATECO con i punti.
 *
 * Il registro manda il secondario come «821909». Nello stesso riquadro il primario si legge
 * «86.22.09», e un codice senza punti accanto a uno con i punti sembra un'altra cosa — un
 * numero di pratica, un codice interno. Si riformattano le sole cifre; qualunque altra forma
 * resta com'è arrivata.
 */
export function codiceAteco(grezzo: string | null): string | null {
  if (grezzo === null) return null;
  const cifre = grezzo.trim();
  if (!/^\d{2,6}$/.test(cifre)) return grezzo;
  return [cifre.slice(0, 2), cifre.slice(2, 4), cifre.slice(4, 6)].filter((p) => p !== '').join('.');
}

/** Più indirizzi di posta, separati come si scrive: «info@…, segreteria@…», non «info@…,segreteria@…». */
export function elencoIndirizzi(grezzo: string | null): string | null {
  if (grezzo === null) return null;
  const indirizzi = grezzo
    .split(/[,;]/)
    .map((i) => i.trim())
    .filter((i) => i !== '');
  return indirizzi.length === 0 ? null : indirizzi.join(', ');
}

/**
 * La copertura degli interessi netti, quando è negativa perché l'impresa guadagna sugli interessi.
 *
 * GALENO: «EBITDA su interessi netti −440» sotto il titolo «Sotto 1 gli interessi si mangiano il
 * margine». Con l'EBITDA positivo il rapporto è negativo perché lo sono gli interessi netti: gli
 * interessi attivi superano i passivi. È la situazione opposta a quella che il titolo descrive, e
 * il numero, letto contro la soglia, diceva il contrario del vero. Si prova sui numeri stampati
 * accanto: EBITDA 1.069.104 € diviso 66,66 fa 16.038 € di interessi passivi; diviso −440 fa
 * −2.430 € di interessi netti, cioè 18.468 € di interessi attivi.
 *
 * Con il margine negativo o ignoto il segno non si può leggere, e il numero resta com'è.
 */
export function coperturaSuInteressiNetti(
  rapporto: number | null | undefined,
  margine: number | null | undefined,
): string | null {
  if (rapporto === null || rapporto === undefined || rapporto >= 0) return null;
  if (margine === null || margine === undefined || margine <= 0) return null;
  return 'proventi finanziari netti: gli interessi attivi superano i passivi';
}
