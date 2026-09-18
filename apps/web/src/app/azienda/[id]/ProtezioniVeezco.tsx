import type { AnalisiDto, MoneyDto, ProtezioniDto } from '@/lib/api';
import { Metrica, Sezione } from '@/components/ui';
import { Cerchio } from './Cerchio';
import { PopupProperty } from './PopupProperty';
import { PropertyPerSede } from './PropertyPerSede';

/**
 * Property Risk, Business Interruption e Cyber Risk: i tre riquadri in testa alla scheda e le
 * tre sezioni che li spiegano.
 *
 * Il calcolo è del motore, con le formule e le tabelle del foglio «Veezco_Analisi Rischio.xlsx».
 * Qui non si calcola niente: si mostra il risultato.
 *
 * Dal 18/09/2026 ogni rischio è un cerchio da 1 a 7, come nella slide di Luca che Simone ha
 * portato: il Property sede per sede, con rischio incendio, calamità naturali e punteggio
 * complessivo; la Business Interruption con il suo cerchio accanto agli scenari di fermo; il
 * Cyber con il totale e le quattro voci. Prima c'erano le formule in chiaro, poi tabelle di voci,
 * pesi e contributi con una frase per voce: esatte, e scritte per chi verifica un calcolo invece
 * che per chi decide una copertura. Le formule restano nel motore (`packages/core/src/protezioni`).
 */

type Protezioni = AnalisiDto['protezioni'];

const NON_DISPONIBILE = 'Il servizio non ha restituito il calcolo delle protezioni per questa analisi.';

/** Con la virgola, come il resto della pagina: `toFixed` scriverebbe il punto inglese. */
function numeroIt(valore: number, decimali: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(valore);
}

/** Al centesimo: la perdita giornaliera e gli scenari devono tornare fra loro a colpo d'occhio. */
function euroAlCentesimo(importo: MoneyDto): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo.euro);
}

const suSette = (punteggio: number, decimali: number): string => `${numeroIt(punteggio, decimali)} su 7`;

export function RiquadriProtezioni({ protezioni }: { protezioni: Protezioni }) {
  if (protezioni === undefined) {
    return (
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {['Property Risk', 'Business Interruption', 'Cyber Risk'].map((etichetta) => (
          <Metrica key={etichetta} etichetta={etichetta} valore="non disponibile" nota={NON_DISPONIBILE} />
        ))}
      </div>
    );
  }

  const { property, businessInterruption: bi, cyber } = protezioni;
  const trentaGiorni = bi.scenari.find((s) => s.giorni === 30);

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-3">
      {/*
        Il riquadro si apre in un popup con le lancette, come nella slide di Luca (richiesta di
        Simone del 14/09/2026). Il pulsante trasparente copre il riquadro senza sostituirne il
        contenuto: chi usa un lettore di schermo sente prima il punteggio, poi il pulsante.
      */}
      <div className="relative min-w-0">
        <Metrica
          etichetta="Property Risk"
          valore={property.punteggio === null ? 'non calcolabile' : suSette(property.punteggio, 2)}
          nota={`${
            property.punteggio === null
              ? (property.motivoNonCalcolabile ?? 'Il dettaglio è nella sezione Property Risk')
              : `Ubicazione più esposta: ${property.ubicazioneDiRiferimento ?? '—'}`
          }${property.ubicazioni.length > 0 ? ' · Clicca per le lancette' : ''}`}
          tono={property.punteggio === null ? 'attenzione' : 'neutro'}
        />
        <PopupProperty property={property} innesco="riquadro" />
      </div>
      <Metrica
        etichetta="Business Interruption"
        valore={
          bi.perditaGiornaliera === null
            ? 'da rilevare'
            : `${euroAlCentesimo(bi.perditaGiornaliera)} al giorno`
        }
        nota={
          bi.perditaGiornaliera === null
            ? 'Né margine di contribuzione né fatturato disponibili'
            : `Sul ${bi.base === 'fatturato' ? 'fatturato annuo' : 'margine di contribuzione annuo'}${
                trentaGiorni === undefined
                  ? ''
                  : ` · 30 giorni di fermo ${euroAlCentesimo(trentaGiorni.perdita)}`
              }`
        }
        tono={bi.perditaGiornaliera === null ? 'attenzione' : 'neutro'}
      />
      <Metrica
        etichetta="Cyber Risk"
        valore={cyber.punteggio === null ? 'non calcolabile' : suSette(cyber.punteggio, 1)}
        nota={
          cyber.punteggio === null || cyber.divisioneAteco === null
            ? (cyber.note[0] ?? 'Divisione ATECO non disponibile')
            : `ATECO ${cyber.divisioneAteco} · ${cyber.titoloDivisione ?? ''}`
        }
        tono={cyber.punteggio === null ? 'attenzione' : 'neutro'}
      />
    </div>
  );
}

export function SezioniProtezioni({
  protezioni,
  children,
}: {
  protezioni: Protezioni;
  /** Le ubicazioni e il loro rischio territoriale: stanno dentro il Property Risk, sotto i cerchi. */
  children?: React.ReactNode;
}) {
  /*
    Le tre sezioni ci sono sempre, anche senza il calcolo: il menu delle sezioni punta a questi
    tre identificativi, e un collegamento che non porta da nessuna parte è il difetto che quel
    menu esiste per non avere.
  */
  return (
    <>
      <Sezione
        id="property-risk"
        titolo="Property Risk"
        sottotitolo="Incendio e calamità naturali, sede per sede"
        azione={
          protezioni === undefined ? undefined : (
            <PopupProperty property={protezioni.property} innesco="pulsante" />
          )
        }
      >
        {protezioni === undefined ? <NonDisponibile /> : <PropertyPerSede property={protezioni.property} />}
        {children}
      </Sezione>
      <Sezione
        id="business-interruption"
        titolo="Business Interruption"
        sottotitolo="Quanto costa un fermo dell’attività"
      >
        {protezioni === undefined ? (
          <NonDisponibile />
        ) : (
          <CorpoBusinessInterruption protezioni={protezioni} />
        )}
      </Sezione>
      <Sezione id="cyber-risk" titolo="Cyber Risk" sottotitolo="Esposizione ai danni informatici">
        {protezioni === undefined ? <NonDisponibile /> : <CorpoCyber protezioni={protezioni} />}
      </Sezione>
    </>
  );
}

function NonDisponibile() {
  return <p className="text-sm text-testo-tenue">{NON_DISPONIBILE}</p>;
}

/** Il riquadro di un cerchio: titolo sopra, cerchio al centro, il resto sotto. */
function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-bordo bg-superficie p-5">
      <h3 className="mb-3 text-sm font-semibold">{titolo}</h3>
      {children}
    </div>
  );
}

function CorpoBusinessInterruption({ protezioni }: { protezioni: ProtezioniDto }) {
  const { businessInterruption: bi } = protezioni;
  const etichettaBase =
    bi.base === 'fatturato'
      ? 'Fatturato annuo'
      : bi.base === 'margine-di-contribuzione'
        ? 'Margine di contribuzione annuo'
        : 'Base annua';

  const righe: { voce: string; importo: string; testid?: string; evidenziata?: boolean }[] = [
    {
      voce: etichettaBase,
      importo: bi.baseAnnua === null ? 'da rilevare' : euroAlCentesimo(bi.baseAnnua),
    },
    {
      voce: 'Perdita giornaliera',
      importo: bi.perditaGiornaliera === null ? 'da rilevare' : euroAlCentesimo(bi.perditaGiornaliera),
      testid: 'bi-perdita-giornaliera',
      evidenziata: true,
    },
    ...bi.scenari.map((s) => ({
      voce: `Fermo di ${s.giorni} giorni`,
      importo: euroAlCentesimo(s.perdita),
      testid: `bi-scenario-${s.giorni}`,
    })),
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <Riquadro titolo="Rischio interruzione">
        <Cerchio valore={bi.punteggioFisico} etichetta="Rischio interruzione" grande />
      </Riquadro>
      <div className="overflow-x-auto rounded-xl border border-bordo">
        <table className="w-full text-sm">
          <tbody>
            {righe.map((r) => (
              <tr
                key={r.voce}
                data-testid={r.testid}
                className="border-t border-bordo bg-superficie first:border-t-0"
              >
                <td className="px-5 py-3.5 text-testo-tenue">{r.voce}</td>
                <td
                  className={`tabular px-5 py-3.5 text-right ${
                    r.evidenziata === true ? 'text-base font-semibold' : 'font-medium'
                  }`}
                >
                  {r.importo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CorpoCyber({ protezioni }: { protezioni: ProtezioniDto }) {
  const { cyber } = protezioni;

  if (cyber.punteggio === null || cyber.divisioneAteco === null) {
    return (
      <p className="text-sm text-testo-tenue">{cyber.note[0] ?? 'Divisione ATECO non disponibile.'}</p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <Riquadro titolo="Cyber Risk">
        <Cerchio valore={cyber.punteggio} etichetta="Cyber Risk" grande decimali={1} />
        <p className="mt-3 text-center text-sm text-testo-tenue">
          ATECO {cyber.divisioneAteco} · {cyber.titoloDivisione}
        </p>
      </Riquadro>
      {/* Le quattro voci del foglio, ciascuna con il suo cerchio: il nome basta, la frase che la
          spiegava stava sotto ogni voce e non aggiungeva niente a chi deve decidere. */}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cyber.voci.map((v) => (
          <li
            key={v.voce}
            className="flex flex-col items-center rounded-xl border border-bordo bg-superficie p-4 text-center"
          >
            <Cerchio valore={v.punteggio} etichetta={v.voce} />
            <p className="mt-2 text-sm font-medium leading-snug">{v.voce}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
