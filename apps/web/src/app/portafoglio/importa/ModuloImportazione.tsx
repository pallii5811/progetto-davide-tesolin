'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Avviso, Scheda } from '@/components/ui';
import { anteprimaImportazione, eseguiImportazione } from './actions';
import type { AnteprimaDto } from './actions';

function Bottone({ etichetta, inCorso }: { etichetta: string; inCorso: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-azione px-4 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40"
    >
      {pending ? inCorso : etichetta}
    </button>
  );
}

export function ModuloImportazione() {
  const [esito, chiediAnteprima] = useActionState(anteprimaImportazione, null);
  const [importazione, importa] = useActionState(eseguiImportazione, null);
  const [contenuto, setContenuto] = useState('');
  const campoFile = useRef<HTMLInputElement>(null);

  const anteprima = esito?.anteprima;

  async function leggiFile(file: File): Promise<void> {
    // Il file si legge nel browser e si invia come testo: l'API resta senza dipendenze
    // da multipart, e nessun file transita per il disco del server.
    setContenuto(await file.text());
  }

  return (
    <div className="space-y-6">
      <form action={chiediAnteprima} className="space-y-4">
        <div>
          <label
            htmlFor="file"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
          >
            File del gestionale
          </label>
          <input
            id="file"
            ref={campoFile}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) void leggiFile(file);
            }}
            className="block w-full text-sm text-testo-tenue file:mr-3 file:rounded file:border file:border-bordo-forte file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:text-testo"
          />
          <p className="mt-1 text-xs text-testo-debole">
            CSV esportato da qualunque gestionale. Separatore, intestazioni e virgolette vengono
            riconosciuti da soli.
          </p>
        </div>

        <div>
          <label
            htmlFor="contenuto"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole"
          >
            Oppure incolla qui
          </label>
          <textarea
            id="contenuto"
            name="contenuto"
            rows={8}
            value={contenuto}
            onChange={(e) => setContenuto(e.target.value)}
            placeholder={'P.IVA;Denominazione\n12485671007;Openapi S.p.A.\n00743110157;Pirelli & C.'}
            className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 font-mono text-xs outline-none transition focus:border-marchio focus:ring-2 focus:ring-marchio/25"
          />
        </div>

        <div aria-live="polite">
          {esito !== null && !esito.ok && <p className="text-sm text-critico">{esito.messaggio}</p>}
        </div>

        <Bottone etichetta="Leggi il file" inCorso="Lettura…" />
      </form>

      {anteprima !== undefined && (
        <Anteprima anteprima={anteprima} contenuto={esito?.contenuto ?? contenuto} importa={importa} />
      )}

      <div aria-live="polite">
        {importazione !== null && (
          <Avviso
            tono={importazione.ok ? 'informativo' : 'critico'}
            titolo={importazione.ok ? 'Presa in carico completata' : 'Importazione non riuscita'}
          >
            {importazione.messaggio}
          </Avviso>
        )}
      </div>
    </div>
  );
}

function Anteprima({
  anteprima,
  contenuto,
  importa,
}: {
  anteprima: AnteprimaDto;
  contenuto: string;
  importa: (modulo: FormData) => void;
}) {
  const inEuro = (centesimi: number): string =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(centesimi / 100);

  const costo = inEuro(anteprima.costoStimatoCentesimi);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Cosa verrebbe preso in carico</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Riquadro etichetta="Righe lette" valore={String(anteprima.righeLette)} />
        <Riquadro etichetta="Da acquisire" valore={String(anteprima.totaleDaAcquisire)} risalto />
        <Riquadro
          etichetta="Già in portafoglio"
          valore={String(anteprima.giaPresenti.length)}
          nota="Non verranno riacquistate"
        />
        <Riquadro
          etichetta="Costo stimato"
          valore={costo}
          nota={`${inEuro(anteprima.costoUnitarioCentesimi)} per azienda`}
          risalto
        />
      </div>

      {anteprima.oltreIlMassimo && (
        <Avviso tono="attenzione" titolo="Troppe aziende per una sola importazione">
          Il file ne contiene {anteprima.totaleDaAcquisire} da acquisire, il massimo per volta è{' '}
          {anteprima.massimoPerImportazione}. È un limite voluto: caricare per errore l&apos;anagrafica
          completa di un gestionale significherebbe centinaia di euro di chiamate. Dividere il file e
          procedere a scaglioni.
        </Avviso>
      )}

      {anteprima.totaleScartate > 0 && (
        <Scheda>
          <p className="mb-2 text-sm font-medium">
            {anteprima.totaleScartate} righe scartate — il resto verrà importato comunque
          </p>
          <ul className="space-y-1 text-xs text-testo-tenue">
            {anteprima.scartate.map((s) => (
              <li key={s.riga} className="flex gap-2">
                <span className="tabular shrink-0 text-testo-debole">riga {s.riga}</span>
                <span className="min-w-0 truncate font-mono">{s.contenuto || '(vuota)'}</span>
                <span className="shrink-0 text-alto">{s.motivo}</span>
              </li>
            ))}
          </ul>
          {anteprima.totaleScartate > anteprima.scartate.length && (
            <p className="mt-2 text-xs text-testo-debole">
              …e altre {anteprima.totaleScartate - anteprima.scartate.length}.
            </p>
          )}
        </Scheda>
      )}

      {anteprima.duplicati > 0 && (
        <p className="text-sm text-testo-tenue">
          {anteprima.duplicati} righe ripetute nel file: ciascuna azienda viene presa in carico una volta
          sola.
        </p>
      )}

      {!anteprima.oltreIlMassimo && anteprima.totaleDaAcquisire > 0 && (
        <form action={importa}>
          <input type="hidden" name="contenuto" value={contenuto} />
          <Bottone
            etichetta={`Prendi in carico ${anteprima.totaleDaAcquisire} aziende · ${costo}`}
            inCorso="Acquisizione in corso, non chiudere la pagina…"
          />
        </form>
      )}

      {anteprima.totaleDaAcquisire === 0 && (
        <p className="text-sm text-testo-tenue">
          Nulla da acquisire: le aziende leggibili sono già tutte in portafoglio.
        </p>
      )}
    </section>
  );
}

function Riquadro({
  etichetta,
  valore,
  nota,
  risalto = false,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  risalto?: boolean;
}) {
  return (
    <Scheda>
      <dl data-testid={`riquadro-${chiave(etichetta)}`}>
        <dt className="text-xs font-medium uppercase tracking-wide text-testo-debole">{etichetta}</dt>
        <dd className={`tabular mt-1.5 text-2xl font-semibold ${risalto ? 'text-marchio' : ''}`}>
          {valore}
        </dd>
        {nota !== undefined && <dd className="mt-1 text-xs text-testo-tenue">{nota}</dd>}
      </dl>
    </Scheda>
  );
}

/** «Da acquisire» → `da-acquisire`: identificativo stabile a partire dall'etichetta. */
function chiave(etichetta: string): string {
  // Le lettere accentate si riducono alla lettera base invece di essere trattate come
  // separatori: «Già in portafoglio» deve dare `gia-in-portafoglio`, non `gi-in-portafoglio`.
  return etichetta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
