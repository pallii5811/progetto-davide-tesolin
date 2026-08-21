import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';

/**
 * Le impostazioni sono divise in tre.
 *
 * Ciò che riguarda **la propria utenza** è aperto a tutti. Ciò che riguarda **lo studio**
 * è degli amministratori. Ciò che riguarda **la piattaforma** — gli studi ospitati, la
 * fornitura dei dati — è solo di chi la gestisce, ed è una proprietà diversa dal ruolo:
 * essere amministratore del proprio studio non dà alcun titolo sull'infrastruttura.
 *
 * Le schede che non si possono usare non compaiono: un comando visibile che risponde
 * «vietato» è peggio di un comando assente. Ma nascondere non è proteggere — le rotte
 * corrispondenti rifiutano per conto proprio, e questo è il secondo strato.
 */
export default async function LayoutImpostazioni({ children }: { children: React.ReactNode }) {
  const utente = await richiediSessione();
  const amministratore = utente.ruolo === 'amministratore';
  const gestore = utente.gestorePiattaforma === true;

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
        {gestore && <Scheda href="/impostazioni/studi">Studi sulla piattaforma</Scheda>}
        <Scheda href="/impostazioni/costi">Consumi dei dati</Scheda>
        {gestore && <Scheda href="/impostazioni/servizi">Servizi dati</Scheda>}
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
