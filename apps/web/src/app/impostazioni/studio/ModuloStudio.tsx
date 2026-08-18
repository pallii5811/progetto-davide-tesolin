'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { salvaStudioAzione } from '../actions';
import type { DatiStudio } from '@/lib/api';

const CAMPO =
  'w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none transition focus:border-marchio focus:ring-2 focus:ring-marchio/25';
const ETICHETTA = 'mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole';

function Bottone() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-marchio px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      {pending ? 'Salvataggio…' : 'Salva anagrafica'}
    </button>
  );
}

export function ModuloStudio({ studio }: { studio: DatiStudio | null }) {
  const [esito, invia] = useActionState(salvaStudioAzione, null);

  return (
    <form action={invia} className="space-y-4">
      <div>
        <label htmlFor="denominazione" className={ETICHETTA}>
          Denominazione dello studio
        </label>
        <input
          id="denominazione"
          name="denominazione"
          type="text"
          required
          minLength={2}
          defaultValue={studio?.denominazione ?? ''}
          className={CAMPO}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="numeroRui" className={ETICHETTA}>
            Numero di iscrizione al RUI
          </label>
          <input
            id="numeroRui"
            name="numeroRui"
            type="text"
            defaultValue={studio?.numeroRui ?? ''}
            aria-describedby="nota-rui"
            className={CAMPO}
          />
          <p id="nota-rui" className="mt-1 text-xs text-testo-debole">
            Compare in testa a ogni report: il Reg. IVASS 40/2018 chiede che i documenti
            identifichino l&apos;intermediario che li ha redatti.
          </p>
        </div>

        <div>
          <label htmlFor="partitaIva" className={ETICHETTA}>
            Partita IVA
          </label>
          <input
            id="partitaIva"
            name="partitaIva"
            type="text"
            inputMode="numeric"
            defaultValue={studio?.partitaIva ?? ''}
            className={`tabular ${CAMPO}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="indirizzo" className={ETICHETTA}>
          Indirizzo
        </label>
        <input
          id="indirizzo"
          name="indirizzo"
          type="text"
          defaultValue={studio?.indirizzo ?? ''}
          className={CAMPO}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="telefono" className={ETICHETTA}>
            Telefono
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            defaultValue={studio?.telefono ?? ''}
            className={CAMPO}
          />
        </div>

        <div>
          <label htmlFor="email" className={ETICHETTA}>
            Indirizzo di posta
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={studio?.email ?? ''}
            className={CAMPO}
          />
        </div>
      </div>

      <div aria-live="polite" className="min-h-5">
        {esito !== null && (
          <p className={`text-sm ${esito.ok ? 'text-basso' : 'text-critico'}`}>{esito.messaggio}</p>
        )}
      </div>

      <Bottone />
    </form>
  );
}
