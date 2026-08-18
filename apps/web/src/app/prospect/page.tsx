import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';
import { cercaProspect } from '@/lib/api';
import type { RisultatoProspezione } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Ricerca di prospect.
 *
 * È l'unica pagina che porta clienti **nuovi** invece di analizzare quelli che si hanno
 * già, e l'unica in cui si descrive un insieme — un territorio, un settore, una
 * dimensione — invece di una singola azienda.
 *
 * Ciò che la rende usabile è il conteggio gratuito: il numero di aziende corrispondenti
 * si ottiene senza scaricare nulla e senza spendere, e l'elenco si acquista solo quando
 * quel numero ha senso. Senza, comporre una ricerca per tentativi costerebbe un centesimo
 * a tentativo — poco, ma abbastanza da far smettere di provare, che è il modo peggiore
 * di risparmiare.
 */
export default async function PaginaProspect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await richiediSessione();
  const parametri = await searchParams;

  const criteri = {
    denominazione: parametri['denominazione'] ?? '',
    provincia: parametri['provincia'] ?? '',
    ateco: parametri['ateco'] ?? '',
    addettiMin: parametri['addettiMin'] ?? '',
    addettiMax: parametri['addettiMax'] ?? '',
    fatturatoMinEuro: parametri['fatturatoMinEuro'] ?? '',
    fatturatoMaxEuro: parametri['fatturatoMaxEuro'] ?? '',
    // Quante aziende scaricare: il prezzo è **a record**, non a ricerca, e senza un lotto
    // dichiarato un elenco su una provincia intera costerebbe centinaia di euro.
    limite: parametri['limite'] ?? '25',
  };

  const haFiltri = Object.values(criteri).some((v) => v.trim() !== '');
  // `scarica` è l'unica azione che spende: senza, la pagina si limita a contare.
  const scarica = parametri['scarica'] === '1';

  let risultato: RisultatoProspezione | null = null;
  let errore: string | null = null;

  if (haFiltri) {
    try {
      risultato = await cercaProspect(criteri, { soloConteggio: !scarica });
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  const queryScarica = new URLSearchParams(
    Object.entries(criteri).filter(([, v]) => v.trim() !== ''),
  );
  queryScarica.set('limite', criteri.limite);
  queryScarica.set('scarica', '1');

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Ricerca di nuovi clienti</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Descrivi l&apos;impresa che cerchi — territorio, settore, dimensione — e scopri quante ne
          esistono. Contare non costa nulla: si paga solo l&apos;elenco, e solo quando lo chiedi.
        </p>
      </div>

      <Scheda className="mb-6">
        <form method="get" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              nome="provincia"
              etichetta="Provincia"
              valore={criteri.provincia}
              segnaposto="BS"
              maiuscolo
            />
            <Campo
              nome="ateco"
              etichetta="Codice ATECO"
              valore={criteri.ateco}
              segnaposto="2562"
              nota="Senza punti. Il confronto è esatto: 25 e 2562 sono due insiemi diversi."
            />
            <Campo
              nome="addettiMin"
              etichetta="Addetti da"
              valore={criteri.addettiMin}
              segnaposto="20"
              numerico
            />
            <Campo
              nome="addettiMax"
              etichetta="Addetti a"
              valore={criteri.addettiMax}
              segnaposto="250"
              numerico
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              nome="fatturatoMinEuro"
              etichetta="Fatturato da (€)"
              valore={criteri.fatturatoMinEuro}
              segnaposto="2000000"
              numerico
            />
            <Campo
              nome="fatturatoMaxEuro"
              etichetta="Fatturato a (€)"
              valore={criteri.fatturatoMaxEuro}
              segnaposto="50000000"
              numerico
            />
            <Campo
              nome="denominazione"
              etichetta="Denominazione contiene"
              valore={criteri.denominazione}
              segnaposto="parte della ragione sociale"
            />

            {/*
              Il lotto è una scelta economica, non tecnica: il servizio si paga a record,
              e questa tendina è il punto in cui l'utente decide quanto spendere.
            */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
                Quante scaricarne
              </span>
              <select
                name="limite"
                defaultValue={criteri.limite}
                className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio"
              >
                <option value="10">10 aziende · 0,50 €</option>
                <option value="25">25 aziende · 1,25 €</option>
                <option value="50">50 aziende · 2,50 €</option>
                <option value="100">100 aziende · 5,00 €</option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            className="rounded bg-marchio px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Conta quante sono
          </button>
        </form>
      </Scheda>

      {errore !== null && (
        <Avviso tono="attenzione" titolo="Ricerca non eseguita">
          {errore}
        </Avviso>
      )}

      {risultato !== null && risultato.soloConteggio && (
        <Scheda className="mb-6">
          {risultato.totale === 0 ? (
            <p className="text-sm text-testo-tenue">
              Nessuna azienda corrisponde a questi criteri. Sul codice ATECO conviene provare prima
              le sole due cifre della divisione, poi restringere: il confronto è esatto e una
              divisione non comprende le sue sottocategorie.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/*
                Due numeri distinti, e vanno tenuti distinti: quante aziende **esistono**
                e quante se ne **comprano**. Mostrarne uno solo farebbe credere di
                acquistare l'intero insieme, o di pagare una ricerca invece di un elenco.
              */}
              <div>
                <p className="tabular text-2xl font-bold">
                  {risultato.totale.toLocaleString('it-IT')}
                </p>
                <p className="text-sm text-testo-tenue">aziende corrispondono ai criteri</p>
                <p className="mt-1 text-sm">
                  Scaricandone <strong>{risultato.lotto}</strong> si spendono{' '}
                  <strong>
                    {(risultato.costoElencoCentesimi / 100).toFixed(2).replace('.', ',')} €
                  </strong>
                  <span className="text-testo-debole"> · 5 centesimi ad azienda</span>
                </p>
              </div>
              <Link
                href={`/prospect?${queryScarica.toString()}`}
                data-testid="scarica-elenco"
                className="rounded bg-marchio px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Scarica l&apos;elenco
              </Link>
            </div>
          )}
        </Scheda>
      )}

      {risultato !== null && !risultato.soloConteggio && (
        <>
          <p className="mb-3 text-sm text-testo-tenue">
            {risultato.aziende.length} aziende scaricate ·{' '}
            {(risultato.costoElencoCentesimi / 100).toFixed(2).replace('.', ',')} € spesi.
            Analizzarne una consuma credito a parte, come qualunque altra analisi.
          </p>
          <div className="overflow-hidden rounded-lg border border-bordo">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Denominazione</th>
                  <th className="px-4 py-2.5 font-medium">Partita IVA</th>
                  <th className="px-4 py-2.5 font-medium">Sede</th>
                  <th className="px-4 py-2.5 font-medium">ATECO</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {risultato.aziende.map((azienda) => (
                  <tr key={azienda.providerId} className="border-t border-bordo bg-superficie">
                    <td className="px-4 py-3 font-medium">{azienda.denominazione}</td>
                    <td className="tabular px-4 py-3 text-testo-tenue">
                      {azienda.partitaIva ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-testo-tenue">
                      {azienda.comune ?? '—'}
                      {azienda.provincia !== null && ` (${azienda.provincia})`}
                    </td>
                    <td className="tabular px-4 py-3 text-testo-tenue">{azienda.ateco ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/azienda/${azienda.providerId}`}
                        className="rounded bg-marchio px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        Analizza
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Campo({
  nome,
  etichetta,
  valore,
  segnaposto,
  nota,
  numerico = false,
  maiuscolo = false,
}: {
  nome: string;
  etichetta: string;
  valore: string;
  segnaposto?: string;
  nota?: string;
  numerico?: boolean;
  maiuscolo?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
        {etichetta}
      </span>
      <input
        type="text"
        name={nome}
        defaultValue={valore}
        placeholder={segnaposto}
        inputMode={numerico ? 'numeric' : 'text'}
        className={`w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none focus:border-marchio ${
          numerico ? 'tabular' : ''
        } ${maiuscolo ? 'uppercase' : ''}`}
      />
      {nota !== undefined && <span className="mt-1 block text-xs text-testo-debole">{nota}</span>}
    </label>
  );
}
