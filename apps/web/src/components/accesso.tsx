import type { ReactNode } from 'react';

/**
 * I mattoni delle pagine di chi non è ancora dentro: accesso, registrazione, password
 * dimenticata, nuova password, conferma dell'indirizzo (18/09/2026).
 *
 * Una cornice sola e un campo solo, così le cinque pagine si somigliano: chi passa dalla
 * registrazione all'accesso non deve reimparare dove stanno le etichette o come si legge un
 * errore. Colori del prodotto, quindi tema chiaro e scuro, e contrasti già misurati.
 */

export function CornicePubblica({
  titolo,
  sottotitolo,
  children,
  piede,
  larga = false,
}: {
  titolo: string;
  sottotitolo?: ReactNode;
  children: ReactNode;
  piede?: ReactNode;
  larga?: boolean;
}) {
  return (
    <div className={`mx-auto py-10 sm:py-14 ${larga ? 'max-w-md' : 'max-w-sm'}`}>
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold tracking-tight text-marchio">AEGIS</p>
        <p className="mt-1 text-sm text-testo-tenue">Il rischio d’impresa, per intermediari assicurativi</p>
      </div>

      <div className="rounded-lg border border-bordo bg-superficie p-6">
        <h1 className="mb-1 text-lg font-semibold">{titolo}</h1>
        {sottotitolo !== undefined && (
          <p className="mb-5 text-sm leading-relaxed text-testo-tenue">{sottotitolo}</p>
        )}
        {children}
      </div>

      {piede !== undefined && (
        <div className="mt-6 space-y-2 text-center text-sm text-testo-tenue">{piede}</div>
      )}
    </div>
  );
}

/**
 * Un campo con la sua etichetta, l'aiuto e l'errore.
 *
 * L'errore è legato al campo (`aria-invalid`, `aria-describedby`): chi usa un lettore di
 * schermo lo sente quando ci arriva, e chi guarda lo trova sotto il campo sbagliato invece
 * che in cima al modulo.
 */
export function CampoAccesso({
  id,
  etichetta,
  tipo = 'text',
  autoComplete,
  valore,
  aiuto,
  errore,
  richiesto = true,
  maiuscolo = false,
  minimo,
  massimo,
}: {
  id: string;
  etichetta: string;
  tipo?: 'text' | 'email' | 'password';
  autoComplete: string;
  valore?: string | undefined;
  aiuto?: string | undefined;
  errore?: string | undefined;
  richiesto?: boolean;
  maiuscolo?: boolean;
  minimo?: number;
  massimo?: number;
}) {
  const descrizione = [
    aiuto === undefined ? null : `${id}-aiuto`,
    errore === undefined ? null : `${id}-errore`,
  ]
    .filter((d) => d !== null)
    .join(' ');

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
      >
        {etichetta}
      </label>
      <input
        id={id}
        name={id}
        type={tipo}
        autoComplete={autoComplete}
        required={richiesto}
        defaultValue={valore ?? ''}
        {...(minimo === undefined ? {} : { minLength: minimo })}
        {...(massimo === undefined ? {} : { maxLength: massimo })}
        {...(maiuscolo ? { autoCapitalize: 'characters', spellCheck: false } : {})}
        aria-invalid={errore === undefined ? undefined : true}
        {...(descrizione === '' ? {} : { 'aria-describedby': descrizione })}
        className={`w-full rounded border bg-fondo px-3 py-2 text-sm transition focus:border-marchio ${
          errore === undefined ? 'border-bordo-forte' : 'border-critico'
        }`}
      />
      {aiuto !== undefined && (
        <p id={`${id}-aiuto`} className="mt-1 text-xs leading-relaxed text-testo-debole">
          {aiuto}
        </p>
      )}
      {errore !== undefined && (
        <p id={`${id}-errore`} className="mt-1 text-xs font-medium text-critico">
          {errore}
        </p>
      )}
    </div>
  );
}

/**
 * L'API non risponde: lo si dice, invece di rinviare altrove. Un rinvio qui finiva in un giro
 * senza uscita fra accesso e Ricerca Clienti, e il browser mostrava «troppi reindirizzamenti».
 */
export function ServizioAssente() {
  return (
    <CornicePubblica titolo="Servizio non raggiungibile">
      <p className="text-sm leading-relaxed text-testo-tenue">
        AEGIS non risponde in questo momento. Riprova fra qualche minuto; se continua, avvisa chi gestisce
        la piattaforma.
      </p>
    </CornicePubblica>
  );
}

/** Un collegamento testuale delle pagine pubbliche, sottolineato al passaggio. */
export function CollegamentoPubblico({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-marchio underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
