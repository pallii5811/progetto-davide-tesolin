'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { RuoloUtente, UtenteElencoDto } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { creaUtenteAzione, gestisciUtenteAzione } from '../actions';

const RUOLI: { valore: RuoloUtente; etichetta: string; cosaPuoFare: string }[] = [
  {
    valore: 'amministratore',
    etichetta: 'Amministratore',
    cosaPuoFare: 'Tutto, compresa la gestione degli utenti dello studio.',
  },
  {
    valore: 'broker',
    etichetta: 'Broker',
    cosaPuoFare: 'Analizza aziende, compila dossier e gestisce le polizze.',
  },
  {
    valore: 'assistente',
    etichetta: 'Assistente',
    cosaPuoFare: 'Compila i dati raccolti in intervista, senza gestire gli utenti.',
  },
  {
    valore: 'sola-lettura',
    etichetta: 'Sola lettura',
    cosaPuoFare: 'Consulta le analisi esistenti senza poterle modificare.',
  },
];

const CAMPO =
  'w-full rounded border border-bordo-forte bg-fondo px-3 py-2 text-sm outline-none transition focus:border-marchio focus:ring-2 focus:ring-marchio/25';
const ETICHETTA = 'mb-1 block text-xs font-medium uppercase tracking-wide text-testo-debole';

export function GestioneUtenti({ utenti }: { utenti: UtenteElencoDto[] }) {
  const attivi = utenti.filter((u) => u.attivo).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-bordo pb-2">
          <h2 className="text-lg font-semibold tracking-tight">Utenti dello studio</h2>
          <p className="text-xs text-testo-debole">
            {attivi} attiv{attivi === 1 ? 'o' : 'i'} su {utenti.length}
          </p>
        </div>

        <ul className="space-y-2">
          {utenti.map((utente) => (
            <RigaUtente key={utente.id} utente={utente} />
          ))}
        </ul>
      </section>

      <ModuloNuovoUtente />
    </div>
  );
}

// ── Riga ─────────────────────────────────────────────────────────────────────

function RigaUtente({ utente }: { utente: UtenteElencoDto }) {
  const [esito, agisci] = useActionState(gestisciUtenteAzione, null);
  const [ruolo, setRuolo] = useState<RuoloUtente>(utente.ruolo);

  const ruoloCambiato = ruolo !== utente.ruolo;

  return (
    <li
      className={`rounded-lg border p-4 ${
        utente.attivo ? 'border-bordo bg-superficie' : 'border-bordo bg-fondo opacity-75'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {utente.nome}
            {utente.seStesso && (
              <span className="rounded border border-marchio/30 bg-marchio-tenue px-1.5 py-0.5 text-xs font-normal text-marchio">
                sei tu
              </span>
            )}
            {!utente.attivo && (
              <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-normal text-critico">
                sospeso
              </span>
            )}
            {utente.bloccato && (
              <span className="rounded border border-rilevante/30 bg-rilevante-fondo px-1.5 py-0.5 text-xs font-normal text-rilevante">
                bloccato per tentativi falliti
              </span>
            )}
          </p>
          <p className="truncate text-sm text-testo-tenue">{utente.email}</p>
          {/* `suppressHydrationWarning`: il fuso orario del server di Next e quello del
              browser possono differire, e il tempo trascorso cambia fra le due esecuzioni.
              Il valore autorevole resta nell'attributo `dateTime`, in formato ISO. */}
          <p className="mt-1 text-xs text-testo-debole" suppressHydrationWarning>
            Ultimo accesso:{' '}
            {utente.ultimoAccesso === null ? (
              'mai'
            ) : (
              <time dateTime={utente.ultimoAccesso}>{formattaQuando(utente.ultimoAccesso)}</time>
            )}{' '}
            · nello studio dal <time dateTime={utente.creatoIl}>{formattaData(utente.creatoIl)}</time>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {/* Cambiare ruolo a sé stessi è rifiutato dall'API: qui il comando non compare
              nemmeno, per non proporre un'azione che finirebbe in un errore. */}
          <form action={agisci} className="flex items-end gap-2">
            <input type="hidden" name="id" value={utente.id} />
            <input type="hidden" name="operazione" value="modifica" />
            <div>
              <label htmlFor={`ruolo-${utente.id}`} className={ETICHETTA}>
                Ruolo
              </label>
              <select
                id={`ruolo-${utente.id}`}
                name="ruolo"
                value={ruolo}
                disabled={utente.seStesso}
                onChange={(e) => setRuolo(e.target.value as RuoloUtente)}
                className={`${CAMPO} w-44 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {RUOLI.map((r) => (
                  <option key={r.valore} value={r.valore}>
                    {r.etichetta}
                  </option>
                ))}
              </select>
            </div>
            {ruoloCambiato && <Azione etichetta="Applica" inCorso="Applico…" primaria />}
          </form>

          {!utente.seStesso && (
            <>
              <form action={agisci}>
                <input type="hidden" name="id" value={utente.id} />
                <input type="hidden" name="operazione" value="modifica" />
                <input type="hidden" name="attivo" value={utente.attivo ? 'false' : 'true'} />
                <Azione
                  etichetta={utente.attivo ? 'Sospendi' : 'Riattiva'}
                  inCorso="…"
                  pericolosa={utente.attivo}
                />
              </form>

              {utente.attivo && (
                <form action={agisci}>
                  <input type="hidden" name="id" value={utente.id} />
                  <input type="hidden" name="operazione" value="revoca" />
                  <Azione etichetta="Chiudi sessioni" inCorso="…" />
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <div aria-live="polite">
        {esito !== null && (
          <p className={`mt-2 text-sm ${esito.ok ? 'text-basso' : 'text-critico'}`}>{esito.messaggio}</p>
        )}
      </div>
    </li>
  );
}

function Azione({
  etichetta,
  inCorso,
  primaria = false,
  pericolosa = false,
}: {
  etichetta: string;
  inCorso: string;
  primaria?: boolean;
  pericolosa?: boolean;
}) {
  const { pending } = useFormStatus();
  const classi = primaria
    ? 'bg-azione text-azione-testo hover:opacity-90'
    : pericolosa
      ? 'border border-critico/40 text-critico hover:bg-critico-fondo'
      : 'border border-bordo-forte text-testo-tenue hover:text-testo';

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded px-3 py-2 text-sm font-medium transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40 ${classi}`}
    >
      {pending ? inCorso : etichetta}
    </button>
  );
}

// ── Nuovo utente ─────────────────────────────────────────────────────────────

function ModuloNuovoUtente() {
  const [esito, invia] = useActionState(creaUtenteAzione, null);
  const [ruolo, setRuolo] = useState<RuoloUtente>('broker');
  const descrizione = RUOLI.find((r) => r.valore === ruolo)?.cosaPuoFare ?? '';

  return (
    <section>
      <div className="mb-4 border-b border-bordo pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Aggiungi un collaboratore</h2>
        <p className="mt-0.5 text-sm text-testo-tenue">
          Il sistema genera una password iniziale e la mostra una volta sola: consegnala a voce e falla
          cambiare al primo accesso.
        </p>
      </div>

      {esito?.passwordIniziale !== undefined && (
        <div className="mb-4">
          <Avviso tono="attenzione" titolo="Password iniziale — visibile una sola volta">
            <p>{esito.messaggio}</p>
            <p className="tabular mt-2 select-all rounded border border-bordo-forte bg-fondo px-3 py-2 font-mono text-base">
              {esito.passwordIniziale}
            </p>
            <p className="mt-2 text-xs text-testo-tenue">
              Non è salvata da nessuna parte e non verrà inviata per posta. Se si perde, va rigenerata.
            </p>
          </Avviso>
        </div>
      )}

      <Scheda>
        <form action={invia} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nome" className={ETICHETTA}>
              Nome e cognome
            </label>
            <input id="nome" name="nome" type="text" required autoComplete="off" className={CAMPO} />
          </div>

          <div>
            <label htmlFor="email" className={ETICHETTA}>
              Indirizzo di posta
            </label>
            <input id="email" name="email" type="email" required autoComplete="off" className={CAMPO} />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="nuovo-ruolo" className={ETICHETTA}>
              Ruolo
            </label>
            <select
              id="nuovo-ruolo"
              name="ruolo"
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value as RuoloUtente)}
              aria-describedby="cosa-puo-fare"
              className={`${CAMPO} sm:w-64`}
            >
              {RUOLI.map((r) => (
                <option key={r.valore} value={r.valore}>
                  {r.etichetta}
                </option>
              ))}
            </select>
            {/* Il ruolo si sceglie meglio se si legge cosa comporta, non il suo nome. */}
            <p id="cosa-puo-fare" className="mt-1 text-xs text-testo-tenue">
              {descrizione}
            </p>
          </div>

          <div aria-live="polite" className="sm:col-span-2">
            {esito !== null && !esito.ok && <p className="text-sm text-critico">{esito.messaggio}</p>}
          </div>

          <div className="sm:col-span-2">
            <Azione etichetta="Crea utente" inCorso="Creazione…" primaria />
          </div>
        </form>
      </Scheda>
    </section>
  );
}

// ── Formattazione ────────────────────────────────────────────────────────────

function formattaData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** «mai» è un'informazione: distingue chi non ha ancora attivato l'utenza da chi è inattivo. */
function formattaQuando(iso: string | null): string {
  if (iso === null) return 'mai';

  const quando = new Date(iso);
  const minuti = Math.round((Date.now() - quando.getTime()) / 60_000);

  if (minuti < 2) return 'adesso';
  if (minuti < 60) return `${minuti} minuti fa`;
  if (minuti < 24 * 60) return `${Math.round(minuti / 60)} ore fa`;
  if (minuti < 48 * 60) return 'ieri';
  return quando.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
