/**
 * Il contesto fisico delle ubicazioni, nel report.
 *
 * Risponde alle due domande che un assuntore incendio si pone sempre e a cui nessun
 * bilancio risponde: in quanto arrivano i pompieri, e cosa c'è intorno.
 *
 * ## Tre regole che questa sezione non può violare
 *
 *  1. **L'attribuzione della fonte è obbligatoria.** I dati sono OpenStreetMap, licenza
 *     ODbL: mostrarli senza citarla è una violazione di licenza, non una svista di stile.
 *     Per questo la fonte arriva dentro il dato e viene stampata qui sotto.
 *  2. **`null` significa «non osservato», non «non c'è niente».** Un'ubicazione senza
 *     contesto non produce una sezione vuota che suggerisce un vicinato pulito: produce
 *     una riga che dice di non aver guardato.
 *  3. **Nessuna esclusione di rischio.** La copertura della fonte non è uniforme: si
 *     segnala ciò che si è visto, non si dichiara sicuro ciò che non si è visto.
 */

import type { AnalisiDto } from '@/lib/api';

type Ubicazione = AnalisiDto['ubicazioni']['elenco'][number];

export function ContestoUbicazioni({ ubicazioni }: { ubicazioni: readonly Ubicazione[] }) {
  const osservate = ubicazioni.filter((u) => u.contesto !== null);
  const nonOsservate = ubicazioni.filter((u) => u.contesto === null);

  // Le fonti, deduplicate: oggi è una sola, ma l'attribuzione non deve dipendere da questo.
  const fonti = [...new Set(osservate.map((u) => u.contesto?.fonte ?? ''))].filter((f) => f !== '');

  return (
    <div className="space-y-5">
      {osservate.map((u) => (
        <SchedaUbicazione key={u.id} ubicazione={u} />
      ))}

      {nonOsservate.length > 0 && (
        <div className="print-keep border-l-2 border-bordo-forte pl-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-testo-tenue">
            Ubicazioni non osservate
          </p>
          <p className="mt-1 text-sm text-testo-tenue">
            {nonOsservate.map((u) => u.etichetta).join(' · ')}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-testo-debole">
            Per queste ubicazioni il contesto non è stato rilevato — coordinate non disponibili
            oppure fonte non raggiunta. L&apos;assenza di segnalazioni{' '}
            <strong>non equivale</strong> all&apos;assenza di attività confinanti: la verifica
            resta a carico di chi sottoscrive.
          </p>
        </div>
      )}

      {fonti.length > 0 && (
        <p className="text-xs leading-relaxed text-testo-debole">
          Fonte dei dati territoriali: {fonti.join(', ')}. Distanze in linea d&apos;aria; il tempo
          di arrivo è una stima su percorrenza media e non una previsione del soccorso. I dati sono
          collaborativi e la copertura non è uniforme: un&apos;attività non mappata può comunque
          esistere, e questa sezione serve a segnalare, non a escludere.
        </p>
      )}
    </div>
  );
}

function SchedaUbicazione({ ubicazione }: { ubicazione: Ubicazione }) {
  const c = ubicazione.contesto;
  if (c === null) return null;

  const aggravanti = c.attivitaVicine.filter((a) => a.aggravaIlRischio);
  const altre = c.attivitaVicine.filter((a) => !a.aggravaIlRischio);

  return (
    <div className="print-keep">
      <p className="font-semibold">{ubicazione.etichetta}</p>
      <p className="text-xs text-testo-tenue">
        {ubicazione.via} {ubicazione.civico ?? ''}, {ubicazione.comune} ({ubicazione.provincia})
      </p>

      {/* ── Soccorso ─────────────────────────────────────────────────────── */}
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-testo-tenue">
        Presidi dei vigili del fuoco
      </p>
      {c.vigiliDelFuoco.length === 0 ? (
        <p className="mt-1 text-sm text-testo-tenue">
          Nessun presidio mappato entro il raggio di ricerca. Da verificare direttamente: è un
          fattore che incide sulla dimensione del danno, non sulla sua probabilità.
        </p>
      ) : (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {c.vigiliDelFuoco.map((v) => (
              <tr key={`${v.nome}-${v.distanzaKm}`} className="border-b border-bordo">
                <td className="py-1.5 pr-4">{v.nome}</td>
                <td className="tabular py-1.5 pr-4 text-right text-testo-tenue">
                  {v.distanzaKm.toLocaleString('it-IT', { maximumFractionDigits: 1 })} km
                </td>
                <td className="tabular py-1.5 text-right font-medium">
                  ~{v.minutiStimati} min
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Vicinanze ────────────────────────────────────────────────────── */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-testo-tenue">
        Attività entro {c.raggioAnalizzatoMetri} metri
      </p>

      {c.attivitaVicine.length === 0 ? (
        <p className="mt-1 text-sm text-testo-tenue">
          Nessuna attività rilevata nel raggio analizzato.
        </p>
      ) : (
        <>
          {aggravanti.length > 0 && (
            <>
              <p className="mt-1 text-sm">
                <strong>
                  {aggravanti.length} attività che aggravano il rischio di propagazione
                </strong>{' '}
                — lavorazioni con inneschi, solventi o depositi di combustibile. È l&apos;informazione
                che i questionari incendio chiedono espressamente.
              </p>
              <ul className="mt-1.5 space-y-1 text-sm">
                {aggravanti.map((a) => (
                  <li
                    key={`${a.nome}-${a.distanzaMetri}`}
                    className="flex items-baseline justify-between gap-4 border-b border-bordo pb-1"
                  >
                    <span>
                      {a.nome} <span className="text-testo-tenue">· {a.categoria}</span>
                    </span>
                    <span className="tabular whitespace-nowrap text-testo-tenue">
                      {a.distanzaMetri} m
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {altre.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-testo-debole">
              Altre {altre.length} attività rilevate senza aggravio specifico del rischio incendio:{' '}
              {altre
                .slice(0, 12)
                .map((a) => a.categoria)
                .join(', ')}
              {altre.length > 12 && ' e altre'}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
