'use client';

import { useActionState } from 'react';
import { apriStudio } from './actions';
import type { EsitoApertura } from './actions';

/**
 * Apertura di uno studio cliente.
 *
 * Tre campi soltanto: chi è lo studio e chi lo amministrerà. Il resto — numero RUI,
 * recapiti, carta intestata — lo compila il cliente stesso dalle proprie impostazioni,
 * perché sono dati suoi e li conosce lui.
 */
export function ModuloStudio() {
  const [esito, azione, inCorso] = useActionState<EsitoApertura | null, FormData>(apriStudio, null);

  return (
    <form action={azione} className="rounded-lg border border-bordo bg-superficie p-4">
      <h3 className="mb-1 text-sm font-semibold">Apri uno studio cliente</h3>
      <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
        Nasce isolato: portafoglio, clienti e analisi non sono visibili da nessun altro studio, compreso
        questo.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo nome="denominazione" etichetta="Denominazione dello studio" />
        <Campo nome="nome" etichetta="Referente" />
        <Campo nome="email" etichetta="Indirizzo di accesso" tipo="email" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={inCorso}
          className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
        >
          {inCorso ? 'Apertura…' : 'Apri lo studio'}
        </button>
        {esito !== null && !esito.ok && <span className="text-sm text-critico">{esito.messaggio}</span>}
      </div>

      {/*
        La password compare una volta sola e non viene conservata in chiaro da nessuna
        parte. Va detto mentre è a schermo, non dopo: chi ricarica la pagina credendo di
        ritrovarla deve poter sapere in anticipo che non la ritroverà.
      */}
      {esito !== null && esito.ok && esito.passwordIniziale !== undefined && (
        <div className="mt-4 rounded border border-rilevante/40 bg-rilevante-fondo p-3">
          <p className="text-sm font-medium">{esito.messaggio}</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap gap-2">
              <dt className="text-testo-tenue">Indirizzo:</dt>
              <dd className="font-mono">{esito.email}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-testo-tenue">Password iniziale:</dt>
              <dd data-testid="password-iniziale" className="font-mono font-semibold">
                {esito.passwordIniziale}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-testo-tenue">
            Non verrà mostrata di nuovo. Consegnarla al referente, che la cambierà al primo accesso.
          </p>
        </div>
      )}
    </form>
  );
}

function Campo({ nome, etichetta, tipo = 'text' }: { nome: string; etichetta: string; tipo?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-testo-tenue">{etichetta}</span>
      <input
        name={nome}
        type={tipo}
        required
        className="w-full rounded border border-bordo-forte bg-fondo px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
