/**
 * Le fotografie delle ubicazioni, nel report.
 *
 * Nel documento di Insurance Advisor è un capitolo a sé, e ha una ragione: le fotografie
 * sono l'unica parte del fascicolo che non invecchia in modo discutibile. Un capitale
 * ricalcolato si contesta, una fotografia datata dice com'era — ed è ciò che serve
 * davvero quando, tre anni dopo un sinistro, qualcuno chiede perché quella copertura era
 * stata proposta così.
 *
 * ## Due attenzioni di stampa
 *
 * Le immagini sono `data:` URI: la stampa non deve attenderne il caricamento da nessuna
 * rete, ed è il motivo per cui questo documento si può salvare in PDF e spedire.
 *
 * Ogni ubicazione sta in un blocco `print-keep`, così una didascalia non finisce staccata
 * dalla propria fotografia a cavallo di pagina — che in un documento consegnato a un
 * cliente è il difetto che si nota per primo.
 */

import type { AnalisiDto, ImmagineUbicazioneDto } from '@/lib/api';

type Ubicazione = AnalisiDto['ubicazioni']['elenco'][number];

export function ImmaginiUbicazioni({
  ubicazioni,
  immagini,
}: {
  ubicazioni: readonly Ubicazione[];
  immagini: readonly ImmagineUbicazioneDto[];
}) {
  /*
    Si scorre l'elenco delle ubicazioni, non quello delle immagini: l'ordine del documento
    deve essere quello del capitolo sulle ubicazioni, non quello di caricamento. Le
    fotografie il cui indirizzo non compare più nella visura restano fuori — sono la
    memoria di un'ubicazione che l'impresa non ha più.
  */
  const gruppi = ubicazioni
    .map((u) => ({ ubicazione: u, sue: immagini.filter((i) => i.ubicazioneId === u.id) }))
    .filter((g) => g.sue.length > 0);

  if (gruppi.length === 0) return null;

  return (
    <div className="space-y-5">
      {gruppi.map(({ ubicazione, sue }) => (
        <div key={ubicazione.id} className="print-keep">
          <p className="font-semibold">{ubicazione.etichetta}</p>
          <p className="text-xs text-testo-tenue">
            {ubicazione.via} {ubicazione.civico ?? ''}, {ubicazione.comune} ({ubicazione.provincia})
          </p>

          <div className="mt-2 grid grid-cols-2 gap-3">
            {sue.map((i) => (
              <figure key={i.id} className="print-keep">
                {/* Data URI locale: nulla da ottimizzare, e `next/image` vuole un dominio noto. */}
                <img
                  src={i.dati}
                  alt={i.didascalia ?? `Fotografia di ${ubicazione.etichetta}`}
                  className="w-full rounded border border-bordo object-cover"
                />
                <figcaption className="mt-1 text-xs leading-snug text-testo-tenue">
                  {i.didascalia ?? <span className="italic">senza didascalia</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs leading-relaxed text-testo-debole">
        Fotografie fornite dall&apos;intermediario e riferite alla data di rilevazione. Documentano lo stato
        dei luoghi osservato in quel momento e non costituiscono una perizia.
      </p>
    </div>
  );
}
