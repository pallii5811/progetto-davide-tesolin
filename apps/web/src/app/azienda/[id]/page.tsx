import { richiediSessione } from '@/lib/sessione';
import { IndicatoriArchivio } from './IndicatoriArchivio';
import Link from 'next/link';
import {
  analizzaAzienda,
  statoServizio,
  collegamentiDiAzienda,
  leggiAdeguataVerifica,
  leggiImmaginiUbicazioni,
} from '@/lib/api';
import { ImmaginiUbicazione } from './ImmaginiUbicazione';
import { TitolareEffettivo } from './TitolareEffettivo';
import { AdeguataVerifica } from './AdeguataVerifica';
import { personeDaVerificare } from './persone-da-verificare';
import { componentiDelGiorno, formattaGiorno, formattaGiornoEsteso } from '@aegis/core/tempo';
import { traduciDescrizioneArchivioMaiuscola } from '@/lib/traduzioni-archivio';
import { acquistiNellIndirizzo } from '@/lib/acquisti-indirizzo';
import { RitornoAllElenco } from '../../prospect/UltimoElenco';
import { livelloTerritoriale } from './esposizione-territoriale';
import type { AnalisiDto, IndicatoriArchivioDto, CollegamentoSocietario } from '@/lib/api';
import {
  Avviso,
  BadgeConfidenza,
  BadgeRischio,
  BadgeStato,
  Scheda,
  Sezione,
  Spiegazione,
} from '@/components/ui';
import { etichettaAddetti } from '@/lib/etichetta-addetti';
import { CollegamentoAzione } from '@/components/CollegamentoAzione';
import { etichettaPiuEsposta } from '@/lib/ubicazione-piu-esposta';
import { etichetteDelGruppo } from '@/lib/etichette-ubicazioni';
import { RiquadriProtezioni, SezioniProtezioni } from './ProtezioniVeezco';

export const dynamic = 'force-dynamic';

export default async function PaginaAzienda({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approfondita?: string; negativita?: string }>;
}) {
  await richiediSessione();
  const { id } = await params;

  /*
    Ogni acquisto facoltativo è una scelta esplicita e passa dall'indirizzo, perché sia
    **visibile**: chi arriva qui da un collegamento sa, guardando la barra del browser,
    che cosa sta per spendere.

    La verifica protesti in particolare **non** è più compresa nell'analisi. Costava
    quarantacinque centesimi contro i dieci dell'anagrafica e veniva comprata d'ufficio:
    aprire un prospect per dargli un'occhiata costava cinquantacinque centesimi, e da
    nessuna parte c'era scritto.
  */
  const parametri = await searchParams;
  const approfondita = parametri.approfondita === '1';
  const conNegativita = parametri.negativita === '1';

  const listino = await statoServizio().catch(() => null);

  let analisi: AnalisiDto;
  try {
    analisi = await analizzaAzienda(id, { approfondita, eventiNegativi: conNegativita });
  } catch (errore) {
    return (
      <Avviso tono="critico" titolo="Analisi non disponibile">
        {errore instanceof Error ? errore.message : 'Errore imprevisto'}
        <p className="mt-3">
          <Link href="/" className="text-marchio underline">
            Torna alla ricerca
          </Link>
        </p>
      </Avviso>
    );
  }

  const { azienda, assetto, gruppo, ubicazioni } = analisi;

  /** Quante ubicazioni sono al primo posto: se sono piu' d'una, l'etichetta va al plurale. */
  const quantePiuEsposte = ubicazioni.elenco.filter((u) => u.piuEsposta).length;

  /*
    Cosa c'e' davvero a schermo, che non e' sempre cio' che l'indirizzo ha chiesto.

    Un approfondimento comprato resta in archivio trenta giorni, e in quel periodo il server
    lo usa anche senza il parametro: costa zero, ed e' roba di chi guarda. I pulsanti e le
    sezioni devono seguire QUESTO, altrimenti offrono di comprare cio' che e' gia' sotto gli
    occhi — ed e' esattamente cio' che faceva la scheda di COMINOTTI, che diceva «gia'
    acquistata» accanto a uno score «non determinabile».
  */
  const approfonditaMostrata = analisi.livelloMostrato.approfondita;
  const negativitaMostrata = analisi.livelloMostrato.eventiNegativi;

  /*
    Le fotografie si leggono a parte, dopo l'analisi.

    Sono l'unica cosa in archivio che pesa megabyte, e non entrano in nessun calcolo:
    tenerle dentro il risultato dell'analisi le farebbe viaggiare a ogni esecuzione e
    duplicare in ogni congelamento. Un guasto qui non deve far cadere la pagina — senza
    fotografie l'analisi resta intera.
  */
  /*
    L'adeguata verifica: l'elenco di quelle gia' svolte e il costo della prossima.

    Si legge sempre, anche quando non c'e' niente: la sezione deve poter dire «nessuna
    verifica finora», che e' un'informazione, invece di sparire. Una funzione che non
    compare quando manca il dato insegna che l'obbligo non esiste.
  */
  const adeguataVerifica = await leggiAdeguataVerifica(id).catch(() => ({
    verifiche: [],
    costoCentesimi: 0,
  }));

  const immagini = await leggiImmaginiUbicazioni(id)
    .then((r) => r.immagini)
    .catch(() => []);

  // I collegamenti dipendono dal resto del portafoglio, non da questa azienda: se la
  // rotta non risponde l'analisi resta leggibile, e questa sezione semplicemente manca.
  const collegamenti: CollegamentoSocietario[] = await collegamentiDiAzienda(id)
    .then((r) => r.collegamenti)
    .catch(() => []);

  return (
    <>
      <Intestazione
        analisi={analisi}
        identificativo={id}
        approfondita={approfonditaMostrata}
        conNegativita={negativitaMostrata}
        listino={listino}
      />

      {/*
        L'accertamento dei protesti si completa in una trentina di secondi. Aspettarlo
        dentro la richiesta significherebbe lasciare l'intermediario davanti a una pagina
        bianca per quarantasette secondi — e chi aspetta quarantasette secondi conclude che
        il software è rotto. Meglio consegnare l'analisi subito e dire cosa sta arrivando.
      */}
      {analisi.accertamentiInCorso && (
        <div className="mb-6">
          <Avviso tono="informativo" titolo="Accertamento protesti in corso">
            La verifica di protesti, pregiudizievoli e procedure concorsuali è stata avviata ed è già stata
            pagata: si completa in circa un minuto. <strong>Ricaricare questa pagina</strong> per includerla
            — il ricaricamento non consuma credito. Fino ad allora il fattore vale il 20% dello score e
            resta non valutabile.
          </Avviso>
        </div>
      )}

      <NavigazioneSezioni analisi={analisi} />

      {/* ── Le tre protezioni del foglio Veezco ────────────────────────────── */}
      <RiquadriProtezioni protezioni={analisi.protezioni} />

      {/*
        Gli indicatori dell'archivio camerale.

        Stanno **prima** delle ubicazioni e dopo il credito perché è lì che se ne ha
        bisogno: chi ha appena letto il punteggio vuole sapere se i conti dell'archivio
        raccontano la stessa storia, e le qualifiche — export, SOA, gare — dicono quali
        coperture cercare prima ancora di guardare dove sta l'azienda.

        La sezione non compare quando il profilo completo non è stato acquistato: venti
        trattini comunicherebbero «il software non funziona» invece di «questo servizio
        non è stato chiesto».
      */}
      {/*
        Su quali dati poggia questa analisi, e cosa manca.

        Il prodotto lo sapeva già — `livelloDatiEconomici` e `arricchimentiPossibili` sono
        nel DTO da sempre — e non lo diceva a nessuna pagina. Chi apre un'impresa vera
        legge «non determinabile» accanto a quattro capitali senza sapere perché né cosa
        farci: l'anagrafica estesa porta gli aggregati sintetici ma non lo schema CEE, e da
        quello dipendono margine di contribuzione, danni indiretti, indici di liquidità e
        Altman.

        Un vuoto dichiarato con accanto ciò che lo chiude è una vendita; un vuoto muto è un
        difetto del software — ed è il modo più rapido di far credere che il dato non
        esista invece che non sia stato chiesto.
      */}
      <LivelloDeiDati analisi={analisi} />

      {/* ── Record camerale ──────────────────────────────────────────────── */}
      <RecordCamerale registro={analisi.registro} fonte={analisi.azienda.fonte} />

      {haIndicatoriArchivio(analisi.indicatoriArchivio) && (
        <IndicatoriArchivio dati={analisi.indicatoriArchivio} approfondita={approfonditaMostrata} />
      )}

      {/* ── Ubicazioni e rischio territoriale ─────────────────────────────── */}
      <Sezione
        id="ubicazioni"
        titolo="Ubicazioni e rischio territoriale"
        sottotitolo={`${ubicazioni.elenco.length} ${
          ubicazioni.elenco.length === 1 ? 'ubicazione' : 'ubicazioni'
        } · ${ubicazioni.comuni.length} ${ubicazioni.comuni.length === 1 ? 'comune' : 'comuni'}${
          ubicazioni.distanzaMassimaKm === null
            ? ''
            : ` · fino a ${ubicazioni.distanzaMassimaKm} km di distanza`
        }`}
      >
        {ubicazioni.elenco.length === 0 ? (
          <Scheda>
            <p className="text-sm text-testo-tenue">Nessuna ubicazione risulta dai dati disponibili.</p>
          </Scheda>
        ) : (
          <>
            {/*
              `overflow-x-auto` e non `overflow-hidden`: misurata a 390 pixel, questa
              tabella arriva a 429 e con `hidden` le ultime colonne venivano **tagliate
              via senza alcun indizio** — che è il caso peggiore fra i due, perché chi
              guarda conclude che il dato non ci sia. Le due proprietà arrotondano gli
              angoli allo stesso modo; solo una lascia arrivare a ciò che è fuori.
            */}
            <div className="overflow-x-auto rounded-lg border border-bordo">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Ubicazione</th>
                    <th className="px-4 py-2.5 font-medium">Superficie</th>
                    <th className="px-4 py-2.5 font-medium">Sisma</th>
                    <th className="px-4 py-2.5 font-medium">Acqua</th>
                    <th className="px-4 py-2.5 font-medium">Frane</th>
                  </tr>
                </thead>
                <tbody>
                  {ubicazioni.elenco.map((u) => (
                    <tr key={u.id} className="border-t border-bordo bg-superficie align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {u.via}
                          {u.civico === null ? '' : ` ${u.civico}`}
                        </span>
                        <span className="block text-xs text-testo-tenue">
                          {u.cap} {u.comune} ({u.provincia})
                          {u.origini.includes('sede-legale') && ' · sede legale'}
                          {u.origini.includes('unita-locale') && ' · unità locale'}
                          {u.origini.includes('immobile-rilevato') && ' · rilevato in intervista'}
                          {/*
                            Senza coordinate l'ubicazione non entra nel calcolo della
                            contiguità: dirlo evita che l'assenza passi per una misura.
                          */}
                          {!u.haCoordinate && ' · senza coordinate'}
                        </span>
                        {etichettaPiuEsposta(u.piuEsposta, quantePiuEsposte, ubicazioni.elenco.length) !==
                          null && (
                          <span className="mt-1 inline-block rounded bg-attenzione/15 px-1.5 py-0.5 text-xs font-medium text-attenzione">
                            {/*
                              Al plurale quando il primo posto è pari, e non è pignoleria di lingua:
                              «la più esposta» su una di cinque ubicazioni identiche dice che le altre
                              quattro lo sono meno, e l’intermediario sceglie dove andare a fare il
                              sopralluogo su un’informazione falsa.
                            */}
                            {etichettaPiuEsposta(u.piuEsposta, quantePiuEsposte, ubicazioni.elenco.length)}
                          </span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-testo-tenue">
                        {u.superficieMq === null ? 'da rilevare' : `${u.superficieMq} m²`}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeEsposizione valore={u.sismica} />
                      </td>
                      <td className="px-4 py-3">
                        <BadgeEsposizione valore={u.idraulica} />
                        {u.indicatoriIdrogeo !== null && (
                          <span className="mt-0.5 block text-xs text-testo-debole">
                            {/*
                              Le due quote, non una. La classe somma le imprese in pericolosità
                              elevata e media (idrogeo.ts), e la riga stampava solo la prima: su
                              GALENO S.R.L. Cremona risultava «alta» con l'8,1 % e Palazzolo
                              «media» con il 9,2 %. Giusto, e illeggibile — Cremona ha il 37,7 % di
                              imprese in pericolosità media, Palazzolo il 9,6 %.
                            */}
                            imprese in pericolosità elevata{' '}
                            {percentualeIt(u.indicatoriIdrogeo.impreseIdraulicaElevata)}, media{' '}
                            {percentualeIt(u.indicatoriIdrogeo.impreseIdraulicaMedia)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeEsposizione valore={u.frane} />
                        {u.indicatoriIdrogeo !== null && (
                          <span className="mt-0.5 block text-xs text-testo-debole">
                            {percentualeIt(u.indicatoriIdrogeo.impreseFranaElevata)} delle imprese
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              Due aggregazioni distinte perché due eventi diversi colpiscono in modo
              diverso: l'incendio si propaga per contiguità, il sisma prende il territorio.
              È la differenza fra sommare i capitali e non sommarli.
            */}
            {ubicazioni.elenco.length > 1 && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Scheda>
                  <h3 className="mb-2 text-sm font-semibold">Un solo incendio, cosa raggiunge</h3>
                  <ul className="space-y-2 text-sm text-testo-tenue">
                    {ubicazioni.complessiIncendio.map((c) => (
                      <li key={c.ubicazioni.join('|')}>
                        {/* Un'ubicazione per riga, e il motivo sotto: vedi etichette-ubicazioni.ts. */}
                        {etichetteDelGruppo(c.ubicazioni, ubicazioni.elenco).map((etichetta) => (
                          <span key={etichetta} className="block font-medium text-testo">
                            {etichetta}
                          </span>
                        ))}
                        <span className="block">{c.motivo}</span>
                      </li>
                    ))}
                  </ul>
                </Scheda>
                <Scheda>
                  <h3 className="mb-2 text-sm font-semibold">Un solo sisma o alluvione, cosa raggiunge</h3>
                  <ul className="space-y-2 text-sm text-testo-tenue">
                    {ubicazioni.aggregatiTerritoriali.map((c) => (
                      <li key={c.ubicazioni.join('|')}>{c.motivo}</li>
                    ))}
                  </ul>
                </Scheda>
              </div>
            )}

            {ubicazioni.domande.length > 0 && (
              <Scheda className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Da chiedere al cliente</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-testo-tenue">
                  {ubicazioni.domande.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </Scheda>
            )}

            <ImmaginiUbicazione
              identificativo={id}
              ubicazioni={ubicazioni.elenco.map((u) => ({ id: u.id, etichetta: u.etichetta }))}
              immagini={immagini}
            />

            <ul className="mt-3 space-y-1 text-xs text-testo-debole">
              {ubicazioni.note.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </Sezione>

      {/* ── Assetto proprietario e gruppo ─────────────────────────────────── */}
      <Sezione
        id="assetto"
        titolo="Assetto proprietario e gruppo"
        sottotitolo={`${assetto.tipoControlloEtichetta}${
          assetto.numeroSoci === 0
            ? ''
            : ` · ${assetto.numeroSoci} ${assetto.numeroSoci === 1 ? 'socio' : 'soci'}`
        }`}
      >
        <div className="mb-4">
          <TitolareEffettivo dati={analisi.titolareEffettivo} />

          <AdeguataVerifica
            identificativo={id}
            persone={personeDaVerificare(analisi, componentiDelGiorno(new Date()).anno)}
            verifiche={adeguataVerifica.verifiche}
            costoCentesimi={adeguataVerifica.costoCentesimi}
            dimostrativa={listino !== null && !listino.datiReali}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Scheda>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Compagine sociale</h3>
              <BadgeConfidenza livello={assetto.confidenza} />
            </div>

            {assetto.soci.length === 0 ? (
              <p className="text-sm text-testo-tenue">
                Nessun socio risulta dai dati camerali disponibili.
              </p>
            ) : (
              <ul className="space-y-2">
                {assetto.soci.map((socio) => (
                  <li
                    key={`${socio.denominazione}-${socio.codiceFiscale ?? ''}`}
                    className="flex items-baseline justify-between gap-3 border-b border-bordo pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-sm">
                      {socio.denominazione}
                      <span className="ml-2 text-xs text-testo-debole">
                        {socio.tipo === 'persona-giuridica' ? 'società' : 'persona fisica'}
                      </span>
                      {/*
                        Il codice fiscale del socio veniva acquistato, conservato e usato
                        soltanto come chiave interna della lista: mai stampato. È il dato
                        che identifica la persona in un fascicolo antiriciclaggio, e senza
                        di esso «MARELLA ROBERTO» è un omonimo qualunque.
                      */}
                      {socio.codiceFiscale !== null && (
                        <span className="ml-2 font-mono text-xs text-testo-debole">
                          {socio.codiceFiscale}
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium">
                      {socio.quotaPercentuale === null
                        ? 'quota non indicata'
                        : `${numeroIt(socio.quotaPercentuale, socio.quotaPercentuale % 1 === 0 ? 0 : 2)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!assetto.compagineCompleta && assetto.soci.length > 0 && (
              <p className="mt-3 text-xs text-testo-debole">
                Le quote note non coprono l&apos;intero capitale: la compagine è parziale.
              </p>
            )}
          </Scheda>

          <div className="space-y-4">
            {/*
              La capogruppo con la sua partita IVA diventa un collegamento: risalire la
              catena societaria è il gesto che trasforma una scheda in un'indagine.
            */}
            {assetto.capogruppo !== null && (
              <Scheda>
                <h3 className="mb-2 text-sm font-semibold">Controllante</h3>
                <p className="text-sm">
                  {assetto.capogruppo.partitaIva === null ? (
                    <span className="font-medium">{assetto.capogruppo.denominazione}</span>
                  ) : (
                    <Link
                      href={`/azienda/${assetto.capogruppo.partitaIva}`}
                      className="font-medium text-marchio hover:underline"
                    >
                      {assetto.capogruppo.denominazione}
                    </Link>
                  )}
                  {assetto.capogruppo.quotaPercentuale !== null && (
                    <span className="text-testo-tenue"> · {assetto.capogruppo.quotaPercentuale}%</span>
                  )}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-testo-tenue">
                  {assetto.capogruppo.controlloDiDiritto
                    ? 'Controllo di diritto ex art. 2359 c.c.: si presume l’esercizio di direzione e coordinamento.'
                    : 'Unico socio risultante: quota non dichiarata, controllo da confermare.'}
                </p>
                {assetto.capogruppo.partitaIva !== null && (
                  <p className="mt-2 text-xs text-testo-debole">
                    Analizzabile: l&apos;analisi della controllante consuma credito come qualunque altra
                    azienda.
                  </p>
                )}
              </Scheda>
            )}

            {assetto.personeChiave.length > 0 && (
              <Scheda>
                <h3 className="mb-2 text-sm font-semibold">Persona chiave</h3>
                <ul className="space-y-1 text-sm">
                  {assetto.personeChiave.map((p) => (
                    <li key={p.denominazione}>
                      {p.denominazione}
                      {p.quotaPercentuale !== null && (
                        <span className="text-testo-tenue"> · {p.quotaPercentuale}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Scheda>
            )}

            {/*
              Le cariche, quando ci sono.

              Erano comprate con il profilo completo, mappate con otto campi, spedite
              dall'API — e nessun componente percorreva l'array: l'unica cosa che il
              prodotto ne faceva era mostrare il riquadro «non disponibili» qui sotto. Chi
              pagava i trenta centesimi vedeva lo stesso schermo di chi non li aveva pagati.

              Il codice fiscale accanto al nome per la stessa ragione dei soci: senza, il
              nome è un omonimo qualunque e il fascicolo antiriciclaggio non regge.
            */}
            {assetto.caricheDisponibili && (
              <Scheda>
                <h3 className="mb-3 text-sm font-semibold">
                  Cariche <span className="font-normal text-testo-debole">({assetto.cariche.length})</span>
                </h3>
                <ul className="space-y-2.5">
                  {[...assetto.cariche]
                    // Prima chi rappresenta la società: è chi la D&O deve coprire.
                    .sort((a, b) => Number(b.isRappresentanteLegale) - Number(a.isRappresentanteLegale))
                    .map((c) => (
                      <li
                        key={`${c.nominativo}-${c.codiceFiscale ?? c.ruolo}`}
                        className="border-b border-bordo pb-2.5 last:border-0 last:pb-0"
                      >
                        <p className="text-sm font-medium">
                          {c.nominativo}
                          {c.isRappresentanteLegale && (
                            <span className="ml-2 rounded bg-marchio/10 px-1.5 py-0.5 text-[11px] font-medium text-marchio">
                              rappresentanza legale
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-testo-tenue">
                          {/* IT-full risponde in inglese sulle cariche: qui si leggeva
                              «Chairman of board of directors». Elenco fisso, e ciò che non
                              vi compare resta com'è arrivato. */}
                          {traduciDescrizioneArchivioMaiuscola(c.ruolo)}
                          {c.dataNomina !== null && ` · in carica dal ${dataBreve(c.dataNomina)}`}
                          {/*
                            L'età si ricalcola dalla data di nascita al momento del disegno:
                            il campo del fornitore è congelato all'osservazione e il profilo
                            viene conservato, quindi una scheda riletta fra due anni
                            mostrerebbe un'età vecchia di due anni senza dirlo.
                          */}
                          {etaOggi(c.dataNascita) !== null && ` · ${etaOggi(c.dataNascita)} anni`}
                        </p>
                        {c.codiceFiscale !== null && (
                          <p className="mt-0.5 font-mono text-xs text-testo-debole">{c.codiceFiscale}</p>
                        )}
                      </li>
                    ))}
                </ul>
              </Scheda>
            )}

            {/*
              Il perimetro di gruppo.

              Il mappatore lo estraeva, un collaudo lo verificava, e poi il dato non
              entrava da nessuna parte perché il modello canonico non aveva un campo dove
              metterlo. Il documento di confronto con Creditsafe lo dava per fatto.

              Il vertice è **testo**, mai un collegamento: può essere una persona fisica, e
              un link verso di essa produrrebbe una ricerca a vuoto, per giunta a pagamento.
            */}
            {gruppo.disponibile && (
              <Scheda>
                <h3 className="mb-2 text-sm font-semibold">Gruppo societario</h3>
                {gruppo.appartieneAGruppo === true ? (
                  <div className="space-y-1.5 text-sm">
                    <p>
                      Appartiene a un gruppo
                      {gruppo.denominazione !== null && (
                        <>
                          {' '}
                          <span className="font-medium">{gruppo.denominazione}</span>
                        </>
                      )}
                      .
                    </p>
                    {gruppo.verticeDichiarato !== null && (
                      <p className="text-testo-tenue">
                        Vertice dichiarato: <span className="text-testo">{gruppo.verticeDichiarato}</span>
                      </p>
                    )}
                    {gruppo.controllateTotali !== null && gruppo.controllateTotali > 0 && (
                      <p className="text-testo-tenue">
                        {gruppo.controllateTotali}{' '}
                        {gruppo.controllateTotali === 1 ? 'società controllata' : 'società controllate'} nel
                        perimetro.
                      </p>
                    )}
                  </div>
                ) : gruppo.appartieneAGruppo === false ? (
                  <p className="text-sm text-testo-tenue">
                    Il registro non dichiara alcun gruppo societario.
                  </p>
                ) : (
                  <p className="text-sm text-testo-tenue">
                    Il registro non si pronuncia sull&apos;appartenenza a un gruppo: è un dato da chiedere,
                    non un&apos;assenza accertata.
                  </p>
                )}

                {gruppo.controllantiEstere === true && (
                  <p className="mt-2 border-l-2 border-marchio/40 pl-2 text-xs leading-relaxed text-testo-tenue">
                    Risultano controllanti estere: il programma va impostato come master policy con polizze
                    locali, e la D&amp;O va verificata sulle giurisdizioni coinvolte.
                  </p>
                )}

                {gruppo.controllateNote.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-testo-tenue">Controllate risultanti</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-testo-tenue">
                      {gruppo.controllateNote.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs text-testo-debole">
                      L&apos;anagrafica non ne porta la partita IVA: non sono analizzabili con un clic.
                    </p>
                  </div>
                )}
              </Scheda>
            )}

            {/*
              Le cariche non arrivano dall'anagrafica acquistata. Dichiararlo è più utile
              che lasciare un riquadro vuoto: dice all'intermediario cosa deve chiedere.
            */}
            {!assetto.caricheDisponibili && (
              <Scheda>
                <h3 className="mb-2 text-sm font-semibold">Cariche</h3>
                <p className="text-sm text-testo-tenue">
                  Gli amministratori non sono compresi nell&apos;anagrafica acquisita: vanno rilevati in
                  intervista, oppure acquistati con il profilo completo. Dalla carica dipende chi è
                  assicurato dalla D&amp;O.
                </p>
              </Scheda>
            )}
          </div>
        </div>

        {assetto.implicazioni.length > 0 && (
          <div className="mt-4 space-y-3">
            {assetto.implicazioni.map((implicazione) => (
              <Scheda key={implicazione.titolo}>
                <h3 className="text-sm font-semibold">{implicazione.titolo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-testo-tenue">{implicazione.conseguenza}</p>
                <p className="mt-2 border-l-2 border-marchio/40 pl-2 text-sm leading-relaxed">
                  {implicazione.azione}
                </p>
                {implicazione.riferimento !== null && (
                  <p className="mt-2 text-xs text-testo-debole">{implicazione.riferimento}</p>
                )}
              </Scheda>
            ))}
          </div>
        )}

        {/*
          Il pezzo che nessun archivio esterno può dare all'intermediario: quali altre
          aziende **sue** fanno capo alla stessa persona. Tre clienti con lo stesso socio
          di controllo non sono tre rischi indipendenti, e i massimali vanno letti insieme.
        */}
        {collegamenti.length > 0 && (
          <Scheda className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Collegamenti nel tuo portafoglio</h3>
            <ul className="space-y-3">
              {collegamenti.map((collegamento) => (
                <li key={collegamento.socioCodiceFiscale}>
                  <p className="text-sm font-medium">{collegamento.socioDenominazione}</p>
                  <p className="text-xs text-testo-debole">
                    partecipa anche in {collegamento.aziende.length}{' '}
                    {collegamento.aziende.length === 1 ? 'azienda' : 'aziende'} già in portafoglio
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {collegamento.aziende.map((altra) => (
                      <li key={altra.identificativo} className="text-sm">
                        <Link
                          href={`/azienda/${altra.identificativo}`}
                          className="text-marchio hover:underline"
                        >
                          {altra.denominazione}
                        </Link>
                        {altra.quotaPercentuale !== null && (
                          <span className="text-testo-tenue"> · {altra.quotaPercentuale}%</span>
                        )}
                        {altra.diControllo && (
                          <span className="ml-2 rounded bg-marchio/15 px-1.5 py-0.5 text-xs text-marchio">
                            controllo
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-testo-debole">
              Il collegamento è rilevato per codice fiscale fra le aziende già analizzate: non è una visura
              delle partecipazioni nazionali.
            </p>
          </Scheda>
        )}

        {assetto.domande.length > 0 && (
          <Scheda className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Da chiedere al cliente</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-testo-tenue">
              {assetto.domande.map((domanda) => (
                <li key={domanda}>{domanda}</li>
              ))}
            </ul>
          </Scheda>
        )}
      </Sezione>

      {/* ── Property, Business Interruption e Cyber Risk ──────────────────── */}
      <SezioniProtezioni protezioni={analisi.protezioni} />

      {/* ── Merito creditizio ─────────────────────────────────────────────── */}
      <Sezione
        id="credito"
        titolo="Merito creditizio"
        /*
          Il compilatore non protegge questa riga: un template literal accetta `null` e
          scrive «Score null/100» senza che niente si accorga. Le uniche due occorrenze
          rimaste di questo difetto — qui e nel fascicolo per il cliente — sono state
          trovate rileggendo a mano ogni uso dei campi diventati annullabili, non dal
          typecheck.
        */
        sottotitolo={
          analisi.credito.score === null
            ? 'Punteggio non determinabile sui dati disponibili'
            : `Score ${analisi.credito.score}/100 · classe ${analisi.credito.classe}${
                analisi.credito.altman === null
                  ? ''
                  : ` · Altman Z'' ${numeroIt(analisi.credito.altman.z, 2)} (${analisi.credito.altman.zona})`
              }`
        }
      >
        {analisi.credito.limitazione !== null && (
          <div className="mb-4">
            <Avviso tono="critico" titolo="Punteggio limitato dall’alto">
              {analisi.credito.limitazione}
            </Avviso>
          </div>
        )}

        <div className="mb-4 space-y-2">
          {analisi.credito.fattori.map((fattore) => (
            <Scheda key={fattore.chiave}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium">{fattore.etichetta}</p>
                <p className="tabular text-sm text-testo-tenue">
                  peso {(fattore.peso * 100).toFixed(0)}% ·{' '}
                  <span className="font-semibold text-testo">
                    {/*
                      «n.d.» accanto a «peso 20%» somiglia a un guasto. Questo fattore non è
                      mancante: è **non calcolabile** con i dati che l'impresa ha depositato,
                      e la riga sotto dice quale dato serve. Un punteggio che non c'è va
                      nominato per quello che è.
                    */}
                    {fattore.punteggio === null ? 'non valutabile' : `${Math.round(fattore.punteggio)}/100`}
                  </span>
                </p>
              </div>

              {/*
                Il colore della barra dice il punteggio, non il marchio.

                Era `bg-marchio` sempre: «Liquidità 57/100» e «Eventi negativi 97/100»
                uscivano dello stesso identico blu, e il colore non portava alcuna
                informazione — contro il principio scritto in cima al foglio di stile,
                dove si dice che il colore serve solo dove informa.

                Sette barre tutte uguali si leggono una per una; sette barre che virano
                dal verde all'arancione si leggono di sguardo, ed è quello che serve a chi
                apre venti schede al giorno. La lunghezza resta l'informazione principale:
                il colore la raddoppia, non la sostituisce, così chi non distingue i colori
                non perde nulla.
              */}
              {fattore.punteggio !== null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bordo">
                  <div
                    className={`h-full rounded-full ${coloreDelPunteggio(fattore.punteggio)}`}
                    style={{ width: `${Math.round(fattore.punteggio)}%` }}
                  />
                </div>
              )}

              <p className="mt-2 text-sm text-testo-tenue">{fattore.motivazione}</p>
              {fattore.dettagli.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-testo-debole">
                  {fattore.dettagli.map((dettaglio) => (
                    <li key={dettaglio}>· {dettaglio}</li>
                  ))}
                </ul>
              )}
            </Scheda>
          ))}
        </div>

        <Scheda>
          <p className="text-sm font-medium">Fido commerciale consigliato</p>
          {/* La spiegazione sotto dice già perché non c'è: qui basta non stampare una
              cifra. «0 €» in questo punto verrebbe letto come «non concedere credito». */}
          <p className="tabular mt-1 text-2xl font-semibold">
            {analisi.credito.fido.importo?.formattato ?? 'Non determinabile'}
          </p>
          <Spiegazione dati={analisi.credito.fido.spiegazione} aperta />
        </Scheda>
      </Sezione>

      {/* ── Eventi negativi ───────────────────────────────────────────────── */}
      <EventiNegativi eventi={analisi.eventiNegativi} />

      {/* ── Bilancio ──────────────────────────────────────────────────────── */}
      {analisi.bilancio !== null && (
        <Sezione
          id="bilancio"
          titolo={`Bilancio riclassificato ${analisi.bilancio.anno}`}
          sottotitolo={analisi.bilancio.fonte?.descrizione}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Scheda>
              <p className="mb-2 text-sm font-semibold">Conto economico a valore aggiunto</p>
              <RigheImporti dati={analisi.bilancio.contoEconomico} />
            </Scheda>
            <Scheda>
              <p className="mb-2 text-sm font-semibold">Stato patrimoniale finanziario</p>
              <RigheImporti dati={analisi.bilancio.statoPatrimoniale} />
            </Scheda>
          </div>

          {/* Stessa ragione della tabella delle ubicazioni: si scorre, non si taglia. */}
          <div className="mt-3 overflow-x-auto rounded-lg border border-bordo">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Indice</th>
                  <th className="px-4 py-2.5 font-medium">Formula</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valore</th>
                </tr>
              </thead>
              <tbody>
                {analisi.bilancio.indici.map((indice) => (
                  <tr key={indice.chiave} className="border-t border-bordo bg-superficie">
                    <td className="px-4 py-2 font-medium">{indice.etichetta}</td>
                    <td className="px-4 py-2 text-xs text-testo-debole">{indice.formula}</td>
                    <td className="tabular px-4 py-2 text-right font-medium">{indice.formattato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sezione>
      )}

      <p className="text-xs text-testo-debole">
        Analisi generata il {formattaGiornoEsteso(analisi.asOf)}
        {azienda.fonte !== null && ` · dati anagrafici da ${azienda.fonte.descrizione}`}
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Navigazione fra le sezioni: la pagina è lunga, e scorrere alla cieca è un difetto. */
/**
 * L'esposizione sismica o idraulica di un'ubicazione, con il colore che le compete.
 *
 * Il badge di rischio ha cinque livelli e nessuno di essi significa «non lo so»: passargli
 * un valore ignoto lo faceva cadere sul verde del rischio basso, e la riga diceva «non
 * determinata» dipinta come una buona notizia. Un'assenza dipinta di verde è peggio di
 * un'assenza taciuta, perché sembra un accertamento.
 *
 * Qui l'assenza ha una forma sua: la stessa cornice neutra con cui la scheda di un rischio
 * dice «non assicurabile», che non appartiene alla scala della gravità e non si confonde
 * con nessuno dei suoi gradini.
 */
function BadgeEsposizione({ valore }: { valore: string }) {
  const livello = livelloTerritoriale(valore);

  if (livello === null) {
    return (
      <span className="rounded border border-bordo-forte px-1.5 py-0.5 text-xs text-testo-debole">
        {valore}
      </span>
    );
  }

  return <BadgeRischio livello={livello} testo={valore} />;
}

/**
 * Protesti, pregiudizievoli e procedure concorsuali, elencati.
 *
 * È la schermata che in un servizio di informazione commerciale sta al centro, e qui non
 * c’era: gli eventi pesavano il venti per cento del punteggio e comparivano solo come una
 * riga fra le motivazioni. Un broker che deve dire a un cliente perché il fido è quello
 * che è, o perché non se ne concede affatto, ha bisogno di date, importi e tribunali —
 * non di un aggregato.
 */
function EventiNegativi({ eventi }: { eventi: AnalisiDto['eventiNegativi'] }) {
  if (eventi === null) return null;

  const nessuno =
    eventi.protesti.length === 0 && eventi.pregiudizievoli.length === 0 && eventi.procedure.length === 0;

  return (
    <Sezione
      id="eventi-negativi"
      titolo="Eventi negativi"
      sottotitolo={
        eventi.fonte === null
          ? undefined
          : `${eventi.fonte.descrizione} · accertamento del ${dataBreve(eventi.fonte.osservatoIl)}`
      }
    >
      {eventi.dichiaratiSenzaDettaglio.length > 0 && (
        <div className="mb-4">
          <Avviso tono="attenzione" titolo="Il registro dichiara eventi senza fornirne il dettaglio">
            Risultano <strong>{eventi.dichiaratiSenzaDettaglio.join(', ')}</strong> di cui l’archivio non ha
            restituito l’elenco. Non è un’assenza: è un’informazione mancante, e finché resta tale il
            fattore non può essere valutato per intero.
          </Avviso>
        </div>
      )}

      {nessuno && eventi.dichiaratiSenzaDettaglio.length === 0 && (
        <Scheda>
          <p className="text-sm">
            Nessun protesto, nessuna pregiudizievole e nessuna procedura concorsuale risultano a carico
            dell’impresa alla data dell’accertamento.
          </p>
        </Scheda>
      )}

      {eventi.procedure.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium">Procedure concorsuali</p>
          <div className="space-y-2">
            {eventi.procedure.map((p) => (
              <Scheda key={`${p.denominazione}-${p.dataApertura}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium">{p.denominazione}</p>
                  <BadgeStato
                    stato={p.aperta ? 'assente' : 'adeguata'}
                    testo={p.aperta ? 'in corso' : esitoProcedura(p)}
                  />
                </div>
                <p className="mt-1 text-xs text-testo-tenue">
                  Provvedimento del {dataBreve(p.dataApertura)}
                  {p.dataOmologa !== null && ` · omologata il ${dataBreve(p.dataOmologa)}`}
                  {p.tribunale === null ? ' · tribunale non indicato' : ` · Tribunale di ${p.tribunale}`}
                </p>
              </Scheda>
            ))}
          </div>
        </div>
      )}

      {eventi.protesti.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium">Protesti</p>
          <div className="space-y-2">
            {eventi.protesti.map((p, i) => (
              <Scheda key={`${p.data}-${i}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium">{p.tipo}</p>
                  <p className="tabular text-sm font-semibold">{p.importo.formattato}</p>
                </div>
                <p className="mt-1 text-xs text-testo-tenue">
                  {dataBreve(p.data)}
                  {p.luogo !== null && ` · ${p.luogo}`}
                  {/* Un protesto levato è stato pagato: pesa, ma molto meno. */}
                  {p.levato && ' · levato'}
                </p>
              </Scheda>
            ))}
          </div>
        </div>
      )}

      {eventi.pregiudizievoli.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Pregiudizievoli di conservatoria</p>
          <div className="space-y-2">
            {eventi.pregiudizievoli.map((p, i) => (
              <Scheda key={`${p.data}-${i}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium">{p.descrizione}</p>
                  {p.importo !== null && (
                    <p className="tabular text-sm font-semibold">{p.importo.formattato}</p>
                  )}
                </div>
                <p className="mt-1 text-xs text-testo-tenue">{dataBreve(p.data)}</p>
              </Scheda>
            ))}
          </div>
        </div>
      )}
    </Sezione>
  );
}

/** Chiusa e revocata non sono la stessa cosa, e la data serve a chi legge. */
function esitoProcedura(p: { dataRevoca: string | null; dataChiusura: string | null }): string {
  if (p.dataRevoca !== null) return `revocata il ${dataBreve(p.dataRevoca)}`;
  if (p.dataChiusura !== null) return `chiusa il ${dataBreve(p.dataChiusura)}`;
  return 'chiusa';
}

function dataBreve(iso: string | null | undefined): string | null {
  return iso === null || iso === undefined ? null : formattaGiorno(iso);
}

/**
 * Su quale livello di dati economici l'analisi ha lavorato, e cosa manca.
 *
 * Non compare quando i dati sono completi: una riga che dice «va tutto bene» occupa
 * spazio in una pagina già lunga e insegna a saltare gli avvisi. Compare quando c'è
 * qualcosa da sapere — ed è quasi sempre, perché lo schema CEE dettagliato è un servizio
 * a parte che nessuno compra per abitudine.
 */
function LivelloDeiDati({ analisi }: { analisi: AnalisiDto }) {
  if (analisi.livelloDatiEconomici === 'completo') return null;
  if (analisi.arricchimentiPossibili.length === 0 && analisi.livelloDatiEconomici === 'sintetico') {
    return null;
  }

  const assente = analisi.livelloDatiEconomici === 'assente';

  return (
    <div className="mb-8">
      <Scheda className="border-attenzione/40 bg-attenzione-fondo/40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold">
            {assente
              ? 'Analisi condotta senza dati di bilancio'
              : 'Analisi condotta sugli aggregati sintetici del registro'}
          </h2>
          <span className="text-xs text-testo-tenue">
            {assente
              ? 'nessun esercizio depositato è stato letto'
              : 'fatturato, patrimonio netto, totale attivo, costo del personale'}
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-testo-tenue">
          {assente
            ? 'Senza almeno un esercizio, i capitali che si calcolano dal bilancio restano non determinabili e il merito creditizio poggia sui soli fatti anagrafici. Non è una stima prudente: è l’assenza del dato, dichiarata.'
            : 'Gli aggregati sintetici bastano a dimensionare alcuni capitali, non tutti. Le voci che richiedono lo schema CEE dettagliato — art. 2424 e 2425 c.c. — restano non determinabili, e sotto è scritto quali.'}
        </p>

        {analisi.arricchimentiPossibili.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {analisi.arricchimentiPossibili.map((a) => (
              <div key={a.dato} className="border-l-2 border-attenzione/50 pl-3">
                <p className="text-sm font-medium">{a.dato}</p>
                <ul className="mt-0.5 space-y-0.5 text-xs leading-relaxed text-testo-tenue">
                  {a.sbloccherebbe.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/*
          La via che non costa nulla, detta per prima.

          Il bilancio depositato l'imprenditore ce l'ha già: le voci che mancano si
          leggono dal suo PDF in due minuti, e valgono più di qualunque acquisto. Dirlo
          qui evita che un vuoto venga letto come «serve comprare».
        */}
        <p className="mt-3 border-t border-bordo pt-2.5 text-xs leading-relaxed text-testo-debole">
          Il bilancio depositato è già in mano all’impresa: le voci mancanti si rilevano in intervista dal
          documento che il cliente porta, senza alcun acquisto.
        </p>
      </Scheda>
    </div>
  );
}

/**
 * Le voci del record camerale, in un posto solo.
 *
 * Serve a due chiamanti — il menu delle sezioni e la sezione stessa — perché prima
 * decidevano in modo diverso se quel blocco esistesse: il menu guardava
 * `registro != null`, la sezione contava i campi valorizzati. Su un registro con tutti i
 * campi vuoti il collegamento c'era e non portava da nessuna parte.
 *
 * Il blocco può mancare del tutto: le analisi congelate prima che esistesse non lo
 * contengono, e leggerlo senza verificarlo fa cadere la pagina — è già successo, su
 * un'azienda già pagata, con un messaggio che parlava di una porta di rete e non
 * c'entrava nulla.
 */
function vociDelRecordCamerale(
  registro: AnalisiDto['registro'] | null | undefined,
): readonly { etichetta: string; valore: string }[] {
  if (registro === undefined || registro === null) return [];

  const voci: { etichetta: string; valore: string }[] = [];
  const aggiungi = (etichetta: string, valore: string | null | undefined): void => {
    if (valore !== null && valore !== undefined && valore !== '') voci.push({ etichetta, valore });
  };

  aggiungi('Forma giuridica', registro.formaGiuridicaDescrizione);
  aggiungi('Numero REA', registro.numeroREA);
  aggiungi('Camera di commercio', registro.cciaa);
  aggiungi('Costituita il', dataBreve(registro.dataCostituzione));
  aggiungi('Attività iniziata il', dataBreve(registro.dataInizioAttivita));
  aggiungi('Cessata il', dataBreve(registro.dataCessazione));
  aggiungi('Capitale sociale deliberato', registro.capitaleSocialeDeliberato?.formattato);
  aggiungi('Capitale sociale versato', registro.capitaleSocialeVersato?.formattato);
  aggiungi('Fatturato dichiarato', registro.fatturatoDichiarato?.formattato);
  aggiungi('Addetti', registro.numeroAddetti === null ? null : String(registro.numeroAddetti));
  aggiungi(
    'ATECO secondari',
    registro.atecoSecondari.length > 0 ? registro.atecoSecondari.join(' · ') : null,
  );
  aggiungi('PEC', registro.pec);
  aggiungi('Sito web', registro.sitoWeb);
  aggiungi('Telefono', registro.telefono);
  aggiungi('Codice catastale del comune', registro.codiceCatastale);
  if (registro.sedeLegale !== null) {
    const s = registro.sedeLegale;
    aggiungi(
      'Sede legale',
      `${s.via}${s.civico === null ? '' : ' ' + s.civico}, ${s.cap ?? ''} ${s.comune} (${s.provincia})${
        s.frazione === null || s.frazione === '' ? '' : ' — ' + s.frazione
      }`.replace(/\s+/g, ' '),
    );
  }

  return voci;
}

const haRecordCamerale = (registro: AnalisiDto['registro'] | null | undefined): boolean =>
  vociDelRecordCamerale(registro).length > 0;

/**
 * Il colore di una barra di punteggio, sulla scala di gravità già in uso.
 *
 * Le stesse cinque tinte dei rischi, lette al contrario: qui cento è buono. Riusare la
 * scala esistente invece di inventarne una seconda è ciò che tiene coerente il
 * vocabolario visivo — in una scheda dove convivono punteggi di merito e livelli di
 * rischio, due scale di colore diverse per la stessa idea di «grave» si contraddicono.
 */
function coloreDelPunteggio(punteggio: number): string {
  if (punteggio >= 80) return 'bg-basso';
  if (punteggio >= 65) return 'bg-moderato';
  if (punteggio >= 50) return 'bg-rilevante';
  if (punteggio >= 30) return 'bg-alto';
  return 'bg-critico';
}

/**
 * L'età, calcolata oggi.
 *
 * Il fornitore manda anche un campo `age`, ma è fermo all'istante in cui il record è
 * stato osservato, e il profilo viene conservato: una scheda riletta fra due anni
 * mostrerebbe un'età vecchia di due anni senza dichiararlo. Qui si ricalcola dalla data
 * di nascita, che invece non invecchia.
 */
function etaOggi(dataNascita: string | null): number | null {
  if (dataNascita === null) return null;
  const grezza = new Date(dataNascita);
  if (Number.isNaN(grezza.getTime())) return null;
  const nato = componentiDelGiorno(grezza);
  const oggi = componentiDelGiorno(new Date());
  let anni = oggi.anno - nato.anno;
  const primaDelCompleanno =
    oggi.mese < nato.mese || (oggi.mese === nato.mese && oggi.giorno < nato.giorno);
  if (primaDelCompleanno) anni -= 1;
  return anni >= 0 && anni < 130 ? anni : null;
}

/**
 * Le sezioni dell'analisi, e solo quelle che ci sono davvero.
 *
 * L'elenco era fisso: dodici voci sempre. Su un'impresa senza bilancio depositato,
 * quattro di quelle voci puntavano a sezioni che la pagina non disegna — Ritenzione,
 * Prevenzione, Eventi negativi, Bilancio. Si cliccava e non succedeva niente.
 *
 * Un menu che non porta da nessuna parte è peggio di un menu più corto: chi clicca due
 * volte e non vede muoversi la pagina non conclude «questa sezione non c'è», conclude
 * «questo programma è rotto». E ha ragione a concluderlo.
 */
function NavigazioneSezioni({ analisi }: { analisi: AnalisiDto }) {
  /*
    L'ordine del menu è l'ordine della pagina.

    «Record camerale» stava in fondo all'elenco e viene disegnato per **primo**: chi
    cliccava l'ultima voce del menu veniva riportato in cima. È lo stesso difetto che il
    commento qui sopra dice di aver corretto — un collegamento che non porta dove
    promette — in una forma più subdola, perché la pagina si muove davvero.

    E la condizione era `analisi.registro != null`, mentre la sezione si disegna solo se
    almeno un campo è valorizzato: su un registro con tutti i campi vuoti il collegamento
    esisteva e non portava da nessuna parte. Ora entrambi chiedono la stessa cosa alla
    stessa funzione.
  */
  const sezioni = [
    { id: 'record-camerale', testo: 'Record camerale', presente: haRecordCamerale(analisi.registro) },
    { id: 'ubicazioni', testo: 'Ubicazioni', presente: analisi.ubicazioni.elenco.length > 0 },
    { id: 'assetto', testo: 'Assetto e gruppo', presente: true },
    // Sempre presenti: `SezioniProtezioni` disegna le tre sezioni anche senza il calcolo.
    { id: 'property-risk', testo: 'Property Risk', presente: true },
    { id: 'business-interruption', testo: 'Business Interruption', presente: true },
    { id: 'cyber-risk', testo: 'Cyber Risk', presente: true },
    { id: 'credito', testo: 'Merito creditizio', presente: true },
    { id: 'eventi-negativi', testo: 'Eventi negativi', presente: analisi.eventiNegativi !== null },
    { id: 'bilancio', testo: 'Bilancio', presente: analisi.bilancio !== null },
  ].filter((s) => s.presente);

  return (
    <nav
      aria-label="Sezioni dell’analisi"
      className="sticky top-0 z-10 -mx-6 mb-6 border-b border-bordo bg-fondo/95 px-6 py-2 backdrop-blur"
    >
      <ul className="flex flex-wrap gap-1 text-sm">
        {sezioni.map((sezione) => (
          <li key={sezione.id}>
            <a
              href={`#${sezione.id}`}
              className="rounded px-2.5 py-1 text-testo-tenue transition hover:bg-superficie hover:text-testo"
            >
              {sezione.testo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Il record camerale, per intero.
 *
 * Esiste perché dodici campi su venti non arrivavano mai a schermo: capitale sociale,
 * REA, PEC, ATECO secondari, date di costituzione e di inizio attività, codice catastale,
 * fatturato dichiarato. Venivano letti dal mappatore e usati nei calcoli — quindi nessun
 * collaudo li dava per mancanti — e non venivano mostrati. Pagati e invisibili, che è il
 * modo più sicuro di far credere a chi paga che il dato non esista.
 *
 * Qui si stampa **tutto quello che c'è**, e si tace su quello che non c'è: una riga
 * assente dice «il registro non lo riporta», e non costringe nessuno a chiedersi se sia
 * un guasto o una spesa mancata.
 */
function RecordCamerale({
  registro,
  fonte,
}: {
  registro: AnalisiDto['registro'];
  fonte: AnalisiDto['azienda']['fonte'];
}) {
  /*
    Il blocco può non esserci, e non è un caso di scuola.

    Le analisi vengono congelate su archivio: quelle salvate prima che questo blocco
    esistesse non lo contengono. Leggerlo senza verificarlo fa cadere l'intera pagina —
    ed è caduta davvero, su un'azienda già pagata, con un messaggio che parlava di una
    porta di rete e non c'entrava nulla.

    Vale per ogni campo aggiunto a un oggetto che viene conservato: il vecchio, in
    archivio, resta com'era.
  */
  if (!haRecordCamerale(registro)) return null;

  const voci = vociDelRecordCamerale(registro);

  return (
    <Sezione
      id="record-camerale"
      titolo="Record camerale"
      sottotitolo={
        fonte === null
          ? 'Tutto quello che il registro riporta su questa impresa.'
          : // È la data in cui la piattaforma ha letto il registro. Quella in cui il registro
            // ha aggiornato il record è un'altra, e sta in fondo agli indicatori: le due
            // dicevano entrambe «aggiornato al», con due giorni diversi.
            `${fonte.descrizione} · letto il ${dataBreve(fonte.osservatoIl)}`
      }
    >
      <Scheda>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {voci.map((v) => (
            <div key={v.etichetta}>
              <dt className="text-xs text-testo-debole">{v.etichetta}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium">{v.valore}</dd>
            </div>
          ))}
        </dl>
      </Scheda>
      <p className="mt-2 text-xs text-testo-debole">
        Le voci che il registro non riporta non compaiono: un&apos;assenza qui significa che il dato non
        esiste nell&apos;archivio, non che non sia stato acquistato.
      </p>
    </Sezione>
  );
}

/** Il prezzo come lo legge chi paga, o niente se il listino non è raggiungibile. */
function prezzo(centesimi: number | undefined): string {
  if (centesimi === undefined) return '';
  return `+${(centesimi / 100).toFixed(2).replace('.', ',')} €`;
}

function Intestazione({
  analisi,
  identificativo,
  approfondita,
  conNegativita,
  listino,
}: {
  analisi: AnalisiDto;
  identificativo: string;
  approfondita: boolean;
  conNegativita: boolean;
  listino: { costoEventiNegativiCentesimi: number; costoApprofondimentoCentesimi: number } | null;
}) {
  const { azienda } = analisi;
  return (
    <div className="mb-6">
      {/*
        Due vie di ritorno, e la prima è quella che serve più spesso.

        Chi vaglia cinque prospect uno dopo l'altro torna all'elenco cinque volte: finora
        poteva farlo solo col tasto «indietro» del browser, e chi passava dal menu si
        ritrovava davanti al modulo di ricerca vuoto — con la sensazione di aver perso
        l'elenco appena pagato.

        Il collegamento compare solo se un elenco esiste davvero: chi è arrivato qui
        cercando un'azienda per nome non ha nessun elenco a cui tornare.
      */}
      <div className="flex flex-wrap items-center gap-4">
        <RitornoAllElenco />
        <Link href="/" className="text-xs text-marchio hover:underline">
          ← Nuova ricerca
        </Link>
      </div>

      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{azienda.denominazione}</h1>

        <div className="flex flex-wrap gap-2">
          {/*
            Ogni pulsante che spende dichiara il proprio prezzo, e il prezzo arriva dal
            listino del fornitore — non da una cifra scritta qui dentro. Qui c'era
            «+0,48 €» su un servizio che ne costa trenta: un numero rimasto indietro, che
            nessuno poteva accorgersi fosse sbagliato perché non veniva da nessuna parte.
          */}
          {/*
            IL PREZZO SI DICHIARA SOLO DOVE C'È UN ADDEBITO.

            Il commento sopra resta vero: chi spende deve saperlo prima di premere. Ma la
            risposta di un servizio resta in archivio trenta giorni, e per tutto quel tempo
            il secondo clic NON costa niente — mentre il pulsante continuava a scrivere
            «+0,30 €».

            È successo: l'approfondimento era stato comprato il giorno prima ed era valido
            per altri ventinove giorni; chi guardava lo schermo ha smesso di cliccare per
            non ripagarlo. Il prodotto gli ha impedito di usare un dato suo, per un prezzo
            che non avrebbe addebitato. Un prezzo scritto dove non c'è addebito costa lavoro
            non fatto, esattamente come un addebito taciuto costa fiducia.
          */}
          {/*
            LA ROTELLA. Premuto «Analisi approfondita» su RED GROUP S.R.L., per alcuni secondi
            non cambiava niente — il server comprava e ricalcolava — e l'intermediario ha
            ricaricato la pagina credendo che il tasto non andasse. `CollegamentoAzione` mostra
            l'attesa sul pulsante premuto e non accetta un secondo clic finché la scheda nuova
            non è arrivata.

            `prefetch` spento sui due che spendono, per prudenza: oggi il prefetch di una pagina
            dinamica si ferma a `loading.tsx` e non esegue la scheda, ma qui l'indirizzo È
            l'acquisto, e non deve diventarlo il giorno che quel file cambia.
          */}
          {!conNegativita && (
            <CollegamentoAzione
              href={`/azienda/${identificativo}?negativita=1${approfondita ? '&approfondita=1' : ''}`}
              prefetch={false}
              inAttesa="Verifica di protesti e procedure in corso"
              className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio"
            >
              Verifica protesti e procedure{' '}
              {analisi.senzaSpesa.eventiNegativi ? (
                <span className="text-basso">già acquistata</span>
              ) : (
                <span className="text-testo-debole">{prezzo(listino?.costoEventiNegativiCentesimi)}</span>
              )}
            </CollegamentoAzione>
          )}
          {!approfondita && (
            <CollegamentoAzione
              href={`/azienda/${identificativo}?approfondita=1${conNegativita ? '&negativita=1' : ''}`}
              prefetch={false}
              inAttesa="Analisi approfondita in corso"
              className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio"
            >
              Analisi approfondita{' '}
              {analisi.senzaSpesa.approfondimento ? (
                <span className="text-basso">già acquistata</span>
              ) : (
                <span className="text-testo-debole">{prezzo(listino?.costoApprofondimentoCentesimi)}</span>
              )}
            </CollegamentoAzione>
          )}
          <CollegamentoAzione
            href={`/azienda/${identificativo}/dati`}
            className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio"
          >
            Dati di intervista{' '}
            <span className="tabular text-testo-debole">
              {Math.round(analisi.completezza.percentuale * 100)}%
            </span>
          </CollegamentoAzione>
          {/*
            Il report eredita ciò che è stato comprato.

            Il collegamento era nudo, e il report rilanciava l'analisi al livello di base:
            il documento che l'intermediario consegna diceva «le cariche sociali non sono
            comprese nei dati acquisiti» dopo che erano state pagate, perdeva le unità
            locali e stampava score e fido senza la riserva che questa scheda mostra in
            testata. Non si compra nulla di nuovo — l'analisi a quel livello è già in
            archivio — si chiede la stessa che si sta guardando.
          */}
          <CollegamentoAzione
            href={`/azienda/${identificativo}/report${acquistiNellIndirizzo(approfondita, conNegativita)}`}
            inAttesa="Preparazione del report in corso"
            className="rounded bg-azione px-3 py-1.5 text-sm font-medium text-azione-testo transition hover:opacity-90"
          >
            Report per il cliente
          </CollegamentoAzione>
        </div>
      </div>

      <p className="mt-1 text-sm text-testo-tenue">
        {azienda.formaGiuridica} · P.IVA {azienda.partitaIva ?? '—'} ·{' '}
        {azienda.sedeLegale === null
          ? 'sede non disponibile'
          : `${azienda.sedeLegale.comune} (${azienda.sedeLegale.provincia})`}{' '}
        · {azienda.ateco} {azienda.atecoDescrizione}
      </p>
      <p className="mt-0.5 text-sm text-testo-debole">
        {azienda.dimensioneEtichetta}
        {azienda.addetti !== null && ` · ${etichettaAddetti(azienda.addetti, azienda.addettiFonte)}`}
        {azienda.anniDiAttivita !== null && ` · attiva da ${azienda.anniDiAttivita} anni`}
      </p>
    </div>
  );
}

function RigheImporti({ dati }: { dati: Record<string, { formattato: string }> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
      {Object.entries(dati).map(([chiave, valore]) => (
        <div key={chiave} className="contents">
          <dt className="text-testo-tenue">{umanizza(chiave)}</dt>
          <dd className="tabular text-right font-medium">{valore.formattato}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Da «posizioneFinanziariaNetta» a «Posizione finanziaria netta». Gli acronimi restano
 * acronimi: «ebitda» usciva «Ebitda» sul conto economico del cliente.
 */
const ACRONIMI_DEL_BILANCIO: Readonly<Record<string, string>> = {
  ebitda: 'EBITDA',
  ebit: 'EBIT',
  pfn: 'PFN',
  mol: 'MOL',
  iva: 'IVA',
  tfr: 'TFR',
};

function umanizza(chiave: string): string {
  const parole = chiave
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .split(' ')
    .map((p) => ACRONIMI_DEL_BILANCIO[p] ?? p)
    .join(' ');
  return parole.charAt(0).toUpperCase() + parole.slice(1);
}

/**
 * Un numero scritto come lo scrive il resto della pagina: con la virgola.
 *
 * `toFixed` scrive il punto decimale inglese, e lo faceva in tre righe di questa pagina
 * che nessuno strumento aveva letto perché non passano dal DTO: «PD 12 mesi 3.00%»,
 * «Altman Z'' 2.09», la quota del socio quando non è intera. Le ha trovate il collaudo su
 * browser, il primo giorno che ha letto il testo reso — a fianco di «1,37» e «13,7 %».
 */
function numeroIt(valore: number, decimali: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(valore);
}

/**
 * Una percentuale con un decimale, come la scrive il resto della pagina.
 *
 * Il decimale resta anche sopra il dieci per cento: questo numero e' IL dato — ISPRA lo
 * pubblica cosi' — mentre la parola che gli sta accanto («alta», «media», «bassa») e' una
 * convenzione di questo prodotto. Chi non condivide la soglia si fa l'idea sul numero, e il
 * numero deve arrivargli intero.
 */
function percentualeIt(valore: number): string {
  return `${numeroIt(Math.round(valore * 10) / 10, valore % 1 === 0 ? 0 : 1)} %`;
}

/**
 * La sezione degli indicatori si disegna solo se c'è qualcosa da mostrare.
 *
 * Il profilo completo è facoltativo e costa: quando non è stato acquistato tutti i gruppi
 * sono nulli, e una sezione piena di trattini direbbe «il software non funziona» invece di
 * «questo servizio non è stato chiesto». Sono due messaggi opposti.
 */
function haIndicatoriArchivio(dati: IndicatoriArchivioDto): boolean {
  if (dati.gare.length > 0) return true;
  return Object.entries(dati).some(
    ([chiave, gruppo]) =>
      chiave !== 'gare' &&
      gruppo !== null &&
      typeof gruppo === 'object' &&
      Object.values(gruppo as object).some((v) => v !== null && v !== undefined),
  );
}
