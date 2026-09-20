import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { CollegamentoAzione } from '@/components/CollegamentoAzione';
import { IconaScarica } from '@/components/icone';
import { leggiCrm } from '@/lib/api';
import { ETICHETTE_STATO_CRM, STATI_CRM, applicaFiltroCrm, isStatoCrm } from '@aegis/core/crm';
import type { StatoCrm } from '@aegis/core/crm';
import { Avviso, Scheda } from '@/components/ui';
import { ElencoCrm } from './ElencoCrm';

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
 * Il 19/09/2026 è stato rifatto da capo («il crm è brutto… aumenta la qualità e l'esperienza
 * utente in maniera esponenziale»): stati come pastiglie colorate con i conti, ricerca,
 * contatti con le loro icone — telefono compreso — e i tre punteggi del foglio Veezco per ogni
 * azienda. Lo score di credito non c'è più: era stato tolto anche dalla scheda, e restava qui
 * come ultimo numero assicurativo di una pagina che non ne vuole.
 *
 * L'indirizzo resta `/portafoglio`, perché ci portano già segnalibri e collegamenti.
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
  const analizzate = crm.aziende.filter((a) => a.analizzataIl !== null).length;

  if (crm.aziende.length === 0) {
    return (
      <>
        <h1 className="mb-1.5 text-[26px] font-semibold leading-tight tracking-[-0.03em]">CRM</h1>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-testo-tenue">
          Le aziende già analizzate e quelle degli elenchi scaricati, ordinate per priorità di intervento.
        </p>
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
          className="inline-flex items-center gap-1.5 rounded-full border border-bordo-forte px-3 py-1.5 text-sm text-testo-tenue transition hover:border-marchio/50 hover:text-testo"
        >
          <IconaScarica className="h-4 w-4" />
          Esporta in CSV
        </a>
      </div>

      {/*
        La frase del documento era «Le aziende già analizzate, ordinate per priorità di
        intervento.»: nello stesso documento Simone ha chiesto che ci entrino anche le aziende
        degli elenchi comprati, che analizzate non sono, e la frase lo dice.
      */}
      <p className="max-w-3xl text-sm leading-snug text-testo-tenue sm:leading-relaxed">
        Le aziende già analizzate e quelle degli elenchi scaricati, ordinate per priorità di intervento.
      </p>
      <p className="mb-5 mt-1 max-w-3xl text-xs text-testo-debole">
        In cima le trattative in corso, poi le aziende da contattare e quelle già contattate; clienti e non
        interessate in fondo.
      </p>

      <nav aria-label="Filtri per stato" className="mb-4 flex flex-wrap gap-2">
        <PastigliaFiltro
          href="/portafoglio"
          attivo={statoScelto === undefined}
          testo="Tutte"
          quante={crm.aziende.length}
        />
        {STATI_CRM.map((stato) => (
          <PastigliaFiltro
            key={stato}
            href={`/portafoglio?filtro=${stato}`}
            attivo={statoScelto === stato}
            testo={ETICHETTE_STATO_CRM[stato]}
            quante={crm.conteggi[stato]}
            stato={stato}
          />
        ))}
      </nav>

      {aziende.length === 0 ? (
        <Scheda className="text-center">
          <p className="text-sm text-testo-tenue">Nessuna azienda in questo stato.</p>
        </Scheda>
      ) : (
        <ElencoCrm aziende={aziende} />
      )}

      {/*
        Da dove vengono i numeri, detto una volta sola in fondo. I punteggi sono quelli
        dell'ultima analisi: le analisi salvate prima del 19/09/2026 non li avevano, e si
        riempiono riaprendo la scheda — che per un'azienda già analizzata non costa nulla.
      */}
      {analizzate > 0 && (
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-testo-debole">
          I punteggi sono quelli dell&apos;ultima analisi: Property Risk e Cyber Risk da 1 a 7 come nella
          scheda, e per la Business Interruption anche quanto costa un giorno di fermo. Un&apos;azienda
          analizzata prima del 19/09/2026 li mostra appena la sua scheda viene riaperta.
        </p>
      )}
    </>
  );
}

/** Il colore del filtro è quello dello stato: lo stesso della pastiglia sulla riga. */
const PUNTI: Record<StatoCrm, string> = {
  'da-contattare': 'bg-testo-debole',
  contattata: 'bg-attenzione',
  'in-trattativa': 'bg-marchio',
  cliente: 'bg-basso',
  'non-interessata': 'bg-bordo-forte',
};

function PastigliaFiltro({
  href,
  attivo,
  testo,
  quante,
  stato,
}: {
  href: string;
  attivo: boolean;
  testo: string;
  quante: number;
  stato?: StatoCrm;
}) {
  return (
    <CollegamentoAzione
      href={href}
      aria-current={attivo ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
        attivo
          ? 'border-azione bg-azione text-azione-testo'
          : 'border-bordo-forte bg-superficie hover:border-marchio/50'
      }`}
    >
      {stato !== undefined && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${attivo ? 'bg-azione-testo' : PUNTI[stato]}`}
        />
      )}
      {testo}{' '}
      <span className={`tabular text-xs ${attivo ? 'opacity-80' : 'text-testo-debole'}`}>({quante})</span>
    </CollegamentoAzione>
  );
}
