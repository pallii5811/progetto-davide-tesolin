import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { analizzaAzienda, leggiImmaginiUbicazioni, leggiStudio } from '@/lib/api';
import type { AnalisiDto, DatiStudio, GapDto } from '@/lib/api';
import { AnalisiEconomica } from './AnalisiEconomica';
import { MetricheDiImpatto } from './MetricheDiImpatto';
import { ContestoUbicazioni } from './ContestoUbicazioni';
import { ImmaginiUbicazioni } from './ImmaginiUbicazioni';
import { Avviso } from '@/components/ui';
import { BottoneStampa } from './BottoneStampa';

export const dynamic = 'force-dynamic';

/**
 * Report per il cliente.
 *
 * È il documento che l'intermediario consegna e che finisce nel fascicolo di adeguatezza.
 * Per questo la struttura segue l'ordine logico della norma — richieste ed esigenze rilevate,
 * poi coperture proposte, poi motivazione per ciascuna — e non l'ordine con cui i dati sono
 * comodi da mostrare a schermo.
 */
export default async function PaginaReport({ params }: { params: Promise<{ id: string }> }) {
  await richiediSessione();
  const { id } = await params;

  let analisi: AnalisiDto;
  try {
    analisi = await analizzaAzienda(id);
  } catch (errore) {
    return (
      <Avviso tono="critico" titolo="Report non disponibile">
        {errore instanceof Error ? errore.message : 'Errore imprevisto'}
      </Avviso>
    );
  }

  const { azienda, sintesi, catNat, gap, rischi, assetto, ubicazioni } = analisi;

  /*
    Chi ha redatto il documento.

    Il Reg. IVASS 40/2018 chiede che i documenti consegnati al contraente identifichino
    l'intermediario e il suo numero di iscrizione al RUI. Se l'anagrafica non è ancora
    stata compilata il report resta valido — l'intestazione semplicemente non compare —
    perché un documento senza logo è un documento incompleto, uno che non si apre è un
    lavoro perso.
  */
  const studio: DatiStudio | null = await leggiStudio()
    .then((s) => ('errore' in s ? null : s))
    .catch(() => null);
  const dataAnalisi = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(
    new Date(analisi.asOf),
  );

  const interventi = gap.voci.filter((v) => v.stato !== 'adeguata');

  // Le fotografie stanno fuori dall'analisi — pesano e non entrano in alcun calcolo — e un
  // guasto nel leggerle non deve togliere all'intermediario il documento da consegnare.
  const immagini = await leggiImmaginiUbicazioni(id)
    .then((r) => r.immagini)
    .catch(() => []);

  /*
    Numerazione dei capitoli: contata, non scritta.

    A mano non reggeva. Due capitoli sono condizionali — il danno massimo compare solo se
    calcolabile, l'obbligo CAT NAT solo se dovuto — e ogni inserimento obbliga a rinumerare
    tutti quelli sotto. È già andata male una volta: l'aggiunta dell'analisi economica ha
    lasciato un «3-bis» stampato dopo il quinto capitolo. Su un documento che
    l'intermediario consegna al proprio cliente, una numerazione che salta è la prima cosa
    che si nota, e mette in dubbio tutto il resto.

    Il contatore nasce dentro il render, quindi due richieste in parallelo non se lo
    scambiano; e gli operatori `&&` che avvolgono i capitoli condizionali fanno sì che un
    capitolo non reso non consumi il proprio numero.
  */
  const cap = numerazione();

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/azienda/${id}`} className="text-xs text-marchio hover:underline">
          ← Torna all&apos;analisi
        </Link>
        <BottoneStampa />
      </div>

      <article className="mx-auto max-w-[52rem] leading-relaxed">
        {/* ── Frontespizio ───────────────────────────────────────────────── */}
        <header className="print-keep mb-8 border-b-2 border-testo pb-5">
          {studio !== null && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-bordo pb-3">
              <div className="flex items-center gap-3">
                {/*
                  Il marchio dello studio, quando c'è.

                  Non è decorazione: questo documento l'intermediario lo consegna al proprio
                  cliente e ci mette la faccia. Senza il suo marchio resta lo stampato di un
                  fornitore, e nessuno consegna a un cliente lo stampato di un fornitore.

                  Altezza limitata e larghezza libera: i loghi degli studi sono quasi sempre
                  orizzontali, e vincolare la larghezza li schiaccerebbe. `object-contain`
                  impedisce la deformazione, che su un marchio si nota subito.
                */}
                {studio.logo !== null && studio.logo !== '' && (
                  // Data URI: nessuna ottimizzazione possibile, e `next/image`
                  // richiederebbe un dominio noto. (Il commento di disabilitazione che
                  // stava qui nominava una regola non caricata, ed era lui a far fallire
                  // il lint.)
                  <img
                    src={studio.logo}
                    alt={`Logo di ${studio.denominazione}`}
                    className="h-10 w-auto max-w-[12rem] object-contain"
                  />
                )}
                <p className="text-sm font-bold tracking-tight">{studio.denominazione}</p>
              </div>
              <p className="text-xs text-testo-tenue">
                {[
                  studio.numeroRui === null ? null : `RUI n. ${studio.numeroRui}`,
                  studio.indirizzo,
                  studio.telefono,
                  studio.email,
                ]
                  .filter((v): v is string => v !== null && v !== '')
                  .join(' · ')}
              </p>
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-widest text-testo-tenue">
            Analisi dei rischi e verifica delle coperture assicurative
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{azienda.denominazione}</h1>
          <p className="mt-1.5 text-sm text-testo-tenue">
            {azienda.formaGiuridica} · P.IVA {azienda.partitaIva ?? '—'} ·{' '}
            {azienda.sedeLegale === null
              ? 'sede non disponibile'
              : `${azienda.sedeLegale.via} ${azienda.sedeLegale.civico ?? ''}, ${azienda.sedeLegale.comune} (${azienda.sedeLegale.provincia})`}
          </p>
          <p className="text-sm text-testo-tenue">
            {azienda.ateco} {azienda.atecoDescrizione} · {azienda.dimensioneEtichetta}
            {azienda.addetti !== null && ` · ${azienda.addetti} addetti`}
          </p>
          <p className="mt-3 text-xs text-testo-debole">
            Documento generato il {dataAnalisi} · metodologia ISO 31000:2018 · catalogo rischi v
            {analisi.rischiMeta.versioneCatalogo} · completezza dei dati di intervista{' '}
            {Math.round(analisi.completezza.percentuale * 100)}%
          </p>
        </header>

        {/* ── Sintesi ─────────────────────────────────────────────────── */}
        <Capitolo numero={cap()} titolo="Sintesi per la direzione">
          <p>
            L&apos;analisi ha identificato <strong>{sintesi.rischiIdentificati} rischi</strong> a carico
            dell&apos;impresa, dei quali <strong>{sintesi.rischiCritici}</strong> di livello alto o critico
            dopo l&apos;applicazione delle misure di prevenzione già in essere. Di questi,{' '}
            <strong>{sintesi.rischiDaTrasferire}</strong> presentano un profilo tale da raccomandarne il
            trasferimento assicurativo.
          </p>
          <p className="mt-3">
            {sintesi.patrimonioEsposto === null ? (
              <>
                Il valore dei beni esposti a un evento dannoso non è ancora quantificato: i dati economici
                disponibili non consentono di ricavarlo. La sua rilevazione è il passo preliminare a
                qualunque proposta sui rami patrimoniali.{' '}
              </>
            ) : (
              <>
                Il patrimonio esposto a un evento dannoso ammonta a{' '}
                <strong>{sintesi.patrimonioEsposto.formattato}</strong>, calcolato a valore di ricostruzione
                e di rimpiazzo a nuovo.{' '}
              </>
            )}
            {/*
              Questo paragrafo lo legge l'imprenditore. Scrivere «esposizione non assicurata:
              0 €» quando i capitali non sono ricavabili non è un'imprecisione tecnica: è
              un'attestazione di adeguatezza mai verificata, su un documento che accompagna
              una proposta assicurativa.
            */}
            {sintesi.esposizioneNonAssicurata.euro === 0 && sintesi.coperturaDaQuantificare > 0 ? (
              <>
                Rispetto alle coperture attualmente in essere restano{' '}
                <strong>
                  {sintesi.coperturaDaQuantificare}{' '}
                  {sintesi.coperturaDaQuantificare === 1 ? 'garanzia' : 'garanzie'} il cui capitale
                  non è determinabile
                </strong>{' '}
                con i dati oggi disponibili: l&apos;entità dell&apos;esposizione residua sarà
                quantificata al completamento della rilevazione.
              </>
            ) : (
              <>
                Rispetto alle coperture attualmente in essere residua un&apos;esposizione non
                assicurata di <strong>{sintesi.esposizioneNonAssicurata.formattato}</strong>
                {sintesi.incidenzaEsposizioneSuPatrimonio !== null && (
                  <>
                    , pari al{' '}
                    <strong>
                      {Math.round(sintesi.incidenzaEsposizioneSuPatrimonio * 100)}% del patrimonio
                      netto
                    </strong>{' '}
                    aziendale
                  </>
                )}
                .
              </>
            )}
          </p>
          {!sintesi.catNatConforme && catNat.soggetta && (
            <p className="mt-3 border-l-4 border-critico bg-critico-fondo p-3">
              <strong>Adempimento normativo pendente.</strong> L&apos;impresa è soggetta all&apos;obbligo di
              assicurazione contro le calamità naturali introdotto dalla L. 213/2023 e non risulta averlo
              adempiuto. L&apos;inadempimento è considerato nell&apos;assegnazione di contributi,
              sovvenzioni e agevolazioni pubbliche.
            </p>
          )}

          <TabellaSintesi analisi={analisi} />

          {/*
            Le ubicazioni prima dell'assetto: sono l'oggetto materiale della copertura, e
            il documento deve dire su quali beni e su quali indirizzi è stata condotta
            l'analisi. Un fascicolo che non dichiara le sedi esaminate non consente, tre
            anni dopo, di stabilire se il capannone sinistrato ne facesse parte.
          */}
          {ubicazioni.elenco.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 font-semibold">Ubicazioni esaminate</h3>
              <table className="mb-2 w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-testo text-left">
                    <th className="py-2 pr-3 font-semibold">Indirizzo</th>
                    <th className="py-2 pr-3 font-semibold">Superficie</th>
                    <th className="py-2 pr-3 font-semibold">Sisma</th>
                    <th className="py-2 font-semibold">Acqua</th>
                  </tr>
                </thead>
                <tbody>
                  {ubicazioni.elenco.map((u) => (
                    <tr key={u.id} className="border-b border-bordo align-top">
                      <td className="py-2 pr-3">
                        {u.via}
                        {u.civico === null ? '' : ` ${u.civico}`}, {u.cap} {u.comune} ({u.provincia})
                      </td>
                      <td className="tabular py-2 pr-3">
                        {u.superficieMq === null ? 'da rilevare' : `${u.superficieMq} m²`}
                      </td>
                      <td className="py-2 pr-3 capitalize">{u.sismica}</td>
                      <td className="py-2 capitalize">{u.idraulica}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {ubicazioni.elenco.length > 1 && (
                <p className="mb-2">
                  {ubicazioni.unicoComplesso ? (
                    <>
                      Le ubicazioni esaminate costituiscono un <strong>unico complesso</strong>: un
                      singolo evento può raggiungerle tutte, e i capitali sono stati considerati
                      cumulativamente.
                    </>
                  ) : (
                    <>
                      Le ubicazioni esaminate costituiscono{' '}
                      <strong>{ubicazioni.complessiIncendio.length} complessi distinti</strong>
                      {ubicazioni.distanzaMassimaKm !== null && (
                        <> , fino a {ubicazioni.distanzaMassimaKm} km di distanza</>
                      )}
                      : il danno massimo è stato stimato sul complesso più esposto e non sulla
                      somma dei capitali.
                    </>
                  )}
                </p>
              )}

              {ubicazioni.note.map((n) => (
                <p key={n} className="text-testo-tenue">
                  {n}
                </p>
              ))}
            </div>
          )}

          {/*
            L'assetto proprietario nel capitolo di sintesi, non in appendice: da chi
            controlla dipendono la responsabilità degli amministratori e l'esistenza di
            una persona chiave, cioè due delle coperture che si propongono qui dentro.
          */}
          {(assetto.soci.length > 0 || assetto.implicazioni.length > 0) && (
            <div className="mt-5">
              <h3 className="mb-2 font-semibold">Assetto proprietario e responsabilità</h3>
              <p className="mb-2">
                {assetto.soci.length === 0 ? (
                  <>La compagine sociale non risulta dai dati camerali disponibili.</>
                ) : (
                  <>
                    {assetto.tipoControlloEtichetta.toLowerCase().charAt(0).toUpperCase() +
                      assetto.tipoControlloEtichetta.toLowerCase().slice(1)}
                    {assetto.soci.length > 0 && ': '}
                    {assetto.soci
                      .map(
                        (socio) =>
                          `${socio.denominazione}${
                            socio.quotaPercentuale === null ? '' : ` (${socio.quotaPercentuale}%)`
                          }`,
                      )
                      .join(', ')}
                    .
                    {!assetto.compagineCompleta && ' Le quote note non coprono l’intero capitale.'}
                  </>
                )}
              </p>

              {assetto.implicazioni.map((implicazione) => (
                <p key={implicazione.titolo} className="mb-2">
                  <strong>{implicazione.titolo}.</strong> {implicazione.conseguenza}{' '}
                  {implicazione.azione}
                  {implicazione.riferimento !== null && (
                    <span className="text-testo-tenue"> ({implicazione.riferimento})</span>
                  )}
                </p>
              ))}

              {!assetto.caricheDisponibili && (
                <p className="text-testo-tenue">
                  Le cariche sociali non sono comprese nei dati acquisiti: l&apos;individuazione
                  nominativa degli amministratori assicurati dalla D&amp;O richiede la loro
                  rilevazione.
                </p>
              )}
            </div>
          )}
        </Capitolo>

        {/* ── Richieste ed esigenze ───────────────────────────────────── */}
        <Capitolo
          numero={cap()}
          titolo="Richieste ed esigenze rilevate"
          nota="Rilevazione condotta ai sensi dell’art. 58 del Reg. IVASS n. 40/2018, sulla base dei dati camerali e di bilancio dell’impresa e delle informazioni raccolte in sede di intervista."
        >
          <p className="mb-4">
            Ciascun rischio è stato valutato secondo la metodologia ISO 31000:2018 nella componente di
            probabilità e in quella di impatto. Il <em>rischio residuo</em> è quello che permane dopo le
            misure di prevenzione e protezione già adottate dall&apos;impresa, ed è il solo oggetto della
            proposta assicurativa.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-testo text-left">
                  <th className="py-2 pr-3 font-semibold">Rischio</th>
                  <th className="py-2 pr-3 font-semibold">Categoria</th>
                  <th className="py-2 pr-3 text-center font-semibold">Inerente</th>
                  <th className="py-2 pr-3 text-center font-semibold">Residuo</th>
                  <th className="py-2 font-semibold">Trattamento</th>
                </tr>
              </thead>
              <tbody>
                {rischi.map((rischio) => (
                  <tr key={rischio.id} className="border-b border-bordo align-top">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{rischio.etichetta}</span>
                      {rischio.daVerificare && (
                        <span className="ml-1.5 text-xs text-testo-debole">(da confermare)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-testo-tenue">{rischio.categoriaEtichetta}</td>
                    <td className="tabular py-2 pr-3 text-center">{rischio.punteggioInerente}</td>
                    <td className="tabular py-2 pr-3 text-center font-semibold">
                      {rischio.punteggioResiduo}
                    </td>
                    <td className="py-2 text-xs">
                      {rischio.livelloResiduoEtichetta} · {rischio.trattamento}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Capitolo>

        {/* ── Capitali da assicurare ──────────────────────────────────── */}
        <Capitolo
          numero={cap()}
          titolo="Analisi economica"
          nota="Andamento degli esercizi depositati e determinazione del margine di contribuzione, che è la base della somma assicuranda per i danni indiretti."
        >
          <AnalisiEconomica
            andamento={analisi.andamentoPluriennale}
            schema={analisi.schemaMargine}
          />
        </Capitolo>

        <Capitolo
          numero={cap()}
          titolo="Metriche di impatto economico"
          nota="Soglie ancorate ai dati dell'ultimo bilancio depositato. La soglia critica corrisponde alla perdita che fa scattare gli obblighi degli artt. 2446 e 2447 c.c."
        >
          <MetricheDiImpatto dati={analisi.metricheDiImpatto} />
        </Capitolo>

        {/*
          Il contesto compare solo se qualcosa è stato osservato.

          Un capitolo che dicesse «non rilevato» su ogni ubicazione non informerebbe:
          allungherebbe il documento e abituerebbe chi legge a saltare una sezione che,
          quando c'è, contiene il fattore che separa un principio d'incendio da una perdita
          totale.
        */}
        {ubicazioni.elenco.some((u) => u.contesto !== null) && (
          <Capitolo
            numero={cap()}
            titolo="Contesto fisico delle ubicazioni"
            nota="Tempo di soccorso e attività confinanti: i due fattori che i questionari incendio chiedono e che nessun bilancio contiene. Rilevati su fonte cartografica libera, mai usati per escludere un rischio."
          >
            <ContestoUbicazioni ubicazioni={ubicazioni.elenco} />
          </Capitolo>
        )}

        {/* Il capitolo compare solo se qualcosa è stato allegato: un titolo seguito da
            «nessuna immagine» non informa, allunga. */}
        {immagini.length > 0 && (
          <Capitolo
            numero={cap()}
            titolo="Documentazione fotografica delle ubicazioni"
            nota="Stato dei luoghi rilevato dall'intermediario. È la parte del fascicolo che non invecchia in modo discutibile: un capitale ricalcolato si contesta, una fotografia datata dice com'era."
          >
            <ImmaginiUbicazioni ubicazioni={ubicazioni.elenco} immagini={immagini} />
          </Capitolo>
        )}

        <Capitolo
          numero={cap()}
          titolo="Determinazione dei capitali da assicurare"
          nota="I capitali sono determinati dai dati di bilancio depositati e dalle rilevazioni di intervista. Per ciascuno è indicata la base di calcolo adottata."
        >
          <div className="space-y-3">
            {Object.entries(analisi.sommeAssicurande)
              .filter(([chiave, voce]) => chiave !== 'patrimonioEsposto' && voce.valore !== null)
              .map(([chiave, voce]) => (
                <div key={chiave} className="print-keep border-b border-bordo pb-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium">{voce.spiegazione.titolo}</p>
                    <p className="tabular font-semibold">{voce.valore?.formattato}</p>
                  </div>
                  {voce.spiegazione.formula !== null && (
                    <p className="mt-0.5 text-xs text-testo-tenue">
                      Base di calcolo: {voce.spiegazione.formula}
                    </p>
                  )}
                  {voce.spiegazione.note.slice(0, 1).map((nota) => (
                    <p key={nota} className="mt-1 text-xs leading-relaxed text-testo-tenue">
                      {nota}
                    </p>
                  ))}
                </div>
              ))}
          </div>
        </Capitolo>

        {/* ── Danno massimo e forma della copertura ───────────────── */}
        {analisi.dannoMassimo.disponibile && (
          <Capitolo
            numero={cap()}
            titolo="Danno massimo e forma della copertura sui beni"
            nota="La scelta fra valore intero e primo rischio assoluto non riguarda quanto si è coperti, ma come opera l'indennizzo. È una decisione che spetta al contraente, e qui vengono esposti entrambi i lati."
          >
            <div className="print-keep space-y-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-bordo pb-2">
                <p className="font-medium">Danno massimo possibile</p>
                <p className="tabular font-semibold">{analisi.dannoMassimo.possibile.formattato}</p>
              </div>
              <p className="text-xs leading-relaxed text-testo-tenue">
                Perdita dell&apos;intero patrimonio assicurabile: nessuna protezione regge.
              </p>

              <div className="flex items-baseline justify-between gap-4 border-b border-bordo pb-2 pt-2">
                <p className="font-medium">Danno massimo probabile</p>
                <p className="tabular font-semibold">{analisi.dannoMassimo.probabile.formattato}</p>
              </div>
              <p className="text-xs leading-relaxed text-testo-tenue">
                Pari al {Math.round(analisi.dannoMassimo.quota * 100)}% del valore.{' '}
                {analisi.dannoMassimo.spiegazione.note[0]}
              </p>

              <p className="mt-3 text-sm leading-relaxed">
                <strong>
                  {analisi.dannoMassimo.forma === 'primo-rischio-assoluto'
                    ? 'Forma consigliata: primo rischio assoluto.'
                    : 'Forma consigliata: valore intero.'}
                </strong>{' '}
                {analisi.dannoMassimo.motivazioneForma}
              </p>

              {analisi.dannoMassimo.domandeCheAbbassanoLaStima.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-testo-tenue">
                  La stima è prudenziale perché mancano alcune informazioni:{' '}
                  {analisi.dannoMassimo.domandeCheAbbassanoLaStima.join(' ')}
                </p>
              )}
            </div>
          </Capitolo>
        )}

        {/* ── Coperture proposte e motivazione ────────────────────────── */}
        <Capitolo
          numero={cap()}
          titolo="Coperture proposte e motivazione dell’adeguatezza"
          nota="Per ciascuna copertura è indicata la ragione per cui è ritenuta adeguata alle richieste e alle esigenze rilevate, in conformità all’Allegato 4-ter del Reg. IVASS n. 40/2018."
        >
          {/*
            Prima le coperture che il cliente **ha già**. Il documento parla di «coperture
            attualmente in essere» fin dal primo capitolo: non elencarle lascerebbe al
            lettore la domanda più ovvia — «quali?» — e a un documento di adeguatezza non
            è permesso lasciarla aperta. La rilevazione dello stato di fatto è parte della
            prestazione, non un preambolo.
          */}
          {gap.voci.some((v) => v.polizza !== null) && (
            <div className="print-keep mb-5">
              <h3 className="mb-2 font-semibold">Coperture attualmente in essere</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-testo text-left">
                      <th className="py-2 pr-3 font-semibold">Garanzia</th>
                      <th className="py-2 pr-3 font-semibold">Compagnia</th>
                      <th className="py-2 pr-3 text-right font-semibold">Capitale</th>
                      <th className="py-2 font-semibold">Scadenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gap.voci
                      .filter((v) => v.polizza !== null)
                      .map((v) => (
                        <tr key={v.copertura} className="border-b border-bordo align-top">
                          <td className="py-2 pr-3">{v.etichetta}</td>
                          <td className="py-2 pr-3">
                            {v.polizza!.compagnia}
                            {v.polizza!.numero !== null && (
                              <span className="text-xs text-testo-tenue"> n. {v.polizza!.numero}</span>
                            )}
                          </td>
                          <td className="tabular py-2 pr-3 text-right">
                            {v.capitaleInEssere?.formattato ?? '—'}
                          </td>
                          <td className="py-2 text-xs" suppressHydrationWarning>
                            {new Date(v.polizza!.scadenza).toLocaleDateString('it-IT')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {interventi.length === 0 ? (
            <p>
              Le coperture in essere risultano congrue rispetto ai rischi residui rilevati. Non si
              propongono interventi in questa sede.
            </p>
          ) : (
            <ol className="space-y-4">
              {interventi.map((voce, indice) => (
                <li key={voce.copertura} className="print-keep border-b border-bordo pb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <p className="font-semibold">
                      {indice + 1}. {voce.etichetta}
                      {voce.obbligoDiLegge && (
                        <span className="ml-2 text-xs font-normal text-critico">— obbligo di legge</span>
                      )}
                    </p>
                    <p className="tabular text-sm">
                      {voce.capitaleRaccomandato.valore?.formattato ?? 'capitale da definire'}
                    </p>
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed">{voce.motivazioneAdeguatezza}</p>

                  <p className="mt-1.5 text-sm">
                    <span className="font-medium">Intervento proposto:</span> {voce.azione}
                  </p>

                  {/*
                    Il piano di trattamento richiesto dall'ISO 31000: chi agisce ed entro
                    quando. In un documento di adeguatezza è ciò che distingue l'aver
                    seguito la pratica dall'aver emesso una carta.
                  */}
                  <p className="mt-1 text-xs text-testo-tenue" suppressHydrationWarning>
                    {ETICHETTE_URGENZA[voce.piano.urgenza]}
                    {voce.piano.termine !== null &&
                      ` — entro il ${new Date(voce.piano.termine).toLocaleDateString('it-IT')}`}
                    {` · a cura ${ETICHETTE_A_CURA[voce.piano.aCura]}. `}
                    {voce.piano.motivazioneTermine}
                  </p>

                  {voce.sottoassicurazione?.sottoassicurata === true && (
                    <p className="mt-1.5 border-l-4 border-alto bg-alto-fondo p-2.5 text-sm">
                      La somma attualmente assicurata è inferiore al valore reale del bene. Ai sensi
                      dell&apos;art. 1907 c.c. l&apos;indennizzo verrebbe ridotto in proporzione: a fronte
                      di un danno di {voce.sottoassicurazione.simulazione.danno.formattato}{' '}
                      l&apos;indennizzo sarebbe di{' '}
                      {voce.sottoassicurazione.simulazione.indennizzo.formattato}, con{' '}
                      {voce.sottoassicurazione.simulazione.aCaricoAssicurato.formattato} a carico
                      dell&apos;impresa.
                    </p>
                  )}

                  {voce.rischiServiti.length > 0 && (
                    <p className="mt-1.5 text-xs text-testo-tenue">
                      Rischi trattati: {voce.rischiServiti.map((r) => r.etichetta).join('; ')}.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Capitolo>

        {/* ── Obbligo CAT NAT ─────────────────────────────────────────── */}
        {catNat.soggetta && (
          <Capitolo
            numero={cap()}
            titolo="Obbligo assicurativo contro le calamità naturali"
            nota="L. 213/2023 art. 1 cc. 101-111 · DM MEF-MIMIT n. 18 del 30/01/2025."
          >
            <p>
              L&apos;impresa rientra fra i soggetti obbligati. Il termine applicabile alla sua classe
              dimensionale è il{' '}
              <strong>
                {catNat.termine === null
                  ? 'non determinato'
                  : new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(
                      new Date(catNat.termine),
                    )}
              </strong>
              . Stato rilevato: <strong>{catNat.stato}</strong>.
            </p>

            <p className="mt-3">
              {catNat.baseAssicurabile === null ? (
                <>
                  Il capitale da assicurare non è ancora determinato: richiede la rilevazione del valore dei
                  beni indicati dalla norma. L&apos;obbligo di legge sussiste comunque.
                </>
              ) : (
                <>
                  Il capitale da assicurare, determinato sui beni indicati dalla norma, ammonta a{' '}
                  <strong>{catNat.baseAssicurabile.formattato}</strong>.
                </>
              )}
            </p>

            <p className="mt-3 font-medium">Beni oggetto dell&apos;obbligo</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {catNat.beniInclusi.map((bene) => (
                <li key={bene}>{bene}</li>
              ))}
            </ul>

            <p className="mt-3 font-medium">Vincoli di prodotto da verificare in polizza</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {catNat.vincoliDiProdotto.map((vincolo) => (
                <li key={vincolo}>{vincolo}</li>
              ))}
            </ul>
          </Capitolo>
        )}

        {/* ── Limiti ─────────────────────────────────────────────────── */}
        <Capitolo numero={cap()} titolo="Limiti e avvertenze">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              I capitali indicati sono determinati con criteri di stima documentati e vanno confermati, per
              gli immobili di valore rilevante, da perizia estimativa.
            </li>
            {analisi.completezza.mancanti.length > 0 && (
              <li>
                La rilevazione dei dati di intervista è completa al{' '}
                {Math.round(analisi.completezza.percentuale * 100)}%. Restano da acquisire:{' '}
                {analisi.completezza.mancanti
                  .slice(0, 5)
                  .map((m) => m.etichetta.toLowerCase())
                  .join('; ')}
                . Il completamento può modificare capitali e priorità qui indicati.
              </li>
            )}
            {analisi.rischiMeta.daVerificare > 0 && (
              <li>
                {analisi.rischiMeta.daVerificare} rischi sono stati identificati in via presuntiva su dati
                non disponibili e sono contrassegnati come da confermare.
              </li>
            )}
            <li>
              La valutazione del merito creditizio è un&apos;elaborazione statistica a supporto della
              consulenza: non costituisce consulenza finanziaria né garanzia di solvibilità.
            </li>
            <li>
              Le condizioni di polizza effettivamente applicabili sono quelle del contratto sottoscritto. Il
              presente documento non costituisce proposta contrattuale.
            </li>
          </ul>
        </Capitolo>

        <footer className="print-keep mt-10 border-t-2 border-testo pt-5 text-sm">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-testo-debole">L&apos;intermediario</p>
              <div className="mt-8 border-t border-testo pt-1 text-xs text-testo-tenue">
                Firma e numero di iscrizione al RUI
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-testo-debole">Il contraente</p>
              <div className="mt-8 border-t border-testo pt-1 text-xs text-testo-tenue">
                Firma per presa visione
              </div>
            </div>
          </div>

          {/*
            Note legali e riservatezza.

            Non è formalismo: questo documento contiene bilanci, esposizioni patrimoniali e
            coperture in essere di un'impresa terza. Senza una clausola di riservatezza
            circola come un allegato qualsiasi, e senza i riferimenti normativi puntuali un
            ispettore deve dedurre da sé sotto quale disciplina è stato redatto.

            Gli articoli sono quelli esatti, non un rinvio generico al regolamento: l'art. 58
            disciplina la rilevazione di richieste ed esigenze, il 59 la coerenza della
            proposta, e l'art. 119-ter del Codice delle assicurazioni private è la norma
            primaria da cui entrambi discendono.
          */}
          <div className="mt-8 space-y-3 border-t border-bordo pt-4 text-xs leading-relaxed text-testo-debole">
            <p>
              <strong className="text-testo-tenue">Note legali.</strong> Il presente elaborato è
              redatto secondo le disposizioni degli artt. 58 e 59 del Regolamento IVASS n. 40 del
              2 agosto 2018 e dell&apos;art. 119-ter del Codice delle assicurazioni private (D.Lgs.
              209/2005). Ogni valutazione, indice, punteggio e somma assicurata qui indicati
              costituiscono indicazione a supporto della consulenza: non sono vincolanti e non
              costituiscono stima né perizia.
            </p>
            <p>
              <strong className="text-testo-tenue">Riservatezza.</strong> Le informazioni contenute
              in questo documento sono riservate e destinate al solo contraente indicato. La
              riproduzione e la diffusione a terzi non sono consentite senza autorizzazione scritta
              dell&apos;intermediario. Chi lo ricevesse per errore è pregato di distruggerlo e di
              darne comunicazione.
            </p>
          </div>
        </footer>
      </article>
    </>
  );
}

/** Contatore dei capitoli: restituisce «1», «2», … nell'ordine in cui vengono resi. */
function numerazione(): () => string {
  let n = 0;
  return () => String(++n);
}

function Capitolo({
  numero,
  titolo,
  nota,
  children,
}: {
  numero: string;
  titolo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-keep mb-8">
      <h2 className="mb-1 border-b border-bordo-forte pb-1 text-lg font-bold tracking-tight">
        {numero}. {titolo}
      </h2>
      {nota !== undefined && <p className="mb-3 text-xs leading-relaxed text-testo-debole">{nota}</p>}
      <div className="text-sm">{children}</div>
    </section>
  );
}

function TabellaSintesi({ analisi }: { analisi: AnalisiDto }) {
  const righe: [string, string][] = [
    ['Score di credito', `${analisi.sintesi.scoreCredito}/100 — classe ${analisi.sintesi.classeCredito}`],
    ['Fido commerciale consigliato', analisi.sintesi.fidoConsigliato.formattato],
    ['Patrimonio esposto', analisi.sintesi.patrimonioEsposto?.formattato ?? 'da rilevare'],
    [
      'Esposizione non assicurata',
      analisi.sintesi.esposizioneNonAssicurata.euro === 0 &&
      analisi.sintesi.coperturaDaQuantificare > 0
        ? 'da quantificare'
        : analisi.sintesi.esposizioneNonAssicurata.formattato,
    ],
    ['Coperture da attivare', String(analisi.gap.coperturaAssente)],
    ['Coperture da adeguare', String(analisi.gap.coperturaInadeguata)],
    [
      'Premio annuo in essere',
      analisi.gap.premioInEssere === null ? 'non rilevato' : analisi.gap.premioInEssere.formattato,
    ],
  ];

  return (
    <table className="mt-4 w-full text-sm">
      <tbody>
        {righe.map(([etichetta, valore]) => (
          <tr key={etichetta} className="border-b border-bordo">
            <td className="py-1.5 pr-4 text-testo-tenue">{etichetta}</td>
            <td className="tabular py-1.5 text-right font-medium">{valore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Urgenza e titolare del piano di trattamento, in forma leggibile. */
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
