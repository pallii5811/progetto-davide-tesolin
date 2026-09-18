'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { comunePerCodiceCatastale, etichettaComune } from '@aegis/core/comuni';

const CHIAVE = 'aegis:ultimo-elenco-prospect';

interface ElencoRicordato {
  readonly query: string;
  readonly quante: number;
}

/**
 * L'ultimo elenco comprato, ricordato sul dispositivo.
 *
 * Serve a una domanda sola, prima di spendere: «questo elenco l'ho già comprato?». È
 * successo, ed è costato venticinque centesimi per niente (vedi `ConfrontoConElencoComprato`).
 *
 * Fino al 17/09/2026 serviva anche a ritrovare l'elenco pagato — il richiamo «Hai già
 * scaricato un elenco… resta in archivio per ventiquattro ore» in testa alla pagina, e «Torna
 * all'elenco» sulla scheda. Da quella data le aziende di ogni elenco comprato vanno nel CRM e
 * ci restano per sempre («Questo deve andare nel CRM per sempre non per 24 ore. Togli
 * totalmente questo banner», AEGIS - cambi.pptx): il richiamo è tolto, e si ritrovano lì.
 *
 * Sul dispositivo e non sul server perché è una comodità di chi sta lavorando, non un dato
 * dello studio: il dato dello studio sono le aziende, e quelle stanno nel CRM.
 */
export function RicordaElenco({ query, quante }: { query: string; quante: number }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(CHIAVE, JSON.stringify({ query, quante }));
    } catch {
      // Spazio esaurito o archiviazione negata: è una comodità, non un requisito.
    }
  }, [query, quante]);

  return null;
}

/**
 * Legge l'elenco ricordato, o `null` se non ce n'è uno leggibile.
 *
 * In un posto solo: due copie di questa lettura divergerebbero, e il giorno in cui
 * cambiasse la forma del dato il confronto smetterebbe di ritrovare l'elenco senza che
 * nessuno se ne accorga.
 */
function useElencoRicordato(): ElencoRicordato | null {
  const [ultimo, setUltimo] = useState<ElencoRicordato | null>(null);

  useEffect(() => {
    try {
      const grezzo = window.localStorage.getItem(CHIAVE);
      if (grezzo === null) return;
      const letto: unknown = JSON.parse(grezzo);
      if (
        typeof letto !== 'object' ||
        letto === null ||
        typeof (letto as { query?: unknown }).query !== 'string' ||
        typeof (letto as { quante?: unknown }).quante !== 'number'
      ) {
        return;
      }
      const parametri = new URLSearchParams((letto as { query: string }).query);
      const comune = parametri.get('comune') ?? '';
      /*
        Un elenco di prima del 13/09/2026 si cercava per provincia, un parametro che la pagina
        non legge più: confrontarlo con i filtri di adesso direbbe «filtri quasi uguali» su due
        ricerche diverse. E una città che non è un comune non è un confronto possibile.
      */
      if (parametri.has('provincia')) return;
      if (comune !== '' && comunePerCodiceCatastale(comune) === null) return;
      setUltimo(letto as ElencoRicordato);
    } catch {
      // Contenuto illeggibile: si fa come se non ci fosse.
    }
  }, []);

  return ultimo;
}

/** Come si chiamano i filtri quando bisogna dirli a una persona: come le etichette del modulo. */
const ETICHETTE: Readonly<Record<string, string>> = {
  comune: 'città',
  denominazione: 'ragione sociale',
  ateco: 'codice ATECO',
  addettiMin: 'dipendenti min.',
  addettiMax: 'dipendenti max.',
  fatturatoMinEuro: 'fatturato min.',
  fatturatoMaxEuro: 'fatturato max.',
  socioCodiceFiscale: 'codice fiscale socio',
  formaGiuridicaCodice: 'forma giuridica',
  limite: 'numero di aziende',
};

/** La città si dice col nome e la sigla, non col codice catastale che viaggia nell'indirizzo. */
function valoreLeggibile(chiave: string, valore: string): string {
  if (chiave !== 'comune' || valore === '') return valore;
  const comune = comunePerCodiceCatastale(valore);
  return comune === null ? valore : etichettaComune(comune);
}

/**
 * Prima di spendere: hai già comprato questo elenco?
 *
 * È successo, ed è costato venticinque centesimi per niente. Un elenco comprato alle
 * 18:34 con «addetti a **250**», ricomprato alle 20:52 con «addetti a **200**»: stesse
 * cinque aziende in risposta, e la convinzione — legittima — di aver rifatto la stessa
 * identica ricerca. Per l'archivio erano due ricerche diverse, quindi ha richiamato il
 * fornitore, che fattura a record consegnato.
 *
 * Il prodotto aveva ragione e la persona pure: nessuno dei due poteva sapere dell'altro,
 * perché a schermo non c'era **niente** che dicesse quali filtri avevano prodotto
 * l'elenco già comprato. La differenza era una cifra su sette campi.
 *
 * Qui quella differenza si vede prima di premere, con accanto il fatto che conta: le aziende
 * di quell'elenco sono già nel CRM. Non si promette più che rifarlo sia gratuito: lo era solo
 * per le ventiquattro ore in cui la risposta resta in archivio.
 */
export function ConfrontoConElencoComprato({ criteri }: { criteri: Readonly<Record<string, string>> }) {
  const ultimo = useElencoRicordato();
  if (ultimo === null) return null;

  const precedenti = new URLSearchParams(ultimo.query);
  const differenze: { etichetta: string; prima: string; adesso: string }[] = [];

  for (const [chiave, etichetta] of Object.entries(ETICHETTE)) {
    const prima = (precedenti.get(chiave) ?? '').trim();
    const adesso = (criteri[chiave] ?? '').trim();
    if (prima !== adesso) {
      differenze.push({
        etichetta,
        prima: valoreLeggibile(chiave, prima),
        adesso: valoreLeggibile(chiave, adesso),
      });
    }
  }

  const crm = (
    <Link href="/portafoglio" className="text-marchio underline">
      Aprile nel CRM
    </Link>
  );
  const aziende = `${ultimo.quante} ${ultimo.quante === 1 ? 'azienda' : 'aziende'}`;

  if (differenze.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-rilevante/30 bg-rilevante-fondo p-3 text-sm">
        <strong>Questo elenco l&apos;hai già comprato.</strong>{' '}
        {ultimo.quante === 1 ? 'La sua azienda è' : `Le sue ${aziende} sono`} nel CRM: {crm}.{' '}
        <span className="text-testo-tenue">Creandolo di nuovo arrivano le aziende successive.</span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-bordo bg-superficie p-3 text-sm">
      <p>
        <strong>Hai già comprato un elenco di {aziende}</strong> con filtri quasi uguali, e{' '}
        {ultimo.quante === 1 ? 'la sua azienda è' : 'le sue aziende sono'} nel CRM: {crm}.
      </p>
      <ul className="mt-2 space-y-0.5 text-testo-tenue">
        {differenze.map((d) => (
          <li key={d.etichetta}>
            {d.etichetta}: <span className="tabular">{d.prima === '' ? '—' : d.prima}</span> →{' '}
            <span className="tabular font-medium text-testo">{d.adesso === '' ? '—' : d.adesso}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
