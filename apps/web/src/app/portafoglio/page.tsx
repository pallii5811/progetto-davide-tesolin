import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { CollegamentoAzione } from '@/components/CollegamentoAzione';
import { leggiCrm } from '@/lib/api';
import type { VoceCrmDto } from '@/lib/api';
import { ETICHETTE_STATO_CRM, STATI_CRM, applicaFiltroCrm, isStatoCrm } from '@aegis/core/crm';
// Il fuso è dichiarato dentro il formattatore, non dedotto da chi rende la pagina.
import { formattaGiorno } from '@aegis/core/tempo';
import { Avviso, Scheda } from '@/components/ui';
import { ModificaCrm } from './ModificaCrm';

export const dynamic = 'force-dynamic';

/**
 * Il CRM dello studio.
 *
 * Era il «Portafoglio», e ordinava le aziende per obbligo CAT NAT ed esposizione non
 * assicurata. Il 17/09/2026 Simone l'ha voluto diverso («AEGIS - cambi.pptx», slide 3): «Questa
 * pagina deve essere un CRM non un tracker assicurativo. Non abbiamo la maggior parte dei dati
 * per poter dire cosa è coperto e cosa no». Dello stesso documento: le aziende degli elenchi
 * comprati ci vanno «per sempre non per 24 ore», e «Importa elenco clienti» è tolto.
 *
 * Quindi: chi è l'azienda, come la si raggiunge, a che punto è — con lo stato e la nota che
 * scrive l'intermediario — e nessun numero assicurativo. L'indirizzo resta `/portafoglio`,
 * perché ci portano già segnalibri e collegamenti.
 */
export default async function PaginaCrm({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await richiediSessione();
  const { filtro } = await searchParams;

  const crm = await leggiCrm().catch(() => null);

  /*
    Due messaggi per lo stesso guasto, come sulla schermata di ricerca: l'installazione
    consegnata parte da systemd, e un intermediario non ha un terminale su cui lanciare un
    comando. In sviluppo invece è esattamente l'informazione che serve.
  */
  if (crm === null) {
    return process.env.NODE_ENV === 'production' ? (
      <Avviso tono="critico" titolo="CRM momentaneamente non disponibile">
        Non è al momento possibile leggere l&apos;elenco delle aziende. Nulla è andato perso: i dati restano
        in archivio. Se la situazione persiste, segnalarlo all&apos;assistenza.
      </Avviso>
    ) : (
      <Avviso tono="critico" titolo="Servizio API non raggiungibile">
        Avviare il servizio con <code className="font-mono">npm run dev:api</code>, oppure indicare
        l&apos;indirizzo corretto nella variabile <code className="font-mono">AEGIS_API_URL</code>.
      </Avviso>
    );
  }

  const statoScelto = isStatoCrm(filtro) ? filtro : undefined;
  const aziende = applicaFiltroCrm(crm.aziende, statoScelto);

  const descrizione = (
    <>
      {/*
        La frase del documento era «Le aziende già analizzate, ordinate per priorità di
        intervento.»: nello stesso documento Simone ha chiesto che ci entrino anche le aziende
        degli elenchi comprati, che analizzate non sono, e la frase lo dice.
      */}
      <p className="max-w-3xl text-sm leading-snug text-testo-tenue sm:leading-relaxed">
        Le aziende già analizzate e quelle degli elenchi scaricati, ordinate per priorità di intervento.
      </p>
      <p className="mb-4 mt-1 max-w-3xl text-xs text-testo-debole sm:mb-6">
        In cima le trattative in corso, poi le aziende da contattare e quelle già contattate; clienti e non
        interessate in fondo.
      </p>
    </>
  );

  if (crm.aziende.length === 0) {
    return (
      <>
        <h1 className="mb-1.5 text-[26px] font-semibold leading-tight tracking-[-0.03em]">CRM</h1>
        {descrizione}
        <Scheda className="text-center">
          <p className="text-sm text-testo-tenue">Nessuna azienda nel CRM.</p>
          <p className="mt-3 text-sm text-testo-tenue">
            Le aziende entrano qui quando le analizzi o quando crei un elenco in{' '}
            <Link href="/prospect" className="text-marchio underline">
              Ricerca Clienti
            </Link>
            .
          </p>
        </Scheda>
      </>
    );
  }

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">CRM</h1>
        {/*
          Un collegamento e non un pulsante: è una navigazione verso un file, e come tale
          deve poter essere aperta in una scheda nuova o copiata. Il filtro corrente viaggia
          con l'indirizzo: si scarica ciò che si sta guardando.
        */}
        <a
          href={
            statoScelto === undefined
              ? '/portafoglio/esporta'
              : `/portafoglio/esporta?filtro=${statoScelto}`
          }
          download
          className="rounded-full border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:text-testo"
        >
          Esporta in CSV
        </a>
      </div>
      {descrizione}

      <nav aria-label="Filtri per stato" className="mb-4 flex flex-wrap gap-2">
        {[
          { chiave: undefined, testo: `Tutte (${crm.aziende.length})` },
          ...STATI_CRM.map((stato) => ({
            chiave: stato,
            testo: `${ETICHETTE_STATO_CRM[stato]} (${crm.conteggi[stato]})`,
          })),
        ].map((voce) => {
          const attivo = statoScelto === voce.chiave;
          return (
            <CollegamentoAzione
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
            </CollegamentoAzione>
          );
        })}
      </nav>

      {/*
        Su schermo stretto la tabella diventa un elenco di schede: con lo scorrimento
        orizzontale il broker vedrebbe l'azienda e nient'altro — né i contatti, né lo stato,
        né il comando per aprirla — senza alcun indizio che ci sia dell'altro fuori schermo.
      */}
      <ul className="space-y-2 md:hidden">
        {aziende.map((azienda) => (
          <li
            key={azienda.identificativo}
            className="rounded-2xl border border-bordo bg-superficie p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <IdentitaAzienda azienda={azienda} />
              <ApriAzienda azienda={azienda} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-testo-debole">Contatti</p>
                <Contatti azienda={azienda} />
              </div>
              <div className="text-right">
                <p className="text-xs text-testo-debole">Score</p>
                <PunteggioCredito azienda={azienda} />
              </div>
            </div>
            <div className="mt-3 border-t border-bordo pt-3">
              <ModificaCrm
                identificativo={azienda.identificativo}
                denominazione={azienda.denominazione}
                stato={azienda.stato}
                nota={azienda.nota}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-bordo md:block">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">Aziende del CRM con contatti, score, stato e nota</caption>
          <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-testo-debole">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Azienda
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Contatti
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Score
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Stato e nota
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {aziende.map((azienda) => (
              <tr key={azienda.identificativo} className="border-t border-bordo bg-superficie align-top">
                <td className="px-4 py-3">
                  <IdentitaAzienda azienda={azienda} />
                </td>
                <td className="max-w-[16rem] px-4 py-3">
                  <Contatti azienda={azienda} />
                </td>
                <td className="px-4 py-3">
                  <PunteggioCredito azienda={azienda} />
                </td>
                <td className="w-72 px-4 py-3">
                  <ModificaCrm
                    identificativo={azienda.identificativo}
                    denominazione={azienda.denominazione}
                    stato={azienda.stato}
                    nota={azienda.nota}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <ApriAzienda azienda={azienda} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aziende.length === 0 && (
        <p className="mt-4 text-sm text-testo-tenue">Nessuna azienda in questo stato.</p>
      )}

      {/*
        Dove sta il verdetto, detto una volta sola in fondo all'elenco: la riga mostra il
        punteggio, non il giudizio, e colorare di verde uno score che la scheda della stessa
        azienda dichiara «provvisorio» sarebbe una contraddizione visibile solo aprendola.
      */}
      {crm.aziende.some((a) => a.analizzataIl !== null) && (
        <p className="mt-4 text-xs leading-relaxed text-testo-debole">
          Lo score è quello calcolato all&apos;ultima analisi. Se per quell&apos;azienda protesti,
          pregiudizievoli e procedure concorsuali non sono stati verificati il punteggio è{' '}
          <strong className="text-testo-tenue">provvisorio</strong>, e la scheda della singola azienda lo
          dichiara accanto al numero: una procedura aperta azzera il fido consigliato.
        </p>
      )}
    </>
  );
}

/** Chi è, dove sta, e da dove è arrivata nel CRM. */
function IdentitaAzienda({ azienda }: { azienda: VoceCrmDto }) {
  const luogo =
    azienda.comune === null
      ? (azienda.provincia ?? null)
      : `${azienda.comune}${azienda.provincia === null ? '' : ` (${azienda.provincia})`}`;
  return (
    <div className="min-w-0">
      <p className="font-medium">{azienda.denominazione}</p>
      <p className="text-xs text-testo-debole">
        {luogo ?? '—'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
      </p>
      {/*
        QUANDO, che decide se la riga si lavora oggi: un'analisi di sei mesi fa e una di ieri
        non sono la stessa telefonata. Un'azienda mai analizzata lo dice.
      */}
      <p className="mt-0.5 text-xs text-testo-debole">
        {azienda.analizzataIl !== null
          ? `analizzata il ${formattaGiorno(azienda.analizzataIl)}`
          : azienda.daElencoIl !== null
            ? `da un elenco del ${formattaGiorno(azienda.daElencoIl)} · non ancora analizzata`
            : ''}
      </p>
    </div>
  );
}

/**
 * Come la si raggiunge: telefono, PEC e sito dal record camerale dell'ultima analisi.
 *
 * Un'azienda arrivata da un elenco e mai analizzata non ha ancora quel record: lo si dice
 * invece di lasciare tre trattini, che sembrerebbero contatti che non esistono.
 */
function Contatti({ azienda }: { azienda: VoceCrmDto }) {
  const { telefono, pec, sitoWeb } = azienda;
  if (telefono === null && pec === null && sitoWeb === null) {
    return (
      <p className="text-xs text-testo-debole">
        {azienda.analizzataIl === null ? 'Si leggono con l’analisi.' : 'Nessun contatto nel registro.'}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-xs">
      {telefono !== null && (
        <li>
          <a href={`tel:${telefono.replace(/\s/g, '')}`} className="text-marchio hover:underline">
            {telefono}
          </a>
        </li>
      )}
      {pec !== null && (
        <li className="break-words">
          <a href={`mailto:${pec}`} className="text-marchio hover:underline">
            {pec}
          </a>
        </li>
      )}
      {sitoWeb !== null && (
        <li className="break-words">
          <a
            href={/^https?:\/\//i.test(sitoWeb) ? sitoWeb : `https://${sitoWeb}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-marchio hover:underline"
          >
            {sitoWeb}
          </a>
        </li>
      )}
    </ul>
  );
}

/** Aprire un'azienda analizzata non spende; analizzarne una per la prima volta sì, e si dice. */
function ApriAzienda({ azienda }: { azienda: VoceCrmDto }) {
  const analizzata = azienda.analizzataIl !== null;
  return (
    <CollegamentoAzione
      href={`/azienda/${azienda.identificativo}`}
      inAttesa={analizzata ? 'Apertura della scheda in corso' : 'Analisi in corso'}
      className="inline-block rounded-full bg-azione px-3 py-1.5 text-xs font-medium text-azione-testo hover:opacity-90"
    >
      {analizzata ? 'Apri' : 'Analizza'}
    </CollegamentoAzione>
  );
}

/**
 * Il punteggio in elenco, **senza il verdetto**.
 *
 * Qui il numero veniva colorato: verde sopra 65, rosso sotto 50. Ma su ogni azienda per cui
 * protesti e procedure non sono stati verificati la scheda della **stessa** azienda dichiara
 * il punteggio «provvisorio». Un verde in elenco e una riserva sulla scheda sono due
 * affermazioni opposte sullo stesso numero, e chi lavora sull'elenco vede solo la prima.
 */
function PunteggioCredito({ azienda }: { azienda: VoceCrmDto }) {
  if (azienda.analizzataIl === null) {
    return <span className="text-xs text-testo-debole">non analizzata</span>;
  }
  return (
    <>
      {/*
        Un `null` in JSX non stampa niente: la cella resterebbe VUOTA, e una cella vuota in
        una tabella si legge come un guasto. Il trattino dice che il posto c'è e il numero no.
      */}
      <span className="tabular font-semibold">{azienda.scoreCredito ?? '—'}</span>
      <span className="ml-1 text-xs text-testo-debole">{azienda.classeCredito ?? ''}</span>
    </>
  );
}
