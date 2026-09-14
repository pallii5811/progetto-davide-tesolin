import type { AnalisiDto, MoneyDto, ProtezioniDto, VoceDiCalcoloDto } from '@/lib/api';
import { Metrica, Sezione } from '@/components/ui';

/**
 * Property Risk, Business Interruption e Cyber Risk: i tre riquadri in testa alla scheda e le
 * tre sezioni che li spiegano.
 *
 * Il calcolo è del motore, con le formule e le tabelle del foglio «Veezco_Analisi Rischio.xlsx».
 * Qui non si calcola niente: si stampa il risultato, e prima del risultato la formula, perché
 * chi legge un punteggio deve poter rifare il conto con i numeri che ha sotto gli occhi.
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

/**
 * Un punteggio da 1 a 7 come lo stampa il motore: intero quando lo è, altrimenti al centesimo.
 *
 * I pericoli naturali escono con i decimali (50% × 7 + 50% × 3,67 = 5,34): stampati senza, la
 * voce direbbe 5 e il contributo 2,67, e il conto non tornerebbe più.
 */
function punteggioIt(valore: number): string {
  return Number.isInteger(valore) ? numeroIt(valore, 0) : numeroIt(valore, 2);
}

/** Al centesimo: la perdita giornaliera e gli scenari devono tornare fra loro a colpo d'occhio. */
function euroAlCentesimo(importo: MoneyDto): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo.euro);
}

const pesoIt = (peso: number): string => `${Math.round(peso * 100)}%`;

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
      <Metrica
        etichetta="Property Risk"
        valore={property.punteggio === null ? 'non calcolabile' : suSette(property.punteggio, 2)}
        nota={
          property.punteggio === null
            ? (property.motivoNonCalcolabile ?? 'Il dettaglio è nella sezione Property Risk')
            : `Ubicazione più esposta: ${property.ubicazioneDiRiferimento ?? '—'}`
        }
        tono={property.punteggio === null ? 'attenzione' : 'neutro'}
      />
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

export function SezioniProtezioni({ protezioni }: { protezioni: Protezioni }) {
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
        sottotitolo="Tutela i beni dell’impresa da incendio ed eventi naturali"
      >
        {protezioni === undefined ? <NonDisponibile /> : <CorpoProperty protezioni={protezioni} />}
      </Sezione>
      <Sezione
        id="business-interruption"
        titolo="Business Interruption"
        sottotitolo="Tutela la continuità aziendale in caso di interruzione temporanea"
      >
        {protezioni === undefined ? (
          <NonDisponibile />
        ) : (
          <CorpoBusinessInterruption protezioni={protezioni} />
        )}
      </Sezione>
      <Sezione
        id="cyber-risk"
        titolo="Cyber Risk"
        sottotitolo="Protegge i sistemi aziendali dai danni informatici"
      >
        {protezioni === undefined ? <NonDisponibile /> : <CorpoCyber protezioni={protezioni} />}
      </Sezione>
    </>
  );
}

function NonDisponibile() {
  return <p className="text-sm text-testo-tenue">{NON_DISPONIBILE}</p>;
}

/** La formula in testa alla sezione, in chiaro: non dentro un blocco da aprire. */
function ComeEStatoCalcolato({ formule, fonte }: { formule: readonly string[]; fonte: string }) {
  return (
    <div className="mb-4 rounded-lg border border-marchio/30 bg-marchio-tenue p-4">
      <p className="text-sm font-semibold">Come è stato calcolato</p>
      {formule.map((formula) => (
        <p key={formula} className="mt-1.5 font-mono text-sm leading-relaxed text-testo">
          {formula}
        </p>
      ))}
      {/* `testo-tenue`, non `testo-debole`: sul fondo azzurro il secondo si ferma a 4,38:1, sotto il 4,5:1 WCAG (misurato da axe). */}
      <p className="mt-2 text-xs text-testo-tenue">Formule e tabelle del foglio «{fonte}».</p>
    </div>
  );
}

function Note({ note }: { note: readonly string[] }) {
  if (note.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs leading-relaxed text-testo-debole">
      {note.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function TabellaVoci({
  voci,
  etichettaTotale,
  totale,
}: {
  voci: readonly VoceDiCalcoloDto[];
  etichettaTotale: string;
  totale: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordo">
      <table className="w-full text-sm">
        <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
          <tr>
            <th className="px-4 py-2.5 font-medium">Voce</th>
            <th className="px-4 py-2.5 text-right font-medium">Punteggio 1–7</th>
            <th className="px-4 py-2.5 text-right font-medium">Peso</th>
            <th className="px-4 py-2.5 text-right font-medium">Contributo</th>
          </tr>
        </thead>
        <tbody>
          {voci.map((v) => (
            <tr key={v.voce} className="border-t border-bordo bg-superficie align-top">
              <td className="px-4 py-3">
                <span className="font-medium">{v.voce}</span>
                <span className="mt-0.5 block text-xs leading-snug text-testo-tenue">{v.dettaglio}</span>
              </td>
              <td className="tabular px-4 py-3 text-right">
                {v.punteggio === null ? 'non calcolabile' : punteggioIt(v.punteggio)}
              </td>
              <td className="tabular px-4 py-3 text-right">{pesoIt(v.peso)}</td>
              <td className="tabular px-4 py-3 text-right">
                {v.contributo === null ? '—' : numeroIt(v.contributo, 2)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-bordo-forte bg-fondo font-semibold">
            <td className="px-4 py-3" colSpan={3}>
              {etichettaTotale}
            </td>
            <td className="tabular px-4 py-3 text-right">{totale}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CorpoProperty({ protezioni }: { protezioni: ProtezioniDto }) {
  const { property } = protezioni;
  return (
    <>
      <ComeEStatoCalcolato
        formule={[property.formula, property.formulaPericoliNaturali, property.scalaPericoliNaturali]}
        fonte={protezioni.fonte}
      />
      <div className="space-y-4">
        {property.ubicazioni.map((u) => (
          <div key={u.id}>
            <p className="mb-2 text-sm font-medium">{u.etichetta}</p>
            <TabellaVoci
              voci={u.voci}
              etichettaTotale="Property Risk dell’ubicazione"
              totale={u.punteggio === null ? 'non calcolabile' : suSette(u.punteggio, 2)}
            />
          </div>
        ))}
      </div>
      <Note note={property.note} />
    </>
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

  const righe: { voce: string; calcolo: string; importo: string; testid?: string }[] = [
    {
      voce: etichettaBase,
      calcolo: 'dato annuo dell’impresa',
      importo: bi.baseAnnua === null ? 'da rilevare' : euroAlCentesimo(bi.baseAnnua),
    },
    {
      voce: 'Perdita giornaliera',
      calcolo: 'base annua ÷ 365',
      importo: bi.perditaGiornaliera === null ? 'da rilevare' : euroAlCentesimo(bi.perditaGiornaliera),
      testid: 'bi-perdita-giornaliera',
    },
    ...bi.scenari.map((s) => ({
      voce: `Fermo di ${s.giorni} giorni`,
      calcolo: `perdita giornaliera × ${s.giorni}`,
      importo: euroAlCentesimo(s.perdita),
      testid: `bi-scenario-${s.giorni}`,
    })),
    {
      voce: 'Punteggio fisico',
      calcolo: 'uguale al Property Risk',
      importo: bi.punteggioFisico === null ? 'non calcolabile' : suSette(bi.punteggioFisico, 2),
    },
  ];

  return (
    <>
      <ComeEStatoCalcolato formule={bi.formule} fonte={protezioni.fonte} />
      <div className="overflow-x-auto rounded-lg border border-bordo">
        <table className="w-full text-sm">
          <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
            <tr>
              <th className="px-4 py-2.5 font-medium">Voce</th>
              <th className="px-4 py-2.5 font-medium">Calcolo</th>
              <th className="px-4 py-2.5 text-right font-medium">Importo</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.voce} data-testid={r.testid} className="border-t border-bordo bg-superficie">
                <td className="px-4 py-3 font-medium">{r.voce}</td>
                <td className="px-4 py-3 text-testo-tenue">{r.calcolo}</td>
                <td className="tabular px-4 py-3 text-right font-medium">{r.importo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note note={bi.note} />
    </>
  );
}

function CorpoCyber({ protezioni }: { protezioni: ProtezioniDto }) {
  const { cyber } = protezioni;
  return (
    <>
      <ComeEStatoCalcolato formule={[cyber.formula]} fonte={protezioni.fonte} />
      {cyber.punteggio !== null && cyber.divisioneAteco !== null && (
        <>
          <p className="mb-2 text-sm font-medium">
            Divisione ATECO {cyber.divisioneAteco} · {cyber.titoloDivisione}
          </p>
          <TabellaVoci
            voci={cyber.voci}
            etichettaTotale="Cyber Risk, arrotondato a un decimale"
            totale={suSette(cyber.punteggio, 1)}
          />
        </>
      )}
      <Note note={cyber.note} />
    </>
  );
}
