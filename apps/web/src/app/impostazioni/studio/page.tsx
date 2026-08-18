import { redirect } from 'next/navigation';
import { richiediSessione } from '@/lib/sessione';
import { leggiStudio } from '@/lib/api';
import type { DatiStudio } from '@/lib/api';
import { Scheda } from '@/components/ui';
import { ModuloStudio } from './ModuloStudio';

export const dynamic = 'force-dynamic';

/**
 * Anagrafica dello studio.
 *
 * Riservata all'amministratore, e non solo per gerarchia: il numero di iscrizione al RUI
 * finisce su ogni documento consegnato ai contraenti, e un errore lì è un errore su tutti
 * i fascicoli prodotti da quel momento in poi.
 */
export default async function PaginaStudio() {
  const utente = await richiediSessione();
  if (utente.ruolo !== 'amministratore') redirect('/impostazioni');

  const risposta = await leggiStudio().catch(() => null);
  const studio: DatiStudio | null =
    risposta === null || 'errore' in risposta ? null : risposta;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Anagrafica dello studio</h2>
        <p className="mb-4 text-sm leading-relaxed text-testo-tenue">
          Intesta i report consegnati ai clienti. Finché non è compilata, il documento esce
          senza intestazione.
        </p>
        <ModuloStudio studio={studio} />
      </section>

      <Scheda className="h-fit text-sm leading-relaxed text-testo-tenue">
        <p className="font-medium text-testo">Perché serve</p>
        <ul className="mt-2 space-y-1.5">
          <li>
            Il report è un documento <strong>dello studio</strong>, non dell&apos;attrezzo con cui
            è stato scritto: chi lo riceve deve sapere chi lo ha redatto.
          </li>
          <li>
            Il Reg. IVASS 40/2018 richiede che i documenti consegnati al contraente
            identifichino l&apos;intermediario e la sua iscrizione al RUI.
          </li>
          <li>
            I dati valgono per l&apos;intero studio: ogni collaboratore che stampa un report
            usa questa intestazione.
          </li>
        </ul>
      </Scheda>
    </div>
  );
}
