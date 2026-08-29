import { richiediSessione } from '@/lib/sessione';
import { leggiCosti, statoServizio } from '@/lib/api';
import { Avviso, Scheda, Sezione } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Dove sono finiti i soldi.
 *
 * Il registro delle spese esisteva già — ogni chiamata a pagamento ci scrive dentro — e
 * non era visibile da nessuna parte. Si poteva leggere solo interrogando il servizio a
 * mano, cosa che un intermediario non farà mai.
 *
 * L'effetto è stato osservato dal vivo: una notte intera passata a chiedersi dove
 * andassero i centesimi, con la sensazione che il prodotto li bruciasse a caso. Non li
 * bruciava — ma senza questa pagina non c'era modo di saperlo, e la sensazione conta
 * quanto il fatto quando i soldi sono di chi guarda.
 *
 * Sta fra le impostazioni e non nella barra principale perché non è un'attività: è una
 * verifica, e la si fa quando si vuole controllare, non a ogni analisi.
 */
export default async function PaginaCosti() {
  await richiediSessione();

  const [costi, stato] = await Promise.all([
    leggiCosti().catch(() => null),
    statoServizio().catch(() => null),
  ]);

  if (costi === null) {
    return (
      <Avviso tono="critico" titolo="Registro non disponibile">
        Non è stato possibile leggere il registro delle spese. Verificare che il servizio di analisi sia
        attivo.
      </Avviso>
    );
  }

  const euro = (v: number): string => `${v.toFixed(2).replace('.', ',')} €`;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Consumi dei dati</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Ogni chiamata a pagamento verso l&apos;archivio camerale scrive qui. I conteggi di ricerca non
          compaiono perché non costano nulla.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Scheda>
          <p className="text-xs uppercase tracking-wide text-testo-debole">Speso in totale</p>
          <p className="tabular mt-1 text-2xl font-bold">{euro(costi.totaleEuro)}</p>
        </Scheda>
        <Scheda>
          <p className="text-xs uppercase tracking-wide text-testo-debole">Chiamate a pagamento</p>
          <p className="tabular mt-1 text-2xl font-bold">{costi.chiamate}</p>
        </Scheda>
        <Scheda>
          <p className="text-xs uppercase tracking-wide text-testo-debole">
            Risparmiato dall&apos;archivio
          </p>
          <p className="tabular mt-1 text-2xl font-bold">{euro(costi.risparmioDaCacheEuro)}</p>
          <p className="mt-1 text-xs text-testo-debole">Dati già acquistati e riusati senza ricomprarli.</p>
        </Scheda>
      </div>

      <Sezione titolo="Per servizio" sottotitolo="Cosa è stato comprato, e quante volte.">
        {costi.perServizio.length === 0 ? (
          <Scheda>
            <p className="text-sm text-testo-tenue">
              Nessuna spesa registrata. In modalità dimostrativa non si consuma credito.
            </p>
          </Scheda>
        ) : (
          <div className="overflow-hidden rounded-lg border border-bordo">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Servizio</th>
                  <th className="px-4 py-2.5 text-right font-medium">Chiamate</th>
                  <th className="px-4 py-2.5 text-right font-medium">Speso</th>
                </tr>
              </thead>
              <tbody>
                {[...costi.perServizio]
                  .sort((a, b) => b.costoEuro - a.costoEuro)
                  .map((s) => (
                    <tr key={s.servizio} className="border-t border-bordo">
                      <td className="px-4 py-2.5">{s.servizio.replace('OpenAPI.com/', '')}</td>
                      <td className="tabular px-4 py-2.5 text-right text-testo-tenue">{s.chiamate}</td>
                      <td className="tabular px-4 py-2.5 text-right font-medium">{euro(s.costoEuro)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>

      {stato !== null && (
        <Sezione titolo="Listino" sottotitolo="Quanto costa ogni gesto, dal listino del fornitore.">
          <Scheda>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Voce
                etichetta="Analisi di un'azienda"
                valore={centesimi(stato.costoAnalisiCentesimi)}
                nota="anagrafica, soci, bilanci sintetici, score, rischi"
              />
              <Voce
                etichetta="Verifica protesti e procedure"
                valore={centesimi(stato.costoEventiNegativiCentesimi)}
                nota="si acquista dalla scheda, non è compresa"
              />
              <Voce
                etichetta="Analisi approfondita"
                valore={centesimi(stato.costoApprofondimentoCentesimi)}
                nota="cariche, sedi operative, gruppo, indici elaborati"
              />
              <Voce
                etichetta="Riga di un elenco prospect"
                valore="0,05 €"
                nota="il conteggio delle aziende è gratuito"
              />
            </dl>
          </Scheda>
        </Sezione>
      )}

      {/*
        La differenza fra questo registro e l'estratto conto del fornitore va detta, non
        lasciata scoprire: gli strumenti da riga di comando spendono senza scrivere qui, e
        chi confronta i due numeri deve sapere perché non tornano.
      */}
      <p className="mt-6 text-xs leading-relaxed text-testo-debole">
        Questo registro contiene le chiamate fatte <strong>dalla piattaforma</strong>. Gli strumenti
        diagnostici da riga di comando spendono senza comparire qui: il totale autorevole resta quello della
        console del fornitore.
      </p>
    </>
  );
}

function centesimi(v: number): string {
  return `${(v / 100).toFixed(2).replace('.', ',')} €`;
}

function Voce({ etichetta, valore, nota }: { etichetta: string; valore: string; nota: string }) {
  return (
    <div>
      <dt className="text-sm">{etichetta}</dt>
      <dd className="tabular mt-0.5 text-lg font-semibold">{valore}</dd>
      <dd className="text-xs text-testo-debole">{nota}</dd>
    </div>
  );
}
