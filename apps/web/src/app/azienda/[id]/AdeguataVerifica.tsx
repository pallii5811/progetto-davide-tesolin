'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Avviso, Scheda } from '@/components/ui';
import type { CandidatoVerificaDto, VerificaDto } from '@/lib/api';
import { decidiVerificaAzione, eseguiAdeguataVerificaAzione } from './actions';
import type { PersonaDaVerificare } from './persone-da-verificare';
import { formattaGiorno } from '@aegis/core/tempo';

/**
 * Adeguata verifica della clientela: candidati da valutare, mai verdetti.
 *
 * Il D.Lgs. 231/2007 chiede all'intermediario di identificare il cliente e i suoi titolari
 * effettivi e di verificarli contro liste di sanzioni e persone politicamente esposte.
 * AEGIS sa già chi sono, perché li ricava dai soci che ha comprato.
 *
 * Quello che questa schermata NON fa è concludere. La fonte cerca per nome e restituisce
 * candidati: sul primo giro vero uno stesso nome ha prodotto due persone, una del 1952 in
 * lista sanzioni e una nata verso il 1978 che non c'era. Un prodotto che dicesse «questa
 * persona è sanzionata» accuserebbe un cliente a ogni omonimia. Qui si mostra su cosa si
 * fonda ogni somiglianza e si chiede all'intermediario di decidere sul documento
 * d'identità, perché è lui che ce l'ha davanti.
 */

const ETICHETTA_LISTA: Readonly<Record<string, string>> = {
  sanzioni: 'Liste di sanzioni',
  pep: 'Persona politicamente esposta',
  'stampa-avversa': 'Stampa avversa',
  provvedimenti: 'Provvedimenti dell’autorità',
  'collegato-a-sanzionato': 'Collegata a un soggetto sanzionato',
  'collegato-a-pep': 'Collegata a una persona politicamente esposta',
};

const TONO_FORZA: Readonly<Record<CandidatoVerificaDto['forza'], string>> = {
  forte: 'border-critico/50 bg-critico-fondo/40',
  possibile: 'border-attenzione/50 bg-attenzione-fondo/30',
  debole: 'border-bordo bg-superficie',
};

const ETICHETTA_FORZA: Readonly<Record<CandidatoVerificaDto['forza'], string>> = {
  forte: 'Corrispondenza forte',
  possibile: 'Corrispondenza possibile',
  debole: 'Corrispondenza debole',
};

function Bottone({ etichetta, inCorso }: { etichetta: string; inCorso: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accento px-3 py-2 text-sm font-medium text-su-accento disabled:opacity-60"
    >
      {pending ? inCorso : etichetta}
    </button>
  );
}

function Riscontro({
  riscontro,
  decisione,
  bloccato,
}: {
  riscontro: CandidatoVerificaDto;
  decisione: 'confermato' | 'escluso' | undefined;
  bloccato: boolean;
}) {
  const c = riscontro.candidato;
  const anni = c.anniDiNascita
    .map((a) => `${a.anno}${a.dedotto ? ' (dedotto dalla fonte)' : ''}`)
    .join(', ');

  return (
    <div className={`rounded-md border p-3 ${TONO_FORZA[riscontro.forza]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">{c.nomi[0] ?? '(senza nome)'}</p>
        <p className="text-xs text-testo-tenue">
          {ETICHETTA_FORZA[riscontro.forza]}
          {riscontro.gravita === 'bloccante' ? ' · in lista sanzioni' : ''}
        </p>
      </div>

      <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-testo-tenue">
        {riscontro.perche.map((p) => (
          <li key={p}>· {p}</li>
        ))}
      </ul>

      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        {c.liste.length > 0 && (
          <>
            <dt className="text-testo-debole">Liste</dt>
            <dd>{c.liste.map((l) => ETICHETTA_LISTA[l] ?? l).join(' · ')}</dd>
          </>
        )}
        {anni !== '' && (
          <>
            <dt className="text-testo-debole">Nascita</dt>
            <dd className="tabular">{anni}</dd>
          </>
        )}
        {c.nazionalita.length > 0 && (
          <>
            <dt className="text-testo-debole">Nazionalità</dt>
            <dd>{c.nazionalita.join(', ')}</dd>
          </>
        )}
        {c.riferimenti.length > 0 && (
          <>
            <dt className="text-testo-debole">Elencata da</dt>
            <dd>{c.riferimenti.map((r) => `${r.autorita} (${r.codice})`).join(' · ')}</dd>
          </>
        )}
        {c.nomi.length > 1 && (
          <>
            <dt className="text-testo-debole">Anche come</dt>
            <dd>{c.nomi.slice(1).join(' · ')}</dd>
          </>
        )}
      </dl>

      <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">Decisione su {c.nomi[0] ?? 'questo riscontro'}</legend>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`decisione:${c.identificativo}`}
            value="confermato"
            defaultChecked={decisione === 'confermato'}
            disabled={bloccato}
          />
          È la stessa persona
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`decisione:${c.identificativo}`}
            value="escluso"
            defaultChecked={decisione === 'escluso'}
            disabled={bloccato}
          />
          È un omonimo
        </label>
      </fieldset>
    </div>
  );
}

function VerificaSvolta({ verifica, identificativo }: { verifica: VerificaDto; identificativo: string }) {
  const [esito, azione] = useActionState(decidiVerificaAzione, null);
  const decisa = verifica.decisaIl !== null;

  return (
    <Scheda className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">
          {verifica.nome} <span className="font-normal text-testo-tenue">· {verifica.ruolo}</span>
        </h3>
        <p className="text-xs text-testo-tenue">
          {verifica.verificataIl === null
            ? 'non eseguita'
            : `verificata il ${formattaGiorno(new Date(verifica.verificataIl))}`}
          {verifica.annoNascita === null ? '' : ` · nato nel ${verifica.annoNascita}`}
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-testo-tenue">{verifica.conclusione}</p>

      {verifica.candidati.length > 0 && (
        <form action={azione} className="mt-3 space-y-3">
          <input type="hidden" name="identificativo" value={identificativo} />
          <input type="hidden" name="verificaId" value={verifica.id} />

          {verifica.candidati.map((r) => (
            <Riscontro
              key={r.candidato.identificativo}
              riscontro={r}
              decisione={verifica.decisioni[r.candidato.identificativo]}
              bloccato={false}
            />
          ))}

          <label className="block text-sm">
            <span className="mb-1 block text-testo-tenue">
              Come è stata accertata l’identità (documento esibito, data, altro)
            </span>
            <textarea
              name="nota"
              rows={2}
              defaultValue={verifica.nota ?? ''}
              className="w-full rounded-md border border-bordo bg-superficie p-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Bottone
              etichetta={decisa ? 'Aggiorna la decisione' : 'Registra la decisione'}
              inCorso="Registro…"
            />
            {decisa && (
              <p className="text-xs text-testo-tenue">
                Decisa il {formattaGiorno(new Date(verifica.decisaIl))}. Resta a verbale nel registro delle
                operazioni.
              </p>
            )}
          </div>

          {esito !== null && (
            <Avviso
              tono={esito.ok ? 'informativo' : 'critico'}
              titolo={esito.ok ? 'Decisione' : 'Non registrata'}
            >
              {esito.messaggio}
            </Avviso>
          )}
        </form>
      )}
    </Scheda>
  );
}

export function AdeguataVerifica({
  identificativo,
  persone,
  verifiche,
  costoCentesimi,
  dimostrativa,
}: {
  identificativo: string;
  persone: PersonaDaVerificare[];
  verifiche: VerificaDto[];
  costoCentesimi: number;
  dimostrativa: boolean;
}) {
  const [esito, azione] = useActionState(eseguiAdeguataVerificaAzione, null);
  const [aperto, setAperto] = useState(false);

  const costo = ((costoCentesimi * persone.length) / 100).toFixed(2).replace('.', ',');
  const senzaAnno = persone.filter((p) => p.annoNascita === undefined);

  return (
    <section id="adeguata-verifica" className="mt-8">
      <h2 className="mb-1 text-lg font-semibold">Adeguata verifica della clientela</h2>
      <p className="mb-3 text-sm leading-relaxed text-testo-tenue">
        Obbligo dell’intermediario (D.Lgs. 231/2007): prima di instaurare il rapporto vanno identificati il
        cliente e i suoi titolari effettivi, e verificati contro le liste di sanzioni e delle persone
        politicamente esposte. La ricerca è per nome e restituisce candidati: confermare o escludere
        l’identità spetta a chi ha davanti il documento.
      </p>

      {dimostrativa && (
        <Avviso tono="attenzione" titolo="Modalità dimostrativa">
          Nessuna lista viene interrogata e nessun riscontro compare. Un elenco vuoto qui significa «la
          fonte non è stata consultata», non «la persona è pulita».
        </Avviso>
      )}

      {persone.length === 0 ? (
        <Avviso tono="attenzione" titolo="Non si sa ancora chi verificare">
          I titolari effettivi si ricavano dai soci, e i rappresentanti legali dalle cariche. Con l’analisi
          approfondita compaiono qui, e la verifica diventa possibile.
        </Avviso>
      ) : (
        <Scheda>
          <p className="text-sm font-medium">
            Da verificare: {persone.length} {persone.length === 1 ? 'persona' : 'persone'}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-testo-tenue">
            {persone.map((p) => (
              <li key={p.nome}>
                · {p.nome} — {p.ruolo}
                {p.annoNascita === undefined ? '' : `, nato nel ${p.annoNascita}`}
              </li>
            ))}
          </ul>

          {senzaAnno.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-testo-debole">
              Di {senzaAnno.length === 1 ? 'una' : senzaAnno.length} non si conosce l’anno di nascita:
              senza, un omonimo in lista non si distingue dalla persona giusta, e il risultato resterà
              «possibile» invece di «forte» o «debole».
            </p>
          )}

          <form action={azione} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="identificativo" value={identificativo} />
            <input type="hidden" name="persone" value={JSON.stringify(persone)} />
            <Bottone
              etichetta={`Verifica ${persone.length === 1 ? 'la persona' : 'le persone'} — ${costo} €`}
              inCorso="Interrogo le liste…"
            />
            <span className="text-xs text-testo-tenue">
              {(costoCentesimi / 100).toFixed(2).replace('.', ',')} € a persona, addebitati alla conferma.
            </span>
          </form>

          {esito !== null && (
            <div className="mt-3">
              <Avviso
                tono={esito.ok ? 'informativo' : 'critico'}
                titolo={esito.ok ? 'Verifica eseguita' : 'Verifica non riuscita'}
              >
                {esito.messaggio}
              </Avviso>
            </div>
          )}
        </Scheda>
      )}

      {verifiche.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setAperto(!aperto)}
            className="text-sm font-medium text-accento"
          >
            {aperto ? 'Nascondi' : 'Mostra'} le {verifiche.length} verifiche già svolte
          </button>
          {aperto &&
            verifiche.map((v) => (
              <VerificaSvolta key={v.id} verifica={v} identificativo={identificativo} />
            ))}
        </div>
      )}
    </section>
  );
}
