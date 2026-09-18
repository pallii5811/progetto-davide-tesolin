'use client';

import { useActionState } from 'react';
import { CampoAccesso } from '@/components/accesso';
import { BottoneAccesso } from '@/components/BottoneAccesso';
import type { CampoRegistrazione, EsitoRegistrazione } from './actions';

export function ModuloRegistrazione({
  azione,
}: {
  azione: (precedente: EsitoRegistrazione | null, modulo: FormData) => Promise<EsitoRegistrazione>;
}) {
  const [esito, invia] = useActionState(azione, null);
  const errore = (campo: CampoRegistrazione): string | undefined =>
    esito !== null && esito.campo === campo ? esito.messaggio : undefined;

  return (
    <form action={invia} className="space-y-4">
      <CampoAccesso
        id="nome"
        etichetta="Nome e cognome"
        autoComplete="name"
        valore={esito?.valori.nome}
        errore={errore('nome')}
        massimo={120}
      />
      <CampoAccesso
        id="email"
        etichetta="Email di lavoro"
        tipo="email"
        autoComplete="email"
        valore={esito?.valori.email}
        errore={errore('email')}
        aiuto="Ti mandiamo un collegamento per confermarla."
        massimo={200}
      />
      <CampoAccesso
        id="password"
        etichetta="Password"
        tipo="password"
        autoComplete="new-password"
        errore={errore('password')}
        aiuto="Almeno 12 caratteri, senza parole ovvie come «password», «broker», «assicurazioni» o «aegis». Una frase che ricordi va benissimo."
        minimo={12}
        massimo={200}
      />
      <CampoAccesso
        id="ripetiPassword"
        etichetta="Ripeti la password"
        tipo="password"
        autoComplete="new-password"
        minimo={12}
        massimo={200}
      />

      <div className="border-t border-bordo pt-4">
        <CampoAccesso
          id="denominazione"
          etichetta="Nome dello studio"
          autoComplete="organization"
          valore={esito?.valori.denominazione}
          errore={errore('denominazione')}
          massimo={200}
        />
      </div>
      <CampoAccesso
        id="numeroRui"
        etichetta="Numero di iscrizione al RUI"
        autoComplete="off"
        valore={esito?.valori.numeroRui}
        errore={errore('numeroRui')}
        aiuto="Una lettera e nove cifre, come B000123456: lo trovi nel registro IVASS."
        maiuscolo
        massimo={20}
      />

      {/* Gli errori che non riguardano un campo: servizio, troppe richieste. */}
      <div aria-live="polite" className="min-h-5">
        {esito !== null && esito.campo === null && (
          <p className="text-sm text-critico">{esito.messaggio}</p>
        )}
      </div>

      <BottoneAccesso testo="Crea l’account" attesa="Creazione in corso…" />

      <p className="text-xs leading-relaxed text-testo-debole">
        Entri subito e puoi esplorare tutto. Gli acquisti di dati — elenchi e analisi — si attivano appena
        lo studio viene attivato dalla piattaforma.
      </p>
    </form>
  );
}
