import { redirect } from 'next/navigation';
import { richiediSessione } from '@/lib/sessione';
import { compagnieCensite } from '@/lib/api';
import type { SoliditaCompagnia } from '@/lib/api';
import { Avviso, Scheda, Spiegazione } from '@/components/ui';
import { ModuloCompagnia } from './ModuloCompagnia';

export const dynamic = 'force-dynamic';

/**
 * Solidità delle compagnie — il rischio di controparte.
 *
 * È il punto cieco della consulenza assicurativa italiana: si analizza minuziosamente il
 * rischio del cliente e poi lo si trasferisce a un soggetto la cui solidità nessuno ha
 * guardato. Una polizza è una promessa di pagamento futura, e vale quanto vale chi la
 * sottoscrive.
 *
 * I dati si inseriscono a mano dalla **SFCR**, la relazione che la direttiva Solvency II
 * impone a ogni compagnia di pubblicare ogni anno. Non sono inventati e non sono stimati:
 * chi consegna una proposta deve poter dire da quale documento viene ogni numero.
 */
export default async function PaginaCompagnie() {
  const utente = await richiediSessione();
  const amministratore = utente.ruolo === 'amministratore';

  const esito = await compagnieCensite().catch(() => null);
  if (esito === null) redirect('/impostazioni');

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Solidità delle compagnie</h2>
      <p className="mb-6 text-sm leading-relaxed text-testo-tenue">
        Una polizza vale quanto vale chi la sottoscrive. I dati si leggono nella{' '}
        <strong>SFCR</strong>, che ogni compagnia pubblica per obbligo di legge, e nelle
        statistiche reclami IVASS.
      </p>

      {esito.compagnie.length === 0 ? (
        <div className="mb-6">
          <Avviso tono="informativo" titolo="Nessuna compagnia censita">
            Il motore di valutazione è pronto, ma senza dati non produce nulla — e non li
            inventa. Inserire il solvency ratio della prima compagnia dalla sua SFCR:
            bastano denominazione, anno e solvency ratio per avere un punteggio.
          </Avviso>
        </div>
      ) : (
        <div className="mb-6 space-y-3">
          {esito.compagnie.map((compagnia) => (
            <Compagnia key={compagnia.compagniaId} compagnia={compagnia} />
          ))}
        </div>
      )}

      {amministratore ? (
        <ModuloCompagnia />
      ) : (
        <p className="text-sm text-testo-debole">
          Il censimento delle compagnie è riservato agli amministratori dello studio.
        </p>
      )}
    </div>
  );
}

const COLORE: Record<SoliditaCompagnia['fascia'], string> = {
  critica: 'text-critico',
  debole: 'text-critico',
  adeguata: 'text-attenzione',
  solida: 'text-basso',
  'molto-solida': 'text-basso',
};

function Compagnia({ compagnia }: { compagnia: SoliditaCompagnia }) {
  return (
    <Scheda>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">
          {compagnia.denominazione}
          {compagnia.gruppo !== null && (
            <span className="ml-2 text-xs font-normal text-testo-debole">{compagnia.gruppo}</span>
          )}
        </h3>
        <span className={`tabular text-sm font-medium ${COLORE[compagnia.fascia]}`}>
          {compagnia.punteggio}/100 · {compagnia.fasciaEtichetta}
        </span>
      </div>

      <p className="mt-1 text-xs text-testo-tenue">
        {compagnia.solvencyRatio === null
          ? 'Solvency ratio non dichiarato'
          : `Solvency ratio ${Math.round(compagnia.solvencyRatio * 100)}%`}{' '}
        · esercizio {compagnia.anno} · fonte {compagnia.fonte}
      </p>

      {/*
        Le allerte non sono decorazione: un solvency ratio sotto il 100% significa che la
        compagnia non copre il proprio requisito patrimoniale, e va detto **prima** del
        collocamento, non dopo il sinistro.
      */}
      {compagnia.allerte.length > 0 && (
        <ul className="mt-2 space-y-1">
          {compagnia.allerte.map((allerta) => (
            <li key={allerta} className="text-sm text-critico">
              ⚠ {allerta}
            </li>
          ))}
        </ul>
      )}

      <Spiegazione dati={compagnia.spiegazione} />
    </Scheda>
  );
}
