import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * La pagina «Ricerca» non esiste più: «/» rinvia a «Nuovi clienti».
 *
 * Tolta su richiesta di Simone del 13/09/2026. La ricerca per partita IVA vive dentro
 * «Nuovi clienti», come sezione a parte. L'indirizzo resta, perché a «/» portano ancora
 * l'accesso, i segnalibri e i collegamenti già scritti.
 *
 * Si portano con sé soltanto `q` e `piva`, i due parametri della ricerca per nome e per
 * partita IVA. Non tutti: «Nuovi clienti» ha un parametro che SPENDE (`scarica=1`), e un
 * rinvio che inoltrasse qualunque cosa trasformerebbe un collegamento a «/» in un acquisto.
 */
export default async function Radice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const inoltrati = new URLSearchParams();
  for (const chiave of ['q', 'piva']) {
    const valore = parametri[chiave];
    if (typeof valore === 'string' && valore.trim() !== '') inoltrati.set(chiave, valore.trim());
  }
  const query = inoltrati.toString();
  redirect(query === '' ? '/prospect' : `/prospect?${query}#ricerca-azienda`);
}
