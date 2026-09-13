'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  COMUNI_ITALIANI,
  comuneDaTesto,
  comunePerCodiceCatastale,
  cercaComuni,
  etichettaComune,
} from '@aegis/core/comuni';
import type { ComuneItaliano } from '@aegis/core/comuni';

const MASSIMO_PROPOSTE = 10;

/** «7894» → «7.894», senza dipendere dalla lingua installata sul server o nel browser. */
function conPuntiDelleMigliaia(numero: number): string {
  return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * La città della ricerca di nuovi clienti: tutti i comuni italiani, cercando per nome.
 *
 * Al posto della provincia, su richiesta di Simone del 13/09/2026, ed è l'unico filtro
 * obbligatorio. Si scrive e si sceglie dall'elenco ISTAT; al modulo arriva il **codice
 * catastale** in un campo nascosto, perché è con quello che il fornitore filtra e perché
 * un nome non basta a identificare un comune — Livo è in provincia di Como e di Trento.
 *
 * Il campo visibile non ha nome e non viene inviato: se l'invio partisse con un testo
 * scritto a metà, il servizio cercherebbe una città che nessuno ha scelto. Finché la città
 * non è scelta il campo si dichiara non valido, e il browser **non invia il modulo**: né
 * «Quante sono?» né «Dammi l'elenco», che spende.
 *
 * Un nome che appartiene a un solo comune — «brescia», «forli» — vale come scelta anche
 * senza toccare l'elenco; un nome condiviso no, perché indovinare la provincia sarebbe un
 * elenco pagato sul comune sbagliato.
 */
export function SelettoreComune({ codiceIniziale }: { codiceIniziale: string }) {
  const iniziale = comunePerCodiceCatastale(codiceIniziale);
  const [scelto, setScelto] = useState<ComuneItaliano | null>(iniziale);
  const [testo, setTesto] = useState(iniziale === null ? '' : etichettaComune(iniziale));
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  const id = useId();
  const idCampo = `${id}-campo`;
  const idElenco = `${id}-elenco`;
  const idNota = `${id}-nota`;

  const proposte = useMemo(() => (aperto ? cercaComuni(testo, MASSIMO_PROPOSTE) : []), [aperto, testo]);
  const mostraElenco = aperto && proposte.length > 0;

  useEffect(() => {
    campo.current?.setCustomValidity(
      scelto !== null
        ? ''
        : testo.trim() === ''
          ? 'Scegli la città: è l’unico filtro obbligatorio.'
          : 'Scegli la città dall’elenco dei comuni.',
    );
  }, [scelto, testo]);

  function scegli(comune: ComuneItaliano): void {
    setScelto(comune);
    setTesto(etichettaComune(comune));
    setAperto(false);
  }

  return (
    <div className="relative">
      <label
        htmlFor={idCampo}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
      >
        Città
      </label>
      <input
        ref={campo}
        id={idCampo}
        type="text"
        role="combobox"
        required
        aria-autocomplete="list"
        aria-expanded={mostraElenco}
        aria-controls={idElenco}
        aria-activedescendant={mostraElenco ? `${id}-proposta-${evidenziato}` : undefined}
        aria-describedby={idNota}
        autoComplete="off"
        spellCheck={false}
        placeholder="Scrivi il comune"
        value={testo}
        onChange={(evento) => {
          const valore = evento.target.value;
          setTesto(valore);
          setScelto(comuneDaTesto(valore));
          setAperto(true);
          setEvidenziato(0);
        }}
        onBlur={() => {
          setAperto(false);
          // Scelto scrivendo il nome per intero: si mostra l'etichetta con la sigla, così
          // chi rilegge il modulo vede quale dei comuni è stato preso.
          if (scelto !== null) setTesto(etichettaComune(scelto));
        }}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            if (!aperto) {
              setAperto(true);
              setEvidenziato(0);
            } else {
              setEvidenziato((i) => Math.min(i + 1, Math.max(proposte.length - 1, 0)));
            }
          } else if (evento.key === 'ArrowUp') {
            evento.preventDefault();
            setEvidenziato((i) => Math.max(i - 1, 0));
          } else if (evento.key === 'Enter') {
            // Con l'elenco aperto, Invio sceglie il comune evidenziato e non invia il
            // modulo: altrimenti partirebbe una ricerca su una città non ancora scelta.
            const comune = mostraElenco ? proposte[evidenziato] : undefined;
            if (comune !== undefined) {
              evento.preventDefault();
              scegli(comune);
            }
          } else if (evento.key === 'Escape' && aperto) {
            evento.preventDefault();
            setAperto(false);
          }
        }}
        className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm focus:border-marchio"
      />
      <input type="hidden" name="comune" value={scelto?.codiceCatastale ?? ''} />

      <ul
        id={idElenco}
        role="listbox"
        aria-label="Comuni"
        hidden={!mostraElenco}
        className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded border border-bordo-forte bg-superficie py-1 shadow-lg"
      >
        {proposte.map((comune, indice) => (
          <li
            key={comune.codiceCatastale}
            id={`${id}-proposta-${indice}`}
            role="option"
            aria-selected={indice === evidenziato}
            // `mousedown` e non `click`: il clic arriva dopo che il campo ha perso il fuoco
            // e l'elenco si è già chiuso, quindi la scelta andrebbe persa.
            onMouseDown={(evento) => {
              evento.preventDefault();
              scegli(comune);
            }}
            onMouseEnter={() => setEvidenziato(indice)}
            className={`cursor-pointer px-3 py-1.5 text-sm ${
              indice === evidenziato ? 'bg-marchio-tenue font-medium' : ''
            }`}
          >
            {comune.nome} ({comune.sigla})
          </li>
        ))}
      </ul>

      {aperto && testo.trim() !== '' && scelto === null && proposte.length === 0 && (
        <p
          role="status"
          className="absolute left-0 right-0 z-20 mt-1 rounded border border-bordo-forte bg-superficie px-3 py-2 text-sm"
        >
          Nessun comune con questo nome.
        </p>
      )}

      <span id={idNota} className="mt-1 block text-xs text-testo-debole">
        {scelto === null
          ? `Obbligatoria: scegli fra i ${conPuntiDelleMigliaia(COMUNI_ITALIANI.length)} comuni italiani.`
          : `Obbligatoria · codice catastale ${scelto.codiceCatastale}`}
      </span>
    </div>
  );
}
