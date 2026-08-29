import Link from 'next/link';
import type { RisultatoRicerca } from '@/lib/api';

/**
 * Il risultato di una ricerca: **tutto** il record acquistato.
 *
 * Due volte si è provato a mostrarne una selezione — prima sei colonne di tabella, poi
 * otto numeri di sintesi — e due volte la selezione era troppo stretta. Chi paga un record
 * intero si aspetta un record intero, e ha ragione: decidere cosa nascondere spettava a
 * chi guarda, non a chi scrive il codice.
 *
 * Qui c'è quanto l'anagrafica estesa restituisce: dati camerali completi, tutti gli
 * esercizi di bilancio sintetico che il registro conserva, e la compagine sociale.
 * L'analisi resta il passo successivo — riclassifica i bilanci, calcola merito creditizio,
 * rischi e somme assicurande — ma da qui si vede già se vale la pena di farla.
 */
export function SchedaRisultato({ azienda }: { azienda: RisultatoRicerca }) {
  const a = azienda.anagrafica;

  return (
    <div className="rounded-lg border border-bordo bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{azienda.denominazione}</p>
          <p className="mt-0.5 text-xs text-testo-debole">
            <span className="tabular">{azienda.partitaIva ?? '—'}</span>
            {a !== null && ` · ${a.formaGiuridicaDescrizione}`}
            {' · '}
            {azienda.comune ?? '—'}
            {azienda.provincia !== null && ` (${azienda.provincia})`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/*
            Lo stato camerale prima dell'analisi: analizzare un'impresa cessata spende
            credito per un profilo che non serve a nessun preventivo.
          */}
          {azienda.statoAttivita === 'attiva' ? (
            <span className="rounded border border-basso/30 bg-basso-fondo px-1.5 py-0.5 text-xs font-medium text-basso">
              attiva
            </span>
          ) : (
            <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium capitalize text-critico">
              {azienda.statoAttivita.replace('-', ' ')}
            </span>
          )}
          <Link
            href={`/azienda/${azienda.providerId}`}
            className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
          >
            Analizza
          </Link>
        </div>
      </div>

      {a !== null && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-bordo pt-4 sm:grid-cols-4">
          <Voce etichetta="Sede legale" valore={indirizzoDi(a)} ampia />
          <Voce etichetta="ATECO" valore={ateco(a)} ampia />
          <Voce etichetta="Numero REA" valore={a.numeroREA ?? 'n.d.'} />
          <Voce etichetta="Camera di commercio" valore={a.cciaa ?? 'n.d.'} />
          <Voce etichetta="Costituita il" valore={giorno(a.dataCostituzione)} />
          <Voce etichetta="Inizio attività" valore={giorno(a.dataInizioAttivita)} />
          <Voce etichetta="Capitale deliberato" valore={centesimi(a.capitaleSocialeDeliberato)} />
          <Voce etichetta="Capitale versato" valore={centesimi(a.capitaleSocialeVersato)} />
          <Voce etichetta="Addetti dichiarati" valore={numero(a.numeroAddetti)} />
          <Voce etichetta="Codice catastale" valore={a.codiceCatastale ?? 'n.d.'} />
          <Voce etichetta="PEC" valore={a.pec ?? 'n.d.'} ampia />
          <Voce etichetta="Telefono" valore={a.telefono ?? 'n.d.'} />
          <Voce etichetta="Sito web" valore={a.sitoWeb ?? 'n.d.'} />
          {a.atecoSecondari.length > 0 && (
            <Voce etichetta="ATECO secondari" valore={a.atecoSecondari.join(', ')} ampia />
          )}
          {/*
            Cessazione e codice fiscale chiuso compaiono solo quando ci sono davvero: una
            riga «Cessata il: n.d.» su un'impresa viva è rumore che copre il resto.
          */}
          {a.dataCessazione !== null && <Voce etichetta="Cessata il" valore={giorno(a.dataCessazione)} />}
          {a.codiceFiscaleCessato === true && <Voce etichetta="Codice fiscale" valore="cessato" />}
        </dl>
      )}

      {azienda.bilanciSintetici.length > 0 && (
        <div className="mt-4 border-t border-bordo pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-testo-debole">
            Bilanci depositati · {azienda.bilanciSintetici.length}{' '}
            {azienda.bilanciSintetici.length === 1 ? 'esercizio' : 'esercizi'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">
                Esercizi depositati al Registro Imprese, dal più recente
              </caption>
              <thead className="text-left text-xs uppercase tracking-wide text-testo-debole">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">
                    Anno
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Fatturato
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Patrimonio netto
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Totale attivo
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Costo personale
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Dipendenti
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    RAL media
                  </th>
                </tr>
              </thead>
              <tbody>
                {azienda.bilanciSintetici.map((b) => (
                  <tr key={b.anno} className="border-t border-bordo">
                    <td className="tabular py-1.5 font-medium">{b.anno}</td>
                    <td className="tabular py-1.5 text-right">{centesimi(b.fatturato)}</td>
                    {/*
                      Un patrimonio netto negativo non è un dettaglio contabile: è la
                      soglia oltre cui scattano gli obblighi degli artt. 2446 e 2447 c.c.,
                      e cambia radicalmente il merito creditizio. Va visto a colpo d'occhio.
                    */}
                    <td
                      className={`tabular py-1.5 text-right ${
                        b.patrimonioNetto !== null && b.patrimonioNetto < 0
                          ? 'font-medium text-critico'
                          : ''
                      }`}
                    >
                      {centesimi(b.patrimonioNetto)}
                    </td>
                    <td className="tabular py-1.5 text-right">{centesimi(b.totaleAttivo)}</td>
                    <td className="tabular py-1.5 text-right">{centesimi(b.costoDelPersonale)}</td>
                    <td className="tabular py-1.5 text-right">{numero(b.dipendenti)}</td>
                    <td className="tabular py-1.5 text-right">{centesimi(b.retribuzioneMediaLorda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {azienda.soci.length > 0 && (
        <div className="mt-4 border-t border-bordo pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-testo-debole">
            Compagine sociale
          </p>
          <ul className="space-y-1.5">
            {azienda.soci.map((s) => (
              <li key={`${s.denominazione}-${s.codiceFiscale ?? ''}`} className="text-sm">
                <span className="font-medium">{s.denominazione}</span>
                {s.quotaPercentuale !== null && (
                  <span className="tabular"> · {(s.quotaPercentuale * 100).toFixed(2)}%</span>
                )}
                {s.codiceFiscale !== null && (
                  <span className="tabular text-testo-debole"> · {s.codiceFiscale}</span>
                )}
                <span className="text-testo-debole">
                  {' · '}
                  {s.tipo === 'persona-giuridica' ? 'persona giuridica' : 'persona fisica'}
                </span>
                {s.socioDal !== null && (
                  <span className="text-testo-debole"> · socio dal {giorno(s.socioDal)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-bordo pt-3 text-xs leading-relaxed text-testo-tenue">
        Dal Registro Imprese, già compreso nel costo di questa ricerca. Con l&apos;analisi arrivano bilanci
        riclassificati, merito creditizio, registro dei rischi ISO 31000, somme assicurande e verifica
        dell&apos;obbligo catastrofale; con l&apos;approfondimento anche amministratori, sedi operative,
        gruppo societario e gli indicatori già elaborati dall&apos;archivio.
      </p>
    </div>
  );
}

function Voce({
  etichetta,
  valore,
  ampia = false,
}: {
  etichetta: string;
  valore: string;
  /** Gli indirizzi e le descrizioni ATECO su una sola colonna vanno a capo tre volte. */
  ampia?: boolean;
}) {
  return (
    <div className={ampia ? 'col-span-2' : ''}>
      <dt className="text-xs text-testo-debole">{etichetta}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valore}</dd>
    </div>
  );
}

function indirizzoDi(a: NonNullable<RisultatoRicerca['anagrafica']>): string {
  const s = a.sedeLegale;
  if (s === null) return 'n.d.';
  const via = [s.via, s.civico].filter((p) => p !== null && p !== '').join(' ');
  const localita = [s.frazione, s.comune].filter((p) => p !== null && p !== '').join(' — ');
  return [via, `${s.cap} ${localita} (${s.provincia})`].filter((p) => p !== '').join(', ');
}

function ateco(a: NonNullable<RisultatoRicerca['anagrafica']>): string {
  if (a.atecoPrimario === null) return 'n.d.';
  return a.atecoPrimarioDescrizione === null
    ? a.atecoPrimario
    : `${a.atecoPrimario} — ${a.atecoPrimarioDescrizione}`;
}

/**
 * Gli importi del dominio viaggiano in **centesimi**.
 *
 * Sono interi, e un intero non perde precisione sommandosi: la divisione avviene una volta
 * sola, qui, dove si stampa. È la ragione per cui il modello non usa numeri decimali.
 */
function centesimi(valore: number | null): string {
  return valore === null
    ? 'n.d.'
    : new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(valore / 100);
}

function giorno(iso: string | null): string {
  return iso === null ? 'n.d.' : new Date(iso).toLocaleDateString('it-IT');
}

/** «Non disponibile» e «zero» non sono la stessa cosa, e non vanno stampati uguali. */
function numero(valore: number | null): string {
  return valore === null ? 'n.d.' : new Intl.NumberFormat('it-IT').format(valore);
}
