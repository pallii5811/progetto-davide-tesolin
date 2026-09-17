import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * La pagina «Ricerca» non esiste più: «/» rinvia a «Ricerca Clienti».
 *
 * Tolta su richiesta di Simone del 13/09/2026. La ricerca per partita IVA vive dentro
 * «Ricerca Clienti», come sezione a parte. L'indirizzo resta, perché a «/» portano ancora
 * l'accesso, i segnalibri e i collegamenti già scritti.
 *
 * Si porta con sé soltanto `piva`, il parametro della ricerca per partita IVA: quella per
 * nome (`q`) è stata tolta il 17/09/2026. Non tutti: «Ricerca Clienti» ha un parametro che
 * SPENDE (`scarica=1`), e un rinvio che inoltrasse qualunque cosa trasformerebbe un
 * collegamento a «/» in un acquisto.
 */
export default async function Radice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const inoltrati = new URLSearchParams();
  for (const chiave of ['piva']) {
    const valore = parametri[chiave];
    if (typeof valore === 'string' && valore.trim() !== '') inoltrati.set(chiave, valore.trim());
  }
  const query = inoltrati.toString();
  redirect(query === '' ? '/prospect' : `/prospect?${query}#ricerca-azienda`);
}
