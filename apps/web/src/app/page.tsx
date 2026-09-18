import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { INTESTAZIONE_VETRINA } from '@/lib/vetrina';
import { Vetrina } from './_vetrina/Vetrina';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AEGIS · Il rischio d’impresa per intermediari assicurativi',
  description:
    'Property Risk, Business Interruption e Cyber Risk delle imprese italiane, dal Registro Imprese e dagli indicatori ISPRA, per intermediari assicurativi.',
};

/**
 * La radice ha due facce, e a sceglierla è il middleware.
 *
 * Senza sessione è la **vetrina** (app/_vetrina): la pagina pubblica che presenta AEGIS,
 * richiesta da Simone il 18/09/2026. Il middleware lo segnala con INTESTAZIONE_VETRINA, che
 * scrive lui solo e toglie da ogni richiesta in arrivo.
 *
 * Con la sessione, come prima: la pagina «Ricerca» non esiste più e «/» rinvia a «Ricerca
 * Clienti». Tolta su richiesta di Simone del 13/09/2026. La ricerca per partita IVA vive dentro
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
  if ((await headers()).get(INTESTAZIONE_VETRINA) === '1') return <Vetrina />;

  const parametri = await searchParams;
  const inoltrati = new URLSearchParams();
  for (const chiave of ['piva']) {
    const valore = parametri[chiave];
    if (typeof valore === 'string' && valore.trim() !== '') inoltrati.set(chiave, valore.trim());
  }
  const query = inoltrati.toString();
  redirect(query === '' ? '/prospect' : `/prospect?${query}#ricerca-azienda`);
}
