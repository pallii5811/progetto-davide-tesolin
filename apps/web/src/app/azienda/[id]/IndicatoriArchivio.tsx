import type { IndicatoriArchivioDto } from '@/lib/api';
import { Scheda } from '@/components/ui';

/**
 * Gli indicatori che l'archivio camerale restituisce già calcolati.
 *
 * Sono compresi nel prezzo del profilo completo, e per un periodo la metà di essi non
 * arrivava a schermo: si pagavano quarantotto centesimi e se ne usava una parte. Qui ci
 * sono **tutti**, raggruppati come li legge chi assume un rischio e non come li restituisce
 * il fornitore.
 *
 * Restano distinti dal punteggio della piattaforma, che nasce dai bilanci riclassificati:
 * due letture indipendenti dello stesso bilancio sono una controprova, una sola sarebbe un
 * atto di fede. Quando divergono, la divergenza è essa stessa un'informazione.
 */
export function IndicatoriArchivio({ dati }: { dati: IndicatoriArchivioDto }) {
  const q = dati.qualifiche;
  const gruppi: readonly { titolo: string; nota: string; voci: readonly Voce[] }[] = [
    {
      titolo: 'Redditività',
      nota: 'Un’impresa che non guadagna non compra coperture nuove e disdice quelle che ha.',
      voci: [
        ['ROE — rendimento del capitale proprio', dati.redditivita?.roe, '%'],
        ['ROI — rendimento del capitale investito', dati.redditivita?.roi, '%'],
        ['ROS — margine sulle vendite', dati.redditivita?.ros, '%'],
        ['ROA monetario', dati.redditivita?.roaMonetario, '%'],
        ['Incidenza gestione straordinaria', dati.redditivita?.incidenzaGestioneStraordinaria, '%'],
      ],
    },
    {
      titolo: 'Risultati operativi',
      nota: 'Con il valore di due esercizi fa accanto: è la direzione che conta, non il punto.',
      voci: [
        ['EBITDA', dati.risultatiOperativi?.ebitda, '€'],
        ['EBITDA due esercizi fa', dati.risultatiOperativi?.ebitdaDueEserciziPrima, '€'],
        ['EBIT', dati.risultatiOperativi?.ebit, '€'],
        ['EBIT due esercizi fa', dati.risultatiOperativi?.ebitDueEserciziPrima, '€'],
        ['Flusso di cassa', dati.risultatiOperativi?.cashFlow, '€'],
        ['Flusso di cassa due esercizi fa', dati.risultatiOperativi?.cashFlowDueEserciziPrima, '€'],
      ],
    },
    {
      titolo: 'Solidità patrimoniale',
      nota: 'Misura se un sinistro non assicurato la manda fuori mercato.',
      voci: [
        ['Current ratio', dati.solidita?.currentRatio, ''],
        ['Acid test', dati.solidita?.acidTest, ''],
        ['Copertura del capitale circolante', dati.solidita?.coperturaCapitaleCircolante, ''],
        ['Copertura delle immobilizzazioni', dati.solidita?.tassoCoperturaImmobilizzazioni, ''],
        ['Margine di struttura', dati.solidita?.margineDiStruttura, '€'],
        ['Indice del margine di struttura', dati.solidita?.indiceMargineDiStruttura, ''],
        ['Margine di struttura secondario', dati.solidita?.margineDiStrutturaSecondario, '€'],
      ],
    },
    {
      titolo: 'Indebitamento e leva',
      nota: 'Quanto pesa il debito e quanto margine resta prima che diventi insostenibile.',
      voci: [
        ['Leva finanziaria', dati.indebitamento?.leva, ''],
        ['Grado di capitalizzazione', dati.indebitamento?.gradoDiCapitalizzazione, ''],
        ['Debt ratio', dati.indebitamento?.debtRatio, ''],
        ['Rapporto debito bancario', dati.indebitamento?.rapportoDebitoBancario, ''],
        ['Debito bancario su totale attivo', dati.indebitamento?.debitoBancarioSuTotaleAttivo, ''],
        ['PFN su EBITDA', dati.leveFinanziarie?.pfnSuEbitda, ''],
        ['Leva lorda su EBITDA', dati.leveFinanziarie?.ebitdaLevaLorda, ''],
        ['Leva netta su EBITDA', dati.leveFinanziarie?.ebitdaLevaNetta, ''],
        ['PFN su patrimonio netto', dati.strutturaFinanziaria?.pfnSuPatrimonio, ''],
        [
          'Debito finanziario lordo su patrimonio',
          dati.strutturaFinanziaria?.debitoFinanziarioLordoSuPatrimonio,
          '',
        ],
        [
          'Debito finanziario netto su patrimonio',
          dati.strutturaFinanziaria?.debitoFinanziarioNettoSuPatrimonio,
          '',
        ],
        [
          'Composizione del debito finanziario',
          dati.strutturaFinanziaria?.composizioneDebitoFinanziario,
          '',
        ],
      ],
    },
    {
      titolo: 'Liquidità e copertura degli oneri',
      nota: 'Sotto 1 gli interessi si mangiano il margine: è la soglia oltre cui il credito si chiude.',
      voci: [
        ['Cassa su debiti a breve totali', dati.liquidita?.cassaSuDebitiTotaliBreve, ''],
        ['Cassa su debiti bancari a breve', dati.liquidita?.cassaSuDebitiBancariBreve, ''],
        ['Cassa su debiti finanziari a breve', dati.liquidita?.cassaSuDebitiFinanziariBreve, ''],
        ['EBITDA su interessi lordi', dati.coperturaOneri?.ebitdaSuInteressiLordi, ''],
        ['EBITDA su interessi netti', dati.coperturaOneri?.ebitdaSuInteressiNetti, ''],
        ['EBIT su interessi lordi', dati.coperturaOneri?.ebitSuInteressiLordi, ''],
        ['EBIT su interessi netti', dati.coperturaOneri?.ebitSuInteressiNetti, ''],
        ['Indice di onerosità', dati.oneriFinanziari?.indiceDiOnerosita, ''],
        ['ROD — costo del debito', dati.oneriFinanziari?.rod, '%'],
        ['ROD finanziario', dati.oneriFinanziari?.rodFinanziario, '%'],
      ],
    },
    {
      titolo: 'Ciclo finanziario ed efficienza',
      nota: 'Giorni di incasso e di pagamento: quanto capitale resta esposto, e per quanto.',
      voci: [
        ['Durata crediti verso clienti', dati.cicloFinanziario?.durataCreditiVersoClienti, 'gg'],
        ['Durata debiti verso fornitori', dati.cicloFinanziario?.durataDebitiVersoFornitori, 'gg'],
        ['Durata del ciclo finanziario', dati.cicloFinanziario?.durataCicloFinanziario, 'gg'],
        ['Durata delle scorte', dati.cicloFinanziario?.durataScorte, 'gg'],
        ['Rotazione crediti verso clienti', dati.efficienza?.rotazioneCreditiVersoClienti, ''],
        ['Indice di rotazione', dati.efficienza?.indiceDiRotazione, ''],
        ['Rotazione dei debiti', dati.kpi?.rotazioneDebiti, ''],
        ['Rotazione di magazzino', dati.kpi?.rotazioneMagazzino, ''],
      ],
    },
    {
      titolo: 'Andamento e marginalità',
      nota: 'Variazioni rispetto all’esercizio precedente.',
      voci: [
        ['Margine EBITDA', dati.kpi?.marginePercentualeEbitda, '%'],
        ['Oneri finanziari su EBITDA', dati.kpi?.oneriFinanziariSuEbitda, ''],
        ['Patrimonio su totale attivo', dati.kpi?.patrimonioSuTotaleAttivo, ''],
        ['Valore aggiunto', dati.sviluppo?.valoreAggiunto, '%'],
        ['Variazione EBIT', dati.sviluppo?.variazioneEbit, '%'],
        ['MOL', dati.sviluppo?.mol, '%'],
        ['Valore della produzione', dati.sviluppo?.valoreDellaProduzione, '%'],
        ['Totale attivo', dati.sviluppo?.totaleAttivo, '%'],
        ['Debito finanziario lordo', dati.sviluppo?.debitoFinanziarioLordo, '%'],
      ],
    },
  ];

  return (
    <section className="mb-8" id="indicatori-archivio">
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Indicatori dell’archivio camerale</h2>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Elaborati dal Registro Imprese sul bilancio depositato, e già compresi nell’analisi.
        Sono <strong>indipendenti</strong> dal punteggio calcolato dalla piattaforma: dove i due
        divergono, la divergenza è essa stessa un’informazione da approfondire.
      </p>

      {q !== null && <Qualifiche q={q} />}

      {dati.gare.length > 0 && (
        <Scheda className="mb-4">
          <h3 className="text-sm font-semibold">Gare pubbliche</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-testo-tenue">
            Chi partecipa ad appalti ha bisogno di cauzioni provvisorie e definitive: è un ramo
            che non si propone se non si sa che l’impresa va a gara.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-testo-debole">
              <tr>
                <th className="py-1.5 font-medium">Anno</th>
                <th className="py-1.5 font-medium">Presentate</th>
                <th className="py-1.5 font-medium">Vinte</th>
                <th className="py-1.5 text-right font-medium">Valore aggiudicato</th>
              </tr>
            </thead>
            <tbody>
              {dati.gare.map((g) => (
                <tr key={g.anno} className="border-t border-bordo">
                  <td className="tabular py-1.5">{g.anno}</td>
                  <td className="tabular py-1.5">{intero(g.presentate)}</td>
                  <td className="tabular py-1.5 font-medium">{intero(g.vinte)}</td>
                  <td className="tabular py-1.5 text-right">{valuta(g.valoreEuro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scheda>
      )}

      {dati.statisticheAddetti !== null && (
        <Scheda className="mb-4">
          <h3 className="text-sm font-semibold">Composizione del personale</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-testo-tenue">
            Pesa su RC lavoratori, infortuni e TFR: quote elevate di tempo determinato cambiano
            l’esposizione e la stagionalità del rischio.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
            <Riga etichetta="Impiegati" valore={percentuale(dati.statisticheAddetti.impiegati)} />
            <Riga
              etichetta="Tempo indeterminato"
              valore={percentuale(dati.statisticheAddetti.tempoIndeterminato)}
            />
            <Riga
              etichetta="Tempo determinato"
              valore={percentuale(dati.statisticheAddetti.tempoDeterminato)}
            />
            <Riga etichetta="Tempo pieno" valore={percentuale(dati.statisticheAddetti.tempoPieno)} />
            <Riga
              etichetta="Tempo parziale"
              valore={percentuale(dati.statisticheAddetti.tempoParziale)}
            />
          </dl>
        </Scheda>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {gruppi
          .map((g) => ({ ...g, voci: g.voci.filter(([, v]) => v !== null && v !== undefined) }))
          .filter((g) => g.voci.length > 0)
          .map((gruppo) => (
            <Scheda key={gruppo.titolo}>
              <h3 className="text-sm font-semibold">{gruppo.titolo}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-testo-tenue">{gruppo.nota}</p>
              <dl className="mt-3 space-y-1.5">
                {gruppo.voci.map(([etichetta, valore, unita]) => (
                  <div key={etichetta} className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-testo-tenue">{etichetta}</dt>
                    <dd className="tabular text-sm font-medium">{formatta(valore, unita)}</dd>
                  </div>
                ))}
              </dl>
            </Scheda>
          ))}
      </div>
    </section>
  );
}

/** «n.d.» è un'assenza travestita da valore: qui torna a essere un'assenza. */
function valoreONull(v: string): string | null {
  return v === 'n.d.' || v === '' ? null : v;
}

type Voce = readonly [string, number | null | undefined, string];

function Qualifiche({ q }: { q: NonNullable<IndicatoriArchivioDto['qualifiche']> }) {
  /*
    Le qualifiche prima degli indici, e non è un ordine estetico: dicono **quali** coperture
    servono, mentre gli indici dicono quanto regge l'impresa. Un esportatore senza polizza
    credito all'export è un vuoto che nessun indice di bilancio segnala.
  */
  const bandiere: readonly (readonly [string, boolean | null, string])[] = [
    ['Certificazione SOA', q.haCertificazioneSoa, 'lavori pubblici: cauzioni e rischio cantiere'],
    ['Esportatore', q.esportatore, 'credito estero, trasporto merci, rischio politico'],
    ['Importatore', q.importatore, 'trasporto merci e responsabilità da prodotto'],
    ['PMI innovativa', q.pmiInnovativa, 'proprietà intellettuale e responsabilità professionale'],
    ['Start-up innovativa', q.startUpInnovativa, 'profilo di rischio e obblighi propri'],
    ['Impresa artigiana', q.impresaArtigiana, 'regimi e coperture dedicati'],
    ['Controllate estere', q.haControllateEstere, 'programmi assicurativi internazionali'],
    ['Controllanti estere', q.haControllantiEstere, 'programmi assicurativi internazionali'],
    ['Gruppo IVA', q.appartieneAGruppoIva, 'perimetro fiscale del gruppo'],
  ];

  const attive = bandiere.filter(([, valore]) => valore === true);
  const note = bandiere.filter(([, valore]) => valore === false);


  /*
    Le voci del riquadro, divise fra quelle che un valore ce l'hanno e quelle che no.
    Le seconde non si stampano una per una: si nominano in fondo, una volta sola.
  */
  const vociRiquadro: readonly (readonly [string, string | null])[] = [
    ['Dimensione', q.dimensioneImpresa],
    ['Fascia di fatturato', q.fasciaDiFatturato],
    ['Andamento fatturato', valoreONull(percentuale(q.andamentoFatturatoPercentuale))],
    ['Addetti', valoreONull(intero(q.addetti))],
    ['Fascia addetti', q.fasciaAddetti],
    ['Andamento addetti', valoreONull(percentuale(q.andamentoAddettiPercentuale))],
    ['Unità locali', valoreONull(intero(q.numeroUnitaLocali))],
    ['Settore RAE', q.settoreRae],
    ['Settore SAE', q.settoreSae],
    ['ATECO secondario', q.atecoSecondario],
    ['NACE', q.codiceNace],
    ['SIC', [q.codiceSicPrimario, q.codiceSicSecondario].filter(Boolean).join(' / ') || null],
    ['Sito web', q.sitoWeb],
    ['Telefono', q.telefono],
    ['Posta elettronica', q.email],
  ];
  const righeValorizzate = vociRiquadro.filter(
    (v): v is readonly [string, string] => v[1] !== null && v[1] !== '',
  );
  const righeMancanti = vociRiquadro
    .filter((v) => v[1] === null || v[1] === '')
    .map((v) => v[0]);

  return (
    <Scheda className="mb-4">
      <h3 className="text-sm font-semibold">Qualifiche d’impresa</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-testo-tenue">
        Cambiano <strong>quali</strong> coperture servono, prima ancora di quanto costino.
      </p>

      {attive.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {attive.map(([nome, , perche]) => (
            <li key={nome} className="text-sm">
              <span className="mr-2 rounded border border-basso/30 bg-basso-fondo px-1.5 py-0.5 text-xs font-medium text-basso">
                sì
              </span>
              <span className="font-medium">{nome}</span>
              <span className="text-testo-tenue"> — {perche}</span>
            </li>
          ))}
        </ul>
      )}

      {note.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-testo-debole">
          Dichiarate assenti dal registro: {note.map(([nome]) => nome.toLowerCase()).join(', ')}.
        </p>
      )}

      {/*
        Le righe senza valore non si stampano.

        Erano quindici «n.d.» in fila ogni volta che l'approfondimento non era stato
        comprato — e su una scheda dove il capitale sociale e il fatturato c'erano davvero,
        due centimetri più su. Chi legge conclude che il prodotto sia rotto, o che il dato
        non esista: due conclusioni sbagliate, e la seconda porta a spendere trenta
        centesimi per riavere qualcosa che era già lì.

        Adesso compare solo ciò che c'è, e in fondo una riga sola dice cosa manca e quanto
        costa averlo. Un'assenza dichiarata vale più di quindici assenze stampate.
      */}
      {righeValorizzate.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-bordo pt-3 sm:grid-cols-3">
          {righeValorizzate.map(([etichetta, valore]) => (
            <Riga key={etichetta} etichetta={etichetta} valore={valore} />
          ))}
        </dl>
      )}

      {righeMancanti.length > 0 && (
        <p className="mt-3 border-t border-bordo pt-3 text-xs leading-relaxed text-testo-debole">
          Non compresi in questa analisi:{' '}
          <span className="text-testo-tenue">{righeMancanti.join(', ').toLowerCase()}</span>. Si
          acquistano con l&apos;<strong className="text-testo-tenue">analisi approfondita</strong>.
        </p>
      )}

      {q.aggiornatoIl !== null && (
        <p className="mt-3 text-xs text-testo-debole">
          Record camerale aggiornato al{' '}
          {new Date(q.aggiornatoIl).toLocaleDateString('it-IT')}.
        </p>
      )}
    </Scheda>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <dt className="text-xs text-testo-debole">{etichetta}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valore}</dd>
    </div>
  );
}

/**
 * «Assente» e «zero» non sono la stessa cosa.
 *
 * Su un indice di redditività lo zero è un'affermazione forte e quasi sempre falsa: qui
 * arrivano solo valori realmente presenti, perché le voci vuote sono già state tolte.
 */
function formatta(valore: number | null | undefined, unita: string): string {
  if (valore === null || valore === undefined) return 'n.d.';
  if (unita === '€') return valuta(valore);
  if (unita === '%') return percentuale(valore);
  if (unita === 'gg') return `${arrotonda(valore)} gg`;
  return arrotonda(valore);
}

function arrotonda(valore: number): string {
  // Due decimali sotto il centinaio, nessuno sopra: su un indice pari a 4766 i decimali
  // sono rumore, su uno pari a 1,79 sono l'informazione.
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: Math.abs(valore) < 100 ? 2 : 0,
  }).format(valore);
}

function valuta(valore: number | null): string {
  return valore === null
    ? 'n.d.'
    : new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(valore);
}

function percentuale(valore: number | null | undefined): string {
  return valore === null || valore === undefined ? 'n.d.' : `${arrotonda(valore)}%`;
}

function intero(valore: number | null | undefined): string {
  return valore === null || valore === undefined ? 'n.d.' : new Intl.NumberFormat('it-IT').format(valore);
}
