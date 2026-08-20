/**
 * Il titolare effettivo, e la decisione se comprarlo.
 *
 * L'obbligo è dell'art. 20 del D.Lgs. 231/2007. OpenAPI vende una visura apposta a
 * **1,10 €**, ma l'anagrafica estesa che ogni analisi acquista già a **0,10 €** contiene i
 * soci con nome, cognome e quota: quando sono persone fisiche, il titolare effettivo è già
 * lì.
 *
 * Questo riquadro esiste per una ragione sola: **dire quando non serve spendere**. Un
 * elenco di titolari senza quella riga lascia l'intermediario nel dubbio, e nel dubbio si
 * compra — undici volte il prezzo, per un nome che si aveva già.
 */

import type { AnalisiDto } from '@/lib/api';
import { Scheda } from '@/components/ui';

type Titolare = AnalisiDto['titolareEffettivo'];

const ETICHETTA_CRITERIO: Record<Titolare['titolari'][number]['criterio'], string> = {
  partecipazione: 'partecipazione oltre il 25%',
  controllo: 'controllo di fatto',
  'residuale-amministratore': 'criterio residuale — poteri di amministrazione',
  'non-determinato': 'non determinato',
};

export function TitolareEffettivo({ dati }: { dati: Titolare }) {
  return (
    <Scheda>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Titolare effettivo</h3>
        <span className="text-xs text-testo-debole">art. 20 D.Lgs. 231/2007</span>
      </div>

      {dati.titolari.length === 0 ? (
        <p className="text-sm text-testo-tenue">Non determinabile dai dati acquistati.</p>
      ) : (
        <ul className="space-y-2">
          {dati.titolari.map((t) => (
            <li
              key={`${t.nominativo}-${t.codiceFiscale ?? ''}`}
              className="border-b border-bordo pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{t.nominativo}</span>
                {t.quotaPercentuale !== null && (
                  <span className="tabular text-sm text-testo-tenue">{t.quotaPercentuale}%</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-testo-tenue">
                {ETICHETTA_CRITERIO[t.criterio]}
                {t.codiceFiscale !== null && ` · CF ${t.codiceFiscale}`}
              </p>
              {/*
                La motivazione per esteso non è un vezzo: un titolare effettivo indicato
                senza il criterio con cui è stato individuato non si difende davanti a
                un'ispezione, ed è proprio il documento che serve a difendersi.
              */}
              <p className="mt-1 text-xs leading-relaxed text-testo-debole">{t.motivazione}</p>
            </li>
          ))}
        </ul>
      )}

      {dati.daRisalire.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="text-testo-tenue">Catena da risalire: </span>
          {dati.daRisalire.map((s) => s.denominazione).join(' · ')}
        </p>
      )}

      {/*
        L'azione, evidenziata: è il campo che fa risparmiare o che evita un obbligo mancato.
        Il tono cambia con la sostanza — verde quando non c'è nulla da comprare, attenzione
        quando la visura serve davvero.
      */}
      <p
        className={`mt-3 rounded border-l-2 py-1.5 pl-3 text-sm leading-relaxed ${
          dati.catenaChiusa
            ? 'border-basso bg-basso/5 text-testo'
            : 'border-attenzione bg-attenzione/5 text-testo'
        }`}
      >
        {dati.azione}
      </p>

      {dati.note.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-testo-debole">
          {dati.note.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Scheda>
  );
}
