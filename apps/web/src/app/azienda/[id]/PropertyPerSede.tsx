'use client';

import { useId, useState } from 'react';
import type { ProtezioniDto } from '@/lib/api';
import { Cerchio, punteggioIt } from './Cerchio';

type Property = ProtezioniDto['property'];

/**
 * Il Property Risk di una sede alla volta: si sceglie l'indirizzo, e tre cerchi dicono il rischio
 * incendio, quello delle calamità naturali e il punteggio complessivo.
 *
 * È la slide di Luca che Simone ha portato il 18/09/2026: «Indirizzi» in alto, tre riquadri sotto.
 * Prima c'era una tabella per sede con voci, pesi, contributi e una frase per ogni voce: esatta,
 * e illeggibile per chi deve decidere una copertura. I numeri sono gli stessi del motore, sede per
 * sede; qui non si calcola niente.
 *
 * Il rischio incendio è il punteggio dell'attività: il foglio la definisce così, «intrinsic fire,
 * explosion and process hazard of the activity», ed è la stessa lancetta del popup. Il tipo di
 * edificio sta sotto, con il suo numero, perché anche lui entra nel Property.
 */
export function PropertyPerSede({ property }: { property: Property }) {
  const idSede = useId();
  const piuEsposta = Math.max(
    0,
    property.ubicazioni.findIndex((u) => u.etichetta === property.ubicazioneDiRiferimento),
  );
  const [indice, setIndice] = useState(piuEsposta);
  const sede = property.ubicazioni[indice] ?? property.ubicazioni[0];

  if (sede === undefined) {
    return (
      <p className="text-sm text-testo-tenue">
        {property.motivoNonCalcolabile ?? 'Nessuna ubicazione risulta dai dati disponibili.'}
      </p>
    );
  }

  const naturali = [
    { nome: 'Alluvione', valore: sede.punteggi.alluvione },
    { nome: 'Sisma', valore: sede.punteggi.terremoto },
    { nome: 'Frana', valore: sede.punteggi.frana },
  ];

  return (
    <div>
      {property.ubicazioni.length > 1 ? (
        <label
          htmlFor={idSede}
          className="block text-xs font-medium uppercase tracking-wide text-testo-debole"
        >
          Indirizzo
          <select
            id={idSede}
            value={indice}
            onChange={(evento) => setIndice(Number(evento.target.value))}
            className="mt-1.5 block w-full rounded-lg border border-bordo-forte bg-superficie px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-testo"
          >
            {property.ubicazioni.map((u, i) => (
              <option key={u.id} value={i}>
                {u.etichetta}
                {u.punteggio === null ? '' : ` · ${punteggioIt(u.punteggio)} su 7`}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-medium">{sede.etichetta}</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Riquadro titolo="Rischio incendio">
          <Cerchio valore={sede.punteggi.attivita} etichetta="Rischio incendio" grande />
          <dl className="mt-3 w-full space-y-1 text-sm">
            <Riga nome="Attività" valore={sede.punteggi.attivita} />
            <Riga nome="Tipo di edificio" valore={sede.punteggi.tipoDiSito} />
          </dl>
        </Riquadro>

        <Riquadro titolo="Calamità naturali">
          <Cerchio valore={sede.punteggi.pericoliNaturali} etichetta="Calamità naturali" grande />
          <dl className="mt-3 w-full space-y-1 text-sm">
            {naturali.map((n) => (
              <Riga key={n.nome} nome={n.nome} valore={n.valore} />
            ))}
          </dl>
        </Riquadro>

        <Riquadro titolo="Overall Risk Score" evidenziato>
          <Cerchio valore={sede.punteggio} etichetta="Overall Risk Score" grande />
          <p className="mt-3 text-center text-sm text-testo-tenue">Property Risk di questa sede</p>
        </Riquadro>
      </div>
    </div>
  );
}

function Riquadro({
  titolo,
  evidenziato = false,
  children,
}: {
  titolo: string;
  evidenziato?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border bg-superficie p-5 ${
        evidenziato ? 'border-marchio/50 ring-1 ring-marchio/20' : 'border-bordo'
      }`}
    >
      <h3 className="mb-3 text-sm font-semibold">{titolo}</h3>
      {children}
    </div>
  );
}

function Riga({ nome, valore }: { nome: string; valore: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-bordo pt-1 first:border-t-0 first:pt-0">
      <dt className="text-testo-tenue">{nome}</dt>
      <dd className="tabular font-semibold">{valore === null ? 'n.d.' : `${punteggioIt(valore)}/7`}</dd>
    </div>
  );
}
