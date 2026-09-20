'use client';

import { useMemo, useState } from 'react';
import { formattaGiorno } from '@aegis/core/tempo';
import { CollegamentoAzione } from '@/components/CollegamentoAzione';
import { IconaBusta, IconaCerca, IconaGlobo, IconaTelefono } from '@/components/icone';
import { Cerchio } from '../azienda/[id]/Cerchio';
import { ModificaCrm } from './ModificaCrm';
import type { VoceCrmDto } from '@/lib/api';

/**
 * L'elenco del CRM: una riga per azienda, con chi è, come la si chiama, quanto rischia e a che
 * punto è la trattativa.
 *
 * Rifatto il 19/09/2026 su richiesta di Simone («il crm è brutto… aumenta la qualità e
 * l'esperienza utente in maniera esponenziale»), con tre aggiunte volute da lui: il telefono
 * accanto alla PEC, i punteggi Property, Business Interruption e Cyber di ogni azienda, e una
 * ricerca per trovare una riga senza scorrere venticinque schede.
 *
 * La ricerca vive qui e non nell'indirizzo: filtra ciò che è già a schermo, senza andare al
 * server e senza perdere il filtro per stato, che invece resta un collegamento — si condivide, e
 * il file esportato segue lo stesso filtro.
 */

/** Le iniziali della tessera: «DICART GROUP S.P.A.» → «DG», saltando le forme societarie. */
function iniziali(denominazione: string): string {
  const parole = denominazione
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1 && !/^(s|r|l|p|a|spa|srl|snc|sas|sc|coop|di|e|the)$/i.test(p));
  const scelte = parole.length > 0 ? parole : denominazione.split(/\s+/);
  return scelte
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/*
  Il colore della tessera dal nome: stabile fra un caricamento e l'altro, così l'occhio ritrova
  la stessa azienda dove l'aveva lasciata. Sono i toni del prodotto, non colori nuovi.
*/
const TESSERE = [
  'bg-marchio-tenue text-marchio',
  'bg-basso-fondo text-basso',
  'bg-attenzione-fondo text-attenzione',
  'bg-rilevante-fondo text-rilevante',
  'bg-moderato-fondo text-moderato',
] as const;

function tessera(chiave: string): string {
  let somma = 0;
  for (const carattere of chiave) somma = (somma + carattere.charCodeAt(0)) % 9973;
  return TESSERE[somma % TESSERE.length] ?? TESSERE[0];
}

/** Il telefono come si compone: senza spazi nel collegamento, com'è scritto a schermo. */
function collegamentoTelefono(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, '')}`;
}

function indirizzoSito(sito: string): string {
  return /^https?:\/\//i.test(sito) ? sito : `https://${sito}`;
}

/** L'importo del fermo di un giorno, arrotondato all'euro: in elenco i centesimi non servono. */
function euroAlGiorno(centesimi: number): string {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(centesimi / 100)} €`;
}

function Identita({ azienda }: { azienda: VoceCrmDto }) {
  const luogo =
    azienda.comune === null
      ? azienda.provincia
      : `${azienda.comune}${azienda.provincia === null ? '' : ` (${azienda.provincia})`}`;

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12.5px] font-semibold ${tessera(azienda.identificativo)}`}
      >
        {iniziali(azienda.denominazione)}
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium leading-snug tracking-[-0.01em]">{azienda.denominazione}</p>
        <p className="mt-0.5 truncate text-xs text-testo-tenue">
          {luogo ?? 'sede non disponibile'} · {azienda.atecoDescrizione ?? 'settore n.d.'}
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
    </div>
  );
}

/** Un contatto: l'icona lo fa riconoscere prima di leggerlo. */
function Contatto({
  icona,
  testo,
  href,
  esterno = false,
}: {
  icona: React.ReactNode;
  testo: string;
  href: string;
  esterno?: boolean;
}) {
  return (
    <a
      href={href}
      {...(esterno ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group flex min-w-0 items-center gap-1.5 text-xs text-testo-tenue transition hover:text-marchio"
    >
      <span className="text-testo-debole transition group-hover:text-marchio">{icona}</span>
      <span className="truncate underline-offset-2 group-hover:underline">{testo}</span>
    </a>
  );
}

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
    <div className="min-w-0 space-y-1">
      {telefono !== null && (
        <Contatto
          icona={<IconaTelefono className="h-3.5 w-3.5" />}
          testo={telefono}
          href={collegamentoTelefono(telefono)}
        />
      )}
      {pec !== null && (
        <Contatto icona={<IconaBusta className="h-3.5 w-3.5" />} testo={pec} href={`mailto:${pec}`} />
      )}
      {sitoWeb !== null && (
        <Contatto
          icona={<IconaGlobo className="h-3.5 w-3.5" />}
          testo={sitoWeb.replace(/^https?:\/\//i, '')}
          href={indirizzoSito(sitoWeb)}
          esterno
        />
      )}
    </div>
  );
}

/**
 * I tre punteggi del foglio Veezco, come li mostra la scheda: stessi cerchi, stessa scala da 1 a
 * 7, stessi colori. Sotto, quanto costa un giorno di fermo: è il numero con cui si apre la
 * telefonata.
 *
 * Un'azienda mai analizzata non ha punteggi e lo dice: tre cerchi grigi sembrerebbero un rischio
 * minimo, che è un'affermazione, non un'assenza. Lo stesso vale per un'analisi salvata prima che i
 * punteggi si conservassero (migrazione 0017): niente tre «n.d.» in fila, ma una riga che dice
 * perché mancano e come tornano.
 */
function Punteggi({ azienda }: { azienda: VoceCrmDto }) {
  if (azienda.analizzataIl === null) {
    return <p className="text-xs leading-snug text-testo-debole">Con l’analisi.</p>;
  }

  /*
    Il nome per esteso lo sente chi usa un lettore di schermo — «Business Interruption: 5,17 su 7»,
    come nella scheda — e sotto il cerchio ne sta una parola sola: in una colonna di elenco
    «Interruzione» finiva tagliata a metà.
  */
  const voci = [
    { etichetta: 'Property Risk', corta: 'Property', valore: azienda.propertyRisk, decimali: 2 },
    { etichetta: 'Business Interruption', corta: 'Fermo', valore: azienda.biPunteggio, decimali: 2 },
    { etichetta: 'Cyber Risk', corta: 'Cyber', valore: azienda.cyberRisk, decimali: 1 },
  ] as const;

  if (voci.every((v) => v.valore === null)) {
    return (
      <p className="text-xs leading-snug text-testo-debole">
        Non in archivio: si ricalcolano riaprendo la scheda.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        {voci.map((v) => (
          <div key={v.etichetta} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <Cerchio valore={v.valore} etichetta={v.etichetta} piccolo decimali={v.decimali} />
            <span className="w-full truncate text-[10.5px] leading-tight text-testo-debole">{v.corta}</span>
          </div>
        ))}
      </div>
      {azienda.biPerditaGiornalieraCentesimi !== null && (
        <p className="mt-1.5 text-center text-[11px] leading-snug text-testo-tenue">
          Un giorno di fermo:{' '}
          <span className="tabular">{euroAlGiorno(azienda.biPerditaGiornalieraCentesimi)}</span>
        </p>
      )}
    </div>
  );
}

function Apri({ azienda }: { azienda: VoceCrmDto }) {
  const analizzata = azienda.analizzataIl !== null;
  return (
    <CollegamentoAzione
      href={`/azienda/${azienda.identificativo}`}
      inAttesa={analizzata ? 'Apertura della scheda in corso' : 'Analisi in corso'}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
        analizzata
          ? 'border border-bordo-forte text-testo hover:border-marchio/50 hover:text-marchio'
          : 'bg-azione text-azione-testo hover:opacity-90'
      }`}
    >
      {analizzata ? 'Apri' : 'Analizza'}
    </CollegamentoAzione>
  );
}

export function ElencoCrm({ aziende }: { aziende: readonly VoceCrmDto[] }) {
  const [cerca, setCerca] = useState('');

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (q === '') return aziende;
    return aziende.filter((a) =>
      [a.denominazione, a.comune, a.provincia, a.atecoDescrizione, a.partitaIva, a.nota]
        .filter((v): v is string => typeof v === 'string')
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [aziende, cerca]);

  return (
    <div className="overflow-hidden rounded-2xl border border-bordo bg-superficie shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordo px-3 py-3 sm:px-4">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Cerca fra le aziende del CRM</span>
          <IconaCerca className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-testo-debole" />
          <input
            type="search"
            value={cerca}
            onChange={(evento) => setCerca(evento.target.value)}
            placeholder="Cerca per nome, comune, settore o nota"
            className="w-full rounded-full border border-bordo-forte bg-fondo py-2 pl-9 pr-3 text-sm transition focus:border-marchio focus:bg-superficie"
          />
        </label>
        <p role="status" className="text-xs text-testo-debole">
          {cerca.trim() === ''
            ? `${aziende.length} ${aziende.length === 1 ? 'azienda' : 'aziende'}`
            : `${filtrate.length} su ${aziende.length}`}
        </p>
      </div>

      {filtrate.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-testo-tenue">
          Nessuna azienda corrisponde a «{cerca.trim()}».
        </p>
      ) : (
        <>
          {/*
            Su schermo stretto l'elenco diventa schede: con lo scorrimento orizzontale si
            vedrebbe il nome e nient'altro — né i contatti, né i punteggi, né lo stato — senza
            alcun indizio che ci sia dell'altro fuori schermo.
          */}
          <ul className="divide-y divide-bordo md:hidden">
            {filtrate.map((azienda) => (
              <li key={azienda.identificativo} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Identita azienda={azienda} />
                  <Apri azienda={azienda} />
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <Contatti azienda={azienda} />
                  <Punteggi azienda={azienda} />
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

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[58rem] table-fixed text-sm">
              <caption className="sr-only">
                Aziende del CRM con contatti, punteggi di rischio, stato e nota
              </caption>
              {/*
                Le larghezze sono decise qui, non dal contenuto: con le colonne automatiche i
                cerchi si prendevano lo spazio e il nome dell'azienda andava a capo a metà parola.
              */}
              <colgroup>
                <col className="w-[29%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[25%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="border-b border-bordo bg-fondo text-left text-[11px] uppercase tracking-wide text-testo-debole">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Azienda
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Contatti
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Rischio da 1 a 7
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Stato e nota
                  </th>
                  <th scope="col" className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bordo">
                {filtrate.map((azienda) => (
                  <tr key={azienda.identificativo} className="align-top transition hover:bg-fondo/70">
                    <td className="px-4 py-3.5">
                      <Identita azienda={azienda} />
                    </td>
                    <td className="px-4 py-3.5">
                      <Contatti azienda={azienda} />
                    </td>
                    <td className="px-4 py-3.5">
                      <Punteggi azienda={azienda} />
                    </td>
                    <td className="px-4 py-3.5">
                      <ModificaCrm
                        identificativo={azienda.identificativo}
                        denominazione={azienda.denominazione}
                        stato={azienda.stato}
                        nota={azienda.nota}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Apri azienda={azienda} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
