'use client';

import { useActionState } from 'react';
import { censisciCompagnia } from './actions';
import type { EsitoCensimento } from './actions';

/**
 * Censimento di una compagnia dalla sua SFCR.
 *
 * I campi seguono l'ordine in cui i dati compaiono nel documento, non l'ordine in cui il
 * motore li consuma: chi compila ha la relazione aperta davanti e copia, e un modulo che
 * lo costringe a saltare avanti e indietro viene abbandonato a metà.
 *
 * Solo tre campi sono obbligatori. Il motore lavora con quello che ha e dichiara le
 * componenti che non ha potuto valutare: pretendere l'elenco completo significherebbe non
 * far censire nessuna compagnia.
 */
export function ModuloCompagnia() {
  const [esito, azione, inCorso] = useActionState<EsitoCensimento | null, FormData>(
    censisciCompagnia,
    null,
  );

  return (
    <form action={azione} className="rounded-lg border border-bordo bg-superficie p-4">
      <h3 className="mb-3 text-sm font-semibold">Censisci una compagnia</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo nome="denominazione" etichetta="Denominazione" obbligatorio />
        <Campo nome="gruppo" etichetta="Gruppo" />
        <Campo nome="anno" etichetta="Esercizio" segnaposto="2025" numerico obbligatorio />
        <Campo nome="fonte" etichetta="Fonte" segnaposto="SFCR 2025" obbligatorio />
      </div>

      <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-testo-debole">
        Dalla SFCR
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          nome="solvencyRatio"
          etichetta="Solvency ratio (%)"
          segnaposto="260"
          numerico
          nota="Come scritto nella relazione: 260, non 2,6"
        />
        <Campo nome="quotaTier1" etichetta="Quota Tier 1 unrestricted (%)" segnaposto="92" numerico />
        <Campo nome="fondiPropri" etichetta="Fondi propri ammissibili (€)" numerico />
        <Campo nome="scr" etichetta="SCR (€)" numerico />
        <Campo nome="premiLordi" etichetta="Premi lordi contabilizzati (€)" numerico />
        <Campo nome="reclami" etichetta="Reclami nell’anno" numerico nota="Statistiche IVASS" />
        <Campo nome="ratingAgenzia" etichetta="Agenzia di rating" segnaposto="S&P" />
        <Campo nome="ratingValore" etichetta="Rating" segnaposto="A" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={inCorso}
          className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
        >
          {inCorso ? 'Salvataggio…' : 'Censisci'}
        </button>

        {esito !== null && (
          <span className={`text-sm ${esito.ok ? 'text-basso' : 'text-critico'}`}>
            {esito.messaggio}
          </span>
        )}
      </div>
    </form>
  );
}

function Campo({
  nome,
  etichetta,
  segnaposto,
  nota,
  numerico = false,
  obbligatorio = false,
}: {
  nome: string;
  etichetta: string;
  segnaposto?: string;
  nota?: string;
  numerico?: boolean;
  obbligatorio?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
        {etichetta}
        {obbligatorio && <span className="ml-1 text-critico">*</span>}
      </span>
      <input
        type="text"
        name={nome}
        placeholder={segnaposto}
        inputMode={numerico ? 'decimal' : 'text'}
        className={`w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio ${
          numerico ? 'tabular' : ''
        }`}
      />
      {nota !== undefined && <span className="mt-1 block text-xs text-testo-debole">{nota}</span>}
    </label>
  );
}
