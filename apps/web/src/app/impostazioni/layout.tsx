import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';

/**
 * Le impostazioni sono divise in due: ciò che riguarda **la propria** utenza, aperto a
 * tutti, e ciò che riguarda **lo studio**, riservato agli amministratori. La scheda
 * «Utenti» non compare a chi non può usarla: un comando visibile che risponde «vietato»
 * è peggio di un comando assente.
 */
export default async function LayoutImpostazioni({ children }: { children: React.ReactNode }) {
  const utente = await richiediSessione();
  const amministratore = utente.ruolo === 'amministratore';

  return (
    <>
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Impostazioni</h1>
      <p className="mb-6 text-sm text-testo-tenue">
        {utente.nome}
        {utente.email !== undefined && <span className="text-testo-debole"> · {utente.email}</span>}
        {utente.ruolo !== undefined && (
          <span className="text-testo-debole"> · {ETICHETTE_RUOLO[utente.ruolo] ?? utente.ruolo}</span>
        )}
      </p>

      <nav aria-label="Impostazioni" className="mb-8 flex gap-1 border-b border-bordo">
        <Scheda href="/impostazioni">Il tuo accesso</Scheda>
        {amministratore && <Scheda href="/impostazioni/studio">Anagrafica studio</Scheda>}
        {amministratore && <Scheda href="/impostazioni/utenti">Utenti dello studio</Scheda>}
        <Scheda href="/impostazioni/compagnie">Solidità delle compagnie</Scheda>
        {amministratore && <Scheda href="/impostazioni/servizi">Servizi dati</Scheda>}
      </nav>

      {children}
    </>
  );
}

const ETICHETTE_RUOLO: Record<string, string> = {
  amministratore: 'Amministratore',
  broker: 'Broker',
  assistente: 'Assistente',
  'sola-lettura': 'Sola lettura',
};

function Scheda({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-mb-px rounded-t border-b-2 border-transparent px-3 py-2 text-sm text-testo-tenue transition hover:border-bordo-forte hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      {children}
    </Link>
  );
}
