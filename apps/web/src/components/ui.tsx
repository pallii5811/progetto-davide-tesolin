/**
 * Elementi di interfaccia condivisi.
 *
 * Il pezzo che conta è `Spiegazione`: rende visibile, per ogni numero, la formula, gli
 * input, le note e i riferimenti normativi. È il requisito «scatola di vetro» tradotto
 * in un componente — se un dato non sa spiegarsi, non merita di stare a schermo.
 */

import type { ReactNode } from 'react';
import type { ExplanationDto, LivelloRischio, StatoGap } from '@/lib/api';

export function Sezione({
  id,
  titolo,
  sottotitolo,
  azione,
  children,
}: {
  // `?: T | undefined` e non `?: T`: con `exactOptionalPropertyTypes` le due forme non
  // sono la stessa cosa. La prima accetta sia la proprietà assente sia un `undefined`
  // passato apposta — che è quello che fa chi scrive `sottotitolo={forse}` — mentre la
  // seconda accetta solo l'assenza. È la convenzione già usata nel resto del progetto.
  id?: string | undefined;
  titolo: string;
  sottotitolo?: string | undefined;
  azione?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    // `scroll-mt` compensa la barra di navigazione appiccicata: senza, l'ancora
    // porta il titolo esattamente sotto la barra e sembra non aver funzionato.
    <section id={id} className="mb-10 scroll-mt-16">
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-bordo pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{titolo}</h2>
          {sottotitolo !== undefined && <p className="mt-0.5 text-sm text-testo-tenue">{sottotitolo}</p>}
        </div>
        {azione}
      </div>
      {children}
    </section>
  );
}

export function Scheda({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-bordo bg-superficie p-4 ${className}`}>{children}</div>;
}

export function Metrica({
  etichetta,
  valore,
  nota,
  tono = 'neutro',
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  tono?: 'neutro' | 'positivo' | 'attenzione' | 'critico';
}) {
  /*
    «Attenzione» non è la gravità «rilevante», ed è per questo che il token esiste.

    Qui il tono «attenzione» disegnava `text-rilevante`, cioè il quarto gradino della
    scala di gravità. Ma i due significati sono diversi: `rilevante` dice **quanto è
    grave un rischio**, `attenzione` dice **che il numero accanto non è verificato** —
    «provvisorio: protesti e procedure non verificati» sotto lo score, «valutazione
    formulata su dati presuntivi» sotto un capitale. Sulla stessa schermata convivevano
    le due letture, con lo stesso colore: chi legge non poteva distinguere una riserva
    da una gravità.
  */
  const colore =
    tono === 'positivo'
      ? 'text-basso'
      : tono === 'attenzione'
        ? 'text-attenzione'
        : tono === 'critico'
          ? 'text-critico'
          : 'text-testo';

  return (
    // min-w-0 anche qui, perché è QUESTO il figlio della griglia: è il riquadro a
    // rifiutarsi di restringersi, non il dl che ha dentro.
    <Scheda className="min-w-0">
      {/*
        Coppia termine/definizione e non due paragrafi: un lettore di schermo annuncia
        «Patrimonio esposto, 9.400.000 €» come una cosa sola, invece di leggere
        un'etichetta e più avanti un numero senza sapere a cosa appartenga.
      */}
      {/*
        min-w-0 sul termine/definizione: senza, in una griglia il riquadro si rifiuta di
        restringersi sotto la larghezza del proprio contenuto, e un numero lungo esce
        invece di adattarsi.

        Il numero è più piccolo finché lo schermo è stretto, e non è una scelta estetica.
        A 390 pixel la griglia a due colonne lascia circa 133 pixel di contenuto per
        riquadro: «8.147.000 €» a 24 pixel ne occupa quasi centottanta, e su Linux — dove
        il ripiego dei font è più largo del Segoe UI di Windows — il collaudo ha misurato
        46 pixel di traboccamento dentro questo dl, che risalivano fino a spingere l'intera
        pagina fuori schermo. Gli stessi quattro punti di altezza risparmiati riportano la
        lista di lavoro del portafoglio sopra la piega, che mancava di dieci pixel.

        break-words è la rete: un importo che non stia comunque va a capo invece di uscire.
      */}
      <dl data-testid={`metrica-${chiave(etichetta)}`} className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-testo-debole">{etichetta}</dt>
        <dd className={`tabular mt-1.5 break-words text-xl font-semibold sm:text-2xl ${colore}`}>
          {valore}
        </dd>
        {nota !== undefined && <dd className="mt-1 text-xs leading-snug text-testo-tenue">{nota}</dd>}
      </dl>
    </Scheda>
  );
}

/** Identificativo stabile a partire dall'etichetta: «Patrimonio esposto» → `patrimonio-esposto`. */
function chiave(etichetta: string): string {
  // Le lettere accentate si riducono alla lettera base invece di sparire: trattate come
  // separatori, «Già in portafoglio» darebbe `gi-in-portafoglio`.
  return etichetta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CLASSI_LIVELLO: Record<LivelloRischio, string> = {
  basso: 'bg-basso-fondo text-basso border-basso/30',
  moderato: 'bg-moderato-fondo text-moderato border-moderato/30',
  rilevante: 'bg-rilevante-fondo text-rilevante border-rilevante/30',
  alto: 'bg-alto-fondo text-alto border-alto/30',
  critico: 'bg-critico-fondo text-critico border-critico/40',
};

export function BadgeRischio({ livello, testo }: { livello: LivelloRischio; testo?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${CLASSI_LIVELLO[livello]}`}
    >
      {testo ?? livello}
    </span>
  );
}

const CLASSI_STATO: Record<StatoGap, string> = {
  assente: 'bg-critico-fondo text-critico border-critico/40',
  sottoassicurata: 'bg-alto-fondo text-alto border-alto/30',
  'massimale-insufficiente': 'bg-rilevante-fondo text-rilevante border-rilevante/30',
  'da-quantificare': 'bg-moderato-fondo text-moderato border-moderato/30',
  'in-scadenza': 'bg-moderato-fondo text-moderato border-moderato/30',
  adeguata: 'bg-basso-fondo text-basso border-basso/30',
};

export function BadgeStato({ stato, testo }: { stato: StatoGap; testo: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${CLASSI_STATO[stato]}`}
    >
      {testo}
    </span>
  );
}

export function BadgeConfidenza({ livello }: { livello: string }) {
  const classi = livello === 'alta' ? 'text-basso' : livello === 'media' ? 'text-moderato' : 'text-alto';
  return <span className={`text-xs font-medium ${classi}`}>confidenza {livello}</span>;
}

/**
 * Il dettaglio del calcolo, in linea e richiudibile.
 * Nessun numero della piattaforma è privo di questo blocco.
 */
export function Spiegazione({ dati, aperta = false }: { dati: ExplanationDto; aperta?: boolean }) {
  return (
    <details open={aperta} className="group mt-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-marchio hover:underline">
        <span className="group-open:hidden">▸ Come è stato calcolato</span>
        <span className="hidden group-open:inline">▾ Nascondi il calcolo</span>
      </summary>

      <div className="mt-2 rounded border border-bordo bg-fondo p-3 text-xs leading-relaxed">
        {dati.formula !== null && (
          <p className="mb-2">
            <span className="text-testo-debole">Formula: </span>
            <code className="font-mono text-testo">{dati.formula}</code>
          </p>
        )}

        {dati.input.length > 0 && (
          <dl className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
            {dati.input.map((i) => (
              <div key={i.etichetta} className="contents">
                <dt className="text-testo-tenue">{i.etichetta}</dt>
                <dd className="tabular text-right font-medium">{i.valore}</dd>
              </div>
            ))}
          </dl>
        )}

        {dati.note.map((nota) => (
          <p key={nota} className="mt-1.5 border-l-2 border-bordo-forte pl-2 text-testo-tenue">
            {nota}
          </p>
        ))}

        {dati.riferimenti.length > 0 && (
          <p className="mt-2 text-testo-debole">Riferimenti: {dati.riferimenti.join(' · ')}</p>
        )}
      </div>
    </details>
  );
}

export function Avviso({
  tono,
  titolo,
  children,
}: {
  tono: 'critico' | 'attenzione' | 'informativo';
  titolo: string;
  children: ReactNode;
}) {
  /* Stessa distinzione della `Metrica`: la riserva ha il suo colore, la gravità il suo. */
  const classi =
    tono === 'critico'
      ? 'border-critico/40 bg-critico-fondo'
      : tono === 'attenzione'
        ? 'border-attenzione/40 bg-attenzione-fondo'
        : 'border-marchio/30 bg-marchio-tenue';

  return (
    <div className={`rounded-lg border p-4 ${classi}`}>
      <p className="font-semibold">{titolo}</p>
      <div className="mt-1.5 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Il servizio dati non risponde, detto a chi lo sta leggendo.
 *
 * DUE LETTORI, DUE RIMEDI. Chi sviluppa deve sapere quale indirizzo non risponde e con
 * quale comando riavviarlo; un intermediario non può lanciare comandi, e leggersi
 * «Verificare che l'API sia avviata» davanti a un cliente gli fa sembrare rotto il
 * prodotto invece del servizio — e per giunta gli chiede una cosa fuori dalla sua portata,
 * che è il modo più veloce di far sentire incapace chi paga.
 *
 * La pagina iniziale faceva già questa distinzione, con il commento che la spiega. Tre
 * pagine — catalogo, elenco utenti, monitoraggio — no: dicevano la frase da sviluppatore a
 * chiunque, anche in esercizio. Qui la distinzione sta in un posto solo, così la prossima
 * schermata che ne ha bisogno non deve ricordarsene.
 */
export function ServizioNonRaggiungibile({ cosa, titolo }: { cosa: string; titolo: string }) {
  if (process.env.NODE_ENV === 'production') {
    return (
      <Avviso tono="critico" titolo={titolo}>
        Non è stato possibile leggere {cosa}. I dati già acquisiti restano consultabili dal
        portafoglio. Se la situazione persiste, segnalarlo all’assistenza.
      </Avviso>
    );
  }

  return (
    <Avviso tono="critico" titolo={titolo}>
      Non è stato possibile leggere {cosa}. Avviare il servizio con{' '}
      <code className="font-mono">npm run dev:api</code>, oppure indicare l’indirizzo corretto
      nella variabile <code className="font-mono">AEGIS_API_URL</code>.
    </Avviso>
  );
}
