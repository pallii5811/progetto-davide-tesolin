import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';
import { cercaProspect } from '@/lib/api';
import type { RisultatoProspezione } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { SelettoreLotto } from './SelettoreLotto';
import { BottoneElenco } from './BottoneElenco';
import { ConfrontoConElencoComprato, RicordaElenco, UltimoElenco } from './UltimoElenco';
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
    socioCodiceFiscale: parametri['socioCodiceFiscale'] ?? '',
    // Predefinito «solo S.r.l.»: è la forma su cui l'analisi è completa, e partire
    // dalle ditte individuali significa pagare righe che non si possono valutare.
    formaGiuridicaCodice: parametri['formaGiuridicaCodice'] ?? 'SR',
    // Quante aziende scaricare: il prezzo è **a record**, non a ricerca, e senza un lotto
    // dichiarato un elenco su una provincia intera costerebbe centinaia di euro.
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

  const haFiltri = Object.values(criteri).some((v) => v.trim() !== '');
  // `scarica` è l'unica azione che spende: senza, la pagina si limita a contare.
  const scarica = parametri['scarica'] === '1';

  /*
    Ha descritto un'impresa, o ha solo aperto la pagina?

    Non è la stessa domanda di `haFiltri`: forma giuridica e quante aziende arrivano già
    compilate a chi non ha scritto niente, quindi `haFiltri` è vero anche sul modulo
    vuoto. Da soli quei due campi non sono una ricerca — non si cerca «una S.r.l.».

    La distinzione serve perché a schermo ci sono due richiami diversi allo stesso
    elenco già comprato, e ciascuno risponde a una domanda che l'altro non pone:
    «dov'è finito l'elenco che ho pagato?» sul modulo vuoto, «sto per ricomprarlo?»
    quando i filtri ci sono. Senza distinguerli comparivano **entrambi**, uno sotto
    l'altro, con la stessa frase — e il secondo diceva «filtri quasi uguali»
    confrontandosi con un modulo in cui non c'era scritto niente.
  */
  const SOLO_PREDEFINITI: readonly string[] = ['formaGiuridicaCodice', 'limite'];
  const haDescrittoUnImpresa = Object.entries(criteri).some(
    ([campo, valore]) => !SOLO_PREDEFINITI.includes(campo) && valore.trim() !== '',
  );

  let risultato: RisultatoProspezione | null = null;
  let errore: string | null = null;

  if (haFiltri) {
    try {
      risultato = await cercaProspect(criteri, { soloConteggio: !scarica });
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  return (
    <>
      {/*
        Il richiamo sta sul modulo vuoto, dove è l'unica cosa che dice dov'è finito
        l'elenco pagato. Appena l'utente scrive un criterio il compito passa al confronto
        qui sotto, che dice la stessa cosa **e** in che cosa la ricerca di adesso
        differisce da quella già comprata: due richiami affiancati sarebbero la stessa
        frase due volte.

        Non basta guardare se a schermo c'è un elenco: la pagina nuda fa comunque un
        conteggio, quindi «nessun risultato» non la riconosce.
      */}
      {!haDescrittoUnImpresa && <UltimoElenco />}

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Ricerca di nuovi clienti</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Descrivi l&apos;impresa che cerchi — territorio, settore, dimensione — e scopri quante ne
          esistono. Contare non costa nulla: si paga solo l&apos;elenco, e solo quando lo chiedi.
        </p>
      </div>

      <Scheda className="mb-6">
        <form method="get" id="ricerca-prospect" className="space-y-4">
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
              Il filtro che un intermediario usa più di tutti, una volta che sa che c'è:
              dal codice fiscale di una persona escono **tutte le società in cui ha una
              quota**. Un cliente che ne possiede quattro è quattro rapporti, non uno, e
              nessuna ricerca per territorio o settore li mette mai in fila insieme.

              L'API lo accetta da sempre; mancava solo il campo per scriverlo.
            */}
            <Campo
              nome="socioCodiceFiscale"
              etichetta="Codice fiscale del socio"
              valore={criteri.socioCodiceFiscale}
              segnaposto="RSSGNN70A01A944X"
              maiuscolo
              nota="Tutte le società partecipate dalla stessa persona."
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
                Le ditte individuali non depositano bilanci: su di esse l&apos;analisi resta a metà.
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
            <button
              type="submit"
              className="rounded border border-bordo-forte px-5 py-2 text-sm font-medium transition hover:border-marchio"
            >
              Quante sono? <span className="text-testo-debole">gratis</span>
            </button>

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
            <BottoneElenco etichetta="Dammi l’elenco" />
          </div>
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
            <div className="space-y-3">
              <p className="text-sm font-medium">Nessuna azienda corrisponde a questi criteri.</p>

              {/*
                La diagnosi, non la scusa.

                Due filtri sensati possono avere un'intersezione vuota senza che nessuno dei
                due sia sbagliato, e da fuori quel caso è identico a un guasto. Qui il
                servizio ha già ricontato togliendone uno per volta — gratis, in `dryRun` —
                e dice quale riaprirebbe la ricerca e con quante imprese.
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
              ) : (
                <p className="text-sm text-testo-tenue">
                  Nessuno dei filtri, tolto da solo, riapre la ricerca: l’insieme è vuoto in partenza.
                  Conviene allargare il territorio o la dimensione.
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
                <p className="text-sm text-testo-tenue">aziende corrispondono ai criteri</p>
                {/*
                  Il prezzo unitario si **divide**, non si ricorda.

                  Qui c'era «· 5 centesimi ad azienda», scritto a mano accanto a un totale
                  che arriva dalla risposta del fornitore: due numeri sulla stessa riga,
                  uno misurato e uno ricordato. Il giorno in cui il listino cambia il primo
                  si aggiorna e il secondo no, e chi legge non sa a quale credere.
                */}
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
              </div>
              <p className="text-sm text-testo-tenue">
                L&apos;elenco si chiede con <strong>Dammi l&apos;elenco</strong>, qui sopra.
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
            query={new URLSearchParams({ ...criteri, scarica: '1' }).toString()}
            quante={risultato.aziende.length}
          />
          <p className="mb-3 text-sm text-testo-tenue">
            {risultato.aziende.length} aziende scaricate ·{' '}
            {(risultato.costoElencoCentesimi / 100).toFixed(2).replace('.', ',')} € spesi. Analizzarne una
            consuma credito a parte, come qualunque altra analisi.
          </p>
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
                      <Link
                        href={`/azienda/${azienda.providerId}`}
                        className="rounded bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
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
        className={`w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm focus:border-marchio ${
          numerico ? 'tabular' : ''
        } ${maiuscolo ? 'uppercase' : ''}`}
      />
      {nota !== undefined && <span className="mt-1 block text-xs text-testo-debole">{nota}</span>}
    </label>
  );
}
