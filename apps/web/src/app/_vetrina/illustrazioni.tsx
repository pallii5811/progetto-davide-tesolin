import {
  IconaArchivio,
  IconaCampana,
  IconaCrm,
  IconaDocumento,
  IconaEuro,
  IconaFermo,
  IconaFiamma,
  IconaFiltro,
  IconaFrana,
  IconaLente,
  IconaLucchetto,
  IconaLuogo,
  IconaOnde,
  IconaPalazzo,
  IconaPersone,
  IconaScudo,
  IconaSisma,
  IconaSpunta,
} from './icone';
import {
  Anello,
  CartaFantasma,
  CartaSegnale,
  OMBRA_FINESTRA,
  PUNTINI,
  Tessera,
  colorePunteggio,
} from './pezzi';

/**
 * Le illustrazioni della vetrina: finestre del prodotto costruite con gli stessi pezzi
 * dell'interfaccia, non immagini — restano nitide a ogni risoluzione e non pesano niente.
 *
 * Le aziende e i numeri sono di esempio, e lo dicono: la vetrina è pubblica, e un punteggio di
 * rischio accanto al nome di un'impresa vera sarebbe un'affermazione su di lei. Per questo i nomi
 * sono inventati, nessuna riga porta una partita IVA, e ogni illustrazione è nascosta ai lettori
 * di schermo (`aria-hidden`): dati finti letti ad alta voce sembrerebbero dati veri.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Testata
// ─────────────────────────────────────────────────────────────────────────────

/*
  Esempi, ma coerenti con il prodotto: il Cyber è quello vero della divisione ATECO di ciascuna
  (tabelle-veezco.ts: 25 → 3,4 · 28 → 4 · 13 → 2,8 · 52 → 5,1), e Logistica Orobia è la stessa
  azienda delle altre illustrazioni (Property 5,17, fermo di 30 giorni 1.627.397 €).
*/
const RIGHE_ESEMPIO = [
  {
    nome: 'Galvanica Brembana S.r.l.',
    sede: 'Treviolo',
    property: 6.1,
    fermo: '205.380 €',
    cyber: 3.4,
    stato: 'Contattata',
  },
  {
    nome: 'Nordvalle Meccanica S.r.l.',
    sede: 'Bergamo',
    property: 5.42,
    fermo: '354.411 €',
    cyber: 4,
    stato: 'In trattativa',
  },
  {
    nome: 'Logistica Orobia S.p.A.',
    sede: 'Dalmine',
    property: 5.17,
    fermo: '1.627.397 €',
    cyber: 5.1,
    stato: 'Da contattare',
  },
  {
    nome: 'Tessiture Serio S.r.l.',
    sede: 'Alzano Lombardo',
    property: 4.34,
    fermo: '118.260 €',
    cyber: 2.8,
    stato: 'Da contattare',
  },
  {
    nome: 'Carpenterie Alte Valli S.r.l.',
    sede: 'Seriate',
    property: 3.84,
    fermo: '96.820 €',
    cyber: 3.4,
    stato: 'Cliente',
  },
] as const;

const STILE_STATO: Record<string, string> = {
  'In trattativa': 'bg-vetrina-arancio/12 text-[oklch(0.45_0.14_42)]',
  'Da contattare': 'bg-vetrina-blu/10 text-vetrina-blu',
  Cliente: 'bg-[oklch(0.95_0.05_150)] text-[oklch(0.42_0.12_150)]',
  Contattata: 'bg-vetrina-velo text-vetrina-grigio',
};

function Punteggio({ valore, decimali = 2 }: { valore: number; decimali?: number }) {
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="h-2 w-2 rounded-full" style={{ background: colorePunteggio(valore) }} />
      {valore.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })}
    </span>
  );
}

export function IllustrazioneTestata() {
  return (
    <div aria-hidden="true" className="relative mx-auto mt-16 max-w-[1240px] px-4 sm:px-6">
      {/* Le notifiche che fluttuano sopra la finestra, solo dove c'è spazio per farle respirare. */}
      <div className="relative hidden h-[190px] lg:block">
        <CartaFantasma className="absolute left-[3%] top-[34px] w-[190px] opacity-50" />
        <CartaSegnale
          className="absolute left-[16%] top-[102px] w-max max-w-[300px] animate-[vetrina-galleggia_7s_ease-in-out_infinite] vetrina-animata"
          icona={<IconaFiamma />}
          tono="arancio"
          titolo="Rischio incendio 6 su 7"
          sotto="Prodotti in metallo · ATECO 25"
        />
        <CartaSegnale
          className="absolute left-[38%] top-[8px] w-max max-w-[320px] animate-[vetrina-galleggia_8s_ease-in-out_1s_infinite] vetrina-animata"
          icona={<IconaOnde />}
          tono="blu"
          titolo="Alluvione alta"
          sotto="28,8 % delle imprese in area elevata"
        />
        <CartaSegnale
          className="absolute right-[17%] top-[112px] w-max max-w-[300px] animate-[vetrina-galleggia_6.5s_ease-in-out_0.5s_infinite] vetrina-animata"
          icona={<IconaFermo />}
          tono="petrolio"
          titolo="Fermo di 30 giorni"
          sotto="1,63 milioni di perdita stimata"
        />
        <CartaSegnale
          className="absolute right-[2%] top-[22px] w-max max-w-[280px] opacity-80"
          icona={<IconaPersone />}
          tono="magenta"
          titolo="3 aziende nel CRM"
          sotto="Arrivate dall’ultimo elenco"
        />
      </div>

      {/* La finestra di prodotto: Ricerca Clienti con le colonne che l'analisi riempie. */}
      <div
        className={`relative overflow-hidden rounded-[28px] border border-vetrina-linea bg-white ${OMBRA_FINESTRA}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vetrina-linea px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <IconaCrm className="h-5 w-5 text-vetrina-grigio" />
            <span className="text-[16px] font-semibold tracking-[-0.01em]">Le tue aziende</span>
            <span className="hidden text-[13px] text-vetrina-grigio sm:inline">· esempio</span>
          </div>
          <div className="hidden flex-wrap items-center gap-2 text-[12.5px] sm:flex">
            {['Tutti gli stati', 'Ordinate per Property Risk'].map((filtro) => (
              <span
                key={filtro}
                className="inline-flex items-center gap-1.5 rounded-full border border-vetrina-linea bg-vetrina-carta px-3 py-1 font-medium"
              >
                <IconaFiltro className="h-3.5 w-3.5 text-vetrina-grigio" />
                {filtro}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-hidden">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-vetrina-linea text-[12px] uppercase tracking-[0.04em] text-vetrina-grigio">
                <th className="px-5 py-3 font-medium sm:px-7">Azienda</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Sede</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Fermo 30 giorni</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Cyber</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Stato</th>
              </tr>
            </thead>
            <tbody>
              {RIGHE_ESEMPIO.map((riga, i) => (
                <tr
                  key={riga.nome}
                  className={i < RIGHE_ESEMPIO.length - 1 ? 'border-b border-vetrina-linea' : ''}
                >
                  <td className="px-5 py-3.5 font-medium sm:px-7">
                    <span className="flex items-center gap-3">
                      <span className="hidden h-7 w-7 items-center justify-center rounded-lg bg-vetrina-velo text-vetrina-grigio sm:inline-flex">
                        <IconaPalazzo className="h-4 w-4" />
                      </span>
                      <span className="truncate">{riga.nome}</span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-vetrina-grigio md:table-cell">{riga.sede}</td>
                  <td className="px-4 py-3.5">
                    <Punteggio valore={riga.property} />
                  </td>
                  <td className="hidden px-4 py-3.5 tabular-nums lg:table-cell">{riga.fermo}</td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <Punteggio valore={riga.cyber} decimali={1} />
                  </td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium ${STILE_STATO[riga.stato] ?? ''}`}
                    >
                      {riga.stato}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* La finestra sfuma verso il basso: continua, ma non serve vederla tutta. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Come funziona: tre riquadri
// ─────────────────────────────────────────────────────────────────────────────

function Riquadro({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`relative h-[300px] overflow-hidden rounded-[28px] border border-vetrina-linea bg-vetrina-velo/60 ${PUNTINI}`}
    >
      {children}
    </div>
  );
}

function RigaFiltro({
  icona,
  nome,
  valore,
  stato,
}: {
  icona: React.ReactNode;
  nome: string;
  valore: string;
  stato: 'fatto' | 'in-corso' | 'attesa';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-vetrina-linea bg-white px-3.5 py-2.5">
      <span className="text-vetrina-grigio">{icona}</span>
      <span className="text-[13.5px] font-medium">{nome}</span>
      <span className="text-[13.5px] text-vetrina-grigio">{valore}</span>
      <span className="ml-auto text-[12px] text-vetrina-grigio">
        {stato === 'fatto' ? (
          <IconaSpunta className="h-4 w-4 text-[oklch(0.55_0.14_150)]" />
        ) : stato === 'in-corso' ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-vetrina-linea border-t-vetrina-blu vetrina-animata" />
        ) : (
          'in attesa'
        )}
      </span>
    </div>
  );
}

export function IllustrazioneTrova() {
  return (
    <Riquadro>
      <div className="absolute inset-x-6 top-6 flex flex-col gap-2.5">
        <RigaFiltro
          icona={<IconaLuogo className="h-4 w-4" />}
          nome="Città"
          valore="Bergamo"
          stato="fatto"
        />
        <RigaFiltro icona={<IconaFiltro className="h-4 w-4" />} nome="ATECO" valore="25" stato="fatto" />
        <RigaFiltro
          icona={<IconaPersone className="h-4 w-4" />}
          nome="Dipendenti"
          valore="20–250"
          stato="in-corso"
        />
        <RigaFiltro
          icona={<IconaEuro className="h-4 w-4" />}
          nome="Fatturato"
          valore="da 2 mln"
          stato="attesa"
        />
      </div>
      <div className="absolute inset-x-6 bottom-6 flex items-center justify-between rounded-2xl bg-vetrina-inchiostro px-4 py-3.5 text-white">
        <span className="text-[13.5px]">
          <span className="font-semibold">Conta Aziende</span> · non consuma crediti
        </span>
        <IconaLente className="h-4 w-4 opacity-80" />
      </div>
    </Riquadro>
  );
}

export function IllustrazioneAnalizza() {
  return (
    <Riquadro>
      <div className="absolute inset-x-6 top-6">
        <CartaSegnale
          icona={<IconaCampana />}
          tono="blu"
          titolo="Analisi pronta"
          sotto="Logistica Orobia · sede legale a Dalmine"
        />
      </div>
      <div className="absolute left-1/2 top-[92px] h-7 border-l border-dashed border-vetrina-grigio/40" />
      <div className="absolute inset-x-6 bottom-6 grid grid-cols-3 gap-2 rounded-2xl border border-vetrina-linea bg-white p-4">
        {[
          { testo: '5,17', valore: 5.17, nome: 'Property' },
          { testo: '5,17', valore: 5.17, nome: 'Interruzione' },
          { testo: '5,1', valore: 5.1, nome: 'Cyber' },
        ].map((a) => (
          <div key={a.nome} className="flex flex-col items-center gap-1.5">
            <Anello valore={a.valore} testo={a.testo} dimensione={72} />
            <span className="text-[12.5px] font-medium text-vetrina-grigio">{a.nome}</span>
          </div>
        ))}
      </div>
    </Riquadro>
  );
}

export function IllustrazioneProponi() {
  return (
    <Riquadro>
      <div className="absolute inset-x-8 top-7 bottom-0 rounded-t-2xl border border-b-0 border-vetrina-linea bg-white p-5 shadow-[0_18px_40px_-20px_rgba(16,24,40,0.3)]">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">Report per il cliente</span>
          <span className="rounded-full bg-[oklch(0.95_0.05_150)] px-2.5 py-0.5 text-[11.5px] font-medium text-[oklch(0.42_0.12_150)]">
            pronto
          </span>
        </div>
        <ol className="mt-4 space-y-2.5 text-[13px]">
          {[
            'Sintesi per la direzione',
            'Capitali da assicurare',
            'Coperture proposte',
            'Obbligo CAT NAT',
            'Limiti e avvertenze',
          ].map((capitolo, i) => (
            <li key={capitolo} className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-vetrina-velo text-[11px] font-semibold text-vetrina-grigio">
                {i + 1}
              </span>
              <span>{capitolo}</span>
              <span className="ml-auto h-1.5 w-14 rounded-full bg-vetrina-linea" />
            </li>
          ))}
        </ol>
      </div>
    </Riquadro>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pannelli colorati: carte bianche su un fondo pieno, sopra una tabella che continua
// ─────────────────────────────────────────────────────────────────────────────

const FONDI = {
  blu: 'bg-vetrina-blu',
  arancio: 'bg-vetrina-arancio',
  magenta: 'bg-vetrina-magenta',
  petrolio: 'bg-vetrina-petrolio',
} as const;

function Pannello({ fondo, children }: { fondo: keyof typeof FONDI; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-[460px] overflow-hidden rounded-[32px] border border-vetrina-linea bg-white sm:h-[520px]"
    >
      <div className={`absolute inset-x-0 top-0 h-[62%] ${FONDI[fondo]}`}>
        {/* Una luce morbida dall'alto: il colore pieno, senza, sembra una campitura di prova. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,rgba(255,255,255,0.28),transparent_60%)]" />
      </div>
      {/* La tabella che continua sotto le carte, come in una finestra di prodotto vera. */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-white">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 border-t border-vetrina-linea px-6 py-3.5">
            <span className="w-4 text-[12px] tabular-nums text-vetrina-grigio">{i + 1}</span>
            <span className="h-2 w-28 rounded-full bg-vetrina-linea" />
            <span className="h-2 w-20 rounded-full bg-vetrina-linea/70" />
            <span className="ml-auto h-2 w-12 rounded-full bg-vetrina-linea/70" />
          </div>
        ))}
      </div>
      {/* `vetrina-carte`: nella scena che scorre (ProdottoScorrevole.tsx) le carte entrano una alla volta. */}
      <div className="vetrina-carte absolute inset-x-5 top-8 flex flex-col items-end gap-3 sm:inset-x-auto sm:right-8 sm:w-[340px]">
        {children}
      </div>
    </div>
  );
}

export function PannelloTerritorio() {
  return (
    <Pannello fondo="blu">
      <CartaSegnale
        className="w-full"
        icona={<IconaOnde />}
        tono="blu"
        titolo="Alluvione · alta"
        sotto="28,8 % delle imprese in area a pericolosità elevata"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaSisma />}
        tono="petrolio"
        titolo="Sisma · zona 3"
        sotto="Classificazione della Protezione Civile"
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaFrana />}
        tono="arancio"
        titolo="Frana · bassa"
        sotto="0 % delle imprese in area a pericolosità da frana elevata"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaScudo />}
        tono="magenta"
        titolo="Calamità naturali 5,34 su 7"
        sotto="Metà il pericolo più alto, metà la media dei tre"
      />
    </Pannello>
  );
}

export function PannelloFermo() {
  return (
    <Pannello fondo="arancio">
      <CartaSegnale
        className="w-full"
        icona={<IconaEuro />}
        tono="arancio"
        titolo="Perdita giornaliera"
        sotto="54.246,58 € sul fatturato annuo"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 7 giorni"
        sotto="379.726,03 €"
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 30 giorni"
        sotto="1.627.397,26 €"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 90 giorni"
        sotto="4.882.191,78 €"
      />
    </Pannello>
  );
}

export function PannelloCrm() {
  return (
    <Pannello fondo="magenta">
      <CartaSegnale
        className="w-full"
        icona={<IconaArchivio />}
        tono="magenta"
        titolo="Elenco salvato nel CRM"
        sotto="5 aziende · Bergamo · ATECO 25"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFiltro />}
        tono="blu"
        titolo="Stessi filtri, aziende nuove"
        sotto="L’elenco parte dalle successive"
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaSpunta />}
        tono="petrolio"
        titolo="In trattativa"
        sotto="Richiamare lunedì per il sopralluogo"
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaPersone />}
        tono="neutro"
        titolo="2 già nel CRM"
        sotto="Non escono di nuovo"
      />
    </Pannello>
  );
}

export function PannelloCyber() {
  const voci = [
    { nome: 'Dipendenza digitale', valore: 6, peso: 30 },
    { nome: 'Sensibilità dei dati', valore: 4, peso: 30 },
    { nome: 'Esposizione alle transazioni', valore: 4, peso: 15 },
    { nome: 'Attrattività come bersaglio', valore: 6, peso: 25 },
  ];
  return (
    <div
      aria-hidden="true"
      className="vetrina-carte relative flex min-h-[460px] flex-col justify-between gap-4 overflow-hidden rounded-[32px] border border-vetrina-linea bg-vetrina-petrolio p-5 sm:min-h-[520px] sm:p-8"
    >
      {/* La luce resta ferma: nella scena che scorre entrano solo le carte (`data-fondo`). */}
      <div
        data-fondo=""
        className="absolute inset-0 bg-[radial-gradient(100%_70%_at_20%_0%,rgba(255,255,255,0.25),transparent_60%)]"
      />
      <div className="relative flex items-center gap-4 rounded-2xl border border-vetrina-linea bg-white p-5">
        <Anello valore={5.1} testo="5,1" dimensione={84} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Cyber Risk</p>
          <p className="mt-0.5 text-[13px] leading-snug text-vetrina-grigio">
            Divisione ATECO 52 · magazzinaggio e supporto ai trasporti
          </p>
        </div>
        <span className="hidden sm:inline-flex">
          <Tessera tono="petrolio">
            <IconaLucchetto />
          </Tessera>
        </span>
      </div>

      {/* Come si compone: le quattro voci per il loro peso (PESI_CYBER in tabelle-veezco.ts). */}
      <div className="relative rounded-2xl border border-vetrina-linea bg-white p-5">
        <p className="text-[13px] font-medium text-vetrina-grigio">Come si compone il punteggio</p>
        <div className="mt-3 flex h-2.5 gap-1 overflow-hidden rounded-full">
          {voci.map((v) => (
            <span
              key={v.nome}
              className="h-full rounded-full"
              style={{ width: `${v.peso}%`, background: colorePunteggio(v.valore) }}
            />
          ))}
        </div>
        <p className="mt-3 text-[13px] tabular-nums text-vetrina-inchiostro">
          6 × 30% + 4 × 30% + 4 × 15% + 6 × 25% = <span className="font-semibold">5,1</span>
        </p>
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        {voci.map((v) => (
          <div
            key={v.nome}
            className="flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white p-3.5"
          >
            <Anello valore={v.valore} testo={String(v.valore)} dimensione={44} />
            <span className="min-w-0 text-[13px] font-medium leading-snug">
              {v.nome}
              <span className="block font-normal text-vetrina-grigio">peso {v.peso}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo schema del flusso: dalla partita IVA alla proposta
// ─────────────────────────────────────────────────────────────────────────────

function Nodo({
  icona,
  tono,
  titolo,
  sotto,
  pastiglie,
}: {
  icona: React.ReactNode;
  tono: 'blu' | 'arancio' | 'magenta' | 'petrolio' | 'neutro';
  titolo: string;
  sotto?: string;
  pastiglie?: readonly string[];
}) {
  return (
    <div className="rounded-[22px] border border-vetrina-linea bg-vetrina-velo/70 p-2">
      <div className="flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white px-4 py-3.5">
        <Tessera tono={tono}>{icona}</Tessera>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{titolo}</p>
          {sotto !== undefined && <p className="mt-0.5 text-[13px] text-vetrina-grigio">{sotto}</p>}
        </div>
      </div>
      {pastiglie !== undefined && (
        <div className="flex flex-wrap justify-center gap-2 px-1 pb-1 pt-2.5">
          {pastiglie.map((p) => (
            <span
              key={p}
              className="rounded-xl border border-vetrina-linea bg-white px-3 py-1.5 text-[12.5px] font-medium text-vetrina-inchiostro"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Frecce() {
  return (
    <div className="flex h-10 items-stretch justify-center gap-6">
      {[0, 1, 2].map((i) => (
        <span key={i} className="relative w-px border-l border-dashed border-vetrina-grigio/40">
          <span className="absolute -bottom-1 -left-[4px] h-2 w-2 rotate-45 border-b border-r border-vetrina-grigio/50" />
        </span>
      ))}
    </div>
  );
}

export function SchemaFlusso() {
  return (
    <div
      aria-hidden="true"
      className={`grid gap-8 rounded-[32px] border border-vetrina-linea bg-vetrina-carta p-5 sm:p-10 lg:grid-cols-[1fr_auto_1fr] ${PUNTINI}`}
    >
      <div>
        <Nodo
          icona={<IconaLente />}
          tono="neutro"
          titolo="Una partita IVA, o un elenco"
          pastiglie={['Città', 'ATECO', 'Dipendenti', 'Fatturato', 'Socio']}
        />
        <Frecce />
        <Nodo
          icona={<IconaPalazzo />}
          tono="neutro"
          titolo="Registro Imprese"
          pastiglie={['Sede legale', 'Unità locali', 'Bilanci', 'Soci']}
        />
        <Frecce />
        <Nodo
          icona={<IconaLuogo />}
          tono="blu"
          titolo="Ogni sede sul territorio"
          pastiglie={['ISPRA IdroGEO', 'Zona sismica']}
        />
      </div>

      <div className="hidden flex-col items-center justify-center gap-3 lg:flex">
        <span className="rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[12px] text-vetrina-grigio">
          calcola
        </span>
        <span className="h-40 border-l border-dashed border-vetrina-grigio/40" />
        <span className="rounded-full border border-vetrina-linea bg-white px-3 py-1 text-[12px] text-vetrina-grigio">
          consegna
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <Nodo
          icona={<IconaFiamma />}
          tono="blu"
          titolo="Property Risk"
          sotto="Rischio incendio e calamità naturali, sede per sede"
        />
        <Nodo
          icona={<IconaFermo />}
          tono="arancio"
          titolo="Business Interruption"
          sotto="La perdita di 7, 30 e 90 giorni di fermo"
        />
        <Nodo
          icona={<IconaLucchetto />}
          tono="petrolio"
          titolo="Cyber Risk"
          sotto="Quattro voci del settore ATECO"
        />
        <Nodo
          icona={<IconaDocumento />}
          tono="neutro"
          titolo="Report per il cliente"
          sotto="Pronto da consegnare, con l’informativa IVASS"
        />
      </div>
    </div>
  );
}
