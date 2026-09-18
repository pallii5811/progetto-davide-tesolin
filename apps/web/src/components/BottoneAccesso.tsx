'use client';

import { useFormStatus } from 'react-dom';
import { Rotella } from './Rotella';

/**
 * Il pulsante principale dei moduli di accesso: largo, con la rotella e il testo d'attesa.
 * Disattivato mentre il modulo è in viaggio — un secondo clic sulla registrazione sarebbe
 * un secondo studio, o un «indirizzo già registrato» incomprensibile.
 */
export function BottoneAccesso({ testo, attesa }: { testo: string; attesa: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-1.5 rounded-full bg-azione px-4 py-2.5 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
    >
      {pending && <Rotella />}
      {pending ? attesa : testo}
    </button>
  );
}
