/**
 * Il ragionamento dietro ogni rischio, esposto secondo il livello richiesto.
 *
 * Questi dati l'analisi li produce già tutti — perché un rischio è stato identificato,
 * cosa ne ha alzato o abbassato la valutazione, quali controlli l'impresa ha in essere,
 * su quali norme si fonda — e il report finora li buttava, mostrando solo la tabella dei
 * punteggi.
 *
 * ## Una sola analisi, tre profondità di esposizione
 *
 * Il livello **non cambia mai i numeri**: cambia quanto del ragionamento finisce sulla
 * carta. Nessun cliente riceve una valutazione più povera, riceve un documento più corto —
 * ed è la ragione per cui anche il livello sintetico dichiara che le motivazioni esistono
 * e restano nel fascicolo. Un documento breve che tace di esserlo è un documento che
 * inganna.
 */

import type { AnalisiDto, VoceConDelta } from '@/lib/api';
import type { Profondita } from './page';

type Rischio = AnalisiDto['rischi'][number];

export function DettaglioRischi({
  rischi,
  profondita,
}: {
  rischi: readonly Rischio[];
  profondita: Profondita;
}) {
  if (profondita === 'sintetica') {
    return (
      <p className="mt-4 text-xs leading-relaxed text-testo-debole">
        Questa copia riporta il registro in forma sintetica. Per ciascun rischio l&apos;analisi conserva la
        motivazione dell&apos;identificazione, i fattori che ne hanno modulato probabilità e impatto, i
        controlli rilevati e i riferimenti normativi: sono disponibili nel fascicolo e possono essere
        riportati su richiesta.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-testo-tenue">
        Motivazione delle valutazioni
      </p>

      {rischi.map((r) => (
        <div key={r.id} className="print-keep border-l-2 border-bordo-forte pl-3">
          <p className="font-semibold">
            {r.etichetta}
            <span className="ml-2 text-xs font-normal text-testo-tenue">
              {r.categoriaEtichetta} · residuo {r.punteggioResiduo} ({r.livelloResiduoEtichetta})
            </span>
          </p>

          <p className="mt-1 text-sm leading-relaxed text-testo-tenue">{r.descrizione}</p>

          {r.motivazioni.identificazione.length > 0 && (
            <Elenco titolo="Perché riguarda questa impresa" voci={r.motivazioni.identificazione} />
          )}

          {r.motivazioni.modulazione.length > 0 && (
            <ElencoConDelta
              titolo="Cosa ne ha modificato la valutazione"
              voci={r.motivazioni.modulazione}
            />
          )}

          {r.motivazioni.controlli.length > 0 && (
            <ElencoConDelta titolo="Misure già adottate dall’impresa" voci={r.motivazioni.controlli} />
          )}

          {profondita === 'approfondita' && (
            <>
              {/*
                Il livello approfondito serve a una conversazione diversa: non «perché
                questo rischio», ma «cosa manca». I controlli tipici sono la lista da cui
                nasce la prossima visita, e i riferimenti normativi sono ciò che un
                collega o un ispettore chiede quando la valutazione non gli torna.
              */}
              {r.controlliTipici.length > 0 && (
                <Elenco titolo="Misure attese su un rischio di questo tipo" voci={r.controlliTipici} />
              )}
              {r.riferimenti.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-testo-debole">
                  <span className="font-medium">Riferimenti: </span>
                  {r.riferimenti.join(' · ')}
                </p>
              )}
              {r.daVerificare && (
                <p className="mt-2 text-xs leading-relaxed text-attenzione">
                  Valutazione formulata su dati presuntivi: va confermata con l&apos;impresa prima di
                  fondarci una proposta.
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Elenco({ titolo, voci }: { titolo: string; voci: readonly string[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-testo-tenue">{titolo}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
        {voci.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Le voci che hanno spostato la valutazione, con **quanto** l'hanno spostata.
 *
 * Il numero accanto alla motivazione è ciò che distingue un'analisi da un'opinione: dice
 * di quanto quel fatto ha alzato o abbassato probabilità e impatto, e quindi permette a
 * chi legge di non essere d'accordo su una cifra precisa invece che sull'impressione
 * generale.
 */
function ElencoConDelta({ titolo, voci }: { titolo: string; voci: readonly VoceConDelta[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-testo-tenue">{titolo}</p>
      <ul className="mt-0.5 space-y-0.5 text-sm leading-relaxed">
        {voci.map((v) => (
          <li key={v.motivazione} className="flex gap-2">
            {/*
              Su un fatto non rilevato la modulazione non si applica, e stampare «0P 0I»
              mette un numero al posto di un motivo: la riga lo dice già in fondo, con
              «(da verificare)». Dove non c'è uno spostamento non si stampa uno zero.
            */}
            {!v.suDatoIgnoto && (
              <span className="tabular mt-0.5 shrink-0 text-xs text-testo-debole">
                {segno(v.deltaProbabilita)}P {segno(v.deltaImpatto)}I
              </span>
            )}
            <span>{v.motivazione}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uno zero si scrive «0», non «+0»: un segno su un valore nullo è rumore. */
function segno(valore: number): string {
  if (valore === 0) return '0';
  return valore > 0 ? `+${valore}` : String(valore);
}
