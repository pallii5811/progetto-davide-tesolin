'use client';

/**
 * Campi di modulo.
 *
 * Tre scelte deliberate:
 *  - i campi booleani hanno **tre stati** (sì / no / non so), perché il dominio distingue
 *    «no» da «non lo so» e un interruttore a due stati costringerebbe l'utente a mentire;
 *  - ogni campo può portare un `aiuto` che spiega a cosa serve il dato: il broker lo legge
 *    al cliente mentre lo intervista;
 *  - l'etichetta è sempre un `<label>` collegato, e il focus è sempre visibile.
 */

import type { ReactNode } from 'react';
import { useId } from 'react';

function Guscio({
  etichetta,
  aiuto,
  htmlFor,
  children,
}: {
  etichetta: string;
  aiuto?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
      >
        {etichetta}
      </label>
      {children}
      {aiuto !== undefined && <p className="mt-1 text-xs leading-snug text-testo-debole">{aiuto}</p>}
    </div>
  );
}

const CLASSI_CAMPO =
  'w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none ' +
  'transition focus:border-marchio focus:ring-2 focus:ring-marchio/25';

export function CampoTesto({
  etichetta,
  valore,
  onChange,
  aiuto,
  placeholder,
}: {
  etichetta: string;
  valore: string;
  onChange: (valore: string) => void;
  aiuto?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Guscio etichetta={etichetta} aiuto={aiuto} htmlFor={id}>
      <input
        id={id}
        type="text"
        value={valore}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSI_CAMPO}
      />
    </Guscio>
  );
}

export function CampoNumero({
  etichetta,
  valore,
  onChange,
  aiuto,
  suffisso,
  min = 0,
  step,
}: {
  etichetta: string;
  valore: number | null;
  onChange: (valore: number | null) => void;
  aiuto?: string;
  suffisso?: string;
  min?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <Guscio etichetta={etichetta} aiuto={aiuto} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={valore ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={`tabular ${CLASSI_CAMPO}`}
        />
        {suffisso !== undefined && <span className="shrink-0 text-sm text-testo-debole">{suffisso}</span>}
      </div>
    </Guscio>
  );
}

/**
 * Booleano a tre stati.
 * «Non so» non è una risposta pigra: è l'informazione che fa comparire il rischio
 * nel report marcato «da verificare», invece di farlo sparire.
 */
export function CampoTriStato({
  etichetta,
  valore,
  onChange,
  aiuto,
}: {
  etichetta: string;
  valore: boolean | null;
  onChange: (valore: boolean | null) => void;
  aiuto?: string;
}) {
  const opzioni: { testo: string; valore: boolean | null }[] = [
    { testo: 'Sì', valore: true },
    { testo: 'No', valore: false },
    { testo: 'Non so', valore: null },
  ];

  return (
    <Guscio etichetta={etichetta} aiuto={aiuto}>
      <div role="group" aria-label={etichetta} className="flex gap-1">
        {opzioni.map((opzione) => {
          const attiva = valore === opzione.valore;
          return (
            <button
              key={opzione.testo}
              type="button"
              aria-pressed={attiva}
              onClick={() => onChange(opzione.valore)}
              className={`flex-1 rounded border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-marchio/25 ${
                attiva
                  ? 'border-marchio bg-azione text-azione-testo'
                  : 'border-bordo-forte bg-fondo hover:border-marchio/50'
              }`}
            >
              {opzione.testo}
            </button>
          );
        })}
      </div>
    </Guscio>
  );
}

export function CampoSelezione<T extends string>({
  etichetta,
  valore,
  opzioni,
  onChange,
  aiuto,
}: {
  etichetta: string;
  valore: T | null;
  opzioni: readonly { valore: T; testo: string }[];
  onChange: (valore: T | null) => void;
  aiuto?: string;
}) {
  const id = useId();
  return (
    <Guscio etichetta={etichetta} aiuto={aiuto} htmlFor={id}>
      <select
        id={id}
        value={valore ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as T))}
        className={CLASSI_CAMPO}
      >
        <option value="">— non specificato —</option>
        {opzioni.map((opzione) => (
          <option key={opzione.valore} value={opzione.valore}>
            {opzione.testo}
          </option>
        ))}
      </select>
    </Guscio>
  );
}

export function CampoPercentuale({
  etichetta,
  valore,
  onChange,
  aiuto,
}: {
  etichetta: string;
  /** Valore in quota 0-1; l'utente digita in punti percentuali. */
  valore: number | null;
  onChange: (valore: number | null) => void;
  aiuto?: string;
}) {
  return (
    <CampoNumero
      etichetta={etichetta}
      valore={valore === null ? null : Math.round(valore * 100)}
      onChange={(v) => onChange(v === null ? null : Math.min(100, Math.max(0, v)) / 100)}
      aiuto={aiuto}
      suffisso="%"
      min={0}
      step={1}
    />
  );
}

export function CampoData({
  etichetta,
  valore,
  onChange,
}: {
  etichetta: string;
  valore: string;
  onChange: (valore: string) => void;
}) {
  const id = useId();
  return (
    <Guscio etichetta={etichetta} htmlFor={id}>
      <input
        id={id}
        type="date"
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSI_CAMPO}
      />
    </Guscio>
  );
}

export function GruppoCampi({
  titolo,
  descrizione,
  children,
}: {
  titolo: string;
  descrizione?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
      <legend className="px-1.5 text-sm font-semibold">{titolo}</legend>
      {descrizione !== undefined && (
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">{descrizione}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
