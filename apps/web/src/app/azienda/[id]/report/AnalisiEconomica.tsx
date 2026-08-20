import type { AndamentoEsercizioDto, SchemaMargineDto } from '@/lib/api';

/**
 * L'analisi economica: andamento pluriennale e schema del margine di contribuzione.
 *
 * Un esercizio solo è una fotografia; tre sono una direzione — ed è la direzione a dire se
 * l'impresa può permettersi il programma assicurativo che le si propone, e se il capitale
 * calcolato sull'ultimo bilancio è rappresentativo o è un anno anomalo.
 *
 * Lo schema del margine esiste per una ragione sola: **farsi verificare**. È il numero da
 * cui nasce la garanzia danni indiretti, e l'imprenditore lo porta al proprio
 * commercialista. Mostrare solo il totale chiede di fidarsi; mostrare le righe, e
 * soprattutto **quale quota di ciascuna voce è stata considerata variabile**, si lascia
 * discutere. È lì che sta il giudizio, ed è lì che una consulenza si distingue da un
 * preventivo.
 */
export function AnalisiEconomica({
  andamento,
  schema,
}: {
  andamento: readonly AndamentoEsercizioDto[];
  schema: SchemaMargineDto | null;
}) {
  return (
    <>
      {andamento.length > 0 && (
        <>
          <p className="mb-3">
            Andamento degli esercizi depositati al Registro Imprese. Le voci non valorizzate sono
            quelle che il bilancio depositato non riporta, non valori pari a zero.
          </p>

          <table className="print-keep mb-6 w-full border-collapse text-sm">
            <caption className="sr-only">
              Andamento pluriennale di produzione, patrimonio e costo del personale
            </caption>
            <thead>
              <tr className="border-b-2 border-testo text-left">
                <th scope="col" className="py-2 font-semibold">
                  Esercizio
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Valore della produzione
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Patrimonio netto
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Costo del personale
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Addetti
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Retribuzione media
                </th>
              </tr>
            </thead>
            <tbody>
              {andamento.map((e) => (
                <tr key={e.anno} className="border-b border-bordo">
                  <td className="tabular py-2 font-medium">{e.anno}</td>
                  <td className="tabular py-2 text-right">
                    {e.valoreDellaProduzione?.formattato ?? '—'}
                  </td>
                  {/*
                    Il patrimonio netto negativo è la soglia degli artt. 2446 e 2447 c.c.:
                    su una serie storica è il segnale che l'impresa ha già attraversato una
                    crisi, e non può stare in mezzo agli altri numeri come se fosse uno
                    qualsiasi.
                  */}
                  <td
                    className={`tabular py-2 text-right ${
                      (e.patrimonioNetto?.centesimi ?? 0) < 0 ? 'font-medium text-critico' : ''
                    }`}
                  >
                    {e.patrimonioNetto?.formattato ?? '—'}
                  </td>
                  <td className="tabular py-2 text-right">{e.costoDelPersonale?.formattato ?? '—'}</td>
                  <td className="tabular py-2 text-right">{e.dipendenti ?? '—'}</td>
                  <td className="tabular py-2 text-right">
                    {e.retribuzioneMediaLorda?.formattato ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {schema !== null && (
        <>
          <h3 className="mb-1 mt-6 font-semibold">Determinazione del margine di contribuzione</h3>
          <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
            Il margine di contribuzione è ciò che resta dei ricavi dopo i costi che cessano con
            l&apos;attività: è quindi la misura dei costi che l&apos;impresa continua a sostenere a
            stabilimento fermo, e la base della somma assicuranda per i danni indiretti. La colonna
            «quota variabile» è il punto in cui la stima si lascia discutere.
          </p>

          <table className="print-keep mb-3 w-full border-collapse text-sm">
            <caption className="sr-only">
              Schema di calcolo del margine di contribuzione, voce per voce
            </caption>
            <thead>
              <tr className="border-b-2 border-testo text-left">
                <th scope="col" className="py-2 font-semibold">
                  Voce di bilancio
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  A bilancio
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Quota variabile
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Effetto
                </th>
              </tr>
            </thead>
            <tbody>
              {schema.righe.map((r) => (
                <tr key={r.voce} className="border-b border-bordo align-top">
                  <td className="py-2 pr-3">
                    {r.voce}
                    <span className="mt-0.5 block text-xs leading-relaxed text-testo-debole">
                      {r.motivazione}
                    </span>
                  </td>
                  <td className="tabular py-2 text-right">{r.importoDiBilancio.formattato}</td>
                  <td className="tabular py-2 text-right">
                    {r.quotaVariabile === null ? '—' : `${Math.round(r.quotaVariabile * 100)}%`}
                  </td>
                  <td className="tabular py-2 text-right">{r.effetto.formattato}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-testo font-semibold">
                <td className="py-2">Margine di contribuzione</td>
                <td />
                <td className="tabular py-2 text-right text-xs font-normal text-testo-tenue">
                  {schema.incidenzaSuRicavi === null
                    ? ''
                    : `${(schema.incidenzaSuRicavi * 100).toFixed(1).replace('.', ',')}% dei ricavi`}
                </td>
                <td className="tabular py-2 text-right">
                  {schema.margineDiContribuzione.formattato}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
