'use client';

import { useState, useTransition } from 'react';
import { ETICHETTE_STATO_CRM, STATI_CRM } from '@aegis/core/crm';
import type { StatoCrm } from '@aegis/core/crm';
import { Rotella } from '@/components/Rotella';
import { IconaMatita, IconaNota } from '@/components/icone';
import { cambiaStatoCrm, salvaNotaCrm } from './actions';
import type { EsitoCrm } from './actions';

/**
 * Lo stato e la nota di un'azienda, sulla sua riga del CRM.
 *
 * Rifatto il 19/09/2026 («il crm è brutto… rendilo molto più user friendly»). Prima ogni riga
 * portava un menu, un'area di testo sempre aperta e un pulsante «Salva»: venticinque aziende
 * facevano venticinque aree di testo vuote, e per spostare uno stato dopo una telefonata
 * servivano due gesti.
 *
 * Ora lo stato è una pastiglia colorata che si salva al cambio — cinque scelte, nessun testo da
 * comporre — e la nota compare solo quando serve: chi ce l'ha la legge sulla riga, chi la vuole
 * scrivere apre l'area di testo e la chiude quando ha salvato. Il pulsante resta, perché una
 * nota salvata mentre si scrive sarebbe una nota a metà.
 */

/** Il colore dello stato, con i toni del prodotto: segue anche il tema scuro. */
const TONI: Record<StatoCrm, { pastiglia: string; punto: string }> = {
  'da-contattare': {
    pastiglia: 'border-bordo-forte bg-superficie text-testo',
    punto: 'bg-testo-debole',
  },
  contattata: {
    pastiglia: 'border-attenzione/35 bg-attenzione-fondo text-attenzione',
    punto: 'bg-attenzione',
  },
  'in-trattativa': {
    pastiglia: 'border-marchio/35 bg-marchio-tenue text-marchio',
    punto: 'bg-marchio',
  },
  cliente: { pastiglia: 'border-basso/35 bg-basso-fondo text-basso', punto: 'bg-basso' },
  'non-interessata': { pastiglia: 'border-bordo bg-fondo text-testo-debole', punto: 'bg-bordo-forte' },
};

export function ModificaCrm({
  identificativo,
  denominazione,
  stato,
  nota,
}: {
  identificativo: string;
  denominazione: string;
  stato: StatoCrm;
  nota: string | null;
}) {
  // Lo stato locale corre avanti al server: la pastiglia cambia colore al clic, non al ritorno.
  const [statoCorrente, setStatoCorrente] = useState<StatoCrm>(stato);
  const [notaCorrente, setNotaCorrente] = useState<string | null>(nota);
  const [bozza, setBozza] = useState(nota ?? '');
  const [aperta, setAperta] = useState(false);
  const [esito, setEsito] = useState<EsitoCrm | null>(null);
  const [inCorso, avvia] = useTransition();

  /* Se la riga arriva dal server con valori diversi — un ricaricamento, un'altra scheda — si
     riallinea qui, durante il render, senza effetti. */
  const [ultimoDaFuori, setUltimoDaFuori] = useState({ stato, nota });
  if (ultimoDaFuori.stato !== stato || ultimoDaFuori.nota !== nota) {
    setUltimoDaFuori({ stato, nota });
    setStatoCorrente(stato);
    setNotaCorrente(nota);
    if (!aperta) setBozza(nota ?? '');
  }

  const cambiaStato = (nuovo: StatoCrm) => {
    const precedente = statoCorrente;
    setStatoCorrente(nuovo);
    setEsito(null);
    avvia(async () => {
      const risposta = await cambiaStatoCrm(identificativo, nuovo);
      setEsito(risposta);
      // Non riuscito: la pastiglia torna com'era, invece di mostrare uno stato che l'archivio non ha.
      if (!risposta.ok) setStatoCorrente(precedente);
    });
  };

  const salvaNota = () => {
    setEsito(null);
    avvia(async () => {
      const risposta = await salvaNotaCrm(identificativo, bozza);
      setEsito(risposta);
      if (risposta.ok) {
        setNotaCorrente(bozza.trim() === '' ? null : bozza.trim());
        setAperta(false);
      }
    });
  };

  const tono = TONI[statoCorrente];

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/*
          L'etichetta AVVOLGE il menu, non lo aggancia per identificativo: la pagina disegna ogni
          azienda due volte — la riga su schermo largo e la scheda su telefono, una delle due
          sempre `display: none` — e due identificativi uguali fanno puntare l'etichetta al
          campo nascosto. Così ogni copia porta la sua.
        */}
        <label className={`relative inline-flex items-center rounded-full border ${tono.pastiglia}`}>
          <span className="sr-only">Stato di {denominazione}</span>
          <span aria-hidden="true" className={`ml-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${tono.punto}`} />
          <select
            value={statoCorrente}
            disabled={inCorso}
            onChange={(evento) => cambiaStato(evento.target.value as StatoCrm)}
            className="appearance-none bg-transparent py-1 pl-1.5 pr-6 text-[13px] font-medium disabled:opacity-60"
          >
            {STATI_CRM.map((valore) => (
              <option key={valore} value={valore} className="bg-superficie text-testo">
                {ETICHETTE_STATO_CRM[valore]}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="pointer-events-none absolute right-2 h-2.5 w-2.5 opacity-70"
          >
            <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </label>
        {inCorso && <Rotella className="h-3.5 w-3.5 text-testo-debole" />}
        <span
          role="status"
          className={`text-xs ${esito?.ok === false ? 'text-critico' : 'text-testo-debole'}`}
        >
          {esito?.messaggio ?? ''}
        </span>
      </div>

      {aperta ? (
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            salvaNota();
          }}
        >
          <label className="block">
            <span className="sr-only">Nota su {denominazione}</span>
            <textarea
              value={bozza}
              onChange={(evento) => setBozza(evento.target.value)}
              rows={3}
              maxLength={2000}
              autoFocus
              placeholder="Cosa vi siete detti, cosa richiamare"
              className="w-full rounded-xl border border-bordo-forte bg-superficie px-2.5 py-2 text-[13px] leading-snug transition focus:border-marchio"
            />
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={inCorso}
              className="rounded-full bg-azione px-3 py-1 text-xs font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() => {
                setAperta(false);
                setBozza(notaCorrente ?? '');
                setEsito(null);
              }}
              className="rounded-full px-2.5 py-1 text-xs text-testo-tenue transition hover:text-testo"
            >
              Annulla
            </button>
          </div>
        </form>
      ) : notaCorrente === null ? (
        <button
          type="button"
          onClick={() => setAperta(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-bordo-forte px-2.5 py-1 text-xs text-testo-tenue transition hover:border-marchio/50 hover:text-testo"
        >
          <IconaNota className="h-3.5 w-3.5" />
          Aggiungi una nota
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAperta(true)}
          aria-label={`Modifica la nota su ${denominazione}`}
          className="group flex w-full items-start gap-1.5 rounded-lg border border-bordo bg-fondo px-2.5 py-1.5 text-left text-xs leading-snug text-testo-tenue transition hover:border-marchio/40 hover:text-testo"
        >
          <IconaNota className="mt-px h-3.5 w-3.5 shrink-0 text-testo-debole" />
          <span className="line-clamp-3 min-w-0 flex-1">{notaCorrente}</span>
          <IconaMatita className="mt-px h-3.5 w-3.5 shrink-0 text-testo-debole opacity-0 transition group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
}
