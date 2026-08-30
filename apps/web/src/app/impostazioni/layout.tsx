import { richiediSessione } from '@/lib/sessione';
// La scheda sa quale è aperta, e per saperlo deve girare nel browser: il nome locale
// resta `Scheda`, così le sette righe della navigazione si leggono come prima.
import { SchedaImpostazioni as Scheda } from './SchedaImpostazioni';

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

      {/*
        Le sette schede scorrono **dentro la loro riga**, non trascinando la pagina.

        A 390 pixel arrivavano a 603, e la pagina delle impostazioni scorreva in
        orizzontale di duecentotredici. Non si mandano a capo: una fila di schede su tre
        righe non si legge più come una fila di schede, e il bordo inferiore che le
        raccoglie perderebbe senso. Si scorre la riga, che è ciò che un telefono si
        aspetta da una barra di schede.
      */}
      <nav aria-label="Impostazioni" className="mb-8 flex gap-1 overflow-x-auto border-b border-bordo">
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
