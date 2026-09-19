import {
  IconaArchivio,
  IconaCampana,
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
import { Anello, CartaFantasma, CartaSegnale, Etichetta, PUNTINI, Tessera, colorePunteggio } from './pezzi';
import { TourProdotto } from './TourProdotto';

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
  L'apertura: le carte che fluttuano e, sotto, la finestra del prodotto che fa da sola il giro
  delle schermate (TourProdotto.tsx, schermate.tsx). Fino al 19/09/2026 qui c'era una tabella del CRM
  con colonne di rischio che il CRM vero non ha; poi la sola scheda azienda; ora tutto il percorso.

  Le carte parlano della stessa azienda della finestra, e i numeri tornano con il motore: Logistica
  Orobia, sede a Dello (BS) — alluvione 7, sisma 3, frana 1, calamità naturali 5,34, Property 5,17
  con l'incendio a 5 del magazzinaggio —, 118 addetti quindi media impresa con termine CAT NAT
  01/10/2025, fatturato 19.800.000 € / 365 = 54.246,58 € al giorno e 30 giorni = 1.627.397,40 €.
*/

export function IllustrazioneTestata() {
  return (
    <div className="relative mx-auto mt-16 max-w-[1240px] px-4 sm:px-6">
      {/* Le notifiche che fluttuano sopra la finestra, solo dove c'è spazio per farle respirare. */}
      <div aria-hidden="true" className="relative hidden h-[190px] lg:block">
        <CartaFantasma className="absolute left-[3%] top-[34px] w-[190px] opacity-50" />
        <CartaSegnale
          className="absolute left-[15%] top-[102px] w-max max-w-[330px] animate-[vetrina-galleggia_7s_ease-in-out_infinite] vetrina-animata"
          icona={<IconaFiamma />}
          tono="arancio"
          titolo="Rischio incendio"
          sotto="Magazzinaggio · ATECO 52.10"
          etichetta={{ testo: '5 su 7', tono: 'rosso' }}
        />
        <CartaSegnale
          className="absolute left-[37%] top-[8px] w-max max-w-[360px] animate-[vetrina-galleggia_8s_ease-in-out_1s_infinite] vetrina-animata"
          icona={<IconaOnde />}
          tono="blu"
          titolo="Alluvione"
          sotto="28,8 % delle imprese del comune in area elevata"
          etichetta={{ testo: 'alta', tono: 'rosso' }}
        />
        <CartaSegnale
          className="absolute right-[16%] top-[112px] w-max max-w-[330px] animate-[vetrina-galleggia_6.5s_ease-in-out_0.5s_infinite] vetrina-animata"
          icona={<IconaFermo />}
          tono="petrolio"
          titolo="Fermo di 30 giorni"
          sotto="Stima sul fatturato dell’ultimo bilancio"
          etichetta={{ testo: '1,63 mln €', tono: 'ambra' }}
        />
        {/*
          A piena opacità: con opacity-80 l'etichetta ambra scendeva a 3,87:1 di contrasto, e axe
          la boccia anche dentro un'illustrazione nascosta ai lettori di schermo (19/09/2026).
        */}
        <CartaSegnale
          className="absolute right-[1%] top-[20px] w-max max-w-[300px]"
          icona={<IconaDocumento />}
          tono="magenta"
          titolo="Obbligo CAT NAT"
          sotto="Media impresa · termine 01/10/2025"
          etichetta={{ testo: 'soggetta', tono: 'ambra' }}
        />
      </div>

      {/*
        La finestra del prodotto, animata: il giro delle cinque schermate che un agente usa, dalla
        ricerca al report (TourProdotto.tsx). Fuori da questo contenitore nascosto, perché i passi
        sopra la finestra sono comandi veri.
      */}
      <TourProdotto />
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
          sotto="Logistica Orobia · sede legale a Dello"
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
  viola: 'bg-vetrina-viola',
} as const;

/** Il nome di un'azienda nella tabella di un pannello: la piccola tessera e il nome. */
function NomeAzienda({ nome }: { nome: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-vetrina-velo text-vetrina-grigio ring-1 ring-inset ring-vetrina-linea">
        <IconaPalazzo className="h-3 w-3" />
      </span>
      <span className="truncate font-medium text-vetrina-inchiostro">{nome}</span>
    </span>
  );
}

/**
 * La tabella sotto le carte, come nella finestra del prodotto: intestazioni e righe di esempio.
 * Prima erano quattro righe di barre grigie, e il pannello sembrava un'impaginazione non finita.
 * `griglia` è una classe scritta per intero da chi chiama, così Tailwind la trova nei sorgenti.
 */
function TabellaPannello({
  griglia,
  colonne,
  righe,
}: {
  griglia: string;
  colonne: readonly string[];
  righe: readonly (readonly React.ReactNode[])[];
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[38%] overflow-hidden bg-white">
      <div
        className={`grid ${griglia} items-center gap-3 border-b border-vetrina-linea bg-vetrina-carta px-6 py-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio`}
      >
        {colonne.map((colonna) => (
          <span key={colonna} className="truncate">
            {colonna}
          </span>
        ))}
      </div>
      {righe.map((riga, i) => (
        <div
          key={i}
          className={`grid ${griglia} items-center gap-3 border-b border-vetrina-linea/70 px-6 py-2.5 text-[12.5px] tabular-nums text-vetrina-grigio`}
        >
          {riga.map((cella, j) => (
            <span key={j} className="min-w-0 truncate">
              {cella}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Pannello({
  fondo,
  tabella,
  children,
}: {
  fondo: keyof typeof FONDI;
  tabella: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-[460px] overflow-hidden rounded-[32px] border border-vetrina-linea bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_30px_60px_-30px_rgba(16,24,40,0.25)] sm:h-[520px]"
    >
      <div className={`absolute inset-x-0 top-0 h-[62%] ${FONDI[fondo]}`}>
        {/*
          Tre strati sul colore pieno, che da solo sembra una campitura di prova: una luce dall'alto
          a destra, un'ombra in basso a sinistra che dà profondità, e un reticolo di puntini che
          sfuma verso il basso, come la carta millimetrata dei pannelli di Clay.
        */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_0%,rgba(255,255,255,0.32),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_100%,rgba(0,0,0,0.22),transparent_62%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>
      {tabella}
      {/* `vetrina-carte`: nella scena che scorre (ProdottoScorrevole.tsx) le carte entrano una alla volta. */}
      <div className="vetrina-carte absolute inset-x-5 top-8 flex flex-col items-end gap-3 sm:inset-x-auto sm:right-8 sm:w-[350px]">
        {children}
      </div>
    </div>
  );
}

/*
  Le ubicazioni senza nome di comune: un valore di pericolosità accanto a un comune vero sarebbe
  un'affermazione su quel comune, e questi valori sono di esempio.
*/
export function PannelloTerritorio() {
  return (
    <Pannello
      fondo="blu"
      tabella={
        <TabellaPannello
          griglia="grid-cols-[1.5fr_1fr_1fr_1fr]"
          colonne={['Ubicazione', 'Alluvione', 'Sisma', 'Frana']}
          righe={[
            [<NomeAzienda key="n" nome="Sede legale" />, 'alta', 'zona 3', 'bassa'],
            [<NomeAzienda key="n" nome="Magazzino A" />, 'media', 'zona 3', 'bassa'],
            [<NomeAzienda key="n" nome="Magazzino B" />, 'media', 'zona 3', 'bassa'],
            [<NomeAzienda key="n" nome="Uffici" />, 'bassa', 'zona 4', 'bassa'],
          ]}
        />
      }
    >
      <CartaSegnale
        className="w-full"
        icona={<IconaOnde />}
        tono="blu"
        titolo="Alluvione"
        sotto="28,8 % delle imprese del comune in area a pericolosità elevata"
        etichetta={{ testo: 'alta', tono: 'rosso' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaSisma />}
        tono="petrolio"
        titolo="Sisma"
        sotto="Classificazione della Protezione Civile"
        etichetta={{ testo: 'zona 3', tono: 'ambra' }}
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaFrana />}
        tono="arancio"
        titolo="Frana"
        sotto="0 % delle imprese in area a pericolosità elevata"
        etichetta={{ testo: 'bassa', tono: 'verde' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaScudo />}
        tono="magenta"
        titolo="Calamità naturali"
        sotto="Metà il pericolo più alto, metà la media dei tre"
        etichetta={{ testo: '5,34 su 7', tono: 'rosso' }}
      />
    </Pannello>
  );
}

/*
  L'obbligo catastrofale come lo scrive la scheda (packages/core/src/coverage/catnat.ts): gli
  eventi e i beni sono quelli della norma, i termini sono quelli veri di ciascuna classe (piccole
  31/12/2025, medie 01/10/2025), e «scaduto» è lo stato che il motore dà quando il termine è
  passato e nel fascicolo non risulta una polizza. Il valore dei beni è di esempio, come tutti i
  numeri delle illustrazioni; Logistica Orobia (118 addetti) è una media impresa.
*/
export function PannelloCatNat() {
  return (
    <Pannello
      fondo="viola"
      tabella={
        <TabellaPannello
          griglia="grid-cols-[1.7fr_0.9fr_1fr_0.9fr]"
          colonne={['Azienda', 'Dimensione', 'Termine', 'Stato']}
          righe={[
            [<NomeAzienda key="n" nome="Galvanica Brembana" />, 'piccola', '31/12/2025', 'scaduto'],
            [<NomeAzienda key="n" nome="Nordvalle Meccanica" />, 'media', '01/10/2025', 'scaduto'],
            [<NomeAzienda key="n" nome="Logistica Orobia" />, 'media', '01/10/2025', 'coperta'],
            [<NomeAzienda key="n" nome="Tessiture Serio" />, 'piccola', '31/12/2025', 'scaduto'],
          ]}
        />
      }
    >
      <CartaSegnale
        className="w-full"
        icona={<IconaDocumento />}
        tono="magenta"
        titolo="Obbligo CAT NAT"
        sotto="Piccola impresa · termine 31/12/2025"
        etichetta={{ testo: 'soggetta', tono: 'ambra' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaSisma />}
        tono="petrolio"
        titolo="Eventi da coprire"
        sotto="Sismi, alluvioni e inondazioni, frane"
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaPalazzo />}
        tono="blu"
        titolo="Beni da coprire"
        sotto="Fabbricati, impianti e attrezzature · stima"
        etichetta={{ testo: '2,41 mln €', tono: 'neutro' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaCampana />}
        tono="arancio"
        titolo="Stato dell’obbligo"
        sotto="Nessuna copertura catastrofale risultante"
        etichetta={{ testo: 'scaduto', tono: 'rosso' }}
      />
    </Pannello>
  );
}

/*
  Le cifre sono quelle della testata e delle altre illustrazioni: il fermo di 30 giorni di ogni
  azienda diviso trenta dà la perdita di un giorno (Logistica Orobia 1.627.397 € → 54.247 €).
*/
export function PannelloFermo() {
  return (
    <Pannello
      fondo="arancio"
      tabella={
        <TabellaPannello
          griglia="grid-cols-[1.7fr_1fr_1fr]"
          colonne={['Azienda', 'Un giorno', '30 giorni']}
          righe={[
            [<NomeAzienda key="n" nome="Logistica Orobia" />, '54.247 €', '1.627.397 €'],
            [<NomeAzienda key="n" nome="Nordvalle Meccanica" />, '11.814 €', '354.411 €'],
            [<NomeAzienda key="n" nome="Galvanica Brembana" />, '6.846 €', '205.380 €'],
            [<NomeAzienda key="n" nome="Tessiture Serio" />, '3.942 €', '118.260 €'],
          ]}
        />
      }
    >
      <CartaSegnale
        className="w-full"
        icona={<IconaEuro />}
        tono="arancio"
        titolo="Perdita in un giorno"
        sotto="Sul fatturato dell’ultimo bilancio"
        etichetta={{ testo: '54.247 €', tono: 'neutro' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 7 giorni"
        sotto="Una settimana di stop"
        etichetta={{ testo: '379.726 €', tono: 'ambra' }}
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 30 giorni"
        sotto="Un mese di stop"
        etichetta={{ testo: '1,63 mln €', tono: 'rosso' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFermo />}
        tono="neutro"
        titolo="Fermo di 90 giorni"
        sotto="Tre mesi di stop"
        etichetta={{ testo: '4,88 mln €', tono: 'rosso' }}
      />
    </Pannello>
  );
}

export function PannelloCrm() {
  return (
    <Pannello
      fondo="magenta"
      tabella={
        <TabellaPannello
          griglia="grid-cols-[1.6fr_1fr_1.3fr]"
          colonne={['Azienda', 'Stato', 'Nota']}
          righe={[
            [<NomeAzienda key="n" nome="Nordvalle Meccanica" />, 'in trattativa', 'Sopralluogo lunedì'],
            [<NomeAzienda key="n" nome="Galvanica Brembana" />, 'contattata', 'Richiamare a ottobre'],
            [<NomeAzienda key="n" nome="Logistica Orobia" />, 'da contattare', '—'],
            [<NomeAzienda key="n" nome="Carpenterie Alte Valli" />, 'cliente', 'Rinnovo a marzo'],
          ]}
        />
      }
    >
      <CartaSegnale
        className="w-full"
        icona={<IconaArchivio />}
        tono="magenta"
        titolo="Elenco salvato nel CRM"
        sotto="Bergamo · ATECO 25"
        etichetta={{ testo: '5 aziende', tono: 'neutro' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaFiltro />}
        tono="blu"
        titolo="Stessi filtri, aziende nuove"
        sotto="L’elenco parte dalle successive"
        etichetta={{ testo: 'nuove', tono: 'verde' }}
      />
      <CartaSegnale
        className="w-full"
        icona={<IconaSpunta />}
        tono="petrolio"
        titolo="Nordvalle Meccanica"
        sotto="Richiamare lunedì per il sopralluogo"
        etichetta={{ testo: 'in trattativa', tono: 'ambra' }}
      />
      <CartaSegnale
        className="w-full sm:w-[92%]"
        icona={<IconaPersone />}
        tono="neutro"
        titolo="2 già nel CRM"
        sotto="Non te le fa ricomprare"
      />
    </Pannello>
  );
}

/*
  Il Cyber Risk come lo mostra la scheda (ProtezioniVeezco.tsx): il punteggio del settore e le
  quattro voci, ciascuna da 1 a 7. I pesi esistono nel calcolo (tabelle-veezco.ts) ma la scheda non
  li mostra, e dal 19/09/2026 non li mostra nemmeno questa illustrazione: prima c'era la formula
  per esteso, che un cliente non avrebbe mai visto nel prodotto.
*/
export function PannelloCyber() {
  const voci = [
    { nome: 'Dipendenza digitale', valore: 6 },
    { nome: 'Sensibilità dei dati', valore: 4 },
    { nome: 'Esposizione alle transazioni', valore: 4 },
    { nome: 'Attrattività come bersaglio', valore: 6 },
  ];
  return (
    <div
      aria-hidden="true"
      className="vetrina-carte relative flex min-h-[460px] flex-col justify-between gap-4 overflow-hidden rounded-[32px] border border-vetrina-linea bg-vetrina-petrolio p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_30px_60px_-30px_rgba(16,24,40,0.25)] sm:min-h-[520px] sm:p-8"
    >
      {/*
        La luce e il reticolo restano fermi: nella scena che scorre entrano solo le carte
        (`data-fondo`). Stessi strati degli altri pannelli.
      */}
      <div
        data-fondo=""
        className="absolute inset-0 bg-[radial-gradient(100%_70%_at_20%_0%,rgba(255,255,255,0.25),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgba(0,0,0,0.2),transparent_62%)]"
      />
      <div
        data-fondo=""
        className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
      />
      <div className="relative flex items-center gap-4 rounded-2xl border border-vetrina-linea bg-white p-5 shadow-[0_18px_36px_-16px_rgba(16,24,40,0.35)]">
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

      {/* Le quattro voci a colpo d'occhio: una barra ciascuna, lunga quanto il suo valore su 7. */}
      <div className="relative rounded-2xl border border-vetrina-linea bg-white p-5 shadow-[0_18px_36px_-16px_rgba(16,24,40,0.35)]">
        <p className="text-[13px] font-medium text-vetrina-grigio">Le quattro voci del settore</p>
        <div className="mt-3 space-y-2">
          {voci.map((v) => (
            <div key={v.nome} className="flex items-center gap-3">
              <span className="w-[46%] truncate text-[12.5px]">{v.nome}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-vetrina-velo">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((v.valore / 7) * 100)}%`,
                    background: colorePunteggio(v.valore),
                  }}
                />
              </span>
              <span className="w-8 text-right text-[12.5px] font-semibold tabular-nums">{v.valore}/7</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        {voci.map((v) => (
          <div
            key={v.nome}
            className="flex items-center gap-3 rounded-2xl border border-vetrina-linea bg-white p-3.5 shadow-[0_18px_36px_-16px_rgba(16,24,40,0.35)]"
          >
            <Anello valore={v.valore} testo={String(v.valore)} dimensione={44} />
            <span className="min-w-0 text-[13px] font-medium leading-snug">
              {v.nome}
              <span className="block font-normal text-vetrina-grigio">su 7</span>
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
          sotto="Richieste ed esigenze e motivazione, pronto da consegnare"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parti dai clienti che hai già: due finestre piccole
// ─────────────────────────────────────────────────────────────────────────────

/** Una finestrella di prodotto su fondo a puntini, per le due carte della sezione. */
function Finestrella({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[22px] border border-vetrina-linea bg-vetrina-velo/60 p-4 ${PUNTINI}`}
    >
      <div className="rounded-2xl border border-vetrina-linea bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_36px_-18px_rgba(16,24,40,0.25)]">
        {children}
      </div>
    </div>
  );
}

/*
  La ricerca per codice fiscale del socio (Ricerca Clienti, filtro «Codice Fiscale Socio»): il
  codice è mascherato perché un codice fiscale plausibile potrebbe essere di qualcuno, e le società
  sono inventate come in tutte le illustrazioni.
*/
export function MiniSoci() {
  return (
    <Finestrella>
      <p className="text-[11.5px] font-medium text-vetrina-grigio">Codice fiscale del socio</p>
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-vetrina-linea bg-vetrina-carta px-3 py-2 text-[13px] tracking-[0.12em] text-vetrina-inchiostro">
        <IconaPersone className="h-4 w-4 text-vetrina-grigio" />
        RSS ••• ••••• ••••X
      </div>
      <p className="mt-3 text-[11.5px] font-medium text-vetrina-grigio">3 società partecipate</p>
      <div className="mt-1.5 divide-y divide-vetrina-linea rounded-xl border border-vetrina-linea">
        {[
          ['Galvanica Brembana S.r.l.', 'già cliente'],
          ['Immobiliare Serio S.r.l.', 'da contattare'],
          ['Carpenterie Alte Valli S.r.l.', 'da contattare'],
        ].map(([nome, stato]) => (
          <div key={nome} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-vetrina-velo text-vetrina-grigio ring-1 ring-inset ring-vetrina-linea">
              <IconaPalazzo className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{nome}</span>
            <Etichetta tono={stato === 'già cliente' ? 'verde' : 'neutro'}>{stato}</Etichetta>
          </div>
        ))}
      </div>
    </Finestrella>
  );
}

/*
  Un cliente che l'agente ha già, cercato per partita IVA: la partita IVA è mascherata per la stessa
  ragione del codice fiscale. I valori sono quelli di Nordvalle Meccanica nelle altre illustrazioni
  (media impresa, termine 01/10/2025, fermo di 30 giorni 354.411 €).
*/
export function MiniPartitaIva() {
  return (
    <Finestrella>
      <p className="text-[11.5px] font-medium text-vetrina-grigio">Partita IVA</p>
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-vetrina-linea bg-vetrina-carta px-3 py-2 text-[13px] tracking-[0.12em] text-vetrina-inchiostro">
        <IconaLente className="h-4 w-4 text-vetrina-grigio" />
        IT ••••••••••4
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-vetrina-blu/14 to-vetrina-blu/6 text-vetrina-blu ring-1 ring-inset ring-vetrina-blu/15">
          <IconaPalazzo className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">Nordvalle Meccanica S.r.l.</p>
          <p className="text-[11.5px] text-vetrina-grigio">In portafoglio · polizza auto</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Property', '4,17 su 7'],
          ['Fermo 30 gg', '354.411 €'],
          ['CAT NAT', 'soggetta'],
        ].map(([voce, valore]) => (
          <div key={voce} className="rounded-xl border border-vetrina-linea bg-vetrina-carta px-2.5 py-2">
            <p className="text-[10.5px] text-vetrina-grigio">{voce}</p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold tabular-nums">{valore}</p>
          </div>
        ))}
      </div>
    </Finestrella>
  );
}
