import { richiediSessione } from '@/lib/sessione';
import { IndicatoriArchivio } from './IndicatoriArchivio';
import Link from 'next/link';
import {
  analizzaAzienda,
  statoServizio,
  collegamentiDiAzienda,
  compagnieCensite,
  leggiImmaginiUbicazioni,
} from '@/lib/api';
import { ImmaginiUbicazione } from './ImmaginiUbicazione';
import { TitolareEffettivo } from './TitolareEffettivo';
import { componentiDelGiorno, formattaGiorno, formattaGiornoEsteso } from '@aegis/core/tempo';
import { RitornoAllElenco } from '../../prospect/UltimoElenco';
import type {
  AnalisiDto,
  IndicatoriArchivioDto,
  CollegamentoSocietario,
  GapDto,
  LivelloRischio,
  RischioDto,
  SoliditaCompagnia,
} from '@/lib/api';
import {
  Avviso,
  BadgeConfidenza,
  BadgeRischio,
  BadgeStato,
  Metrica,
  Scheda,
  Sezione,
  Spiegazione,
} from '@/components/ui';

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

  const { azienda, sintesi, catNat, gap, assetto, gruppo, ubicazioni } = analisi;

  /*
    Le fotografie si leggono a parte, dopo l'analisi.

    Sono l'unica cosa in archivio che pesa megabyte, e non entrano in nessun calcolo:
    tenerle dentro il risultato dell'analisi le farebbe viaggiare a ogni esecuzione e
    duplicare in ogni congelamento. Un guasto qui non deve far cadere la pagina — senza
    fotografie l'analisi resta intera.
  */
  const immagini = await leggiImmaginiUbicazioni(id)
    .then((r) => r.immagini)
    .catch(() => []);

  // I collegamenti dipendono dal resto del portafoglio, non da questa azienda: se la
  // rotta non risponde l'analisi resta leggibile, e questa sezione semplicemente manca.
  const collegamenti: CollegamentoSocietario[] = await collegamentiDiAzienda(id)
    .then((r) => r.collegamenti)
    .catch(() => []);

  /*
    La solidità della compagnia va mostrata **accanto alla polizza**, non in un'anagrafe a
    parte: è lì che si decide se quella copertura va bene, ed è lì che serve sapere se chi
    l'ha sottoscritta è in grado di pagare. Un dato corretto ma lontano dal punto di
    decisione vale quanto un dato assente.
  */
  const compagnie: SoliditaCompagnia[] = await compagnieCensite()
    .then((r) => r.compagnie)
    .catch(() => []);

  // Zero euro di esposizione con delle coperture non quantificabili non è una buona
  // notizia: è l'assenza del dato. Vale ovunque quel numero venga mostrato.
  const esposizioneIgnota =
    sintesi.esposizioneNonAssicurata.euro === 0 && sintesi.coperturaDaQuantificare > 0;

  return (
    <>
      <Intestazione
        analisi={analisi}
        identificativo={id}
        approfondita={approfondita}
        conNegativita={conNegativita}
        listino={listino}
      />

      {/* ── Completezza: l'invito ad agire, non un semplice avviso ────────── */}
      {analisi.completezza.percentuale < 0.65 && (
        <div className="mb-6">
          <Avviso
            tono={analisi.completezza.percentuale < 0.3 ? 'attenzione' : 'informativo'}
            titolo={`Analisi al ${Math.round(analisi.completezza.percentuale * 100)}% del suo potenziale`}
          >
            <p>
              Mancano dati che il bilancio non può fornire. Il primo per impatto:{' '}
              <strong>{analisi.completezza.mancanti[0]?.etichetta}</strong> —{' '}
              {analisi.completezza.mancanti[0]?.beneficio}
            </p>
            <p className="mt-2">
              <Link
                href={`/azienda/${id}/dati`}
                className="font-medium text-marchio underline underline-offset-2"
              >
                Compila i dati di intervista →
              </Link>
            </p>
          </Avviso>
        </div>
      )}

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

      {/* ── Indicatori di sintesi ─────────────────────────────────────────── */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          Senza la verifica di protesti e procedure, punteggio e fido sono provvisori — e
          va detto **qui**, non fra i fattori.

          Osservato su Acciaierie d'Italia, in amministrazione straordinaria con uno stato
          di insolvenza aperto: la testata diceva «Fido consigliato 570.000 €». La riga che
          spiegava «protesti e pregiudizievoli non acquisiti» stava trenta schermate più
          giù, dentro l'elenco dei fattori. Un intermediario legge i quattro numeri in
          cima; là sotto non ci arriva.

          Una procedura concorsuale aperta azzera il fido. Consigliarne mezzo milione senza
          aver guardato è il danno più grande che questo software possa fare, e costa
          quarantacinque centesimi evitarlo.
        */}
        <Metrica
          etichetta="Score di credito"
          valore={`${sintesi.scoreCredito}/100`}
          nota={
            analisi.eventiNegativi === null
              ? `Classe ${sintesi.classeCredito} · provvisorio: protesti e procedure non verificati`
              : `Classe ${sintesi.classeCredito} · PD 12 mesi ${(sintesi.probabilitaDefault * 100).toFixed(2)}%`
          }
          tono={
            analisi.eventiNegativi === null
              ? 'attenzione'
              : sintesi.scoreCredito >= 65
                ? 'positivo'
                : sintesi.scoreCredito >= 50
                  ? 'attenzione'
                  : 'critico'
          }
        />
        <Metrica
          etichetta="Fido consigliato"
          valore={sintesi.fidoConsigliato.formattato}
          nota={
            analisi.eventiNegativi === null
              ? 'Provvisorio: una procedura concorsuale aperta lo azzera, e non è stata verificata'
              : `Vincolo più stringente: ${analisi.credito.fido.vincoloAttivo}`
          }
          tono={analisi.eventiNegativi === null ? 'attenzione' : 'neutro'}
        />
        {/*
          La didascalia elenca **ciò che è dentro il numero**, non ciò che il numero
          dovrebbe contenere.

          Diceva sempre «fabbricati, macchinari e scorte» anche quando macchinari e scorte
          non erano quantificati — cioè su ogni impresa senza dati d'intervista. Un
          intermediario leggeva sette milioni e ottocento credendo che comprendessero tutto,
          mentre erano i soli fabbricati: sottostima dichiarata come completezza, che è il
          modo esatto in cui nasce una sottoassicurazione.
        */}
        <Metrica
          etichetta="Patrimonio esposto"
          valore={sintesi.patrimonioEsposto?.formattato ?? 'da rilevare'}
          nota={
            sintesi.patrimonioEsposto === null
              ? 'Il valore dei beni non è ricavabile dai dati economici disponibili'
              : componiNotaPatrimonio(analisi.sommeAssicurande)
          }
        />
        {/*
          «0 €» va detto solo quando è davvero zero. Se nessun capitale è stato
          quantificabile — accade su chi deposita il bilancio in forma abbreviata — quello
          zero significa «non lo sappiamo», e mostrarlo in verde inviterebbe a chiudere
          l'analisi proprio dove andrebbe aperta l'intervista.
        */}
        <Metrica
          etichetta="Esposizione non assicurata"
          valore={esposizioneIgnota ? 'da quantificare' : sintesi.esposizioneNonAssicurata.formattato}
          nota={
            esposizioneIgnota
              ? `${sintesi.coperturaDaQuantificare} coperture senza capitale ricavabile dai dati disponibili`
              : sintesi.incidenzaEsposizioneSuPatrimonio === null
                ? 'Scenario di sinistro massimo'
                : `Pari al ${(sintesi.incidenzaEsposizioneSuPatrimonio * 100).toFixed(0)}% del patrimonio netto`
          }
          tono={
            esposizioneIgnota
              ? 'attenzione'
              : sintesi.esposizioneNonAssicurata.euro > 0
                ? 'critico'
                : 'positivo'
          }
        />
      </div>

      {/* ── Allerta CAT NAT ───────────────────────────────────────────────── */}
      {catNat.stato === 'inadempiente' && (
        <div className="mb-8">
          {/*
            «Non adempiuto» è un accertamento, e senza il portafoglio in essere non lo si
            può fare: si sa soltanto che fra le polizze note non ce n'è una catastrofale, e
            se di polizze note non ce n'è nessuna quella frase non afferma niente. Su un
            obbligo di legge, dire a un'impresa che è inadempiente quando nessuno ha
            guardato le sue polizze è l'errore più caro che questo documento possa
            contenere.
          */}
          <Avviso
            tono="critico"
            titolo={
              gap.polizzeDichiarate === 0
                ? '⚖ Obbligo assicurativo catastrofale: copertura non censita'
                : '⚖ Obbligo assicurativo catastrofale non adempiuto'
            }
          >
            <p>
              Il termine di legge è scaduto
              {catNat.giorniAlTermine !== null && ` da ${Math.abs(catNat.giorniAlTermine)} giorni`}
              {gap.polizzeDichiarate === 0
                ? ' e non è stata censita alcuna polizza in essere, quindi non è possibile accertare se l’obbligo sia stato adempiuto.'
                : ' e non risulta alcuna copertura CAT NAT in portafoglio.'}{' '}
              {catNat.baseAssicurabile === null ? (
                <>Il capitale da assicurare è ancora da quantificare.</>
              ) : (
                <>
                  Capitale da assicurare stimato: <strong>{catNat.baseAssicurabile.formattato}</strong>.
                </>
              )}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {catNat.conseguenzeInadempimento.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Spiegazione dati={catNat.spiegazione} />
          </Avviso>
        </div>
      )}

      {catNat.stato === 'in-scadenza' && catNat.giorniAlTermine !== null && (
        <div className="mb-8">
          <Avviso tono="attenzione" titolo="Obbligo CAT NAT in scadenza">
            Termine fra {catNat.giorniAlTermine} giorni. Capitale stimato:{' '}
            <strong>{catNat.baseAssicurabile?.formattato ?? 'da quantificare'}</strong>.
          </Avviso>
        </div>
      )}

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
        <IndicatoriArchivio dati={analisi.indicatoriArchivio} />
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
            <div className="overflow-hidden rounded-lg border border-bordo">
              <table className="w-full text-sm">
                <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Ubicazione</th>
                    <th className="px-4 py-2.5 font-medium">Superficie</th>
                    <th className="px-4 py-2.5 font-medium">Sisma</th>
                    <th className="px-4 py-2.5 font-medium">Acqua</th>
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
                        {u.piuEsposta && ubicazioni.elenco.length > 1 && (
                          <span className="mt-1 inline-block rounded bg-attenzione/15 px-1.5 py-0.5 text-xs font-medium text-attenzione">
                            la più esposta
                          </span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-testo-tenue">
                        {u.superficieMq === null ? 'da rilevare' : `${u.superficieMq} m²`}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeRischio livello={livelloTerritoriale(u.sismica)} testo={u.sismica} />
                      </td>
                      <td className="px-4 py-3">
                        <BadgeRischio livello={livelloTerritoriale(u.idraulica)} testo={u.idraulica} />
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
                      <li key={c.ubicazioni.join('|')}>{c.motivo}</li>
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
                        : `${socio.quotaPercentuale.toFixed(socio.quotaPercentuale % 1 === 0 ? 0 : 2)}%`}
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
                          {c.ruolo}
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

      {/* ── Piano d'azione ────────────────────────────────────────────────── */}
      <Sezione
        id="piano"
        titolo="Piano d’azione sulle coperture"
        sottotitolo={
          gap.polizzeDichiarate === 0
            ? 'Nessuna polizza in essere dichiarata: qui sotto ci sono le coperture che servono, non quelle che mancano.'
            : `${gap.coperturaAssente} assenti · ${gap.coperturaInadeguata} inadeguate · ${gap.coperturaAdeguata} adeguate${
                gap.premioInEssere === null ? '' : ` · premio in essere ${gap.premioInEssere.formattato}`
              }`
        }
      >
        {/*
          Zero polizze inserite cambia il significato di tutto l'elenco.

          Le voci restano quelle giuste — sono le garanzie che quell'impresa dovrebbe avere
          — ma senza il portafoglio in essere la piattaforma non sta accertando un'assenza:
          sta elencando un fabbisogno. Scrivere «copertura assente» accanto a nove voci
          davanti a un cliente già assicurato è una frase falsa, e chi la legge non ha modo
          di sapere che nessuno ha ancora detto al programma cosa quel cliente possiede.
        */}
        {gap.polizzeDichiarate === 0 && (
          <div className="mb-4">
            <Avviso tono="attenzione" titolo="Il confronto con le polizze non è stato fatto">
              Non è stata inserita nessuna polizza in essere, quindi le voci qui sotto elencano le coperture{' '}
              <strong>necessarie</strong> a questa impresa — non quelle che le mancano. Per avere il
              confronto vero, e sapere dove è sottoassicurata, inserire il portafoglio in essere nei{' '}
              <Link href={`/azienda/${id}/dati`} className="text-marchio underline">
                dati di intervista
              </Link>
              .
            </Avviso>
          </div>
        )}

        <div className="space-y-3">
          {gap.voci.map((voce) => (
            <VoceGap
              key={voce.copertura}
              voce={voce}
              compagnia={compagniaDi(voce, compagnie)}
              polizzeCensite={gap.polizzeDichiarate > 0}
            />
          ))}
        </div>
      </Sezione>

      {/* ── Registro dei rischi ───────────────────────────────────────────── */}
      <Sezione
        id="rischi"
        titolo="Registro dei rischi"
        sottotitolo={`ISO 31000:2018 · ${analisi.rischiMeta.totale} rischi identificati · ${analisi.rischiMeta.daTrasferire} da trasferire · catalogo v${analisi.rischiMeta.versioneCatalogo}`}
      >
        {/*
          Quando nessuna misura è confermata, residuo e inerente coincidono — e va detto.

          Il modello riduce il rischio solo per i controlli **verificati**: un impianto
          antincendio dichiarato e mai confermato non abbassa niente, ed è la scelta giusta
          — accreditare a un'impresa una protezione che nessuno ha visto significa
          proporle una franchigia che non regge.

          Ma le due colonne restano identiche su tutti i rischi, e chi le guarda non capisce
          se il modello non funzioni o se non ci sia nulla da scontare. La differenza fra
          inerente e residuo è ciò che rende difendibile la proposta: se è zero, il motivo
          va scritto accanto, non lasciato dedurre.
        */}
        {analisi.rischi.length > 0 &&
          analisi.rischi.every((r) => r.punteggioResiduo === r.punteggioInerente) && (
            <div className="mb-4">
              <Avviso tono="informativo" titolo="Rischio residuo pari all’inerente">
                Nessuna misura di prevenzione è stata <strong>confermata</strong> in intervista, quindi
                nessuna riduzione è stata applicata: il rischio residuo coincide con quello inerente. Le
                protezioni che l’impresa già possiede — impianto antincendio, allarme, modello 231 —
                abbassano il punteggio solo quando sono verificate, perché accreditarle senza averle viste
                significherebbe proporre una franchigia che non regge.{' '}
                <Link href={`/azienda/${id}/dati`} className="text-marchio underline">
                  Confermarle nei dati di intervista
                </Link>
                .
              </Avviso>
            </div>
          )}

        <MatriceRischi rischi={analisi.rischi} />
        <div className="mt-5 space-y-2">
          {analisi.rischi.map((rischio) => (
            <VoceRischio key={rischio.id} rischio={rischio} />
          ))}
        </div>
      </Sezione>

      {/* ── Somme assicurande ─────────────────────────────────────────────── */}
      <Sezione
        id="somme"
        titolo="Somme assicurande"
        sottotitolo="Calcolate dal bilancio depositato e dai dati rilevati in intervista"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(analisi.sommeAssicurande)
            .filter(([chiave]) => chiave !== 'patrimonioEsposto')
            .map(([chiave, voce]) => (
              <Scheda key={chiave}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{voce.spiegazione.titolo}</p>
                  <BadgeConfidenza livello={voce.confidenza} />
                </div>
                <p className="tabular mt-1 text-xl font-semibold">
                  {voce.valore === null ? 'da definire' : voce.valore.formattato}
                </p>
                <Spiegazione dati={voce.spiegazione} />
              </Scheda>
            ))}
        </div>
      </Sezione>

      {/* ── Danno massimo e forma della copertura ─────────────────────────── */}
      {analisi.dannoMassimo.disponibile && (
        <Sezione
          id="danno-massimo"
          titolo="Danno massimo e forma della copertura"
          sottotitolo="Con quale capitale, e con quale formula, conviene assicurare i beni"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Scheda>
              <dl>
                <dt className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                  Danno massimo possibile
                </dt>
                <dd className="tabular mt-1 text-xl font-semibold">
                  {analisi.dannoMassimo.possibile.formattato}
                </dd>
                <dd className="mt-1 text-xs leading-snug text-testo-tenue">
                  Perdita totale: nessuna protezione regge. È il valore dei beni.
                </dd>
              </dl>
            </Scheda>

            <Scheda>
              <div className="flex items-baseline justify-between gap-3">
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                    Danno massimo probabile
                  </dt>
                  <dd className="tabular mt-1 text-xl font-semibold text-marchio">
                    {analisi.dannoMassimo.probabile.formattato}
                  </dd>
                  <dd className="mt-1 text-xs leading-snug text-testo-tenue">
                    {Math.round(analisi.dannoMassimo.quota * 100)}% del valore, tenuto conto delle
                    protezioni accertate
                  </dd>
                </dl>
                <BadgeConfidenza livello={analisi.dannoMassimo.confidenza} />
              </div>
            </Scheda>
          </div>

          {/*
            La motivazione della forma è il pezzo che vale di più: spiega perché il primo
            rischio assoluto, per una PMI che stima i beni a occhio, spesso protegge meglio
            di una polizza a valore intero — non perché copra di più, ma perché toglie di
            mezzo la regola proporzionale.
          */}
          <div className="mt-3">
            <Avviso
              tono={analisi.dannoMassimo.forma === 'primo-rischio-assoluto' ? 'informativo' : 'attenzione'}
              titolo={
                analisi.dannoMassimo.forma === 'primo-rischio-assoluto'
                  ? 'Forma consigliata: primo rischio assoluto'
                  : 'Forma consigliata: valore intero'
              }
            >
              <p className="leading-relaxed">{analisi.dannoMassimo.motivazioneForma}</p>
            </Avviso>
          </div>

          {analisi.dannoMassimo.domandeCheAbbassanoLaStima.length > 0 && (
            <Scheda className="mt-3">
              <p className="text-sm font-medium">Cosa chiedere per stimare meglio</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-testo-tenue">
                {analisi.dannoMassimo.domandeCheAbbassanoLaStima.map((domanda) => (
                  <li key={domanda} className="border-l-2 border-marchio/40 pl-2">
                    {domanda}
                  </li>
                ))}
              </ul>
            </Scheda>
          )}

          <Spiegazione dati={analisi.dannoMassimo.spiegazione} />
        </Sezione>
      )}

      {/* ── Quanto l'impresa può e vuole tenersi ──────────────────────────── */}
      {analisi.ritenzione.disponibile && (
        <Sezione
          id="ritenzione"
          titolo="Capacità e propensione al rischio"
          sottotitolo="Quanto l’impresa può assorbire da sé, e quanto è disposta a tenersi"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Metrica
              etichetta="Franchigia sostenibile"
              valore={analisi.ritenzione.franchigiaConsigliata?.formattato ?? '—'}
              nota="Per singolo sinistro"
            />
            <Metrica
              etichetta="Ritenzione annua"
              valore={analisi.ritenzione.annua?.formattato ?? '—'}
              nota="Somma sopportabile in un esercizio"
            />
            <Metrica
              etichetta="Vincolo più stringente"
              valore={analisi.ritenzione.vincoloAttivo ?? '—'}
              nota={
                analisi.ritenzione.vincoloAttivo === 'liquidità'
                  ? 'Un sinistro chiede i soldi subito'
                  : 'Fra patrimonio, redditività e liquidità'
              }
            />
          </div>

          {/*
            Senza la domanda al titolare il numero è un'ipotesi, e va detto: una franchigia
            proposta su una propensione presunta non è documentazione di adeguatezza.
          */}
          {!analisi.ritenzione.propensioneDichiarata && (
            <div className="mt-3">
              <Avviso tono="attenzione" titolo="Propensione al rischio non ancora rilevata">
                Si è adottata l’ipotesi prudente. È una domanda di trenta secondi in intervista, e dimezza o
                raddoppia la franchigia proponibile — senza, il trattamento lo decide il motore invece
                dell’imprenditore.
              </Avviso>
            </div>
          )}

          <Scheda className="mt-3">
            <p className="text-sm leading-relaxed">{analisi.ritenzione.effettoAtteso}</p>
            <Spiegazione dati={analisi.ritenzione.spiegazione} />
          </Scheda>
        </Sezione>
      )}

      {/* ── Prevenzione: ridurre invece di trasferire ─────────────────────── */}
      {analisi.prevenzione.length > 0 && (
        <Sezione
          id="prevenzione"
          titolo="Misure che abbasserebbero il rischio"
          sottotitolo="L’unico trattamento che riduce il rischio invece di spostarlo: trasferire costa un premio ogni anno, ridurre costa una volta sola e resta"
        >
          <ul className="space-y-2">
            {analisi.prevenzione.map((r) => (
              <li
                key={`${r.rischio}-${r.misura.slice(0, 24)}`}
                className="rounded-lg border border-bordo bg-superficie p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{r.etichettaRischio}</p>
                  <p className="flex items-center gap-2 text-xs">
                    <BadgeRischio livello={r.livelloAttuale} />
                    <span className="text-testo-debole">→</span>
                    <BadgeRischio livello={r.livelloConLaMisura} />
                  </p>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-testo-tenue">{r.misura}</p>

                {/*
                  Una protezione non ancora chiesta non è una protezione assente: prima di
                  proporre un investimento conviene verificare che non ci sia già.
                */}
                {!r.accertataAssente && (
                  <p className="mt-2 text-xs text-testo-debole">
                    Da verificare in intervista: la misura non risulta, ma non è stata chiesta.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-testo-debole">
            L’effetto indicato è quello sul rischio, calcolato dal motore. Di quanto scenda il premio lo
            dice la compagnia in quotazione: prometterlo al posto suo sarebbe una promessa altrui.
          </p>
        </Sezione>
      )}

      {/* ── Merito creditizio ─────────────────────────────────────────────── */}
      <Sezione
        id="credito"
        titolo="Merito creditizio"
        sottotitolo={`Score ${analisi.credito.score}/100 · classe ${analisi.credito.classe}${
          analisi.credito.altman === null
            ? ''
            : ` · Altman Z'' ${analisi.credito.altman.z.toFixed(2)} (${analisi.credito.altman.zona})`
        }`}
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
          <p className="tabular mt-1 text-2xl font-semibold">{analisi.credito.fido.importo.formattato}</p>
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

          <div className="mt-3 overflow-hidden rounded-lg border border-bordo">
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
 * L'esposizione territoriale sulla scala dei livelli di rischio.
 *
 * Le due scale sono distinte nel dominio — «alta/media/bassa» descrive un territorio,
 * «critico/alto/…» descrive un rischio valutato — e la conversione avviene qui, al
 * momento di disegnarle, invece di confonderle nel motore.
 */
function livelloTerritoriale(livello: 'alta' | 'media' | 'bassa'): LivelloRischio {
  return livello === 'alta' ? 'alto' : livello === 'media' ? 'moderato' : 'basso';
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
    { id: 'piano', testo: 'Piano d’azione', presente: analisi.gap.voci.length > 0 },
    { id: 'rischi', testo: 'Rischi', presente: analisi.rischi.length > 0 },
    { id: 'somme', testo: 'Somme assicurande', presente: true },
    { id: 'danno-massimo', testo: 'Danno massimo', presente: analisi.dannoMassimo.disponibile },
    { id: 'ritenzione', testo: 'Ritenzione', presente: analisi.ritenzione.disponibile },
    { id: 'prevenzione', testo: 'Prevenzione', presente: analisi.prevenzione.length > 0 },
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
              className="rounded px-2.5 py-1 text-testo-tenue transition hover:bg-superficie hover:text-testo focus:outline-none focus:ring-2 focus:ring-marchio/40"
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
          : `${fonte.descrizione} · aggiornato al ${dataBreve(fonte.osservatoIl)}`
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

/**
 * Che cosa c'è davvero dentro il patrimonio esposto, e che cosa manca.
 *
 * Le voci non quantificate non si possono nominare come se fossero incluse: un capitale
 * che dichiara di comprendere scorte e macchinari senza comprenderli è una sottostima
 * presentata come completezza. Qui si elenca ciò che è dentro, e si dice apertamente ciò
 * che resta fuori e perché.
 */
function componiNotaPatrimonio(somme: AnalisiDto['sommeAssicurande']): string {
  const dentro: string[] = [];
  const fuori: string[] = [];
  const voce = (
    etichetta: string,
    valore: { valore: { formattato: string } | null } | null | undefined,
  ): void => {
    if (valore?.valore != null) dentro.push(etichetta);
    else fuori.push(etichetta);
  };

  voce('fabbricati', somme.fabbricati);
  voce('macchinari', somme.contenuto);
  voce('scorte', somme.scorte);

  if (dentro.length === 0) return 'Nessuna componente quantificata';
  const inclusi = `${dentro.join(', ')} a valore di ricostruzione`;
  return fuori.length === 0
    ? `${inclusi.charAt(0).toUpperCase()}${inclusi.slice(1)}`
    : `Solo ${inclusi} — ${fuori.join(' e ')} da rilevare in intervista`;
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
  const { azienda, sintesi } = analisi;
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
          {!conNegativita && (
            <Link
              href={`/azienda/${identificativo}?negativita=1${approfondita ? '&approfondita=1' : ''}`}
              className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio focus:outline-none focus:ring-2 focus:ring-marchio/40"
            >
              Verifica protesti e procedure{' '}
              <span className="text-testo-debole">{prezzo(listino?.costoEventiNegativiCentesimi)}</span>
            </Link>
          )}
          {!approfondita && (
            <Link
              href={`/azienda/${identificativo}?approfondita=1${conNegativita ? '&negativita=1' : ''}`}
              className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio focus:outline-none focus:ring-2 focus:ring-marchio/40"
            >
              Analisi approfondita{' '}
              <span className="text-testo-debole">{prezzo(listino?.costoApprofondimentoCentesimi)}</span>
            </Link>
          )}
          <Link
            href={`/azienda/${identificativo}/dati`}
            className="rounded border border-bordo-forte px-3 py-1.5 text-sm transition hover:border-marchio focus:outline-none focus:ring-2 focus:ring-marchio/40"
          >
            Dati di intervista{' '}
            <span className="tabular text-testo-debole">
              {Math.round(analisi.completezza.percentuale * 100)}%
            </span>
          </Link>
          <Link
            href={`/azienda/${identificativo}/report`}
            className="rounded bg-azione px-3 py-1.5 text-sm font-medium text-azione-testo transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-marchio/40"
          >
            Report per il cliente
          </Link>
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
        {azienda.addetti !== null && ` · ${azienda.addetti} addetti`}
        {azienda.anniDiAttivita !== null && ` · attiva da ${azienda.anniDiAttivita} anni`}
        {sintesi.datiDaCompletare > 0 &&
          ` · ${sintesi.datiDaCompletare} rischi da confermare in intervista`}
      </p>
    </div>
  );
}

/**
 * La compagnia della polizza, se è stata censita.
 *
 * Il confronto è sul nome normalizzato: sulle polizze la ragione sociale si scrive in
 * dieci modi — con e senza «S.p.A.», con e senza punti — e un confronto letterale non
 * troverebbe quasi mai la compagnia che pure è in anagrafe.
 */
function compagniaDi(voce: GapDto, compagnie: readonly SoliditaCompagnia[]): SoliditaCompagnia | null {
  if (voce.polizza === null) return null;
  const cercata = normalizzaNome(voce.polizza.compagnia);
  return compagnie.find((c) => normalizzaNome(c.denominazione) === cercata) ?? null;
}

function normalizzaNome(valore: string): string {
  return valore
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(spa|srl|s p a|s r l|societa|assicurazioni|compagnia)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function VoceGap({
  voce,
  compagnia,
  polizzeCensite,
}: {
  voce: GapDto;
  compagnia: SoliditaCompagnia | null;
  /** Falso quando nessuna polizza è stata dichiarata: allora «assente» non è un accertamento. */
  polizzeCensite: boolean;
}) {
  return (
    <Scheda className={voce.stato === 'adeguata' ? 'opacity-70' : ''}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="tabular rounded bg-fondo px-1.5 py-0.5 text-xs font-semibold text-testo-tenue">
            {voce.priorita}
          </span>
          <p className="font-medium">{voce.etichetta}</p>
          {/*
            L'avviso in cima diceva «non sono coperture che mancano», e ogni riga qui sotto
            diceva «Copertura assente»: due frasi che si contraddicono a mezzo centimetro di
            distanza, e a essere creduta è l'etichetta rossa accanto al nome della garanzia,
            non il paragrafo sopra. Senza polizze censite la riga dice ciò che si sa.
          */}
          <BadgeStato
            stato={voce.stato}
            testo={!polizzeCensite && voce.stato === 'assente' ? 'non censita' : voce.statoEtichetta}
          />
          {voce.obbligoDiLegge && (
            <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium text-critico">
              ⚖ obbligo di legge
            </span>
          )}
        </div>
        <p className="tabular text-sm text-testo-tenue">
          consigliato{' '}
          <strong className="text-testo">
            {voce.capitaleRaccomandato.valore?.formattato ?? 'da definire'}
          </strong>
          {voce.capitaleInEssere !== null && ` · in essere ${voce.capitaleInEssere.formattato}`}
        </p>
      </div>

      <p className="mt-2 text-sm">{voce.azione}</p>

      {/*
        Chi fa cosa ed entro quando. Un'azione senza titolare né data è un buon proposito:
        davanti a una contestazione dimostra che si è emesso un documento, non che si è
        seguita la pratica.
      */}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-testo-tenue">
        <span className={voce.piano.urgenza === 'immediata' ? 'font-medium text-critico' : ''}>
          {ETICHETTE_URGENZA[voce.piano.urgenza]}
        </span>
        {voce.piano.termine !== null && (
          <span>
            entro il <time dateTime={voce.piano.termine}>{formattaGiorno(voce.piano.termine)}</time>
          </span>
        )}
        <span>a cura {ETICHETTE_A_CURA[voce.piano.aCura]}</span>
      </p>

      {voce.sottoassicurazione?.sottoassicurata === true && (
        <p className="mt-2 rounded border border-alto/30 bg-alto-fondo p-2.5 text-sm text-alto">
          Regola proporzionale (art. 1907 c.c.): su un danno di{' '}
          {voce.sottoassicurazione.simulazione.danno.formattato} l&apos;indennizzo sarebbe{' '}
          {voce.sottoassicurazione.simulazione.indennizzo.formattato} —{' '}
          <strong>{voce.sottoassicurazione.simulazione.aCaricoAssicurato.formattato}</strong> a carico
          dell&apos;impresa.
        </p>
      )}

      {voce.polizza !== null && (
        <p className="mt-2 text-xs text-testo-debole">
          Polizza {voce.polizza.compagnia}
          {voce.polizza.numero !== null && ` n. ${voce.polizza.numero}`} · scadenza{' '}
          {formattaGiorno(voce.polizza.scadenza)}
          {/*
            Una copertura adeguata presso una compagnia fragile non è una copertura
            adeguata: è il rischio spostato da un posto visibile a uno che nessuno guarda.
          */}
          {compagnia !== null && (
            <>
              {' · '}
              <span
                className={
                  compagnia.fascia === 'critica' || compagnia.fascia === 'debole'
                    ? 'font-medium text-critico'
                    : 'text-testo-tenue'
                }
              >
                solidità {compagnia.punteggio}/100 · {compagnia.fasciaEtichetta}
              </span>
            </>
          )}
          {compagnia === null && (
            <>
              {' · '}
              <Link href="/impostazioni/compagnie" className="text-marchio hover:underline">
                solidità non censita
              </Link>
            </>
          )}
        </p>
      )}

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-marchio hover:underline">
          <span className="group-open:hidden">▸ Motivazione di adeguatezza e insidie</span>
          <span className="hidden group-open:inline">▾ Nascondi</span>
        </summary>
        <div className="mt-2 rounded border border-bordo bg-fondo p-3 text-xs leading-relaxed">
          <p className="mb-2">{voce.motivazioneAdeguatezza}</p>
          {voce.insidie.length > 0 && (
            <>
              <p className="font-medium text-testo-tenue">Errori ricorrenti su questa garanzia</p>
              <ul className="mt-1 space-y-1">
                {voce.insidie.map((insidia) => (
                  <li key={insidia} className="border-l-2 border-bordo-forte pl-2 text-testo-tenue">
                    {insidia}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      <Spiegazione dati={voce.capitaleRaccomandato.spiegazione} />
    </Scheda>
  );
}

function VoceRischio({ rischio }: { rischio: RischioDto }) {
  return (
    <Scheda>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{rischio.etichetta}</p>
          <BadgeRischio livello={rischio.livelloResiduo} testo={rischio.livelloResiduoEtichetta} />
          {rischio.daVerificare && (
            <span className="rounded border border-moderato/30 bg-moderato-fondo px-1.5 py-0.5 text-xs text-moderato">
              da verificare in intervista
            </span>
          )}
          {!rischio.assicurabile && (
            <span className="rounded border border-bordo-forte px-1.5 py-0.5 text-xs text-testo-debole">
              non assicurabile
            </span>
          )}
        </div>
        <p className="tabular text-sm text-testo-tenue">
          inerente {rischio.punteggioInerente} → residuo{' '}
          <strong className="text-testo">{rischio.punteggioResiduo}</strong> · {rischio.trattamento}
        </p>
      </div>

      <p className="mt-1 text-xs text-testo-debole">
        {rischio.categoriaEtichetta} · Probabilità: {rischio.probabilitaEtichetta} · Impatto:{' '}
        {rischio.impattoEtichetta}
      </p>

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-marchio hover:underline">
          <span className="group-open:hidden">▸ Perché questo rischio</span>
          <span className="hidden group-open:inline">▾ Nascondi</span>
        </summary>
        <div className="mt-2 rounded border border-bordo bg-fondo p-3 text-xs leading-relaxed">
          <p className="mb-2 text-testo-tenue">{rischio.descrizione}</p>

          {rischio.motivazioni.identificazione.map((motivo) => (
            <p key={motivo} className="border-l-2 border-bordo-forte pl-2 text-testo-tenue">
              {motivo}
            </p>
          ))}

          {rischio.motivazioni.modulazione.map((m) => (
            <p key={m.motivazione} className="mt-1 border-l-2 border-alto/50 pl-2 text-testo-tenue">
              <span className="tabular font-medium">
                {formatDelta(m.deltaProbabilita)}P {formatDelta(m.deltaImpatto)}I
              </span>{' '}
              {m.motivazione}
            </p>
          ))}

          {rischio.motivazioni.controlli.map((c) => (
            <p key={c.motivazione} className="mt-1 border-l-2 border-basso/50 pl-2 text-testo-tenue">
              <span className="tabular font-medium">
                {formatDelta(c.deltaProbabilita)}P {formatDelta(c.deltaImpatto)}I
              </span>{' '}
              controllo in essere: {c.motivazione}
            </p>
          ))}

          {rischio.controlliTipici.length > 0 && (
            <>
              <p className="mt-2 font-medium text-testo-tenue">Misure di prevenzione raccomandate</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-testo-tenue">
                {rischio.controlliTipici.map((controllo) => (
                  <li key={controllo}>{controllo}</li>
                ))}
              </ul>
            </>
          )}

          {rischio.riferimenti.length > 0 && (
            <p className="mt-2 text-testo-debole">Riferimenti: {rischio.riferimenti.join(' · ')}</p>
          )}
        </div>
      </details>
    </Scheda>
  );
}

/** Matrice probabilità × impatto: la lettura d'insieme che una lista non dà. */
function MatriceRischi({ rischi }: { rischi: RischioDto[] }) {
  const celle = new Map<string, RischioDto[]>();
  for (const rischio of rischi) {
    const chiave = `${rischio.probabilita}-${rischio.impatto}`;
    celle.set(chiave, [...(celle.get(chiave) ?? []), rischio]);
  }

  const livelloDi = (punteggio: number): RischioDto['livelloResiduo'] =>
    punteggio <= 4
      ? 'basso'
      : punteggio <= 8
        ? 'moderato'
        : punteggio <= 12
          ? 'rilevante'
          : punteggio <= 16
            ? 'alto'
            : 'critico';

  const sfondi: Record<string, string> = {
    basso: 'bg-basso-fondo',
    moderato: 'bg-moderato-fondo',
    rilevante: 'bg-rilevante-fondo',
    alto: 'bg-alto-fondo',
    critico: 'bg-critico-fondo',
  };

  return (
    <Scheda>
      <p className="mb-3 text-sm font-medium">Matrice del rischio residuo</p>
      <div className="flex gap-2">
        <div className="flex flex-col-reverse justify-between pb-6 text-xs text-testo-debole">
          <span className="rotate-180 [writing-mode:vertical-rl]">Probabilità →</span>
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-5 gap-1">
            {[5, 4, 3, 2, 1].map((probabilita) =>
              [1, 2, 3, 4, 5].map((impatto) => {
                const contenuto = celle.get(`${probabilita}-${impatto}`) ?? [];
                const livello = livelloDi(probabilita * impatto);
                return (
                  <div
                    key={`${probabilita}-${impatto}`}
                    className={`min-h-14 rounded border border-bordo p-1.5 ${sfondi[livello]}`}
                    title={contenuto.map((r) => r.etichetta).join('\n')}
                  >
                    {contenuto.length > 0 && (
                      <>
                        <p className="tabular text-sm font-bold">{contenuto.length}</p>
                        <p className="truncate text-[10px] leading-tight text-testo-tenue">
                          {contenuto[0]?.etichetta}
                        </p>
                      </>
                    )}
                  </div>
                );
              }),
            )}
          </div>
          <p className="mt-1.5 text-center text-xs text-testo-debole">Impatto →</p>
        </div>
      </div>
    </Scheda>
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

function umanizza(chiave: string): string {
  const parole = chiave.replace(/([A-Z])/g, ' $1').toLowerCase();
  return parole.charAt(0).toUpperCase() + parole.slice(1);
}

function formatDelta(valore: number): string {
  return valore > 0 ? `+${valore}` : valore < 0 ? String(valore) : '±0';
}

/** Urgenza e titolare, in forma leggibile. */
const ETICHETTE_URGENZA: Record<GapDto['piano']['urgenza'], string> = {
  immediata: 'Azione immediata',
  'entro-30-giorni': 'Entro 30 giorni',
  'alla-scadenza': 'Alla scadenza della polizza',
  'prossima-revisione': 'Alla prossima revisione',
};

const ETICHETTE_A_CURA: Record<GapDto['piano']['aCura'], string> = {
  intermediario: 'dell’intermediario',
  cliente: 'del cliente',
  congiunta: 'congiunta',
};

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
