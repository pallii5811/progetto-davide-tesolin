'use client';

import { useState, useTransition } from 'react';
import { creaInvitoQuestionario, revocaInvitoQuestionario } from './actions';
import type { InvitoQuestionarioDto } from '@/lib/api';

/**
 * Il collegamento da mandare al cliente perché compili da sé.
 *
 * I campi che pesano di più sull'analisi — le scorte, i veicoli, se si lavora in cantiere —
 * richiedono un dato che solo l'azienda conosce. Oggi restano vuoti perché l'intervista la
 * fa l'intermediario al telefono; il collegamento sposta la compilazione su chi ha la
 * risposta.
 *
 * **Il collegamento compare una volta sola.** In archivio ne resta solo l'impronta, come
 * per le password iniziali: chi non lo copia adesso ne genera un altro, e il precedente
 * smette di funzionare. È scomodo di proposito — un collegamento che apre il questionario
 * di un cliente senza chiedere nulla non deve poter essere recuperato da chi legge il
 * database.
 */
export function CollegamentoQuestionario({
  identificativo,
  invito,
}: {
  identificativo: string;
  invito: InvitoQuestionarioDto | null;
}) {
  const [indirizzo, setIndirizzo] = useState<string | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [inCorso, avvia] = useTransition();

  function genera(): void {
    setEsito(null);
    setCopiato(false);
    avvia(() => {
      void creaInvitoQuestionario(identificativo).then((r) => {
        if (r.ok && r.token !== undefined) {
          // L'indirizzo si compone nel browser: è lì che si sa su quale dominio gira il
          // prodotto, e scriverlo nella configurazione del server sarebbe una cosa in più
          // da tenere allineata a ogni cambio di ambiente.
          setIndirizzo(`${window.location.origin}/questionario/${r.token}`);
        }
        setEsito({ ok: r.ok, messaggio: r.messaggio });
      });
    });
  }

  function revoca(): void {
    setEsito(null);
    setIndirizzo(null);
    avvia(() => {
      void revocaInvitoQuestionario(identificativo).then((r) => {
        setEsito({ ok: r.ok, messaggio: r.messaggio });
      });
    });
  }

  const scadenza =
    invito === null
      ? null
      : new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date(invito.scadeIl));

  return (
    <div className="rounded-lg border border-bordo bg-superficie p-4">
      <h2 className="text-sm font-semibold">Far compilare al cliente</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-testo-tenue">
        Le scorte, i veicoli, il lavoro in cantiere: dati che solo l&apos;azienda conosce con precisione. Si
        genera un collegamento e glielo si manda; le risposte arrivano qui.
      </p>

      {invito !== null && indirizzo === null && (
        <p className="mt-3 text-sm">
          <span className="font-medium">Collegamento attivo</span>
          <span className="text-testo-tenue"> · valido fino al {scadenza}</span>
          <span className="mt-0.5 block text-xs text-testo-tenue">
            {invito.compilatoIl === null
              ? 'Il cliente non ha ancora salvato nulla.'
              : `Ultima compilazione: ${new Intl.DateTimeFormat('it-IT', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                }).format(new Date(invito.compilatoIl))}.`}
          </span>
          <span className="mt-1 block text-xs text-testo-debole">
            Il collegamento non è più leggibile: in archivio ne resta solo l&apos;impronta. Se serve di
            nuovo, generarne un altro — il precedente smette di funzionare.
          </span>
        </p>
      )}

      {indirizzo !== null && (
        <div className="mt-3 rounded border border-bordo-forte bg-fondo p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-testo-debole">
            Copiare adesso: non verrà mostrato di nuovo
          </p>
          <p className="mt-1 break-all font-mono text-xs">{indirizzo}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(indirizzo).then(() => {
                setCopiato(true);
              });
            }}
            className="mt-2 rounded bg-azione px-3 py-1.5 text-sm font-medium text-azione-testo transition hover:opacity-90"
          >
            {copiato ? 'Copiato' : 'Copia collegamento'}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={genera}
          disabled={inCorso}
          className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio/50 disabled:opacity-50"
        >
          {invito === null ? 'Genera collegamento' : 'Genera un nuovo collegamento'}
        </button>
        {invito !== null && (
          <button
            type="button"
            onClick={revoca}
            disabled={inCorso}
            className="rounded border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:text-critico disabled:opacity-50"
          >
            Revoca
          </button>
        )}
      </div>

      {esito !== null && (
        <p className={`mt-2 text-sm ${esito.ok ? 'text-basso' : 'text-critico'}`}>{esito.messaggio}</p>
      )}
    </div>
  );
}
