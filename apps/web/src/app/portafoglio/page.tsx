import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { leggiPortafoglio } from '@/lib/api';
import type { VocePortafoglio } from '@/lib/api';
import { applicaFiltroPortafoglio } from '@aegis/core';
// Il fuso è dichiarato dentro il formattatore, non dedotto da chi rende la pagina.
import { formattaGiorno } from '@aegis/core/tempo';
import { Avviso, Metrica, Scheda } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PaginaPortafoglio({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await richiediSessione();
  const { filtro } = await searchParams;

  const portafoglio = await leggiPortafoglio().catch(() => null);

  /*
    Due messaggi per lo stesso guasto, come sulla schermata di ricerca.

    Qui ce n'era uno solo e diceva all'intermediario di «avviare il backend con
    npm run dev:api». L'installazione consegnata parte da systemd: quel comando sulla sua
    macchina non esiste, un terminale su cui lanciarlo non ce l'ha, e ciò che legge è un
    prodotto che gli chiede una cosa fuori dalla sua portata. In sviluppo invece è
    esattamente l'informazione che serve, e resta.
  */
  if (portafoglio === null) {
    return process.env.NODE_ENV === 'production' ? (
      <Avviso tono="critico" titolo="Portafoglio momentaneamente non disponibile">
        Non è al momento possibile leggere l&apos;elenco delle aziende analizzate. Nulla è andato perso: i
        dati restano in archivio. Se la situazione persiste, segnalarlo all&apos;assistenza.
      </Avviso>
    ) : (
      <Avviso tono="critico" titolo="Servizio API non raggiungibile">
        Avviare il servizio con <code className="font-mono">npm run dev:api</code>, oppure indicare
        l&apos;indirizzo corretto nella variabile <code className="font-mono">AEGIS_API_URL</code>.
      </Avviso>
    );
  }

  if (portafoglio.aziende.length === 0) {
    return (
      <>
        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Portafoglio</h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Qui compaiono le aziende analizzate, ordinate per urgenza di intervento.
        </p>
        <Scheda className="text-center">
          <p className="text-sm text-testo-tenue">Nessuna azienda ancora analizzata.</p>
          <p className="mt-3 text-sm text-testo-tenue">
            <Link href="/portafoglio/importa" className="text-marchio underline">
              Carica l’elenco dei tuoi clienti
            </Link>{' '}
            per prenderli in carico tutti insieme, oppure{' '}
            <Link href="/" className="text-marchio underline">
              cerca la prima azienda
            </Link>
            .
          </p>
        </Scheda>
      </>
    );
  }

  /*
    Il filtro arriva dal dominio, non è scritto qui.

    L'elenco ora si può anche esportare, e la stessa regola serve in due punti: se le due
    copie divergessero, il broker scaricherebbe una lista diversa da quella che sta
    guardando — e se ne accorgerebbe davanti al cliente, non prima.
  */
  const aziende = applicaFiltroPortafoglio(portafoglio.aziende, filtro);

  const { riepilogo } = portafoglio;
  const quotaNonConformi =
    riepilogo.totale === 0 ? 0 : Math.round((riepilogo.nonConformiCatNat / riepilogo.totale) * 100);

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Portafoglio</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Un collegamento e non un pulsante: è una navigazione verso un file, e come tale
            deve poter essere aperta in una scheda nuova o copiata. `download` chiede al
            browser di salvare invece di mostrare, e il filtro corrente viaggia con
            l'indirizzo — si scarica ciò che si sta guardando.
          */}
          <a
            href={filtro === undefined ? '/portafoglio/esporta' : `/portafoglio/esporta?filtro=${filtro}`}
            download
            className="rounded border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:text-testo"
          >
            Esporta in CSV
          </a>
          <Link
            href="/portafoglio/importa"
            className="rounded border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:text-testo"
          >
            Importa elenco clienti
          </Link>
        </div>
      </div>
      {/*
        Interlinea stretta e margine corto finché lo schermo è stretto.

        A 390 pixel queste due frasi occupano cinque righe: con l'interlinea larga sono
        oltre cento pixel, più di qualunque riquadro di sintesi, e sono la ragione per cui
        la lista di lavoro finiva diciannove pixel sotto la piega. Una piccola ironia,
        visto che il paragrafo dice di non essere un cruscotto da guardare: nel dirlo
        spingeva giù le telefonate.

        Non si nasconde niente e non si accorcia niente: si stringe la spaziatura dove lo
        spazio costa, e da `sm` in su resta com'era.
      */}
      {/*
        «Scoperta» qui NON si può usare, e non è una questione di stile.

        In una polizza lo «scoperto» è la quota di ogni sinistro che resta a carico
        dell'assicurato — il prodotto stesso lo usa in quel senso: `scoperto: number | null`
        fra le condizioni di una polizza, e la soglia del 15% citata dalla norma CAT NAT.
        Chiamare «esposizione scoperta» il patrimonio NON ASSICURATO dà alla stessa parola
        due significati nella stessa applicazione, davanti all'unico lettore che li
        distingue entrambi per mestiere.

        La scheda dell'impresa la chiamava già «esposizione non assicurata»: adesso le due
        schermate dicono lo stesso nome per la stessa grandezza.
      */}
      <p className="mb-4 max-w-3xl text-sm leading-snug text-testo-tenue sm:mb-6 sm:leading-relaxed">
        Ordinato per urgenza: prima le posizioni non conformi a un obbligo di legge, poi per esposizione
        patrimoniale non assicurata. Non è un cruscotto da guardare, è una lista di telefonate da fare.
      </p>

      {/*
        Due colonne già sullo schermo più stretto: incolonnate una sotto l'altra, le
        quattro sintesi occupano l'intera altezza del telefono e spingono sotto la piega
        proprio la lista di lavoro, che è la ragione per cui si apre questa pagina.
      */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etichetta="Aziende analizzate" valore={String(riepilogo.totale)} />
        {/*
          «Non conformi» è un accertamento, e su un portafoglio in cui le polizze non sono
          state censite non lo si può fare: si sa che fra le coperture note non ne risulta
          una catastrofale, e se di coperture note non ce n'è nessuna quel numero non
          afferma un'inadempienza — segnala una verifica da fare.

          La differenza pesa: questa è la schermata che un intermediario guarda per decidere
          chi chiamare, e «sei clienti inadempienti a una legge» è una telefonata diversa da
          «sei clienti di cui non ho ancora controllato le polizze».
        */}
        <Metrica
          etichetta="Senza CAT NAT censita"
          valore={String(riepilogo.nonConformiCatNat)}
          nota={`${quotaNonConformi}% del portafoglio · obbligo di legge, da verificare sulle polizze`}
          tono={riepilogo.nonConformiCatNat > 0 ? 'critico' : 'positivo'}
        />
        <Metrica
          etichetta="Coperture da attivare"
          valore={String(riepilogo.coperturaAssenteTotale)}
          nota="Somma delle garanzie assenti"
        />
        {/*
          Il numero grande in forma breve, la cifra esatta nella nota.

          «8.147.000 €» a schermo intero è quasi centottanta pixel: in un riquadro che a
          390 pixel ne ha centotrentatré non ci sta, e le due vie d'uscita sono entrambe
          difetti. Lasciarlo uscire spinge fuori l'intera pagina; mandarlo a capo alza il
          riquadro e caccia sotto la piega la lista di lavoro, che è la ragione per cui
          questa schermata si apre. Il collaudo ha misurato prima l'uno — cinque pixel di
          traboccamento — e poi l'altro: trenta pixel di lista perduta.

          La terza via è non far dipendere la sintesi dalla lunghezza di un numero.
          «8,1 Mln €» sta ovunque, e la cifra al centesimo resta leggibile subito sotto,
          in un testo piccolo che può andare a capo senza conseguenze. Su una scheda di
          sintesi è anche la forma giusta: il dettaglio è nella tabella, due dita più giù.
        */}
        <Metrica
          etichetta="Esposizione complessiva"
          valore={new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            notation: 'compact',
            // Il minimo a zero toglie il decimale quando non dice niente: senza, un
            // portafoglio vuoto mostra «0,0 €» e uno da 950 mila «950,0K €».
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          }).format(riepilogo.esposizioneComplessivaEuro)}
          nota={`${new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          }).format(riepilogo.esposizioneComplessivaEuro)} · patrimonio non assicurato dei clienti seguiti`}
          tono="attenzione"
        />
      </div>

      <nav aria-label="Filtri" className="mb-4 flex flex-wrap gap-2">
        {[
          { chiave: undefined, testo: `Tutte (${portafoglio.aziende.length})` },
          {
            chiave: 'catnat',
            testo: `Senza CAT NAT censita (${riepilogo.nonConformiCatNat})`,
          },
          {
            chiave: 'scoperte',
            testo: `Con coperture assenti (${portafoglio.aziende.filter((a) => a.coperturaAssente > 0).length})`,
          },
        ].map((voce) => {
          const attivo = filtro === voce.chiave;
          return (
            <Link
              key={voce.testo}
              href={voce.chiave === undefined ? '/portafoglio' : `/portafoglio?filtro=${voce.chiave}`}
              aria-current={attivo ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                attivo
                  ? 'border-marchio bg-azione text-azione-testo'
                  : 'border-bordo-forte bg-superficie hover:border-marchio/50'
              }`}
            >
              {voce.testo}
            </Link>
          );
        })}
      </nav>

      {/*
        Su schermo stretto la tabella diventa un elenco di schede.
        Lo scorrimento orizzontale non basta: il broker che apre il portafoglio in azienda,
        davanti al cliente, vedrebbe azienda e score e niente altro — né lo stato CAT NAT,
        né l'esposizione, né il comando per aprire la posizione — senza alcun indizio che
        ci sia dell'altro fuori dallo schermo.
      */}
      <ul className="space-y-2 md:hidden">
        {aziende.map((azienda) => (
          <li key={azienda.identificativo} className="rounded-lg border border-bordo bg-superficie p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{azienda.denominazione}</p>
                <p className="text-xs text-testo-debole">
                  {azienda.provincia ?? '—'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
                </p>
                {/* Anche sullo schermo stretto: la freschezza del dato non è un dettaglio
                    da desktop. */}
                <p className="text-xs text-testo-debole">
                  analizzata il {formattaGiorno(azienda.analizzataIl)}
                </p>
              </div>
              <StatoCatNat azienda={azienda} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-testo-debole">Score</dt>
                <dd>
                  <PunteggioCredito azienda={azienda} />
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-testo-debole">Esposizione non assicurata</dt>
                <dd className="tabular font-medium">{esposizione(azienda)}</dd>
              </div>
            </dl>

            {azienda.azionePrioritaria !== null && (
              <p className="mt-3 border-l-2 border-marchio/40 pl-2 text-xs leading-relaxed text-testo-tenue">
                {azienda.azionePrioritaria}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-testo-debole">
                Dati di intervista {Math.round(azienda.completezza * 100)}%
                {azienda.coperturaAssente > 0 && ` · ${azienda.coperturaAssente} coperture assenti`}
              </span>
              <Link
                href={`/azienda/${azienda.identificativo}`}
                className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
              >
                Apri
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-bordo md:block">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">
            Aziende in portafoglio con stato di conformità ed esposizione non assicurata
          </caption>
          <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Azienda
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Score
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                CAT NAT
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Esposizione non assicurata
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Prossima azione
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {aziende.map((azienda) => (
              <tr key={azienda.identificativo} className="border-t border-bordo bg-superficie align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{azienda.denominazione}</p>
                  <p className="text-xs text-testo-debole">
                    {azienda.provincia ?? '—'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
                  </p>
                  {/*
                    QUANDO È STATA FATTA, che è ciò che decide se questa riga si lavora oggi.

                    La data viaggiava già dentro il DTO e finiva nel CSV esportato, sotto
                    l'intestazione «Analizzata il»: sullo schermo non compariva da nessuna
                    parte. Un portafoglio è una lista di telefonate, e senza la data un'analisi
                    di sei mesi fa è indistinguibile da una di ieri — con i punteggi, i fidi e
                    le esposizioni che nel frattempo si sono mossi.
                  */}
                  <p className="mt-0.5 text-xs text-testo-debole">
                    Dati di intervista {Math.round(azienda.completezza * 100)}% · analizzata il{' '}
                    {formattaGiorno(azienda.analizzataIl)}
                  </p>
                </td>

                <td className="px-4 py-3">
                  <PunteggioCredito azienda={azienda} />
                </td>

                <td className="px-4 py-3">
                  <StatoCatNat azienda={azienda} />
                </td>

                <td className="tabular px-4 py-3 text-right font-medium">
                  {esposizione(azienda)}
                  {azienda.coperturaAssente > 0 && (
                    <span className="block text-xs font-normal text-testo-debole">
                      {azienda.coperturaAssente} coperture assenti
                    </span>
                  )}
                </td>

                <td className="max-w-xs px-4 py-3 text-xs leading-relaxed text-testo-tenue">
                  {azienda.azionePrioritaria ?? '—'}
                </td>

                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/azienda/${azienda.identificativo}`}
                    className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
                  >
                    Apri
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aziende.length === 0 && (
        <p className="mt-4 text-sm text-testo-tenue">Nessuna azienda corrisponde al filtro scelto.</p>
      )}

      {/*
        Dove sta il verdetto, detto una volta sola in fondo alla tabella.

        L'elenco mostra il punteggio, non il giudizio: dalla proiezione di portafoglio non
        si può sapere se protesti e procedure siano stati verificati per quella riga, e
        colorare di verde uno score che la scheda della stessa azienda dichiara
        «provvisorio» era una contraddizione che solo chi apriva la scheda poteva vedere.
      */}
      <p className="mt-4 text-xs leading-relaxed text-testo-debole">
        Lo score è quello calcolato all&apos;ultima analisi. Se per quell&apos;azienda protesti,
        pregiudizievoli e procedure concorsuali non sono stati verificati il punteggio è{' '}
        <strong className="text-testo-tenue">provvisorio</strong>, e la scheda della singola azienda lo
        dichiara accanto al numero: una procedura aperta azzera il fido consigliato.
      </p>
    </>
  );
}

/**
 * I due frammenti condivisi fra la tabella e le schede.
 *
 * Scritti una volta sola: due impaginazioni della stessa informazione che divergono sono
 * peggio di una sola impaginazione imperfetta — il broker vedrebbe numeri diversi a
 * seconda dello schermo, e non saprebbe a quale credere.
 */
/**
 * L'esposizione non assicurata, con la distinzione fra «zero» e «ignoto».
 *
 * Su un'azienda che deposita il bilancio in forma abbreviata nessun capitale è ricavabile:
 * la somma delle esposizioni quantificate vale legittimamente zero, ma stampare «0 €» in
 * una lista di lavoro fa saltare proprio le posizioni da lavorare per prime.
 */
function esposizione(azienda: VocePortafoglio): string {
  return azienda.esposizioneNonAssicurata.euro === 0 && azienda.coperturaDaQuantificare > 0
    ? 'da quantificare'
    : azienda.esposizioneNonAssicurata.formattato;
}

/**
 * Il punteggio in elenco, **senza il verdetto**.
 *
 * Qui il numero veniva colorato: verde sopra 65, rosso sotto 50. Ma su ogni azienda per
 * cui protesti e procedure non sono stati verificati — il caso predefinito, perché quella
 * verifica costa quarantacinque centesimi e si compra a parte — la scheda della **stessa**
 * azienda dichiara in testata «provvisorio: protesti e procedure non verificati», e
 * accanto al fido «una procedura concorsuale aperta lo azzera, e non è stata verificata».
 * Un verde in elenco e una riserva sulla scheda sono due affermazioni opposte sullo stesso
 * numero, e chi lavora sull'elenco vede solo la prima.
 *
 * La confidenza del credito esiste nel motore ed è esposta sulla scheda, ma **non passa
 * dalla proiezione di portafoglio**: `VocePortafoglio` non la porta. Finché non c'è, qui
 * si mostra ciò che si sa — il punteggio e la sua classe — e non un giudizio che questa
 * riga non è in grado di sostenere. La nota sotto la tabella dice dove sta il verdetto.
 */
function PunteggioCredito({ azienda }: { azienda: VocePortafoglio }) {
  return (
    <>
      {/*
        Un `null` in JSX non stampa niente: la cella sarebbe rimasta VUOTA accanto alla
        classe «ND», e una cella vuota in una tabella si legge come un guasto, non come
        un'informazione. Il trattino dice che il posto c'è e il numero no.
      */}
      <span className="tabular font-semibold">{azienda.scoreCredito ?? '—'}</span>
      <span className="ml-1 text-xs text-testo-debole">{azienda.classeCredito}</span>
    </>
  );
}

function StatoCatNat({ azienda }: { azienda: VocePortafoglio }) {
  if (azienda.catNatConforme) {
    return (
      <span className="rounded border border-basso/30 bg-basso-fondo px-1.5 py-0.5 text-xs font-medium text-basso">
        conforme
      </span>
    );
  }

  /*
    Si dice ciò che risulta, non ciò che si presume: fra le polizze note non ce n'è una
    catastrofale. Se le polizze note sono zero, «inadempiente» sarebbe una parola messa al
    posto di una verifica mai fatta.
  */
  return (
    <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium text-critico">
      non censita
    </span>
  );
}
