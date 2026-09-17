import { redirect } from 'next/navigation';
import { autenticazioneRichiesta, utenteCorrente } from '@/lib/api';
import { ModuloAccesso } from './ModuloAccesso';
import { accedi } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Accesso · Riskadvisor' };

export default async function PaginaAccesso({
  searchParams,
}: {
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { ritorno } = await searchParams;

  // Chi è già dentro non deve vedere la schermata di accesso: sarebbe solo un vicolo cieco.
  // A «Nuovi clienti» direttamente: «/» rinvia lì, e un rinvio in più è un passaggio che può fermarsi.
  if (!(await autenticazioneRichiesta())) redirect('/prospect');
  if ((await utenteCorrente()).autenticato) redirect('/prospect');

  return (
    <div className="mx-auto max-w-sm py-12">
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold tracking-tight text-marchio">Riskadvisor</p>
        <p className="mt-1 text-sm text-testo-tenue">Credit &amp; Insurance Risk Intelligence</p>
      </div>

      <div className="rounded-lg border border-bordo bg-superficie p-6">
        <h1 className="mb-1 text-lg font-semibold">Accesso</h1>
        <p className="mb-5 text-sm text-testo-tenue">
          Il CRM e i dati di intervista sono riservati al suo studio.
        </p>

        <ModuloAccesso azione={accedi} ritorno={ritorno ?? ''} />
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-testo-debole">
        Al primo avvio il servizio crea un utente amministratore e ne stampa la password nel terminale, una
        sola volta.
      </p>
    </div>
  );
}
