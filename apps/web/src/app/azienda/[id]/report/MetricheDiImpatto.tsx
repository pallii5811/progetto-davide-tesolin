import type { MetricheDiImpattoDto } from '@/lib/api';

/**
 * Quale impatto economico è in grado di mettere in crisi l'impresa.
 *
 * È la domanda che precede ogni scelta assicurativa consapevole, e il motivo per cui questo
 * capitolo sta **prima** delle coperture: senza sapere dove sono i gradini, una franchigia è
 * un numero scelto a sentimento e un massimale è una cifra tonda.
 *
 * Ogni fascia porta due numeri. L'importo, che serve al tecnico. E i **giorni di fermo
 * equivalenti**, che servono all'imprenditore: «un milione e mezzo» non dice niente,
 * «centosette giorni con i cancelli chiusi» sì.
 */
export function MetricheDiImpatto({ dati }: { dati: MetricheDiImpattoDto }) {
  if (!dati.disponibile) return null;

  return (
    <>
      <p className="mb-4">
        Le soglie seguenti misurano a che punto un danno comincia a pesare e a che punto mette in
        discussione la continuità. Servono a scegliere consapevolmente cosa trattenere e cosa
        trasferire, in adempimento del dovere di diligenza degli amministratori (artt. 2392 e 2476
        c.c.) e dell&apos;obbligo di assetti adeguati alla continuità aziendale (art. 2086 c.c., come
        riformato dal Codice della crisi).
      </p>

      <table className="print-keep mb-4 w-full border-collapse text-sm">
        <caption className="sr-only">
          Fasce di impatto economico con importo e giorni di fermo attività equivalenti
        </caption>
        <thead>
          <tr className="border-b-2 border-testo text-left">
            <th scope="col" className="py-2 font-semibold">
              Fascia
            </th>
            <th scope="col" className="py-2 font-semibold">
              Descrizione
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Impatto
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Fermo attività
            </th>
          </tr>
        </thead>
        <tbody>
          {dati.fasce.map((f) => (
            <tr key={f.livello} className="border-b border-bordo align-top">
              <td className="py-2 pr-3 font-medium">{f.etichetta}</td>
              <td className="py-2 pr-3 text-xs leading-relaxed text-testo-tenue">
                {f.descrizione}
                <span className="mt-0.5 block text-testo-debole">Soglia: {f.ancoraggio}.</span>
              </td>
              <td className="tabular py-2 text-right font-medium">{f.importo.formattato}</td>
              <td className="tabular py-2 text-right">
                {f.giorniDiFermoEquivalenti === null
                  ? '—'
                  : `${f.giorniDiFermoEquivalenti} giorni`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="print-keep mb-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-bordo py-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-testo-debole">Perdita per giorno di fermo</dt>
          <dd className="tabular mt-0.5 font-medium">
            {dati.margineDiContribuzioneGiornaliero?.formattato ?? 'non ricavabile'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-testo-debole">Margine di tesoreria</dt>
          {/*
            Negativo significa che senza smobilizzare il magazzino l'impresa non copre i
            debiti a breve. Su un rischio incendio è doppiamente rilevante: il sinistro
            colpisce proprio le rimanenze da cui dipende la liquidità.
          */}
          <dd
            className={`tabular mt-0.5 font-medium ${
              dati.margineDiTesoreria.centesimi < 0 ? 'text-critico' : ''
            }`}
          >
            {dati.margineDiTesoreria.formattato}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-testo-debole">Indice di disponibilità</dt>
          <dd className="tabular mt-0.5 font-medium">
            {dati.indiceDiDisponibilita === null
              ? 'da rilevare'
              : dati.indiceDiDisponibilita.toFixed(2).replace('.', ',')}
            <span className="ml-2 text-xs font-normal text-testo-debole">
              ottimo &gt; 1,20 · critico &lt; 0,50
            </span>
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-testo-tenue">
        I giorni di fermo si ottengono dividendo l&apos;impatto per la perdita giornaliera da fermo
        totale. Esprimono l&apos;intervallo entro cui l&apos;impresa può ragionevolmente sostenersi
        dopo un&apos;interruzione produttiva: <strong>non tengono conto</strong> di effetti di medio
        periodo come la perdita definitiva di clienti chiave o le conseguenze reputazionali, che li
        accorciano.
      </p>
    </>
  );
}
