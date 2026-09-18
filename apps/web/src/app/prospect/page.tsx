import { CollegamentoAzione } from '@/components/CollegamentoAzione';
import { BottoneInvioGet } from '@/components/BottoneInvioGet';
import { richiediSessione } from '@/lib/sessione';
import { INDIRIZZO_API, cercaAziende, cercaProspect, statoServizio } from '@/lib/api';
import type { RisultatoProspezione } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { comunePerCodiceCatastale, etichettaComune } from '@aegis/core/comuni';
import { formattaGiornoEsteso } from '@aegis/core/tempo';
import { SelettoreLotto } from './SelettoreLotto';
import { SelettoreComune } from './SelettoreComune';
import { BottoneElenco } from './BottoneElenco';
import { ModuloRicerca } from './ModuloRicerca';
import { SchedaRisultato } from './SchedaRisultato';
import { ConfrontoConElencoComprato, RicordaElenco } from './UltimoElenco';
import { FissaIndirizzoElenco } from './FissaIndirizzoElenco';
import { centesimiPerRiga } from '@/lib/prezzo-prospect';

export const dynamic = 'force-dynamic';

/**
 * Quanto costa una riga dell'elenco, **finché non c'è una risposta**.
 *
 * Il fornitore dichiara il costo a ogni risposta, e da lì in poi il prezzo unitario si
 * ricava dividendo — non si ricorda. Questo valore serve al solo campo «quante aziende
 * vuoi», che deve mostrare una cifra mentre si digita, prima che qualunque chiamata sia
 * partita.
 *
 * Il commento qui diceva «sta in un solo posto», e non era vero: il numero era scritto
 * anche accanto al totale della risposta, dove il prezzo vero c'era già. Adesso è vero, ma
 * con un limite dichiarato: **è una stima di listino, non il prezzo di contratto.** Il
 * costo del lotto (`costoLotto` in `packages/providers`) non passa dalla configurazione
 * dei prezzi negoziati, quindi con un listino diverso da quello pubblico questa cifra
 * resta indietro finché non arriva la prima risposta. Chiuderlo è una modifica di quel
 * pacchetto, non di questa pagina.
 */
const CENTESIMI_PER_AZIENDA = 5;

/**
 * Ricerca Clienti: trovare aziende nuove per insiemi, e cercarne una per partita IVA.
 *
 * È la pagina che porta clienti **nuovi** invece di analizzare quelli che si hanno già:
 * si descrive un insieme — una città, un settore, una dimensione — e si scopre chi lo
 * popola.
 *
 * Dal 13/09/2026 la città ha preso il posto della provincia, e la ricerca per partita IVA,
 * che aveva una pagina sua, sta qui in fondo come sezione a parte. Dal 17/09/2026
 * («AEGIS - cambi.pptx») la città non è più obbligatoria: basta un filtro qualunque fra
 * quelli che descrivono un'impresa. E la sezione in fondo cerca soltanto per partita IVA.
 *
 * Ciò che rende usabile la ricerca è il conteggio gratuito: il numero di aziende
 * corrispondenti si ottiene senza scaricare nulla e senza spendere, e l'elenco si acquista
 * solo quando quel numero ha senso. Senza, comporre una ricerca per tentativi costerebbe
 * un centesimo a tentativo — poco, ma abbastanza da far smettere di provare, che è il
 * modo peggiore di risparmiare.
 */
export default async function PaginaProspect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await richiediSessione();
  const parametri = await searchParams;

  const criteri = {
    // Il codice catastale della città scelta: è con quello che il fornitore filtra.
    comune: (parametri['comune'] ?? '').trim().toUpperCase(),
    denominazione: parametri['denominazione'] ?? '',
    ateco: parametri['ateco'] ?? '',
    addettiMin: parametri['addettiMin'] ?? '',
    addettiMax: parametri['addettiMax'] ?? '',
    fatturatoMinEuro: parametri['fatturatoMinEuro'] ?? '',
    fatturatoMaxEuro: parametri['fatturatoMaxEuro'] ?? '',
    socioCodiceFiscale: parametri['socioCodiceFiscale'] ?? '',
    // Predefinito «solo S.r.l.»: è la forma su cui l'analisi è completa, e partire
    // dalle ditte individuali significa pagare righe che non si possono valutare.
    formaGiuridicaCodice: parametri['formaGiuridicaCodice'] ?? 'SR',
    // Quante aziende scaricare: il prezzo è **a record**, non a ricerca, e senza un lotto
    // dichiarato un elenco su una città grande costerebbe centinaia di euro.
    /*
      Cinque, non venticinque.

      Il valore predefinito di un campo che spende è una decisione economica presa al
      posto dell'utente. Con venticinque, chi apre la pagina e preme il pulsante senza
      guardare paga un euro e venticinque; con cinque ne paga venticinque centesimi. Se
      ne vuole di più li scrive, e mentre li scrive vede il prezzo salire.

      È già successo: un elenco da venticinque comprato senza volerlo, su filtri che per
      giunta non erano quelli mostrati a schermo.
    */
    limite: parametri['limite'] ?? '5',
  };

  /*
    Quando si cerca.

    Fino al 17/09/2026 decideva la città, obbligatoria. Ora è facoltativa come gli altri
    filtri, e decide la domanda che la città copriva: l'utente ha descritto un'impresa?
    Forma giuridica e numero di aziende arrivano già compilati a chi apre la pagina, e da
    soli conterebbero tutte le S.r.l. d'Italia: non bastano (vedi `haDescrittoUnImpresa`).

    Una città scritta ma non riconosciuta ferma la ricerca: cercare in tutta Italia al posto
    della città che l'utente crede di aver scelto sarebbe un elenco pagato sul posto sbagliato.
  */
  const comuneScelto = comunePerCodiceCatastale(criteri.comune);
  const cittaNonRiconosciuta = criteri.comune !== '' && comuneScelto === null;
  // `scarica` è l'unica azione che spende: senza, la pagina si limita a contare.
  const scarica = parametri['scarica'] === '1';

  /*
    Ha descritto un'impresa, o ha solo aperto la pagina?

    Forma giuridica e numero di aziende arrivano già compilati a chi non ha scritto niente:
    da soli quei due campi non sono una ricerca — non si cerca «una S.r.l.».

    Serve due volte: decide se si cerca, e se ha senso il confronto con l'elenco già
    comprato, che su un modulo in cui non c'è scritto niente direbbe «filtri quasi uguali»
    confrontandosi col vuoto.
  */
  const SOLO_PREDEFINITI: readonly string[] = ['formaGiuridicaCodice', 'limite'];
  const haDescrittoUnImpresa = Object.entries(criteri).some(
    ([campo, valore]) => !SOLO_PREDEFINITI.includes(campo) && valore.trim() !== '',
  );
  /*
    «Conta Aziende» premuto a campi vuoti.

    Il modulo manda sempre anche forma giuridica e numero di aziende, che chi apre la
    pagina dal menu non ha nell'indirizzo: è così che i due casi si distinguono, e solo il
    primo merita di sentirsi dire cosa manca.
  */
  const moduloInviatoVuoto =
    !haDescrittoUnImpresa &&
    (parametri['limite'] !== undefined || parametri['formaGiuridicaCodice'] !== undefined);
  // I filtri facoltativi davvero messi: senza, uno zero non ha niente da diagnosticare.
  const haFiltriFacoltativi = Object.entries(criteri).some(
    ([campo, valore]) => campo !== 'comune' && campo !== 'limite' && valore.trim() !== '',
  );

  /*
    La ricerca di un'azienda già nota, nella sezione in fondo: solo per partita IVA.

    Cercava anche per ragione sociale fino al 17/09/2026 («Secondo me per ragione sociale va
    tolto, solo PIVA», AEGIS - cambi.pptx): un vecchio indirizzo con `q` non cerca più niente.
  */
  const partitaIvaCercata = (parametri['piva'] ?? '').trim();
  const cercaUnAzienda = partitaIvaCercata !== '';

  const stato = await statoServizio().catch(() => null);

  let risultato: RisultatoProspezione | null = null;
  let errore: string | null = null;

  if (haDescrittoUnImpresa && !cittaNonRiconosciuta) {
    try {
      /*
        `salta` arriva solo dall'indirizzo di un elenco già comprato (FissaIndirizzoElenco): è la
        pagina ricaricata, e deve ripetere la stessa richiesta invece di comprare le successive.
      */
      risultato = await cercaProspect(criteri, {
        soloConteggio: !scarica,
        ...(scarica && parametri['salta'] !== undefined ? { salta: parametri['salta'] } : {}),
      });
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  let risultatiAzienda: Awaited<ReturnType<typeof cercaAziende>> | null = null;
  let erroreAzienda: string | null = null;

  if (cercaUnAzienda) {
    try {
      risultatiAzienda = await cercaAziende({ partitaIva: partitaIvaCercata });
    } catch (e) {
      erroreAzienda = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  return (
    <>
      {/*
        Qui c'era il richiamo «Hai già scaricato un elenco… resta in archivio per ventiquattro
        ore», tolto il 17/09/2026 («Togli totalmente questo banner non serve»): le aziende di
        un elenco comprato vanno nel CRM, e ci restano per sempre.
      */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Trova nuove aziende</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Cerca le imprese che corrispondono ai tuoi criteri.
        </p>
      </div>

      {/*
        Due messaggi diversi per lo stesso guasto, perché i lettori sono due.
        In sviluppo serve l'indirizzo che non risponde e il comando per riavviare; in
        esercizio quel testo direbbe a un intermediario di lanciare comandi che non può
        lanciare, facendo sembrare rotto il prodotto invece del servizio.
      */}
      {stato === null && (
        <div className="mb-6">
          {process.env.NODE_ENV === 'production' ? (
            <Avviso tono="critico" titolo="Servizio momentaneamente non disponibile">
              Non è al momento possibile interrogare gli archivi. I dati già acquisiti restano consultabili
              dal CRM. Se la situazione persiste, segnalarlo all&apos;assistenza.
            </Avviso>
          ) : (
            <Avviso tono="critico" titolo="Servizio API non raggiungibile">
              Nessuna risposta da <code className="font-mono">{INDIRIZZO_API}</code>. Avviare il servizio
              con <code className="font-mono">npm run dev:api</code>, oppure indicare l&apos;indirizzo
              corretto nella variabile <code className="font-mono">AEGIS_API_URL</code>.
            </Avviso>
          )}
        </div>
      )}

      {/*
        La modalità va dichiarata in entrambi i versi. Sapere di essere in dimostrativo
        evita di prendere per buoni dei numeri inventati; sapere di essere sui dati reali
        evita di scoprire a fine mese quanto è costato provare.

        Il rimedio è diverso perché lo è chi legge, e dirgliene uno che non lo riguarda è
        peggio del silenzio: la versione precedente rimandava «alle impostazioni», dove
        non c'è nulla da attivare. Il collegamento agli archivi dipende dalla
        configurazione con cui il servizio è stato avviato — chi sviluppa può cambiarla
        con un comando, un intermediario no, e mandarcelo lo fa sentire incapace di una
        cosa che è semplicemente fuori dalla sua portata.
      */}
      {stato !== null && !stato.datiReali && (
        <div className="mb-6">
          <Avviso tono="informativo" titolo="Modalità dimostrativa">
            Le aziende che compaiono qui sono <strong>inventate</strong>, per quanto coerenti: servono a
            provare il percorso e non consumano credito, ma su di esse non si fonda nessuna proposta a un
            cliente.{' '}
            {process.env.NODE_ENV === 'production' ? (
              <>
                Il collegamento agli archivi camerali non è attivo su questa installazione: segnalarlo
                all&apos;assistenza.
              </>
            ) : (
              <>
                Per lavorare sulle aziende vere, riavviare il servizio con{' '}
                <code className="font-mono">npm run dev:api</code> al posto di{' '}
                <code className="font-mono">npm run dev:api:demo</code>.
              </>
            )}
          </Avviso>
        </div>
      )}

      {/*
        Qui c'era l'avviso «Dati reali — ogni analisi consuma credito», tolto il 17/09/2026
        («Togli Completamente», AEGIS - cambi.pptx). Il costo dell'elenco resta scritto accanto
        al numero di aziende, prima del pulsante che spende.
      */}
      <Scheda className="mb-6">
        <form method="get" id="ricerca-prospect" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelettoreComune codiceIniziale={criteri.comune} />
            <Campo
              nome="ateco"
              etichetta="Codice ATECO"
              valore={criteri.ateco}
              segnaposto="2562"
              nota="Inserisci il codice senza punti"
            />
            <Campo
              nome="addettiMin"
              etichetta="Dipendenti min."
              valore={criteri.addettiMin}
              segnaposto="20"
              numerico
            />
            <Campo
              nome="addettiMax"
              etichetta="Dipendenti max."
              valore={criteri.addettiMax}
              segnaposto="250"
              numerico
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              nome="fatturatoMinEuro"
              etichetta="Fatturato min."
              valore={criteri.fatturatoMinEuro}
              segnaposto="2000000"
              numerico
            />
            <Campo
              nome="fatturatoMaxEuro"
              etichetta="Fatturato max."
              valore={criteri.fatturatoMaxEuro}
              segnaposto="50000000"
              numerico
            />
            <Campo
              nome="denominazione"
              etichetta="Ragione Sociale"
              valore={criteri.denominazione}
              segnaposto="parte della ragione sociale"
            />

            {/*
              Il filtro che un intermediario usa più di tutti, una volta che sa che c'è:
              dal codice fiscale di una persona escono **tutte le società in cui ha una
              quota**. Un cliente che ne possiede quattro è quattro rapporti, non uno, e
              nessuna ricerca per territorio o settore li mette mai in fila insieme.

              L'API lo accetta da sempre; mancava solo il campo per scriverlo.
            */}
            <Campo
              nome="socioCodiceFiscale"
              etichetta="Codice Fiscale Socio"
              valore={criteri.socioCodiceFiscale}
              segnaposto="RSSGNN70A01A944X"
              maiuscolo
              nota="Trova le società partecipate dalla stessa persona."
            />

            {/*
              Il filtro che decide se un elenco vale qualcosa.

              Le ditte individuali non depositano bilanci: su di esse metà dell'analisi
              resta vuota qualunque cifra si spenda. E sono la maggioranza dell'archivio —
              su una ricerca reale, meccanica in provincia di Brescia, 339 su 542. Senza
              questo filtro due terzi di ogni elenco pagato sono imprese che non si
              possono valutare.

              Il fornitore accetta un codice per volta: l'elenco separato da virgole
              risponde zero.
            */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole">
                Forma giuridica
              </span>
              <select
                name="formaGiuridicaCodice"
                defaultValue={criteri.formaGiuridicaCodice}
                className="w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm focus:border-marchio"
              >
                <option value="SR">Solo S.r.l.</option>
                <option value="SP">Solo S.p.A.</option>
                <option value="RS">Solo S.r.l. semplificate</option>
                <option value="DI">Solo ditte individuali</option>
                <option value="">Tutte le forme</option>
              </select>
              <span className="mt-1 block text-xs text-testo-tenue">
                Per le ditte individuali alcuni dati finanziari potrebbero non essere disponibili.
              </span>
            </label>

            {/*
              Il lotto è una scelta economica, non tecnica: il servizio si paga a record,
              e questo campo è il punto in cui l'intermediario decide quanto spendere.
            */}
            <SelettoreLotto
              valoreIniziale={criteri.limite}
              centesimiPerAzienda={CENTESIMI_PER_AZIENDA}
              massimo={100}
            />
          </div>

          {/*
            L'avviso sta **prima** dei pulsanti, non dopo: dopo sarebbe una spiegazione di
            un addebito già avvenuto.

            È costato venticinque centesimi scoprirlo: un elenco comprato con «addetti a
            250» e ricomprato poco dopo con «addetti a 200» — stesse cinque aziende in
            risposta, e la convinzione ragionevole di aver rifatto la stessa ricerca. A
            schermo non c'era nulla che dicesse con quali filtri era stato comprato quello
            che si aveva già.

            Compare solo quando una ricerca c'è: su un modulo vuoto non c'è niente da
            confrontare, e il richiamo qui sopra dice già dov'è l'elenco.
          */}
          {haDescrittoUnImpresa && <ConfrontoConElencoComprato criteri={criteri} />}

          <div className="flex flex-wrap items-center gap-3">
            <BottoneInvioGet
              inCorso="Conteggio in corso…"
              className="rounded border border-bordo-forte px-5 py-2 text-sm font-medium transition hover:border-marchio"
            >
              Conta Aziende <span className="text-testo-debole">non consuma crediti</span>
            </BottoneInvioGet>

            {/*
              Il pulsante che spende **invia questo modulo**, quindi compra per costruzione
              ciò che è scritto nei campi.

              Prima era un collegamento composto dai parametri dell'indirizzo, e bastava
              che il browser ripristinasse i campi dopo un «indietro» — cosa che fa da solo
              — perché a schermo comparissero i filtri di prima e l'indirizzo fosse vuoto.
              Si leggeva «Brescia, ATECO 2562, dieci aziende» e si compravano venticinque
              ditte individuali di Agrigento: un euro e venticinque, e nessun modo di
              capire perché.

              Sta qui accanto al conteggio e non più in fondo alla pagina: il conteggio non
              deve essere un passaggio obbligato per arrivare all'elenco.

              È un componente a sé perché deve SPEGNERSI dopo il primo clic: la pagina non
              cambia finché il servizio non risponde, e un secondo clic è un secondo
              acquisto. Il pulsante di accesso, che non costa niente, si disabilitava già.
            */}
            <BottoneElenco etichetta="Crea Elenco" />
          </div>
        </form>
      </Scheda>

      {/*
        Due casi in cui la ricerca non parte, e la pagina deve dire perché: una pagina che non
        dice niente sembrerebbe una ricerca finita a vuoto.

        La città non riconosciuta arriva da un indirizzo scritto a mano: il modulo non la lascia
        inviare, perché il campo si dichiara non valido finché il comune non è scelto
        dall'elenco. Il modulo vuoto è «Conta Aziende» premuto senza nessun filtro.
      */}
      {cittaNonRiconosciuta && (
        <div className="mb-6">
          <Avviso tono="attenzione" titolo="Città non riconosciuta">
            Scegli la città dall&apos;elenco dei comuni e ripeti la ricerca, oppure lasciala vuota per
            cercare in tutta Italia. Finché non è riconosciuta non parte nessuna richiesta, e non si spende
            niente.
          </Avviso>
        </div>
      )}
      {moduloInviatoVuoto && (
        <div className="mb-6">
          <Avviso tono="attenzione" titolo="Nessun filtro indicato">
            Indica almeno un criterio: città, codice ATECO, dipendenti, fatturato, ragione sociale o codice
            fiscale del socio. Senza, la ricerca conterebbe tutte le imprese d&apos;Italia, e non parte.
          </Avviso>
        </div>
      )}

      {errore !== null && (
        <Avviso tono="attenzione" titolo="Ricerca non eseguita">
          {errore}
        </Avviso>
      )}

      {risultato !== null && risultato.soloConteggio && (
        <Scheda className="mb-6">
          {risultato.totale === 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Nessuna azienda corrisponde a questi criteri.</p>

              {/*
                La diagnosi, non la scusa.

                Due filtri sensati possono avere un'intersezione vuota senza che nessuno dei
                due sia sbagliato, e da fuori quel caso è identico a un guasto. Qui il
                servizio ha già ricontato togliendone uno per volta — gratis, in `dryRun` —
                e dice quale riaprirebbe la ricerca e con quante imprese. Dal 17/09/2026
                anche la città, che non è più obbligatoria.
              */}
              {risultato.diagnosiZero !== undefined && risultato.diagnosiZero.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-testo-tenue">
                    Non è un errore: è l’incrocio dei filtri a essere vuoto. Togliendone uno solo, ecco cosa
                    si troverebbe.
                  </p>
                  <ul className="space-y-1">
                    {risultato.diagnosiZero.map((d) => (
                      <li key={d.filtro} className="text-sm">
                        senza <strong>{d.etichetta}</strong> →{' '}
                        <span className="tabular font-semibold">
                          {d.totaleSenza.toLocaleString('it-IT')}
                        </span>{' '}
                        {d.totaleSenza === 1 ? 'azienda' : 'aziende'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : haFiltriFacoltativi ? (
                <p className="text-sm text-testo-tenue">
                  Nessuno dei filtri, tolto da solo, riapre la ricerca: l’insieme è vuoto in partenza.
                  Conviene provare un comune vicino o allargare la dimensione.
                </p>
              ) : (
                <p className="text-sm text-testo-tenue">
                  In {comuneScelto === null ? 'questa città' : etichettaComune(comuneScelto)} l’archivio non
                  registra imprese attive. Conviene provare un comune vicino.
                </p>
              )}

              <p className="text-xs text-testo-debole">
                Sul codice ATECO il confronto è <strong>esatto</strong>, e l’archivio usa due cifre oppure
                quattro: «25» e «2562» sono insiemi diversi e disgiunti, mentre «256» non trova mai nulla.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/*
                Due numeri distinti, e vanno tenuti distinti: quante aziende **esistono**
                e quante se ne **comprano**. Mostrarne uno solo farebbe credere di
                acquistare l'intero insieme, o di pagare una ricerca invece di un elenco.
              */}
              <div>
                <p className="tabular text-2xl font-bold">{risultato.totale.toLocaleString('it-IT')}</p>
                <p className="text-sm text-testo-tenue">
                  {risultato.totale === 1
                    ? 'azienda corrisponde ai criteri'
                    : 'aziende corrispondono ai criteri'}
                </p>
                {/*
                  Il prezzo unitario si **divide**, non si ricorda.

                  Qui c'era «· 5 centesimi ad azienda», scritto a mano accanto a un totale
                  che arriva dalla risposta del fornitore: due numeri sulla stessa riga,
                  uno misurato e uno ricordato. Il giorno in cui il listino cambia il primo
                  si aggiorna e il secondo no, e chi legge non sa a quale credere.
                */}
                {/*
                  Quante di queste si hanno già (18/09/2026): con gli stessi filtri l'elenco parte
                  dalle successive, e quelle già comprate sono nel CRM.
                */}
                {(risultato.giaScaricate ?? 0) > 0 && (
                  <p className="mt-1 text-sm">
                    {risultato.lotto === 0
                      ? risultato.totale === 1
                        ? 'L’hai già scaricata, ed è nel CRM.'
                        : 'Le hai già scaricate tutte, e sono nel CRM.'
                      : risultato.giaScaricate === 1
                        ? 'Con questi filtri ne hai già scaricata una, ed è nel CRM: l’elenco parte dalla successiva.'
                        : `Con questi filtri ne hai già scaricate ${risultato.giaScaricate}, e sono nel CRM: l’elenco parte dalle successive.`}
                  </p>
                )}
                {risultato.lotto > 0 && (
                  <p className="mt-1 text-sm">
                    Scaricandone <strong>{risultato.lotto}</strong> si spendono{' '}
                    <strong>{(risultato.costoElencoCentesimi / 100).toFixed(2).replace('.', ',')} €</strong>
                    {(() => {
                      const unitario = centesimiPerRiga(risultato.costoElencoCentesimi, risultato.lotto);
                      if (unitario === null) return null;
                      return (
                        <span className="text-testo-debole">
                          {' · '}
                          {(unitario / 100).toFixed(2).replace('.', ',')} € ad azienda
                        </span>
                      );
                    })()}
                  </p>
                )}
              </div>
              <p className="text-sm text-testo-tenue">
                L&apos;elenco si chiede con <strong>Crea Elenco</strong>, qui sopra.
              </p>
            </div>
          )}
        </Scheda>
      )}

      {risultato !== null && !risultato.soloConteggio && (
        <>
          {/*
            La ricerca che ha prodotto un acquisto viene ricordata: il tasto «indietro»
            non deve più far sparire un elenco pagato.
          */}
          <RicordaElenco
            query={new URLSearchParams({
              ...criteri,
              scarica: '1',
              salta: String(risultato.saltate ?? 0),
            }).toString()}
            quante={risultato.aziende.length}
          />
          <FissaIndirizzoElenco salta={risultato.saltate ?? 0} />
          <p className="mb-3 text-sm text-testo-tenue">
            {risultato.aziende.length}{' '}
            {risultato.aziende.length === 1 ? 'azienda scaricata' : 'aziende scaricate'} ·{' '}
            {(risultato.costoElencoCentesimi / 100).toFixed(2).replace('.', ',')} € spesi.{' '}
            {/*
              Il CRM si nomina solo se il salvataggio è riuscito: l'API lo dichiara, e un «sono
              salvate» scritto a prescindere sarebbe una promessa su un dato che forse non c'è.
            */}
            {risultato.salvateNelCrm === false
              ? 'Il salvataggio nel CRM non è riuscito: l’elenco resta visibile qui, e comprandolo di nuovo entrerà nel CRM.'
              : risultato.aziende.length === 1
                ? 'È salvata nel CRM.'
                : 'Sono salvate nel CRM.'}{' '}
            Analizzarne una consuma credito a parte, come qualunque altra analisi.
          </p>
          {/*
            Da dove parte l'elenco e cosa è rimasto fuori (18/09/2026): con gli stessi filtri si
            comprano le successive, e le aziende già nel CRM non escono di nuovo.
          */}
          {((risultato.saltate ?? 0) > 0 || (risultato.giaNelCrm ?? 0) > 0) && (
            <p className="mb-3 text-sm text-testo-tenue">
              {(risultato.saltate ?? 0) > 0 &&
                (risultato.saltate === 1
                  ? 'Con questi filtri ne avevi già una: l’elenco parte dalla successiva. '
                  : `Con questi filtri ne avevi già ${risultato.saltate}: l’elenco parte dalle successive. `)}
              {(risultato.giaNelCrm ?? 0) > 0 &&
                (risultato.giaNelCrm === 1
                  ? 'Una era già nel CRM e non è mostrata.'
                  : `${risultato.giaNelCrm} erano già nel CRM e non sono mostrate.`)}
            </p>
          )}
          {risultato.aziende.length === 0 ? (
            <p className="text-sm font-medium">
              Nessuna azienda nuova: quelle di questi filtri sono già nel CRM.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-bordo">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Denominazione</th>
                    <th className="px-4 py-2.5 font-medium">Partita IVA</th>
                    <th className="px-4 py-2.5 font-medium">Sede</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {risultato.aziende.map((azienda) => (
                    <tr key={azienda.providerId} className="border-t border-bordo bg-superficie">
                      <td className="px-4 py-3 font-medium">{azienda.denominazione}</td>
                      <td className="tabular px-4 py-3 text-testo-tenue">{azienda.partitaIva ?? '—'}</td>
                      <td className="px-4 py-3 text-testo-tenue">
                        {azienda.comune ?? '—'}
                        {azienda.provincia !== null && ` (${azienda.provincia})`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CollegamentoAzione
                          href={`/azienda/${azienda.providerId}`}
                          inAttesa="Analisi in corso"
                          className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
                        >
                          Analizza
                        </CollegamentoAzione>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/*
        La ricerca di un'azienda che si conosce già, come sezione a parte.

        Aveva una pagina sua, «Ricerca», tolta il 13/09/2026 su richiesta di Simone: la si
        trova qui, sotto la ricerca per insiemi e separata da essa. Sono due moduli distinti
        con parametri distinti — `piva` qui, i filtri là — quindi usarne uno non compra niente
        per conto dell'altro. Dal 17/09/2026 si cerca solo per partita IVA.
      */}
      <section
        id="ricerca-azienda"
        aria-labelledby="titolo-ricerca-azienda"
        className="mt-12 border-t border-bordo pt-8"
      >
        <h2 id="titolo-ricerca-azienda" className="text-lg font-semibold tracking-tight">
          Cerca una singola azienda
        </h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Cerca per Partita IVA.
        </p>

        <Scheda className="mb-6">
          <ModuloRicerca partitaIva={partitaIvaCercata} aPagamento={stato?.datiReali === true} />

          {/*
            Gli esempi hanno senso solo quando sono utilizzabili: sui dati reali quelle tre
            partite IVA non esistono, e chi le provasse pagherebbe una ricerca per non
            trovare nulla.
          */}
          {stato !== null && !stato.datiReali && (
            <p className="mt-3 text-xs text-testo-debole">
              Esempi in modalità dimostrativa: <code className="font-mono">03158460174</code> (meccanica,
              Brescia) · <code className="font-mono">02657870644</code> (costruzioni, Avellino) ·{' '}
              <code className="font-mono">02413390390</code> (logistica, Ravenna)
            </p>
          )}
        </Scheda>

        {erroreAzienda !== null && (
          <Avviso tono="attenzione" titolo="Ricerca non eseguita">
            {erroreAzienda}
          </Avviso>
        )}

        {risultatiAzienda !== null && risultatiAzienda.risultati.length === 0 && (
          <p className="text-sm text-testo-tenue">Nessuna azienda trovata con questa partita IVA.</p>
        )}

        {/*
          Quando il risultato viene dall'archivio, dirlo cambia due cose.

          La prima è la fiducia: chi ha appena cercato si aspetta di aver speso, e vedere
          scritto «nessun costo» è l'unico modo di sapere che non è successo. La seconda è la
          decisione: un dato acquistato mesi fa può essere vecchio, e chi lo sa può scegliere
          di rinfrescarlo invece di scoprirlo dopo aver fatto una proposta.
        */}
        {risultatiAzienda !== null &&
          risultatiAzienda.daArchivio === true &&
          risultatiAzienda.risultati.length > 0 && (
            <p className="mb-3 rounded border-l-2 border-basso bg-basso/5 py-1.5 pl-3 text-sm leading-relaxed">
              <strong>Trovata nel suo archivio — nessun costo.</strong> Questi dati sono già stati
              acquistati
              {risultatiAzienda.aggiornatoIl == null
                ? ''
                : ` il ${formattaGiornoEsteso(risultatiAzienda.aggiornatoIl)}`}
              : la ricerca non ha consumato credito. Aprendo l&apos;azienda, l&apos;analisi userà gli stessi
              dati senza ricomprarli.
            </p>
          )}

        {/*
          Il risultato della ricerca è **una conferma di identità**, non l'analisi: cinque
          campi per stabilire che l'azienda è quella giusta prima di spendere per il resto.
          Il dato camerale che si sta leggendo è **già pagato**: l'analisi lo riusa e non lo
          ricompra.
        */}
        {risultatiAzienda !== null && risultatiAzienda.risultati.length > 0 && (
          <div className="mb-3 space-y-4">
            {risultatiAzienda.risultati.map((azienda) => (
              <SchedaRisultato key={azienda.providerId} azienda={azienda} />
            ))}
          </div>
        )}

        {/*
          Un'azienda ritrovata nell'archivio può non portare il settore.
          Dirlo solo quando manca davvero: una nota che compare sempre non viene più letta.
        */}
        {risultatiAzienda !== null && risultatiAzienda.risultati.some((a) => a.ateco === null) && (
          <p className="mt-3 text-xs text-testo-debole">
            Il settore delle aziende senza ATECO viene acquisito con l&apos;analisi.
          </p>
        )}
      </section>
      {/*
        La dichiarazione IVASS della slide 2 non sta qui: è il piè di pagina comune a tutte le
        pagine (layout.tsx), riscritto con le parole di Simone. Qui era stata aggiunta una seconda
        volta, e sotto c'era già la prima.
      */}
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
        className={`w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm focus:border-marchio ${
          numerico ? 'tabular' : ''
        } ${maiuscolo ? 'uppercase' : ''}`}
      />
      {nota !== undefined && <span className="mt-1 block text-xs text-testo-debole">{nota}</span>}
    </label>
  );
}
