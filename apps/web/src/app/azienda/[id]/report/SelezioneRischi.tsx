'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Quali rischi portare nel documento.
 *
 * Serve a una conversazione reale: l'intermediario che va dal cliente per la parte
 * property non vuole consegnare venti pagine in cui metà riguarda la RC che vedranno il
 * mese prossimo. È una funzione che le piattaforme concorrenti hanno e che finora non
 * avevamo.
 *
 * ## Due scelte che la rendono difendibile invece che pericolosa
 *
 * **La selezione vive nell'indirizzo, non in archivio.** È una scelta di questa consegna,
 * non una proprietà dell'azienda: memorizzarla vorrebbe dire che fra sei mesi qualcuno
 * genera un report mutilato senza sapere perché. Così l'indirizzo è il documento — si
 * copia, si rigenera identico, e senza parametri si torna al report intero.
 *
 * **Ciò che si esclude viene scritto nel documento.** Questo report è la documentazione di
 * adeguatezza ai sensi dell'art. 58 del Reg. IVASS 40/2018: togliere rischi in silenzio
 * produrrebbe una carta che sembra completa e non lo è, e a rimetterci sarebbe
 * l'intermediario il giorno in cui il cliente chiede perché di quel rischio non si è mai
 * parlato. Il pannello lo dice qui, e il documento lo ripete stampato.
 */

interface RischioSelezionabile {
  readonly id: string;
  readonly etichetta: string;
  readonly categoriaEtichetta: string;
  readonly livelloResiduo: string;
}

const PROFONDITA = [
  {
    chiave: 'sintetica',
    testo: 'Sintetico',
    spiegazione: 'Solo il registro dei rischi. Per una revisione rapida fra professionisti.',
  },
  {
    chiave: 'motivata',
    testo: 'Motivato',
    spiegazione: 'Con il perché di ogni valutazione. È il livello che rende il documento difendibile.',
  },
  {
    chiave: 'approfondita',
    testo: 'Approfondito',
    spiegazione: 'Anche i controlli attesi, i riferimenti normativi e cosa resta da verificare.',
  },
] as const;

export function SelezioneRischi({
  rischi,
  esclusi,
  profondita,
}: {
  rischi: readonly RischioSelezionabile[];
  esclusi: readonly string[];
  profondita: string;
}) {
  const router = useRouter();
  const percorso = usePathname();
  const parametri = useSearchParams();
  const [aperto, setAperto] = useState(false);
  const [inCorso, avvia] = useTransition();

  /*
    Lo stato della casella è **locale**, e cambia al clic.

    Legarlo direttamente all'indirizzo sembrava più pulito — una sola fonte di verità — ma
    a schermo era rotto: la casella resta com'era finché il server non ha rigenerato la
    pagina, quindi si clicca e non succede niente. Su una linea lenta si clicca due volte,
    e la seconda annulla la prima.

    L'indirizzo resta comunque la verità **del documento**: lo stato locale corre avanti
    di qualche decina di millisecondi e poi i due coincidono. Se l'indirizzo cambia da
    fuori — il tasto «indietro», un collegamento incollato — lo stato si riallinea qui
    sotto, durante il render.
  */
  const [fuori, setFuori] = useState<ReadonlySet<string>>(() => new Set(esclusi));
  const [ultimoDaFuori, setUltimoDaFuori] = useState(esclusi.join(','));

  if (esclusi.join(',') !== ultimoDaFuori) {
    setUltimoDaFuori(esclusi.join(','));
    setFuori(new Set(esclusi));
  }

  function applica(nuovi: ReadonlySet<string>): void {
    setFuori(nuovi);

    const q = new URLSearchParams(parametri.toString());
    if (nuovi.size === 0) q.delete('escludi');
    else q.set('escludi', [...nuovi].join(','));

    const stringa = q.toString();
    avvia(() => {
      router.replace(stringa === '' ? percorso : `${percorso}?${stringa}`, { scroll: false });
    });
  }

  /*
    Il livello segue lo stesso principio della selezione: sta nell'indirizzo, e lo stato
    locale corre avanti perché il pulsante risponda subito invece che al ritorno del server.
  */
  const [livello, setLivello] = useState(profondita);
  const [ultimoDaFuoriLivello, setUltimoDaFuoriLivello] = useState(profondita);

  if (profondita !== ultimoDaFuoriLivello) {
    setUltimoDaFuoriLivello(profondita);
    setLivello(profondita);
  }

  function cambiaProfondita(nuovo: string): void {
    setLivello(nuovo);

    const q = new URLSearchParams(parametri.toString());
    // Il livello predefinito non si scrive nell'indirizzo: un collegamento pulito è più
    // facile da incollare, e «nessun parametro» deve significare «il documento normale».
    if (nuovo === 'motivata') q.delete('profondita');
    else q.set('profondita', nuovo);

    const stringa = q.toString();
    avvia(() => {
      router.replace(stringa === '' ? percorso : `${percorso}?${stringa}`, { scroll: false });
    });
  }

  function commuta(id: string): void {
    const nuovi = new Set(fuori);
    if (nuovi.has(id)) nuovi.delete(id);
    else nuovi.add(id);
    applica(nuovi);
  }

  return (
    <div className="no-print mb-4 rounded-lg border border-bordo bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <button
            type="button"
            onClick={() => {
              setAperto(!aperto);
            }}
            aria-expanded={aperto}
            className="text-sm font-medium underline decoration-dotted underline-offset-4"
          >
            Scegli i rischi da includere
          </button>
          <p className="mt-0.5 text-xs text-testo-tenue">
            {fuori.size === 0
              ? `Tutti i ${rischi.length} rischi rilevati sono nel documento.`
              : `${rischi.length - fuori.size} rischi su ${rischi.length}. Le esclusioni sono dichiarate nel documento.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Il livello di dettaglio del ragionamento.

            Non cambia l'analisi — che è una sola — ma quanto del suo perché finisce sulla
            carta: una revisione fra professionisti vuole il registro e basta, una consegna
            al cliente vuole le motivazioni, una discussione tecnica vuole anche i controlli
            attesi e le norme.
          */}
          <span className="text-xs text-testo-tenue">Dettaglio:</span>
          <div role="group" aria-label="Livello di dettaglio del report" className="flex">
            {PROFONDITA.map((p, indice) => (
              <button
                key={p.chiave}
                type="button"
                aria-pressed={livello === p.chiave}
                title={p.spiegazione}
                onClick={() => {
                  cambiaProfondita(p.chiave);
                }}
                className={`border px-2.5 py-1.5 text-sm transition ${
                  indice === 0 ? 'rounded-l' : ''
                } ${indice === PROFONDITA.length - 1 ? 'rounded-r' : ''} ${indice > 0 ? '-ml-px' : ''} ${
                  livello === p.chiave
                    ? 'relative border-marchio bg-azione text-azione-testo'
                    : 'border-bordo-forte bg-superficie hover:border-marchio/50'
                }`}
              >
                {p.testo}
              </button>
            ))}
          </div>

          {fuori.size > 0 && (
            <button
              type="button"
              onClick={() => {
                applica(new Set());
              }}
              className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio/50"
            >
              Rimetti tutti
            </button>
          )}
        </div>
      </div>

      {aperto && (
        <ul
          // Mentre il documento si rigenera l'elenco si attenua: dice che sta succedendo
          // qualcosa senza spostare nulla a schermo.
          className={`grid gap-x-6 gap-y-1 border-t border-bordo p-3 transition-opacity sm:grid-cols-2 ${
            inCorso ? 'opacity-60' : ''
          }`}
        >
          {rischi.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-start gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  checked={!fuori.has(r.id)}
                  onChange={() => {
                    commuta(r.id);
                  }}
                  className="mt-1"
                />
                <span>
                  {r.etichetta}
                  <span className="block text-xs text-testo-tenue">
                    {r.categoriaEtichetta} · rischio residuo {r.livelloResiduo}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
